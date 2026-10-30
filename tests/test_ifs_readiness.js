// IFS READINESS (19.88). What the Caesars PM caught by hand while issuing POs: a recoloured
// picture saved under its old image code, TBD left in an issued spec, an alternate option
// still in the package, and V5 footers on V7 pages. Duplicate codes are checked always;
// the rest only once the footer version says IFS.
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
  '  const pic = function (t) { return "data:image/jpeg;base64," + "A".repeat(200) + t; };',
  '  const mk = function (id, o) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed", artworkUrl: pic("one"), imageCode: "GDC.000.001", fCode: "MICH 241-29" }, o || {}); };',
  '  const setVer = function (v) { const el = document.getElementById("specPdfVersion"); if (el) el.value = v; else window._specPdfMeta = { version: v }; };',
  '  const fresh = function (rows) {',
  '    editorialContent = _editorialDefaults(); dashProjectData = rows;',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames; _projectFileHandle = null; setVer("V6");',
  '  };',
  '  const errs = function () { return _readinessPreflight().filter(function (i) { return i.sev === "err"; }); };',
  '',
  '  await check("EXACT BUG: one image code on two different pictures is an error naming both pieces, at any stage", async function () {',
  '    fresh([mk("ART.1"), mk("ART.2", { artworkUrl: pic("two") }), mk("ART.3", { imageCode: "GDC.000.002" })]);',
  '    const e = errs();',
  '    if (e.length !== 1 || e[0].text.indexOf("GDC.000.001") !== 0 || e[0].text.indexOf("ART.1, ART.2") < 0) throw new Error(JSON.stringify(e));',
  '    if (!e[0].go || e[0].go.rowId !== "ART.1") throw new Error("no way to the piece");',
  '    if (!_dsRunPreflight().some(function (i) { return i.text === e[0].text; })) throw new Error("not in Preflight");',
  '  });',
  '',
  '  await check("the same picture in two placements is not an error", async function () {',
  '    fresh([mk("ART.1"), mk("ART.2")]);',
  '    if (errs().length) throw new Error(JSON.stringify(errs()));',
  '  });',
  '',
  '  await check("TBD in an IFS is an error naming the field; before IFS it is normal", async function () {',
  '    fresh([mk("ART.1", { imageCode: "TBD" }), mk("ART.2", { fCode: "TBD" }), mk("ART.3", { notes: "frame TBD" }), mk("ART.4")]);',
  '    if (errs().length) throw new Error("V6 complained: " + JSON.stringify(errs()));',
  '    setVer("V7 IFS");',
  '    const t = errs().map(function (i) { return i.text; });',
  '    if (t.length !== 3) throw new Error(JSON.stringify(t));',
  '    if (t[0] !== "ART.1 \\u2014 still TBD in an IFS: Image code") throw new Error(t[0]);',
  '    if (t[1].indexOf("ART.2") !== 0 || t[1].indexOf("Frame Code") < 0) throw new Error(t[1]);',
  '    if (t[2].indexOf("Notes") < 0) throw new Error(t[2]);',
  '  });',
  '',
  '  await check("an IFS still offering options for a placement warns", async function () {',
  '    fresh([mk("ART.1")]); setVer("V7 IFS");',
  '    const keepP = _catPlaces, keepT = _catTree;',
  '    try {',
  '      _catPlaces = function () { return ["ART.9"]; };',
  '      _catTree = function () { return [{ m: {}, opts: [{}, {}] }]; };',
  '      const w = _readinessPreflight().filter(function (i) { return i.sev === "warn"; });',
  '      if (w.length !== 1 || w[0].text.indexOf("ART.9 \\u2014 still shows 2 options") !== 0) throw new Error(JSON.stringify(w));',
  '      _catTree = function () { return [{ m: {}, opts: [{}] }]; };',
  '      if (_readinessPreflight().length) throw new Error("one option warned");',
  '    } finally { _catPlaces = keepP; _catTree = keepT; }',
  '  });',
  '',
  '  await check("a footer version that disagrees with the file name warns; a matching one does not", async function () {',
  '    fresh([mk("ART.1")]);',
  '    _projectFileHandle = { name: "250909.CANO.Caesars-Palace-Villas.V7.IFS.json" };',
  '    setVer("V5 IFS");',
  '    const w = _readinessPreflight().filter(function (i) { return i.sev === "warn"; });',
  '    if (w.length !== 1 || w[0].text.indexOf("footer says V5 but the project file is V7") < 0) throw new Error(JSON.stringify(w));',
  '    setVer("V7 IFS");',
  '    if (_readinessPreflight().length) throw new Error("matching version warned");',
  '    _projectFileHandle = null;',
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
