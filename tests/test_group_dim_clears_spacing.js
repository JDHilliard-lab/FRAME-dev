// 19.15: A GROUP DIMENSION STEPS OUT PAST THE SPACING DIMS.
//
// Reported: once spacing dims placed themselves just outside the frames, the group's
// overall width line (26px above the box) ran through the row of spacing numbers above
// it, and its height line through a spacing number on the left. The overall is the
// outer string, so it now clears every spacing dim drawn beside the box, measured from
// the DOM (_groupDimObstacles), then a drag adds to that.
// jsdom has no layout, so obstacles are faked through _groupDimObstacles.
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
  '  setup: function () {',
  '    const F = (letter, x) => ({ letter, x, y: 40, w: 20, h: 30, active: true, dimTo: [] });',
  '    elevations = [{ id: "w1", name: "W", wallW: 156, wallH: 108, frames: [F("A", 40), F("B", 70)], groupDims: [{ id: "g1", frameLetters: ["A", "B"] }] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames; elevScale = 5;',
  '    document.getElementById("wallH").value = 108;',
  '    dimVisibility.groupBox = true;',
  '  },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

// Box in layer px at elevScale 5: left 200, right 450, top (108-70)*5 = 190, bottom 340.
const BOX = { l: 200, r: 450, t: 190, b: 340 };
const lineTop = () => {
  const lbl = doc.querySelector('#group-dim-layer [data-group-dim="g1"]');
  return parseFloat(lbl.style.top);
};
const lineLeft = () => {
  const ls = doc.querySelectorAll('#group-dim-layer [data-group-dim="g1"]');
  return parseFloat(ls[1].style.left);
};

check('with nothing beside the box the lines sit where they always did (26px out)', () => {
  fx.setup(); window.renderGroupDims();
  if (lineTop() !== BOX.t - 26) throw new Error('width line at ' + lineTop());
  if (lineLeft() !== BOX.l - 26) throw new Error('height line at ' + lineLeft());
});

check('EXACT BUG: a spacing number above the box pushes the width line above it', () => {
  fx.setup();
  const real = window._groupDimObstacles;
  window._groupDimObstacles = () => [{ ax: '', l: 280, r: 340, t: 160, b: 176 }];
  try { window.renderGroupDims(); } finally { window._groupDimObstacles = real; }
  const y = lineTop();
  if (!(y + 13 / 2 <= 160 - 3)) throw new Error('width line at ' + y + ' still on the number (top 160)');
});

check('EXACT BUG: a spacing number left of the box pushes the height line left of it', () => {
  fx.setup();
  const real = window._groupDimObstacles;
  window._groupDimObstacles = () => [{ ax: '', l: 150, r: 196, t: 250, b: 266 }];
  try { window.renderGroupDims(); } finally { window._groupDimObstacles = real; }
  if (!(lineLeft() + 13 / 2 <= 150 - 3)) throw new Error('height line at ' + lineLeft());
});

check('lines that cross the group line, or sit off its span, are not stepped over', () => {
  const ob = [
    { ax: 'v', l: 300, r: 301, t: 0, b: 190 },      // an edge gap running to the ceiling
    { ax: '', l: 600, r: 660, t: 150, b: 166 },     // a number above, but beyond the box
    { ax: '', l: 280, r: 340, t: 200, b: 216 },     // a number inside the box
  ];
  if (window._groupDimClearTop(ob, BOX.l, BOX.r, BOX.t, BOX.t - 26, 13) !== BOX.t - 26) throw new Error('moved for a crossing / off-span / inside obstacle');
  if (window._groupDimClearLeft([{ ax: 'h', l: 0, r: 199, t: 250, b: 251 }], BOX.t, BOX.b, BOX.l, BOX.l - 26, 13) !== BOX.l - 26) throw new Error('height line moved for a crossing line');
});

check('the obstacles come from the spacing layer only, never the edge gaps', () => {
  const i = APP.indexOf('function _groupDimObstacles');
  const body = APP.slice(i, APP.indexOf('function _groupDimClearTop', i));
  if (body.indexOf("'dim-layer'") < 0) throw new Error('does not read the spacing layer');
  if (body.indexOf('floor-ceiling-layer') >= 0) throw new Error('reads the edge-gap layer');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
