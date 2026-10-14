// 18.63: THE IMG CODE COLUMN IS AS WIDE AS ITS LONGEST CODE.
//
// Asked for: "make it longer so you can always see the image code in one go... the
// longest image codes determines the width of image code column". The field was a fixed
// 172px, so FFI.FAR-2001-77-13208.9.3.12 had to be scrolled inside. Every field in the
// column now takes the width the longest one needs (one width, so the column is straight),
// refits as you type, never narrower than before, capped at DASH_IMGCODE_MAX_W.
// jsdom has no canvas, so _dashFitImgCodeCol falls back to a per-character estimate here;
// the browser measures the real glyphs (checked in headless Chrome when this was built).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); }
};

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  rows: function (r) { dashProjectData = r; dashSelectedRowIndex = -1; },',
  '  MIN: DASH_IMGCODE_MIN_W, MAX: DASH_IMGCODE_MAX_W,',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

const row = (id, code) => ({ id, product: 'Framed Art', location: 'LOBBY', imageCode: code, extW: 24, extH: 24, fW: 0.75, qty: 1 });
const widths = () => Array.prototype.map.call(doc.querySelectorAll('#rfiBody input[data-col="imgcode"]'), i => parseFloat(i.style.width));

check('short codes keep the old width', () => {
  fx.rows([row('ART.1', 'TBD'), row('ART.2', 'A1')]);
  window.renderDashTable();
  const w = widths();
  if (w.length !== 2) throw new Error('img code fields not tagged: ' + w.length);
  if (w.some(x => x !== fx.MIN)) throw new Error('widths ' + w.join(','));
});

check('EXACT ASK: the longest code sets ONE width for the whole column, wide enough to show it', () => {
  const long = 'FFI.FAR-2001-77-13208.9.3.12.EXTRA';
  fx.rows([row('ART.1', 'TBD'), row('ART.2', long), row('ART.3', 'AGS.410.00006.1')]);
  window.renderDashTable();
  const w = widths();
  if (new Set(w).size !== 1) throw new Error('column is ragged: ' + w.join(','));
  if (!(w[0] > fx.MIN)) throw new Error('did not grow for a long code: ' + w[0]);
  if (w[0] < long.length * 7) throw new Error('too narrow to show it: ' + w[0]);
});

check('typing a longer code widens the column straight away', () => {
  fx.rows([row('ART.1', 'TBD'), row('ART.2', 'TBD')]);
  window.renderDashTable();
  const ins = doc.querySelectorAll('#rfiBody input[data-col="imgcode"]');
  ins[1].value = 'FFI.FAR-2008-8.1.2.986.1_HIGHRES_FINAL';
  // runScripts outside-only never runs an inline oninput, so do what it does; the
  // attribute itself is checked below.
  window._dashFitImgCodeCol();
  const now = doc.querySelectorAll('#rfiBody input[data-col="imgcode"]');
  const w = Array.prototype.map.call(now, i => parseFloat(i.style.width));
  if (!(w[0] > fx.MIN) || new Set(w).size !== 1) throw new Error('did not refit on input: ' + w.join(','));
  if ((now[1].getAttribute('oninput') || '').indexOf('_dashFitImgCodeCol()') < 0) throw new Error('the field does not refit as you type');
});

check('a runaway code is capped', () => {
  fx.rows([row('ART.1', 'X'.repeat(400))]);
  window.renderDashTable();
  if (widths()[0] !== fx.MAX) throw new Error('not capped: ' + widths()[0]);
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
