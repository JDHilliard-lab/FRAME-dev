// "can we make the pop up box more square, and keep everything tight a organizded,
//  no unessary big buttons like the Pill button.
//
//  another thing to add is people will not always flip on the caption button to show
//  the image code, but it woul be great if when you hit the edit button of the image
//  box the image code would be displayed and designers can hit a copy code botton so
//  they can paste that code into a search bar somewhere else if they want to search
//  for the image in Dropbox or where it is on there computer."
//
// Two things.
//
// (1) THE CODE IS SHOWN WHETHER OR NOT THE CAPTION PRINTS IT. It used to be reachable
//     only by turning the caption ON and switching its source to Code - a decision
//     about the DECK - when wanting the code is usually a decision about somewhere
//     else entirely. One definition, _dsImageCode, shared with the caption, or the
//     panel and the page disagree about what the code is.
//
// (2) THE POPUP IS A TABLE, NOT A STACK OF HEADED SECTIONS. Ten sections each spending
//     a line on their own name ran it the full height of the screen. And .action-btn
//     is width:100%, so any button that wrapped - Pill - painted a full-width slab for
//     a one-word option.
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
    if (i < 0) throw new Error('no such function: ' + name);
    let j = src.length;
    ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '].forEach(c => {
      const k = src.indexOf(c, i + 1); if (k >= 0 && k < j) j = k;
    });
    if (j - i < 40) throw new Error('empty slice for ' + name);
    return src.slice(i, j);
  };
  const codeOnly = (s) => s.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');

  check('the popup and the page read the SAME definition of the code', () => {
    // Two definitions is how a panel comes to show one string while the page prints
    // another, which is worse than not showing it at all.
    const cap = codeOnly(fnBody('_dsResolveCaptionText'));
    if (cap.indexOf('_dsImageCode(') < 0) throw new Error('the caption strips the extension itself again');
    const pop = codeOnly(fnBody('_dsOpenGearPopup'));
    if (pop.indexOf('_dsImageCode(') < 0) throw new Error('the popup resolves the code its own way');
    // And neither consumer strips the extension itself. Scoped to these two: the
    // Bulk Images flow strips one too, for matching a file to a piece, and that is a
    // different feature that happens to share a line of string work.
    const strip = "replace(/\\.[^.]+$/,";
    [['_dsResolveCaptionText', cap], ['_dsOpenGearPopup', pop]].forEach(([n, b]) => {
      if (b.indexOf(strip) >= 0) throw new Error(n + ' strips the extension itself, so it can drift from _dsImageCode');
    });
    if (codeOnly(fnBody('_dsImageCode')).indexOf(strip) < 0) throw new Error('_dsImageCode does not strip the extension');
  });

  check('no control in the popup is left to stretch to the full width by accident', () => {
    // .action-btn is width:100%. A button with neither a width nor a flex is a
    // full-width slab the moment it wraps, which is what Pill was.
    const b = codeOnly(fnBody('_dsOpenGearPopup'));
    const at = b.indexOf('pillB.style.cssText');
    if (at < 0) throw new Error('the Pill control is gone');
    const decl = b.slice(at, b.indexOf('\n', at));
    if (decl.indexOf('width:') < 0) throw new Error('Pill has no width, so it paints a full-width slab when it wraps');
    if (decl.indexOf('flex:0 0 auto') < 0) throw new Error('Pill can still grow to fill its row');
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
    'editorialContent = _editorialDefaults();',
    '',
    'const KEY = "layout:pgGC";',
    'const openFor = (over) => {',
    '  _dsCloseGearPopup();',
    '  editorialContent.annotations = {};',
    '  const a = Object.assign({ type: "shape", shape: "rect", x: 0.2, y: 0.3, w: 0.3, h: 0.3,',
    '    dataUrl: "data:image/png;base64,AAAA", fileName: "FFI.FAR-2000-213654-142-51.jpg" }, over || {});',
    '  _dsAnnList(KEY).push(a);',
    '  _dsSelKey = KEY; _dsSelIdx = 0;',
    '  _dsOpenGearPopup(KEY, 0, 60, 60);',
    '  return { a: a, pop: document.getElementById("dsGearPopup") };',
    '};',
    'const codeField = (pop) => Array.prototype.slice.call(pop.querySelectorAll("input"))',
    '  .find(el => el.readOnly && (el.value || "").indexOf("FFI.FAR") === 0);',
    'const btn = (pop, text) => Array.prototype.slice.call(pop.querySelectorAll("button"))',
    '  .find(b => (b.textContent || "").trim() === text);',
    '// By a stable hook, not by its label: it carries the universal copy GLYPH now, so',
    '// there is no text to match on.',
    'const copyBtn = (pop) => pop.querySelector("button[data-act=\'copy-code\']");',
    '',
    '__check("EXACT ASK: the code is shown with the caption OFF", () => {',
    '  const { pop } = openFor({ showCaption: false });',
    '  const f = codeField(pop);',
    '  if (!f) throw new Error("no code field: the code is still only reachable by turning the caption on");',
    '  if (f.value !== "FFI.FAR-2000-213654-142-51") throw new Error("wrong code shown: " + f.value);',
    '  if (!f.readOnly) throw new Error("the code is editable, so it can drift from the file it names");',
    '  if (!copyBtn(pop)) throw new Error("there is no Copy control");',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("EXACT ASK: Copy puts the code on the clipboard", () => {',
    '  const { pop } = openFor({ showCaption: false });',
    '  let wrote = null;',
    '  navigator.clipboard = { writeText: (t) => { wrote = t; return Promise.resolve(); } };',
    '  copyBtn(pop).onclick();',
    '  if (wrote !== "FFI.FAR-2000-213654-142-51") throw new Error("Copy did not write the code: " + wrote);',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("Copy still works with no clipboard API, which is every file:// session", () => {',
    '  const { pop } = openFor({ showCaption: false });',
    '  try { delete navigator.clipboard; } catch (e) {}',
    '  navigator.clipboard = undefined;',
    '  let copied = false;',
    '  const orig = document.execCommand;',
    '  document.execCommand = (cmd) => { if (cmd === "copy") copied = true; return true; };',
    '  const f = codeField(pop);',
    '  copyBtn(pop).onclick();',
    '  document.execCommand = orig;',
    '  if (!copied) throw new Error("the fallback never asked the document to copy, so the button is dead off https");',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("EXACT ASK: the copy control is the universal glyph, left of the code", () => {',
    '  const { pop } = openFor({ showCaption: false });',
    '  const cp = copyBtn(pop), f = codeField(pop);',
    '  if (!cp) throw new Error("no copy control");',
    '  if ((cp.textContent || "").trim()) throw new Error("the copy control is still a word, not an icon: " + cp.textContent);',
    '  if (!cp.querySelector("svg")) throw new Error("the copy control carries no icon at all");',
    '  // The SHARED glyph. A second hand-drawn copy of the same icon is how two of',
    '  // them end up subtly different.',
    '  const want = (svgDup.match(/d="[^"]+"/) || [])[0];',
    '  if (!want) throw new Error("could not read the shared copy glyph");',
    '  if (cp.innerHTML.indexOf(want) < 0) throw new Error("the copy control draws its own glyph instead of svgDup");',
    '  // Left of the field, in DOM order.',
    '  if (!(cp.compareDocumentPosition(f) & 4)) throw new Error("the copy control is not before the code");',
    '  if (!(cp.title || "").length) throw new Error("an icon-only control with no tooltip says nothing about what it does");',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("the code field shrinks rather than pushing the copy control onto its own line", () => {',
    '  // In a wrapping flex row an item is wrapped on its HYPOTHETICAL size before it',
    '  // is ever shrunk, and an <input> reports a content width of ~180px whatever',
    '  // min-width says - which is what dropped the button onto a second line.',
    '  const { pop } = openFor({ showCaption: false });',
    '  const st = (codeField(pop).getAttribute("style") || "").split(" ").join("");',
    '  if (st.indexOf("flex:11auto") >= 0) throw new Error("the code field still sizes to its content, so its row wraps");',
    '  if (st.indexOf("flex:11") < 0) throw new Error("the code field no longer grows to fill the row");',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("an image with no name on record says so instead of showing an empty field", () => {',
    '  const { pop } = openFor({ fileName: "", showCaption: false });',
    '  if (codeField(pop)) throw new Error("an empty code field is offered");',
    '  if ((pop.textContent || "").indexOf("No file name on record") < 0) throw new Error("nothing explains why there is no code");',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("a box with no image at all gets no Code row", () => {',
    '  const { pop } = openFor({ dataUrl: "", fileName: "" });',
    '  if ((pop.textContent || "").indexOf("No file name on record") >= 0) throw new Error("an empty box is asked about its image code");',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("EXACT ASK: the popup is roughly square, not a full-height column", () => {',
    '  // Every section used to spend a line on its own name. jsdom lays nothing out, so',
    '  // this counts the ROWS the popup builds: a label column means one row per section',
    '  // rather than two.',
    '  const { pop } = openFor({ showCaption: true });',
    '  const w = parseFloat(pop.style.width);',
    '  if (!(w >= 300)) throw new Error("the popup is still narrow (" + w + "px), so its sections have to stack");',
    '  const rows = Array.prototype.slice.call(pop.children).filter(el => el.tagName === "DIV");',
    '  if (rows.length > 16) throw new Error(rows.length + " rows: the sections are stacked again");',
    '  // A section is [label, controls]. jsdom lays nothing out, so the thing that makes',
    '  // it ONE line - the wrapper being a flex row rather than a block - is asserted',
    '  // directly. Read off the written attribute, because jsdom drops a shorthand.',
    '  const secs = rows.filter(el => el.children.length === 2',
    '    && el.children[0].children.length === 0 && (el.children[0].textContent || "").trim().length',
    '    && el.children[1].tagName === "DIV");',
    '  if (secs.length < 6) throw new Error("only " + secs.length + " label-column sections; the popup is a stack again");',
    '  secs.forEach(el => {',
    '    const st = (el.getAttribute("style") || "").split(" ").join("");',
    '    if (st.indexOf("display:flex") < 0) throw new Error("a section stacks its label above its controls again: " + (el.children[0].textContent || ""));',
    '  });',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("every section still has its name, in the column", () => {',
    '  const { pop } = openFor({ showCaption: true });',
    '  const t = (pop.textContent || "");',
    '  ["Image", "Code", "Image fit", "Effects", "Fill", "Stroke", "Weight", "Radius", "Caption", "Source", "Font"].forEach(n => {',
    '    if (t.indexOf(n) < 0) throw new Error("the " + n + " section lost its label");',
    '  });',
    '  _dsCloseGearPopup();',
    '});',
    '',
    '__check("the code the popup shows is the code the caption would print", () => {',
    '  const { a, pop } = openFor({ showCaption: true, capSource: "filename" });',
    '  const shown = codeField(pop).value;',
    '  if (shown !== _dsResolveCaptionText(a)) throw new Error("panel says " + shown + ", page prints " + _dsResolveCaptionText(a));',
    '  _dsCloseGearPopup();',
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
