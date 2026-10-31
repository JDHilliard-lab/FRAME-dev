// RATE CARD ADD-ONS (19.97), on the test_pricing harness. From the studio's Budgeting &
// Estimating guide: premium frame, non-glare (quoted at 30x40, scales with area), moisture
// sealant in humid rooms, oversize past 40x50, a buffer; Tectonics' per-sq-ft wallcovering.
// (Harness from PRICES AND THE BUDGET, 19.91.) Caesars' budget and quote lived in an Excel retyped from
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
  "  const card = function (addons) { setRateCard([{ product: \"Framed Art\", base: 100, perSqFt: 10 }, { product: \"Wallcovering (EGD)\", perSqFt: 3.10 }, { product: \"Window Film (WF)\", perSqFt: 6.85 }], \"2026-10-01\", addons || { premiumFrame: 40, nonGlare: 90, sealant: 10, oversize: 150 }); };",
  "  const base = function (w, h) { return 100 + 10 * w * h / 144; };",
  "  const near = function (a, b, what) { if (a == null || Math.abs(a - b) > 0.011) throw new Error(what + \": \" + a + \" vs \" + b); };",
  "",
  "  await check(\"a plain piece takes no add-on\", async function () {",
  "    fresh(); card(); const r = row(\"ART.1\"); r.extW = 30; r.extH = 40; r.fCode = \"MICH-132-29\"; r.glass = \"Clear glass\";",
  "    if (_rowAddons(r).length) throw new Error(_rowAddons(r).join());",
  "    near(_estimateCost(r), base(30, 40), \"plain\");",
  "  });",
  "",
  "  await check(\"premium frame by frame code (LJ-, UA-), not MICH, not on a canvas wrap\", async function () {",
  "    fresh(); card(); const r = row(\"ART.1\"); r.extW = 30; r.extH = 40;",
  "    r.fCode = \"LJ-123456\"; near(_estimateCost(r), base(30, 40) + 40, \"LJ\");",
  "    r.fCode = \"UA-9001\"; near(_estimateCost(r), base(30, 40) + 40, \"UA\");",
  "    r.fCode = \"MICH-132-29\"; near(_estimateCost(r), base(30, 40), \"MICH\");",
  "    r.fCode = \"LJ-1\"; r.product = \"Frameless Canvas (Wrapped)\"; if (_rowAddons(r).indexOf(\"premiumFrame\") >= 0) throw new Error(\"wrap\");",
  "  });",
  "",
  "  await check(\"non-glare read off the Glass field and scaled from 30x40 by area\", async function () {",
  "    fresh(); card(); const r = row(\"ART.1\"); r.fCode = \"MICH-132-29\";",
  "    r.glass = \"Non-Glare acrylic\"; r.extW = 30; r.extH = 40; near(_estimateCost(r), base(30, 40) + 90, \"30x40\");",
  "    r.extW = 15; r.extH = 20; near(_estimateCost(r), base(15, 20) + 22.5, \"quarter area\");",
  "    r.glass = \"Museum glass\"; near(_estimateCost(r), base(15, 20) + 22.5, \"museum\");",
  "    r.glass = \"Clear\"; near(_estimateCost(r), base(15, 20), \"clear\");",
  "  });",
  "",
  "  await check(\"sealant follows a humid location, and a piece can say otherwise (stored only when it differs)\", async function () {",
  "    fresh(); card(); const r = row(\"ART.1\"); r.extW = 30; r.extH = 40; r.fCode = \"MICH-1\";",
  "    r.location = \"Guest Bathroom\"; near(_estimateCost(r), base(30, 40) + 10, \"bath\");",
  "    setRowPrice(\"ART.1\", { sealant: false }, true); if (r.sealant !== false) throw new Error(\"override not stored\");",
  "    near(_estimateCost(r), base(30, 40), \"switched off\");",
  "    setRowPrice(\"ART.1\", { sealant: true }, true); if (\"sealant\" in r) throw new Error(\"same as location still stored\");",
  "    r.location = \"Lobby\"; near(_estimateCost(r), base(30, 40), \"lobby\");",
  "    setRowPrice(\"ART.1\", { sealant: true }, true); near(_estimateCost(r), base(30, 40) + 10, \"switched on\");",
  "  });",
  "",
  "  await check(\"oversize past 40x50 either way round\", async function () {",
  "    fresh(); card(); const r = row(\"ART.1\"); r.fCode = \"MICH-1\";",
  "    r.extW = 40; r.extH = 50; near(_estimateCost(r), base(40, 50), \"40x50 is not oversize\");",
  "    r.extW = 50; r.extH = 40; near(_estimateCost(r), base(50, 40), \"50x40 is not oversize\");",
  "    r.extW = 36; r.extH = 60; near(_estimateCost(r), base(36, 60) + 150, \"36x60\");",
  "    r.extW = 44; r.extH = 44; near(_estimateCost(r), base(44, 44) + 150, \"44x44\");",
  "    dashUnit = \"cm\"; r.extW = 101.6; r.extH = 127; near(_estimateCost(r), base(40, 50), \"cm, at the limit\");",
  "    r.extW = 110; near(_estimateCost(r), base(110 / 2.54, 50) + 150, \"cm, past it\");",
  "    dashUnit = \"in\";",
  "  });",
  "",
  "  await check(\"buffer is a percent on the whole estimate\", async function () {",
  "    fresh(); card({ sealant: 10, buffer: 15 }); const r = row(\"ART.1\"); r.extW = 30; r.extH = 40; r.fCode = \"MICH-1\"; r.location = \"Spa\";",
  "    near(_estimateCost(r), Math.round((base(30, 40) + 10) * 1.15 * 100) / 100, \"buffer\");",
  "  });",
  "",
  "  await check(\"wallcovering and window film are per sq ft alone (Tectonics: 120x96 at 3.10 and 6.85), no add-ons\", async function () {",
  "    fresh(); card({ premiumFrame: 40, sealant: 10, oversize: 150 }); const r = row(\"ART.1\");",
  "    r.product = \"Wallcovering (EGD)\"; r.extW = 120; r.extH = 96; r.location = \"Pool deck\"; r.fCode = \"LJ-1\";",
  "    if (_rowAddons(r).length) throw new Error(_rowAddons(r).join());",
  "    near(_estimateCost(r), 248, \"wallcovering\");",
  "    r.product = \"Window Film (WF)\"; near(_estimateCost(r), 548, \"window film\");",
  "  });",
  "",
  "  await check(\"the card keeps its add-ons through a save without them, drops them on an empty set, survives undo\", async function () {",
  "    fresh(); card(); setRateCard([{ product: \"Framed Art\", base: 120 }], \"2026-10-02\");",
  "    if (!_rateCard().addons || _rateCard().addons.premiumFrame !== 40) throw new Error(\"dropped by a list save\");",
  "    setRateCard([{ product: \"Framed Art\", base: 120 }], \"2026-10-02\", {});",
  "    if (_rateCard().addons) throw new Error(\"not cleared\");",
  "    undo(); if (!_rateCard().addons || _rateCard().addons.oversize !== 150) throw new Error(\"undo\");",
  "  });",
  "",
  "  await check(\"the rate card editor writes add-ons; the Pricing tab lists them with a Sealant tick\", async function () {",
  "    fresh(); openRateCard(); const rc = document.getElementById(\"rateCardModal\");",
  "    const set = function (k, v) { rc.querySelector(\"input[data-addon=\" + k + \"]\").value = v; };",
  "    set(\"premiumFrame\", \"35\"); set(\"buffer\", \"10\");",
  "    rc.querySelector(\"tr[data-rate=\\\"Framed Art\\\"] input[data-k=perSqFt]\").value = \"12\";",
  "    Array.prototype.find.call(rc.querySelectorAll(\"button\"), function (b) { return b.textContent === \"Save\"; }).click();",
  "    const ad = _rateCard().addons; if (!ad || ad.premiumFrame !== 35 || ad.buffer !== 10 || \"nonGlare\" in ad) throw new Error(JSON.stringify(ad));",
  "    row(\"ART.1\").fCode = \"LJ-5\"; row(\"ART.2\").location = \"Restroom\";",
  "    openProduction(\"pricing\"); const m = document.getElementById(\"productionModal\");",
  "    const tr1 = m.querySelector(\"tr[data-price-row=\\\"ART.1\\\"]\"), tr2 = m.querySelector(\"tr[data-price-row=\\\"ART.2\\\"]\");",
  "    if (tr1.textContent.indexOf(\"Premium frame\") < 0) throw new Error(tr1.textContent);",
  "    const cb = tr2.querySelector(\"input[data-sealant]\"); if (!cb || !cb.checked) throw new Error(\"sealant tick\");",
  "    cb.checked = false; cb.onchange(); if (row(\"ART.2\").sealant !== false) throw new Error(\"tick did not write\");",
  "    document.getElementById(\"productionModal\").remove();",
  "  });",
  "",
  "  await check(\"the Excel rate card sheet lists the add-ons\", async function () {",
  "    fresh(); card({ nonGlare: 90, buffer: 12 });",
  "    const sh = _quoteSheets().find(function (x) { return x.name === \"Rate card\"; });",
  "    const flat = JSON.stringify(sh.rows);",
  "    if (flat.indexOf(\"Add-ons, per piece\") < 0 || flat.indexOf(\"Non-glare (at 30x40)\") < 0 || flat.indexOf(\"Buffer %\") < 0 || flat.indexOf(\"Premium frame\") >= 0) throw new Error(flat);",
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
