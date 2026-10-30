// VENDORS AND THE PRODUCTION PACK (19.89). Caesars went to Bruce White (framed) and Duggal
// (prints, acrylic); the PM split the RFI by hand and hid the sourced objects and the
// originals, and the production designer made a contact sheet per vendor. The pack is built
// from the rows: an RFI per vendor with only that vendor's pieces, purchases never on an RFI,
// a contact sheet captioned <image code>_<W>x<H> (print size), and the vendor in the CSV.
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
window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  '_autosaveToldUser = true;',
  'var __modals = []; showInfoModal = function (t) { __modals.push(t); };',
  '_toast = function () { return null; };',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", imageCode: "GDC." + id }, o || {}); };',
  '  const fresh = function () {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    dashProjectData = [',
  '      mk("ART.1", { vendorName: "Bruce White Gallery" }),',
  '      mk("ART.2", { vendorName: "Duggal", product: "Frameless Canvas (Wrapped)" }),',
  '      mk("ART.3", { vendorName: "Bruce White Gallery" }),',
  '      mk("ART.4", { product: "Sourced Object", imageCode: "FSO.GL.3.31698", sourceUrl: "https://shop.example/vase" }),',
  '      mk("ART.5", { imageCode: "FAO.Ricassa.1", vendorName: "Bruce White Gallery" }),',
  '      mk("ART.6")',
  '    ];',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory();',
  '  };',
  '  const codesIn = function (csv) {',
  '    const L = csv.split(String.fromCharCode(10)); const hi = L.findIndex(function (l) { return l.indexOf("ITEM CODE") >= 0; });',
  '    const ci = L[hi].split(",").indexOf("ITEM CODE");',
  '    return L.slice(hi + 1).filter(Boolean).map(function (l) { return l.split(",")[ci].replace(/"/g, ""); }).join();',
  '  };',
  '',
  '  await check("EXACT BUG: one RFI per vendor holding only its pieces; purchases and originals never on an RFI", async function () {',
  '    fresh();',
  '    const p = _prodPackPlan();',
  '    if (p.vendors.map(function (v) { return v.name + ":" + v.rows.map(function (r) { return r.id; }).join("+"); }).join() !== "Bruce White Gallery:ART.1+ART.3,Duggal:ART.2") throw new Error(JSON.stringify(p.vendors.map(function (v) { return v.name; })));',
  '    if (p.purchases.map(function (r) { return r.id; }).join() !== "ART.4,ART.5") throw new Error("purchases " + p.purchases.map(function (r) { return r.id; }));',
  '    if (p.unassigned.map(function (r) { return r.id; }).join() !== "ART.6") throw new Error("unassigned");',
  '    const files = await _prodPackFiles({ noPdf: true });',
  '    const bw = files.find(function (f) { return /\\.RFI\\.Bruce-White-Gallery\\.csv$/.test(f.name); });',
  '    if (!bw || codesIn(bw.data) !== "ART.1,ART.3") throw new Error("Bruce RFI: " + (bw && codesIn(bw.data)));',
  '    const dg = files.find(function (f) { return /\\.RFI\\.Duggal\\.csv$/.test(f.name); });',
  '    if (!dg || codesIn(dg.data) !== "ART.2") throw new Error("Duggal RFI");',
  '    const nv = files.find(function (f) { return /RFI\\.NO-VENDOR\\.csv$/.test(f.name); });',
  '    if (!nv || codesIn(nv.data) !== "ART.6") throw new Error("no-vendor RFI");',
  '    files.filter(function (f) { return f.name.indexOf(".RFI.") >= 0; }).forEach(function (f) { if (/ART\\.4|ART\\.5/.test(codesIn(f.data))) throw new Error("a purchase went on " + f.name); });',
  '    const pu = files.find(function (f) { return /\\.Purchases\\.csv$/.test(f.name); });',
  '    if (!pu || pu.data.indexOf("https://shop.example/vase") < 0 || pu.data.indexOf("FAO.Ricassa.1") < 0) throw new Error("purchase tracker");',
  '  });',
  '',
  '  await check("the full database export still has every row", async function () {',
  '    fresh();',
  '    if (codesIn(buildDashCSVString()) !== "ART.1,ART.2,ART.3,ART.4,ART.5,ART.6") throw new Error(codesIn(buildDashCSVString()));',
  '  });',
  '',
  '  await check("vendor and source URL are one undo entry and an emptied field is removed", async function () {',
  '    fresh(); const n0 = undoStack.length;',
  '    if (setRowsProduction(["ART.6", "ART.1"], { vendorName: " Northwood " }) !== 2) throw new Error("count");',
  '    if (dashProjectData[5].vendorName !== "Northwood" || dashProjectData[0].vendorName !== "Northwood") throw new Error("not set/trimmed");',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo entries");',
  '    setRowsProduction(["ART.6"], { vendorName: "" });',
  '    if ("vendorName" in dashProjectData[5]) throw new Error("empty kept");',
  '  });',
  '',
  '  await check("the contact sheet caption is the print file name: image code _ W x H at print size", async function () {',
  '    fresh();',
  '    const r = dashProjectData[0]; const sz = _rowOpeningAndPrint(r);',
  '    const want = "GDC.ART.1_" + _fmtUnitNum(sz.printW, "in") + "x" + _fmtUnitNum(sz.printH, "in");',
  '    if (_contactSheetCaption(r) !== want) throw new Error(_contactSheetCaption(r) + " vs " + want);',
  '    if (!(sz.printW > sz.openW)) throw new Error("print size should carry bleed");',
  '    if (/\\.(jpe?g|png|tiff?)_/i.test(_contactSheetCaption(r))) throw new Error("extension in the code");',
  '  });',
  '',
  '  await check("a real jsPDF contact sheet: one page per twelve, every caption on it", async function () {',
  '    fresh();',
  '    const rows = []; for (let i = 1; i <= 13; i++) rows.push(mk("ART." + i, { vendorName: "Duggal" }));',
  '    const doc = await _contactSheetPdf(rows, "CANO  \\u00b7  Duggal");',
  '    if (doc.internal.getNumberOfPages() !== 2) throw new Error("pages " + doc.internal.getNumberOfPages());',
  '    const raw = doc.output();',
  '    if (raw.indexOf("GDC.ART.13_") < 0 || raw.indexOf("GDC.ART.1_") < 0) throw new Error("captions missing");',
  '  });',
  '',
  '  await check("Vendor and Source URL survive a CSV export and import", async function () {',
  '    fresh();',
  '    const text = buildDashCSVString();',
  '    dashProjectData.forEach(function (r) { delete r.vendorName; delete r.sourceUrl; });',
  '    importDashCSV({ target: { files: [new window.File([text], "x.csv")], value: "" } });',
  '    for (let i = 0; i < 60 && !dashProjectData.some(function (r) { return r.vendorName; }); i++) await new Promise(function (res) { setTimeout(res, 10); });',
  '    const got = dashProjectData.map(function (r) { return r.id + ":" + (r.vendorName || "") + ":" + (r.sourceUrl || ""); }).join("|");',
  '    if (got.indexOf("ART.1:Bruce White Gallery:") < 0 || got.indexOf("ART.4::https://shop.example/vase") < 0) throw new Error(got);',
  '  });',
  '',
  '  await check("the Vendors tab lists every piece and is reached from the Export menu", async function () {',
  '    fresh(); openProduction("vendors");',
  '    const m = document.getElementById("productionModal");',
  '    if (m.querySelectorAll("#prodVendorTable tr[data-prod-row]").length !== 6) throw new Error("rows");',
  '    if (m.querySelectorAll("[data-modal-close]").length !== 1) throw new Error("close");',
  '    m.remove();',
  '    const menu = APP_SRC.slice(APP_SRC.indexOf("function openDashMenu("), APP_SRC.indexOf("async function _svgExportAs("));',
  '    if (menu.indexOf("openProduction(\\x27vendors\\x27)") < 0) throw new Error("not in the menu");',
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
