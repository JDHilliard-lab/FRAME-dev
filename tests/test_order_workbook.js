// THE ORDER WORKBOOK (20.56). One .xlsx a PM opens and starts the purchase order from: a
// Farmboy-branded Order sheet (logo, project header, yellow PM cells, every piece with its
// picture, spec, vendor and price, live totals) plus the Salesforce SF Import Template tab
// (the template's 11 columns at row 1, the same lines as the Salesforce CSV) and its Vendor
// codes sheet. Also pins that _xlsxBlob's pictures / merges / custom styles leave every
// older sheet (RFQ, quote) exactly as it was.
// Set ORDER_XLSX_OUT=/some/file.xlsx to keep the workbook this test builds.
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
global.window = window; global.document = window.document; global.navigator = window.navigator;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
window.__PNG = PNG;

const body = [
  '_autosaveToldUser = true;',
  'var __modals = []; showInfoModal = function (t, b) { __modals.push(t + ": " + b); };',
  '_toast = function () { return null; };',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const PNG = window.__PNG;',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", qty: 1, location: "Lobby", extW: 24, extH: 36, fW: 1, m1T: 3, m1B: 3, m1L: 3, m1R: 3, bleed: 0.25, fCode: "MICH 132-29" }, o || {}); };',
  '  const setv = function (id, v) { const el = document.getElementById(id); if (el) el.value = v; };',
  '  const fresh = function () {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    dashProjectData = [',
  '      mk("ART.1", { imageCode: "GDC.010.00219.1.jpg", vendorName: "LT Artistic", location: "Lobby & Bar #2", artworkTitle: "Blue Hour", artworkUrl: PNG }),',
  '      mk("ART.2", { imageCode: "FNK.010.00376.1", vendorName: "Duggal", qty: 2, artworkUrl: PNG }),',
  '      mk("ART.3", { imageCode: "PEN.000.00012", vendorName: "Acme Frames" }),',
  '      mk("EGD.1", { imageCode: "FWC.001.001.1", product: "Wallcovering (EGD)", extW: 120, extH: 96, bleed: 2, vendorName: "Tectonics" })];',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory(); __modals.length = 0;',
  '    setv("g_projName", "The Cascades"); setv("g_client", "CHARD Developments"); setv("g_attn", "Sam Lee");',
  '    setRowPrice("ART.1", { unitCost: 100 }, true); setRowPrice("ART.2", { unitCost: 200 }, true);',
  '  };',
  '  // jsdom draws nothing: stand in for the rasterised logo and the artwork thumbnails',
  '  _getPdfLogos = async function () { return { farmboy: PNG, farmboyAR: 8.3 }; };',
  '  _xlsxImageThumb = async function (src) { return src ? { dataUrl: PNG, w: 400, h: 300 } : null; };',
  '  const build = async function () {',
  '    const bytes = await _xlsxBlob(await _orderSheets(), "uint8array");',
  '    const zip = await JSZip.loadAsync(bytes);',
  '    const txt = async function (p) { const f = zip.file(p); return f ? f.async("string") : null; };',
  '    return { bytes: bytes, zip: zip, txt: txt };',
  '  };',
  '  // [{ref: {s, f, v, st}}] from a worksheet: inline strings, numbers, formulas',
  '  const cellsOf = function (xml) {',
  '    const doc = new DOMParser().parseFromString(xml, "application/xml"), map = {};',
  '    Array.prototype.forEach.call(doc.getElementsByTagName("c"), function (c) {',
  '      const t = c.getElementsByTagName("t")[0], f = c.getElementsByTagName("f")[0], v = c.getElementsByTagName("v")[0];',
  '      map[c.getAttribute("r")] = { s: t ? t.textContent : null, f: f ? f.textContent : null, v: v ? v.textContent : null, st: c.getAttribute("s"), t: c.getAttribute("t") };',
  '    });',
  '    return map;',
  '  };',
  '',
  '  await check("EXACT: three tabs in order: Order, SF Import Template, Vendor codes", async function () {',
  '    fresh(); const b = await build();',
  '    const wb = await b.txt("xl/workbook.xml");',
  '    const names = (wb.match(/name="[^"]+"/g) || []).join("|");',
  '    if (names !== "name=\\"Order\\"|name=\\"SF Import Template\\"|name=\\"Vendor codes\\"") throw new Error(names);',
  '    if (!/^[0-9]{6}_CHARD_Developments_The_Cascades_Order[.]xlsx$/.test(_rfqFileName("order"))) throw new Error(_rfqFileName("order"));',
  '    if (ORDER_COLS.length !== 18 || _xlsxCol(14) !== "O" || _xlsxCol(16) !== "Q" || _xlsxCol(17) !== "R") throw new Error("the formulas name Qty O, Unit Price Q, Line Total R");',
  '  });',
  '',
  '  await check("EXACT: the SF Import Template tab is the template: 11 headers at row 1, the CSV lines as values, numbers as numbers, no styling", async function () {',
  '    fresh(); const b = await build();',
  '    const x = await b.txt("xl/worksheets/sheet2.xml"), c = cellsOf(x);',
  '    const head = ["A","B","C","D","E","F","G","H","I","J","K"].map(function (k) { return c[k + "1"] && c[k + "1"].s; }).join("|");',
  '    if (head !== SF_IMPORT_COLS.join("|") || head !== "Product Code|Quantity|Unit Cost|Revenue Markup|Item Code|Location|Image Code / Title|OAD Height|OAD Width|Custom Notes|Vendor") throw new Error(head);',
  '    if (x.indexOf(" s=\\"") >= 0) throw new Error("the import tab carries styles");',
  '    if (x.indexOf("<pane") >= 0 || x.indexOf("<drawing") >= 0) throw new Error("the import tab has a frozen pane or a picture");',
  '    const L = _salesforceLines();',
  '    if (L.length !== 4) throw new Error("lines " + L.length);',
  '    // ART.1: qty 1, cost 100, markup 92.31 (87.31 + 5% royalty), codes cleaned, H before W, vendor code',
  '    if (c.B2.v !== "1" || c.C2.v !== "100" || c.D2.v !== "92.31" || c.B2.t || c.C2.t) throw new Error(JSON.stringify([c.B2, c.C2, c.D2]));',
  '    if (c.E2.s !== "ART.1" || c.F2.s !== "Lobby Bar 2" || c.G2.s !== "GDC.010.00219.1" || c.H2.v !== "36" || c.I2.v !== "24" || c.K2.s !== "LT00") throw new Error(JSON.stringify([c.E2, c.F2, c.G2, c.H2, c.I2, c.K2]));',
  '    if (c.B3.v !== "2" || c.K3.s !== "DG00" || c.K4.s !== "Acme Frames") throw new Error(JSON.stringify([c.B3, c.K3, c.K4]));',
  '    // an unpriced piece leaves cost and markup blank, never 0',
  '    if (c.C5 || c.D5) throw new Error("unpriced EGD wrote " + JSON.stringify([c.C5, c.D5]));',
  '    // the CSV and the tab come from the same lines',
  '    const csv = _salesforceLinesCSV().trim().split(String.fromCharCode(10));',
  '    if (csv.length !== 5 || csv[1].indexOf("\\"100.00\\",\\"92.31\\",\\"ART.1\\"") < 0) throw new Error(csv[1]);',
  '    const v = cellsOf(await b.txt("xl/worksheets/sheet3.xml"));',
  '    if (v.A1.s !== "Vendor" || v.B1.s !== "Code" || v.A2.s !== "Artistic Framing" || v.B2.s !== "LT00" || v.B10.s !== "NW00") throw new Error("vendor codes " + JSON.stringify([v.A2, v.B10]));',
  '  });',
  '',
  '  await check("the Order sheet: logo and a picture per piece with artwork, as real drawing parts", async function () {',
  '    fresh(); const b = await build();',
  '    const x = await b.txt("xl/worksheets/sheet1.xml");',
  '    if (x.indexOf("<drawing r:id=\\"rId1\\"/></worksheet>") < 0) throw new Error("no drawing at the end of the sheet");',
  '    if (x.indexOf("<sheetFormatPr defaultRowHeight=\\"15\\"/><cols>") < 0) throw new Error("no default row height (Quick Look lost the whole table without it)");',
  '    if (x.indexOf("showGridLines=\\"0\\"") < 0 || x.indexOf("orientation=\\"landscape\\"") < 0 || x.indexOf("<pane") >= 0) throw new Error("view / print setup");',
  '    if (x.indexOf("Farmboy Fine Arts&amp;C") < 0) throw new Error("print footer");',
  '    const rels = await b.txt("xl/worksheets/_rels/sheet1.xml.rels");',
  '    if (!rels || rels.indexOf("../drawings/drawing1.xml") < 0) throw new Error("sheet rels " + rels);',
  '    const d = await b.txt("xl/drawings/drawing1.xml"), dr = await b.txt("xl/drawings/_rels/drawing1.xml.rels");',
  '    const pics = (d.match(/<xdr:pic>/g) || []).length;',
  '    if (pics !== 3) throw new Error("logo + two thumbnails expected, got " + pics);',
  '    if (d.indexOf("descr=\\"Farmboy Fine Arts\\"") < 0 || d.indexOf("descr=\\"ART.1\\"") < 0 || d.indexOf("descr=\\"ART.3\\"") >= 0) throw new Error("which pictures");',
  '    if ((dr.match(/Target="..\\/media\\/image[0-9]+[.]png"/g) || []).length !== 3) throw new Error(dr);',
  '    if (!b.zip.file("xl/media/image1.png") || !b.zip.file("xl/media/image3.png")) throw new Error("media files");',
  '    const ct = await b.txt("[Content_Types].xml");',
  '    if (ct.indexOf("Extension=\\"png\\"") < 0 || ct.indexOf("/xl/drawings/drawing1.xml") < 0) throw new Error("content types");',
  '    // the picture sits in the Image column (B) of its piece row: header row 17, ART.1 on row 18',
  '    if (d.indexOf("<xdr:col>1</xdr:col>") < 0 || d.indexOf("<xdr:row>17</xdr:row>") < 0) throw new Error("thumbnail anchor");',
  '  });',
  '',
  '  await check("EXACT: the Order sheet rows and formulas cover exactly the pieces (the off-by-one this caught)", async function () {',
  '    fresh(); const b = await build();',
  '    const c = cellsOf(await b.txt("xl/worksheets/sheet1.xml"));',
  '    if (c.A1 || c.R1.s !== "ORDER" || c.A2.s !== "The Cascades") throw new Error("title rows " + JSON.stringify([c.A1, c.R1, c.A2]));',
  '    if (c.A6.s !== "Project" || c.C6.s !== "The Cascades" || c.C7.s !== "CHARD Developments" || c.C8.s !== "Sam Lee") throw new Error("header block");',
  '    if (c.J6.s !== "Salesforce opportunity" || c.L8.s !== "New") throw new Error("PM block " + JSON.stringify([c.J6, c.L8]));',
  '    if (c.A17.s !== "#" || c.C17.s !== "Item Code" || c.R17.s !== "Line Total") throw new Error("header row");',
  '    if (c.C18.s !== "ART.1" || c.C21.s !== "EGD.1" || c.C22) throw new Error("piece rows " + JSON.stringify([c.C18, c.C21, c.C22]));',
  '    if (c.D18.s !== "GDC.010.00219.1" || c.E18.s !== "Blue Hour" || c.N18.s !== "LT Artistic") throw new Error("piece cells");',
  '    if (c.H18.s.indexOf("16") !== 0 || c.I18.s.indexOf("24") !== 0 || c.J18.s.indexOf("MICH 132-29") < 0) throw new Error("spec strings " + [c.H18.s, c.I18.s, c.J18.s].join("|"));',
  '    if (c.M21.s !== FLAT_GRAPHIC_APPLICATION["Wallcovering (EGD)"]) throw new Error("EGD substrate " + c.M21.s);',
  '    if (c.O19.v !== "2" || c.P18.v !== "100" || c.Q18.v !== "192.31") throw new Error("qty / prices " + JSON.stringify([c.O19, c.P18, c.Q18]));',
  '    if (c.R18.f !== "IF(Q18=\\"\\",\\"\\",O18*Q18)") throw new Error("line total " + c.R18.f);',
  '    if (c.Q20 && c.Q20.v) throw new Error("an unpriced piece got a price");',
  '    if (c.C13.f !== "SUM(O18:O21)" || c.C13.v !== "5") throw new Error("Pieces " + JSON.stringify(c.C13));',
  '    if (c.O23.f !== "SUM(O18:O21)" || c.R23.f !== "SUM(R18:R21)") throw new Error("totals " + JSON.stringify([c.O23, c.R23]));',
  '    if (c.R27.f !== "(R23+R24)*R26" || c.R28.f !== "R23+R24+R25+R27" || c.P28.s !== "TOTAL (USD)") throw new Error("tax / total " + JSON.stringify([c.R27, c.R28, c.P28]));',
  '    const want = _priceTotals().sell; if (Math.abs(want - (192.31 + 2 * 374.62)) > 0.01 || Math.abs(parseFloat(c.R23.v) - want) > 0.01) throw new Error("subtotal cached " + c.R23.v);',
  '  });',
  '',
  '  await check("offline (no logo) the Order sheet names Farmboy in type instead", async function () {',
  '    fresh(); const keep = _getPdfLogos; _getPdfLogos = async function () { return { farmboy: null }; };',
  '    try {',
  '      const b = await build(), c = cellsOf(await b.txt("xl/worksheets/sheet1.xml"));',
  '      if (!c.A1 || c.A1.s !== "FARMBOY FINE ARTS") throw new Error(JSON.stringify(c.A1));',
  '      if (((await b.txt("xl/drawings/drawing1.xml")).match(/<xdr:pic>/g) || []).length !== 2) throw new Error("thumbnails only");',
  '    } finally { _getPdfLogos = keep; }',
  '  });',
  '',
  '  await check("the custom styles come AFTER the nine fixed ones, so an RFQ or quote workbook is unchanged", async function () {',
  '    fresh();',
  '    const old = await JSZip.loadAsync(await _xlsxBlob([_rfqSheet("rfq")], "uint8array"));',
  '    const s0 = await old.file("xl/styles.xml").async("string");',
  '    if (s0.indexOf("<cellXfs count=\\"9\\">") < 0 || s0.indexOf("<fonts count=\\"3\\">") < 0 || s0.indexOf("<fills count=\\"3\\">") < 0 || s0.indexOf("<borders count=\\"2\\">") < 0) throw new Error("fixed styles changed");',
  '    if (old.file("xl/drawings/drawing1.xml") || (await old.file("[Content_Types].xml").async("string")).indexOf("png") >= 0) throw new Error("an RFQ grew a drawing");',
  '    const w0 = await old.file("xl/worksheets/sheet1.xml").async("string");',
  '    if (w0.indexOf("<pane ySplit=\\"9\\"") < 0 || w0.indexOf("<pageSetup") >= 0 || w0.indexOf("<mergeCells") >= 0) throw new Error("RFQ sheet view changed");',
  '    const b = await build(), s1 = await b.txt("xl/styles.xml");',
  '    const m = /<cellXfs count="([0-9]+)">/.exec(s1);',
  '    if (!m || +m[1] <= 9) throw new Error("no custom cellXfs");',
  '    const xfs = s1.split("<cellXfs")[1].split("</cellXfs>")[0];',
  '    if (xfs.indexOf(s0.split("<cellXfs count=\\"9\\">")[1].split("</cellXfs>")[0]) < 0) throw new Error("the nine fixed cellXfs moved");',
  '    const n = +m[1], used = (await b.txt("xl/worksheets/sheet1.xml")).match(/ s="([0-9]+)"/g).map(function (a) { return +a.replace(/[^0-9]/g, ""); });',
  '    if (used.some(function (i) { return i >= n; })) throw new Error("a cell names a style that does not exist");',
  '    if (s1.indexOf("FF1F1D1A") < 0 || s1.indexOf("FFFFF2CC") < 0 || s1.indexOf("<name val=\\"Arial\\"/>") < 0) throw new Error("brand ink, PM yellow, Arial");',
  '  });',
  '',
  '  await check("one style object per look: identical st objects share one cellXf", async function () {',
  '    const z = await JSZip.loadAsync(await _xlsxBlob([{ name: "t", rows: [[{ s: "a", st: { fill: "FFF2CC" } }, { s: "b", st: { fill: "FFF2CC" } }, { s: "c", st: { fill: "1F1D1A" } }]] }], "uint8array"));',
  '    const s = await z.file("xl/styles.xml").async("string");',
  '    if (s.indexOf("<cellXfs count=\\"11\\">") < 0) throw new Error(/<cellXfs count="[0-9]+"/.exec(s)[0]);',
  '  });',
  '',
  '  await check("the export is offered in the dashboard Export menu and on the Pricing tab", async function () {',
  '    if (APP_SRC.indexOf("label: \'Order workbook (Excel)\'") < 0 || APP_SRC.indexOf("onClick: () => exportOrderXlsx()") < 0) throw new Error("Export menu");',
  '    fresh(); openProduction("pricing");',
  '    const m = document.getElementById("productionModal");',
  '    const labels = Array.prototype.map.call(m.querySelectorAll("button"), function (b) { return b.textContent; });',
  '    if (labels.indexOf("Order workbook") < 0 || labels.indexOf("Salesforce CSV") < 0) throw new Error(labels.join("|"));',
  '    m.remove();',
  '  });',
  '',
  '  if (window.__keep) { fresh(); window.__keepBytes = await _xlsxBlob(await _orderSheets(), "uint8array"); }',
  '  return out;',
  '})();',
].join(NL);
const quiet = console.error; console.error = () => {};
window.APP_SRC = APP;
window.__keep = !!process.env.ORDER_XLSX_OUT;
window.eval(TPL + NL + APP + NL + 'var APP_SRC = window.APP_SRC;' + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  if (process.env.ORDER_XLSX_OUT && window.__keepBytes) fs.writeFileSync(process.env.ORDER_XLSX_OUT, Buffer.from(window.__keepBytes));
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
});
