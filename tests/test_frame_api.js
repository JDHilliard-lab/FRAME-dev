// FRAME_API (19.86): the door a deck-building agent comes in by. Each call wraps the
// function the UI already uses; these checks pin what a driver relies on: codes are the
// FINAL codes, sizes are inches whatever the project unit, a write is one undo entry,
// a failure is an { error } and never a modal, and the export hands the PDF back.
// Canvas, image decoding and the real PDF are checked in headless Chrome (jsdom has none).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const TPL = fs.readFileSync(path.join(root, 'templates.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  '_autosaveToldUser = true;',
  'var __modals = []; showInfoModal = function (t) { __modals.push(t); };',
  '_toast = function () { return null; };',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const mk = function (id) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed" }); };',
  '  const fresh = function (ids) {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = ids.map(mk);',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory();',
  '    __modals.length = 0;',
  '  };',
  '  const A = window.FRAME_API;',
  '',
  '  await check("the API is on window with every call a driver needs", async function () {',
  '    if (!A || A.version !== 1) throw new Error("no FRAME_API");',
  '    ["app","listItems","listWalls","listPages","listTemplates","describePage","addItem","setItem","setArtwork","hang","addPage","fillPage","renderPage","exportPDF","saveProject","loadProject"].forEach(function (k) {',
  '      if (typeof A[k] !== "function") throw new Error("missing " + k);',
  '    });',
  '    if (A.app().version !== APP_VERSION) throw new Error("version");',
  '  });',
  '',
  '  await check("EXACT BUG: a new code is reported as it is AFTER the settle renumbers it", async function () {',
  '    fresh(["ART.1", "ART.3"]);',   // a gap: the new code is minted ART.4 and settles to ART.3
  '    const r = A.addItem({ category: "framed", set: "n2" });',
  '    if (r.error) throw new Error(r.error);',
  '    if (r.code !== "ART.3" || r.ids.join() !== "ART.3A,ART.3B") throw new Error(JSON.stringify(r));',
  '    if (r.ids.some(function (id) { return !dashProjectData.some(function (x) { return x.id === id; }); })) throw new Error("ids not in the project");',
  '    if (dashProjectData.some(function (x) { return "_mintMark" in x; })) throw new Error("the marker was left on a row");',
  '  });',
  '',
  '  await check("addItem takes inches in a cm project, hangs on its own wall, and is ONE undo entry", async function () {',
  '    fresh(["ART.1"]); dashUnit = "cm"; elevUnit = "cm";',
  '    try {',
  '      const n0 = undoStack.length;',
  '      const r = A.addItem({ category: "framed", set: "n1", hang: true, location: "Lobby", widthIn: 30, heightIn: 40 });',
  '      if (r.error) throw new Error(r.error);',
  '      const row = dashProjectData.find(function (x) { return x.id === r.ids[0]; });',
  '      if (Math.abs(parseFloat(row.extW) - 76.2) > 0.01) throw new Error("extW " + row.extW);',
  '      const it = A.listItems().find(function (x) { return x.id === r.ids[0]; });',
  '      if (Math.abs(it.widthIn - 30) > 0.01 || Math.abs(it.heightIn - 40) > 0.01 || it.location !== "Lobby") throw new Error(JSON.stringify(it));',
  '      if (!r.wallId || it.wallId !== r.wallId) throw new Error("not hung: " + JSON.stringify(r));',
  '      const w = A.listWalls().find(function (x) { return x.id === r.wallId; });',
  '      if (!w || !w.frames.some(function (f) { return f.id === r.ids[0]; })) throw new Error("wall does not hold it");',
  '      if (undoStack.length - n0 !== 1) throw new Error("undo entries " + (undoStack.length - n0));',
  '    } finally { dashUnit = "in"; elevUnit = "in"; }',
  '  });',
  '',
  '  await check("hang refuses a code already on a wall; bad input comes back as { error }, never a modal", async function () {',
  '    fresh(["ART.1"]);',
  '    if (!A.hang("ART.1").wallId) throw new Error("did not hang");',
  '    if (!A.hang("ART.1").error) throw new Error("hung twice");',
  '    if (!A.hang("ART.9").error) throw new Error("unknown code");',
  '    if (!A.addItem({ category: "nope" }).error) throw new Error("unknown category");',
  '    if (!A.addItem({ set: "nope" }).error) throw new Error("unknown set");',
  '    if (!A.setItem("ART.9", {}).error) throw new Error("unknown item");',
  '    if (!(await A.setArtwork("ART.9", "x")).error) throw new Error("artwork on unknown item");',
  '    if (!(await A.setArtwork("ART.1", null)).error) throw new Error("no image");',
  '    if (!A.describePage("layout:nope").error) throw new Error("unknown page");',
  '    if (!(await A.renderPage("layout:nope")).error) throw new Error("render unknown page");',
  '    if (__modals.length) throw new Error("a modal opened: " + __modals.join());',
  '  });',
  '',
  '  await check("setItem writes text and inch sizes, and the wall frame follows", async function () {',
  '    fresh(["ART.1"]); A.hang("ART.1");',
  '    const r = A.setItem("ART.1", { artist: "Ana", title: "Field", widthIn: 18, heightIn: 24 });',
  '    if (r.error) throw new Error(r.error);',
  '    const row = dashProjectData[0];',
  '    if (row.artist !== "Ana" || row.artworkTitle !== "Field" || parseFloat(row.extW) !== 18) throw new Error(JSON.stringify([row.artist, row.artworkTitle, row.extW]));',
  '    const f = elevations[0].frames.find(function (x) { return x.id === "ART.1"; });',
  '    if (!f || Math.abs(f.w - 18) > 0.01) throw new Error("wall frame w " + (f && f.w));',
  '  });',
  '',
  '  await check("addPage makes a layout page from a master, at the END of the deck, filled slot by slot", async function () {',
  '    fresh(["ART.1"]);',
  '    const tpl = A.listTemplates().find(function (t) { return t.name === "Right Image (Bleed)"; });',
  '    if (!tpl || tpl.texts < 3 || tpl.images !== 1) throw new Error("template listing " + JSON.stringify(tpl));',
  '    const n0 = undoStack.length;',
  '    const r = await A.addPage({ template: "right image (bleed)", texts: ["LOBBY", null, "Copy."] });',
  '    if (r.error) throw new Error(r.error);',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo entries " + (undoStack.length - n0));',
  '    const pages = A.listPages();',
  '    if (pages[pages.length - 1].key !== r.key) throw new Error("not last: " + pages.map(function (p) { return p.key; }).join());',
  '    const d = A.describePage(r.key);',
  '    if (d.texts[0].text !== "LOBBY" || d.texts[2].text !== "Copy.") throw new Error(JSON.stringify(d.texts));',
  '    if (d.texts[1].text !== " SECTION SUBHEADING") throw new Error("a null slot was overwritten: " + d.texts[1].text);',
  '    if (d.images.length !== 1 || d.images[0].filled) throw new Error("image slots " + JSON.stringify(d.images));',
  '    const after = await A.addPage({ template: 0, after: pages[0].key });',
  '    const keys = A.listPages().map(function (p) { return p.key; });',
  '    if (keys.indexOf(after.key) !== keys.indexOf(pages[0].key) + 1) throw new Error("after ignored");',
  '  });',
  '',
  '  await check("fillPage drops rich runs (or the template wording keeps printing) and names a missing slot", async function () {',
  '    fresh(["ART.1"]);',
  '    const r = await A.addPage({ template: 0 });',
  '    const pg = editorialContent.layoutPages.find(function (p) { return "layout:" + p.id === r.key; });',
  '    const el = pg.elements.find(function (e) { return e.type === "text"; });',
  '    el.runs = [{ text: "OLD" }];',
  '    const f = await A.fillPage(r.key, { texts: { 0: "NEW" } });',
  '    if (f.error) throw new Error(f.error);',
  '    if (el.text !== "NEW" || "runs" in el) throw new Error("runs kept");',
  '    const bad = await A.fillPage(r.key, { texts: { 40: "x" } });',
  '    if (!bad.error || bad.error.indexOf("text slot 40") < 0) throw new Error("missing slot not named: " + JSON.stringify(bad));',
  '    if (!(await A.fillPage("fixed:cover", { texts: ["x"] })).error) throw new Error("filled a fixed page");',
  '  });',
  '',
  '  await check("a project saved through the API opens again with the same items and pages", async function () {',
  '    fresh(["ART.1"]); A.addItem({ set: "n3" }); await A.addPage({ template: 0, texts: ["HELLO"] });',
  '    const items = A.listItems().map(function (i) { return i.id; }).join();',
  '    const pages = A.listPages().map(function (p) { return p.key; }).join();',
  '    const txt = A.saveProject();',
  '    dashProjectData = []; editorialContent = _editorialDefaults();',
  '    const r = A.loadProject(txt);',
  '    if (r.error) throw new Error(r.error);',
  '    if (A.listItems().map(function (i) { return i.id; }).join() !== items) throw new Error("items");',
  '    if (A.listPages().map(function (p) { return p.key; }).join() !== pages) throw new Error("pages");',
  '  });',
  '',
  '  await check("the export can hand the PDF back without saving it or stopping to ask", async function () {',
  '    const S = APP_SRC.slice(APP_SRC.indexOf("async function exportSpecPagePDF("), APP_SRC.indexOf("// ── PDF build progress overlay"));',
  '    if (S.indexOf("missing.length && !opts.returnPdf") < 0) throw new Error("the missing-wall question still asks a driver");',
  '    if (S.indexOf("if (opts.returnPdf) result = {") < 0 || S.indexOf("else if (deliver)") < 0) throw new Error("returnPdf does not replace the save");',
  '    if (S.indexOf("return result;") < 0) throw new Error("nothing returned");',
  '    if (S.indexOf("} else if (opts.returnPdf) {") < 0) throw new Error("a failure would open a modal for a driver");',
  '  });',
  '  return out;',
  '})();',
].join(NL);
const quiet = console.error; console.error = () => {};
window.APP_SRC = APP;
window.eval(TPL + NL + APP + NL + 'var APP_SRC = window.APP_SRC;' + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
});
