// COMMERCIAL INVOICES (19.99), on the test_pricing harness. The team's Commercial Invoice
// Assistant: lines from the pieces, HS codes by product, port of lading by route (Talia's
// table), parties kept on this computer, a real jsPDF invoice.
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
  "  const CA = { name: \"Gallery North\", addr: \"4815 Boul. Saint-Laurent, Montreal QC H2T 1R6\", country: \"Canada\" };",
  "  const US = { name: \"Framer Inc\", addr: \"1032 N. Crooks Road, Clawson MI 48017\", country: \"USA\", tax: \"00-0000000\" };",
  "  const TO = { name: \"Toronto Hotel\", addr: \"100 King St W, Toronto ON M5X 1A9\", country: \"Canada\" };",
  "",
  "  await check(\"EXACT ASK: the port of lading follows the route table (QC/ON to USA, USA to QC/ON, any air), a typed port wins, an unknown route is blank\", async function () {",
  "    fresh();",
  "    const p = function (ship, cons, mode, port) { return _shipPort({ ship: ship, cons: cons, mode: mode || \"ground\", port: port }); };",
  "    if (p(CA, US) !== \"Lacolle, QC\") throw new Error(\"QC to US: \" + p(CA, US));",
  "    if (p(TO, US) !== \"Windsor, ON\") throw new Error(\"ON to US: \" + p(TO, US));",
  "    if (p(US, CA) !== \"Champlain, NY\") throw new Error(\"US to QC: \" + p(US, CA));",
  "    if (p(US, TO) !== \"Port Huron, MI\") throw new Error(\"US to ON: \" + p(US, TO));",
  "    if (p(TO, US, \"air\") !== \"Montreal-Trudeau (YUL)\") throw new Error(\"air\");",
  "    if (p(CA, US, \"ground\", \"Buffalo, NY\") !== \"Buffalo, NY\") throw new Error(\"typed port lost\");",
  "    if (p({ name: \"x\", addr: \"Vancouver BC\", country: \"Canada\" }, US) !== \"\") throw new Error(\"guessed a route not in the table\");",
  "    if (p({ addr: \"Montreal, Quebec\" }, { addr: \"Detroit MI, USA\" }) !== \"Lacolle, QC\") throw new Error(\"from the address alone\");",
  "  });",
  "",
  "  await check(\"each piece is a line: description with size and codes, HS by product (originals 9701.21, prints 4911.91), qty from the walls, value at cost or sell\", async function () {",
  "    fresh(); _pricingSet({ markup: 2 }, true);",
  "    row(\"ART.1\").extW = 30; row(\"ART.1\").extH = 40; row(\"ART.1\").product = \"Framed Art\";",
  "    row(\"ART.2\").imageCode = \"FAO.0001\"; row(\"ART.2\").artType = \"Oil on canvas\"; row(\"ART.2\").extW = 60; row(\"ART.2\").extH = 72;",
  "    setRowPrice(\"ART.1\", { unitCost: 400 }, true); setRowPrice(\"ART.2\", { unitCost: 19173 }, true);",
  "    const id = newShipment([\"ART.1\", \"ART.2\"]); setShipment(id, { ship: CA, cons: US }, true);",
  "    let L = _shipLines(_shipById(id));",
  "    const a = L[0], b = L[1];",
  "    if (a.hs !== \"4911.91\" || b.hs !== \"9701.21\") throw new Error(\"hs \" + a.hs + \" \" + b.hs);",
  "    if (a.desc.indexOf(\"30\\\"W x 40\\\"H\") < 0 || a.desc.indexOf(\"ART.1\") < 0 || a.desc.indexOf(\"Framed art print\") !== 0) throw new Error(a.desc);",
  "    if (b.desc.indexOf(\"Original artwork, Oil on canvas\") !== 0) throw new Error(b.desc);",
  "    if (a.qty !== 1 || b.qty !== 2) throw new Error(\"qty \" + a.qty + \" \" + b.qty);",
  "    if (a.unit !== 400 || b.total !== 38346) throw new Error(\"cost \" + a.unit + \" \" + b.total);",
  "    if (a.origin !== \"Canada\") throw new Error(\"origin \" + a.origin);",
  "    setShipment(id, { value: \"sell\" }, true);",
  "    if (_shipLines(_shipById(id))[0].unit !== 800) throw new Error(\"sell\");",
  "    const w = row(\"ART.1\"); w.product = \"Wallcovering (EGD)\"; if (_shipHs(w) !== \"4814.90\") throw new Error(\"egd\");",
  "    w.product = \"Window Film (WF)\"; if (_shipHs(w) !== \"3919.90\") throw new Error(\"wf\");",
  "    w.product = \"Sourced Object\"; if (_shipHs(w) !== \"\") throw new Error(\"a sourced object guessed an HS code\");",
  "  });",
  "",
  "  await check(\"a typed line field sticks and blank goes back to the piece; untouched lines store nothing; unticking drops the override\", async function () {",
  "    fresh(); setRowPrice(\"ART.1\", { unitCost: 400 }, true);",
  "    const id = newShipment([\"ART.1\"]); const sh = _shipById(id);",
  "    if (Object.keys(sh.lines).length) throw new Error(\"lines stored before anything typed\");",
  "    setShipment(id, { lines: { \"ART.1\": { hs: \"4911.91.40\", unit: \"350\" } } }, true);",
  "    let l = _shipLines(sh)[0]; if (l.hs !== \"4911.91.40\" || l.unit !== 350) throw new Error(JSON.stringify(l));",
  "    setShipment(id, { lines: { \"ART.1\": { unit: \"\" } } }, true);",
  "    l = _shipLines(sh)[0]; if (l.unit !== 400 || l.hs !== \"4911.91.40\") throw new Error(\"blank did not go back \" + JSON.stringify(l)); if (\"unit\" in sh.lines[\"ART.1\"]) throw new Error(\"a blanked field is still stored\");",
  "    row(\"ART.1\").unitCost = 410; if (_shipLines(sh)[0].unit !== 410) throw new Error(\"not derived from the piece\");",
  "    setShipment(id, { rows: [] }, true); if (sh.lines[\"ART.1\"]) throw new Error(\"override kept after unticking\");",
  "  });",
  "",
  "  await check(\"totals: goods + freight + insurance; a line with no value or no HS is listed as missing\", async function () {",
  "    fresh(); setRowPrice(\"ART.1\", { unitCost: 100 }, true);",
  "    const id = newShipment([\"ART.1\", \"ART.2\"]); setShipment(id, { freight: 50, insurance: \"12.5\" }, true);",
  "    const T = _shipTotals(_shipById(id));",
  "    if (T.goods !== 100 || T.total !== 162.5) throw new Error(JSON.stringify(T));",
  "    if (T.missing.join() !== \"ART.2\") throw new Error(\"missing \" + T.missing.join());",
  "  });",
  "",
  "  await check(\"one undo per gesture: new, edit, delete; parties merge field by field\", async function () {",
  "    fresh(); const n0 = undoStack.length;",
  "    const id = newShipment([]); if (undoStack.length !== n0 + 1) throw new Error(\"new\");",
  "    setShipment(id, { ship: { name: \"A\", addr: \"x\" } }); setShipment(id, { ship: { phone: \"555\" } });",
  "    const sh = _shipById(id); if (sh.ship.name !== \"A\" || sh.ship.phone !== \"555\") throw new Error(JSON.stringify(sh.ship));",
  "    deleteShipment(id); if (_shipById(id) || editorialContent.shipments) throw new Error(\"not deleted / empty list kept\");",
  "    undo(); if (!_shipById(id) || _shipById(id).ship.phone !== \"555\") throw new Error(\"undo\");",
  "  });",
  "",
  "  await check(\"the address book and the signer live on this computer, never in the project\", async function () {",
  "    fresh(); localStorage.removeItem(SHIP_BOOK_KEY);",
  "    if (!_shipSaveParty(US)) throw new Error(\"not saved\");",
  "    _shipSaveParty(Object.assign({}, US, { phone: \"1\" }));",
  "    const b = _shipLoadBook(); if (b.length !== 1 || b[0].phone !== \"1\") throw new Error(JSON.stringify(b));",
  "    const id = newShipment([]); setShipment(id, { signer: \"Pat\" }, true);",
  "    if (localStorage.getItem(SHIP_SIGNER_KEY) !== \"Pat\") throw new Error(\"signer\");",
  "    if (_shipById(newShipment([])).signer !== \"Pat\") throw new Error(\"next invoice not signed by the last signer\");",
  "    if (JSON.stringify(editorialContent).indexOf(SHIP_BOOK_KEY) >= 0) throw new Error(\"book in project\");",
  "  });",
  "",
  "  await check(\"the PDF (real jsPDF): title, parties, port, HS codes, totals and the declaration; named after the invoice number\", async function () {",
  "    fresh(); setRowPrice(\"ART.1\", { unitCost: 400 }, true);",
  "    row(\"ART.2\").imageCode = \"FAO.0001\"; setRowPrice(\"ART.2\", { unitCost: 1000 }, true);",
  "    const id = newShipment([\"ART.1\", \"ART.2\"]);",
  "    setShipment(id, { no: \"PO-02133\", ship: CA, cons: US, signer: \"Pat Doe\", freight: 50 }, true);",
  "    const doc = _commercialInvoicePdf(_shipById(id));",
  "    const txt = doc.output();",
  "    [\"COMMERCIAL INVOICE\", \"PO-02133\", \"Gallery North\", \"Framer Inc\", \"Lacolle, QC\", \"4911.91\", \"9701.21\", \"Pat Doe\", \"true and correct\", \"2,450.00 USD\"].forEach(function (k) { if (txt.indexOf(k) < 0) throw new Error(\"PDF lacks \" + k); });",
  "    if (txt.indexOf(\"(400.00 USD)\") >= 0 || txt.indexOf(\"(400.00)\") < 0) throw new Error(\"a line carries the currency (wrong when it is not USD)\");",
  "    [].forEach(function (k) {",
  "      if (txt.indexOf(k) < 0) throw new Error(\"PDF lacks \" + k);",
  "    });",
  "    if (_shipFileName(_shipById(id)) !== \"commercial_invoice_PO-02133.pdf\") throw new Error(_shipFileName(_shipById(id)));",
  "    setShipment(id, { no: \"\" }, true); if (_shipFileName(_shipById(id)).indexOf(\"commercial_invoice_\" + _prodStamp()) !== 0) throw new Error(\"no number\");",
  "  });",
  "",
  "  await check(\"a long invoice runs onto more pages instead of off the bottom\", async function () {",
  "    fresh(); for (let i = 4; i < 60; i++) dashProjectData.push(mk(\"ART.\" + i));",
  "    const id = newShipment(dashProjectData.map(function (r) { return r.id; }));",
  "    const doc = _commercialInvoicePdf(_shipById(id));",
  "    if (doc.internal.getNumberOfPages() < 2) throw new Error(\"one page for 59 lines\");",
  "  });",
  "",
  "  await check(\"the Shipping tab: new invoice, tick pieces, lines appear, port placeholder follows the route; Ctrl+K finds it\", async function () {",
  "    fresh(); openProduction(\"shipping\"); const m = document.getElementById(\"productionModal\");",
  "    const nb = Array.prototype.find.call(m.querySelectorAll(\"button\"), function (b) { return b.textContent === \"New commercial invoice\"; });",
  "    nb.click();",
  "    const id = _prodShipPick; setShipment(id, { ship: CA, cons: US }, true); _prodShow();",
  "    if (document.getElementById(\"shipPort\").placeholder !== \"Lacolle, QC\") throw new Error(\"port \" + document.getElementById(\"shipPort\").placeholder);",
  "    const cb = m.querySelector(\"input[data-ship-row=\\\"ART.1\\\"]\"); cb.checked = true; cb.onchange();",
  "    if (!m.querySelector(\"#shipLines tr[data-ship-line=\\\"ART.1\\\"]\")) throw new Error(\"no line\");",
  "    if (_shipById(id).rows.join() !== \"ART.1\") throw new Error(_shipById(id).rows.join());",
  "    if (!_jumpEntries().some(function (e) { return e.title === \"Production: Shipping\" && e.hay.indexOf(\"commercial invoice\") >= 0; })) throw new Error(\"Ctrl+K\");",
  "    m.remove();",
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
