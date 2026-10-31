// THE BUDGET ON THE DASHBOARD (19.93). The chip in the item toolbar: hidden until something
// is priced or a budget is set, total sell against the budget, the selected piece against
// its allowance, amber when either is passed, and it follows edits through the nav-badge sync.
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
  '  await check("EXACT ASK: the Production button is always there, and reads Production while nothing is priced", async function () {',
  '    fresh(); _dashBudgetSync(row("ART.1"));',
  '    if (chip().style.display === "none" || chip().textContent !== "Production") throw new Error("[" + chip().textContent + "]");',
  '    if (chip().getAttribute("data-tab") !== "pricing" || chip().hasAttribute("data-over")) throw new Error("tab " + chip().getAttribute("data-tab"));',
  '  });',
  '  await check("sell against the budget, and the selected piece against its allowance", async function () {',
  '    fresh(); _pricingSet({ markup: 2, budget: 5000 }, true);',
  '    setRowPrice("ART.1", { unitCost: 500, allowance: 900 }, true); setRowPrice("ART.2", { unitCost: 300 }, true);',
  '    _dashBudgetSync(row("ART.1"));',
  '    const t = chip().textContent;',
  '    if (chip().style.display === "none") throw new Error("hidden");',
  '    if (t.indexOf("$2,200 of $5,000") < 0 || t.indexOf("$2,800 left") < 0) throw new Error(t);',
  '    if (t.indexOf("ART.1 $1,000 / $900") < 0) throw new Error("piece: " + t);',
  '    if (!chip().hasAttribute("data-over")) throw new Error("ART.1 sells over its allowance: should be amber");',
  '    if (chip().title.indexOf("not priced yet") < 0) throw new Error("tip " + chip().title);',
  '    _dashBudgetSync(row("ART.2"));',
  '    if (chip().hasAttribute("data-over")) throw new Error("ART.2 is within budget and has no allowance");',
  '  });',
  '  await check("over budget reads as over and goes amber; no budget reads as sell", async function () {',
  '    fresh(); _pricingSet({ budget: 100, markup: 1 }, true); setRowPrice("ART.1", { unitCost: 250 }, true);',
  '    _dashBudgetSync(null);',
  '    if (chip().textContent.indexOf("$150 over") < 0 || !chip().hasAttribute("data-over")) throw new Error(chip().textContent);',
  '    _pricingSet({ budget: "" }, true); _dashBudgetSync(null);',
  '    if (chip().textContent !== "$250 sell" || chip().hasAttribute("data-over")) throw new Error(chip().textContent);',
  '  });',
  '  await check("an edit reaches the chip through the nav-badge sync; selecting a row through loadDashDataIntoControls", async function () {',
  '    fresh(); dashSelectedRowIndex = 0; _syncNavBadges();',
  '    if (chip().textContent !== "Production") throw new Error("before pricing: " + chip().textContent);',
  '    _pricingSet({ markup: 1 }, true); setRowPrice("ART.2", { unitCost: 40 }, true); _syncNavBadges();',
  '    if (chip().textContent.indexOf("$80 sell") !== 0  /* qty 2 */) throw new Error("nav sync: " + chip().textContent);',
  '    setRowPrice("ART.2", { allowance: 10 }, true);',
  '    loadDashDataIntoControls(row("ART.2"));',
  '    if (chip().textContent.indexOf("ART.2") < 0) throw new Error("selection: " + chip().textContent);',
  '  });',
  '  await check("a rejected sample still in use counts on the button and opens Samples; a resized quote opens Pricing", async function () {',
  '    fresh(); row("ART.1").fCode = "MICH 145-30"; _dashBudgetSync(null);',
  '    const badge = function () { return chip().querySelector(".prod-btn-badge"); };',
  '    if (badge().style.display !== "none") throw new Error("badge with nothing to say");',
  '    setSampleStatus("f", "MICH 145-30", { st: "rejected" }, true); _dashBudgetSync(null);',
  '    if (badge().textContent !== "1" || badge().style.display === "none" || chip().getAttribute("data-tab") !== "samples") throw new Error("samples: " + badge().textContent + " " + chip().getAttribute("data-tab"));',
  '    if (chip().title.indexOf("MICH 145-30") < 0) throw new Error("tip " + chip().title);',
  '    setSampleStatus("f", "MICH 145-30", { st: "" }, true);',
  '    row("ART.2").extW = 40; setRowPrice("ART.2", { unitCost: 100 }, true); row("ART.2").extW = 30; _dashBudgetSync(null);',
  '    if (badge().textContent !== "1" || chip().getAttribute("data-tab") !== "pricing") throw new Error("resized: " + badge().textContent + " " + chip().getAttribute("data-tab"));',
  '  });',
  '  await check("the button opens the tab it names; samples and prices left the Edit and Export menus", async function () {',
  '    if ((chip().getAttribute("onclick") || "").indexOf("openProduction(") < 0) throw new Error(chip().getAttribute("onclick"));',
  '    const S = window.APP_SRC; const a = S.indexOf("function openDashMenu"), b = S.indexOf("if (!menus[which]) return null;", a);',
  '    const menus = S.slice(a, b);',
  '    if (menus.indexOf("Frame & mat samples") >= 0 || menus.indexOf("Prices & budget") >= 0) throw new Error("still in a menu");',
  '    if (menus.indexOf("Production pack") < 0) throw new Error("the pack is an export and stays");',
  '  });',
  '  await check("Ctrl+K lists the four Production tabs, and budget finds Pricing", async function () {',
  '    const e = _jumpEntries().filter(function (x) { return x.title.indexOf("Production: ") === 0; });',
  '    if (e.length !== 4) throw new Error(e.length);',
  '    if (!e.some(function (x) { return x.title === "Production: Pricing" && x.hay.indexOf("budget") >= 0; })) throw new Error("budget");',
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
