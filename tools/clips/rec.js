// Clip recorder: films the FRAME driver's headless Chrome page through a second DevTools
// connection. A drawn cursor and a caption bar are added to the page (export-skipped, pointer
// events off); input is real (Input.dispatchMouseEvent), so the app does what it does for a user.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const STATE = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'frame-driver.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect(filter) {
  const prof = fs.readdirSync(os.tmpdir()).filter(d => d.startsWith('frame-chrome-')).map(d => path.join(os.tmpdir(), d))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const port = parseInt(fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10);
  const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const t = list.find(filter || (x => x.type === 'page' && x.url.indexOf(STATE.app) === 0)) || list.find(x => x.type === 'page');
  return { port, sock: await sockTo(t.webSocketDebuggerUrl) };
}
async function sockTo(url) {
  const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const wait = {}; const on = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } else if (d.method && on[d.method]) on[d.method](d.params); };
  const cdp = (method, params) => new Promise(r => { const id = ++seq; wait[id] = r; ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('page: ' + ((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text));
    return r.result && r.result.result ? r.result.result.value : undefined; };
  return { ws, cdp, ev, on };
}
const OVERLAY = `(() => {
  if (document.getElementById('__clipCursor')) return;
  const st = document.createElement('style'); st.textContent = '#__clipCursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}#__clipRing{position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #4f8cff;opacity:0;transform:scale(.4);transition:transform .35s ease-out,opacity .35s ease-out}#__clipCap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483645;pointer-events:none;background:rgba(17,18,22,.92);color:#fff;font:600 17px/1.35 -apple-system,Helvetica,Arial,sans-serif;padding:11px 20px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.35);max-width:80vw;text-align:center;transition:opacity .25s}#__clipCap b{color:#8fb4ff}#__clipCap .n{display:inline-block;background:#4f8cff;color:#fff;border-radius:50%;width:24px;height:24px;line-height:24px;font-size:14px;margin-right:9px;text-align:center}';
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = '__clipCursor';
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 11-6.6 1.3L16 21.5l-3 1.3-3.6-7.3L4 20z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id = '__clipRing';
  const cap = document.createElement('div'); cap.id = '__clipCap'; cap.style.opacity = '0';
  [c, r, cap].forEach(e => { e.setAttribute('data-export-skip', ''); document.body.appendChild(e); });
  window.__clipMove = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px'; };
  window.__clipRing = (x, y) => { r.style.transition = 'none'; r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = '1'; r.style.transform = 'scale(.4)'; void r.offsetWidth; r.style.transition = ''; r.style.opacity = '0'; r.style.transform = 'scale(1.5)'; };
  window.__clipCap = (h) => { cap.innerHTML = h || ''; cap.style.opacity = h ? '1' : '0'; };
})()`;
class Clip {
  constructor(s) { this.s = s; this.x = 720; this.y = 450; this.frames = []; this.t0 = 0; this.cam = []; this.caps = []; this.callouts = []; this.chapters = []; this.splits = []; this.side = []; this.siding = false; this.off = 0; this.paused = false; }
  // the clip's clock: wall time less every paused stretch, so a cut leaves no gap
  now() { return Date.now() - this.off; }
  // CUTS: pause, set the next scene up off camera, resume. Frames sent while paused are dropped.
  pause() { this.paused = true; this.pausedAt = Date.now(); }
  resume() { if (this.paused) { this.off += Date.now() - this.pausedAt; this.paused = false; } }
  // a full-screen chapter card for `ms` (fades in and out over what is underneath)
  async chapter(title, sub, ms) { this.chapters.push({ t: this.now(), dur: ms || 1600, title: title, sub: sub || '' }); await sleep(ms || 1600); }
  // camera: ease to show the screen box (x, y, w; h follows the video's shape) over `ms`
  zoom(x, y, w, ms) { const h = w * this.H / this.W; this.cam.push({ t: this.now(), dur: ms || 900, x: Math.max(0, Math.min(this.W - w, x)), y: Math.max(0, Math.min(this.H - h, y)), w: w, h: h }); return sleep(ms || 900); }
  full(ms) { return this.zoom(0, 0, this.W, ms); }
  // split screen: two live areas of the page side by side (CSS px rects), labelled, until unsplit()
  split(a, b, la, lb, ms) { this.splits.push({ t: this.now(), a: a, b: b, la: la || '', lb: lb || '', end: 1e12 }); return sleep(ms || 500); }
  // A SECOND TAKE for the split's right pane: filmed while the clip is paused, played beside the
  // main take in step (its frame at sideT0 + time since the split began). Both are the real app.
  async sideStart() { this.side = []; this.siding = true; this.sideT0 = Date.now(); }
  sideStop() { this.siding = false; }
  // the split whose right pane is the side take
  splitSide(a, b, la, lb, ms) { this.splits.push({ t: this.now(), a: a, b: b, la: la || '', lb: lb || '', end: 1e12, side: true }); return sleep(ms || 500); }
  unsplit(ms) { const k = this.splits[this.splits.length - 1]; if (k && k.end > 1e11) k.end = this.now(); return sleep(ms || 400); }
  async overlay() { await this.s.ev(OVERLAY); await this.s.ev(`__clipMove(${this.x},${this.y})`); }
  async start() {
    this.frames = [];
    this.s.on['Page.screencastFrame'] = (p) => { if (this.siding) this.side.push({ data: p.data, t: p.metadata.timestamp * 1000 }); if (!this.paused) this.frames.push({ data: p.data, t: p.metadata.timestamp * 1000 - this.off }); this.s.cdp('Page.screencastFrameAck', { sessionId: p.sessionId }); };
    this.off = 0; this.paused = false; this.cam = [{ t: this.now(), dur: 0, x: 0, y: 0, w: this.W, h: this.H }]; this.caps = []; this.callouts = []; this.chapters = [];
    await this.s.cdp('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: this.W * this.dsf, maxHeight: this.H * this.dsf, everyNthFrame: 1 });
    await sleep(400);
  }
  async stop() { await sleep(700); this.tEnd = this.now(); await this.s.cdp('Page.stopScreencast'); }
  // where an element is: its centre, or a point inside it (fx, fy in 0..1)
  async at(sel, fx, fy) {
    const r = await this.s.ev(`(() => { const e = ${sel.startsWith('(') || sel.startsWith('document') ? sel : 'document.querySelector(' + JSON.stringify(sel) + ')'}; if (!e) return null; if (e.scrollIntoViewIfNeeded) e.scrollIntoViewIfNeeded(); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    if (!r) throw new Error('not found: ' + sel);
    return { x: r.x + r.w * (fx == null ? 0.5 : fx), y: r.y + r.h * (fy == null ? 0.5 : fy), box: r };
  }
  async move(x, y, ms, btn) {
    const n = Math.max(6, Math.round((ms || 600) / 16)), x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const xx = x0 + (x - x0) * e, yy = y0 + (y - y0) * e;
      await this.s.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: xx, y: yy, button: btn ? 'left' : 'none', buttons: btn ? 1 : 0 });
      await this.s.ev(`__clipMove(${xx},${yy})`);
      await sleep(16);
    }
    this.x = x; this.y = y;
  }
  async click(target, opts) {
    const o = opts || {};
    const p = typeof target === 'string' ? await this.at(target, o.fx, o.fy) : target;
    await this.move(p.x, p.y, o.ms || 650);
    await sleep(o.pause == null ? 180 : o.pause);
    await this.s.ev(`__clipRing(${p.x},${p.y})`);
    // a double-click is two real clicks (clickCount 1 then 2), as a mouse sends them
    for (let k = 1; k <= (o.count || 1); k++) {
      await this.s.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: k, modifiers: o.mod || 0 });
      await sleep(60);
      await this.s.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: k, modifiers: o.mod || 0 });
      if (k < (o.count || 1)) await sleep(70);
    }
    await sleep(o.after == null ? 450 : o.after);
  }
  async drag(from, to, opts) {
    const o = opts || {};
    const a = typeof from === 'string' ? await this.at(from) : from;
    await this.move(a.x, a.y, o.ms || 600); await sleep(150);
    await this.s.ev(`__clipRing(${a.x},${a.y})`);
    await this.s.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(120);
    await this.move(to.x, to.y, o.dragMs || 900, true);
    await sleep(150);
    await this.s.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(o.after == null ? 450 : o.after);
  }
  // A native (HTML5) drag: DevTools intercepts the drag Chrome starts from the real mouse press,
  // then drag events are replayed along the path, the drawn cursor moving with them.
  async dragNative(from, to, opts) {
    const o = opts || {};
    const a = typeof from === 'string' ? await this.at(from) : from;
    const b = typeof to === 'string' ? await this.at(to) : to;
    await this.move(a.x, a.y, o.ms || 600); await sleep(150);
    await this.s.cdp('Input.setInterceptDrags', { enabled: true });
    let data = null;
    this.s.on['Input.dragIntercepted'] = (p) => { data = p.data; };
    await this.s.ev(`__clipRing(${a.x},${a.y})`);
    await this.s.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 6 && !data; i++) { await this.s.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + i * 2, y: a.y + i * 3, button: 'left', buttons: 1 }); await sleep(40); }
    if (!data) { await this.s.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y, button: 'left', buttons: 0, clickCount: 1 }); await this.s.cdp('Input.setInterceptDrags', { enabled: false }); throw new Error('no native drag started at ' + JSON.stringify(a)); }
    await this.s.cdp('Input.dispatchDragEvent', { type: 'dragEnter', x: a.x, y: a.y + 6, data: data });
    const n = Math.max(8, Math.round((o.dragMs || 1000) / 30));
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
      await this.s.cdp('Input.dispatchDragEvent', { type: 'dragOver', x: x, y: y, data: data });
      await this.s.ev(`__clipMove(${x},${y})`);
      await sleep(20);
    }
    await this.s.cdp('Input.dispatchDragEvent', { type: 'drop', x: b.x, y: b.y, data: data });
    await this.s.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
    await this.s.cdp('Input.setInterceptDrags', { enabled: false });
    this.x = b.x; this.y = b.y;
    await sleep(o.after == null ? 500 : o.after);
  }
  async type(text, delay) { for (const ch of text) { await this.s.cdp('Input.insertText', { text: ch }); await sleep(delay || 70); } }
  async key(k, code, kc) { await this.s.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code || k, windowsVirtualKeyCode: kc || 0 }); await this.s.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code || k, windowsVirtualKeyCode: kc || 0 }); }
  // the next file dialog the page opens gets these files (a real <input type=file> change)
  async chooseFiles(files) {
    await this.s.cdp('Page.enable');
    await this.s.cdp('Page.setInterceptFileChooserDialog', { enabled: true });
    this.s.on['Page.fileChooserOpened'] = async (p) => { await this.s.cdp('DOM.setFileInputFiles', { files: files, backendNodeId: p.backendNodeId }); this.s.on['Page.fileChooserOpened'] = null; };
  }
  // a point on an image element, in that image's own pixels (nw x nh)
  async imgPt(sel, px, py, nw, nh) {
    const b = (await this.at(sel)).box;
    return { x: b.x + b.w * px / nw, y: b.y + b.h * py / nh };
  }
  // a sharp enlargement of one small area (a footer line) shown as a card over the video for `ms`;
  // captured at `scale` by DevTools, so text is re-rendered, not blown up
  async callout(rect, ms, label, scale) {
    const r = await this.s.cdp('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: scale || 5 } });
    this.callouts.push({ t: this.now(), dur: ms, label: label || '', data: r.result.data });
    await sleep(ms);
  }
  // captions are drawn by the encoder over the video (so a zoom never crops them)
  async cap(html, hold) {
    const m = /<span class="n">([^<]*)<\/span>/.exec(html || '');
    const body = String(html || '').replace(/<span class="n">[^<]*<\/span>/, '');
    const parts = []; body.split(/(<b>.*?<\/b>)/).forEach(s => { if (!s) return; const b = /^<b>(.*)<\/b>$/.exec(s); parts.push({ s: (b ? b[1] : s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'), b: !!b }); });
    this.caps.push({ t: this.now(), n: m ? m[1] : '', parts: html ? parts : null });
    if (hold) await sleep(hold);
  }
  // frames -> webm via the encoder page (same origin as the app, served by the driver)
  async encode(outFile, dir) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const t0 = this.frames[0].t;
    const list = this.frames.map((f, i) => { const p = path.join(dir, 'f' + String(i).padStart(5, '0') + '.jpg'); fs.writeFileSync(p, Buffer.from(f.data, 'base64')); return { src: STATE.app + '/__file?p=' + encodeURIComponent(p), t: Math.round(f.t - t0) }; });
    const enc = path.join(__dirname, 'encoder.html');
    const tg = await this.s.cdp('Target.createTarget', { url: STATE.app + '/__file?p=' + encodeURIComponent(enc) });
    await sleep(1200);
    const { sock } = await connect(x => x.id === tg.result.targetId);
    const cam = this.cam.map(k => Object.assign({}, k, { t: k.t - t0 }));
    const caps = this.caps.map(k => Object.assign({}, k, { t: k.t - t0 }));
    const side = this.side.map((f, i) => { const p = path.join(dir, 's' + String(i).padStart(5, '0') + '.jpg'); fs.writeFileSync(p, Buffer.from(f.data, 'base64')); return { src: STATE.app + '/__file?p=' + encodeURIComponent(p), t: Math.round(f.t - (this.sideT0 || 0)) }; });
    const callouts = this.callouts.map((k, i) => { const p = path.join(dir, 'callout' + i + '.png'); fs.writeFileSync(p, Buffer.from(k.data, 'base64')); return { t: k.t - t0, dur: k.dur, label: k.label, src: STATE.app + '/__file?p=' + encodeURIComponent(p) }; });
    const info = await sock.ev(`__encode(${JSON.stringify(list)}, ${this.W}, ${this.H}, 30, ${JSON.stringify(cam)}, ${JSON.stringify(caps)}, ${this.tEnd - t0}, ${JSON.stringify(callouts)}, ${JSON.stringify(this.chapters.map(k => Object.assign({}, k, { t: k.t - t0 })))}, ${JSON.stringify(this.splits.map(k => Object.assign({}, k, { t: k.t - t0, end: Math.min(k.end, this.tEnd) - t0 })))}, ${JSON.stringify(side)})`);
    const len = await sock.ev('__out.length'); let s = '';
    for (let i = 0; i < len; i += 4000000) s += await sock.ev(`__out.slice(${i}, ${i + 4000000})`);
    fs.writeFileSync(outFile, Buffer.from(s.split(',')[1], 'base64'));
    // the poster Help shows before play: the last real frame, the finished screen
    fs.copyFileSync(path.join(dir, 'f' + String(list.length - 1).padStart(5, '0') + '.jpg'), outFile.replace(/\.webm$/, '.jpg'));
    await this.s.cdp('Target.closeTarget', { targetId: tg.result.targetId });
    return Object.assign(info, { frames: list.length, seconds: (this.tEnd - t0) / 1000 });
  }
}
async function open(W, H) {
  const { sock } = await connect();
  const dsf = 1.5;
  await sock.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dsf, mobile: false });
  const c = new Clip(sock); c.W = W; c.H = H; c.dsf = dsf; c.x = W / 2; c.y = H / 2;
  return c;
}
module.exports = { open, sleep, STATE };
