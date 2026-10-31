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
  '  hang: function () { return elevHangIn; }, panel: _fpPanelItems, fresh: _projectIsFresh, newProject: _startNewProject,',
  '  get armLine() { return _fpLineArmId; }, wallMode: _fpWallPanelsOn, styles: FP_LINE_STYLES, GAP: SET_GAP_IN,',
  '  goFp: function (fn) { _dsGoFloorplanItems = fn; },',
  '  picker: openFrameSetPicker, dress: _salonFrameDress, memo: _libSwatchMemo, codes: _salonPresetCodes,',
  '  setLib: function (by, load) { _fbByCode = by; _libEntryToDataUrl = load; },',
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
  // The HOUSE library (19.30: hangs copied from a real project are asDrawn, checked below).
  const house = fx.presets.filter(p => !p.asDrawn);
  const five = house.filter(p => p.n === 5), seven = house.filter(p => p.n === 7);
  if (five.length < 2 || seven.length < 2) throw new Error('library: ' + five.length + ' x5, ' + seven.length + ' x7');
  house.forEach(p => {
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
  fx.presets.filter(p => !p.asDrawn).forEach(p => {
    const st = new Set(p.frames.map(f => f.s));
    ['mat', 'plain', 'float'].forEach(k => { if (!st.has(k)) throw new Error(p.key + ' has no ' + k + ' piece'); });
    const sizes = new Set(p.frames.map(f => f.w + 'x' + f.h));
    if (sizes.size < 4) throw new Error(p.key + ' is too uniform: ' + sizes.size + ' sizes');
  });
});

// 19.30: THE FORD ENGINEERING LAB HANGS, as built in its V7 installation guide.
check('EXACT ASK: the Ford Engineering Lab salon hangs are in the set library, as drawn', () => {
  // 19.51: other projects' hangs carry `proj`; the Engineering Lab ones predate it.
  const ford = fx.presets.filter(p => p.asDrawn && !p.proj);
  if (ford.length < 10) throw new Error('only ' + ford.length + ' project hangs');
  const want = ['fel-cor-003', 'fel-cor-015', 'fel-caf-001', 'fel-hal-001', 'fel-ent-002'];
  want.forEach(k => { if (!ford.find(p => p.key === k)) throw new Error('missing ' + k); });
  const keys = new Set();
  ford.forEach(p => {
    if (keys.has(p.key)) throw new Error('duplicate key ' + p.key); keys.add(p.key);
    if (!p.src || p.src.indexOf('Ford Engineering Lab') < 0) throw new Error(p.key + ' does not say where it came from');
    if (p.frames.length !== p.n) throw new Error(p.key + ' has ' + p.frames.length + ' frames for n ' + p.n);
    if (p.n > 12) throw new Error(p.key + ' is over the 12-piece letter cap');
    const x0 = Math.min.apply(null, p.frames.map(f => f.x)), y0 = Math.min.apply(null, p.frames.map(f => f.y));
    if (x0 !== 0 || y0 !== 0) throw new Error(p.key + ' does not start at its bottom-left (' + x0 + ', ' + y0 + ')');
    p.frames.forEach(f => {
      if (!(f.w > 0 && f.h > 0)) throw new Error(p.key + ' has a frame with no size');
      if (['mat', 'plain', 'float'].indexOf(f.s) < 0) throw new Error(p.key + ' style ' + f.s);
    });
    gaps(p.frames).forEach(g => {
      if (g.overlap) throw new Error(p.key + ': frames ' + g.i + ' and ' + g.j + ' overlap');
      if (g.gap < 1 - 1e-9) throw new Error(p.key + ': ' + g.i + '/' + g.j + ' only ' + g.gap + 'in apart');
    });
  });
  // The best-known one, checked against the guide: 11 pieces in a band about 245" by 47".
  const c3 = ford.find(p => p.key === 'fel-cor-003');
  const W = Math.max.apply(null, c3.frames.map(f => f.x + f.w)), H = Math.max.apply(null, c3.frames.map(f => f.y + f.h));
  if (c3.n !== 11 || Math.abs(W - 245) > 3 || Math.abs(H - 47) > 2) throw new Error('fel-cor-003 is ' + c3.n + ' pieces, ' + W + ' x ' + H);
});

// 19.51: THE FORD SALT LAKE CITY HANGS, from its install file, in their own picker section.
check('EXACT ASK: the Ford Utah frame sets are in the library, as drawn, with their frames', () => {
  const slc = fx.presets.filter(p => p.asDrawn && p.proj === 'Ford Salt Lake City');
  if (slc.length < 8) throw new Error('only ' + slc.length + ' Salt Lake City hangs');
  ['slc-3', 'slc-12-14', 'slc-15', 'slc-37'].forEach(k => { if (!slc.find(p => p.key === k)) throw new Error('missing ' + k); });
  slc.forEach(p => {
    if (p.frames.length !== p.n || p.n < 2) throw new Error(p.key + ' has ' + p.frames.length + ' frames for n ' + p.n);
    const x0 = Math.min.apply(null, p.frames.map(f => f.x)), y0 = Math.min.apply(null, p.frames.map(f => f.y));
    if (x0 !== 0 || y0 !== 0) throw new Error(p.key + ' does not start at its bottom-left');
    p.frames.forEach(f => { if (!(f.w > 0 && f.h > 0) || ['mat', 'plain', 'float'].indexOf(f.s) < 0 || !/^MICH-/.test(f.f || '')) throw new Error(p.key + ' frame ' + JSON.stringify(f)); });
    gaps(p.frames).forEach(g => { if (g.overlap || g.gap < 1 - 1e-9) throw new Error(p.key + ': ' + g.i + '/' + g.j + ' gap ' + g.gap); });
  });
  // ART.12 / 13 / 14 as built: 29.75 + 48 (float) + 30 wide, 4in apart.
  const t = slc.find(p => p.key === 'slc-12-14');
  if (t.frames[1].s !== 'float' || t.frames[1].x !== 33.75 || t.frames[2].x !== 85.75) throw new Error('slc-12-14: ' + JSON.stringify(t.frames));
  const labels = slc.map(p => p.label);
  if (new Set(labels).size !== labels.length) throw new Error('two Salt Lake City hangs share a label');
});
check('a Ford hang applies like any set: lettered pieces on a wall in its shape', () => {
  fresh();
  fx.add('framed', 1);   // ART.1
  fx.apply('ART.1', 11, 'fel-cor-003');
  const ids = fx.rows.map(r => r.id);
  if (ids.length !== 11 || ids[0] !== 'ART.1A' || ids[10] !== 'ART.1K') throw new Error('rows: ' + ids.join());
  const wall = fx.elevs.find(e => (e.frames || []).some(f => f.id === 'ART.1A'));
  if (!wall || wall.frames.length !== 11) throw new Error('not mocked up on a wall');
  const pre = fx.presets.find(p => p.key === 'fel-cor-003');
  const fa = wall.frames.find(f => f.id === 'ART.1A'), fb = wall.frames.find(f => f.id === 'ART.1B');
  const dx = (fb.x - fa.x), want = pre.frames[1].x - pre.frames[0].x;
  if (Math.abs(dx - want) > 0.01) throw new Error('A to B is ' + dx + ', the guide has ' + want);
});

// 19.31: THE FORD HANGS CARRY THEIR FRAMES, AND SETS ARE PICKED FROM PICTURES.
check('EXACT ASK: the Ford hangs are not all one frame: each piece names its library moulding', () => {
  const ford = fx.presets.filter(p => p.asDrawn);
  const codes = new Set();
  ford.forEach(p => p.frames.forEach(f => { if (f.f) { if (f.f.indexOf('MICH-') !== 0) throw new Error(p.key + ' frame code ' + f.f); codes.add(f.f); } }));
  if (codes.size < 4) throw new Error('only ' + codes.size + ' different frames across the Ford hangs');
  const c3 = ford.find(p => p.key === 'fel-cor-003');
  if (new Set(c3.frames.map(f => f.f).filter(Boolean)).size < 3) throw new Error('Corridor 003 is one frame');
  if (fx.presets.filter(p => !p.asDrawn).some(p => p.frames.some(f => f.f))) throw new Error('a house preset grew frame codes');
});

check('applying a Ford hang dresses each piece in its frame (from preloaded swatches)', () => {
  fresh();
  const pre = fx.presets.find(p => p.key === 'fel-cor-003');
  const by = {};
  pre.frames.forEach(f => { if (f.f) { by[f.f.toLowerCase().replace(/[^a-z0-9]/g, '')] = { collection: /305|360|340/.test(f.f) ? 'floaters' : 'avant-garde', item: { code: f.f, width: 1, file: f.f + '.jpg', faceWidth: /305|360|340/.test(f.f) ? 0.25 : undefined } }; fx.memo[f.f] = 'data:image/jpeg;base64,' + f.f; } });
  const realNorm = window._fbNorm;
  fx.setLib(() => new Proxy(by, { get: (t, k) => t[String(k).toLowerCase().replace(/[^a-z0-9]/g, '')] }), () => Promise.resolve('data:x'));
  fx.add('framed', 1);
  fx.apply('ART.1', 11, 'fel-cor-003');
  const rows = fx.rows.filter(r => /^ART[.]1[A-K]$/.test(r.id));
  pre.frames.forEach((f, i) => {
    if (!f.f) return;
    if (rows[i].fCode !== f.f) throw new Error(rows[i].id + ' wears ' + rows[i].fCode + ', the guide has ' + f.f);
  });
  const wall = fx.elevs.find(e => (e.frames || []).some(fr => fr.id === 'ART.1B'));
  const fb = wall.frames.find(fr => fr.id === 'ART.1B');
  if (fb.fCode !== pre.frames[1].f) throw new Error('the wall copy of B is in ' + fb.fCode);
});

check('EXACT ASK: the frames button opens a picker of drawn arrangements, not a list', () => {
  const S = window.__appSrc || '';
  const g = { key: 'ART.9', rows: [{ id: 'ART.9' }] };
  const ov = fx.picker(g);
  const tiles = doc.querySelectorAll('#frameSetPicker .fsp-tile');
  const want = 4 + fx.presets.length;
  if (tiles.length !== want) throw new Error(tiles.length + ' tiles, want ' + want);
  tiles.forEach(t => { if (!t.querySelector('svg rect')) throw new Error('tile ' + t.getAttribute('data-set') + ' draws nothing'); });
  if (!doc.querySelector('#frameSetPicker [data-set="fel-hal-001"]')) throw new Error('no Hallway 001 tile');
  // 19.51: one section per project.
  if (!doc.querySelector('#frameSetPicker [data-set="slc-12-14"]')) throw new Error('no Ford Salt Lake City tile');
  if ((doc.getElementById('frameSetPicker').textContent || '').indexOf('Ford Salt Lake City') < 0) throw new Error('no Ford Salt Lake City section');
  if (!doc.querySelector('#frameSetPicker .fsp-tile.on[data-set="n1"]')) throw new Error('the current set (single) is not ringed');
  if (!doc.querySelector('#frameSetPicker [data-modal-close]')) throw new Error('no close control');
  ov.remove();
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
  // 19.51: CAT reads CATEGORY now, in a column wide enough for it.
  if (head !== '#|Item code|Category|Line|Frames') throw new Error('header: ' + head);
  const pen = t.querySelector('.fp-line-btn'), frm = t.querySelector('.fp-frames-btn');
  if (!pen || !pen.querySelector('svg path')) throw new Error('no pen button');
  if (!frm || !frm.querySelector('svg rect')) throw new Error('no frame button');
  if (t.querySelectorAll('select').length !== 3) throw new Error('row still carries a line-type select');   // type picker + size (19.98, the budget sketch) + category chip
  t.remove();
});

check('EXACT ASK: a code with no category shows a ? on its chip; one with a category does not', () => {
  fresh();
  fx.add('framed', 1);
  const t = doc.createElement('div'); doc.body.appendChild(t);
  fx.panel(t, { level: 0, kind: 'floorplan' });
  if (t.querySelector('.fp-cat-q')) { t.remove(); throw new Error('a Framed Art code shows the ?'); }
  fx.rows.forEach(r => { r.category = ''; });
  t.innerHTML = ''; fx.panel(t, { level: 0, kind: 'floorplan' });
  const q = t.querySelector('.fp-cat-wrap .fp-cat-q');
  const sel = t.querySelector('.fp-cat-wrap select.fp-cat-chip');
  t.remove();
  if (!q || q.textContent !== '?') throw new Error('no ? on a code with no category');
  if (!sel) throw new Error('the chip is not inside its wrapper');
  // 19.52: a square as tall as the line and frames buttons (22px), the select filling it.
  const ws = q.parentElement.style;
  if (ws.width !== '22px' || ws.height !== '22px') throw new Error('chip is not a 22px square: ' + ws.width + ' x ' + ws.height);
  if (sel.style.height !== '100%') throw new Error('the select does not fill its square: ' + sel.style.height);
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

// CHANGED IN 18.10, deliberately: the "Where do you want to start?" chooser is gone. A
// new project is started from the start screen and ALWAYS lands on the floorplan Items
// list, a house standard rather than a question (the Frame Dashboard is still tab 1).
check('a new project starts on the floorplan Items tab (the chooser it replaces is gone)', () => {
  fresh();
  if (!fx.fresh()) throw new Error('an empty project does not count as fresh');
  let went = false;
  fx.goFp(() => { went = true; });
  fx.newProject({ name: 'Test', unit: 'in' });
  if (!went) throw new Error('New project did not go to the floorplan Items list');
  if (APP.indexOf('function openStartChooser') >= 0) throw new Error('the old two-way chooser is still in the app');
  fx.add('framed', 1); fx.apply('ART.1', 2, '');
  if (fx.fresh()) throw new Error('a project with walls still counts as fresh');
  if (APP.indexOf('/jsdom/i.test(navigator.userAgent') < 0) throw new Error('the boot screen is not kept out of test harnesses');
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
