// THE DECK PREVIEW IS A PICTURE OF PAPER, NOT A PIECE OF THE UI.
//
// This file exists because a design audit of this codebase recommended migrating
// "the hardcoded colours in app.js" onto theme tokens, and that recommendation
// was wrong in a way that would have been expensive. Most of those colours are
// not chrome:
//   - 259 are serialized template/project DATA inside IDML_MASTER_TEMPLATES and
//     _starterDeck(), describing text and blocks on a printed page;
//   - the rest of the dangerous ones are PAPER colours in _deckMockHTML and
//     _mbThumbInner, which draw a preview of the printed sheet.
// Theming those would make a white page go dark in dark mode, and - far worse -
// would make Deck Studio show something the PDF does not print. That is the one
// failure this tool cannot afford, and the standing rule for this project.
//
// No regex: patterns written into a test file here have lost their backslashes.
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
const count = (h, n) => h.split(n).length - 1;

// Body of a top-level function, from its declaration to the next one.
const fnBody = (name) => {
  const at = APP.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const next = APP.indexOf(NL + 'function ', at + 1);
  return APP.slice(at, next < 0 ? APP.length : next);
};

check('the default shape fill has exactly ONE definition', () => {
  if (APP.indexOf('const SHAPE_DEFAULT_FILL') < 0) {
    throw new Error('SHAPE_DEFAULT_FILL is gone; the default fill was written out 9 times before it existed');
  }
  // Used by the starter deck, the shape creator, two colour-picker defaults, the
  // DOM preview, the rail thumbnail and the PDF renderer.
  const uses = count(APP, 'SHAPE_DEFAULT_FILL');
  if (uses < 9) throw new Error('only ' + uses + ' references; call sites have gone back to a literal');
  // Exactly ONE: the declaration itself. Any other is a call site that went
  // back to writing the value out, which is how it came to be in nine places.
  const quoted = count(APP, "'#d8d8de'");
  if (quoted !== 1) {
    throw new Error(quoted + " quoted #d8d8de in code; expected only the SHAPE_DEFAULT_FILL declaration");
  }
});

check('it is a LITERAL, never a theme token', () => {
  const at = APP.indexOf('const SHAPE_DEFAULT_FILL');
  const decl = APP.slice(at, APP.indexOf(';', at));
  if (decl.indexOf('var(--') >= 0) {
    throw new Error('SHAPE_DEFAULT_FILL is a var(): the PDF path feeds it to _annHexToRgb, where it parses to nothing and the block silently vanishes');
  }
  if (decl.indexOf('#') < 0) throw new Error('SHAPE_DEFAULT_FILL is not a hex colour: ' + decl);
});

check('the preview and the PDF read the SAME default', () => {
  // The two renderers that must never disagree: _deckMockHTML draws the DOM
  // preview, and the export path resolves the same fallback for the real page.
  const mock = fnBody('_deckMockHTML');
  if (!mock) throw new Error('_deckMockHTML not found');
  const pdfUse = APP.indexOf('_annHexToRgb(a.fill || SHAPE_DEFAULT_FILL');
  if (pdfUse < 0) {
    throw new Error('the PDF renderer no longer falls back to SHAPE_DEFAULT_FILL, so it can print a different grey from the preview');
  }
});

check('_deckMockHTML uses NO theme tokens', () => {
  // It is a picture of paper. A var() here means a white page follows the app's
  // light/dark theme and stops matching the PDF beside it.
  const mock = fnBody('_deckMockHTML');
  if (!mock) throw new Error('_deckMockHTML not found');
  if (mock.indexOf('var(--') >= 0) {
    throw new Error('_deckMockHTML now reads a theme token; the page preview would follow the UI theme instead of showing the printed sheet');
  }
});

check('_mbThumbInner uses no theme tokens either', () => {
  const t = fnBody('_mbThumbInner');
  if (!t) throw new Error('_mbThumbInner not found');
  if (t.indexOf('var(--') >= 0) {
    throw new Error('_mbThumbInner now reads a theme token; the rail thumbnail would stop matching the page it previews');
  }
});

check('template DATA keeps its own literal colours', () => {
  // 73 "fill":"#d8d8de" entries live inside the serialized templates. They
  // describe specific existing blocks on specific pages - project content, not a
  // default - and tokenising them would rewrite saved documents.
  if (count(APP, '"fill":"#d8d8de"') === 0) {
    throw new Error('the serialized template fills were rewritten; those are saved page content, not UI colour');
  }
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
