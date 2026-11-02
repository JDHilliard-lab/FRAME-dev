// 20.12: EVERY PICTURE HAS A HOUSE CODE. The ten projects printed camera names (IMG_4021) and
// render file names under pieces; the vendor could not find the file. Preflight flags an image
// code that is not a prefix of letters then numbers.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = { setup: function (codes, stage) {',
  '  editorialContent = _editorialDefaults(); if (stage) editorialContent.presentationType = stage;',
  '  dashProjectData = codes.map((c, i) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: "ART." + (i + 1), imageCode: c, artworkUrl: "data:image/jpeg;base64,AA" }));',
  '  return _imgCodeShapePreflight(); } };',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;

check('EXACT BUG: a client photo still named IMG_4021 is flagged, named and linked to its piece', () => {
  const pf = fx.setup(['IMG_4021']);
  if (pf.length !== 1 || pf[0].sev !== 'warn' || pf[0].text.indexOf('ART.1 — image code “IMG_4021”') !== 0) throw new Error(JSON.stringify(pf));
  if (!pf[0].go || pf[0].go.rowId !== 'ART.1') throw new Error('no way to the piece');
});
check('a render file name too, and an error in Final Spec', () => {
  const pf = fx.setup(['Lobby render v2 final'], 'final');
  if (pf.length !== 1 || pf[0].sev !== 'err') throw new Error(JSON.stringify(pf));
});
check('house codes from the ten projects pass, variants and set letters included', () => {
  const pf = fx.setup(['JZY.010.00219', 'FAO.010.00031', 'GDC.000.00219.1', 'FCM.010.00002', 'FGD.010.00001A', 'fjh.010.00004']);
  if (pf.length) throw new Error(pf.map(x => x.text).join(' | '));
});
check('blank and TBD codes are left to the checks that own them', () => {
  if (fx.setup(['', 'TBD']).length) throw new Error('flagged');
});
check('Preflight runs it', () => {
  const S = APP.slice(APP.indexOf('function _dsRunPreflight'), APP.indexOf('function _pfBadgeSchedule'));
  if (S.indexOf('_imgCodeShapePreflight()') < 0) throw new Error('not wired');
});
const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
