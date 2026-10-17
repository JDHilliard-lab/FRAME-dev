// 19.15: ONE GROUP DIMENSION PER SET OF FRAMES, AND A GROUP DIMENSION CAN BE DELETED.
//
// Reported: pressing Group dimension three times on the same selection stacked three
// identical boxes (three 108" lines, three 41" lines), and none could be deleted. The
// only delete was a cross hidden until you hovered the box's top-right corner, three of
// them on one spot; no group dim could be selected, so Delete did nothing (or, with the
// frames still selected, deleted the FRAMES).
// Now a second press on the same set selects the existing one instead, old duplicates
// are dropped on read, clicking a group dim's number selects it (frames let go), and
// Delete / Backspace removes it. Different sets on one wall are still allowed.
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
  '  setup: function (gd) {',
  '    const F = (letter, x) => ({ letter, x, y: 40, w: 20, h: 30, active: true, selected: false, dimTo: [] });',
  '    elevations = [{ id: "w1", name: "W", wallW: 156, wallH: 108, frames: [F("A", 10), F("B", 40), F("C", 70), F("D", 100), F("E", 130)], groupDims: gd || [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames; elevScale = 5;',
  '    selectedGroupDim = null; selectedDimId = null; selectedCustomLine = null;',
  '    dimVisibility.groupBox = true;',
  '  },',
  '  select: function (letters) { elevFrames.forEach(f => { f.selected = letters.indexOf(f.letter) >= 0; }); },',
  '  get elev() { return elevations[0]; },',
  '  get sel() { return selectedGroupDim; },',
  '  set sel(v) { selectedGroupDim = v; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;
const toasts = [];
window._toast = (t) => { toasts.push(t); return null; };
const showElev = () => {
  doc.querySelectorAll('.view-container').forEach(v => { v.style.display = 'none'; });
  doc.getElementById('view-elevation').style.display = 'block';
};
const key = (k) => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));

check('a group dimension is created from a selection (else the rest proves nothing)', () => {
  fx.setup(); fx.select(['A', 'B', 'C']);
  window.createGroupDimFromSelection();
  if (fx.elev.groupDims.length !== 1) throw new Error('made ' + fx.elev.groupDims.length);
});

check('EXACT BUG: pressing it again on the same frames adds nothing and selects the one there', () => {
  fx.setup(); fx.select(['A', 'B', 'C']);
  window.createGroupDimFromSelection();
  fx.select(['C', 'A', 'B']);
  window.createGroupDimFromSelection();
  fx.select(['B', 'C', 'A']);
  window.createGroupDimFromSelection();
  if (fx.elev.groupDims.length !== 1) throw new Error('stacked ' + fx.elev.groupDims.length + ' group dims');
  if (fx.sel !== fx.elev.groupDims[0].id) throw new Error('the existing one was not selected');
  if (!toasts.length) throw new Error('said nothing');
});

check('a different set on the same wall is its own group dim (three left, two right)', () => {
  fx.setup(); fx.select(['A', 'B', 'C']);
  window.createGroupDimFromSelection();
  fx.select(['D', 'E']);
  window.createGroupDimFromSelection();
  if (fx.elev.groupDims.length !== 2) throw new Error('got ' + fx.elev.groupDims.length);
});

check('a project saved with duplicates keeps one of each set', () => {
  fx.setup([
    { id: 'g1', frameLetters: ['A', 'B', 'C'] },
    { id: 'g2', frameLetters: ['C', 'B', 'A'] },
    { id: 'g3', frameLetters: ['A', 'B', 'C'] },
    { id: 'g4', frameLetters: ['D', 'E'] },
  ]);
  const ids = window.getElevGroupDims().map(d => d.id).join(',');
  if (ids !== 'g1,g4') throw new Error('left ' + ids);
});

check('EXACT BUG: clicking a group dim number selects it and lets go of the frames', () => {
  fx.setup([{ id: 'g1', frameLetters: ['A', 'B', 'C'] }]);
  fx.select(['A', 'B', 'C']);
  window.renderGroupDims();
  const lbl = doc.querySelector('#group-dim-layer [data-group-dim="g1"]');
  if (!lbl) throw new Error('no clickable number');
  lbl.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }));
  doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  if (fx.sel !== 'g1') throw new Error('not selected: ' + fx.sel);
  if (fx.elev.frames.some(f => f.selected)) throw new Error('frames still selected');
});

check('EXACT BUG: Delete removes the selected group dim and NOT its frames', () => {
  showElev();
  fx.setup([{ id: 'g1', frameLetters: ['A', 'B', 'C'] }, { id: 'g2', frameLetters: ['D', 'E'] }]);
  fx.sel = 'g1'; fx.elev.frames[0].selected = true;
  key('Delete');
  const ids = fx.elev.groupDims.map(d => d.id).join(',');
  if (ids !== 'g2') throw new Error('left ' + ids);
  if (fx.elev.frames.filter(f => f.active !== false).length !== 5) throw new Error('a frame went with it');
  if (fx.sel !== null) throw new Error('selection not cleared');
});

check('Escape lets go of a selected group dim', () => {
  showElev();
  fx.setup([{ id: 'g1', frameLetters: ['A', 'B'] }]);
  fx.sel = 'g1';
  key('Escape');
  if (fx.sel !== null) throw new Error('still selected');
});

check('a selected group dim shows its delete cross, and the cross survives the wall press', () => {
  fx.setup([{ id: 'g1', frameLetters: ['A', 'B'] }]);
  fx.sel = 'g1';
  window.renderGroupDims();
  const del = doc.querySelector('#group-dim-layer .group-dim-delete');
  if (!del || parseFloat(del.style.opacity) < 0.5) throw new Error('cross hidden while selected');
  if (del.getAttribute('data-group-dim') !== 'g1') throw new Error('cross not marked, the deselect redraw eats the click');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
