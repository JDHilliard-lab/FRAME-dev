// EDITING SEVERAL PICTURES AT ONCE (20.02). Select pictures on a page (Shift-click or a
// box drag), open the settings: corners, caption on/off, source, alignment, font, SIZE
// (new, `capPt`), fit, shadow, fill and stroke changed there land on every selected box,
// and only what changed. The real clicks are checked in Chrome (test_frame_driver).
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
  '  const mk = function (id) { return Object.assign(_cloneData(dashDefaultData), { id: id, category: "framed" }); };',
  '  const fresh = function (ids) {',
  '    editorialContent = _editorialDefaults();',
  '    dashProjectData = ids.map(mk);',
  '    elevations = [{ id: "w0", name: "Elevation 1", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];',
  '    currentElevIndex = 0; elevFrames = elevations[0].frames;',
  '    undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; pushHistory();',
  '    __modals.length = 0;',
  '  };',
  '  const A = window.FRAME_API;',
  "  const shp = function (o) { return Object.assign({ type: \"shape\", shape: \"rect\", x: 0, y: 0, w: 0.2, h: 0.2, dataUrl: \"data:x\", fileName: \"A.010.00001.jpg\" }, o || {}); };",
  "",
  "  await check(\"EXACT ASK: a change made on one box of a group lands on every selected box, and only what changed\", async function () {",
  "    fresh([]);",
  "    const key = \"layout:test\";",
  "    editorialContent.annotations = {}; editorialContent.annotations[key] = [shp({ radius: 6 }), shp({ radius: 12 }), shp({ radius: 2, caption: \"Own words\" })];",
  "    const L = editorialContent.annotations[key];",
  "    const a = L[0], look0 = _dsGearLook(a);",
  "    a.showCaption = true; a.capSource = \"filename\"; a.capPt = 11;",
  "    const n = _dsGearGroupApply(a, look0, [0, 1, 2], key);",
  "    if (n !== 2) throw new Error(n + \" boxes changed\");",
  "    if (!L[1].showCaption || L[1].capSource !== \"filename\" || L[2].capPt !== 11) throw new Error(JSON.stringify(L));",
  "    if (L[1].radius !== 12 || L[2].radius !== 2) throw new Error(\"a radius nobody touched was overwritten\");",
  "    if (L[2].caption !== \"Own words\" || L[1].caption !== \"Caption\") throw new Error(\"captions: \" + L[1].caption + \" / \" + L[2].caption);",
  "    const look1 = _dsGearLook(a); a.radius = 0; _dsGearGroupApply(a, look1, [0, 1, 2], key);",
  "    if (L[1].radius !== 0 || L[2].radius !== 0) throw new Error(\"radius not applied\");",
  "    const look2 = _dsGearLook(a); delete a.capPt; _dsGearGroupApply(a, look2, [0, 1, 2], key);",
  "    if (\"capPt\" in L[1] || \"capPt\" in L[2]) throw new Error(\"back to the default size was not copied\");",
  "    if (_dsGearGroupApply(a, _dsGearLook(a), [0], key) !== 0) throw new Error(\"a single box applied to others\");",
  "  });",
  "",
  "  await check(\"a group step pushed by the control is retaken with every box in it; a control that pushed nothing gains no step\", async function () {",
  "    fresh([]);",
  "    const key = \"layout:test\";",
  "    editorialContent.annotations = {}; editorialContent.annotations[key] = [shp(), shp()];",
  "    const L = editorialContent.annotations[key];",
  "    let a = L[0], look0 = _dsGearLook(a), h0 = undoStack.length;",
  "    a.capPt = 12; pushHistory();",
  "    _dsGearGroupApply(a, look0, [0, 1], key, h0);",
  "    const top = JSON.stringify(undoStack[undoStack.length - 1]);",
  "    if ((top.match(/\"capPt\":12/g) || []).length < 2) throw new Error(\"the step holds one box\");",
  "    look0 = _dsGearLook(a); h0 = undoStack.length; a.radius = 4;",
  "    _dsGearGroupApply(a, look0, [0, 1], key, h0);",
  "    if (undoStack.length !== h0) throw new Error(\"a step was added\");",
  "  });",
  "",
  "  await check(\"only boxes on THIS page that are selected with it make a group; a locked box is left alone\", async function () {",
  "    fresh([]);",
  "    const key = \"layout:test\";",
  "    editorialContent.annotations = {}; editorialContent.annotations[key] = [shp(), shp({ locked: true }), { type: \"text\", text: \"x\" }, shp()];",
  "    const was = _mbCurAnnList; _mbCurAnnList = function () { return { key: key, list: editorialContent.annotations[key] }; };",
  "    try {",
  "      _mbSelAnn = [0, 1, 2, 3];",
  "      if (_dsGearGroup(key, 0).join() !== \"0,3\") throw new Error(_dsGearGroup(key, 0).join());",
  "      _mbSelAnn = [0, 3]; if (_dsGearGroup(key, 1).join() !== \"1\") throw new Error(\"opened from outside the selection\");",
  "      _mbSelAnn = [3]; if (_dsGearGroup(key, 0).join() !== \"0\") throw new Error(\"a box outside the selection\");",
  "      if (_dsGearGroup(\"layout:other\", 0).join() !== \"0\") throw new Error(\"another page\");",
  "    } finally { _mbCurAnnList = was; _mbSelAnn = []; }",
  "  });",
  "",
  "  await check(\"caption size: the PDF prints at the box's size and sits that far under it; 9pt when unset\", async function () {",
  "    const calls = []; let fs = 0;",
  "    const doc = { setFont: function () {}, setTextColor: function () {}, setFontSize: function (n) { fs = n; },",
  "      getTextWidth: function (s) { return s.length * fs * 0.5; }, splitTextToSize: function (s) { return [s]; },",
  "      text: function (s, x, y) { calls.push({ s: s, y: y, fs: fs }); } };",
  "    _drawAnnCaption(doc, shp({ showCaption: true, capSource: \"text\", caption: \"Hi\", capPt: 12 }), 0, 0, 200, 100);",
  "    _drawAnnCaption(doc, shp({ showCaption: true, capSource: \"text\", caption: \"Hi\" }), 0, 0, 200, 100);",
  "    if (calls[0].fs !== 12 || calls[0].y !== 115) throw new Error(JSON.stringify(calls[0]));",
  "    if (calls[1].fs !== 9 || calls[1].y !== 112) throw new Error(\"default moved: \" + JSON.stringify(calls[1]));",
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
