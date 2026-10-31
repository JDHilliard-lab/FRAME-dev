// THE PRICE FOLLOWS THE SIZE (19.94). Oversized frames over budget: shrink one in the form
// and the budget chip moves on that keystroke. Estimates are worked out from the rate card
// and the size on every read (never a stored number); a quote remembers the size it was for,
// and once the piece is resized the new size's estimate stands in and it is flagged to re-quote.
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
window.JSZip = require(path.join(root, 'lib-jszip.min.js'));
window.DOMParser = window.DOMParser;
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  '_autosaveToldUser = true;',
  'var __modals = []; showInfoModal = function (t, b) { __modals.push(t + ": " + b); };',
  '_toast = function () { return null; };',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", imageCode: "FGD." + id /* 19.96: an F code, Farmboy\u2019s own, carries no royalty, so these numbers are markup alone */, qty: 1, location: "Lobby" }, o || {}); };',
  '  const fresh = function () {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    dashProjectData = [mk("ART.1", { vendorName: "Bruce White Gallery" }), mk("ART.2", { qty: 2, location: "Gallery" }), mk("ART.3", { qty: 0 })];',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory(); __modals.length = 0;',
  '  };',
  '  const row = function (id) { return dashProjectData.find(function (r) { return r.id === id; }); };',
  '',
  '  const chip = function () { return document.getElementById("dashProdBtn"); };',
  '  const card = function () { setRateCard([{ product: "Framed Art", base: 100, perSqFt: 20 }], "2026-10-01"); _pricingSet({ markup: 2, budget: 3000 }, true); };',
  '  await check("an estimate is worked out from the size every read: no Update estimates needed", async function () {',
  '    fresh(); card();',
  '    row("ART.1").extW = 36; row("ART.1").extH = 48;',
  '    const p = _priceRow(row("ART.1"));',
  '    if (p.cost !== 100 + 20 * 12 || p.src !== "estimate" || p.at !== "2026-10-01") throw new Error(JSON.stringify(p));',
  '    if ("unitCost" in row("ART.1")) throw new Error("reading a price stored one");',
  '    row("ART.1").extW = 24; row("ART.1").extH = 36;',
  '    if (_priceRow(row("ART.1")).cost !== 100 + 20 * 6) throw new Error("did not follow the size");',
  '  });',
  '  await check("EXACT ASK: shrinking an oversized frame in the form moves the budget chip on that keystroke", async function () {',
  '    fresh(); card();',
  '    dashProjectData.forEach(function (r) { r.extW = 48; r.extH = 60; });',
  '    dashSelectedRowIndex = 0; loadDashDataIntoControls(row("ART.1"));',
  '    const before = chip().textContent;',
  '    if (before.indexOf("over") < 0) throw new Error("oversized should be over budget: " + before);',
  '    document.getElementById("extW").value = "24"; document.getElementById("extH").value = "30";',
  '    handleODInput(\"W\"); handleODInput(\"H\"); /* what the size fields call on every keystroke */',
  '    const after = chip().textContent;',
  '    if (after === before) throw new Error("chip did not move: " + after);',
  '    if (row("ART.1").extW !== 24) throw new Error("row not resized " + row("ART.1").extW);',
  '    if (after.indexOf("ART.1 $400") < 0) throw new Error("piece price " + after);',
  '  });',
  '  await check("a quote remembers its size; resized, the new size is estimated and flagged to re-quote", async function () {',
  '    fresh(); card();',
  '    row("ART.1").extW = 48; row("ART.1").extH = 60;',
  '    setRowPrice("ART.1", { unitCost: 2000, unitSell: 4500 }, true);',
  '    if (row("ART.1").priceFor !== "48x60") throw new Error("priceFor " + row("ART.1").priceFor);',
  '    let p = _priceRow(row("ART.1"));',
  '    if (p.cost !== 2000 || p.sell !== 4500 || p.resized) throw new Error("quote at its own size " + JSON.stringify(p));',
  '    row("ART.1").extW = 24; row("ART.1").extH = 36;',
  '    p = _priceRow(row("ART.1"));',
  '    if (!p.resized || p.src !== "estimate" || p.cost !== 220 || p.sell !== 440) throw new Error("resized " + JSON.stringify(p));',
  '    if (_priceTotals().resized.join() !== "ART.1") throw new Error("totals");',
  '    if (row("ART.1").unitCost !== 2000) throw new Error("the quote itself must be kept");',
  '    row("ART.1").extW = 48; row("ART.1").extH = 60;',
  '    if (_priceRow(row("ART.1")).cost !== 2000) throw new Error("back at the quoted size, the quote returns");',
  '  });',
  '  await check("with no rate card a resized quote is kept, flagged; an old quote with no size is never flagged", async function () {',
  '    fresh(); row("ART.1").extW = 48; row("ART.1").extH = 60;',
  '    setRowPrice("ART.1", { unitCost: 2000 }, true); row("ART.1").extW = 24;',
  '    const p = _priceRow(row("ART.1"));',
  '    if (p.cost !== 2000 || !p.resized || p.src !== "quote") throw new Error(JSON.stringify(p));',
  '    delete row("ART.1").priceFor; if (_priceRow(row("ART.1")).resized) throw new Error("legacy flagged");',
  '  });',
  '  await check("a cm project keys sizes in inches", async function () {',
  '    fresh(); dashUnit = "cm"; row("ART.1").extW = 60.96; row("ART.1").extH = 91.44;',
  '    setRowPrice("ART.1", { unitCost: 10 }, true);',
  '    if (row("ART.1").priceFor !== "24x36") throw new Error(row("ART.1").priceFor);',
  '    dashUnit = "in";',
  '  });',
  '  await check("re-importing an exported sheet of estimates does not freeze them into quotes", async function () {',
  '    fresh(); card(); row("ART.1").extW = 36; row("ART.1").extH = 48;',
  '    const rows = [["Item Code", "Unit Cost", "Cost Source"], ["ART.1", String(_priceRow(row("ART.1")).cost), "estimate"]];',
  '    const res = _priceImportRows(rows);',
  '    if (res.updated.length) throw new Error("an unchanged estimate was imported: " + JSON.stringify(row("ART.1")));',
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
