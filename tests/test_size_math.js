// 20.11: THE SIZES ADD UP. Studio PMs checked "overall = art + mat + frame" by hand before
// every RFI. FRAME derives the opening, so the sum fails one way: a frame and mats wider than
// the overall, which clamps the opening to nothing and prints a frame with no picture.
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
  '  setup: function (rows, stage) {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    if (stage) editorialContent.presentationType = stage;',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '    return _sizeMathPreflight();',
  '  },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const R = (o) => Object.assign({ id: 'ART.1', product: 'Framed Art', fW: 1, m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, extW: 24, extH: 30 }, o);

check('EXACT BUG: a 2in frame and 4in mats on a 10in piece is flagged with its numbers', () => {
  const pf = fx.setup([R({ fW: 2, m1T: 4, m1B: 4, m1L: 4, m1R: 4, extW: 10, extH: 14 })]);
  if (pf.length !== 1 || pf[0].sev !== 'warn') throw new Error(JSON.stringify(pf));
  if (pf[0].text.indexOf('ART.1') !== 0 || pf[0].text.indexOf('(2 in a side)') < 0 || pf[0].text.indexOf('10 × 14 in') < 0) throw new Error(pf[0].text);
  if (!pf[0].go || pf[0].go.rowId !== 'ART.1') throw new Error('no way to the piece');
});
check('an error in Final Spec', () => {
  if (fx.setup([R({ fW: 2, extW: 10, extH: 10 })], 'final')[0].sev !== 'err') throw new Error('not an error');
});
check('a piece that adds up, and an unsized piece, are left alone', () => {
  if (fx.setup([R({})]).length) throw new Error('flagged a 24 x 30');
  if (fx.setup([R({ extW: 0, extH: 0 })]).length) throw new Error('flagged an unsized piece (the IFS audit covers that)');
});
check('mats off on a floater or wrapped canvas do not count against it', () => {
  if (fx.setup([R({ product: 'Frameless Canvas (Wrapped)', extW: 8, extH: 8 })]).length) throw new Error('wrapped canvas');
});
check('Preflight runs it', () => {
  const S = APP.slice(APP.indexOf('function _dsRunPreflight'), APP.indexOf('function _pfBadgeSchedule'));
  if (S.indexOf('_sizeMathPreflight()') < 0) throw new Error('not wired');
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
