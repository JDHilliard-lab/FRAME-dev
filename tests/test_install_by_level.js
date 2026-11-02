// 20.15: INSTALL PAGES FOLLOW THEIR PLAN. Ford Hub Level 03 has two plans: the existing-inventory
// plan (EA..EG) and the art plan (01..35). In the Install guide layout every plan printed first
// and every wall after, so EA..EG landed after ART-35, far from their plan. With plans ordered by
// level (the default) each plan is now followed by the walls pinned on it.
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
  'window.__fx = { pages: function (order, unpinned) {',
  '  editorialContent = _editorialDefaults(); editorialContent.specTemplate = "installGuide";',
  '  if (order) editorialContent.planOrder = order;',
  '  floorplanLevels.length = 0; floorplanLevels.push({ name: "Level 03 | Existing", imageData: "data:image/png;base64,AA", imageName: "a.png" }, { name: "Level 03 | Art", imageData: "data:image/png;base64,AA", imageName: "b.png" });',
  '  const codes = [["1B.L3.ART-01", 1], ["1B.L3.ART-02", 1], ["1B.L3.ART-EA", 0], ["1B.L3.ART-EB", 0], ["1B.L3.ART-03", null]];',
  '  dashProjectData = codes.map(c => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: c[0] }));',
  '  codes.forEach((c, i) => { if (c[1] != null && !(unpinned && i === 2)) _fpSetPin(dashProjectData[i], c[1], 0.5, 0.5); });',
  '  elevations = codes.map((c, i) => ({ id: "w" + i, name: c[0], wallW: 144, wallH: 108, personPos: { x: 6 }, frames: [{ id: c[0], x: 50, y: 40, w: 40, h: 30, active: true }] }));',
  '  return _deckPageList().filter(d => d.kind === "floorplan" || d._install).map(d => d.kind === "floorplan" ? "PLAN" + d.level : d.title); } };',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;

check('EXACT BUG: each plan is followed by its own walls (by level, the default)', () => {
  const p = fx.pages().join(' ');
  if (p !== 'PLAN0 1B.L3.ART-EA 1B.L3.ART-EB PLAN1 1B.L3.ART-01 1B.L3.ART-02 1B.L3.ART-03') throw new Error(p);
});
check('a wall with no pinned piece goes after the plans, as before', () => {
  const p = fx.pages(null, true).join(' ');
  if (p !== 'PLAN0 1B.L3.ART-EB PLAN1 1B.L3.ART-01 1B.L3.ART-02 1B.L3.ART-EA 1B.L3.ART-03') throw new Error(p);
});
check('plans first keeps every plan first, then every wall', () => {
  const p = fx.pages('plansFirst').join(' ');
  if (p !== 'PLAN0 PLAN1 1B.L3.ART-EA 1B.L3.ART-EB 1B.L3.ART-01 1B.L3.ART-02 1B.L3.ART-03' && p !== 'PLAN0 PLAN1 1B.L3.ART-01 1B.L3.ART-02 1B.L3.ART-EA 1B.L3.ART-EB 1B.L3.ART-03') throw new Error(p);
});
const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
