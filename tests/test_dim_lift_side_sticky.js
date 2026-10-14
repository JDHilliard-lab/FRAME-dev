// 18.58: A LIFTED DIMENSION NUMBER STAYS ON ITS SIDE WHILE YOU DRAG ITS LINE.
//
// Reported: a spacing dim tight between two frames. Its number does not fit the gap, so
// _autoLiftDimLabel hangs it beside the line, on the side given by the SIGN of the line's
// offset. Dragging the line to move the number off a frame carried the offset across
// zero, and the number jumped a whole label-width to the other side, onto the neighbour.
// Now a drag of the line pins the side it was on (elev.dimLiftSide for spacing dims,
// line.lblSide for measure lines), so the number moves with the drag.
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
  '  setElevs: function (e) { elevations = e; currentElevIndex = 0; },',
  '  get elev() { return elevations[0]; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

// A vertical dim 30px tall whose number is 70px wide by 18px tall: does not fit, lifts.
const size = (el, w, h) => {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => h });
};
const makeDim = (lineOff, pin) => {
  const dim = doc.createElement('div');
  dim.innerHTML = '<div class="dim-line-segment-v"></div><span class="arch-label-new">3"(76mm)</span><div class="dim-line-segment-v"></div>';
  dim.setAttribute('data-line-off', String(lineOff));
  if (pin) dim.setAttribute('data-lift-pin', String(pin));
  doc.body.appendChild(dim);
  size(dim, 2, 12);
  size(dim.querySelector('.arch-label-new'), 70, 18);
  return dim;
};
const sideOf = (dim) => dim.querySelector('.arch-label-new').getAttribute('data-lift-side');

check('the number does lift (else the rest proves nothing)', () => {
  const d = makeDim(2);
  if (!window._autoLiftDimLabel(d, 'v')) throw new Error('did not lift');
});

check('with no pin, the offset sign still chooses the side (unchanged)', () => {
  const r = makeDim(2); window._autoLiftDimLabel(r, 'v');
  const l = makeDim(-2); window._autoLiftDimLabel(l, 'v');
  if (sideOf(r) !== 'right' || sideOf(l) !== 'left') throw new Error('sides: ' + sideOf(r) + ' / ' + sideOf(l));
});

check('EXACT BUG: a pinned number stays on its side when the line crosses its start', () => {
  const d = makeDim(-2, 1); window._autoLiftDimLabel(d, 'v');
  if (sideOf(d) !== 'right') throw new Error('pinned right but drawn ' + sideOf(d));
  const h = makeDim(3, -1); window._autoLiftDimLabel(h, 'h');
  if (sideOf(h) !== 'below') throw new Error('horizontal pinned below but drawn ' + sideOf(h));
});

check('EXACT BUG: starting a drag of the line pins the side the number is on now', () => {
  const d = makeDim(-2);
  window._autoLiftDimLabel(d, 'v');
  if (sideOf(d) !== 'left') throw new Error('setup: expected left');
  let pinned = null;
  window.buildDimControls({
    dim: d, type: 'v', id: 'sp-x', spanPx: 30,
    isSelected: () => true, select: () => {},
    getLabelOff: () => 0, setLabelOff: () => {},
    getLineOff: () => -2, setLineOff: () => {},
    getLiftSide: () => 0, setLiftSide: (s) => { pinned = s; },
    onDelete: () => {},
  });
  // On a vertical line, left/right arrows move the LINE.
  const arrows = d.querySelectorAll('.dim-arrow');
  const right = Array.prototype.find.call(arrows, a => (a.style.cursor || '') === 'ew-resize');
  if (!right) throw new Error('no line-moving arrow');
  right.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
  doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  if (pinned !== -1) throw new Error('drag start pinned ' + pinned + ', want -1 (left)');
});

check('moving the NUMBER along its line does not pin anything', () => {
  const d = makeDim(-2);
  window._autoLiftDimLabel(d, 'v');
  let pinned = null;
  window.buildDimControls({
    dim: d, type: 'v', id: 'sp-y', spanPx: 30,
    isSelected: () => true, select: () => {},
    getLabelOff: () => 0, setLabelOff: () => {},
    getLineOff: () => -2, setLineOff: () => {},
    getLiftSide: () => 0, setLiftSide: (s) => { pinned = s; },
    onDelete: () => {},
  });
  const along = Array.prototype.find.call(d.querySelectorAll('.dim-arrow'), a => (a.style.cursor || '') === 'ns-resize');
  along.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
  doc.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  if (pinned !== null) throw new Error('an along-the-line move pinned the side');
});

check('buildDimControls carries a stored pin onto the dim for the lift to read', () => {
  const d = makeDim(-2);
  window.buildDimControls({
    dim: d, type: 'v', id: 'sp-z', spanPx: 30,
    isSelected: () => false, select: () => {},
    getLabelOff: () => 0, setLabelOff: () => {},
    getLineOff: () => -2, setLineOff: () => {},
    getLiftSide: () => 1, setLiftSide: () => {},
    onDelete: () => {},
  });
  if (d.getAttribute('data-lift-pin') !== '1') throw new Error('pin not on the dim: ' + d.getAttribute('data-lift-pin'));
});

check('spacing-dim pins live in their own map, never in dimOffsets (snap targets), and reset clears them', () => {
  fx.setElevs([{ id: 'w1', name: 'W', wallW: 144, wallH: 108, frames: [], dimOffsets: { a: 6 },
    customLines: [{ id: 'cl1', lblSide: 1 }] }]);
  window.setDimLiftSide('a', -1);
  if (window.getDimLiftSide('a') !== -1) throw new Error('side not stored');
  if (Object.keys(fx.elev.dimOffsets).length !== 1) throw new Error('side leaked into dimOffsets');
  window.setDimLiftSide('a', 7);
  if (window.getDimLiftSide('a') !== -1) throw new Error('a junk side was accepted');
  window.drawElevAll = () => {}; window.pushHistory = () => {};
  window.resetDimOffsets();
  if (window.getDimLiftSide('a') !== 0) throw new Error('reset left the pin');
  if (fx.elev.customLines[0].lblSide !== undefined) throw new Error('reset left a measure-line pin');
});

check('both dim types with lifted numbers pass a pin store', () => {
  const sp = APP.indexOf('setLineOff: (v) => setDimOffset(dimId, snapDimOffset(v, dimId).value),');
  if (sp < 0 || APP.slice(sp, sp + 200).indexOf('getLiftSide: () => getDimLiftSide(dimId)') < 0) throw new Error('spacing dims do not pin');
  const cl = APP.indexOf('setLineOff: (v) => { L.off = v * toStore; },');
  if (cl < 0 || APP.slice(cl, cl + 200).indexOf('getLiftSide: () => L.lblSide') < 0) throw new Error('measure lines do not pin');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
