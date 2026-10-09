// SPEC-PAGE THUMBNAILS LINE UP TOP AND BOTTOM (18.01). "the elevation thumbnail on the
// spec pages ... it was offset because it is calculating the dimension line to be part
// of the image, but we just want the line drawing of the wall. This way it will be
// aligned with the Plan view top and bottom." And: "the frame text font MICH 41-35 is
// different from the Floorplan and Elevation font ... as well as the frame thumbnail
// aligning top and bottom to the floorplan detail and elevation detail."
// renderElevationToCanvas reserves 6in above the wall (the band elevation dims print
// in), so the wall's top edge sat 6in below the thumbnail's top. RENDERED through
// CanvasPdfRec and read off the rects and captions.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
// Permissive: any drawing call is accepted, so the frame mockups get far enough to
// print their image codes (the minimal stub threw inside renderFrameToCanvas and the
// codes, which are the bottom edge of the art, never appeared).
window.HTMLCanvasElement.prototype.getContext = function () {
  const st = {};
  return new Proxy(st, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (str) => ({ width: String(str || '').length * 6, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 2 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w || 1) * (h || 1) * 4)), width: w || 1, height: h || 1 });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w || 1) * (h || 1) * 4)), width: w || 1, height: h || 1 });
      if (/^create/.test(String(k))) return () => ({ addColorStop() {}, setTransform() {} });
      if (k === 'canvas') return this;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  "_autosaveToldUser = true;",
  "scheduleAutosave = function () {}; pushHistory = function () {};",
  "window.__res = (async function () {",
  "  const out = [];",
  "  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };",
  "  const mk = function (id, o) { return Object.assign({}, dashDefaultData, { id: id, imageCode: 'IMG-' + id.slice(-1) + '.JPG', product: 'Framed Art', fCode: 'MICH 41-35', m1A: false, m2A: false }, o || {}); };",
  "  const SET = [mk('ART-1.1-A', { extW: 30, extH: 40 }), mk('ART-1.1-B', { extW: 20, extH: 20 })];",
  "  const WALL = function () { return { id: 'w1', name: 'WALL A', wallW: 120, wallH: 96, personPos: { x: 90 }, frames: [",
  "      { id: 'ART-1.1-A', letter: 'A', x: 20, y: 40, w: 30, h: 40, active: true, dimTo: [] },",
  "      { id: 'ART-1.1-B', letter: 'B', x: 60, y: 50, w: 20, h: 20, active: true, dimTo: [] }] }; };",
  "  _collectProjectFramesCached = async function () { return [{ code: 'MICH 41-35', finish: 'Walnut', img: null, profileImg: null, color: '#6b4a2e' }]; };",
  "  editorialContent = _editorialDefaults(); editorialContent.annotations = {}; editorialContent.pageFooters = {};",
  "  editorialContent.scaleOpts = { codes: 'frames' };",
  "  editorialContent.specGroupSlots = { frame: true, profile: false, plan: true, elevation: true, thumbsLeft: false };",
  "  editorialContent.specGroupSlotOverrides = {};",
  "  dashProjectData = SET.map(function (r) { return Object.assign({}, r); });",
  "  elevations = [WALL()];",
  "  const rec = new CanvasPdfRec(936, 540);",
  "  await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: 'ART-1.1' }, 'setLegend', { PW: 936, PH: 540, M: 40 });",
  "  const ops = rec.ops;",
  "  const texts = ops.filter(function (o) { return o && o.t === 'text'; });",
  "  const cap = function (w) { return texts.find(function (o) { return o.str === w; }); };",
  "  const fpCap = cap('Floorplan'), evCap = cap('Elevation'), codeCap = texts.filter(function (o) { return o.str === 'MICH 41-35'; }).sort(function (a, b) { return b.y - a.y; })[0];   // the strip's caption, not the spec row",
  "  const near = function (a, b, tol) { return Math.abs(a - b) <= (tol || 1); };",
  "  const planRect = function () { return ops.find(function (o) { return o.t === 'rect' && near(o.a[0], fpCap.x, 0.01) && near(o.a[2], o.a[3], 0.01); }); };",
  "  const evImg = function () { return ops.find(function (o) { return o.t === 'img' && near(o.a[0], evCap.x, 0.01); }); };",
  "  const wallRect = function () { const im = evImg(); return ops.find(function (o) { return o.t === 'rect' && o.style === 'S' && o.a[0] >= im.a[0] - 0.5 && o.a[0] < im.a[0] + im.a[2] && o.a[1] >= im.a[1] - 0.5 && o.a[3] > im.a[3] * 0.5; }); };",
  "  await check('the band drew a floorplan, an elevation and a frame code', async function () {",
  "    if (!fpCap || !evCap || !codeCap) throw new Error('missing: ' + [!!fpCap, !!evCap, !!codeCap].join('/'));",
  "    if (!planRect()) throw new Error('no plan box at the Floorplan caption');",
  "    if (!evImg()) throw new Error('no elevation image at the Elevation caption');",
  "    if (!wallRect()) throw new Error('no wall outline over the elevation image');",
  "  });",
  "  await check('a tight render IS the wall: no 6in margin above it', async function () {",
  "    const er = await renderElevationToCanvas(WALL(), null, { dpi: 24, tight: true });",
  "    if (!(er.wallTopFrac < 0.02)) throw new Error('wall top at ' + er.wallTopFrac.toFixed(3) + ' of the image');",
  "    if (!(er.hIn < 96 + 0.5)) throw new Error('image is ' + er.hIn.toFixed(2) + 'in tall for a 96in wall');",
  "    if (!(er.wallLeftFrac < 0.02 && er.wallRightFrac > 0.98)) throw new Error('side margin kept: ' + er.wallLeftFrac.toFixed(3) + ' / ' + er.wallRightFrac.toFixed(3));",
  "    const loose = await renderElevationToCanvas(WALL(), null, { dpi: 24 });",
  "    if (!near(loose.wallTopFrac, 6 / 102, 0.005)) throw new Error('the untightened render changed: ' + loose.wallTopFrac);",
  "  });",
  "  await check('a figure standing off the wall stays in a tight render', async function () {",
  "    const w = WALL(); w.personPos = { x: -30 };",
  "    const er = await renderElevationToCanvas(w, null, { dpi: 24, tight: true });",
  "    if (!(er.wallLeftFrac > 0.15)) throw new Error('the figure was cropped off: wall starts at ' + er.wallLeftFrac.toFixed(3));",
  "  });",
  "  await check('EXACT BUG: the elevation wall lines up with the floorplan TOP and BOTTOM', async function () {",
  "    const p = planRect(), w = wallRect();",
  "    if (!near(p.a[1], w.a[1], 1)) throw new Error('tops differ: plan ' + p.a[1].toFixed(1) + ' vs wall ' + w.a[1].toFixed(1));",
  "    if (!near(p.a[1] + p.a[3], w.a[1] + w.a[3], 1)) throw new Error('bottoms differ: plan ' + (p.a[1] + p.a[3]).toFixed(1) + ' vs wall ' + (w.a[1] + w.a[3]).toFixed(1));",
  "  });",
  "  await check('EXACT ASK: the frame corner chip fills the same height as the floorplan', async function () {",
  "    const p = planRect();",
  "    const chip = ops.find(function (o) { return o.t === 'rect' && o.style === 'F' && near(o.a[0], codeCap.x, 0.01); });",
  "    if (!chip) throw new Error('no corner chip at the code');",
  "    if (!near(chip.a[1], p.a[1], 0.5) || !near(chip.a[3], p.a[3], 0.5)) throw new Error('chip ' + chip.a[1].toFixed(1) + '+' + chip.a[3].toFixed(1) + ' vs plan ' + p.a[1].toFixed(1) + '+' + p.a[3].toFixed(1));",
  "  });",
  "  await check('EXACT ASK: the frame code is set like the Floorplan and Elevation captions', async function () {",
  "    if (codeCap.st.font !== fpCap.st.font || codeCap.st.sz !== fpCap.st.sz) throw new Error('font ' + codeCap.st.font + ' ' + codeCap.st.sz + ' vs ' + fpCap.st.font + ' ' + fpCap.st.sz);",
  "    if (JSON.stringify(codeCap.st.tc) !== JSON.stringify(fpCap.st.tc)) throw new Error('ink ' + JSON.stringify(codeCap.st.tc) + ' vs ' + JSON.stringify(fpCap.st.tc));",
  "    if (evCap.st.font !== fpCap.st.font || evCap.st.sz !== fpCap.st.sz) throw new Error('the Elevation caption differs from Floorplan');",
  "    if (!near(codeCap.y, fpCap.y, 0.5) || !near(evCap.y, fpCap.y, 0.5)) throw new Error('caption baselines differ: ' + [codeCap.y, fpCap.y, evCap.y].map(function (v) { return v.toFixed(1); }).join(' / '));",
  "  });",
  '  return out;',
  '})();',
].join(NL);
const quiet = console.error; console.error = () => {};
window.APP_SRC = APP;
window.eval(APP + NL + 'var APP_SRC = window.APP_SRC;' + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
});
