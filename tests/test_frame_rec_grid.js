// 18.93: THE FRAME RECOMMENDATIONS PAGE IS ONE GRID.
// Reported: 8 frames in 3 columns drew 3 + 3 + 2, and the short column split the page
// height between TWO cards, so its frames came out half again as big as the rest.
// Every column now shares the fullest column's row height; the short one leaves its
// last cell empty.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

function inApp() {
  const out = [];
  const ok = (label, fn) => { try { fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
  const corner = { naturalWidth: 150, naturalHeight: 400, width: 150, height: 400 };
  const run = (n, cols) => {
    editorialContent.frameRec = { groupBy: 'none', cols: cols, size: 'large' };
    const frames = [];
    for (let i = 0; i < n; i++) frames.push({ code: 'MICH ' + i, vendor: 'Michelangelo', sizeText: '1"W', count: 1, img: corner });
    const rec = new CanvasPdfRec(936, 540); const imgs = [];
    const real = rec.addImage.bind(rec);
    rec.addImage = function (src, fmt, x, y, w, h) { if (src === corner) imgs.push({ x: x, y: y, w: w, h: h }); return real.apply(rec, arguments); };
    _drawFrameRecPage(rec, {}, 1, {}, { header: '', frames: frames });
    return imgs;
  };
  [[8, 3], [7, 3], [5, 2], [3, 4], [9, 3]].forEach(([n, cols]) => {
    ok('EXACT BUG: ' + n + ' frames in ' + cols + ' columns all draw the same size', () => {
      const imgs = run(n, cols);
      if (imgs.length !== n) throw new Error('drew ' + imgs.length + ' of ' + n);
      const hs = imgs.map(i => i.h), ws = imgs.map(i => i.w);
      if (Math.max.apply(null, hs) - Math.min.apply(null, hs) > 0.01) throw new Error('heights differ: ' + hs.map(h => h.toFixed(1)).join(', '));
      if (Math.max.apply(null, ws) - Math.min.apply(null, ws) > 0.01) throw new Error('widths differ: ' + ws.map(w => w.toFixed(1)).join(', '));
      // ...and on one grid: a row's cards share a top.
      const tops = Array.from(new Set(imgs.map(i => Math.round(i.y))));
      if (tops.length !== Math.ceil(n / Math.min(cols, n))) throw new Error('rows: ' + tops.join(','));
    });
  });
  window.__out = out;
}

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s || '').length * 4 }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
global.window = window; global.document = window.document; global.navigator = window.navigator;
const q = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
const results = [];
try { window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();'); }
catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
console.error = q; console.warn = w;
(window.__out || []).forEach(r => results.push(r));
let fail = 0;
results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
console.log(NL + '--- Summary ---');
console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
setTimeout(() => process.exit(fail ? 1 : 0), 50);
