#!/usr/bin/env node
// FRAME DRIVER (20.01): runs FRAME in headless Chrome so a script or an agent can build a
// deck through window.FRAME_API, and FRAME's own renderer draws every page and the PDF.
// No dependencies: Node's http + its built-in WebSocket speak the DevTools protocol.
//
//   node tools/frame-driver.js start [--project file.json] [--port 8790]
//   node tools/frame-driver.js call <fn> ['<json args array>']     e.g. call listPages
//   node tools/frame-driver.js render <pageKey|all> <out.png|outDir>
//   node tools/frame-driver.js pdf <out.pdf>
//   node tools/frame-driver.js save <out.json>
//   node tools/frame-driver.js sheet <imageDir> <outPrefix> [--per 30]   contact sheets of a folder
//   node tools/frame-driver.js eval '<js>'                         anything else, in the page
//   node tools/frame-driver.js stop
//
// An argument {"$file": "/abs/path.jpg"} becomes that file (a File named after it, so the
// image code is its name less the extension). Output is JSON on stdout; a failure is
// {"error": ...} and exit code 1.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
// FRAME_DRIVER_STATE: a second driver (a test) beside a running one, with its own --port.
const STATE = process.env.FRAME_DRIVER_STATE || path.join(os.tmpdir(), 'frame-driver.json');
const CHROME = process.env.CHROME_PATH || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
function out(o) { process.stdout.write(JSON.stringify(o, null, 2) + '\n'); if (o && o.error) process.exitCode = 1; }
function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return null; } }

// ── The server half (runs detached after `start`) ──────────────────────────────
// One static server for the app AND the files an agent hands in (/__file?p=<abs path>),
// bound to 127.0.0.1 only; one control server taking {fn, args} / {js}.
async function serve() {
    const ctlPort = parseInt(arg('port', '8790'), 10);
    const statics = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        let p = u.pathname === '/__file' ? u.searchParams.get('p') : path.join(REPO, decodeURIComponent(u.pathname));
        if (u.pathname === '/') p = path.join(REPO, 'index.html');
        if (u.pathname !== '/__file' && !path.resolve(p).startsWith(REPO)) { res.writeHead(403); return res.end(); }
        fs.readFile(p, (err, data) => {
            if (err) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(data);
        });
    });
    await new Promise(r => statics.listen(0, '127.0.0.1', r));
    const staticPort = statics.address().port;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-chrome-'));
    if (!CHROME) throw new Error('Chrome not found; set CHROME_PATH');
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
        '--user-data-dir=' + profile, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
    // Chrome writes its debugging port into the profile once it is listening.
    let devPort = null;
    for (let i = 0; i < 200 && !devPort; i++) {
        try { devPort = parseInt(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10); } catch (e) {}
        if (!devPort) await new Promise(r => setTimeout(r, 100));
    }
    if (!devPort) throw new Error('Chrome did not start');
    const targets = await (await fetch('http://127.0.0.1:' + devPort + '/json')).json();
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let seq = 0; const waiting = {};
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; } };
    const cdp = (method, params) => new Promise((res) => { const id = ++seq; waiting[id] = res; ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const evaluate = async (expr) => {
        const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.error) return { error: r.error.message };
        if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text };
        return r.result && r.result.result ? r.result.result.value : undefined;
    };
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: 'http://127.0.0.1:' + staticPort + '/index.html?nosw' });
    // Ready = the API is there and the start screen can be closed.
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) {
        ready = await evaluate('!!(window.FRAME_API && typeof _startScreenClose === "function")') === true;
        if (!ready) await new Promise(r => setTimeout(r, 100));
    }
    if (!ready) throw new Error('FRAME did not load');
    // Nobody is watching: no autosave warning modal, no start screen, no first-run tip.
    await evaluate('(function(){ try { _autosaveToldUser = true; } catch (e) {} try { _startScreenClose(); } catch (e) {} try { localStorage.setItem("frameTourDone", "1"); } catch (e) {} return true; })()');
    await evaluate(DRV_PAGE);
    const project = arg('project');
    if (project) {
        const r = await evaluate('__drv.load(' + JSON.stringify('http://127.0.0.1:' + staticPort + '/__file?p=' + encodeURIComponent(path.resolve(project))) + ')');
        if (r && r.error) throw new Error('project: ' + r.error);
    }
    const fileUrl = (p) => 'http://127.0.0.1:' + staticPort + '/__file?p=' + encodeURIComponent(path.resolve(p));
    // Only one command at a time: FRAME is one page with one undo stack.
    let chain = Promise.resolve();
    const ctl = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            chain = chain.then(async () => {
                let reply;
                try {
                    const q = JSON.parse(body || '{}');
                    if (q.stop) { reply = { stopped: true }; setTimeout(() => { try { chrome.kill(); } catch (e) {} try { fs.unlinkSync(STATE); } catch (e) {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(0); }, 50); }
                    else if (q.js != null) reply = await evaluate(q.js);
                    else {
                        const args = JSON.stringify(q.args || [], (k, v) => (v && typeof v === 'object' && typeof v.$file === 'string') ? { $file: fileUrl(v.$file), name: v.name || path.basename(v.$file) } : v);
                        reply = await evaluate('__drv.call(' + JSON.stringify(q.fn) + ',' + args + ')');
                    }
                } catch (e) { reply = { error: String(e && e.message || e) }; }
                const s = JSON.stringify(reply === undefined ? null : reply);
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(s);
            });
        });
    });
    await new Promise((r, j) => { ctl.on('error', j); ctl.listen(ctlPort, '127.0.0.1', r); });
    fs.writeFileSync(STATE, JSON.stringify({ pid: process.pid, port: ctlPort, chrome: chrome.pid, app: 'http://127.0.0.1:' + staticPort }));
    chrome.on('exit', () => { try { fs.unlinkSync(STATE); } catch (e) {} process.exit(0); });
}
// Evaluated once in the page: resolves {$file} into Files and keeps big results out of JSON.
const DRV_PAGE = `window.__drv = {
    // Loaded as a PICTURE, not fetched: Chrome refuses to fetch the 50 MB+ originals a print
    // folder holds, while its image loader takes them. Handed on at most MAX px on the long
    // edge (a deck page never needs more; FRAME shrinks again to its own sizes). A PNG stays
    // a PNG, so a cut-out object keeps its transparency.
    MAX: 3000,
    async file(v) {
        const im = await new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = () => rej(new Error('could not load ' + v.name)); m.src = v.$file; });
        const k = Math.min(1, this.MAX / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const png = /\.png$/i.test(v.name), type = png ? 'image/png' : 'image/jpeg';
        const b = await new Promise(res => c.toBlob(res, type, png ? undefined : 0.92));
        return new File([b], v.name, { type: type });
    },
    async resolve(v) {
        if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await this.resolve(x)); return o; }
        if (v && typeof v === 'object') { if (typeof v.$file === 'string') return this.file(v); const o = {}; for (const k of Object.keys(v)) o[k] = await this.resolve(v[k]); return o; }
        return v;
    },
    async call(fn, args) {
        if (!window.FRAME_API || typeof FRAME_API[fn] !== 'function') return { error: 'no FRAME_API.' + fn + ' (have: ' + Object.keys(FRAME_API).filter(k => typeof FRAME_API[k] === 'function').join(', ') + ')' };
        try {
            const r = await FRAME_API[fn].apply(FRAME_API, await this.resolve(args || []));
            if (r && r.blob instanceof Blob) { const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(r.blob); }); const o = Object.assign({}, r); delete o.blob; o.base64 = b64; return o; }
            return r === undefined ? null : r;
        } catch (e) { return { error: String((e && e.stack) || e) }; }
    },
    async load(url) { const t = await (await fetch(url)).text(); return FRAME_API.loadProject(t); },
    // A contact sheet: images in a grid with their file names, as a PNG data URL.
    async sheet(urls, names, cols) {
        const cw = 240, ch = 240, lab = 34, pad = 10;
        const rows = Math.ceil(urls.length / cols);
        const c = document.createElement('canvas'); c.width = cols * (cw + pad) + pad; c.height = rows * (ch + lab + pad) + pad;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < urls.length; i++) {
            const gx = pad + (i % cols) * (cw + pad), gy = pad + Math.floor(i / cols) * (ch + lab + pad);
            try {
                const im = await new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = rej; m.src = urls[i]; });
                const k = Math.min(cw / im.naturalWidth, ch / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
                x.drawImage(im, gx + (cw - w) / 2, gy + (ch - h) / 2, w, h);
            } catch (e) { x.fillStyle = '#eee'; x.fillRect(gx, gy, cw, ch); }
            x.fillStyle = '#000'; x.font = '13px Arial'; x.textBaseline = 'top';
            const n = names[i]; x.fillText(n.length > 32 ? n.slice(0, 31) + '…' : n, gx, gy + ch + 4);
            x.fillStyle = '#777'; x.fillText(String(i + 1), gx, gy + ch + 19);
        }
        return c.toDataURL('image/jpeg', 0.82);
    }
};
true`;

// ── The client half ────────────────────────────────────────────────────────────
function post(q) {
    const st = readState();
    if (!st) return Promise.resolve({ error: 'no driver running: node tools/frame-driver.js start' });
    return new Promise((resolve) => {
        const data = JSON.stringify(q);
        const req = http.request({ host: '127.0.0.1', port: st.port, method: 'POST', path: '/', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
            let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ error: 'bad reply: ' + b.slice(0, 200) }); } });
        });
        req.on('error', e => resolve({ error: String(e.message) }));
        req.end(data);
    });
}
function writeDataUrl(dataUrl, file) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
}
async function main() {
    const cmd = process.argv[2];
    if (cmd === 'serve') return serve().catch(e => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
    if (cmd === 'start') {
        if (readState()) { const r = await post({ js: '1' }); if (!r || !r.error) return out({ running: true, note: 'already running; stop first to start fresh' }); try { fs.unlinkSync(STATE); } catch (e) {} }
        const a = [__filename, 'serve'].concat(process.argv.slice(3));
        const child = spawn(process.execPath, a, { detached: true, stdio: ['ignore', 'ignore', fs.openSync(STATE.replace(/\.json$/, '') + '.log', 'w')] });
        child.unref();
        for (let i = 0; i < 600; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (readState()) { const r = await post({ fn: 'app', args: [] }); return out(Object.assign({ started: true }, r)); }
            try { process.kill(child.pid, 0); } catch (e) { break; }
        }
        let log = ''; try { log = fs.readFileSync(STATE.replace(/\.json$/, '') + '.log', 'utf8'); } catch (e) {}
        return out({ error: 'driver did not start', log: log.slice(-1500) });
    }
    if (cmd === 'stop') return out(await post({ stop: true }));
    if (cmd === 'eval') return out(await post({ js: process.argv[3] || '' }));
    if (cmd === 'call') {
        let args = [];
        if (process.argv[4]) { try { args = JSON.parse(process.argv[4]); } catch (e) { return out({ error: 'args must be a JSON array: ' + e.message }); } }
        if (!Array.isArray(args)) args = [args];
        return out(await post({ fn: process.argv[3], args }));
    }
    if (cmd === 'render') {
        const which = process.argv[3], dest = process.argv[4];
        if (!which || !dest) return out({ error: 'render <pageKey|all> <out.png|outDir>' });
        const keys = which === 'all' ? ((await post({ fn: 'listPages', args: [] })) || []).map(p => p.key) : [which];
        const done = [];
        for (let i = 0; i < keys.length; i++) {
            const r = await post({ fn: 'renderPage', args: [keys[i], { scale: parseFloat(arg('scale', '1.5')) }] });
            if (!r || r.error || !r.png) { done.push({ key: keys[i], error: (r && r.error) || 'no picture' }); continue; }
            const file = which === 'all' ? path.join(dest, String(i + 1).padStart(2, '0') + '_' + keys[i].replace(/[^A-Za-z0-9._-]+/g, '_') + '.png') : dest;
            writeDataUrl(r.png, file);
            done.push({ key: keys[i], file: path.resolve(file), complete: r.complete });
        }
        return out(which === 'all' ? done : done[0]);
    }
    if (cmd === 'pdf') {
        const dest = process.argv[3]; if (!dest) return out({ error: 'pdf <out.pdf>' });
        const r = await post({ fn: 'exportPDF', args: [] });
        if (!r || r.error) return out(r || { error: 'no reply' });
        fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(r.base64, 'base64'));
        delete r.base64; return out(Object.assign(r, { file: path.resolve(dest) }));
    }
    if (cmd === 'save') {
        const dest = process.argv[3]; if (!dest) return out({ error: 'save <out.json>' });
        const r = await post({ fn: 'saveProject', args: [] });
        if (typeof r !== 'string') return out(r || { error: 'no reply' });
        fs.writeFileSync(dest, r); return out({ file: path.resolve(dest), bytes: Buffer.byteLength(r) });
    }
    if (cmd === 'sheet') {
        const dir = process.argv[3], prefix = process.argv[4];
        if (!dir || !prefix) return out({ error: 'sheet <imageDir> <outPrefix> [--per 30]' });
        const per = parseInt(arg('per', '30'), 10), cols = parseInt(arg('cols', '6'), 10);
        const files = fs.readdirSync(dir).filter(f => IMG_EXT.test(f)).sort();
        const st = readState(); if (!st) return out({ error: 'no driver running' });
        const made = [];
        for (let i = 0; i < files.length; i += per) {
            const chunk = files.slice(i, i + per);
            const urls = chunk.map(f => st.app + '/__file?p=' + encodeURIComponent(path.resolve(dir, f)));
            const r = await post({ js: '__drv.sheet(' + JSON.stringify(urls) + ',' + JSON.stringify(chunk) + ',' + cols + ')' });
            if (!r || typeof r !== 'string') return out({ error: (r && r.error) || 'sheet failed' });
            const file = prefix + '_' + String(made.length + 1).padStart(2, '0') + '.jpg';
            writeDataUrl(r, file);
            made.push({ file: path.resolve(file), first: i + 1, images: chunk });
        }
        return out({ images: files.length, sheets: made });
    }
    out({ error: 'commands: start, call, render, pdf, save, sheet, eval, stop (see the top of tools/frame-driver.js)' });
}
main();
