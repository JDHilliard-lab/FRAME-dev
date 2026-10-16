// 18.94: A NEW PICTURE NEVER KEEPS THE OLD PICTURE'S SIZE.
// Reported: an image dropped onto a floater on the dashboard looked whole there, but the
// spec page printed a zoomed-in slice. Three drop paths called the apply function with no
// size, and `if (w) row.artworkW = w` kept the PREVIOUS image's size. The dashboard and
// wall size the picture from that number (squashing it to fit), while the spec page reads
// the real pixels and printed the true crop.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

check('every drop path hands the picture size on', () => {
  const bad = APP.split('processArtworkFile(file, (u, n) =>').length - 1;
  if (bad) throw new Error(bad + ' drop path(s) still drop the width and height');
  if (APP.indexOf('applyArtworkToRowIndex(rowIdx, u, n, w, h)') < 0) throw new Error('the wall drop does not pass the size');
});
check('no apply path keeps a size it was not given', () => {
  ['if (w) row.artworkW = w', 'if (h) row.artworkH = h'].forEach(t => {
    if (APP.indexOf(t) >= 0) throw new Error('still conditional: ' + t);
  });
});

function inApp() {
  const out = [];
  const ok = (label, fn) => { try { fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
  ok('EXACT BUG: a drop with no size clears the old picture size', () => {
    const r = dashProjectData[dashSelectedRowIndex];
    r.artworkUrl = 'data:image/png;base64,OLD'; r.artworkW = 1600; r.artworkH = 2400;
    applyArtworkToCurrentRow('data:image/png;base64,NEW', 'new-pic');
    let r2 = dashProjectData[dashSelectedRowIndex];   // the sync may rebuild the row object
    if (r2.artworkW !== 0 || r2.artworkH !== 0) throw new Error('kept ' + r2.artworkW + ' x ' + r2.artworkH);
    applyArtworkToCurrentRow('data:image/png;base64,NEW2', 'new-pic2', 2400, 1200);
    r2 = dashProjectData[dashSelectedRowIndex];
    if (r2.artworkW !== 2400 || r2.artworkH !== 1200) throw new Error('did not take the new size: ' + r2.artworkW + ' x ' + r2.artworkH);
  });
  ok('the row-index path clears it too', () => {
    const r = dashProjectData[0]; r.artworkW = 1600; r.artworkH = 2400;
    applyArtworkToRowIndex(0, 'data:image/png;base64,X', 'x');
    if (r.artworkW !== 0 || r.artworkH !== 0) throw new Error('kept ' + r.artworkW + ' x ' + r.artworkH);
  });
  ok('a stored size with other proportions counts as stale; a downscaled copy does not', () => {
    if (!_artSizeStale({ artworkW: 1600, artworkH: 2400 }, 2400, 1200)) throw new Error('portrait size accepted for a landscape picture');
    if (_artSizeStale({ artworkW: 1200, artworkH: 600 }, 2400, 1200)) throw new Error('same proportions called stale');
    if (!_artSizeStale({ artworkW: 0, artworkH: 0 }, 10, 10)) throw new Error('missing size not stale');
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
try { window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();'); }
catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
console.error = q; console.warn = w;
(window.__out || []).forEach(r => results.push(r));
let fail = 0;
results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
console.log(NL + '--- Summary ---');
console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
setTimeout(() => process.exit(fail ? 1 : 0), 50);
