// FRAME DASHBOARD (17.86): three asks rebuilt after the lost week.
//  1. "you did not like how it floats over the CSV area so you made it another
//     column to the left of the right panel that you could scale up and down":
//     the preview-wrapper is MOVED into #dashPreviewCol, a real flex column.
//  2. "we added color to the csv rows so we would know what frames where together in a
//     placement": every row of one placement gets one colour on its grip.
//  3. "a cool system to prompt designers if they used the same image in another
//     placement": a question after the image lands, and a count badge in the table.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

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
  '  mode: applyDashViewMode, initMode: initDashViewMode, render: renderDashTable,',
  '  colors: _placementColorMap, same: _sameImageElsewhere, sameMap: _sameImageMap,',
  '  apply: applyArtworkToRowIndex, undo: undo, push: pushHistory,',
  '  resetHistory: function () { undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; },',
  '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;

check('EXACT ASK: the preview becomes its own column between the table and the form', () => {
  fx.mode(true);
  const col = doc.getElementById('dashPreviewCol');
  if (!col) throw new Error('no column');
  if (!col.querySelector('.preview-wrapper')) throw new Error('the preview did not move into the column');
  const kids = Array.from(doc.getElementById('view-dashboard').children);
  const iL = kids.indexOf(doc.querySelector('.dash-left-pane')), iC = kids.indexOf(col), iR = kids.indexOf(doc.getElementById('dashRightPane'));
  if (!(iL < iC && iC < iR)) throw new Error('column is not between the table and the form');
  if (doc.querySelectorAll('#dash-frame-visual').length !== 1) throw new Error('the preview was copied, not moved');
});

check('switching back returns the preview to the top of the form panel', () => {
  fx.mode(false);
  if (doc.getElementById('dashPreviewCol')) throw new Error('empty column left behind');
  const right = doc.getElementById('dashRightPane');
  if (right.firstElementChild !== doc.querySelector('.preview-wrapper')) throw new Error('preview not back at the top of the form');
});

check('the column is the default on a machine with no saved choice', () => {
  window.localStorage.removeItem('dashViewMode');
  fx.initMode();
  if (!doc.getElementById('dashPreviewCol')) throw new Error('default is not the column');
  fx.mode(false);
  window.localStorage.setItem('dashViewMode', '1');
  fx.initMode();
  if (doc.getElementById('dashPreviewCol')) throw new Error('a saved compact choice was overridden');
});

check('the column no longer floats over the table', () => {
  const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  if (CSS.indexOf('body.dash-view-2 #view-dashboard .dash-right-pane .preview-wrapper {') >= 0) throw new Error('the fixed floating rule is still there');
});

const rows = () => [
  { id: 'ART.1A', imageCode: 'lake', location: 'Lobby', extW: 20, extH: 20 },
  { id: 'ART.1B', imageCode: 'lake', location: 'Lobby', extW: 20, extH: 20 },
  { id: 'ART.2', imageCode: 'dunes', location: 'Hall', extW: 20, extH: 20 },
  { id: 'ART.3', imageCode: 'TBD', location: 'Bar', extW: 20, extH: 20 },
];

check('EXACT ASK: rows of one placement share a colour, the next placement gets another', () => {
  fx.rows = rows();
  const c = fx.colors();
  if (!c['ART.1'] || !c['ART.2']) throw new Error('missing placement colours');
  if (c['ART.1'] === c['ART.2']) throw new Error('two neighbouring placements got one colour');
  fx.render();
  const trs = doc.querySelectorAll('#rfiBody tr');
  const v = (i) => trs[i].style.getPropertyValue('--plc');
  if (!v(0) || v(0) !== v(1)) throw new Error('ART.1A and ART.1B are not painted alike');
  if (v(2) === v(0)) throw new Error('ART.2 painted like ART.1');
});

check('same image inside ONE placement is normal (a diptych from one picture), not flagged', () => {
  fx.rows = rows();
  if (fx.same(0).length) throw new Error('ART.1A flagged against its own pair');
});

check('same image in ANOTHER placement is found, and TBD never counts as an image', () => {
  fx.rows = rows();
  fx.rows[2].imageCode = 'lake';
  fx.rows[3].imageCode = 'TBD';
  if (fx.same(2).map(r => r.id).join() !== 'ART.1A,ART.1B') throw new Error('got ' + fx.same(2).map(r => r.id).join());
  fx.rows[0].imageCode = 'TBD'; fx.rows[1].imageCode = 'TBD'; fx.rows[2].imageCode = 'tbd';
  if (fx.same(3).length) throw new Error('TBD matched TBD');
});

check('the table marks a reused image with a count', () => {
  fx.rows = rows();
  fx.rows[2].imageCode = 'lake';
  fx.render();
  const b = doc.querySelectorAll('#rfiBody tr')[2].querySelector('.dash-same-img');
  if (!b) throw new Error('no badge on ART.2');
  if (b.textContent !== 'x3') throw new Error('badge reads ' + b.textContent);
  if (doc.querySelectorAll('#rfiBody tr')[3].querySelector('.dash-same-img')) throw new Error('ART.3 badged for nothing');
});

check('EXACT ASK: dropping an image already used elsewhere asks, and Undo takes it back', () => {
  fx.rows = rows();
  fx.resetHistory(); fx.push();
  const url = 'data:image/png;base64,' + 'A'.repeat(200);
  fx.rows[0].artworkUrl = url;
  let asked = null;
  window.showConfirmModal = function (t, b, y, n, onYes, onNo) { asked = t; if (onNo) onNo(); };
  fx.apply(2, url, 'other-file', 10, 10);
  if (asked !== 'Image already used') throw new Error('did not ask (' + asked + ')');
  if (fx.rows[2].artworkUrl === url) throw new Error('Undo did not take the image back');
});

check('a fresh image nobody else uses asks nothing', () => {
  fx.rows = rows();
  let asked = null;
  window.showConfirmModal = function (t) { asked = t; };
  fx.apply(2, 'data:image/png;base64,' + 'B'.repeat(200), 'unique-name', 10, 10);
  if (asked) throw new Error('asked about a unique image');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
