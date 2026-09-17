// "Some of my pages I have the image placeholders go full bleed covering half the
//  page, and when I do that I lose my image placeholder setting '+' since it falls
//  off the screen and same with drag to move the shape icon... Also, which gets
//  lost is the - and + buttons for the zoom into the image if I align the image at
//  the top."
//
// The page clips at the trim, because it is a picture of paper. That is right for
// CONTENT and wrong for the controls hanging off it: the move grip sat at
// left:-11px, the gear at right:-22px and the zoom stepper at bottom:100%, so on a
// full-bleed element every one of them was outside the page and therefore
// unreachable. The control existed and could not be clicked.
//
// _dsPinChrome clamps each one into the page. Safe because every drag handler
// here works from POINTER DELTAS, never from the handle's absolute position.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, strokeRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const nodeResults = [];
  const check = (label, fn) => {
    try { fn(); nodeResults.push({ label, ok: true }); }
    catch (e) { nodeResults.push({ label, ok: false, err: e.message }); }
  };
  const fnBody = (name) => {
    let i = src.indexOf('\nfunction ' + name + '(');
    if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
    if (i < 0) throw new Error('no such function: ' + name);
    let j = src.length;
    ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '].forEach(c => {
      const k = src.indexOf(c, i + 1); if (k >= 0 && k < j) j = k;
    });
    if (j - i < 40) throw new Error('empty slice for ' + name);
    return src.slice(i, j);
  };
  const codeOnly = (s) => s.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');

  check('no chrome positions itself with an edge the clamp cannot unpick', () => {
    // right:/bottom:/transform: are how the unclamped versions placed themselves.
    // Any left behind would fight the left/top _dsPinChrome writes.
    ['_dsMoveGrip', '_dsGearButton', '_dsImgZoomPill', '_dsAnnHandles', '_dsImgPanHandle'].forEach(fn => {
      const b = codeOnly(fnBody(fn));
      if (b.indexOf('_dsPinChrome') < 0) throw new Error(fn + ' does not pin its chrome to the page');
      ['right:-', 'bottom:100%', 'translate(-50%', 'translateX(-50%'].forEach(bad => {
        if (b.indexOf(bad) >= 0) throw new Error(fn + ' still positions with "' + bad + '", which the clamp cannot override');
      });
    });
  });

  check('the settings button is a disc carrying the app pen icon', () => {
    const b = codeOnly(fnBody('_dsGearButton'));
    if (b.indexOf('svgEdit') < 0) throw new Error('the settings button does not use the pen the rest of the app edits with');
    if (b.indexOf("textContent = '+'") >= 0) throw new Error('it is still a bare plus, which reads as punctuation on a photograph');
    if (b.indexOf('border-radius:50%') < 0) throw new Error('it is not a disc, so it has no ground of its own on an image');
    if (b.indexOf('_dsPinChrome') < 0) throw new Error('it is not clamped to the page');
  });

  check('the stage and the unclipped layer went with their one consumer', () => {
    // They existed only so a control could sit beyond the trim. Unused machinery
    // with tests asserting it exists is worse than a pattern written down.
    ['_dsPinOutside', '_dsChromeLayer', '_dsStagePage', 'DS_STAGE_GUTTER', '_chromeLayer'].forEach(n => {
      if (src.indexOf(n) >= 0) throw new Error(n + ' survived with no caller');
    });
  });

  check('the clamp pins to the NEAR edge for an element bigger than the page', () => {
    const b = codeOnly(fnBody('_dsPinChrome'));
    // Math.max has to be the outer call, or an element wider than the page
    // resolves to a negative position and the control leaves the other side.
    if (b.indexOf('Math.max(P, Math.min(') < 0) throw new Error('the clamp is not max-outside-min, so an oversized element pushes its chrome off the far edge');
  });

  const testBlock = [
    'window.__testResults = [];',
    'const __check = (label, fn) => {',
    '  try { fn(); window.__testResults.push({ label, ok: true }); }',
    '  catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }',
    '};',
    '',
    'scheduleAutosave = () => {}; pushHistory = () => {};',
    '_dsRenderCenter = () => {}; _dsRenderRail = () => {}; _dsSyncToolbar = () => {};',
    '',
    'const W = 936, H = 540;',
    'const DESC = { kind: "card", type: "frameRec", title: "Frame Recommendations" };',
    'let KEY = null;',
    'const place = (geo) => {',
    '  editorialContent = _editorialDefaults();',
    '  dashProjectData = []; elevations = []; floorplanLevels = [{ name: "Level 1", imageData: "" }];',
    '  KEY = _deckPageKey(DESC);',
    '  editorialContent.annotations = {};',
    '  editorialContent.annotations[KEY] = [Object.assign({ type: "shape", shape: "rect", fill: "#d8d8de" }, geo)];',
    '  _dsSelKey = KEY; _dsSelIdx = 0;',
    '  const page = document.createElement("div");',
    '  page.style.cssText = "position:relative; width:" + W + "px; height:" + H + "px; overflow:hidden;";',
    '  document.body.appendChild(page);',
    '  _dsRenderAnnots(page, DESC, W, H);',
    '  return page;',
    '};',
    '// Every control the report named, found by what it does rather than by class.',
    'const chromeOf = (page) => {',
    '  const box = Array.prototype.find.call(page.children, (n) => n.style && n.style.position === "absolute" && n.style.left);',
    '  if (!box) throw new Error("no annotation box was rendered");',
    '  const bx = parseFloat(box.style.left) || 0, by = parseFloat(box.style.top) || 0;',
    '  const out = [];',
    '  Array.prototype.forEach.call(box.children, (el) => {',
    '    if (!/px$/.test(el.style.left || "") || !/px$/.test(el.style.top || "")) return;',
    '    if (el.style.transform && el.style.transform !== "none") return;',
    '    const l = parseFloat(el.style.left), t = parseFloat(el.style.top);',
    '    if (isNaN(l) || isNaN(t)) return;',
    '    out.push({ el: el, x: bx + l, y: by + t, tag: el.tagName + ":" + (el.title || el.textContent || "").slice(0, 24) });',
    '  });',
    '  return { box: box, bx: bx, by: by, items: out };',
    '};',
    '',
    '// The three controls that all wanted the top-right corner.',
    'const cornerTrio = (c) => {',
    '  const yellow = c.items.find(it => (it.el.style.background || "").indexOf("245, 197, 24") >= 0 || (it.el.title || "").indexOf("corner radius") >= 0);',
    '  const gear = c.items.find(it => (it.el.title || "").toLowerCase().indexOf("setting") >= 0);',
    '  const bw = parseFloat(c.box.style.width);',
    '  const ne = c.items.filter(it => it.el !== (yellow && yellow.el) && it.el !== (gear && gear.el) && parseFloat(it.el.style.width) === 8)',
    '    .sort((p, q) => (Math.abs(parseFloat(p.el.style.left) - bw) + Math.abs(parseFloat(p.el.style.top))) - (Math.abs(parseFloat(q.el.style.left) - bw) + Math.abs(parseFloat(q.el.style.top))))[0];',
    '  return { ne: ne, yellow: yellow, gear: gear };',
    '};',
    '',
    '__check("EXACT ASK: resize, radius and settings ladder in from the corner, not stacked", () => {',
    '  // Flush to the top-right, which is where all three landed on top of each',
    '  // other once the clamp pulled them onto the page.',
    '  const page = place({ x: 0.5, y: 0, w: 0.5, h: 0.9, dataUrl: "data:image/png;base64,AAAA" });',
    '  const c = chromeOf(page);',
    '  const t = cornerTrio(c);',
    '  if (!t.ne) throw new Error("no resize handle at the corner");',
    '  if (!t.yellow) throw new Error("no corner-radius handle");',

    '  const dist = (it) => (W - it.x) + it.y;',
    '  if (!(dist(t.ne) < dist(t.yellow))) throw new Error("the radius handle is not inside the resize handle");',
    '  // The resize handle sits ON the trim, not inset from it.',
    '  if (t.ne.x + 11 < W - 0.01) throw new Error("the resize handle does not reach the page edge: " + (t.ne.x + 11));',
    '  if (t.ne.y > 0.01) throw new Error("the resize handle does not reach the page top: " + t.ne.y);',
    '  // The settings button is in the OTHER corner, well away from these two.',
    '  if (!t.gear) throw new Error("no settings button");',
    '  const bh = parseFloat(c.box.style.height);',
    '  if (t.gear.y < c.by + bh / 2) throw new Error("the settings button is in the top half, back among the others: y=" + t.gear.y);',
    '  if (t.gear.x > c.bx + parseFloat(c.box.style.width) / 2) throw new Error("the settings button is on the right, not the free corner: x=" + t.gear.x);',
    '  const rect = (it) => ({ l: it.x, t: it.y, r: it.x + (parseFloat(it.el.style.width) || 20) + 3, b: it.y + (parseFloat(it.el.style.height) || 20) + 3 });',
    '  const pairs = [[t.ne, t.yellow, "resize/radius"]];',
    '  pairs.forEach(p => {',
    '    const A2 = rect(p[0]), B2 = rect(p[1]);',
    '    if (A2.l < B2.r && B2.l < A2.r && A2.t < B2.b && B2.t < A2.b) throw new Error(p[2] + " still overlap");',
    '  });',
    '  page.remove();',
    '});',
    '',
    '__check("a box too small for the ladder drops the radius handle rather than stacking it", () => {',
    '  // Three 20px controls do not fit inside the corner of a 56x32 shape, and',
    '  // squeezing them reproduces the overlap this change exists to remove. The',
    '  // radius is still a number in the settings popup.',
    '  const page = place({ x: 0.3, y: 0.3, w: 0.06, h: 0.06 });',
    '  const c = chromeOf(page);',
    '  const t = cornerTrio(c);',
    '  if (t.yellow) throw new Error("the radius handle was squeezed in anyway");',
    '  if (!t.gear) throw new Error("the settings button went with it");',
    '  page.remove();',
    '});',
    '',
    'const gripOf = (c) => c.items.find(it => (it.el.title || "").indexOf("Drag to move") >= 0);',
    'const zoomOf = (c) => c.items.find(it => it.el.querySelector && it.el.querySelector("input"));',
    '',
    '__check("EXACT ASK: the zoom stepper sits directly under the grip, close but never touching", () => {',
    '  const page = place({ x: 0.2, y: 0.25, w: 0.3, h: 0.3, dataUrl: "data:image/png;base64,AAAA", zoom: 1.2 });',
    '  const c = chromeOf(page);',
    '  const g = gripOf(c), z = zoomOf(c);',
    '  if (!g) throw new Error("no move grip");',
    '  if (!z) throw new Error("no zoom stepper");',
    '  if (Math.abs(z.x - g.x) > 0.01) throw new Error("the stepper is not left-aligned with the grip: " + z.x + " vs " + g.x);',
    '  const gap = z.y - (g.y + DS_GRIP_SIZE);',
    '  if (gap <= 0) throw new Error("the stepper touches or overlaps the grip, gap " + gap);',
    '  if (gap > 8) throw new Error("the stepper drifted away from the grip, gap " + gap);',
    '  page.remove();',
    '});',
    '',
    '__check("the stepper follows the grip when the grip is CLAMPED to the page", () => {',
    '  // A gap measured from the box corner closes up exactly when the grip moves,',
    '  // which is every full-bleed element - the case this was reported on.',
    '  const page = place({ x: 0.5, y: 0, w: 0.5, h: 0.9, dataUrl: "data:image/png;base64,AAAA", zoom: 1.2 });',
    '  const c = chromeOf(page);',
    '  const g = gripOf(c), z = zoomOf(c);',
    '  if (!g || !z) throw new Error("grip or stepper missing");',
    '  if (g.y < 0) throw new Error("the grip was not clamped onto the page, so this proves nothing: " + g.y);',
    '  const gap = z.y - (g.y + DS_GRIP_SIZE);',
    '  if (gap <= 0 || gap > 8) throw new Error("the stepper lost the grip once it clamped, gap " + gap);',
    '  page.remove();',
    '});',
    '',
    '__check("EXACT ASK: the settings disc takes the free bottom-left corner", () => {',
    '  const page = place({ x: 0.2, y: 0.25, w: 0.3, h: 0.3, dataUrl: "data:image/png;base64,AAAA" });',
    '  const c = chromeOf(page);',
    '  const t = cornerTrio(c);',
    '  if (!t.gear) throw new Error("no settings button");',
    '  const bw = parseFloat(c.box.style.width), bh = parseFloat(c.box.style.height);',
    '  // Inside the box, in its bottom-left quarter.',
    '  if (t.gear.x < c.bx || t.gear.x > c.bx + bw / 2) throw new Error("not on the left: x=" + t.gear.x);',
    '  if (t.gear.y < c.by + bh / 2 || t.gear.y + 22 > c.by + bh + 1) throw new Error("not at the bottom, inside: y=" + t.gear.y);',
    '  // Clear of the sw resize handle, which is the one thing already in that corner.',
    '  const sw = c.items.filter(it => parseFloat(it.el.style.width) === 8)',
    '    .sort((p, q) => (Math.abs(p.x - c.bx) + Math.abs(q.y - (c.by + bh))) - (Math.abs(q.x - c.bx) + Math.abs(p.y - (c.by + bh))))[0];',
    '  const swEl = c.items.find(it => parseFloat(it.el.style.width) === 8 && it.el.style.cursor === "nesw-resize" && it.y > c.by + bh / 2);',
    '  if (!swEl) throw new Error("no sw resize handle to clear");',
    '  const g1 = { l: t.gear.x, t: t.gear.y, r: t.gear.x + 22, b: t.gear.y + 22 };',
    '  const s1 = { l: swEl.x, t: swEl.y, r: swEl.x + 11, b: swEl.y + 11 };',
    '  if (g1.l < s1.r && s1.l < g1.r && g1.t < s1.b && s1.t < g1.b) throw new Error("the settings disc covers the sw resize handle");',
    '  void sw;',
    '  page.remove();',
    '});',
    '',
    '__check("EXACT ASK: a squashed box pans at zoom 1.0", () => {',
    '  // The gate was zoom > 1, which describes the commonest way to get slack',
    '  // rather than the thing that matters. Cover-fit crops a squashed box at 1.0.',
    '  const page = place({ x: 0.1, y: 0.1, w: 0.5, h: 0.5, dataUrl: "data:image/png;base64,AAAA", zoom: 1, aspect: 1.33 });',
    '  const c = chromeOf(page);',
    '  if (c.box.style.cursor !== "grab") throw new Error("a cropped image still refuses to pan at 1.0: cursor " + c.box.style.cursor);',
    '  page.remove();',
    '  // A box at the image own aspect has nothing to pan into, so it does not offer to.',
    '  const exact = 0.5 * 936 / 1.33 / 540;',
    '  const page2 = place({ x: 0.1, y: 0.1, w: 0.5, h: exact, dataUrl: "data:image/png;base64,AAAA", zoom: 1, aspect: 1.33 });',
    '  const c2 = chromeOf(page2);',
    '  if (c2.box.style.cursor === "grab") throw new Error("it offers to pan an image with no slack");',
    '  page2.remove();',
    '});',
    '',
    '__check("EXACT ASK: zoom steps in tenths and can be typed", () => {',
    '  if (DS_ZOOM_STEP !== 0.1) throw new Error("the zoom step is " + DS_ZOOM_STEP);',
    '  let z = 1;',
    '  const box = document.createElement("div");',
    '  box.style.cssText = "position:absolute; left:100px; top:100px; width:200px; height:150px;";',
    '  box._page = { w: W, h: H };',
    '  _dsImgZoomPill(box, { get: () => z, set: (v) => { z = v; }, min: 1, max: 5, step: DS_ZOOM_STEP });',
    '  const pill = box.firstChild;',
    '  const btns = pill.querySelectorAll("button");',
    '  const field = pill.querySelector("input");',
    '  if (!field) throw new Error("the readout is not typeable");',
    '  btns[1].onclick({ preventDefault() {}, stopPropagation() {} });',
    '  if (z !== 1.1) throw new Error("the plus did not step a tenth, got " + z);',
    '  btns[0].onclick({ preventDefault() {}, stopPropagation() {} });',
    '  if (z !== 1) throw new Error("the minus did not come back cleanly, got " + z);',
    '  field.value = "2.35"; field.onblur();',
    '  if (z !== 2.35) throw new Error("a typed value was not taken, got " + z);',
    '  field.value = "99"; field.onblur();',
    '  if (z !== 5) throw new Error("a typed value was not clamped to max, got " + z);',
    '  field.value = "banana"; field.onblur();',
    '  if (z !== 5) throw new Error("nonsense changed the zoom, got " + z);',
    '});',
    '',
    '__check("EXACT ASK: dragging an edge snaps it to the page edge", () => {',
    '  // A MOVE has always snapped; a RESIZE had no snap at all, which is the',
    '  // gesture you use to take an image full bleed.',
    '  if (_dsAnnSnapEdge(0.995, "x", W, H, null) !== 1) throw new Error("an edge near the trim did not snap to it");',
    '  if (_dsAnnSnapEdge(0.004, "y", W, H, null) !== 0) throw new Error("an edge near the top did not snap to it");',
    '  if (_dsAnnSnapEdge(0.995, "x", W, H, { altKey: true }) !== 0.995) throw new Error("Alt no longer bypasses the snap");',
    '  // A snap NEVER moves an edge further than the threshold. Checking only that',
    '  // 0.6 does not land on 1 proves nothing: with a 12-column set almost every',
    '  // value is near SOME line, so a wide-open threshold passes that check.',
    '  const thrX = 7 / W + 1e-9, thrY = 7 / H + 1e-9;',
    '  for (let v = 0.02; v < 0.99; v += 0.017) {',
    '    if (Math.abs(_dsAnnSnapEdge(v, "x", W, H, null) - v) > thrX) throw new Error("an x edge at " + v.toFixed(3) + " was dragged further than the threshold");',
    '    if (Math.abs(_dsAnnSnapEdge(v, "y", W, H, null) - v) > thrY) throw new Error("a y edge at " + v.toFixed(3) + " was dragged further than the threshold");',
    '  }',
    '});',
    '',
    '__check("EXACT ASK: the RESIZE HANDLER snaps, not just the helper it calls", () => {',
    '  // Deleting the call from the handler left the helper perfect and the gesture',
    '  // broken, which the previous check could not see.',
    '  const page = place({ x: 0.5, y: 0.2, w: 0.4, h: 0.4, dataUrl: "data:image/png;base64,AAAA" });',
    '  const a = editorialContent.annotations[KEY][0];',
    '  const c = chromeOf(page);',
    '  const east = c.items.find(it => it.el.style.cursor === "ew-resize" && parseFloat(it.el.style.left) > parseFloat(c.box.style.width) / 2);',
    '  if (!east) throw new Error("no east resize handle");',
    '  east.el.onmousedown({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 });',
    '  // The right edge starts at 0.9; drag it to within a few px of the trim.',
    '  const ev = new window.MouseEvent("mousemove", { clientX: 0.093 * W, clientY: 0 });',
    '  document.dispatchEvent(ev);',
    '  document.dispatchEvent(new window.MouseEvent("mouseup"));',
    '  const right = (a.x || 0) + (a.w || 0);',
    '  if (Math.abs(right - 1) > 1e-6) throw new Error("the dragged edge did not land on the trim, it stopped at " + right.toFixed(4));',
    '  page.remove();',
    '});',
    '',
    '__check("EXACT BUG: a full-bleed image keeps every control on the page", () => {',
    '  // Runs off the right edge and above the top, which is the screenshot.',
    '  const page = place({ x: 0.5, y: -0.06, w: 0.62, h: 0.95, dataUrl: "data:image/png;base64,AAAA", zoom: 1 });',
    '  const c = chromeOf(page);',
    '  if (c.items.length < 10) throw new Error("expected the grip, gear, zoom pill and eight handles, found " + c.items.length);',
    '  c.items.forEach(it => {',
    '    if (it.x < 0 || it.x > W) throw new Error("off the page horizontally at x=" + it.x.toFixed(1) + ": " + it.tag);',
    '    if (it.y < 0 || it.y > H) throw new Error("off the page vertically at y=" + it.y.toFixed(1) + ": " + it.tag);',
    '  });',
    '  page.remove();',
    '});',
    '',
    '__check("the zoom stepper survives an image aligned to the very top", () => {',
    '  // Named in the report: "which gets lost is the - and + buttons for the zoom',
    '  // into the image if I align the image at the top." The pill sat ABOVE the box.',
    '  const page = place({ x: 0.1, y: 0, w: 0.4, h: 0.5, dataUrl: "data:image/png;base64,AAAA", zoom: 1 });',
    '  const c = chromeOf(page);',
    '  const pill = c.items.find(it => it.el.querySelector && it.el.querySelector("button"));',
    '  if (!pill) throw new Error("the zoom stepper is gone");',
    '  if (pill.y < 0) throw new Error("the zoom stepper is still above the page at y=" + pill.y.toFixed(1));',
    '  if (pill.el.querySelectorAll("button").length !== 2) throw new Error("the minus and plus are not both there");',
    '});',
    '',
    '__check("the settings gear survives an element flush to the right edge", () => {',
    '  const page = place({ x: 0.42, y: 0.2, w: 0.58, h: 0.4, dataUrl: "data:image/png;base64,AAAA" });',
    '  const c = chromeOf(page);',
    '  const gear = c.items.find(it => (it.el.title || "").toLowerCase().indexOf("setting") >= 0);',
    '  if (!gear) throw new Error("no settings control found");',
    '  if (gear.x < 0 || gear.x + 22 > W) throw new Error("the settings button left the page at x=" + gear.x.toFixed(1));',
    '  if (gear.y < 0 || gear.y + 22 > H) throw new Error("the settings button left the page at y=" + gear.y.toFixed(1));',
    '});',
    '',
    '__check("the + Add image affordance survives when the box centre is off the page", () => {',
    '  const page = place({ x: 0.8, y: 0.2, w: 0.9, h: 0.4 });',
    '  const c = chromeOf(page);',
    '  const add = c.items.find(it => (it.el.textContent || "").indexOf("Add image") >= 0);',
    '  if (!add) throw new Error("the + Add image button is gone");',
    '  if (add.x < 0 || add.x + 74 > W) throw new Error("it is off the page at x=" + add.x.toFixed(1));',
    '});',
    '',
    '__check("an element wholly on the page is NOT moved", () => {',
    '  // The clamp must be invisible in the normal case, or every existing layout',
    '  // shifts by a few pixels the first time it is opened.',
    '  const page = place({ x: 0.3, y: 0.3, w: 0.2, h: 0.2, dataUrl: "data:image/png;base64,AAAA" });',
    '  const c = chromeOf(page);',
    '  const grip = c.items.find(it => (it.el.title || "").toLowerCase().indexOf("drag") >= 0 || (it.el.style.cursor === "move" && it.el.tagName === "DIV"));',
    '  if (!grip) throw new Error("no move grip found: " + c.items.map(i2 => i2.tag).join(" | "));',
    '  if (Math.abs(parseFloat(grip.el.style.left) + 11) > 0.01) throw new Error("the grip moved on an element that fits: left " + grip.el.style.left);',
    '  if (Math.abs(parseFloat(grip.el.style.top) + 11) > 0.01) throw new Error("the grip moved on an element that fits: top " + grip.el.style.top);',
    '});',
    '',
    '__check("an element larger than the page keeps its chrome on the near edge", () => {',
    '  const page = place({ x: -0.2, y: -0.2, w: 1.5, h: 1.5, dataUrl: "data:image/png;base64,AAAA" });',
    '  const c = chromeOf(page);',
    '  c.items.forEach(it => {',
    '    if (it.x < 0 || it.x > W || it.y < 0 || it.y > H) throw new Error("chrome left the page entirely at " + it.x.toFixed(1) + "," + it.y.toFixed(1) + ": " + it.tag);',
    '  });',
    '});'
  ].join('\n');

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = nodeResults.concat(window.__testResults || []);
  const failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
