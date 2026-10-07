// FLOORPLAN ITEMS (17.87), rebuilt from the lost week:
//  - "begin in floorplan where you could pin/add item codes ... without having to place
//    it on a plan view": + Add code on the Items tab, type + frame set.
//  - "ART.1 ... EGD.1, WF.1": PREFIX.n, prefix from the type, unpadded unless the
//    project already pads.
//  - "made it easy to swap item codes and everything would change automatically":
//    double-click rename moves the whole placement and the keys that store it.
//  - default categories Framed Art / Canvas / EGD / WF, quick to switch.
//  - a header naming the columns; line types incl. Wrap for EGD/WF.
//  - "circle pins without fill ... only get fill when they were assigned a placement".
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); } };

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  get rows() { return dashProjectData; }, set rows(v) { dashProjectData = v; },',
  '  get elevs() { return elevations; }, set elevs(v) { elevations = v; },',
  '  get ed() { return editorialContent; }, set ed(v) { editorialContent = v; },',
  '  defaults: _editorialDefaults, fromFile: _editorialFromFile, cats: _artCats, preset: _artCatsApplyPreset,',
  '  add: _fpAddCodes, next: _nextPlacementCode, rename: _fpRenameGroup, groups: _fpGroups,',
  '  panel: _fpPanelItems, setPin: _fpSetPin, gen: generateNextItemCode,',
  '  get armLine() { return _fpLineArmId; }, set armLine(v) { _fpLineArmId = v; },',
  '  get lineStart() { return _fpLineStart; }, set lineStart(v) { _fpLineStart = v; },',
  '  click: _dsFpLineClickPoint, setWall: _fpSetWall, wallOn: _fpWallOn, quiet: function () { _dsRenderCenter = function () {}; _dsRenderRail = function () {}; _dsRenderTools = function () {}; _dsRefresh = function () {}; },',
  '  setNorm: function (fn) { _dsFpNorm = fn; },',
  '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;
fx.quiet();
window._toast = () => null;

const fresh = () => { fx.rows = []; fx.ed = fx.defaults(); fx.elevs = [{ id: 'w1', name: 'Lobby', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }]; };

check('a NEW project starts on Framed Art / Canvas / EGD / WF', () => {
  fresh();
  const labels = fx.cats().filter(c => c.key).map(c => c.label).join(',');
  if (labels !== 'Framed Art,Canvas,EGD,WF') throw new Error('got ' + labels);
});

check('an OLD project file that never chose keeps the tier set, so its pins stay coloured', () => {
  fx.ed = fx.fromFile({ narrative: 'x' });
  if (fx.cats().some(c => c.key === 'egd')) throw new Error('old file was handed the new list');
  if (!fx.cats().some(c => c.key === 'primary')) throw new Error('tiers missing');
  fx.ed = fx.fromFile({ artCategories: [{ key: '', label: 'None', color: '#444' }, { key: 'x', label: 'Mine', color: '#123' }] });
  if (fx.cats().length !== 2) throw new Error('a saved list was not kept');
});

check('quick set swaps the list but keeps a category a piece still uses', () => {
  fresh();
  fx.rows = [{ id: 'ART.1', category: 'primary' }];
  fx.ed.artCategories = fx.cats().concat([{ key: 'primary', label: 'Primary', color: '#E2231A' }]);
  fx.preset('types');
  if (!fx.cats().some(c => c.key === 'primary')) throw new Error('an in-use category was dropped');
  fx.rows = [];
  fx.preset('tiers');
  if (fx.cats().some(c => c.key === 'egd')) throw new Error('unused type category survived the switch');
});

check('EXACT ASK: + Add code mints ART.1, EGD.1, WF.1 from the type, each its own count', () => {
  fresh();
  const a = fx.add('framed', 1), e = fx.add('egd', 1), w = fx.add('wf', 1), a2 = fx.add('canvas', 1);
  if ([a, e, w, a2].join() !== 'ART.1,EGD.1,WF.1,ART.2') throw new Error('got ' + [a, e, w, a2].join());
  const egd = fx.rows.find(r => r.id === 'EGD.1');
  if (egd.product !== 'Wallcovering (EGD)' || egd.category !== 'egd') throw new Error('EGD row not typed');
  if (Math.abs(parseFloat(egd.bleed) - 2) > 1e-6) throw new Error('EGD did not get the 2in bleed');
  if (fx.rows.find(r => r.id === 'WF.1').product !== 'Window Film (WF)') throw new Error('WF row not typed');
  if (fx.rows.find(r => r.id === 'ART.2').product !== 'Framed Canvas (Floater)') throw new Error('canvas row not typed');
});

check('a frame set is ONE placement: triptych = ART.nA/B/C under one pin', () => {
  fresh();
  const c = fx.add('framed', 3);
  const ids = fx.rows.filter(r => r.id.indexOf(c) === 0).map(r => r.id).join();
  if (ids !== 'ART.1A,ART.1B,ART.1C') throw new Error('got ' + ids);
  const gs = fx.groups();
  if (gs.length !== 1 || gs[0].rows.length !== 3) throw new Error('not one placement');
  fx.add('framed', 7);
  if (fx.rows.filter(r => r.id.indexOf('ART.2') === 0).length !== 7) throw new Error('7 set did not make seven');
});

check('a project that already pads (ART.001) keeps padding; one that does not, does not', () => {
  fresh(); fx.rows = [{ id: 'ART.001' }, { id: 'ART.004B' }];
  if (fx.next('ART') !== 'ART.005') throw new Error('padded got ' + fx.next('ART'));
  fx.rows = [{ id: 'ART.3' }];
  if (fx.gen() !== 'ART.4') throw new Error('dashboard + Add got ' + fx.gen());
});

check('EXACT ASK: renaming a placement renames every piece, every wall frame and the keys that store it', () => {
  fresh();
  fx.add('framed', 2);   // ART.1A, ART.1B
  fx.elevs[0].frames = [{ id: 'ART.1A', active: true }, { id: 'ART.1B', active: true }];
  fx.ed.planDetails = [{ id: 'pd1', ids: ['ART.1'] }];
  fx.ed.specTemplateOverrides = { 'spec:ART.1': 'frameRight' };
  if (!fx.rename('ART.1', 'ART.12')) throw new Error('rename refused');
  if (fx.rows.map(r => r.id).join() !== 'ART.12A,ART.12B') throw new Error('rows: ' + fx.rows.map(r => r.id).join());
  if (fx.elevs[0].frames.map(f => f.id).join() !== 'ART.12A,ART.12B') throw new Error('wall frames not renamed');
  if (fx.ed.planDetails[0].ids[0] !== 'ART.12') throw new Error('plan detail still lists the old code');
  if (fx.ed.specTemplateOverrides['spec:ART.12'] !== 'frameRight' || fx.ed.specTemplateOverrides['spec:ART.1']) throw new Error('per-page setting did not follow the rename');
});

check('a rename onto a code something else owns is refused, and changes nothing', () => {
  fresh();
  fx.add('framed', 1); fx.add('framed', 1);   // ART.1, ART.2
  if (fx.rename('ART.1', 'ART.2')) throw new Error('allowed a clash');
  if (fx.rows.map(r => r.id).join() !== 'ART.1,ART.2') throw new Error('a refused rename still moved something');
});

check('the Items list has a header, + Add code, and HOLLOW numbers until pinned', () => {
  fresh();
  fx.add('framed', 1); fx.add('egd', 1);
  fx.setPin(fx.rows[0], 0, 0.5, 0.5);
  const t = doc.createElement('div'); doc.body.appendChild(t);
  fx.panel(t, { level: 0, kind: 'floorplan' });
  const head = t.querySelector('.fp-item-head');
  // 17.91: the header is # / Item code / Cat / Line / Frames (Line type moved into the pen's menu).
  if (!head || head.textContent.indexOf('Frames') < 0 || head.textContent.indexOf('Item code') < 0) throw new Error('no column header');
  if (!t.querySelector('.fp-add-bar')) throw new Error('no + Add code bar');
  const nums = t.querySelectorAll('.fp-num');
  const placed = t.querySelectorAll('.fp-num-placed').length, hollow = t.querySelectorAll('.fp-num-hollow').length;
  if (nums.length !== 2 || placed !== 1 || hollow !== 1) throw new Error('placed ' + placed + ' hollow ' + hollow);
  if (t.querySelector('.fp-num-hollow').style.backgroundColor !== 'transparent') throw new Error('hollow chip has a fill');
  if (APP.indexOf("['wrap', 'Wrap',") < 0) throw new Error('Wrap is not a line type');
  t.remove();
});

check('the Items list works with NO plan image, so a project can start there', () => {
  fresh();
  const t = doc.createElement('div');
  fx.panel(t, { level: 0, kind: 'floorplan' });
  if (!t.querySelector('.fp-add-bar')) throw new Error('empty project has no way to add codes');
});

check('WRAP: each click continues from the last end, so the line turns corners in one chain', () => {
  fresh();
  fx.add('egd', 1);
  const r = fx.rows[0];
  fx.setWall(r, 0, { wallLines: [], wallPanels: 'wrap' });
  fx.armLine = 'EGD.1'; fx.lineStart = null;
  const pts = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.6]];
  let k = 0;
  fx.setNorm(() => ({ x: pts[k][0], y: pts[k][1] }));
  for (k = 0; k < 3; k++) fx.click({ shiftKey: false });
  const w = fx.wallOn(r, 0);
  if (!w || w.wallLines.length !== 2) throw new Error('expected 2 segments, got ' + (w && w.wallLines.length));
  const [s1, s2] = w.wallLines;
  if (s2.x1 !== s1.x2 || s2.y1 !== s1.y2) throw new Error('second segment does not start where the first ended');
  if (w.wallPanels !== 'wrap') throw new Error('mode lost');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  if (fx.lineStart) throw new Error('Esc did not end the chain');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
