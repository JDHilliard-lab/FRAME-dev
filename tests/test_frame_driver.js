// THE FRAME DRIVER (20.01, tools/frame-driver.js): FRAME in headless Chrome, driven from the
// command line. These checks run the real thing end to end: start, a FRAME_API call, a page
// built from a template with a picture from disk (whole, captioned with its code, an unused
// slot taken off), a page rendered to PNG, the real PDF, and stop. Its own state file and
// port, so a driver already running on this machine is left alone. Skipped (0 checks) on a
// machine with no Chrome.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const DRV = path.join(root, 'tools', 'frame-driver.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-drv-test-'));
const env = Object.assign({}, process.env, { FRAME_DRIVER_STATE: path.join(tmp, 'state.json') });
const PORT = String(8700 + Math.floor(Math.random() * 80));
const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));

const run = (args) => { const out = execFileSync(process.execPath, [DRV].concat(args), { env, cwd: root, encoding: 'utf8', timeout: 240000 }); return JSON.parse(out); };
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

if (!chrome) { console.log('No Chrome on this machine: driver checks skipped.\n\n--- Summary ---\nALL PASSED (0)'); process.exit(0); }
const APP_VERSION = (/const APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(root, 'app.js'), 'utf8')) || [])[1];
const ICON = path.join(root, 'icon-512.png');
try {
    let started = null;
    check('start brings FRAME up in headless Chrome and answers with its version', () => {
        started = run(['start', '--port', PORT]);
        if (!started.started || started.version !== APP_VERSION) throw new Error(JSON.stringify(started));
    });
    let key = null;
    check('a template page filled with a picture from disk: whole, captioned with its code, an unused slot removed', () => {
        run(['call', 'setProject', JSON.stringify([{ name: 'Driver Test', location: 'Las Vegas, NV' }])]);
        const p = run(['call', 'addPage', JSON.stringify([{ template: 'Moodboard (Alt)', texts: ['SUB', 'DRIVER TEST', 'One / Two / Three', 'Note'], images: { 0: { image: { $file: ICON }, fit: 'whole', caption: 'code' }, 4: false } }])]);
        if (p.error) throw new Error(p.error);
        key = p.key;
        const d = run(['call', 'describePage', JSON.stringify([key])]);
        if (d.images.length !== 5) throw new Error(d.images.length + ' slots');
        const s0 = d.images[0];
        if (!s0.filled || s0.fileName !== 'icon-512.png' || s0.caption !== 'icon-512') throw new Error(JSON.stringify(s0));
        // a square picture, whole: the box is square on the page (h in page heights = w x 936/540)
        if (Math.abs(s0.h - s0.w * 936 / 540) > 0.002) throw new Error('not whole: ' + s0.w + ' x ' + s0.h);
        if (d.texts[1].text !== 'DRIVER TEST') throw new Error(JSON.stringify(d.texts));
    });
    check('pictures the API places have square corners (the studio\u2019s moodboards are straight-edged)', () => {
        const r = run(['eval', 'editorialContent.annotations[' + JSON.stringify(key) + '].map(a => a.dataUrl ? a.radius : null).filter(v => v !== null)']);
        if (!r.length || r.some(v => v !== 0)) throw new Error(JSON.stringify(r));
    });
    check('EXACT ASK: Shift-click selects several cropped pictures, and ONE settings popup turns their captions on, sets one size and shows the code on all of them; one undo takes the size back on all', () => {
        const img = { image: { $file: ICON } };
        const p2 = run(['call', 'addPage', JSON.stringify([{ template: 'Moodboard (Alt)', images: { 0: img, 1: img, 2: img } }])]);
        const js = `(async () => { try {
          const key = ${JSON.stringify('')} || ${JSON.stringify(p2.key)};
          switchView('deck'); await new Promise(r => setTimeout(r, 500)); _dsTab('pages'); await new Promise(r => setTimeout(r, 500));
          _dsRestoreSel(key, 'layout'); _dsRenderCenter(); await new Promise(r => setTimeout(r, 600));
          const list = editorialContent.annotations[key];
          const c = document.getElementById('dsLayoutCanvas'); const R = c.getBoundingClientRect();
          for (const i of [0, 1, 2]) { const a = list[i]; const x = R.left + (a.x + a.w / 2) * R.width, y = R.top + (a.y + a.h / 2) * R.height;
            document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, shiftKey: true, button: 0 }));
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, shiftKey: true })); await new Promise(r => setTimeout(r, 120)); }
          const sel = _mbSelAnn.slice();
          document.getElementById('dsSelSettings').click(); await new Promise(r => setTimeout(r, 250));
          const pop = document.getElementById('dsGearPopup'); if (!pop) return { sel, err: 'no popup' };
          const title = pop.querySelector('span').textContent;
          Array.from(pop.querySelectorAll('button')).find(b => /Caption: off/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 250));
          document.querySelector('#dsGearPopup [data-cap-size=up]').click(); await new Promise(r => setTimeout(r, 250));
          document.querySelector('#dsGearPopup [data-cap-size=up]').click(); await new Promise(r => setTimeout(r, 250));
          Array.from(document.querySelectorAll('#dsGearPopup button')).find(b => b.textContent === 'Code').click(); await new Promise(r => setTimeout(r, 250));
          const after = list.slice(0, 3).map(a => [a.showCaption, a.capPt, a.capSource].join());
          undo(); const undone = editorialContent.annotations[key].slice(0, 3).map(a => a.capPt);
          return { sel, title, after, undone };
        } catch (e) { return { err: e.stack }; } })()`;
        const r = run(['eval', js]);
        if (r.err) throw new Error(r.err);
        if (r.sel.join() !== '0,1,2') throw new Error('Shift-click selected ' + JSON.stringify(r.sel));
        if (r.title !== '3 boxes selected') throw new Error('popup: ' + r.title);
        if (r.after.some(v => v !== 'true,10,filename')) throw new Error(JSON.stringify(r.after));
        if (r.undone.some(v => v !== 9.5)) throw new Error('undo: ' + JSON.stringify(r.undone));
    });
    check('render writes the page as a PNG drawn by FRAME', () => {
        const out = path.join(tmp, 'page.png');
        const r = run(['render', key, out]);
        if (r.error || !r.complete) throw new Error(JSON.stringify(r));
        const b = fs.readFileSync(out);
        if (b.slice(1, 4).toString() !== 'PNG' || b.length < 10000) throw new Error('not a page picture (' + b.length + ' bytes)');
    });
    check('pdf writes FRAME’s real export, one page per deck page', () => {
        const out = path.join(tmp, 'deck.pdf');
        const pages = run(['call', 'listPages']).reduce((n, p) => n + p.span, 0);
        const r = run(['pdf', out]);
        if (r.error) throw new Error(r.error);
        const b = fs.readFileSync(out);
        if (b.slice(0, 4).toString() !== '%PDF' || r.pages !== pages) throw new Error(r.pages + ' pages vs ' + pages);
    });
    check('stop ends Chrome and the driver', () => {
        const r = run(['stop']);
        if (!r.stopped) throw new Error(JSON.stringify(r));
        // gone when stop RETURNS: a start straight after must not find the old one answering
        if (fs.existsSync(env.FRAME_DRIVER_STATE)) throw new Error('state file left behind');
    });
} finally {
    try { if (fs.existsSync(env.FRAME_DRIVER_STATE)) run(['stop']); } catch (e) {}
}
const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
