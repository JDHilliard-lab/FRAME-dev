// WHAT WENT OUT AND WHAT CHANGED (19.90). Caesars went out as IFS, IFS.2 and an October IFS;
// each time the PM asked by hand which specs had changed for which vendor. Mark as issued
// records what every piece printed (text only, never a picture); the diff names added,
// removed and changed pieces field by field, and rides in the production pack.
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
  '  const pic = function (t) { return "data:image/jpeg;base64," + "A".repeat(300) + t; };',
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", imageCode: "GDC." + id, artworkUrl: pic(id), fCode: "MICH 241-09", fColorName: "Black" }, o || {}); };',
  '  const fresh = function () {',
  '    editorialContent = _editorialDefaults(); dashUnit = "in";',
  '    dashProjectData = [mk("ART.1", { vendorName: "Bruce White Gallery" }), mk("ART.2", { vendorName: "Bruce White Gallery" }), mk("ART.3", { vendorName: "Duggal" })];',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory();',
  '  };',
  '',
  '  await check("EXACT BUG: after the frame swap and a mount fix, the diff names each piece and field; added and removed are listed", async function () {',
  '    fresh();',
  '    markIssued("V7 IFS");',
  '    dashProjectData[1].fCode = "MICH 241-29";',
  '    dashProjectData[0].useFloatMount = true; dashProjectData[0].mount = "Float Mount";',
  '    dashProjectData.splice(2, 1); dashProjectData.push(mk("ART.4"));',
  '    const d = _issueDiff(editorialContent.issues[0]);',
  '    if (d.added.join() !== "ART.4" || d.removed.join() !== "ART.3") throw new Error(JSON.stringify([d.added, d.removed]));',
  '    if (d.changed.map(function (c) { return c.id; }).join() !== "ART.1,ART.2") throw new Error(JSON.stringify(d.changed));',
  '    const fc = d.changed[1].fields.find(function (f) { return f.label === "Frame Code"; });',
  '    if (!fc || fc.was.indexOf("241-09") < 0 || fc.now.indexOf("241-29") < 0) throw new Error(JSON.stringify(d.changed[1].fields));',
  '    if (!d.changed[0].fields.some(function (f) { return f.label === "Mount"; })) throw new Error("mount change missing: " + JSON.stringify(d.changed[0].fields));',
  '    const t = _issueDiffText(editorialContent.issues[0]);',
  '    if (t.indexOf("Changes since V7 IFS") !== 0 || t.indexOf("ADDED") < 0 || t.indexOf("REMOVED") < 0 || t.indexOf("\\u2192") < 0) throw new Error(t);',
  '    const csv = _issueDiffCSV(editorialContent.issues[0]);',
  '    if (csv.indexOf("\\"ART.2\\",\\"Changed\\",\\"Frame Code\\"") < 0 || csv.indexOf("Bruce White Gallery") < 0) throw new Error(csv);',
  '    if (csv.indexOf("\\"ART.3\\",\\"Removed\\",\\"\\",\\"\\",\\"\\",\\"Duggal\\"") < 0) throw new Error("removed row lost its vendor: " + csv);',
  '  });',
  '',
  '  await check("nothing changed says so; a new picture is a change, and the record never holds the picture", async function () {',
  '    fresh(); markIssued("V7");',
  '    if (_issueDiffText(editorialContent.issues[0]).indexOf("No changes since V7") !== 0) throw new Error(_issueDiffText(editorialContent.issues[0]));',
  '    if (JSON.stringify(editorialContent.issues).indexOf("data:image") >= 0) throw new Error("a picture went into the record");',
  '    dashProjectData[0].artworkUrl = pic("recoloured");',
  '    const c = _issueDiff(editorialContent.issues[0]).changed;',
  '    if (c.length !== 1 || c[0].fields[0].label !== "Artwork" || c[0].fields[0].now !== "new picture") throw new Error(JSON.stringify(c));',
  '  });',
  '',
  '  await check("the label defaults to the footer version; each mark is one undo; twelve are kept; deleting the last removes the field", async function () {',
  '    fresh();',
  '    const el = document.getElementById("specPdfVersion"); if (el) el.value = "V7 IFS.2"; else window._specPdfMeta = { version: "V7 IFS.2" };',
  '    const n0 = undoStack.length;',
  '    if (markIssued("").label !== "V7 IFS.2") throw new Error("label");',
  '    if (undoStack.length - n0 !== 1) throw new Error("undo");',
  '    for (let i = 0; i < 14; i++) markIssued("I" + i);',
  '    if (editorialContent.issues.length !== 12 || editorialContent.issues[11].label !== "I13") throw new Error("cap");',
  '    while (editorialContent.issues && editorialContent.issues.length) deleteIssue(0);',
  '    if ("issues" in editorialContent) throw new Error("empty list kept");',
  '  });',
  '',
  '  await check("the production pack carries the changes since the latest issue", async function () {',
  '    fresh(); markIssued("V7 IFS"); dashProjectData[0].fCode = "MICH 241-29";',
  '    const files = await _prodPackFiles({ noPdf: true });',
  '    const f = files.find(function (x) { return /\\.Changes-since-V7-IFS\\.csv$/.test(x.name); });',
  '    if (!f || f.data.indexOf("ART.1") < 0) throw new Error(files.map(function (x) { return x.name; }).join());',
  '  });',
  '',
  '  await check("the Issues tab shows the diff of the latest issue", async function () {',
  '    fresh(); markIssued("V7 IFS"); dashProjectData[0].fCode = "MICH 241-29";',
  '    openProduction("issues");',
  '    const ta = document.getElementById("issueDiffText");',
  '    if (!ta || ta.value.indexOf("ART.1") < 0) throw new Error("no diff shown");',
  '    document.getElementById("productionModal").remove();',
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
