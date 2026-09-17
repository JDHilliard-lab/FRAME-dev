// "On my project tab the previews are not rendering the headers and subheaders
//  properly... for some reason it is delayed... it ended up updating to what it
//  is supposed to look like as I'm writing this. Is there a way to ensure it is
//  correct right off the start? I think that will be distracting designers
//  thinking something is broken."
//
// A canvas draws with whatever the face resolves to at that instant, so a page
// rendered before Druk and Messina land is set in the fallback stack. Two things
// compounded:
//
//  1. The six brand faces loaded STRICTLY SERIALLY - fetch, decode, load, next -
//     while every consumer waits on them behind _withTimeout(..., 2500) and then
//     renders with whatever it has. Six round trips end to end is how that
//     deadline gets missed on a cold load.
//  2. When the faces finally arrived, the loader woke the moodboard canvas and
//     (only if a layout page happened to be open) the deck centre. Nothing told
//     the Project tab's preview, so it sat in the wrong face until some unrelated
//     event redrew it. That wait is the "something is broken".
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
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

check('EXACT BUG: the brand faces load in parallel, not one after another', () => {
  const b = codeOnly(fnBody('_loadEditorBrandFontsInner'));
  if (b.indexOf('Promise.all') < 0) throw new Error('the faces are not loaded together');
  // The serial loop is the shape that misses the deadline: a for-of that awaits
  // the fetch AND the load inside the body, once per face.
  if (/for\s*\(const \w+ of defs\)/.test(b)) throw new Error('the serial for-of loop is back, so the wait is the sum of six fetches again');
  if (b.indexOf('defs.map') < 0) throw new Error('the faces are not mapped over, so Promise.all has nothing per-face to await');
});

check('one face failing does not take the other five with it', () => {
  const b = codeOnly(fnBody('_loadEditorBrandFontsInner'));
  // Promise.all rejects on the first rejection, so each face has to settle on
  // its own and be counted afterwards.
  const m = b.indexOf('defs.map(');
  if (m < 0) throw new Error('no per-face task to inspect');
  const task = b.slice(m, b.indexOf('}));', m));
  if (task.length < 40) throw new Error('the per-face task sliced empty');
  if (task.indexOf('catch') < 0) throw new Error('a throwing face is not caught inside its own task, so Promise.all rejects and takes the other five with it');
  if (task.indexOf('catch (e) { return false; }') < 0) throw new Error('the per-face catch does not resolve to a countable failure');
  if (b.indexOf('filter(Boolean)') < 0) throw new Error('the loaded faces are not counted after the fact');
});

check('EXACT BUG: the Project preview is told when the faces arrive', () => {
  const b = codeOnly(fnBody('_loadEditorBrandFontsInner'));
  if (b.indexOf('_dsRenderCoverPreview') < 0) throw new Error('nothing redraws the Project tab preview, so a page drawn in the fallback face stays that way');
  // Guarded on the holder, or the loader reaches into a tab that is not open.
  if (b.indexOf("getElementById('dsProjCoverPrev')") < 0) throw new Error('the redraw is not gated on the preview actually being on screen');
});

check('every canvas render waits on ONE bounded, memoized font gate', () => {
  const b = codeOnly(fnBody('_dsRenderCoverPreview'));
  if (b.indexOf('_dsBrandFontsReady') < 0) throw new Error('the Project preview does not use the shared wait');
  // It used to await the two halves itself with no ceiling - the only consumer
  // without one, so a fetch that never settles left it on the mock forever.
  if (b.indexOf('await document.fonts.ready') >= 0) throw new Error('an unbounded font wait is back in the preview');
  if (b.indexOf('await _loadEditorBrandFonts()') >= 0) throw new Error('the preview waits on the loader directly again, bypassing the shared gate');
  const g = codeOnly(fnBody('_dsBrandFontsReady'));
  if (g.indexOf('_withTimeout') < 0) throw new Error('the shared gate has no ceiling');
});

check('the name no longer claims the gate is only for template swatches', () => {
  // It serves the Project tab's page preview too now.
  if (src.indexOf('_dsTplSwatchFonts') >= 0) throw new Error('the old name survived the rename');
  if (src.indexOf('_dsTplFontsReady') >= 0) throw new Error('the old memo name survived the rename');
});

check('EXACT BUG: a brand face is named from its BYTES, not from a document registering it', () => {
  // display and sans share the core name 'helvetica', so the answer is ambiguous
  // the moment it falls back - and _registerPdfFonts is called from the PDF export
  // and nowhere else, so a session that never generated a PDF never saw Druk in a
  // preview. Deterministic, not a race.
  const b = codeOnly(fnBody('_font'));
  if (b.indexOf('_pdfFontFams') >= 0) throw new Error('_font is gated on per-document registration again, so a preview before any PDF draws Druk as Sans');
  if (b.indexOf('_pdfBrandFams') < 0) throw new Error('_font does not consult the session-level byte availability');
  const reg = codeOnly(fnBody('_registerPdfFonts'));
  if (reg.indexOf('_pdfBrandFams = {}') >= 0) throw new Error('registering a document clears the session answer, so a preview beside an export flips back to Sans');
  const data = codeOnly(fnBody('_loadPdfFontData'));
  if (data.indexOf('_pdfBrandFams') < 0) throw new Error('nothing marks a family available when its bytes arrive');
});

check('the two ambiguous tokens really are distinguished now', () => {
  // This is the whole bug in one line: display and sans have the SAME pdfCore, so
  // only the embed name tells them apart.
  const lib = src.slice(src.indexOf('const FRAME_FONT_LIBRARY'), src.indexOf('function _fontEntry'));
  if (lib.indexOf("token: 'display'") < 0 || lib.indexOf("token: 'sans'") < 0) throw new Error('could not read the two tokens');
  const line = (tok) => lib.split('\n').find(l => l.indexOf("token: '" + tok + "'") >= 0) || '';
  const core = (l) => (/pdfCore: '([a-z]+)'/.exec(l) || [])[1];
  if (core(line('display')) !== core(line('sans'))) throw new Error('the cores diverged, so this check no longer guards anything - revisit it');
  if (line('display').indexOf("pdfEmbed: 'Druk'") < 0) throw new Error('display has no embed name to be told apart by');
});

check('every canvas page renderer gates itself, not just its callers', () => {
  // renderSpecPageCanvas is reached from renderDeckPageCanvas AND directly from
  // the template-card pump. A caller that forgets draws the deck in Helvetica.
  ['renderDeckPageCanvas', 'renderSpecPageCanvas'].forEach(fn => {
    if (codeOnly(fnBody(fn)).indexOf('_dsBrandFontsReady') < 0) throw new Error(fn + ' does not wait for the brand fonts itself');
  });
});

check('the gate waits for the glyphs AND the names', () => {
  const g = codeOnly(fnBody('_dsBrandFontsReady'));
  if (g.indexOf('_loadEditorBrandFonts') < 0) throw new Error('the gate does not wait for the DOM faces, so the glyphs may be missing');
  if (g.indexOf('_loadPdfFontData') < 0) throw new Error('the gate does not wait for the PDF bytes, so _font cannot name Druk yet');
  if (g.indexOf('Promise.all') < 0) throw new Error('the two halves wait one after another, doubling the time to first paint');
  if (src.indexOf('try { _loadPdfFontData(); } catch (e) {}') < 0) throw new Error('the PDF bytes are not kicked off at boot, so the gate starts from cold');
});

check('the PDF byte load is parallel too, since the preview now waits on it', () => {
  const b = codeOnly(fnBody('_loadPdfFontData'));
  if (b.indexOf('Promise.all') < 0) throw new Error('the bytes load one file after another on the preview path');
  if (/for\s*\(const \w+ of files\)/.test(b)) throw new Error('the serial loop is back');
});

let failures = [];
results.forEach(r => {
  console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
  if (!r.ok) failures.push(r.label);
});
console.log('\n--- Summary ---');
if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
else console.log('ALL PASSED (' + results.length + ')');
