// 20.17: A FRAMED CANVAS WRAPS, AND SOMEONE DECIDES HOW. The floater's print size had no wrap
// (Ford China's 28.5in art is a 32.5in image: art + 2 x (1.5in stretcher + 0.5in)), FRAME
// filled the stretcher depth with the rabbet (a made-to-order 1.625in), and nothing said how
// the sides get their picture, so production built every wrap in Photoshop after the fact.
// Plus the studio's 3% buffer on every estimate.
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
  '  rows: function (rows, stage, unit) {',
  '    editorialContent = _editorialDefaults(); dashUnit = unit || "in";',
  '    if (stage) editorialContent.presentationType = stage;',
  '    dashProjectData = rows.map(r => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), r));',
  '    return dashProjectData;',
  '  },',
  '  size: function (r) { return _rowOpeningAndPrint(r); },',
  '  wrapOf: function (r) { return _canvasWrapOf(r); },',
  '  info: function (r) { return _canvasSidesInfo(r); },',
  '  room: function (r) { return _canvasRoomCrop(r); },',
  '  note: function (r) { return _canvasSidesNote(r); },',
  '  ppi: function (r) { return _artPrintPpi(r); },',
  '  sidesPf: function () { return _canvasSidesPreflight(); },',
  '  makePf: function () { return _maxMakePreflight(); },',
  '  rfq: function () { return _rfqSheet("rfi"); },',
  '  est: function (r) { return _estimateCost(r); },',
  '  card: function (addons) { setRateCard([{ product: "Framed Art", base: 100, perSqFt: 10 }], "2026-11-01", addons); },',
  '  rabbet: function (rb) {',
  '    dashSelectedRowIndex = 0;',
  '    document.getElementById("canvasDepth").value = ""; document.getElementById("canvasWrap").value = "";',
  '    document.getElementById("rabbetDepth").value = String(rb);',
  '    try { handleRabbetChange(); } catch (e) {}',
  '    return { depth: document.getElementById("canvasDepth").value, wrap: document.getElementById("canvasWrap").value };',
  '  },',
  '};',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;
// Ford China ART-4: 30 x 40 overall floater, 0.75in inset, 1.5in stretcher.
const FL = (o) => Object.assign({ id: 'ART.4', product: 'Framed Canvas (Floater)', imageCode: 'FFI.010.00001.1', extW: 30, extH: 40, fW: 0.5, floaterInset: 0.75, canvasDepth: 1.5, canvasWrap: '', rabbetDepth: 1.625 }, o);
const ART = { artworkUrl: 'data:image/png;base64,AAAA', artworkW: 3000, artworkH: 4000 };
const near = (a, b, what) => { if (Math.abs(a - b) > 0.002) throw new Error(what + ': ' + a + ' vs ' + b); };

check('EXACT BUG: a floater prints at art + 2 x (stretcher + 0.5in): 28.5 x 38.5 art is a 32.5 x 42.5 image', () => {
  const [r] = fx.rows([FL({})]);
  const sz = fx.size(r);
  near(sz.openW, 28.5, 'art W'); near(sz.printW, 32.5, 'image W'); near(sz.printH, 42.5, 'image H');
});
check('a typed wrap wins; no depth and no wrap means no wrap', () => {
  const [a, b] = fx.rows([FL({ canvasWrap: 3 }), FL({ id: 'ART.5', canvasDepth: '' })]);
  near(fx.size(a).printW, 34.5, 'typed'); near(fx.size(b).printW, 28.5, 'none');
});
check('works in mm: a 38.1mm stretcher wraps 50.8mm', () => {
  const [r] = fx.rows([FL({ extW: 762, extH: 1016, fW: 12.7, floaterInset: 19.05, canvasDepth: 38.1, rabbetDepth: 41.275 })], null, 'mm');
  near(fx.wrapOf(r), 50.8, 'wrap'); near(fx.size(r).printW, 723.9 + 101.6, 'image W');
});
check('EXACT BUG: the RFI image size includes the wrap, the template formula is kept, and the sides go in Notes', () => {
  fx.rows([FL({ canvasSides: 'mirror' })]);
  const row = fx.rfq().rows[9];
  const L = row[11], O = row[14], notes = row[31];
  if (!L || Math.abs(L.v - 32.5) > 0.002 || !L.f) throw new Error('L ' + JSON.stringify(L));
  if (!O || Math.abs(O.v - 2) > 0.002 || O.f !== 'N10+0.5') throw new Error('O ' + JSON.stringify(O));
  if (!notes || String(notes.s || '').indexOf('Mirror wrap 2"') !== 0) throw new Error('notes ' + JSON.stringify(notes));
});
check('the print-sharpness check spreads a floater picture over its face, not face + wrap', () => {
  const [r] = fx.rows([FL(Object.assign({ artLink: { pw: 4275, ph: 5775 } }, ART))]);
  near(fx.ppi(r), 150, 'ppi');
});

// Sides
check('picture wraps: a cover-fit crop leaves no picture for the sides, Make room zooms in just enough', () => {
  const [r] = fx.rows([FL(Object.assign({ canvasSides: 'image' }, ART))]);
  const i = fx.info(r);
  if (i.short.length !== 4) throw new Error('short ' + i.short.join());
  const c = fx.room(r);
  Object.assign(r, { artZoom: c.zoom, artPanX: c.panX, artPanY: c.panY });
  const j = fx.info(r);
  if (j.short.length) throw new Error('still short ' + j.short.join() + ' ' + JSON.stringify(j.spare));
  near(c.zoom, 32.5 / 28.875, 'zoom'); // a 3:4 picture on a 28.5 x 38.5 face: the width needs exactly face + 2 x wrap
});
check('Make room keeps the crop where the designer slid it, as far as the wrap allows', () => {
  const [r] = fx.rows([FL(Object.assign({ canvasSides: 'image', artZoom: 2, artPanX: 0.2, artPanY: 0 }, ART))]);
  const c = fx.room(r);
  if (c.zoom !== 2) throw new Error('zoomed ' + c.zoom);
  near(c.panX, 0.2, 'panX');
});
check('Preflight: a canvas with a picture and no Sides decision is a warning', () => {
  fx.rows([FL(ART)]);
  const pf = fx.sidesPf();
  if (pf.length !== 1 || pf[0].sev !== 'warn' || pf[0].text.indexOf('canvas sides') < 0) throw new Error(JSON.stringify(pf));
});
check('Preflight: picture wraps without room is flagged with its numbers, an error in Final Spec', () => {
  fx.rows([FL(Object.assign({ canvasSides: 'image' }, ART))], 'final');
  const pf = fx.sidesPf();
  if (pf.length !== 1 || pf[0].sev !== 'err' || pf[0].text.indexOf('Make room') < 0 || pf[0].text.indexOf('of the 2 in') < 0) throw new Error(JSON.stringify(pf));
});
check('Preflight: mirror or extend needs nothing more; no picture yet is not judged', () => {
  fx.rows([FL(Object.assign({ canvasSides: 'mirror' }, ART)), FL(Object.assign({ id: 'ART.6', canvasSides: 'extend' }, ART)), FL({ id: 'ART.7' })]);
  if (fx.sidesPf().length) throw new Error(JSON.stringify(fx.sidesPf()));
});
check('the vendor note says who makes the sides', () => {
  const [a, b] = fx.rows([FL({ canvasSides: 'image' }), FL({ id: 'ART.6', canvasSides: 'extend' })]);
  if (fx.note(a).indexOf('runs round the sides') < 0) throw new Error(fx.note(a));
  if (fx.note(b).indexOf('extended round the sides before print') < 0) throw new Error(fx.note(b));
});

// Stretcher depths
check('EXACT BUG: a stretcher equal to a 1.625in rabbet is a custom depth; 1.5in is offered', () => {
  fx.rows([FL({ canvasDepth: 1.625, glass: '' })]);
  const t = fx.makePf().map(i => i.text).join(' | ');
  if (t.indexOf('not a standard depth') < 0 || t.indexOf('Use 1.5 in') < 0) throw new Error(t);
  fx.rows([FL({ canvasDepth: 1.5 })]);
  if (fx.makePf().length) throw new Error('1.5 flagged');
});
check('EXACT BUG: typing a 1.625in rabbet fills a 1.5in stretcher and a 2in wrap, not 1.625 and 2.125', () => {
  fx.rows([FL({ canvasDepth: '', canvasWrap: '', rabbetDepth: 0 })]);
  const v = fx.rabbet(1.625);
  if (parseFloat(v.depth) !== 1.5 || parseFloat(v.wrap) !== 2) throw new Error(JSON.stringify(v));
});

// Buffer
check('every estimate carries the 3% house buffer unless the card says otherwise; 0 means none', () => {
  const [r] = fx.rows([{ id: 'ART.1', product: 'Framed Art', imageCode: 'FFI.010.00001.1', extW: 24, extH: 36, fW: 1, m1A: false }]);
  fx.card(undefined); near(fx.est(r), 160 * 1.03, 'default');
  fx.card({ buffer: 0 }); near(fx.est(r), 160, 'zero');
  fx.card({ buffer: 5 }); near(fx.est(r), 168, 'five');
});

check('Preflight runs the sides check, and the form has the Sides choice', () => {
  const S = APP.slice(APP.indexOf('function _dsRunPreflight'), APP.indexOf('function _pfBadgeSchedule'));
  if (S.indexOf('_canvasSidesPreflight()') < 0) throw new Error('not wired');
  const sel = document.getElementById('m_canvasSides');
  if (!sel || ['', 'image', 'mirror', 'extend'].join() !== Array.from(sel.options).map(o => o.value).join()) throw new Error('select');
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
