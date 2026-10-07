// FRAME SETS FROM THE FLOORPLAN (17.91): "Frames ... drop down menu where you would select
// single, diptych, Triptych, Quad, 5 Sets, 7 Set and these sets once selected would be
// mocked up in elevations as well ... for the 5 and 7 sets create an interesting salon
// hang with different sizes ... at hanging height and center on the wall as group, space
// them apart with 3 inches ... some with mats, some without mat, or float deckled edge
// paper. Maybe we come up with a library of different salon hangs."
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
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
  '_dsRefresh = function () {}; _dsRenderCenter = function () {}; _dsRenderRail = function () {}; _dsRenderTools = function () {};',
  '_toast = function () { return null; };',
  'window.__fx = {',
  '  get rows() { return dashProjectData; }, set rows(v) { dashProjectData = v; },',
  '  get elevs() { return elevations; }, set elevs(v) { elevations = v; },',
  '  get ed() { return editorialContent; }, set ed(v) { editorialContent = v; },',
  '  defaults: _editorialDefaults, add: _fpAddCodes, apply: _fpApplyFrameSet, presets: SALON_PRESETS, layout: _frameSetLayout,',
  '  hang: function () { return elevHangIn; }, panel: _fpPanelItems, fresh: _projectIsFresh, chooser: openStartChooser,',
  '  get armLine() { return _fpLineArmId; }, wallMode: _fpWallPanelsOn, styles: FP_LINE_STYLES, GAP: SET_GAP_IN,',
  '  goFp: function (fn) { _dsGoFloorplanItems = fn; },',
  '};',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;
window.showConfirmModal = function (t, b, y, n, onYes) { if (onYes) onYes(); };
const fresh = () => { fx.ed = fx.defaults(); fx.rows = []; fx.elevs = [{ id: 'w0', name: 'Elevation 1', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }]; };

// Two frames are NEIGHBOURS when they overlap on one axis; their gap on the other axis
// must then be exactly the set gap.
const gaps = (fr) => {
  const out = [];
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
    const a = fr[i], b = fr[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0 && oy > 0) out.push({ overlap: true, i, j });
    else if (oy > 0) out.push({ gap: Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), i, j, axis: 'x' });
    else if (ox > 0) out.push({ gap: Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h), i, j, axis: 'y' });
  }
  return out;
};

check('EXACT ASK: a salon library for 5 and 7, every neighbour exactly 3in apart, nothing overlapping', () => {
  const five = fx.presets.filter(p => p.n === 5), seven = fx.presets.filter(p => p.n === 7);
  if (five.length < 2 || seven.length < 2) throw new Error('library: ' + five.length + ' x5, ' + seven.length + ' x7');
  fx.presets.forEach(p => {
    if (p.frames.length !== p.n) throw new Error(p.key + ' has ' + p.frames.length + ' frames');
    gaps(p.frames).forEach(g => {
      if (g.overlap) throw new Error(p.key + ': frames ' + g.i + ' and ' + g.j + ' overlap');
      // Neighbours sitting in the same column/row: the near ones must be exactly 3".
      if (g.gap < fx.GAP - 1e-9) throw new Error(p.key + ': ' + g.i + '/' + g.j + ' only ' + g.gap + 'in apart');
    });
    const nearest = p.frames.map((f, i) => Math.min.apply(null, gaps(p.frames).filter(g => (g.i === i || g.j === i) && g.gap != null).map(g => g.gap)));
    nearest.forEach((d, i) => { if (Math.abs(d - fx.GAP) > 1e-9) throw new Error(p.key + ': frame ' + i + ' nearest neighbour is ' + d + 'in, want 3'); });
  });
});

check('EXACT ASK: each salon mixes mats, no mat, and float on deckled paper, in different sizes', () => {
  fx.presets.forEach(p => {
    const st = new Set(p.frames.map(f => f.s));
    ['mat', 'plain', 'float'].forEach(k => { if (!st.has(k)) throw new Error(p.key + ' has no ' + k + ' piece'); });
    const sizes = new Set(p.frames.map(f => f.w + 'x' + f.h));
    if (sizes.size < 4) throw new Error(p.key + ' is too uniform: ' + sizes.size + ' sizes');
  });
});

check('EXACT ASK: Triptych makes ART.nA-C and hangs them on a wall, centred, at hang height, 3in apart', () => {
  fresh();
  fx.add('framed', 1); fx.add('framed', 1);   // ART.1, ART.2
  fx.apply('ART.2', 3, '');
  const ids = fx.rows.map(r => r.id).join();
  if (ids !== 'ART.1,ART.2A,ART.2B,ART.2C') throw new Error('rows: ' + ids);
  const wall = fx.elevs.find(e => (e.frames || []).some(f => f.id === 'ART.2A'));
  if (!wall) throw new Error('not mocked up on a wall');
  const fr = wall.frames;
  if (fr.length !== 3) throw new Error(fr.length + ' frames on the wall');
  const x0 = Math.min.apply(null, fr.map(f => f.x)), x1 = Math.max.apply(null, fr.map(f => f.x + f.w));
  const y0 = Math.min.apply(null, fr.map(f => f.y)), y1 = Math.max.apply(null, fr.map(f => f.y + f.h));
  if (Math.abs((x0 + x1) / 2 - wall.wallW / 2) > 0.01) throw new Error('not centred on the wall');
  if (Math.abs((y0 + y1) / 2 - fx.hang()) > 0.01) throw new Error('group centre ' + ((y0 + y1) / 2) + ', hang height ' + fx.hang());
  fr.forEach((f, i) => {
    const d = Math.min.apply(null, gaps(fr).filter(g => (g.i === i || g.j === i) && g.gap != null).map(g => g.gap));
    if (Math.abs(d - 3) > 0.01) throw new Error(f.id + ' nearest neighbour ' + d + 'in away');
  });
});

check('a 7-piece salon sizes and styles the pieces from the preset', () => {
  fresh();
  fx.add('framed', 1);
  fx.apply('ART.1', 7, 's7-cluster');
  const rows = fx.rows.filter(r => r.id.indexOf('ART.1') === 0);
  if (rows.length !== 7) throw new Error(rows.length + ' rows');
  const pre = fx.presets.find(p => p.key === 's7-cluster');
  rows.forEach((r, i) => {
    const f = pre.frames[i];
    if (parseFloat(r.extW) !== f.w || parseFloat(r.extH) !== f.h) throw new Error(r.id + ' is ' + r.extW + 'x' + r.extH);
    if (f.s === 'float' && !(r.useFloatMount && r.sbPaperEdge === 'torn')) throw new Error(r.id + ' should float on deckled paper');
    if (f.s === 'mat' && !(r.m1A && parseFloat(r.m1T) === 3)) throw new Error(r.id + ' should have a 3in mat');
    if (f.s === 'plain' && (r.m1A || r.useFloatMount)) throw new Error(r.id + ' should have no mat');
  });
  const wall = fx.elevs.find(e => (e.frames || []).some(f => f.id === 'ART.1A'));
  if (wall.frames.length !== 7) throw new Error('wall has ' + wall.frames.length);
});

check('going back down to Single asks, then removes the extra pieces from the rows AND the wall', () => {
  fresh();
  fx.add('framed', 1);
  fx.apply('ART.1', 3, '');
  let asked = false;
  window.showConfirmModal = function (t, b, y, n, onYes) { asked = true; if (onYes) onYes(); };
  fx.apply('ART.1', 1, '');
  if (!asked) throw new Error('removed pieces without asking');
  if (fx.rows.map(r => r.id).join() !== 'ART.1') throw new Error('rows: ' + fx.rows.map(r => r.id).join());
  const wall = fx.elevs.find(e => (e.frames || []).some(f => f.id === 'ART.1'));
  if (!wall || wall.frames.length !== 1) throw new Error('the wall still carries the removed pieces');
});

check('a simple set keeps sizes the pieces already had', () => {
  fresh();
  fx.add('framed', 1);
  fx.rows[0].extW = 50; fx.rows[0].extH = 60;
  fx.apply('ART.1', 2, '');
  if (parseFloat(fx.rows[0].extW) !== 50) throw new Error('a typed size was overwritten');
});

check('EXACT ASK: the Items row is #, Item code, Cat, Line (a pen), Frames (a frame icon)', () => {
  fresh();
  fx.add('framed', 1);
  const t = doc.createElement('div'); doc.body.appendChild(t);
  fx.panel(t, { level: 0, kind: 'floorplan' });
  const head = Array.from(t.querySelectorAll('.fp-item-head span')).map(s => s.textContent).filter(Boolean).join('|');
  if (head !== '#|Item code|Cat|Line|Frames') throw new Error('header: ' + head);
  const pen = t.querySelector('.fp-line-btn'), frm = t.querySelector('.fp-frames-btn');
  if (!pen || !pen.querySelector('svg path')) throw new Error('no pen button');
  if (!frm || !frm.querySelector('svg rect')) throw new Error('no frame button');
  if (t.querySelectorAll('select').length !== 2) throw new Error('row still carries a line-type select');   // type picker + category chip
  t.remove();
});

check('EXACT ASK: the pen opens the line styles, Breaker included; picking one arms drawing', () => {
  fresh();
  fx.add('framed', 1);
  const t = doc.createElement('div'); doc.body.appendChild(t);
  fx.panel(t, { level: 0, kind: 'floorplan' });
  t.querySelector('.fp-line-btn').click();
  const items = Array.from(doc.querySelectorAll('.frame-menu button')).map(b => b.textContent.replace(/^\W+/, ''));
  ['Single', 'Diptych', 'Triptych', 'Breaker', 'Wrap'].forEach(l => { if (!items.some(x => x.indexOf(l) === 0)) throw new Error('missing ' + l + ': ' + items.join(',')); });
  Array.from(doc.querySelectorAll('.frame-menu button')).find(b => b.textContent.indexOf('Breaker') >= 0).click();
  if (fx.armLine !== 'ART.1') throw new Error('choosing a style did not arm drawing');
  if (fx.wallMode(fx.rows[0], 0) !== 'custom') throw new Error('Breaker did not set the click-to-click style');
  t.remove();
});

check('EXACT ASK: a fresh project asks where to start; floorplan opens the Items tab', () => {
  fresh();
  if (!fx.fresh()) throw new Error('an empty project does not count as fresh');
  let went = false;
  fx.goFp(() => { went = true; });
  const ov = fx.chooser();
  const btns = ov.querySelectorAll('.start-choice');
  if (btns.length !== 2) throw new Error(btns.length + ' choices');
  btns[0].click();
  if (!went) throw new Error('Floorplan did not go to the floorplan');
  fx.add('framed', 1); fx.apply('ART.1', 2, '');
  if (fx.fresh()) throw new Error('a project with walls still counts as fresh');
  if (APP.indexOf('/jsdom/i.test(navigator.userAgent') < 0) throw new Error('the boot popup is not kept out of test harnesses');
});

check('EXACT ASK: the placement colour spans the whole dashboard row, selection still reads', () => {
  if (CSS.indexOf('#rfiBody tr[data-placement] > td { background-color: color-mix(in srgb, var(--plc) 16%') < 0) throw new Error('rows are not washed');
  if (CSS.indexOf('#rfiBody tr.selected[data-placement] > td,') < 0) throw new Error('a selected row is not distinguished');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
