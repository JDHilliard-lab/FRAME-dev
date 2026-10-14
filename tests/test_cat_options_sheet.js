// THE OPTIONS SHEET (18.64): "what would be the approach if I wanted to display three
// mockups on one page, but it is not a triptych ... more like a catalogue for clients to
// pick from and I also want to limit the amount of pages ... sometimes these documents get
// printed and pinned up on a physical board, and I do not want specs to get lost, so maybe
// we could just figure out what would be the best grid and quantity of frames to show on
// one page for a single placement."
// A single-piece placement's options print as one sheet after the breaker: shared spec
// column on EVERY page, mockups coded ART.1.1, ART.1.2 ... and the sheet replaces the
// options' own spec pages. How many fit is derived, never set. NO REGEX IN THIS FILE.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (k === 'measureText') return (str) => ({ width: String(str || '').length * 5 });
      if (k === 'getImageData' || k === 'createImageData') return () => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 });
      if (String(k).indexOf('create') === 0) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = `
_autosaveToldUser = true;
scheduleAutosave = function () {};
switchView = function () {}; _elevLoadWall = function () {};
_dsRefresh = function () {}; _dsRenderRail = function () {}; _dsRenderTools = function () {}; _dsRenderCenter = function () {};
_toast = function () { return null; };
_loadImg = function () { return Promise.resolve(null); };
window.__res = (async function () {
  const out = [];
  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };
  const URL1 = 'data:image/png;base64,' + 'A'.repeat(90);
  const mkRow = function (id, w, h) { const r = JSON.parse(JSON.stringify(dashDefaultData)); r.id = id; r.extW = w; r.extH = h; r.location = 'General Office Art'; r.product = 'Framed Art'; r.fCode = 'MICH 240-32'; return r; };
  // One piece on one wall, marked a mockup, with n image options each carrying its own picture.
  const build = function (n, w, h, opts) {
    opts = opts || {};
    editorialContent = _editorialDefaults();
    editorialContent.elevBreakers = true;
    dashProjectData = [mkRow('ART.1', w, h)];
    elevations = [{ id: 'w1', name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 }, catalogueMaster: true,
      frames: [{ id: 'ART.1', letter: 'A', x: 80, y: 40, w: w, h: h, active: true }] }];
    if (opts.twoPiece) { dashProjectData.push(mkRow('ART.1B', w, h)); elevations[0].frames.push({ id: 'ART.1B', letter: 'B', x: 130, y: 40, w: w, h: h, active: true }); }
    currentElevIndex = 0;
    for (let i = 0; i < n; i++) _catAddOptionOfKind(0, 'images');
    _codesSettle(); _catSyncAllOptions();
    _catPlacementWalls('ART.1').forEach(function (it, i) { (it.wall.frames || []).forEach(function (f) { const r = dashProjectData.find(function (x) { return x.id === f.id; }); if (r) { r.artworkUrl = URL1; r.imageCode = 'IMG-' + (i + 1); } }); });
  };
  const draw = async function (part) { const rec = new CanvasPdfRec(936, 540); await _drawCatOverviewPage(rec, {}, 1, {}, 'ART.1', { PW: 936, PH: 540, part: part || 0 }); return rec.ops; };
  const texts = function (ops) { return ops.filter(function (o) { return o.t === 'text'; }).map(function (o) { return String(o.str); }); };
  const imgs = function (ops) { return ops.filter(function (o) { return o.t === 'img'; }); };
  const pageKinds = function () { return _deckPageList().filter(function (d) { return d.kind === 'catov' || (d.kind === 'spec' && ((d.title || '').indexOf('ART.1') === 0)); }); };

  await check('EXACT ASK: three single-piece options print as ONE sheet after the breaker, no per-option spec pages', async function () {
    build(3, 24, 32);
    if (!_catSheetMode('ART.1')) throw new Error('not in sheet mode');
    const ps = pageKinds();
    const sig = ps.map(function (d) { return d.kind === 'catov' ? 'sheet' : (d._install ? 'breaker' : 'spec:' + d.title); }).join();
    if (sig !== 'breaker,sheet') throw new Error('pages: ' + sig);
  });
  await check('EXACT ASK: options are coded ART.1.1, ART.1.2, ART.1.3 (numbers, not letters) above each mockup', async function () {
    build(3, 24, 32);
    const t = texts(await draw(0));
    ['ART.1.1', 'ART.1.2', 'ART.1.3'].forEach(function (c) { if (t.indexOf(c) < 0) throw new Error('missing ' + c + ' in ' + JSON.stringify(t)); });
    if (imgs(await draw(0)).length !== 3) throw new Error('mockups drawn: ' + imgs(await draw(0)).length);
  });
  await check('EXACT ASK: the specs print on the sheet (shared lines once) with each image code under its mockup', async function () {
    build(3, 24, 32);
    const t = texts(await draw(0));
    if (t.indexOf('Frame Code') < 0) throw new Error('no shared Frame Code line: ' + JSON.stringify(t));
    if (t.filter(function (s) { return s === 'Frame Code'; }).length !== 1) throw new Error('shared line repeated');
    if (t.some(function (s) { return s.indexOf('3 @') === 0; })) throw new Error('a size reads as a quantity of 3: ' + JSON.stringify(t));
    ['IMG-1', 'IMG-2', 'IMG-3'].forEach(function (c) { if (t.indexOf(c) < 0) throw new Error('missing image code ' + c); });
    if (t.join('|').toUpperCase().indexOf('ART.1 | GENERAL OFFICE ART') < 0) throw new Error('title lacks code | location: ' + t.slice(0, 3).join(' / '));
  });
  await check('a line that differs carries the option tail (.2), the way a set carries letters', async function () {
    build(3, 24, 32);
    const r = dashProjectData.find(function (x) { return x.id === 'ART.1.2'; });
    r.fCode = 'LAR 99';
    const t = texts(await draw(0));
    if (!t.some(function (s) { return s.indexOf('Frame Code') === 0 && s.indexOf('.2') > 0; })) throw new Error('no .2 tagged row: ' + JSON.stringify(t));
  });
  await check('portrait art: four fit one row, five split evenly 3 + 2, and EVERY page carries the specs', async function () {
    build(4, 24, 32);
    let L = _catSheetLayout('ART.1');
    if (L.parts !== 1 || L.rows !== 1 || L.per !== 4) throw new Error('4 portrait: ' + JSON.stringify([L.parts, L.rows, L.per]));
    build(5, 24, 32);
    L = _catSheetLayout('ART.1');
    if (L.parts !== 2 || L.per !== 3) throw new Error('5 portrait: ' + JSON.stringify([L.parts, L.per]));
    if (_deckPageList().filter(function (d) { return d.kind === 'catov'; }).length !== 2) throw new Error('page list disagrees with the layout');
    for (let p = 0; p < 2; p++) { const t = texts(await draw(p)); if (t.indexOf('Frame Code') < 0) throw new Error('page ' + (p + 1) + ' has no specs'); }
    const t2 = texts(await draw(1));
    if (t2.indexOf('ART.1.4') < 0 || t2.indexOf('ART.1.1') >= 0) throw new Error('page 2 holds: ' + JSON.stringify(t2));
  });
  await check('landscape art: six fit in two rows; seven split 4 + 3, never 6 + 1', async function () {
    build(6, 32, 24);
    let L = _catSheetLayout('ART.1');
    if (L.parts !== 1 || L.rows !== 2) throw new Error('6 landscape: ' + JSON.stringify([L.parts, L.rows, L.cols]));
    build(7, 32, 24);
    L = _catSheetLayout('ART.1');
    if (L.parts !== 2 || L.per !== 4) throw new Error('7 landscape: ' + JSON.stringify([L.parts, L.per]));
  });
  await check('every mockup on a split prints at one size, at least the readable floor', async function () {
    build(5, 24, 32);
    const a = imgs(await draw(0)), b = imgs(await draw(1));
    const ws = a.concat(b).map(function (o) { return o.a[2]; });
    if (Math.max.apply(null, ws) - Math.min.apply(null, ws) > 0.01) throw new Error('widths differ: ' + ws.join());
    const o = a[0];
    if (Math.sqrt(o.a[2] * o.a[3]) < CAT_SHEET_MIN_PT) throw new Error('below the floor: ' + o.a[2] + 'x' + o.a[3]);
  });
  await check('turning the All-options page off brings back one spec page per option', async function () {
    build(3, 24, 32);
    editorialContent.catOverview = false;
    const sig = pageKinds().filter(function (d) { return !d._install; }).map(function (d) { return d.title; }).join();
    if (sig !== 'ART.1.1,ART.1.2,ART.1.3') throw new Error('pages: ' + sig);
  });
  await check('a multi-piece placement keeps the drawing overview and its spec pages', async function () {
    build(2, 24, 30, { twoPiece: true });
    if (_catSheetMode('ART.1')) throw new Error('a two-piece placement went to sheet mode');
    if (!texts(await draw(0)).some(function (s) { return s === 'OPTION 1'; })) throw new Error('drawing overview not drawn');
  });
  await check('without breakers the sheet still leads the placement', async function () {
    build(3, 24, 32);
    editorialContent.elevBreakers = false;
    const ps = pageKinds();
    if (!ps.length || ps[0].kind !== 'catov' || ps.some(function (d) { return d.kind === 'spec'; })) throw new Error('pages: ' + ps.map(function (d) { return d.kind; }).join());
  });
  return out;
})();
`;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) { console.log(failed.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
});
