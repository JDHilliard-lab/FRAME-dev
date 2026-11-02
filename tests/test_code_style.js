// 20.05: A NEW PIECE TAKES THE PROJECT'S OWN CODE STYLE.
//
// A FRAME-built install guide printed ART.1 while the client's deck, vendor sheet and crate
// list all said ART-01 (Ford Salt Lake City). FRAME kept typed client codes as they were, but
// minted every NEW piece in the house style, so an ART-01 project grew an ART.3. A new code
// now copies the separator and zero padding the project's codes of that type already use.
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
  '  add: function (ids, cat) {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = ids.map(id => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, imageCode: "X" }));',
  '    const before = dashProjectData.map(r => r.id);',
  '    _fpAddCodes(cat || "ART", 1, { quiet: true });',
  '    return dashProjectData.map(r => r.id).filter(id => before.indexOf(id) < 0);',
  '  },',
  '  next: function (ids, p) { dashProjectData = ids.map(id => ({ id: id })); return _nextPlacementCode(p || "ART"); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;

check('EXACT BUG: a new piece in an ART-01 project is ART-05, not ART.3', () => {
  const n = fx.add(['ART-01', 'ART-02', 'ART-04']);
  if (n.join() !== 'ART-05') throw new Error('minted ' + n.join());
});

check('the client’s separator without padding is kept too (ART-1, ART-2 -> ART-3)', () => {
  const n = fx.add(['ART-1', 'ART-2']);
  if (n.join() !== 'ART-3') throw new Error('minted ' + n.join());
});

check('the house style is unchanged (ART.1, ART.2 -> ART.3; empty project -> ART.1)', () => {
  if (fx.add(['ART.1', 'ART.2']).join() !== 'ART.3') throw new Error('house style changed');
  if (fx.next([]) !== 'ART.1') throw new Error('empty project: ' + fx.next([]));
});

check('the style most codes use wins, and the number counts across styles', () => {
  const c = fx.next(['ART-01', 'ART-02', 'ART-03', 'ART.9']);
  if (c !== 'ART-10') throw new Error(c);
});

check('padding width is the project’s (ART.007 -> ART.008, ART_01 -> ART_02)', () => {
  if (fx.next(['ART.007']) !== 'ART.008') throw new Error(fx.next(['ART.007']));
  if (fx.next(['ART_01']) !== 'ART_02') throw new Error(fx.next(['ART_01']));
});

check('a lettered set keeps the style (ART-03A owns ART-03)', () => {
  if (fx.next(['ART-01', 'ART-02', 'ART-03A', 'ART-03B']) !== 'ART-04') throw new Error(fx.next(['ART-01', 'ART-02', 'ART-03A', 'ART-03B']));
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
