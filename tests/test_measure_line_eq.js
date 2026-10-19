// 19.36: A MEASURE LINE CAN PRINT "EQ" INSTEAD OF ITS NUMBER.
//
// Asked for on the Ford SLC boardroom wall: a frame centred between two doors, drawn
// with two measure lines (74.5" and 74"). The InDesign elevation reads EQ / EQ there,
// because the point is "centre it", not the quarter inch. The deck-wide EQ spacing
// switch only reached spacing and edge-gap dims; measure lines always printed numbers.
// Now each line carries its own `eq`, a double-click on the number toggles it, and
// lines that read the same (within ELEV_EQ_HINT_TOL_IN) show a * that marks the set.
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
  '_autosaveToldUser = true; scheduleAutosave = () => {};',
  'window.__fx = {',
  '  pushes: 0,',
  '  setup: function () {',
  '    elevUnit = "in"; dashUnit = "in";',
  '    const free = (x, y) => ({ ref: "free", x: x, y: y });',
  '    elevations = [{ id: "w1", name: "Boardroom", wallW: 277, wallH: 110, frames: [], personPos: { x: -60 }, customLines: [',
  '      { id: "L1", type: "h", a: free(10, 80), b: free(84.5, 80) },',   // 74.5
  '      { id: "L2", type: "h", a: free(141, 80), b: free(215, 80) },',   // 74, within 1in of L1
  '      { id: "L3", type: "h", a: free(10, 20), b: free(40, 20) },',     // 30, matches nothing
  '      { id: "L4", type: "v", a: free(100, 0), b: free(100, 74.5) },',  // 74.5 but VERTICAL
  '    ] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames; elevScale = 4;',
  '    dimVisibility.customLines = true; selectedCustomLine = null; _dimLastTap = null;',
  '    pushHistory = () => { window.__fx.pushes++; };',
  '    drawElevAll = () => { renderCustomLines(); };',
  '    renderCustomLines();',
  '  },',
  '  line: function (id) { return elevations[0].customLines.find(l => l.id === id); },',
  '  label: function (id) { const d = document.querySelector("[data-custom-line=\\"" + id + "\\"] .arch-label-new"); if (!d) return null;',
  '    let t = ""; d.childNodes.forEach(n => { if (n.nodeType === 3) t += n.textContent; }); return t.trim(); },',
  '  star: function (id) { return document.querySelector("[data-custom-line=\\"" + id + "\\"] .dim-eq-hint"); },',
  '  age: function (ms) { _dimLastTap.t -= ms; },',
  '  clone: function () { return _cloneData(elevations); },',
  '  tapMs: function () { return DIM_DOUBLE_TAP_MS; },',
  '  press: function (el) { el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true })); },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const lbl = (id) => document.querySelector('[data-custom-line="' + id + '"] .arch-label-new');

check('untouched lines print their numbers', () => {
  fx.setup();
  if (fx.label('L1') !== window.eval('elevFmtU(74.5)')) throw new Error('L1 reads ' + fx.label('L1'));
  if (fx.label('L2') !== window.eval('elevFmtU(74)')) throw new Error('L2 reads ' + fx.label('L2'));
});

check('lines that read the same get the * offer; the others do not', () => {
  fx.setup();
  if (!fx.star('L1') || !fx.star('L2')) throw new Error('74.5 and 74 should both offer EQ');
  if (fx.star('L3')) throw new Error('a 30in line matched nothing and still offers EQ');
  if (fx.star('L4')) throw new Error('a VERTICAL line matched horizontal ones');
});

check('the * is editor-only: never exported, never in the printed text', () => {
  fx.setup();
  const s = fx.star('L1');
  if (s.getAttribute('data-export-skip') !== '1') throw new Error('no data-export-skip');
  if (s.getAttribute('data-html2canvas-ignore') !== 'true') throw new Error('PNG export would draw it');
  // The SVG exporter reads only the label's own text nodes.
  if (fx.label('L1').indexOf('*') >= 0) throw new Error('the * is part of the label text');
});

check('clicking the * marks the whole matching set EQ in one undo step', () => {
  fx.setup(); fx.pushes = 0;
  fx.press(fx.star('L1'));
  if (!fx.line('L1').eq || !fx.line('L2').eq) throw new Error('not both marked');
  if (fx.line('L3').eq || fx.line('L4').eq) throw new Error('marked a line that did not match');
  if (fx.pushes !== 1) throw new Error(fx.pushes + ' history entries');
  if (fx.label('L1') !== 'EQ' || fx.label('L2') !== 'EQ') throw new Error('labels read ' + fx.label('L1') + ' / ' + fx.label('L2'));
  if (fx.star('L1') || fx.star('L2')) throw new Error('the offer stays up after it was taken');
});

check('ONE press only selects; a second press on the same number toggles EQ', () => {
  fx.setup();
  fx.press(lbl('L3'));
  if (fx.line('L3').eq) throw new Error('a single press toggled EQ');
  fx.press(lbl('L3'));
  if (!fx.line('L3').eq) throw new Error('a double press did not toggle EQ on');
  if (fx.label('L3') !== 'EQ') throw new Error('label reads ' + fx.label('L3'));
  fx.press(lbl('L3')); fx.press(lbl('L3'));
  if (fx.line('L3').eq) throw new Error('a second double press did not toggle it back');
  if ('eq' in fx.line('L3')) throw new Error('off leaves an eq field behind instead of deleting it');
});

check('presses on two DIFFERENT numbers are not a double-click', () => {
  fx.setup();
  fx.press(lbl('L1')); fx.press(lbl('L3'));
  if (fx.line('L1').eq || fx.line('L3').eq) throw new Error('two numbers made a double-click');
});

check('a slow second press is not a double-click', () => {
  fx.setup();
  fx.press(lbl('L3'));
  fx.age(fx.tapMs() + 50);
  fx.press(lbl('L3'));
  if (fx.line('L3').eq) throw new Error('a press after the window still toggled');
});

check('EQ survives the project round trip (it is on the line, not in a session flag)', () => {
  fx.setup();
  fx.press(fx.star('L1'));
  const copy = fx.clone();
  if (!copy[0].customLines.find(l => l.id === 'L1').eq) throw new Error('eq lost in the clone');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
process.exit(failed.length ? 1 : 0);
