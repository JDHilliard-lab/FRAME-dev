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
  // SHOW ON PAGE (18.64): "have an option for the all options to be able to include planview
  // and elevation and frame swatch and profile similar to the per piece option, but have a
  // check box system like the group A/B/C so designers can decide what to include."
  const count = function (t, s) { return t.filter(function (x) { return x === s; }).length; };
  await check('EXACT ASK: by default the sheet shows the moulding strip and no plan or elevation', async function () {
    build(3, 24, 32);
    const t = texts(await draw(0));
    if (count(t, 'Frame') !== 1) throw new Error('expected the strip and its Frame caption: ' + count(t, 'Frame'));
    if (t.indexOf('Floorplan') >= 0 || t.indexOf('Elevation') >= 0) throw new Error('plan or elevation printed by default');
  });
  await check('EXACT ASK: ticking Floorplan and Elevation puts both on the sheet; unticking Frame corner and Profile drops the strip', async function () {
    build(3, 24, 32);
    _setCatSheetSlot(null, 'plan', true); _setCatSheetSlot(null, 'elevation', true);
    _setCatSheetSlot(null, 'frame', false); _setCatSheetSlot(null, 'profile', false);
    const t = texts(await draw(0));
    if (t.indexOf('Floorplan') < 0 || t.indexOf('Elevation') < 0) throw new Error('plan/elevation missing: ' + JSON.stringify(t));
    if (count(t, 'Frame') !== 0) throw new Error('the strip still printed');
    if (t.indexOf('Frame Code') < 0) throw new Error('the specs went with it');
  });
  await check('the sheet keeps its OWN tick map: per-piece and group ticks do not move it, and it does not move them', async function () {
    build(3, 24, 32);
    const g0 = JSON.stringify(_specGroupSlots(null)), p0 = JSON.stringify(_specSlots(null));
    _setCatSheetSlot(null, 'plan', true);
    if (JSON.stringify(_specGroupSlots(null)) !== g0 || JSON.stringify(_specSlots(null)) !== p0) throw new Error('a sheet tick leaked into the spec maps');
    _setSpecGroupSlot(null, 'elevation', true);
    if (_catSheetSlots(null).elevation) throw new Error('a group tick reached the sheet');
  });
  await check('Just this placement pins every page of a split sheet, and only that placement', async function () {
    build(5, 24, 32);
    _setCatSheetSlot(_catOverviewKey('ART.1'), 'plan', true, 'page');
    for (let p = 0; p < 2; p++) { if (texts(await draw(p)).indexOf('Floorplan') < 0) throw new Error('page ' + (p + 1) + ' lacks the plan'); }
    if (_catSheetSlots(_catOverviewKey('ART.9')).plan) throw new Error('another placement picked up the exception');
    _setCatSheetSlot(null, 'plan', false);
    if (_catSheetSlotOv(_catOverviewKey('ART.1'))) throw new Error('deck-wide did not clear the exception');
  });
  await check('the Options panel on a sheet carries the ticks and they write the sheet map', async function () {
    build(3, 24, 32);
    const desc = _deckPageList().find(function (d) { return d.kind === 'catov'; });
    const host = document.createElement('div');
    _dsOptionsInto(host, desc);
    const cb = host.querySelector('input[data-slot="elevation"]');
    if (!cb) throw new Error('no Elevation tick on the options sheet panel');
    if (host.querySelector('input[data-slot="thumbsLeft"]')) throw new Error('the group layout switch leaked onto the sheet');
    cb.checked = true; cb.onchange();
    if (!_catSheetSlots(null).elevation) throw new Error('the tick did not write the sheet map');
    _setCatSheetSlot(null, 'frame', false);
    const h2 = document.createElement('div'); _dsOptionsInto(h2, desc);
    if (h2.querySelector('input[data-slot="frame"]').checked || !h2.querySelector('input[data-slot="elevation"]').checked) throw new Error('the panel does not show the sheet map');
  });
  await check('the rail renders the options sheet instead of leaving a text placeholder', async function () {
    if (!_dsThumbDrawable({ kind: 'catov' })) throw new Error('catov is not thumbnail-drawable');
  });
  // 18.65: "make sure the size of the thumbnails on the all options pages are the same size
  // and layout as the per piece options ... and make sure nothing crashes into each other."
  const allOn = function () { SPEC_SLOT_KEYS.forEach(function (k) { _setCatSheetSlot(null, k, true); _setSpecSlot(null, k, true); }); };
  const capPos = function (ops) { const o = {}; ops.filter(function (x) { return x.t === 'text'; }).forEach(function (x) { if (['Frame', 'Floorplan', 'Elevation', 'none'].indexOf(String(x.str)) >= 0) o[x.str + '@' + Math.round(x.x)] = Math.round(x.y * 10) / 10; }); return o; };
  await check('EXACT ASK: corner, profile, floorplan and elevation land exactly where the per-piece page puts them', async function () {
    build(3, 24, 32); allOn();
    const sheet = capPos(await draw(0));
    const r = dashProjectData.find(function (x) { return x.id === 'ART.1.1'; });
    const rec = new CanvasPdfRec(936, 540);
    await _drawSpecPageTemplate(rec, {}, 1, {}, r, 'frameSpecDetail', { PW: 936, PH: 540 });
    const piece = capPos(rec.ops);
    if (!Object.keys(piece).length) throw new Error('the per-piece page drew no thumbnail captions');
    if (JSON.stringify(sheet) !== JSON.stringify(piece)) throw new Error('sheet ' + JSON.stringify(sheet) + ' vs per-piece ' + JSON.stringify(piece));
  });
  await check('EXACT ASK: nothing collides: a long, differing spec list stops above the thumbnails, and the mockups stay right of the column', async function () {
    build(6, 32, 24); allOn();
    dashProjectData.filter(function (x) { return x.id.indexOf('ART.1.') === 0; }).forEach(function (x, i) { x.fCode = 'MICH ' + (100 + i); x.notes = 'n' + i; });
    const L = _catSheetLayout('ART.1');
    const ops = await draw(0);
    const tx = ops.filter(function (o) { return o.t === 'text'; });
    const thumbs = ops.filter(function (o) { return o.t === 'img' && o.a[0] < L.area.x; }).map(function (o) { return o.a[1]; });
    const caps = tx.filter(function (o) { return ['Frame', 'none'].indexOf(String(o.str)) >= 0; }).map(function (o) { return o.y - 30; });
    const thumbTop = Math.min.apply(null, thumbs.concat(caps));
    const specs = tx.filter(function (o) { return o.x < L.area.x && o.y > L.area.top && o.y < thumbTop + 60 && ['Frame', 'Floorplan', 'Elevation', 'none'].indexOf(String(o.str)) < 0 && String(o.str).indexOf('Copyright') < 0; });
    const lastSpec = Math.max.apply(null, specs.map(function (o) { return o.y; }));
    if (!(lastSpec < thumbTop)) throw new Error('spec text at y=' + lastSpec.toFixed(1) + ' runs into the thumbnails at ' + thumbTop.toFixed(1));
    const mock = ops.filter(function (o) { return o.t === 'img' && o.a[0] >= L.area.x - 0.5; });
    if (mock.length !== 6) throw new Error('mockups: ' + mock.length);
    const colRight = L.area.colX + L.area.colW;
    if (mock.some(function (o) { return o.a[0] < colRight + 10; })) throw new Error('a mockup starts inside the left column');
    const codes = tx.filter(function (o) { return String(o.str).indexOf('IMG-') === 0; });
    const labels = tx.filter(function (o) { return String(o.str).indexOf('ART.1.') === 0; });
    codes.forEach(function (c) { labels.forEach(function (l) { if (Math.abs(l.x - (c.x - L.cellW)) < 2 && l.y > c.y && l.y - c.y < 10) throw new Error('image code ' + c.str + ' crowds ' + l.str); }); });
    mock.forEach(function (o) { if (o.a[1] + o.a[3] > L.area.bottom + 0.5) throw new Error('a mockup runs past the bottom guide'); });
  });
  // 18.67: "where are my controls to choose how many options get displayed per page. I want
  // designers to be able to experiment what 3 on a page look like or 6 on a page look like,
  // and this should be able to choose that it is applied to this placement only or all
  // placements in the presentation."
  const nSheets = function () { return _deckPageList().filter(function (d) { return d.kind === 'catov'; }).length; };
  await check('EXACT ASK: 3 per page puts three on each page, the rest after (5 = 3 + 2)', async function () {
    build(5, 24, 32);
    _setCatSheetSlot(null, 'per', 3);
    const L = _catSheetLayout('ART.1');
    if (L.per !== 3 || L.parts !== 2 || L.auto) throw new Error(JSON.stringify([L.per, L.parts, L.auto]));
    if (nSheets() !== 2) throw new Error('page list: ' + nSheets());
    if (imgs(await draw(0)).filter(function (o) { return o.a[0] > L.area.x - 1; }).length !== 3) throw new Error('page 1 does not hold three');
  });
  await check('EXACT ASK: 6 per page means six on the page, even past the auto size floor', async function () {
    build(7, 24, 32);
    _setCatSheetSlot(null, 'per', 6);
    const L = _catSheetLayout('ART.1');
    if (L.per !== 6 || L.parts !== 2) throw new Error(JSON.stringify([L.per, L.parts]));
    if (imgs(await draw(0)).filter(function (o) { return o.a[0] > L.area.x - 1; }).length !== 6) throw new Error('page 1 does not hold six');
    _setCatSheetSlot(null, 'per', 0);
    if (!_catSheetLayout('ART.1').auto) throw new Error('0 is not automatic');
  });
  await check('EXACT ASK: Just this placement changes only that placement; All option sheets clears the exception', async function () {
    build(5, 24, 32);
    const k = _catOverviewKey('ART.1');
    _setCatSheetSlot(k, 'per', 2, 'page');
    if (_catSheetLayout('ART.1').per !== 2) throw new Error('the placement did not take its own count');
    if (_catSheetSlots(_catOverviewKey('ART.9')).per !== 0) throw new Error('another placement picked it up');
    _setCatSheetSlot(null, 'per', 4);
    if (_catSheetSlotOv(k)) throw new Error('deck-wide did not clear the exception');
    if (_catSheetLayout('ART.1').per !== 4) throw new Error('deck-wide count not applied');
  });
  await check('the panel offers Auto (with what it picked) and 1 to 10, and writes through the scope', async function () {
    build(5, 24, 32);
    const desc = _deckPageList().find(function (d) { return d.kind === 'catov'; });
    const host = document.createElement('div'); _dsOptionsInto(host, desc);
    const sel = host.querySelector('#dsCatSheetPer');
    if (!sel) throw new Error('no Options per page control on the sheet');
    const opts = Array.from(sel.options).map(function (o) { return o.textContent; });
    if (opts[0] !== 'Auto (3)' || opts.length !== 11 || opts[10] !== '10') throw new Error('options: ' + opts.join());
    _dsSlotScope = 'page'; sel.value = '2'; sel.onchange(); _dsSlotScope = 'deck';
    if ((_catSheetSlotOv(_catOverviewKey('ART.1')) || {}).per !== 2) throw new Error('Just this placement did not write the placement');
    if (_catSheetSlots(null).per !== 0) throw new Error('it leaked to the deck');
  });
  await check('EXACT ASK: the selected page keeps its rail thumbnail: the live mirror copies canvas pixels', async function () {
    const S2 = window.__appSrc;
    const i = S2.indexOf('function _dsSyncActiveThumbnailMirror(');
    const body = S2.slice(i, S2.indexOf(String.fromCharCode(10) + '}', i));
    if (body.indexOf('_dsCopyCanvasPixels(source, clone)') < 0) throw new Error('the mirror clones canvases without their pixels');
    const a = document.createElement('div'), c = document.createElement('canvas'); c.width = 30; c.height = 20; a.appendChild(c);
    const b = a.cloneNode(true); let drew = null;
    b.querySelector('canvas').getContext = function () { return { drawImage: function (src) { drew = src; } }; };
    _dsCopyCanvasPixels(a, b);
    if (drew !== c || b.querySelector('canvas').width !== 30) throw new Error('pixels were not copied');
  });
  return out;
})();
`;
const quiet = console.error; console.error = () => {};
window.__appSrc = APP;
window.eval(APP + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) { console.log(failed.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
});
