// 20.55: A PIN CLICK PICKS, THE LEGEND LINE REORDERS.
//  "I'm wondering if we can only make the pin on the legend the clickable hyperlinks, becuase
//   when moving the pins on the plan view it sometimes accidently jumps to the spec page. What
//   I would like to happen instead is that when you click a pin that is placed on the plan view
//   it highlights in the legend"
//  "the legend gets a highlight, and two visible arrows up and down, or mayeb a dimondshape to
//   the left of it which you would select and drag."
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
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
  '  const fresh = function (n) { editorialContent = _editorialDefaults(); dashProjectData = []; elevations = [{ id: "w0", name: "Lobby", wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }]; undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true; for (let i = 0; i < n; i++) _fpAddCodes("framed", 1); dashProjectData.forEach(function (r) { r.location = "L" + r.id.split(".")[1]; _fpSetPin(r, 0, 0.5, 0.5); }); _dsPages = [{ kind: "floorplan", level: 0 }]; _deckPageList = function () { return _dsPages; }; _dsIndex = 0; _dsFpPickRow = null; };',
  '  const ev = { preventDefault: function () {}, stopPropagation: function () {}, clientX: 5, clientY: 5, currentTarget: document.body };',
  '  const realKE = _fpKeyEntries;',
  '  // The legend overlay, the way Deck Studio builds it over the drawn key list.',
  '  const legend = function () {',
  '    const keys = _placementList().map(function (g) { return g.key; });',
  '    _fpListRects[_fpListSig(keys)] = keys.map(function (k, i) { return { x: 20, y: 60 + i * 12, w: 200, h: 12, key: k }; });',
  '    _fpKeyEntries = function () { return keys.map(function (k) { return { key: k }; }); };',
  '    const page = document.createElement("div"); document.body.appendChild(page);',
  '    try { _dsFpListLinks(page, { level: 0 }, 1); } finally { _fpKeyEntries = realKE; }',
  '    const line = function (k) { return page.querySelector("[data-fp-legend=\\"" + k + "\\"]"); };',
  '    return { page: page, line: line, remove: function () { page.remove(); } };',
  '  };',
  '',
  '  await check("EXACT ASK: a pin click does not open the spec page, it picks the pin", async function () {',
  '    fresh(3);',
  '    let jumped = null; const real = _dsJumpToSpecFor; _dsJumpToSpecFor = function (k) { jumped = k; };',
  '    try {',
  '      _dsFpPinDown(ev, "ART.2"); _dsFpDragUp();',
  '      await new Promise(function (r) { setTimeout(r, 350); });',
  '    } finally { _dsJumpToSpecFor = real; }',
  '    if (jumped) throw new Error("a pin click jumped to " + jumped);',
  '    if (_dsFpPickKey() !== "ART.2") throw new Error("picked " + _dsFpPickKey());',
  '  });',
  '',
  '  await check("EXACT ASK: the picked pin highlights in the legend (and on the plan)", async function () {',
  '    fresh(3);',
  '    const L = legend();',
  '    const pin = _dsMakePin(_fpFindGroup("ART.2"), 1); L.page.appendChild(pin);',
  '    _dsFpPinDown(Object.assign({}, ev, { currentTarget: pin }), "ART.2"); _dsFpDragUp();',
  '    if (!L.line("ART.2").classList.contains("is-picked")) throw new Error("legend line not lit");',
  '    if (L.line("ART.1").classList.contains("is-picked")) throw new Error("the wrong line is lit");',
  '    if (!pin.classList.contains("ds-fp-pin-picked")) throw new Error("pin not lit");',
  '    _dsFpPinDown(Object.assign({}, ev, { currentTarget: pin }), "ART.2"); _dsFpDragUp();',
  '    if (_dsFpPickKey() || L.line("ART.2").classList.contains("is-picked")) throw new Error("a second click did not let it go");',
  '    L.remove();',
  '  });',
  '',
  '  await check("EXACT ASK: the legend line has a diamond grip and up / down arrows; the ends are off", async function () {',
  '    fresh(3);',
  '    const L = legend();',
  '    ["ART.1", "ART.2", "ART.3"].forEach(function (k) {',
  '      if (!L.line(k).querySelector(".ds-fp-lg-grip svg path")) throw new Error(k + " has no diamond grip");',
  '      if (L.line(k).querySelectorAll(".ds-fp-lg-step").length !== 2) throw new Error(k + " has no up/down arrows");',
  '    });',
  '    const steps = function (k) { return L.line(k).querySelectorAll(".ds-fp-lg-step"); };',
  '    if (!steps("ART.1")[0].classList.contains("is-off") || steps("ART.1")[1].classList.contains("is-off")) throw new Error("first line: up should be off, down on");',
  '    if (steps("ART.3")[0].classList.contains("is-off") || !steps("ART.3")[1].classList.contains("is-off")) throw new Error("last line: up on, down off");',
  '    L.remove();',
  '  });',
  '',
  '  await check("EXACT ASK: an up arrow trades numbers and the pick follows the piece to its new number", async function () {',
  '    fresh(3);',
  '    const L = legend();',
  '    _dsFpPickSet("ART.3", true);',
  '    const row = _dsFpPickRow;',
  '    let jumped = null; const real = _dsJumpToSpecFor; _dsJumpToSpecFor = function (k) { jumped = k; };',
  '    try { L.line("ART.3").querySelectorAll(".ds-fp-lg-step")[0].click(); } finally { _dsJumpToSpecFor = real; }',
  '    if (jumped) throw new Error("an arrow click opened the spec page");',
  '    if (row.id !== "ART.2" || row.location !== "L3") throw new Error("the piece is now " + row.id + " (" + row.location + ")");',
  '    if (_dsFpPickKey() !== "ART.2") throw new Error("the pick is on " + _dsFpPickKey());',
  '    if ((dashProjectData.find(function (r) { return r.location === "L2"; }) || {}).id !== "ART.3") throw new Error("the other piece did not take ART.3");',
  '    if (!undoStack.length) throw new Error("no undo entry");',
  '    L.remove();',
  '  });',
  '',
  '  await check("a click on the legend line itself is still the link to the spec page", async function () {',
  '    fresh(3);',
  '    const L = legend();',
  '    let jumped = null; const real = _dsJumpToSpecFor; _dsJumpToSpecFor = function (k) { jumped = k; };',
  '    try { L.line("ART.2").click(); } finally { _dsJumpToSpecFor = real; }',
  '    if (jumped !== "ART.2") throw new Error("jumped to " + jumped);',
  '    L.remove();',
  '  });',
  '',
  '  await check("only the grip starts a drag: the line body has no mousedown", async function () {',
  '    fresh(2);',
  '    const L = legend();',
  '    if (L.line("ART.1").onmousedown) throw new Error("the line body still drags");',
  '    if (!L.line("ART.1").querySelector(".ds-fp-lg-grip").onmousedown) throw new Error("the grip does not drag");',
  '    L.remove();',
  '  });',
  '',
  '  await check("clicking empty plan lets the pick go", async function () {',
  '    fresh(2);',
  '    _dsFpPickSet("ART.1", true);',
  '    _fpArmedId = null; _fpSketchOn = false; _fpLineArmId = null;',
  '    _dsFpPlace({ clientX: 0, clientY: 0 });',
  '    if (_dsFpPickRow) throw new Error("still picked");',
  '  });',
  '  return out;',
  '})();',
].join(NL);
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + body);
console.error = quiet;
window.__res.then((results) => {
  if (CSS.indexOf('.ds-fp-listlink.is-picked .ds-fp-lg-grip') < 0) results.push({ label: 'css: the picked line shows its handles', ok: false, err: 'missing rule' });
  else results.push({ label: 'css: the picked line shows its handles', ok: true });
  const failed = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
  console.log(NL + '--- Summary ---');
  if (failed.length) console.log(failed.length + ' FAILURES');
  else console.log('ALL PASSED (' + results.length + ')');
});
