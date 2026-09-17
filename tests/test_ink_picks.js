// "when you click the color picker there is a flash of the grey color choices to
//  select from then it goes to opening the RGB color picker, but if I click and
//  hold down the color picker I see the grey and custom... Maybe move the grey
//  color selections to be in the pop up window below Title and above applies to
//  Whole deck Just this page buttons. Lets add red as one of the custom colors
//  along with the grey gradients since red is somtimes used for notes and line
//  weights."
//
// Two things, and the second is the real fix.
//
// (1) An <input type="color"> opens its system dialog as the default action of the
//     CLICK, not of the mousedown. _dsInkQuickPicks cancelled only the mousedown,
//     so the picks appeared while the button was held and the RGB dialog took the
//     screen the instant it came up. Custom... is the one click that IS meant to
//     open it and gets through on a flag.
//
// (2) Inside the heading popup the picks do not belong on the dot at all: that is
//     a popover over a panel that is already open. They lay INTO the panel, between
//     the row they change and the scope buttons that decide who the change reaches.
//
// Red joins the strip on its OWN family row, which is what exposed a latent bug:
// _frameSwatchesInto resolved its nearest-match per FAMILY, so with two families a
// near-black heading lit the black dot and the red one at once.
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
  // Slice between LANDMARKS, never a character distance: a fixed window reads as
  // the code having been deleted the moment the function grows past it.
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

  check('a type row can decline the popover, so a panel showing the strip is not doubled', () => {
    const b = fnBody('_dsTypeSection');
    if (b.indexOf('function _dsTypeSection(title, getStyle, apply, hint, opts)') < 0) throw new Error('_dsTypeSection takes no options, so every row is forced onto the popover');
    const c = codeOnly(b);
    if (c.indexOf('inkInline') < 0) throw new Error('there is no way to ask for the dot to be left alone');
    if (c.indexOf('if (!(opts && opts.inkInline)) _dsInkQuickPicks') < 0) throw new Error('the quick-pick wiring is not gated, so an inline panel also opens a popover over itself');
  });

  check('EXACT BUG (placement): the heading popup carries the inks between the row and the scope buttons', () => {
    const b = codeOnly(fnBody('_dsOpenTitleTypePopup'));
    const row = b.indexOf('_dsTypeSection(');
    const strip = b.indexOf('_dsInkStripInto(');
    const scope = b.indexOf("'APPLIES TO'");
    if (row < 0) throw new Error('the popup no longer builds a type row');
    if (strip < 0) throw new Error('the popup does not lay the inks into itself, so they are back on the dot and fight the system picker');
    if (scope < 0) throw new Error('the popup no longer builds the scope buttons');
    if (!(row < strip && strip < scope)) throw new Error('the inks are not between the row they change and the scope buttons that decide who they reach');
    if (b.indexOf('inkInline: true') < 0) throw new Error('the row still wires the popover onto its dot as well');
  });

  check('the inline strip and the popover are ONE renderer', () => {
    // Two renderers is how a colour picked from a panel and one picked from a
    // popover come out of different palettes at different sizes.
    const b = codeOnly(fnBody('_dsInkStripInto'));
    if (b.indexOf('_frameSwatchesInto') < 0) throw new Error('the inline strip draws its own dots');
    if (b.indexOf('FRAME_TEXT_INKS') < 0) throw new Error('the inline strip does not use the ink palette');
    if (b.indexOf('nearest: true') < 0) throw new Error('the inline strip does not ring the nearest dot, so a near colour reads as nothing selected');
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
    '_dsClearBuiltAll = () => {}; _dsRefresh = () => {};',
    'editorialContent = _editorialDefaults();',
    '',
    '// A wired colour input plus a LATE listener, which sees defaultPrevented',
    '// because the guard is an onclick PROPERTY handler and therefore runs first.',
    'const wire = () => {',
    '  const inp = document.createElement("input");',
    '  inp.type = "color"; inp.value = "#222222";',
    '  document.body.appendChild(inp);',
    '  const picked = []; const clicks = [];',
    '  _dsInkQuickPicks(inp, (hex) => picked.push(hex));',
    '  inp.addEventListener("click", (e) => clicks.push(e.defaultPrevented));',
    '  return { inp, picked, clicks };',
    '};',
    'const down = (el) => el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));',
    'const clik = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));',
    '',
    '__check("EXACT BUG: the click that follows the picks cannot open the system dialog behind them", () => {',
    '  const w = wire();',
    '  down(w.inp);',
    '  if (!document.getElementById("dsInkPopover")) throw new Error("mousedown no longer opens the picks at all");',
    '  clik(w.inp);',
    '  if (w.clicks.length !== 1) throw new Error("the click never reached the input: " + w.clicks.length);',
    '  if (w.clicks[0] !== true) throw new Error("the click was not cancelled, so the RGB dialog opens over the picks that just flashed up");',
    '  if (!document.getElementById("dsInkPopover")) throw new Error("the picks were torn down by the click that was meant to be swallowed");',
    '  _dsCloseInkPopover();',
    '});',
    '',
    '__check("Custom lets exactly ONE click through, then the guard re-arms", () => {',
    '  const w = wire();',
    '  down(w.inp);',
    '  const pop = document.getElementById("dsInkPopover");',
    '  const custom = pop.querySelector("button.btn-secondary");',
    '  if (!custom) throw new Error("there is no Custom button, so the full range is unreachable");',
    '  custom.onclick();',
    '  if (w.clicks.length !== 1) throw new Error("Custom did not raise a click on the input: " + w.clicks.length);',
    '  if (w.clicks[0] !== false) throw new Error("Custom was swallowed by the same guard, so the system picker can never be opened");',
    '  clik(w.inp);',
    '  if (w.clicks[1] !== true) throw new Error("the flag stayed raised, so the next ordinary click opens the dialog again");',
    '  _dsCloseInkPopover();',
    '});',
    '',
    '// ---- the heading popup ----',
    'const KEY = "card:frameRec";',
    'const openTitle = (which) => {',
    '  _dsCloseTitleTypePopup();',
    '  _dsTitleTypeScope = "deck";',
    '  _dsOpenTitleTypePopup({ left: 10, bottom: 40 }, KEY, which);',
    '  return document.getElementById("dsTitleTypePopup");',
    '};',
    'const textOf = (el) => (el.textContent || "").trim();',
    '',
    '__check("EXACT BUG: the greys sit IN the popup, under the row and above the scope buttons", () => {',
    '  const pop = openTitle("sub");',
    '  const all = Array.prototype.slice.call(pop.querySelectorAll("*"));',
    '  const iRow = all.findIndex(e => e.tagName === "SELECT");',
    '  // Found by the DOTS, not by the label text: the label is wording and the',
    '  // swatches are the thing that had to move into the panel.',
    '  const iInk = all.findIndex(e => e.tagName === "BUTTON" && (e.title || "").indexOf("#") > 0);',
    '  const iScope = all.findIndex(e => textOf(e) === "APPLIES TO");',
    '  if (iRow < 0) throw new Error("the type row is gone");',
    '  if (iInk < 0) throw new Error("the popup shows no colour strip, so the picks are still behind the dot");',
    '  if (iScope < 0) throw new Error("the scope buttons are gone");',
    '  if (!(iRow < iInk && iInk < iScope)) throw new Error("wrong order: row " + iRow + ", inks " + iInk + ", scope " + iScope);',
    '  _dsCloseTitleTypePopup();',
    '});',
    '',
    '__check("the dot in that popup is NOT also wired to a popover", () => {',
    '  const pop = openTitle("title");',
    '  const cin = pop.querySelector("input[type=color]");',
    '  if (!cin) throw new Error("the row lost its colour input, which every existing handler addresses by value");',
    '  if (cin.dataset.inkQuick) throw new Error("the dot still opens a popover over the panel that is already showing the same ten dots");',
    '  down(cin);',
    '  if (document.getElementById("dsInkPopover")) throw new Error("a popover opened over the heading popup");',
    '  _dsCloseInkPopover(); _dsCloseTitleTypePopup();',
    '});',
    '',
    '__check("picking from the inline strip sets the colour, at the chosen scope", () => {',
    '  const pop = openTitle("title");',
    '  const dots = Array.prototype.slice.call(pop.querySelectorAll("button"));',
    '  const red = dots.find(b => (b.title || "").toLowerCase().indexOf("#e00000") >= 0);',
    '  if (!red) throw new Error("no red dot in the heading popup strip");',
    '  red.onclick();',
    '  if ((_titleStyle().color || "").toLowerCase() !== "#e00000") throw new Error("deck scope did not take the colour: " + _titleStyle().color);',
    '  if (editorialContent.pageTitleStyle && editorialContent.pageTitleStyle[KEY]) throw new Error("the deck-wide pick wrote a per-page override as well");',
    '  _dsCloseTitleTypePopup();',
    '});',
    '',
    '// ---- the palette ----',
    '__check("red is on the strip, and it is the red the rest of the app already offers", () => {',
    '  const all = [];',
    '  FRAME_TEXT_INKS.forEach(f => f.colors.forEach(c => all.push(c.toLowerCase())));',
    '  if (all.indexOf("#e00000") < 0) throw new Error("no red ink: a note or a called-out line weight has to be reached through the system picker");',
    '  const acc = [];',
    '  FRAME_SWATCH_FAMILIES.forEach(f => f.colors.forEach(c => acc.push(c.toLowerCase())));',
    '  if (acc.indexOf("#e00000") < 0) throw new Error("the ink red is not one of the shared swatch colours, so a red heading and a red annotation are two different reds");',
    '  if (all.indexOf("#ffffff") < 0 || all.indexOf("#000000") < 0) throw new Error("the grey ramp lost an end");',
    '  FRAME_TEXT_INKS[0].colors.forEach(h => {',
    '    const m = h.slice(1);',
    '    if (!(m.slice(0,2) === m.slice(2,4) && m.slice(2,4) === m.slice(4,6))) throw new Error("the ramp row is no longer greys only: " + h);',
    '  });',
    '});',
    '',
    '// jsdom DROPS a var() set through a SHORTHAND, so .style.borderColor reads "" on',
    '// a lit dot and an unlit one alike. Read the written attribute instead.',
    'const litCount = (host) => Array.prototype.slice.call(host.querySelectorAll("button"))',
    '  .filter(b => (b.getAttribute("style") || "").indexOf("var(--ui-active)") >= 0).length;',
    '',
    '__check("EXACT BUG: a near colour rings exactly ONE dot across the whole strip", () => {',
    '  // Resolved per FAMILY it picks a winner per row, so the moment red got its',
    '  // own row a #1a1a1a heading lit the black dot AND the red one.',
    '  const host = document.createElement("div");',
    '  _frameSwatchesInto(host, "#1a1a1a", () => {}, { families: FRAME_TEXT_INKS, size: 15, nearest: true });',
    '  const n = litCount(host);',
    '  if (n !== 1) throw new Error(n + " dots are lit for one colour, so the strip claims more than one is selected");',
    '  const lit = Array.prototype.slice.call(host.querySelectorAll("button")).find(b => (b.getAttribute("style") || "").indexOf("var(--ui-active)") >= 0);',
    '  if ((lit.title || "").toLowerCase().indexOf("#141414") < 0) throw new Error("the nearest dot to #1a1a1a is not #141414: " + lit.title);',
    '});',
    '',
    '__check("an exact colour rings exactly one dot, and never a second by nearness", () => {',
    '  const host = document.createElement("div");',
    '  _frameSwatchesInto(host, "#e00000", () => {}, { families: FRAME_TEXT_INKS, size: 15, nearest: true });',
    '  if (litCount(host) !== 1) throw new Error(litCount(host) + " dots lit for an exact match");',
    '  const host2 = document.createElement("div");',
    '  _frameSwatchesInto(host2, "#6e6e6e", () => {}, { families: FRAME_TEXT_INKS, size: 15, nearest: true });',
    '  if (litCount(host2) !== 1) throw new Error(litCount(host2) + " dots lit for an exact grey");',
    '});',
    '',
    '__check("every ink family draws its own row, so red is reachable and not stranded", () => {',
    '  const host = document.createElement("div");',
    '  _frameSwatchesInto(host, "#222222", () => {}, { families: FRAME_TEXT_INKS, size: 15, nearest: true });',
    '  const dots = host.querySelectorAll("button").length;',
    '  let want = 0; FRAME_TEXT_INKS.forEach(f => { want += f.colors.length; });',
    '  if (dots !== want) throw new Error("drew " + dots + " dots for " + want + " colours");',
    '  if (host.children.length !== FRAME_TEXT_INKS.length) throw new Error("the families did not each get a row");',
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
