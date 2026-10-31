// FRAME AND MAT SAMPLES (19.87). Caesars: the client rejected three gloss mouldings after
// the sample round, and two IFS pages still carried the old codes when the PM issued POs.
// The codes are derived from the pieces; only the client's verdict is stored. A rejected
// code still on a piece is a Preflight ERROR, Replace swaps it everywhere in one undo
// entry, and an IFS deck warns about samples nobody has approved.
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
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", artworkUrl: "data:x" }, o || {}); };',
  '  const setVer = function (v) { const el = document.getElementById("specPdfVersion"); if (el) el.value = v; else window._specPdfMeta = { version: v }; };',
  '  const fresh = function () {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = [',
  '      mk("ART.1", { fCode: "MICH 145-30", fColorName: "Bright Gold", m1ColorName: "B97 White" }),',
  '      mk("ART.2", { fCode: "MICH 145-30", fColorName: "Bright Gold", m1ColorName: "B97 White", m2A: true, m2: 0.25, m2ColorName: "Black" }),',
  '      mk("ART.3", { fCode: "MICH 360-09", product: "Framed Art", useFloatMount: true, sbBackerColorName: "B97 White" }),',
  '      mk("ART.4", { fCode: "MICH 999-99", product: "Sourced Object" }),',
  '      mk("ART.5", { fCode: "MICH 241-38", product: "Framed Canvas (Floater)", m1ColorName: "Should Not Show" })',
  '    ];',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [Object.assign(_cloneData(dashProjectData[0]), { x: 10, y: 40, active: true })] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory();',
  '    setVer("V6");',
  '  };',
  '',
  '  await check("frames and mats are derived from the pieces, each listing who uses it", async function () {',
  '    fresh();',
  '    const its = _sampleItems();',
  '    const keys = its.map(function (i) { return i.key; }).join("|");',
  '    if (keys !== "f:MICH 145-30|f:MICH 241-38|f:MICH 360-09|m:B97 White|m:Black") throw new Error(keys);',
  '    const gold = its[0]; if (gold.ids.join() !== "ART.1,ART.2" || gold.label !== "Bright Gold") throw new Error(JSON.stringify(gold));',
  '    const white = its.find(function (i) { return i.key === "m:B97 White"; });',
  '    if (white.ids.join() !== "ART.1,ART.2,ART.3") throw new Error("float mount backer is a mat sample: " + white.ids);',
  '    if (its.some(function (i) { return i.code === "MICH 999-99" || i.code === "Should Not Show"; })) throw new Error("a sourced object or a floater mat was listed");',
  '  });',
  '',
  '  await check("a verdict is stored with its date, one undo entry, and an empty one leaves nothing behind", async function () {',
  '    fresh(); const n0 = undoStack.length;',
  '    setSampleStatus("f", "MICH 145-30", { st: "approved" });',
  '    const r = editorialContent.samples["f:MICH 145-30"];',
  '    if (!r || r.st !== "approved" || !/^\\d{4}-\\d\\d-\\d\\d$/.test(r.at)) throw new Error(JSON.stringify(r));',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo entries");',
  '    setSampleStatus("f", "MICH 145-30", { st: "" });',
  '    if ("samples" in editorialContent) throw new Error("empty shell kept: " + JSON.stringify(editorialContent.samples));',
  '  });',
  '',
  '  await check("EXACT BUG: a rejected frame still on pieces is a Preflight error naming them", async function () {',
  '    fresh();',
  '    setSampleStatus("f", "MICH 145-30", { st: "rejected", use: "MICH 145-10" });',
  '    const e = _dsRunPreflight().filter(function (i) { return i.sev === "err" && i.prod && i.text.indexOf("MICH 145-30") === 0; });',
  '    if (e.length !== 1 || e[0].text.indexOf("ART.1, ART.2") < 0 || e[0].text.indexOf("MICH 145-10") < 0) throw new Error(JSON.stringify(e));',
  '  });',
  '',
  '  await check("Replace puts the new code on every piece and its wall copy, clears the error, one undo entry, undo puts it back", async function () {',
  '    fresh();',
  '    setSampleStatus("f", "MICH 145-30", { st: "rejected" });',
  '    const n0 = undoStack.length;',
  '    const n = sampleReplace("f", "MICH 145-30", "MICH 145-10");',
  '    if (n !== 2) throw new Error("replaced " + n);',
  '    const codes = dashProjectData.slice(0, 2).map(function (r) { return r.fCode; }).join();',
  '    if (codes !== "MICH 145-10,MICH 145-10") throw new Error(codes);',
  '    if (elevations[0].frames[0].fCode !== "MICH 145-10") throw new Error("wall copy kept " + elevations[0].frames[0].fCode);',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo entries " + (undoStack.length - n0));',
  '    const s = editorialContent.samples["f:MICH 145-30"]; if (s.st !== "rejected" || s.use !== "MICH 145-10") throw new Error(JSON.stringify(s));',
  '    if (_samplePreflight().some(function (i) { return i.sev === "err"; })) throw new Error("still an error");',
  '    undo();',
  '    if (dashProjectData[0].fCode !== "MICH 145-30") throw new Error("undo did not restore");',
  '  });',
  '',
  '  await check("a mat is replaced in whichever slot holds it (mat 1, mat 2, float backer)", async function () {',
  '    fresh();',
  '    sampleReplace("m", "B97 White", "B98 Bright White");',
  '    const got = [dashProjectData[0].m1ColorName, dashProjectData[1].m1ColorName, dashProjectData[2].sbBackerColorName, dashProjectData[1].m2ColorName].join("|");',
  '    if (got !== "B98 Bright White|B98 Bright White|B98 Bright White|Black") throw new Error(got);',
  '  });',
  '',
  '  await check("an IFS deck warns about samples not approved; earlier versions do not", async function () {',
  '    fresh();',
  '    if (_samplePreflight().length) throw new Error("V6 warned");',
  '    setVer("V7 IFS");',
  '    if (!_deckIsIFS()) throw new Error("V7 IFS not read as IFS");',
  '    let w = _samplePreflight().filter(function (i) { return i.sev === "warn"; });',
  '    if (w.length !== 1 || w[0].text.indexOf("5 frame/mat samples") !== 0) throw new Error(JSON.stringify(w));',
  '    _sampleItems().forEach(function (i) { setSampleStatus(i.kind, i.code, { st: "approved" }, true); });',
  '    if (_samplePreflight().length) throw new Error("still warns once approved");',
  '    setVer("Issued for Specification"); if (!_deckIsIFS()) throw new Error("spelled out");',
  '  });',
  '',
  '  await check("the request lists only what is not sent, quantity = sets x recipients; Mark sent is one undo", async function () {',
  '    fresh();',
  '    editorialContent.sampleSets = 2;',
  '    editorialContent.sampleTo = "PSA Hong Kong" + String.fromCharCode(10) + "Level 20" + String.fromCharCode(10, 10) + "BW&A Henderson";',
  '    setSampleStatus("f", "MICH 360-09", { st: "sent" }, true);',
  '    const r = _sampleRequestText();',
  '    if (r.count !== 4) throw new Error("count " + r.count);',
  '    if (r.text.indexOf("MICH 360-09") >= 0) throw new Error("a sent sample was asked for again");',
  '    if (r.text.indexOf("MICH 145-30, Bright Gold") < 0 || r.text.indexOf("QTY: 4") < 0) throw new Error(r.text);',
  '    if (r.text.indexOf("1.") < 0 || r.text.indexOf("2.") < 0 || r.text.indexOf("2 sets") < 0) throw new Error(r.text);',
  '  });',
  '',
  '  await check("the window opens on the shared dialog shell with one close control, from the Production button (19.95; it left the Edit menu)", async function () {',
  '    fresh();',
  '    openProduction("samples");',
  '    const m = document.getElementById("productionModal");',
  '    if (!m || m.className.indexOf("frame-modal") < 0) throw new Error("no shell");',
  '    if (m.querySelectorAll("[data-modal-close]").length !== 1) throw new Error("close controls");',
  '    if (m.querySelectorAll("#sampleTable tr[data-sample]").length !== 5) throw new Error("rows");',
  '    m.remove();',
  '    const pb = document.getElementById("dashProdBtn"); if (!pb || (pb.getAttribute("onclick") || "").indexOf("openProduction(") < 0) throw new Error("no Production button");',
  '    const pf = APP_SRC.slice(APP_SRC.indexOf("function _dsShowPreflight("), APP_SRC.indexOf("function _dsShowPreflight(") + 12000);',
  '    if (pf.indexOf("openProduction(it.prod.tab)") < 0) throw new Error("Preflight has no way there");',
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
