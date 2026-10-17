// 19.15: SPACING DIMS PLACE THEMSELVES CLEAR OF THE FRAMES, AND A NUMBER PULLED OUT OF
// THE GROUP SITS OUTSIDE ITS LINE.
//
// Reported with two screenshots. Auto-spacing dropped every number in its gap; in mm a
// 4"(102mm) number is three times a 4" gap, so it lifted onto the frames either side.
// Dragging the lines above and below the group by hand fixed the top ones, but the
// bottom numbers stayed ABOVE their line (the side pinned at the drag start), sitting
// over the dashed extension lines. A tight stack (2" gaps) put its numbers on the frames.
//
// Now an untouched spacing dim is placed by the drawing (_spacingAutoPlace) and a line
// whose extension lines all run one way puts its number on the other side
// (data-lift-force), whatever the pin.
// jsdom measures nothing, so the number's size is faked through _dimLabelPx.
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
  '  setup: function (frames, offs) {',
  '    elevations = [{ id: "w1", name: "W", wallW: 156, wallH: 108, frames: frames, dimOffsets: offs || {} }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames; elevUnit = "in";',
  '    elevResolvedWallW = 156; elevResolvedWallH = 108; elevScale = 5;',
  '    annotationStyle.dimEnds = "tick";',
  '  },',
  '  get elev() { return elevations[0]; },',
  '  get auto() { return _dimAutoOff; },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
const doc = window.document;

// The screenshot's wall, in inches (y up): a small frame, a tall one, a stack of three
// 2" apart, a blue one, a small one on the right. Every horizontal gap is 4".
const F = (letter, x, y, w, h) => ({ letter, x, y, w, h, active: true, dimTo: [] });
const group = () => [
  F('A', 20, 40, 20, 26),
  F('B', 44, 24, 30, 46),
  F('C', 78, 24, 18, 12),
  F('D', 78, 38, 18, 13),
  F('E', 78, 53, 18, 13),
  F('F', 100, 30, 20, 30),
  F('G', 124, 40, 20, 16),
];
// A dual-unit number: 70px wide, 14px tall. At 5px/in that is 14" by 2.8".
window._dimLabelPx = () => ({ w: 70, h: 14 });
const placed = [];
const realPlace = window._spacingAutoPlace;
window._spacingAutoPlace = (o) => { const r = realPlace(o); placed.push({ o, r }); return r; };

const draw = (offs) => {
  fx.setup(group(), offs);
  window._autoSpacePairs(window.elevFrames || fx.elev.frames);
  placed.length = 0;
  window.drawElevTargetedSpacing();
};
const hit = (rect, frames) => frames.filter(f => window._dimOverlapArea(rect, { x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h }) > 0);

check('the wrapper is live and dims are drawn (else the rest proves nothing)', () => {
  draw();
  if (!placed.length) throw new Error('auto placement never ran');
  if (!doc.querySelectorAll('#dim-layer .arch-dim').length) throw new Error('no dims drawn');
});

check('EXACT BUG: every horizontal gap number lands clear of every frame', () => {
  draw();
  const hs = placed.filter(p => p.o.type === 'h');
  if (hs.length < 4) throw new Error('expected the four 4" gaps, got ' + hs.length);
  hs.forEach(p => {
    if (!p.r) throw new Error('a 70px number in a 20px gap was left in the gap');
    const h = hit(p.r.rect, group());
    if (h.length) throw new Error('number for gap ' + p.o.lo + '..' + p.o.hi + ' still on frame ' + h.map(f => f.letter).join(','));
    if (p.r.rect.y1 > 108 || p.r.rect.y0 < 0) throw new Error('pushed off the wall');
  });
});

check('a line moved out of the group carries its side: above it the number goes up, below it down', () => {
  draw();
  placed.filter(p => p.o.type === 'h' && p.r).forEach(p => {
    const P = p.o.base + p.r.off;
    const top = Math.max(p.o.band1.hi, p.o.band2.hi), bot = Math.min(p.o.band1.lo, p.o.band2.lo);
    if (P > top && p.r.side !== 1) throw new Error('line above the frames, number below it');
    if (P < bot && p.r.side !== -1) throw new Error('line below the frames, number above it');
  });
});

check('EXACT BUG: the tight stack keeps its numbers inside the column, over the 2" gaps', () => {
  draw();
  const vs = placed.filter(p => p.o.type === 'v' && p.r);
  if (vs.length < 2) throw new Error('expected the two stack gaps, got ' + vs.length);
  vs.forEach(p => {
    if (p.r.rect.x0 < 78 - 1e-6 || p.r.rect.x1 > 96 + 1e-6) throw new Error('number left the column: ' + p.r.rect.x0.toFixed(2) + '..' + p.r.rect.x1.toFixed(2));
    // It is taller than the gap, so it covers a sliver of frame; never the blue or the tall one.
    const h = hit(p.r.rect, group()).map(f => f.letter).filter(l => l !== 'C' && l !== 'D' && l !== 'E');
    if (h.length) throw new Error('stack number on ' + h.join(','));
  });
});

check('the drawn line uses the placement, getDimOffset reports it, and nothing is stored', () => {
  draw();
  const id = 'spacing-h-A-B';
  const a = fx.auto.m[id];
  if (typeof a !== 'number' || Math.abs(a) < 1) throw new Error('A-B not moved: ' + a);
  if (Math.abs(window.getDimOffset(id) - a) > 1e-9) throw new Error('getDimOffset does not see the auto line');
  if (Object.keys(fx.elev.dimOffsets).length) throw new Error('auto placement wrote into dimOffsets: ' + JSON.stringify(fx.elev.dimOffsets));
  const dim = Array.prototype.find.call(doc.querySelectorAll('#dim-layer .arch-dim'), d => Math.abs(parseFloat(d.getAttribute('data-line-off')) - a) < 1e-9);
  if (!dim) throw new Error('no dim drawn at the auto offset');
  if (dim.getAttribute('data-lift-auto') !== (a > 0 ? '1' : '-1')) throw new Error('side not handed to the lift: ' + dim.getAttribute('data-lift-auto'));
});

check('a dim the designer dragged is left exactly where they put it', () => {
  draw({ 'spacing-h-A-B': 0 });
  if ('spacing-h-A-B' in fx.auto.m) throw new Error('auto placement overrode a stored offset');
  if (window.getDimOffset('spacing-h-A-B') !== 0) throw new Error('stored 0 not honoured');
});

check('a number that fits its gap is not moved', () => {
  window._dimLabelPx = () => ({ w: 2, h: 14 });   // 2 + 2 x 9 end room = 20px, the 4" gap
  try { draw(); } finally { window._dimLabelPx = () => ({ w: 70, h: 14 }); }
  const h = placed.filter(p => p.o.type === 'h');
  if (!h.length || h.some(p => p.r)) throw new Error('moved a number that fits');
});

check('nothing measurable (jsdom, detached): nothing moves', () => {
  if (realPlace({ type: 'h', lo: 0, hi: 4, base: 10, band1: null, band2: null, lbl: { w: 0, h: 0 }, obstacles: [], wallW: 100, wallH: 100 }) !== null) throw new Error('placed blind');
});

// The side rule, on the lift itself.
const size = (el, w, h) => {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => h });
};
const makeDim = (attrs) => {
  const dim = doc.createElement('div');
  dim.innerHTML = '<div class="dim-line-segment"></div><span class="arch-label-new">4"(102mm)</span><div class="dim-line-segment"></div>';
  Object.keys(attrs).forEach(k => dim.setAttribute(k, attrs[k]));
  doc.body.appendChild(dim);
  size(dim, 20, 2);
  size(dim.querySelector('.arch-label-new'), 70, 14);
  window._autoLiftDimLabel(dim, 'h');
  return dim.querySelector('.arch-label-new').getAttribute('data-lift-side');
};

check('EXACT BUG: a line dragged below the group puts its number below, even pinned above', () => {
  const s = makeDim({ 'data-line-off': '-12', 'data-lift-pin': '1', 'data-lift-force': '-1' });
  if (s !== 'below') throw new Error('drawn ' + s);
});

check('without a force the pin still wins (18.58 unchanged)', () => {
  const s = makeDim({ 'data-line-off': '-2', 'data-lift-pin': '1' });
  if (s !== 'above') throw new Error('drawn ' + s);
});

check('the auto side beats the sign but not a pin', () => {
  if (makeDim({ 'data-line-off': '3', 'data-lift-auto': '-1' }) !== 'below') throw new Error('auto side ignored');
  if (makeDim({ 'data-line-off': '3', 'data-lift-auto': '-1', 'data-lift-pin': '1' }) !== 'above') throw new Error('auto side beat a pin');
});

check('createElevArchSpacing forces the side from its leaders', () => {
  fx.setup(group());
  const layer = doc.getElementById('dim-layer'); layer.innerHTML = '';
  // A-B gap, line pulled 30" down: below both frames, leaders run up.
  window.createElevArchSpacing(40, 10, 44, 10, 'h', layer, '4"', 'tst-dn', -30, { band1: { lo: 40, hi: 66 }, band2: { lo: 24, hi: 70 } });
  window.createElevArchSpacing(40, 75, 44, 75, 'h', layer, '4"', 'tst-up', 30, { band1: { lo: 40, hi: 66 }, band2: { lo: 24, hi: 70 } });
  window.createElevArchSpacing(40, 50, 44, 50, 'h', layer, '4"', 'tst-in', 2, { band1: { lo: 40, hi: 66 }, band2: { lo: 24, hi: 70 } });
  const dims = layer.querySelectorAll('.arch-dim');
  const f = (i) => dims[i].getAttribute('data-lift-force');
  if (f(0) !== '-1' || f(1) !== '1' || f(2) !== null) throw new Error('forces: ' + f(0) + ' / ' + f(1) + ' / ' + f(2));
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
