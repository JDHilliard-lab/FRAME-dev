// CODES FOLLOW THEIR TYPE AND STAY IN ORDER; PLAN <-> SPEC PAGE LINKS (17.92).
//  "I moved ART 02 and 03 to be EGD but the numbers did not start at 01. I need
//   everything to re order the numbers in plan view and coordinate with spec pages."
//  "in spec pages we also had a hyperlink to select the detail plan view to jump you back
//   to the floorplan page, and vice versa selecting an item code pinned in the floorplan
//   would jump you to that spec page."
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const body = [
  '_autosaveToldUser = true;',
  '_dsRefresh = function () {}; _dsRenderCenter = function () {}; _dsRenderRail = function () {}; _dsRenderTools = function () {};',
  '_toast = function () { return null; };',
  'window.__res = (async function () {',
  '  const out = [];',
  '  const check = async function (label, fn) { try { await fn(); out.push({ label: label, ok: true }); } catch (e) { out.push({ label: label, ok: false, err: e.message }); } };',
  '  const fresh = function () { editorialContent = _editorialDefaults(); dashProjectData = []; elevations = [{ id: "w0", name: "Lobby", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }]; undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; };',
  '  const ids = function () { return dashProjectData.map(function (r) { return r.id; }).join(); };',
  '',
  '  await check("EXACT BUG: moving ART.2 and ART.3 to EGD makes them EGD.1 and EGD.2, and the ART codes close up", async function () {',
  '    fresh();',
  '    for (let i = 0; i < 6; i++) _fpAddCodes("framed", 1);',
  '    pushHistory();',
  '    _dsFpSetCategory("ART.2", "egd");',
  '    _dsFpSetCategory("ART.3", "egd");',
  '    const want = ["ART.1", "ART.2", "ART.3", "ART.4", "EGD.1", "EGD.2"];',
  '    const got = dashProjectData.map(function (r) { return r.id; }).slice().sort();',
  '    if (got.join() !== want.slice().sort().join()) throw new Error("codes: " + ids());',
  '    const egd = dashProjectData.filter(function (r) { return r.id.indexOf("EGD") === 0; });',
  '    egd.forEach(function (r) { if (r.product !== "Wallcovering (EGD)") throw new Error(r.id + " product " + r.product); });',
  '    const nums = _fpGroups().filter(function (g) { return g.key.indexOf("EGD") === 0; }).map(function (g) { return g.num; }).sort().join();',
  '    if (nums !== "01,02") throw new Error("EGD pin numbers " + nums);',
  '  });',
  '',
  '  await check("the order is kept: the old ART.4 becomes ART.2, the old ART.6 becomes ART.4", async function () {',
  '    fresh();',
  '    for (let i = 0; i < 6; i++) _fpAddCodes("framed", 1);',
  '    dashProjectData.forEach(function (r) { r.location = "L" + r.id.split(".")[1]; });',
  '    // The list renumbers the moment a code leaves, so the second piece to move is now',
  '    // ART.2 too (it was ART.3): exactly what the designer sees in the panel.',
  '    _dsFpSetCategory("ART.2", "egd");',
  '    if ((dashProjectData.find(function (r) { return r.id === "ART.2"; }) || {}).location !== "L3") throw new Error("the list did not close up after the first move");',
  '    _dsFpSetCategory("ART.2", "egd");',
  '    const at = function (id) { return (dashProjectData.find(function (r) { return r.id === id; }) || {}).location; };',
  '    if (at("ART.2") !== "L4" || at("ART.4") !== "L6") throw new Error("ART.2 is " + at("ART.2") + ", ART.4 is " + at("ART.4"));',
  '    if (at("EGD.1") !== "L2" || at("EGD.2") !== "L3") throw new Error("EGD order lost");',
  '  });',
  '',
  '  await check("walls, plan details and per-page settings follow the renumbering", async function () {',
  '    fresh();',
  '    for (let i = 0; i < 4; i++) _fpAddCodes("framed", 1);',
  '    _fpApplyFrameSetNow("ART.4", dashProjectData.filter(function (r) { return r.id === "ART.4"; }), 2, "");',
  '    editorialContent.planDetails = [{ id: "pd", ids: ["ART.4"] }];',
  '    editorialContent.specTemplateOverrides = { "spec:ART.4": "frameRight" };',
  '    _dsFpSetCategory("ART.2", "wf");',
  '    if (ids().indexOf("ART.3A") < 0 || ids().indexOf("ART.4") >= 0) throw new Error("set not renumbered: " + ids());',
  '    const wall = elevations.find(function (e) { return (e.frames || []).some(function (f) { return f.id === "ART.3A"; }); });',
  '    if (!wall) throw new Error("the wall frames kept the old code");',
  '    if (editorialContent.planDetails[0].ids[0] !== "ART.3") throw new Error("plan detail kept " + editorialContent.planDetails[0].ids[0]);',
  '    if (editorialContent.specTemplateOverrides["spec:ART.3"] !== "frameRight") throw new Error("page setting did not follow");',
  '    if (ids().indexOf("WF.1") < 0) throw new Error("no WF.1");',
  '  });',
  '',
  '  await check("one Ctrl+Z puts every code back", async function () {',
  '    fresh();',
  '    for (let i = 0; i < 3; i++) _fpAddCodes("framed", 1);',
  '    pushHistory();',
  '    const before = ids();',
  '    _dsFpSetCategory("ART.1", "egd");',
  '    if (ids() === before) throw new Error("nothing changed");',
  '    undo();',
  '    if (ids() !== before) throw new Error("undo left " + ids());',
  '  });',
  '',
  '  await check("a tier category (no prefix) changes the colour and leaves the code alone", async function () {',
  '    fresh();',
  '    editorialContent.artCategories = editorialContent.artCategories.concat([{ key: "primary", label: "Primary", color: "#E2231A" }]);',
  '    _fpAddCodes("framed", 1); _fpAddCodes("framed", 1);',
  '    _dsFpSetCategory("ART.1", "primary");',
  '    if (ids() !== "ART.1,ART.2") throw new Error(ids());',
  '  });',
  '',
  '  await check("catalogue codes are structure, not a count: never renumbered", async function () {',
  '    fresh();',
  '    dashProjectData = [Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: "ART.1.2A" }), Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: "ART.5" })];',
  '    _renumberPrefix("ART");',
  '    if (ids() !== "ART.1.2A,ART.1") throw new Error(ids());',
  '  });',
  '',
  '  await check("EXACT ASK: a spec page plan thumbnail links to its level floorplan page in the PDF", async function () {',
  '    const links = [];',
  '    const doc = { link: function (x, y, w, h, o) { links.push(o.pageNumber); } };',
  '    _curPageKey = "spec:ART.1"; _specPlanRects["spec:ART.1"] = [];',
  '    _specPlanRectAdd(10, 10, 100, 100, 1);',
  '    _linkSpecPlanRects(doc, "spec:ART.1", { 1: 7 }, 3);',
  '    _curPageKey = "spec:ART.2"; _specPlanRects["spec:ART.2"] = [];',
  '    _specPlanRectAdd(10, 10, 100, 100, 4);',
  '    _linkSpecPlanRects(doc, "spec:ART.2", { 1: 7 }, 3);',
  '    if (links.join() !== "7,3") throw new Error("links " + links.join());',
  '  });',
  '',
  '  await check("every plan thumbnail draw site records its rect, and the export links them", async function () {',
  '    const n = APP_SRC.split("_specPlanRectAdd(").length - 1;',
  '    if (n < 7) throw new Error("only " + (n - 1) + " draw sites record a rect");',
  '    if (APP_SRC.split("_linkSpecPlanRects(doc, stepKey").length - 1 < 2) throw new Error("the export does not link spec and breaker pages");',
  '  });',
  '',
  '  await check("EXACT ASK: clicking a pin opens its spec page; a double-click still removes it", async function () {',
  '    fresh();',
  '    _fpAddCodes("framed", 1); _fpAddCodes("framed", 1);',
  '    dashProjectData.forEach(function (r) { _fpSetPin(r, 0, 0.5, 0.5); });',
  '    _dsPages = [{ kind: "floorplan", level: 0 }, { kind: "spec", title: "ART.1", row: dashProjectData[0], members: [dashProjectData[0]] }, { kind: "spec", title: "ART.2", row: dashProjectData[1], members: [dashProjectData[1]] }];',
  '    _deckPageList = function () { return _dsPages; };',
  '    _dsIndex = 0;',
  '    const ev = { preventDefault: function () {}, stopPropagation: function () {}, clientX: 5, clientY: 5, currentTarget: document.body };',
  '    _dsFpPinDown(ev, "ART.2"); _dsFpDragUp();',
  '    await new Promise(function (r) { setTimeout(r, 350); });',
  '    if (_dsIndex !== 2) throw new Error("a pin click did not open ART.2 (index " + _dsIndex + ")");',
  '    _dsIndex = 0;',
  '    _dsFpPinDown(ev, "ART.2"); _dsFpDragUp();',
  '    const pin = _dsMakePin(_fpFindGroup("ART.2"), 1);',
  '    pin.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));',
  '    await new Promise(function (r) { setTimeout(r, 350); });',
  '    if (_dsIndex !== 0) throw new Error("a double-click navigated away");',
  '    if (_fpPins(dashProjectData[1]).length) throw new Error("the double-click did not remove the pin");',
  '  });',
  '',
  '  await check("and the floorplan jump lands on the right level", async function () {',
  '    _dsPages = [{ kind: "floorplan", level: 0 }, { kind: "floorplan", level: 1 }, { kind: "spec", title: "X" }];',
  '    _dsIndex = 2;',
  '    _dsJumpToFloorplan(1);',
  '    if (_dsIndex !== 1) throw new Error("landed on " + _dsIndex);',
  '  });',
  '  return out;',
  '})();',
].join(NL);
const quiet = console.error; console.error = () => {};
window.APP_SRC = APP;
window.eval(APP + NL + 'var APP_SRC = window.APP_SRC;' + NL + body);
console.error = quiet;
window.__res.then((results) => {
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
});
