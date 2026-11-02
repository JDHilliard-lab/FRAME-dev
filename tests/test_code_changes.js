// 20.09: RENUMBERED PIECES ARE SAID, NOT READ AS REMOVED + ADDED.
//
// Ford Admin renumbered every placement between V1 and V2, One Park Tower every ground
// floor code at V7, and nobody told the vendors; FRAME's Issues diff (keyed by code) read
// each renumbered piece as one removed and another added. Every rename is now logged
// (applyIdRename), an issue remembers where the log stood, and the diff follows each old
// code to its current one: "RENUMBERED ART.2 -> ART.1". Issues older than the log fall back
// to the same picture under the same image code.
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
  '  setup: function (n) {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = []; for (let i = 1; i <= n; i++) dashProjectData.push(Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: "ART." + i, imageCode: "FJH.010.0000" + i, artworkUrl: "data:image/png;base64," + "Q".repeat(80) + "P" + i }));',
  '    return markIssued("V5");',
  '  },',
  '  rows: function () { return dashProjectData; },',
  '  del: function (id) { dashProjectData = dashProjectData.filter(r => r.id !== id); _codesSettle(); },',
  '  ren: function (a, b) { applyIdRename(a, b, true); },',
  '  addRow: function (id, n) { dashProjectData.push(Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, imageCode: "FJH.010.0009" + n, artworkUrl: "data:image/png;base64," + "Q".repeat(80) + "N" + n })); },',
  '  diff: function () { return _issueDiff(editorialContent.issues[editorialContent.issues.length - 1]); },',
  '  text: function () { return _issueDiffText(editorialContent.issues[editorialContent.issues.length - 1]); },',
  '  csv: function () { return _issueDiffCSV(editorialContent.issues[editorialContent.issues.length - 1]); },',
  '  ec: function () { return editorialContent; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const pairs = (d) => d.renamed.map(r => r.from + '>' + r.to).join(',');

check('EXACT BUG: deleting ART.1 after an issue reads as one removal and two renumbers', () => {
  fx.setup(3);
  fx.del('ART.1');
  if (fx.rows().map(r => r.id).join() !== 'ART.1,ART.2') throw new Error('setup: FRAME did not renumber: ' + fx.rows().map(r => r.id).join());
  const d = fx.diff();
  if (pairs(d) !== 'ART.2>ART.1,ART.3>ART.2') throw new Error('renamed ' + pairs(d));
  if (d.removed.join() !== 'ART.1' || d.added.length) throw new Error('removed ' + d.removed.join() + ' added ' + d.added.join());
  if (fx.text().indexOf('RENUMBERED') < 0 || fx.text().indexOf('ART.2  →  ART.1') < 0) throw new Error(fx.text());
});

check('a shift to make room for a new piece: renumbers plus one added', () => {
  fx.setup(3);
  fx.ren('ART.3', 'ART.4'); fx.ren('ART.2', 'ART.3'); fx.addRow('ART.2', 1);
  const d = fx.diff();
  if (pairs(d) !== 'ART.2>ART.3,ART.3>ART.4') throw new Error(pairs(d));
  if (d.added.join() !== 'ART.2' || d.removed.length) throw new Error('added ' + d.added.join() + ' removed ' + d.removed.join());
});

check('a renumbered piece whose spec changed shows the change under its new code', () => {
  fx.setup(2);
  fx.ren('ART.2', 'ART.7');
  fx.rows().find(r => r.id === 'ART.7').glass = 'Museum glass';
  const d = fx.diff();
  const c = d.changed.find(x => x.id === 'ART.7');
  if (!c || !c.fields.some(f => f.label === 'Glass' && f.now === 'Museum glass')) throw new Error(JSON.stringify(d.changed));
});

check('temporary renumber names never show in the note', () => {
  fx.setup(3); fx.del('ART.1');
  if (/__RN|ZZRN/.test(fx.text())) throw new Error(fx.text());
});

check('an issue recorded before the log matches by picture and image code', () => {
  fx.setup(2);
  const iss = fx.ec().issues[0]; delete iss.logSeq;
  fx.ec().codeLog = []; fx.ec().codeLogSeq = 0;
  fx.rows().find(r => r.id === 'ART.2').id = 'ART.9';
  const d = fx.diff();
  if (pairs(d) !== 'ART.2>ART.9' || d.added.length || d.removed.length) throw new Error(JSON.stringify(d));
});

check('the changes CSV says Renumbered with the old and new code', () => {
  fx.setup(3); fx.del('ART.1');
  const csv = fx.csv();
  if (csv.indexOf('"ART.1","Renumbered","Item Code","ART.2","ART.1"') < 0) throw new Error(csv);
});

check('the log and the issue’s place in it are saved with the project', () => {
  fx.setup(2); fx.ren('ART.2', 'ART.5');
  const ed = window._editorialFromFile(JSON.parse(JSON.stringify(fx.ec())));
  if (!ed.codeLog || ed.codeLog.length !== 1 || ed.codeLogSeq !== 1) throw new Error(JSON.stringify(ed.codeLog));
  if (ed.issues[0].logSeq !== 0) throw new Error('issue logSeq ' + ed.issues[0].logSeq);
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
