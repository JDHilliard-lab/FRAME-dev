// PLACEMENT OPTIONS FROM DECK STUDIO (17.89), rebuilt from the lost week:
//  "ART.1 OPTION 1, ART.1 OPTION 2 and when creating an option we had a pop up window for
//   selecting what kind of option, same frame specs different images, same frames and
//   images different arrangement, different frame count and images..."
//  "a cool pop up window you could view all the different options ... like a node tree"
//  "a breaker page that would show all options on one page, and kept all frames to scale"
// Rendered and driven through the real minters; the overview is read off CanvasPdfRec.
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
      if (k === 'measureText') return (str) => ({ width: String(str || '').length * 6 });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(64), width: 4, height: 4 });
      if (/^create/.test(String(k))) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  '_autosaveToldUser = true;',
  'scheduleAutosave = function () {};',
  'switchView = function () {}; _elevLoadWall = function () {};',
  '_dsRefresh = function () {}; _dsRenderRail = function () {}; _dsRenderTools = function () {}; _dsRenderCenter = function () {};',
  '_toast = function () { return null; };',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const URL1 = "data:image/png;base64," + "A".repeat(90), URL2 = "data:image/png;base64," + "B".repeat(90);',
  '  const mkRow = function (id, w, h, url) { const r = JSON.parse(JSON.stringify(dashDefaultData)); r.id = id; r.extW = w; r.extH = h; r.artworkUrl = url || ""; r.imageCode = url ? ("img-" + id) : ""; return r; };',
  '  const setup = function () {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = [mkRow("ART.1A", 24, 30, URL1), mkRow("ART.1B", 24, 30, URL2)];',
  '    elevations = [{ id: "w1", name: "Lobby", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [',
  '      { id: "ART.1A", letter: "A", x: 40, y: 40, w: 24, h: 30, active: true, artworkUrl: URL1 },',
  '      { id: "ART.1B", letter: "B", x: 80, y: 40, w: 24, h: 30, active: true, artworkUrl: URL2 }] }];',
  '    currentElevIndex = 0;',
  '  };',
  '  const art = function (id) { const r = dashProjectData.find(function (x) { return x.id === id; }); return r ? r.artworkUrl : null; };',
  '',
  '  await check("EXACT ASK: the chooser offers the kinds of option, by what changes", async function () {',
  '    setup();',
  '    const ov = openCatOptionChooser(0);',
  '    const kinds = Array.from(ov.querySelectorAll(".cat-kind")).map(function (b) { return b.getAttribute("data-kind"); }).join();',
  '    ov.remove();',
  '    if (kinds !== "images,arrange,arrangeNew,setSame,setNew") throw new Error("kinds: " + kinds);',
  '  });',
  '',
  '  await check("EXACT ASK: the first option turns the wall into the arrangement; its pictures become OPTION 1", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    const w = elevations[0];',
  '    if (!_isCatalogueMaster(w)) throw new Error("the wall did not become the arrangement");',
  '    const items = _catPlacementWalls("ART.1");',
  '    if (items.map(function (i) { return i.label; }).join() !== "OPTION 1,OPTION 2") throw new Error("got " + items.map(function (i) { return i.label; }).join());',
  '    if (art("ART.1.1A") !== URL1 || art("ART.1.1B") !== URL2) throw new Error("OPTION 1 did not keep the pictures");',
  '    if (art("ART.1.2A") || art("ART.1.2B")) throw new Error("OPTION 2 is not empty");',
  '    if (art("ART.1A") || art("ART.1B")) throw new Error("the arrangement slots still carry pictures (they print nowhere)");',
  '  });',
  '',
  '  await check("same frames and images, new arrangement: a layout whose option carries the pictures", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    const opt1 = elevations.findIndex(function (e) { return e.catalogueOption === "1"; });',
  '    _catAddOptionOfKind(opt1, "arrange", "Stacked");',
  '    const items = _catPlacementWalls("ART.1");',
  '    const lay = items.filter(function (i) { return i.layout !== elevations[0]; });',
  '    if (!lay.length) throw new Error("no second layout");',
  '    const ids = (lay[0].wall.frames || []).map(function (f) { return f.id; });',
  '    if (!ids.some(function (id) { return art(id) === URL1; })) throw new Error("the new arrangement did not carry the pictures");',
  '    if (_catLayoutLabel(lay[0].layout) !== "Stacked") throw new Error("name not kept");',
  '  });',
  '',
  '  await check("different frame count and images: a new frame set, no pictures carried", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    _catAddOptionOfKind(0, "setNew", "Single");',
  '    if (_catSetsOf("ART.1").length !== 2) throw new Error("sets: " + _catSetsOf("ART.1").join());',
  '    const set2 = _catPlacementWalls("ART.1").filter(function (i) { return i.setNum === 2; });',
  '    if (!set2.length) throw new Error("set 2 is not an option");',
  '    set2.forEach(function (i) { (i.wall.frames || []).forEach(function (f) { if (art(f.id)) throw new Error("set 2 carried a picture"); }); });',
  '  });',
  '',
  '  await check("every option still shares ONE pin: options and alternate layouts stay off the plan", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    _catAddOptionOfKind(0, "setNew");',
  '    _fpSetPin(dashProjectData.find(function (r) { return r.id === "ART.1A"; }), 0, 0.5, 0.5);',
  '    _catSyncAllOptions();',
  '    const keys = _fpGroups().filter(function (g) { return g.planX != null; }).map(function (g) { return g.key; });',
  '    if (keys.length !== 1) throw new Error("pins on the plan: " + keys.join());',
  '  });',
  '',
  '  await check("EXACT ASK: the options map is a tree, placement > frame set > layout > option", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    _catAddOptionOfKind(0, "setNew");',
  '    const ov = openOptionsMap("ART.1");',
  '    const root = ov.querySelector(".cat-node-root");',
  '    if (!root || root.textContent.indexOf("ART.1") < 0) throw new Error("no root node");',
  '    if (ov.querySelectorAll(".cat-node-set").length !== 2) throw new Error("frame set nodes: " + ov.querySelectorAll(".cat-node-set").length);',
  '    // 17.97: a new frame set gets its first (empty) option, so it has pages: 2 + 1.',
  '    if (ov.querySelectorAll(".cat-node-option").length !== 3) throw new Error("option nodes: " + ov.querySelectorAll(".cat-node-option").length);',
  '    const opt = ov.querySelector(".cat-node-option");',
  '    if (opt.closest(".cat-kids").parentNode.querySelector(".cat-node-layout") == null) throw new Error("an option is not under its layout");',
  '    if (!opt.querySelector("svg")) throw new Error("no sketch on an option node");',
  '    if (opt.querySelector(".cat-node-fill").textContent.indexOf("/") < 0) throw new Error("no image count");',
  '    ov.remove();',
  '  });',
  '',
  '  await check("EXACT ASK: one all-options page per placement, in front of its pages, and it can be switched off", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    let pages = _deckPageList();',
  '    const ov = pages.filter(function (d) { return d.kind === "catov"; });',
  '    if (ov.length !== 1 || ov[0].place !== "ART.1") throw new Error("overview pages: " + ov.length);',
  '    const iov = pages.indexOf(ov[0]);',
  '    const firstOther = pages.findIndex(function (d) { return d.kind === "spec" && (d.title || "").indexOf("ART.1") === 0; });',
  '    if (!(firstOther > iov)) throw new Error("the overview is not in front of the placement pages");',
  '    editorialContent.catOverview = false;',
  '    pages = _deckPageList();',
  '    if (pages.some(function (d) { return d.kind === "catov"; })) throw new Error("switched off but still there");',
  '  });',
  '',
  '  await check("the PDF export asks the SAME rule and draws the page (two builders, one answer)", async function () {',
  '    const s = APP_SRC;',
  '    const a = s.indexOf("const _stepsFor = (u, li) => {");',
  '    if (a < 0 || s.slice(a, a + 400).indexOf("_catOverviewFor(u, _units)") < 0) throw new Error("the export does not ask _catOverviewFor");',
  '    if (s.indexOf("if (step.type === \\"catov\\")") < 0 && s.indexOf("if (step.type === " + String.fromCharCode(39) + "catov" + String.fromCharCode(39) + ")") < 0) throw new Error("the export never draws a catov step");',
  '    const b = s.indexOf("const specPagesFor = (u) => {");',
  '    if (b < 0 || s.slice(b, b + 300).indexOf("_catOverviewFor(u, units)") < 0) throw new Error("the studio does not ask _catOverviewFor");',
  '  });',
  '',
  '  await check("EXACT ASK: the overview draws every option, labelled, at ONE scale", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    _catAddOptionOfKind(0, "setNew");',
  '    const set2 = _catPlacementWalls("ART.1").find(function (i) { return i.setNum === 2; });',
  '    set2.wall.frames = [set2.wall.frames[0]];',
  '    set2.wall.frames[0].w = 48; set2.wall.frames[0].h = 60;',
  '    const rec = new CanvasPdfRec(936, 540);',
  '    await _drawCatOverviewPage(rec, {}, 1, {}, "ART.1", { PW: 936, PH: 540 });',
  '    const txt = rec.ops.filter(function (o) { return o.t === "text"; }).map(function (o) { return o.str; });',
  '    ["OPTION 1", "OPTION 2", "OPTION 3"].forEach(function (l) { if (txt.indexOf(l) < 0) throw new Error(l + " not drawn"); });',
  '    const imgs = rec.ops.filter(function (o) { return o.t === "img"; }).map(function (o) { return o.a; });',
  '    if (imgs.length < 5) throw new Error("frames drawn: " + imgs.length);',
  '    const ws = imgs.map(function (a) { return a[2]; });',
  '    const small = Math.min.apply(null, ws), big = Math.max.apply(null, ws);',
  '    const ratio = big / small;',
  '    if (Math.abs(ratio - 2) > 0.05) throw new Error("a 48in frame is " + ratio.toFixed(2) + "x a 24in one; not one scale");',
  '  });',
  '',
  '  await check("an image option and a frame set never share a code (they would merge into one spec page)", async function () {',
  '    setup();',
  '    _catAddOptionOfKind(0, "images");',
  '    _catAddOptionOfKind(0, "setNew");',
  '    _catAddOptionOfKind(0, "images");',
  '    const groups = {};',
  '    _catPlacementWalls("ART.1").forEach(function (it) {',
  '      (it.wall.frames || []).forEach(function (f) { const g = _artGroupKey(f.id); (groups[g] = groups[g] || new Set()).add(it.wall); });',
  '    });',
  '    Object.keys(groups).forEach(function (g) { if (groups[g].size > 1) throw new Error(g + " is claimed by " + groups[g].size + " options"); });',
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
