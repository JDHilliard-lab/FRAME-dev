// BRAND STANDARDS (20.00), from the team’s BRAND STANDARDS project: fixed-price RI / SHS and Ford
// items kept on this computer and shared as a file, added to a project as a priced piece in one
// click, and the cheat-sheet client emails filled from the project.
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
  "  const LIST = [",
  "    { id: \"ri1\", brand: \"RI\", name: \"Fitness\", product: \"Framed Art\", w: 30, h: 40, imageCode: \"FJH.010.00325\", cost: \"400\", sell: \"950\" },",
  "    { id: \"ri2\", brand: \"RI\", name: \"Lobby wall\", product: \"Wallcovering (EGD)\", w: 120, h: 96, imageCode: \"MEG.400.02747.1\", sell: \"$1,240.50\" },",
  "    { id: \"sh1\", brand: \"SHS\", name: \"Corridor\", product: \"Framed Art\", w: 24, h: 36, cost: 200 },",
  "    { brand: \"Ford\", name: \"\" }",
  "  ];",
  "  const setG = function (id, v) { const el = document.getElementById(id); if (el) el.value = v; };",
  "",
  "  await check(\"EXACT ASK: a standard item added to the project is a piece at its size, image code and fixed price, one undo\", async function () {",
  "    fresh(); localStorage.removeItem(BS_ITEMS_KEY); setBrandItems(LIST);",
  "    const n0 = undoStack.length, c0 = dashProjectData.length;",
  "    const id = addBrandItem(\"ri1\", 2, \"Fitness Room\");",
  "    const r = row(id);",
  "    if (!r || dashProjectData.length !== c0 + 1) throw new Error(\"no piece\");",
  "    if (parseFloat(r.extW) !== 30 || parseFloat(r.extH) !== 40 || r.imageCode !== \"FJH.010.00325\" || r.location !== \"Fitness Room\") throw new Error(JSON.stringify([r.extW, r.extH, r.imageCode, r.location]));",
  "    if (r.stdItem !== \"ri1\" || \"_bsNew\" in r) throw new Error(\"stdItem / marker \" + r.stdItem);",
  "    const p = _priceRow(r);",
  "    if (p.sell !== 950 || p.cost !== 400 || p.src !== \"quote\") throw new Error(JSON.stringify(p));",
  "    if (p.qty !== 2) throw new Error(\"order qty \" + p.qty);",
  "    if (undoStack.length !== n0 + 1) throw new Error((undoStack.length - n0) + \" undo entries\");",
  "    undo(); if (row(id) && row(id).stdItem) throw new Error(\"undo kept it\");",
  "  });",
  "",
  "  await check(\"a wallcovering mints under its own category and code; no sell = house markup on the cost; a centimetre project is converted\", async function () {",
  "    fresh(); setBrandItems(LIST);",
  "    const id = addBrandItem(\"ri2\", 1, \"\"); const r = row(id);",
  "    if (r.product !== \"Wallcovering (EGD)\" || id.indexOf(\"EGD\") !== 0) throw new Error(r.product + \" \" + id);",
  "    if (_priceRow(r).sell !== 1240.5) throw new Error(\"sell \" + _priceRow(r).sell);",
  "    const s = row(addBrandItem(\"sh1\", 1));",
  "    const want = Math.round(200 * (HOUSE_MARKUP + _rowRoyalty(s)) * 100) / 100;",
  "    if (_priceRow(s).sell !== want) throw new Error(\"markup \" + _priceRow(s).sell + \" vs \" + want);",
  "    fresh(); dashUnit = \"cm\"; setBrandItems(LIST);",
  "    const c = row(addBrandItem(\"sh1\", 1));",
  "    if (Math.abs(parseFloat(c.extW) - 60.96) > 0.01) throw new Error(\"cm \" + c.extW);",
  "    dashUnit = \"in\";",
  "  });",
  "",
  "  await check(\"the list: nameless rows dropped, numbers cleaned, ids kept and unique; a team file replaces the list and merges settings\", async function () {",
  "    const out = setBrandItems(LIST.concat([{ id: \"ri1\", name: \"dup\" }]));",
  "    if (out.length !== 4 || out.some(function (x) { return !x.name; })) throw new Error(out.length);",
  "    if (out[1].sell !== 1240.5 || out[0].cost !== 400) throw new Error(\"numbers \" + out[1].sell + \" \" + out[0].cost);",
  "    if (out[3].id === \"ri1\") throw new Error(\"duplicate id kept\");",
  "    localStorage.removeItem(BS_SET_KEY); _bsSaveSettings({ cardFee: \"4%\" });",
  "    const n = _bsImportText(JSON.stringify({ type: \"frame-brand-standards\", items: [{ id: \"f1\", brand: \"Ford\", name: \"Glass vinyl\" }], settings: { fordRate: \"$10\" } }));",
  "    if (n !== 1 || _bsLoad().length !== 1) throw new Error(\"import \" + n);",
  "    const s = _bsSettings(); if (s.cardFee !== \"4%\" || s.fordRate !== \"$10\") throw new Error(JSON.stringify(s));",
  "    if (_bsImportText(\"{\\\"items\\\":[]}\") !== null || _bsImportText(\"nope\") !== null) throw new Error(\"took a file that is not ours\");",
  "  });",
  "",
  "  await check(\"a brand order on no wall prices as its order quantity; on a wall the walls win; RFQ and the Salesforce CSV follow\", async function () {",
  "    fresh(); setBrandItems(LIST);",
  "    const id = addBrandItem(\"ri1\", 3);",
  "    if (_priceQty(row(id)) !== 3) throw new Error(\"order \" + _priceQty(row(id)));",
  "    const sf = _salesforceLinesCSV().split(String.fromCharCode(10)).filter(function (l) { return l.indexOf(\"\\\"\" + id + \"\\\"\") >= 0; })[0] || \"\"; if (sf.split(\",\")[1] !== \"\\\"3\\\"\") throw new Error(\"SF qty \" + sf);",
  "    row(id).qty = 1; if (_priceQty(row(id)) !== 1) throw new Error(\"walls should win\");",
  "  });",
  "",
  "  await check(\"emails: tokens fill from the project; a blank stays visible in brackets; custom lists only the non-standard pieces\", async function () {",
  "    fresh(); setBrandItems(LIST); localStorage.removeItem(BS_SET_KEY); _bsSaveSettings({ cardFee: \"4%\" });",
  "    setG(\"g_attn\", \"Dana Smith\"); setG(\"g_projName\", \"RI Boise\");",
  "    row(\"ART.1\").extW = 60; row(\"ART.1\").extH = 36; setRowPrice(\"ART.1\", { unitSell: 2000 }, true);",
  "    addBrandItem(\"ri1\", 1);",
  "    const ctx = _bsMailCtx(\"RI\");",
  "    const body = _bsFill(_bsMail(\"riPo\").body, ctx);",
  "    if (body.indexOf(\"Hi Dana,\") !== 0 || body.indexOf(\"PO for RI Boise\") < 0 || body.indexOf(\"carries a 4% fee\") < 0) throw new Error(body.slice(0, 300));",
  "    if (body.indexOf(\"Fitness, 30 x 40 in\") < 0) throw new Error(\"order line \" + body);",
  "    if (ctx.items.indexOf(\"Corridor\") >= 0 || ctx.items.indexOf(\"RI Fitness, 30 x 40 in, Framed Art: $950\") < 0) throw new Error(\"brand filter \" + ctx.items);",
  "    if (ctx.custom.indexOf(\"ART.1\") < 0 || ctx.custom.indexOf(\"Fitness\") >= 0) throw new Error(\"custom \" + ctx.custom);",
  "    if (ctx.custom_total !== \"$2,000\") throw new Error(\"custom total \" + ctx.custom_total);",
  "    const ford = _bsFill(_bsMail(\"ford\").body, ctx);",
  "    if (ford.indexOf(\"budget [ford rate] per square foot\") < 0) throw new Error(\"blank token \" + ford);",
  "  });",
  "",
  "  await check(\"RI first reply keeps the custom-size sentence bold: rich copy as <b>, plain text without the stars\", async function () {",
  "    const b = _bsMail(\"riReply\").body;",
  "    const i = b.indexOf(\"**\"), j = b.indexOf(\"**\", i + 2);",
  "    if (i < 0 || b.slice(i, j).indexOf(\"custom-quoted\") < 0) throw new Error(\"not bold\");",
  "    if (_bsHtml(b).indexOf(\"<b>Pricing is for the standard sizes only\") < 0) throw new Error(_bsHtml(b).slice(0, 400));",
  "    if (_bsPlain(b).indexOf(\"**\") >= 0) throw new Error(\"stars in plain text\");",
  "    if (_bsHtml(\"a <b> & c\").indexOf(\"&lt;b&gt;\") < 0) throw new Error(\"not escaped\");",
  "  });",
  "",
  "  await check(\"saved wording replaces the template on this computer; back to the standard removes it\", async function () {",
  "    localStorage.removeItem(BS_SET_KEY);",
  "    _bsSaveSettings({ mails: { ford: { subject: \"S {project}\", body: \"B\" } } });",
  "    const m = _bsMail(\"ford\"); if (m.body !== \"B\" || !m.own) throw new Error(JSON.stringify(m));",
  "    _bsSaveSettings({ mails: {} }); if (_bsMail(\"ford\").own || \"mails\" in _bsSettings()) throw new Error(\"not reset\");",
  "  });",
  "",
  "  await check(\"no list, prices or names in the project file: the list lives on this computer\", async function () {",
  "    fresh(); setBrandItems(LIST);",
  "    if (JSON.stringify(editorialContent).indexOf(\"Fitness\") >= 0) throw new Error(\"list in the project\");",
  "  });",
  "",
  "  await check(\"the Brand standards tab: rows per brand, Add mints the piece, the email fills, Edit wording shows the tokens; Ctrl+K finds it\", async function () {",
  "    fresh(); setBrandItems(LIST); setG(\"g_projName\", \"RI Boise\");",
  "    openProduction(\"brand\"); const m = document.getElementById(\"productionModal\");",
  "    if (m.querySelectorAll(\"tr[data-bs-item]\").length !== 3) throw new Error(\"rows \" + m.querySelectorAll(\"tr[data-bs-item]\").length);",
  "    const sel = m.querySelector(\"#bsBrand\"); sel.value = \"SHS\"; sel.onchange();",
  "    if (m.querySelectorAll(\"tr[data-bs-item]\").length !== 1) throw new Error(\"filter\");",
  "    sel.value = \"\"; sel.onchange();",
  "    const tr = m.querySelector(\"tr[data-bs-item=ri1]\");",
  "    tr.querySelector(\"[data-bs-qty]\").value = \"4\";",
  "    Array.prototype.find.call(tr.querySelectorAll(\"button\"), function (b) { return b.textContent === \"Add\"; }).click();",
  "    const r = dashProjectData.find(function (x) { return x.stdItem === \"ri1\"; });",
  "    if (!r || r.orderQty !== 4) throw new Error(\"add \" + (r && r.orderQty));",
  "    if (m.querySelector(\"tr[data-bs-item=ri1]\").textContent.indexOf(r.id) < 0) throw new Error(\"in-project column\");",
  "    const ms = m.querySelector(\"#bsMail\"); ms.value = \"riPo\"; ms.onchange();",
  "    if (m.querySelector(\"#bsMailBody\").value.indexOf(\"PO for RI Boise\") < 0) throw new Error(m.querySelector(\"#bsMailBody\").value);",
  "    Array.prototype.find.call(m.querySelectorAll(\"button\"), function (b) { return b.textContent === \"Edit wording\"; }).click();",
  "    if (m.querySelector(\"#bsMailBody\").value.indexOf(\"{project}\") < 0) throw new Error(\"not the template\");",
  "    m.remove();",
  "    if (!_jumpEntries().some(function (e) { return e.title === \"Production: Brand standards\" && e.hay.indexOf(\"residence inn\") >= 0; })) throw new Error(\"Ctrl+K\");",
  "  });",
  "",
  "  await check(\"the list editor saves rows, drops blank ones, keeps the fee and rate\", async function () {",
  "    localStorage.removeItem(BS_SET_KEY); setBrandItems([]);",
  "    openBrandItems(); const m = document.getElementById(\"brandItemsModal\");",
  "    const tr = m.querySelector(\"tr[data-bs-edit]\");",
  "    tr.querySelector(\"[data-k=name]\").value = \"Guest room\"; tr.querySelector(\"[data-k=brand]\").value = \"SHS\"; tr.querySelector(\"[data-k=w]\").value = \"16\";",
  "    Array.prototype.find.call(m.querySelectorAll(\"button\"), function (b) { return b.textContent === \"+ Item\"; }).click();",
  "    m.querySelector(\"#bsCardFee\").value = \"4%\";",
  "    Array.prototype.find.call(m.querySelectorAll(\"button\"), function (b) { return b.textContent === \"Save\"; }).click();",
  "    const L = _bsLoad(); if (L.length !== 1 || L[0].w !== 16 || L[0].brand !== \"SHS\") throw new Error(JSON.stringify(L));",
  "    if (_bsSettings().cardFee !== \"4%\") throw new Error(\"fee\");",
  "    const pm = document.getElementById(\"productionModal\"); if (pm) pm.remove();",
  "  });",
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
