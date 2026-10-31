// FRAME_API 2 (20.01), what the deck-building driver needed on its first real brief (Caesars
// Forum Villas, Issue for Concept): the Project tab fields, which standard pages print, filling
// the cover and other fixed pages, dropping an unused image slot, a contents line, the Thank You
// team, and an export that passes what Generate PDF passes. Plus the two renderer bugs that
// build found: a justified paragraph’s last line stretched, and image codes cut mid-code.
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
  "  await check(\"setProject writes the Project tab fields the cover, footer and save read; an unknown field is an error\", async function () {",
  "    fresh([]);",
  "    const r = A.setProject({ name: \"Caesars Palace Villas\", client: \"Canoe Hospitality\", code: \"CANO-CP\", version: \"V2\", location: \"Las Vegas, NV\" });",
  "    if (r.error) throw new Error(r.error);",
  "    const m = _deckFooterMeta();",
  "    if (m.code !== \"CANO-CP\" || m.version !== \"V2\" || m.location !== \"Las Vegas, NV\") throw new Error(JSON.stringify(m));",
  "    if (document.getElementById(\"g_projName\").value !== \"Caesars Palace Villas\") throw new Error(\"name\");",
  "    if (!A.setProject({ colour: \"red\" }).error) throw new Error(\"unknown field accepted\");",
  "  });",
  "",
  "  await check(\"setPages switches standard pages through the Project tab ticks (saved, one undo)\", async function () {",
  "    fresh([]); const n0 = undoStack.length;",
  "    const r = A.setPages({ narrative: false, strategy: false, timeline: true });",
  "    if (r.error) throw new Error(r.error);",
  "    const keys = A.listPages().map(function (p) { return p.key; });",
  "    if (keys.indexOf(\"fixed:narrative\") >= 0 || keys.indexOf(\"fixed:strategy\") >= 0 || keys.indexOf(\"card:timeline\") < 0) throw new Error(keys.join());",
  "    if (editorialContent.includePages.narrative !== false) throw new Error(\"not saved\");",
  "    if (undoStack.length !== n0 + 1) throw new Error((undoStack.length - n0) + \" undo entries\");",
  "    if (!A.setPages({ moodboard: true }).error) throw new Error(\"unknown page accepted\");",
  "  });",
  "",
  "  await check(\"the cover and the other fixed pages are described and filled like layout pages\", async function () {",
  "    fresh([]);",
  "    const d = A.describePage(\"fixed:cover\");",
  "    if (d.texts.length !== 3 || d.texts[1].text !== \"COVER PAGE HEADING\") throw new Error(JSON.stringify(d.texts));",
  "    if (!A.listPages().find(function (p) { return p.key === \"fixed:cover\"; }).editable) throw new Error(\"cover not editable\");",
  "    const r = await A.fillPage(\"fixed:cover\", { texts: [\"LAS VEGAS\", \"CAESARS PALACE\", \"THE FORUM VILLAS\"] });",
  "    if (r.error) throw new Error(r.error);",
  "    if (editorialContent.coverPage.elements[1].text !== \"CAESARS PALACE\") throw new Error(\"cover not written\");",
  "    if (!(await A.fillPage(\"card:contacts\", { texts: [\"x\"] })).error) throw new Error(\"a card page took text\");",
  "  });",
  "",
  "  await check(\"an image slot given false is taken off the page, the others keep their template numbers\", async function () {",
  "    fresh([]);",
  "    const p = await A.addPage({ template: \"Moodboard (Alt)\" });",
  "    const before = A.describePage(p.key).images;",
  "    const r = await A.fillPage(p.key, { images: { 4: false, 5: false } });",
  "    if (r.error) throw new Error(r.error);",
  "    const after = A.describePage(p.key).images;",
  "    if (after.length !== before.length - 2) throw new Error(before.length + \" -> \" + after.length);",
  "    if (after[0].x !== before[0].x || after[3].w !== before[3].w) throw new Error(\"other slots moved\");",
  "  });",
  "",
  "  await check(\"a contents line can be hidden or renamed; removePage takes a layout page out, not a fixed one\", async function () {",
  "    fresh([]);",
  "    const p = await A.addPage({ template: \"Keywords\" });",
  "    A.setContentsEntry(p.key, { hide: true });",
  "    if (!(editorialContent.tocOverrides[p.key] || {}).hide) throw new Error(\"not hidden \" + JSON.stringify(editorialContent.tocOverrides));",
  "    A.setContentsEntry(p.key, { label: \"Mood words\" });",
  "    if (editorialContent.tocOverrides[p.key].label !== \"Mood words\") throw new Error(\"label\");",
  "    if (!A.removePage(\"fixed:cover\").error) throw new Error(\"removed a fixed page\");",
  "    const q = await A.addPage({ template: \"Moodboard (Alt)\" }); if (!(editorialContent.annotations || {})[q.key]) throw new Error(\"fixture: no slots\");",
  "    if (A.removePage(q.key).error || (editorialContent.annotations || {})[q.key]) throw new Error(\"its slots were left behind\");",
  "    const r = A.removePage(p.key);",
  "    if (r.error || A.listPages().some(function (x) { return x.key === p.key; })) throw new Error(\"still there\");",
  "    if ((editorialContent.annotations || {})[p.key]) throw new Error(\"its slots were left behind\");",
  "  });",
  "",
  "  await check(\"setContacts writes the Thank You list; a name not in the directory is an error, an object is taken as given\", async function () {",
  "    fresh([]);",
  "    const bad = await A.setContacts([\"Nobody Here\"]);",
  "    if (!bad.error) throw new Error(\"unknown name accepted\");",
  "    const r = await A.setContacts([{ name: \"Pat Doe\", role: \"Art Director\", email: \"pd@example.com\" }]);",
  "    if (r.error) throw new Error(r.error);",
  "    if (editorialContent.contacts.indexOf(\"Pat Doe\") !== 0 || editorialContent.contacts.indexOf(\"Art Director\") < 0) throw new Error(editorialContent.contacts);",
  "  });",
  "",
  "  await check(\"EXACT BUG: exportPDF passes what Generate PDF passes (footer location, code and version)\", async function () {",
  "    fresh([]); A.setProject({ code: \"CANO-CP\", version: \"PILOT\", location: \"Las Vegas, NV\" });",
  "    let seen = null; const was = exportSpecPagePDF;",
  "    exportSpecPagePDF = function (o) { seen = o; return Promise.resolve({ pages: 1 }); };",
  "    try { await A.exportPDF(); } finally { exportSpecPagePDF = was; }",
  "    if (!seen || !seen.meta || seen.meta.location !== \"Las Vegas, NV\" || seen.meta.version !== \"PILOT\" || !seen.all || !seen.include || !seen.returnPdf) throw new Error(JSON.stringify(seen));",
  "  });",
  "",
  "  await check(\"EXACT BUG: a justified paragraph's last line is not stretched, only the lines inside it\", async function () {",
  "    const measure = function (txt) { return txt.length * 5; };",
  "    const t = { text: \"aa bb cc dd ee ff gg hh\\n\\nii jj kk ll mm nn oo pp\", align: \"justify\", size: 0.02, font: \"serif\" };",
  "    const lines = _layoutRichLines(t, 60, 540, measure);",
  "    const ends = lines.map(function (l) { return !!l.paraEnd; });",
  "    if (ends.filter(Boolean).length !== 3) throw new Error(\"paragraph ends \" + JSON.stringify(ends));",
  "    const xs = []; const doc = { setFont: function () {}, setFontSize: function () {}, setTextColor: function () {}, text: function (s, x) { xs.push({ s: s, x: x }); }, getTextWidth: function (s) { return s.length * 5; } };",
  "    const _m = _richPdfMeasure; _richPdfMeasure = function () { return measure; };",
  "    try { _drawRichTextPdf(doc, t, 0, 0, 60, 540); } finally { _richPdfMeasure = _m; }",
  "    const at = function (w) { return xs.find(function (o) { return o.s === w; }).x; };",
  "    if (!(at(\"hh\") > 25)) throw new Error(\"an inner line was not justified: hh at \" + at(\"hh\"));",
  "    if (at(\"gg\") !== 0 && at(\"hh\") - at(\"gg\") > 15) throw new Error(\"the paragraph end gg hh was stretched: \" + at(\"gg\") + \" \" + at(\"hh\"));",
  "  });",
  "",
  "  await check(\"EXACT BUG: an image-code caption prints whole on one line (smaller), never cut mid-code; a written caption still wraps\", async function () {",
  "    const calls = []; let fs = 9;",
  "    const doc = { setFont: function () {}, setTextColor: function () {}, setFontSize: function (n) { fs = n; },",
  "      getTextWidth: function (s) { return s.length * fs * 0.5; }, splitTextToSize: function (s, w) { const n = Math.max(1, Math.floor(w / (fs * 0.5))); const o = []; for (let i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o; },",
  "      text: function (s) { calls.push(s); } };",
  "    const a = { showCaption: true, capSource: \"filename\", fileName: \"DMM.010.00087.1.jpg\" };",
  "    _drawAnnCaption(doc, a, 0, 0, 40, 40);",
  "    if (calls.length !== 1 || calls[0] !== \"DMM.010.00087.1\") throw new Error(JSON.stringify(calls));",
  "    if (!(fs < 9 && fs >= CAP_CODE_MIN_PT)) throw new Error(\"size \" + fs);",
  "    calls.length = 0; fs = 9;",
  "    _drawAnnCaption(doc, { showCaption: true, capSource: \"text\", caption: \"Grand Entrance interior render\" }, 0, 0, 40, 40);",
  "    if (!Array.isArray(calls[0]) || calls[0].length < 2) throw new Error(\"a written caption no longer wraps \" + JSON.stringify(calls));",
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
