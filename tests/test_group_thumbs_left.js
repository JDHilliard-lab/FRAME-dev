// GROUP A/B/C: THUMBNAILS IN THE LEFT COLUMN (17.88). "we created an option for the
// details plans, elevation, frame corners and profile to toggle to the left so we could
// give the frame groupings more space anchoring them to the bottom right corner (make
// sure not to overlap image codes on frames) and scale up to the left to maximize size
// as best as possible without crashing into the spec."
// RENDERED through CanvasPdfRec and read off the text ops (letters, image codes,
// captions, spec labels), because the frame mockups are rasters and draw nothing here.
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
  '_autosaveToldUser = true;',
  'scheduleAutosave = function () {}; pushHistory = function () {};',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const mk = function (id, o) { return Object.assign({}, dashDefaultData, { id: id, imageCode: "IMG-" + id.slice(-1) + ".JPG1234", product: "Framed Art", fCode: "MICH 432-22", m1A: false, m2A: false }, o || {}); };',
  '  const SET = [mk("ART-7.7-A", { extW: 30, extH: 40 }), mk("ART-7.7-B", { extW: 20, extH: 20 }), mk("ART-7.7-C", { extW: 20, extH: 20 })];',
  '  const setup = function (left) {',
  '    _collectProjectFramesCached = async function () { return [{ code: "MICH 432-22", finish: "Gold", img: null, profileImg: null, color: "#c8a02e" }]; };',
  '    editorialContent = _editorialDefaults(); editorialContent.annotations = {}; editorialContent.pageFooters = {};',
  '    editorialContent.scaleOpts = { codes: "frames" };',
  '    editorialContent.specGroupSlots = { frame: true, profile: true, plan: true, elevation: true, thumbsLeft: !!left };',
  '    editorialContent.specGroupSlotOverrides = {};',
  '    dashProjectData = SET.map(function (r) { return Object.assign({}, r); });',
  '    elevations = [{ id: "w1", name: "WALL A", wallW: 185, wallH: 108, frames: [',
  '      { id: "ART-7.7-A", letter: "A", x: 40, y: 40, w: 30, h: 40, active: true, dimTo: [] },',
  '      { id: "ART-7.7-B", letter: "B", x: 80, y: 60, w: 20, h: 20, active: true, dimTo: [] },',
  '      { id: "ART-7.7-C", letter: "C", x: 80, y: 34, w: 20, h: 20, active: true, dimTo: [] }] }];',
  '  };',
  '  const draw = async function (left) { setup(left); const rec = new CanvasPdfRec(936, 540); await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: "ART-7.7" }, "setLegend", { PW: 936, PH: 540, M: 40 }); return rec.ops; };',
  '  const texts = function (ops) { return ops.filter(function (o) { return o && o.t === "text"; }); };',
  '  const letters = function (ops) { return texts(ops).filter(function (o) { return /^[A-C]$/.test(o.str || ""); }); };',
  '  const codes = function (ops) { return texts(ops).filter(function (o) { return (o.str || "").indexOf("IMG-") === 0; }); };',
  '  const cap = function (ops, w) { return texts(ops).find(function (o) { return o.str === w; }); };',
  '  const SR = _safeFrameRect(936, 540);',
  '  const band = await draw(false), left = await draw(true);',
  '  await check("EXACT ASK: the thumbnails move to the left column", async function () {',
  '    ["Floorplan", "Elevation"].forEach(function (w) {',
  '      const a = cap(band, w), b = cap(left, w);',
  '      if (!a || !b) throw new Error(w + " caption missing in one layout");',
  '      if (!(b.x < SR.L + (SR.R - SR.L) * 0.32)) throw new Error(w + " is not in the left column: x=" + b.x.toFixed(1));',
  '      if (!(a.x > SR.L + (SR.R - SR.L) * 0.39)) throw new Error("the default band moved too: " + w + " x=" + a.x.toFixed(1));',
  '    });',
  '  });',
  '  await check("EXACT ASK: the grouping anchors bottom-right and scales UP", async function () {',
  '    const cb = codes(band), cl = codes(left);',
  '    if (cb.length !== 3 || cl.length !== 3) throw new Error("image codes missing " + cb.length + "/" + cl.length + " " + JSON.stringify(texts(left).map(function(o){return o.str;})));',
  '    const botB = Math.max.apply(null, cb.map(function (o) { return o.y; })), botL = Math.max.apply(null, cl.map(function (o) { return o.y; }));',
  '    if (!(botL > botB + 20)) throw new Error("not anchored at the bottom: " + botL.toFixed(1) + " vs " + botB.toFixed(1));',
  '    const spanB = Math.max.apply(null, cb.map(function (o) { return o.y; })) - Math.min.apply(null, letters(band).map(function (o) { return o.y; }));',
  '    const spanL = Math.max.apply(null, cl.map(function (o) { return o.y; })) - Math.min.apply(null, letters(left).map(function (o) { return o.y; }));',
  '    if (!(spanL > spanB * 1.15)) throw new Error("the art did not scale up: " + spanL.toFixed(1) + " vs " + spanB.toFixed(1));',
  '  });',
  '  // A WIDE, SHORT group is width-constrained, so it has spare height: this is where',
  '  // bottom-anchoring is visible at all (a tall group fills the height either way and a',
  '  // check on it passes with the anchor deleted, which is how this one was found).',
  '  await check("EXACT ASK: a wide group sits on the BOTTOM, not hung from the top", async function () {',
  '    const wide = async function (left) {',
  '      setup(left);',
  '      elevations[0].frames = [',
  '        { id: "ART-7.7-A", letter: "A", x: 0, y: 40, w: 30, h: 20, active: true, dimTo: [] },',
  '        { id: "ART-7.7-B", letter: "B", x: 60, y: 40, w: 20, h: 20, active: true, dimTo: [] },',
  '        { id: "ART-7.7-C", letter: "C", x: 120, y: 40, w: 20, h: 20, active: true, dimTo: [] }];',
  '      const rec = new CanvasPdfRec(936, 540);',
  '      await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: "ART-7.7" }, "setLegend", { PW: 936, PH: 540, M: 40 });',
  '      return rec.ops;',
  '    };',
  '    const L = letters(await wide(true));',
  '    if (L.length !== 3) throw new Error("letters missing");',
  '    const topY = Math.min.apply(null, L.map(function (o) { return o.y; }));',
  '    const mid = SR.T + (SR.B - SR.T) / 2;',
  '    if (!(topY > mid)) throw new Error("the group starts at y=" + topY.toFixed(1) + ", above mid-page; it is hung from the top");',
  '    const rightX = Math.max.apply(null, L.map(function (o) { return o.x; }));',
  '    if (!(rightX > SR.L + (SR.R - SR.L) * 0.8)) throw new Error("not anchored right: last letter at x=" + rightX.toFixed(1));',
  '  });',
  '  await check("EXACT ASK: no image code lands on the bottom guide or past it", async function () {',
  '    codes(left).forEach(function (o) { if (o.y > SR.B - 1) throw new Error(o.str + " at y=" + o.y.toFixed(1) + " is on/under the guide " + SR.B); });',
  '  });',
  '  await check("the art does not crash into the specs: every letter is right of the spec column", async function () {',
  '    const specRight = SR.L + (SR.R - SR.L) * 0.315;',
  '    letters(left).forEach(function (o) { if (o.x < specRight + 8) throw new Error("letter " + o.str + " at x=" + o.x.toFixed(1)); });',
  '  });',
  '  await check("the specs stop above the thumbnails instead of running into them", async function () {',
  '    const top = Math.min(cap(left, "Floorplan").y, cap(left, "Elevation").y) - 60;',
  '    const lbl = texts(left).filter(function (o) { return o.str === "Frame Code" || o.str === "Application" || o.str === "Glass"; });',
  '    if (!lbl.length) throw new Error("no spec labels drawn");',
  '    lbl.forEach(function (o) { if (o.y > top) throw new Error(o.str + " at y=" + o.y.toFixed(1) + " runs into the thumbnails"); });',
  '  });',
  '  // 17.93: "when switching the thumbnails from right column to left column can we make',
  '  // sure they do not get stacked on top of each other". The corner/profile strip sat',
  '  // ABOVE the floorplan and elevation; it now shares their row, left to right in the',
  '  // order the bottom band reads: strip, floorplan, elevation.',
  '  await check("EXACT ASK: strip, floorplan and elevation share ONE row, not a stack", async function () {',
  '    const fp = cap(left, "Floorplan"), ev = cap(left, "Elevation");',
  '    if (Math.abs(fp.y - ev.y) > 1) throw new Error("plan and elevation captions are on different rows: " + fp.y.toFixed(1) + " / " + ev.y.toFixed(1));',
  '    const code = texts(left).find(function (o) { return o.str === "MICH 432-22" && Math.abs(o.y - fp.y) < 4; });',
  '    if (!code) throw new Error("no frame strip on the thumbnail row; codes at " + JSON.stringify(texts(left).filter(function (o) { return o.str === "MICH 432-22"; }).map(function (o) { return [o.x.toFixed(0), o.y.toFixed(0)]; })));',
  '    if (!(code.x < fp.x && fp.x < ev.x)) throw new Error("row order is not strip, plan, elevation: " + [code.x, fp.x, ev.x].map(function (v) { return v.toFixed(0); }).join(" / "));',
  '    const above = texts(left).filter(function (o) { return o.str === "MICH 432-22" && o.y > fp.y - 160 && o.y < fp.y - 4 && o.x < fp.x + 200 && o.x > SR.L + 1 && o.x < ev.x; });',
  '    if (above.some(function (o) { return Math.abs(o.x - code.x) < 2; })) throw new Error("a second strip is still stacked above the row");',
  '  });',
  '  await check("deck-wide or this page only, through the same setter as the ticks", async function () {',
  '    editorialContent = _editorialDefaults();',
  '    _setSpecGroupSlot("ART-7.7", "thumbsLeft", true, "page");',
  '    if (!_specGroupSlots("ART-7.7").thumbsLeft || _specGroupSlots("ART-9").thumbsLeft) throw new Error("page scope leaked");',
  '    _setSpecGroupSlot(null, "thumbsLeft", true, "deck");',
  '    if (!_specGroupSlots("ART-9").thumbsLeft) throw new Error("deck scope did not apply");',
  '  });',
  '  await check("the switch is in the thumbnail cache key, so the rail redraws", async function () {',
  '    if (APP_SRC.indexOf("SPEC_SLOT_KEYS.concat(SPEC_GROUP_LAYOUT_KEYS).map") < 0) throw new Error("cache key ignores the layout switch");',
  '  });',
  '  await check("the renderer records where each piece landed, for the drop target", async function () {',
  '    setup(false); _curPageKey = "spec:TEST"; _specArtRectsReset();',
  '    const rec = new CanvasPdfRec(936, 540);',
  '    await _drawSpecSetPage(rec, {}, 1, {}, { rep: SET[0], members: SET, key: "ART-7.7" }, "setLegend", { PW: 936, PH: 540, M: 40 });',
  '    const r = _specArtRects["spec:TEST"] || [];',
  '    if (r.map(function (q) { return q.id; }).join() !== "ART-7.7-A,ART-7.7-B,ART-7.7-C") throw new Error("recorded " + JSON.stringify(r));',
  '    const A = letters(rec.ops).find(function (o) { return o.str === "A"; });',
  '    if (Math.abs(A.x - r[0].x) > 1) throw new Error("rect A does not sit where letter A was drawn");',
  '  });',
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
