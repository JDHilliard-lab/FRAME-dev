// PRICES AND THE BUDGET (19.91). Caesars' budget and quote lived in an Excel retyped from
// the deck. Every price says where it came from and when; estimates come from a dated rate
// card and are refreshed without touching a quote; Excel is the exchange both ways (a real
// .xlsx with formulas out, an edited sheet back in by item code); prices never print.
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
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", imageCode: "GDC." + id, qty: 1, location: "Lobby" }, o || {}); };',
  '  const fresh = function () {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    dashProjectData = [mk("ART.1", { vendorName: "Bruce White Gallery" }), mk("ART.2", { qty: 2, location: "Gallery" }), mk("ART.3", { qty: 0 })];',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory(); __modals.length = 0;',
  '  };',
  '  const row = function (id) { return dashProjectData.find(function (r) { return r.id === id; }); };',
  '',
  '  await check("sell = cost x markup unless typed; a piece not on a wall prices as one; a typed cost is a dated quote; one undo", async function () {',
  '    fresh(); _pricingSet({ markup: 1.8 }, true);',
  '    const n0 = undoStack.length;',
  '    setRowPrice("ART.1", { unitCost: "$1,000" });',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo");',
  '    const r = row("ART.1"); if (r.unitCost !== 1000 || r.costSrc !== "quote" || r.costAt !== _todayIso()) throw new Error(JSON.stringify([r.unitCost, r.costSrc, r.costAt]));',
  '    if (_priceRow(r).sell !== 1800) throw new Error("sell " + _priceRow(r).sell);',
  '    setRowPrice("ART.1", { unitSell: 2000 }); if (_priceRow(r).sell !== 2000 || !_priceRow(r).hand) throw new Error("hand sell");',
  '    setRowPrice("ART.3", { unitCost: 100 }); if (_priceRow(row("ART.3")).qty !== 1) throw new Error("qty 0 should price as 1");',
  '    setRowPrice("ART.1", { unitCost: "" }); if ("unitCost" in r || "costSrc" in r || "costAt" in r) throw new Error("clear left fields");',
  '  });',
  '',
  '  await check("a catalogue option bills nothing", async function () {',
  '    fresh(); setRowPrice("ART.2", { unitCost: 100 }, true);',
  '    const keep = _catOptionRowIds; _catOptionRowIds = function () { return { "ART.2": true }; };',
  '    try { if (_priceRow(row("ART.2")).qty !== 0 || _priceTotals().cost !== 0) throw new Error("option billed"); } finally { _catOptionRowIds = keep; }',
  '  });',
  '',
  '  await check("Update estimates fills from the dated rate card and NEVER touches a quote; sizes are inches in a cm project", async function () {',
  '    fresh();',
  '    setRateCard([{ product: "Framed Art", base: 100, perSqFt: 10, doubleMat: 25 }], "2026-09-01");',
  '    setRowPrice("ART.1", { unitCost: 999 }, true);',
  '    row("ART.2").m2A = true; row("ART.2").m2 = 0.25;',
  '    const n = updateEstimates();',
  '    if (n !== 2) throw new Error("updated " + n);',
  '    if (row("ART.1").unitCost !== 999 || row("ART.1").costSrc !== "quote") throw new Error("a quote was overwritten");',
  '    if (row("ART.2").unitCost !== 100 + 10 * 4 + 25 || row("ART.2").costSrc !== "estimate" || row("ART.2").costAt !== "2026-09-01") throw new Error(JSON.stringify([row("ART.2").unitCost, row("ART.2").costAt]));',
  '    dashUnit = "cm"; row("ART.3").extW = 60.96; row("ART.3").extH = 60.96; delete row("ART.3").costSrc; updateEstimates();',
  '    if (Math.abs(row("ART.3").unitCost - 140) > 0.01) throw new Error("cm " + row("ART.3").unitCost);',
  '    dashUnit = "in";',
  '  });',
  '',
  '  await check("a quote older than 90 days is flagged", async function () {',
  '    fresh(); setRowPrice("ART.1", { unitCost: 10, costAt: "2020-01-01" }, true);',
  '    if (!_priceRow(row("ART.1")).stale || _priceTotals().stale.join() !== "ART.1") throw new Error("not stale");',
  '    setRowPrice("ART.2", { unitCost: 10 }, true); if (_priceRow(row("ART.2")).stale) throw new Error("today is stale");',
  '  });',
  '',
  '  await check("totals: sell, cost, allowance, budget left, by area", async function () {',
  '    fresh(); _pricingSet({ markup: 2, budget: 5000 }, true);',
  '    setRowPrice("ART.1", { unitCost: 500, allowance: 900 }, true); setRowPrice("ART.2", { unitCost: 300, allowance: 500 }, true);',
  '    const t = _priceTotals();',
  '    if (t.sell !== 1000 + 1200 || t.cost !== 1100 || t.allow !== 900 + 1000) throw new Error(JSON.stringify(t));',
  '    if (t.over.join() !== "ART.1,ART.2" || t.unpriced.join() !== "ART.3") throw new Error(JSON.stringify([t.over, t.unpriced]));',
  '    if (t.byArea.Gallery.sell !== 1200 || t.byArea.Gallery.qty !== 2) throw new Error(JSON.stringify(t.byArea));',
  '  });',
  '',
  '  await check("EXACT: the quote goes to a real .xlsx with formulas and an edited copy comes back by item code", async function () {',
  '    fresh(); _pricingSet({ markup: 1.8, budget: 10000 }, true);',
  '    setRowPrice("ART.1", { unitCost: 500, allowance: 900 }, true);',
  '    setRowPrice("ART.2", { unitCost: 300 }, true);',
  '    const bytes = await _xlsxBlob(_quoteSheets(), "uint8array");',
  '    const zip = await JSZip.loadAsync(bytes);',
  '    const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");',
  '    if (sheet.indexOf("<f>IF(H2=&quot;&quot;,&quot;&quot;,H2*K2)</f>") < 0) throw new Error("no sell formula: " + sheet.slice(0, 600));',
  '    if (sheet.indexOf("<f>SUM(M2:M4)</f>") < 0) throw new Error("no total formula");',
  '    const rows = await _xlsxReadRows(bytes);',
  '    if (rows[0].join("|") !== QUOTE_COLS.join("|")) throw new Error("header " + rows[0].join("|"));',
  '    if (rows[1][0] !== "ART.1" || rows[1][7] !== "500" || rows[1][13] !== "900") throw new Error(JSON.stringify(rows[1]));',
  '    if (rows.some(function (r) { return r[0] === "ART.3"; }) === false) throw new Error("unpriced piece missing");',
  '    // The PM edits it in Excel (Excel writes shared strings and caches formula values).',
  '    const edited = [QUOTE_COLS.slice(), ["ART.1", "", "", "", "", "Bruce White Gallery", "1", "550", "quote", "45900", "1.8", "990", "990", "950", "", ""], ["ART.2", "", "", "", "", "Duggal", "9", "300", "", "", "1.8", "540", "", "", "", ""], ["ART.9", "", "", "", "", "", "", "1", "", "", "", "", "", "", "", ""], ["TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]];',
  '    const n0 = undoStack.length;',
  '    const res = _priceImportRows(edited);',
  '    if (res.updated.join() !== "ART.1,ART.2" || res.unknown.join() !== "ART.9") throw new Error(JSON.stringify(res));',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo " + (undoStack.length - n0));',
  '    const a = row("ART.1");',
  '    if (a.unitCost !== 550 || a.costSrc !== "quote" || a.costAt !== "2025-08-31" || a.allowance !== 950) throw new Error(JSON.stringify([a.unitCost, a.costSrc, a.costAt, a.allowance]));',
  '    if ("unitSell" in a) throw new Error("the cached cost x markup was frozen into a hand price");',
  '    if (row("ART.2").vendorName !== "Duggal") throw new Error("vendor not read");',
  '    if (row("ART.2").qty !== 2) throw new Error("qty must come from the walls, not the sheet");',
  '  });',
  '',
  '  await check("a typed sell price in the sheet is kept; a .csv saved from Excel imports the same way", async function () {',
  '    fresh(); _pricingSet({ markup: 1.8 }, true); setRowPrice("ART.1", { unitCost: 500 }, true);',
  '    const res = _priceImportRows(_csvRows("Item Code,Unit Cost,Unit Sell" + String.fromCharCode(13, 10) + "ART.1,500,1250" + String.fromCharCode(13, 10)));',
  '    if (res.updated.join() !== "ART.1" || row("ART.1").unitSell !== 1250) throw new Error(JSON.stringify([res, row("ART.1").unitSell]));',
  '    if (!_priceImportRows([["Code", "Cost"]]).error) throw new Error("a sheet with no Item Code was accepted");',
  '  });',
  '',
  '  await check("the Salesforce lines carry code, quantity and prices", async function () {',
  '    fresh(); _pricingSet({ markup: 2 }, true); setRowPrice("ART.2", { unitCost: 300 }, true);',
  '    const csv = _salesforceLinesCSV();',
  '    if (csv.indexOf("\\"ART.2\\",") < 0 || csv.indexOf("\\"2\\",\\"300.00\\",\\"600.00\\",\\"1200.00\\"") < 0) throw new Error(csv);',
  '  });',
  '',
  '  await check("prices never reach a deck page", async function () {',
  '    ["function buildSpecStrings(", "function _deckMockHTML(", "async function _drawDeckPage(", "function _drawDeckSpecPage(", "async function _drawDeckSpecPage("].forEach(function (lm) {',
  '      const i = APP_SRC.indexOf(lm); if (i < 0) return;',
  '      const j = APP_SRC.indexOf(String.fromCharCode(10) + "}", i);',
  '      const S = APP_SRC.slice(i, j);',
  '      ["unitCost", "unitSell", "allowance", "_priceRow", "_money("].forEach(function (k) { if (S.indexOf(k) >= 0) throw new Error(lm + " reads " + k); });',
  '    });',
  '  });',
  '',
  '  await check("the Pricing tab shows the totals and a row per piece; reached from the Export menu", async function () {',
  '    fresh(); _pricingSet({ markup: 2, budget: 100 }, true); setRowPrice("ART.1", { unitCost: 500 }, true);',
  '    openProduction("pricing");',
  '    const m = document.getElementById("productionModal");',
  '    if (m.querySelectorAll("#priceTable tr[data-price-row]").length !== 3) throw new Error("rows");',
  '    if (document.getElementById("priceTotals").textContent.indexOf("Over budget") < 0) throw new Error(document.getElementById("priceTotals").textContent);',
  '    m.remove();',
  '    openRateCard(); const rc = document.getElementById("rateCardModal");',
  '    if (!rc || rc.querySelectorAll("[data-modal-close]").length !== 1) throw new Error("rate card close");',
  '    rc.remove();',
  '    const menu = APP_SRC.slice(APP_SRC.indexOf("function openDashMenu("), APP_SRC.indexOf("async function _svgExportAs("));',
  '    if (menu.indexOf("openProduction(\\x27pricing\\x27)") < 0) throw new Error("not in the menu");',
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
