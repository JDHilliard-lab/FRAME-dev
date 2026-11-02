// 20.13: A LETTER AFTER A LETTER IS PART OF THE NAME. Ford Hub Phase 1B codes its
// existing-inventory placements 1B.L3.ART-EA ... -EG: seven walls across a floor. FRAME took the
// last letter of each as a piece letter and keyed all seven as ONE set "1B.L3.ART-E" (one set
// page, one pin). A piece letter follows the placement number or a separator.
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
  'window.__fx = { groups: function (ids) {',
  '  editorialContent = _editorialDefaults();',
  '  dashProjectData = ids.map((id, i) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, planX: 0.1 + i * 0.05, planY: 0.5, level: 0 }));',
  '  return _fpGroups().map(g => g.key + ":" + g.rows.length); },',
  '  sorted: function (ids) {',
  '    dashProjectData = ids.map(id => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id }));',
  '    elevations = ids.map((id, i) => ({ id: "w" + i, name: id, wallW: 144, wallH: 108, frames: [{ id: id, x: 0, y: 0, w: 10, h: 10 }] })).concat([{ id: "wx", name: "blank", wallW: 144, wallH: 108, frames: [] }]);',
  '    _codesSortRows(); _codesSortWalls();',
  '    return { rows: dashProjectData.map(r => r.id), walls: elevations.map(e => e.name) }; } };',
].join(NL));
console.error = quiet; console.log = qlog;
const K = (c) => window._artGroupKey(c);

check('EXACT BUG: 1B.L3.ART-EA ... -EG are seven placements, not one set "1B.L3.ART-E"', () => {
  const ids = ['EA', 'EB', 'EC', 'ED', 'EE', 'EG'].map(s => '1B.L3.ART-' + s);
  ids.forEach(c => { if (K(c) !== c) throw new Error(c + ' keyed as ' + K(c)); });
  const g = window.__fx.groups(ids);
  if (g.length !== 6) throw new Error('plan groups: ' + g.join(', '));
});
check('a set inside such a placement is lettered after a separator: EF-A, EF-B, EF-C', () => {
  ['A', 'B', 'C'].forEach(l => { if (K('1B.L3.ART-EF-' + l) !== '1B.L3.ART-EF') throw new Error(l + ': ' + K('1B.L3.ART-EF-' + l)); });
  const g = window.__fx.groups(['1B.L3.ART-EF-A', '1B.L3.ART-EF-B', '1B.L3.ART-EF-C', '1B.L3.ART-EG']);
  if (g.join() !== '1B.L3.ART-EF:3,1B.L3.ART-EG:1') throw new Error(g.join());
});
check('house codes key exactly as before', () => {
  const want = { 'ART.1A': 'ART.1', 'ART.1': 'ART.1', 'ART.1.A': 'ART.1', 'ART-1A': 'ART-1', 'ART-1-A': 'ART-1', 'ART-1AA': 'ART-1A', 'ART-1B-A': 'ART-1B',
    'ART.1.2A': 'ART.1.2', 'ART.1B1': 'ART.1', 'EGD.3A': 'EGD.3', 'WF-1.B': 'WF-1', '1B.L3.ART-01A': '1B.L3.ART-01', 'L2.ART-2': 'L2.ART-2', 'Lobby-A': 'Lobby-A' };
  Object.keys(want).forEach(c => { if (K(c) !== want[c]) throw new Error(c + ' -> ' + K(c) + ', want ' + want[c]); });
});
check('20.14 EXACT BUG: client codes sort in number order too (Level 04 printed ART-02 before ART-01)', () => {
  const o = window.__fx.sorted(['1B.L4.ART-02', '1B.L4.ART-10', '1B.L4.ART-01', 'ART.2', '1B.L3.ART-EA', '1B.L3.ART-35']);
  const want = 'ART.2,1B.L3.ART-35,1B.L3.ART-EA,1B.L4.ART-01,1B.L4.ART-02,1B.L4.ART-10';
  if (o.rows.join() !== want) throw new Error('rows ' + o.rows.join());
  if (o.walls.join() !== want + ',blank') throw new Error('walls ' + o.walls.join());
});
const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
