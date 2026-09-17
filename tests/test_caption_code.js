// "just noticed that my image place holder settings is unable to switch over to
//  image code for the caption"
//
// PUTTING AN IMAGE INTO A SHAPE WAS WRITTEN TWICE AND HAD DRIFTED. The Replace... /
// Add image... button in the gear popup goes through _dsHandleImageFile; dropping a
// file straight onto the box goes through _dsReadImageToShape. Only the SECOND
// recorded `fileName`, and that field is the only thing the caption's "Code" source
// can read - so an image added the way the popup offers could never use it, and the
// Code button sat disabled directly underneath the button that had just failed to
// enable it.
//
// Same shape of bug as _rowOpeningAndPrint (one definition copy-pasted into five
// displays of itself) and _mergeFlatSteps (a rule wired into one of two builders).
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
  // Between LANDMARKS, never a character distance.
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

  check('EXACT BUG: BOTH ways of filling a shape go through one setter', () => {
    ['_dsHandleImageFile', '_dsReadImageToShape'].forEach(fn => {
      const b = codeOnly(fnBody(fn));
      if (b.indexOf('_dsSetShapeImage(') < 0) throw new Error(fn + ' fills a shape by hand again, so the two paths can disagree about what filling one means');
    });
    // And nothing writes the image straight onto the annotation any more. One
    // assignment, inside the setter.
    const writes = codeOnly(src).split('.dataUrl = durl').length - 1;
    if (writes !== 1) throw new Error(writes + ' places assign an image to a shape; there should be exactly one (the setter)');
    if (codeOnly(fnBody('_dsSetShapeImage')).indexOf('a.dataUrl = durl') < 0) throw new Error('the one assignment is not the setter');
  });

  check('the setter ALWAYS writes the file name, never only when it has one', () => {
    // A replacement has to take the new file's name, or the caption goes on
    // quoting a picture that is no longer in the box.
    const b = codeOnly(fnBody('_dsSetShapeImage'));
    if (b.indexOf('a.fileName =') < 0) throw new Error('the setter does not record the file name, which is the only thing Code can read');
    const line = b.split('\n').find(l => l.indexOf('a.fileName =') >= 0) || '';
    if (line.indexOf('if ') >= 0) throw new Error('the file name is written conditionally, so a replacement can leave the old one behind: ' + line.trim());
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
    'const KEY = "card:frameRec";',
    '// A shape with an image in it, the way the screenshot shows one.',
    'const shape = (fileName) => {',
    '  editorialContent.annotations = {};',
    '  const list = _dsAnnList(KEY);',
    '  const a = { type: "shape", shape: "rect", x: 0.2, y: 0.3, w: 0.3, h: 0.3, showCaption: true, caption: "Fine Art Commission" };',
    '  if (fileName !== undefined) a.fileName = fileName;',
    '  a.dataUrl = "data:image/png;base64,AAAA";',
    '  list.push(a);',
    '  return a;',
    '};',
    'const IM = { naturalWidth: 1600, naturalHeight: 900 };',
    '',
    '__check("EXACT BUG: an image added through the popup button records its name", () => {',
    '  // This is the assignment the popup path was missing. Driving the whole',
    '  // FileReader/Image chain is not possible here (jsdom decodes no images), so',
    '  // the shared setter both paths now call is driven directly.',
    '  const a = shape(undefined);',
    '  _dsSetShapeImage(a, "data:image/png;base64,BBBB", IM, { name: "ART-1_surfcar.jpg" });',
    '  if (a.fileName !== "ART-1_surfcar.jpg") throw new Error("no file name on record, so Caption source Code stays disabled: " + a.fileName);',
    '  if (a.dataUrl !== "data:image/png;base64,BBBB") throw new Error("the image did not land");',
    '  if (Math.abs(a.aspect - 1600 / 900) > 1e-9) throw new Error("the aspect is wrong: " + a.aspect);',
    '  if (a.zoom !== 1 || a.panX !== 0 || a.panY !== 0) throw new Error("a fresh image kept the previous crop");',
    '});',
    '',
    '__check("replacing an image takes the NEW name, and a nameless one clears it", () => {',
    '  const a = shape("OLD-9.jpg");',
    '  _dsSetShapeImage(a, "data:image/png;base64,CCCC", IM, { name: "NEW-2.png" });',
    '  if (a.fileName !== "NEW-2.png") throw new Error("the caption still quotes the picture that was replaced: " + a.fileName);',
    '  _dsSetShapeImage(a, "data:image/png;base64,DDDD", IM, null);',
    '  if (a.fileName) throw new Error("a nameless image left the old name behind: " + a.fileName);',
    '});',
    '',
    '__check("EXACT BUG (visible): Code is offered once the box knows its file name", () => {',
    '  const a = shape("ART-1_surfcar.jpg");',
    '  _dsSelKey = KEY; _dsSelIdx = 0;',
    '  _dsOpenGearPopup(KEY, 0, 100, 100);',
    '  const pop = document.getElementById("dsGearPopup");',
    '  if (!pop) throw new Error("the gear popup did not open");',
    '  const code = Array.prototype.slice.call(pop.querySelectorAll("button")).find(b => (b.textContent || "").trim() === "Code");',
    '  if (!code) throw new Error("there is no Code option in Caption source");',
    '  if (code.disabled) throw new Error("Code is disabled on a box that HAS a file name - this is the reported bug");',
    '  pop.remove();',
    '});',
    '',
    '__check("Code stays disabled, and says why, when there is no name to read", () => {',
    '  const a = shape(undefined);',
    '  _dsSelKey = KEY; _dsSelIdx = 0;',
    '  _dsOpenGearPopup(KEY, 0, 100, 100);',
    '  const pop = document.getElementById("dsGearPopup");',
    '  const code = Array.prototype.slice.call(pop.querySelectorAll("button")).find(b => (b.textContent || "").trim() === "Code");',
    '  if (!code.disabled) throw new Error("Code is offered with nothing to read, so picking it blanks the caption");',
    '  if (!(code.title || "").length) throw new Error("a disabled control with no explanation reads as a broken one");',
    '  pop.remove();',
    '});',
    '',
    '__check("picking Code switches the source and the caption reads the file name", () => {',
    '  const a = shape("ART-1_surfcar.jpg");',
    '  _dsSelKey = KEY; _dsSelIdx = 0;',
    '  _dsOpenGearPopup(KEY, 0, 100, 100);',
    '  let pop = document.getElementById("dsGearPopup");',
    '  const code = Array.prototype.slice.call(pop.querySelectorAll("button")).find(b => (b.textContent || "").trim() === "Code");',
    '  code.onclick();',
    '  if (a.capSource !== "filename") throw new Error("the click did not change the source: " + a.capSource);',
    '  if (_dsResolveCaptionText(a) !== "ART-1_surfcar") throw new Error("the caption does not read the code: " + _dsResolveCaptionText(a));',
    '  const p2 = document.getElementById("dsGearPopup"); if (p2) p2.remove();',
    '});',
    '',
    '__check("only the LAST extension is stripped, and a typed caption still wins on text", () => {',
    '  const a = shape("ART-1.v2.final.jpg");',
    '  a.capSource = "filename";',
    '  if (_dsResolveCaptionText(a) !== "ART-1.v2.final") throw new Error("more than the extension was stripped: " + _dsResolveCaptionText(a));',
    '  a.capSource = "text";',
    '  if (_dsResolveCaptionText(a) !== "Fine Art Commission") throw new Error("Custom text stopped reading the typed caption");',
    '});',
    '',
    '__check("a box on Code but with no name falls back rather than printing blank", () => {',
    '  // Older projects have images that predate the field entirely.',
    '  const a = shape(undefined);',
    '  a.capSource = "filename";',
    '  if (_dsResolveCaptionText(a) !== "Fine Art Commission") throw new Error("the caption went blank: " + _dsResolveCaptionText(a));',
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
