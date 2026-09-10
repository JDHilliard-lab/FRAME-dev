// The blues, the amber, and the rule that keeps them from splitting again.
//
// There were four blues doing three jobs. --accent (#3a86ff) was a real token;
// #6a6aff and #2196f3 were hand-written; #3b82f6 existed only as the fallback in
// var(--accent, #3b82f6) and did not equal --accent. Worse, the two hand-written
// ones overlapped: a frame selected on the wall outlined #2196f3 while a context
// block or a glazing run on the SAME drawing outlined #6a6aff.
//
// Plain Node, no jsdom: these are questions about the source. And no regex with
// a var() in it - the parentheses read as a capture group and match nothing,
// which is how two checks in test_v32 silently passed while asserting nothing.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const HTM = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
const count = (hay, needle) => hay.split(needle).length - 1;
// Declarations only. A token's own explanatory comment may legitimately name the
// raw value it replaced, and that is not a call site.
const stripComments = s => s.split('/*').map((part, i) => i === 0 ? part : part.split('*/').slice(1).join('*/')).join('');
const CSSD = stripComments(CSS);

check('every new token is declared, and as a LITERAL', () => {
  const want = {
    '--ui-active': '#6a6aff',
    '--selected': '#2196f3',
    '--warn': '#c98a2e',
  };
  Object.keys(want).forEach(k => {
    const at = CSSD.indexOf(k + ':');
    if (at < 0) throw new Error('missing token ' + k);
    const val = CSSD.slice(at + k.length + 1, CSSD.indexOf(';', at)).trim();
    if (val !== want[k]) throw new Error(k + ' should be the literal ' + want[k] + ', found ' + val);
  });
});

check('no token is defined in terms of itself', () => {
  // Insert the declaration AFTER replacing the raw value, never before, or a
  // blanket replace rewrites the definition into --x: var(--x). That resolves to
  // nothing and takes the colour out of the UI with no error anywhere.
  const bad = [];
  CSSD.split('\n').forEach(line => {
    const i = line.indexOf('--');
    if (i < 0 || line.indexOf(':') < 0) return;
    const name = line.slice(i, line.indexOf(':', i)).trim();
    if (!name.startsWith('--')) return;
    const val = line.slice(line.indexOf(':', i) + 1);
    if (val.indexOf('var(' + name + ')') >= 0) bad.push(name);
  });
  if (bad.length) throw new Error('self-referential: ' + bad.join(', '));
});

check('the accent fallback equals the accent', () => {
  // A fallback that differs from the thing it falls back to is a second colour
  // waiting for the token to go missing.
  if (count(CSS, 'var(--accent, #3b82f6)') > 0) throw new Error('var(--accent, #3b82f6) is back; --accent is #3a86ff');
  const at = CSSD.indexOf('--accent:');
  const accent = CSSD.slice(at + 9, CSSD.indexOf(';', at)).trim();
  let i = 0, bad = [];
  while ((i = CSSD.indexOf('var(--accent, ', i)) >= 0) {
    const fb = CSSD.slice(i + 14, CSSD.indexOf(')', i)).trim();
    if (fb !== accent) bad.push(fb);
    i += 14;
  }
  if (bad.length) throw new Error('fallbacks disagreeing with --accent (' + accent + '): ' + bad.join(', '));
});

check('the raw blues survive ONLY as their own token declaration', () => {
  // --ui-active: #6a6aff and --selected: #2196f3 are the one place each hex
  // belongs. Anywhere else is a call site that stopped following the token.
  const declLine = (src, name) => {
    const at = src.indexOf(name + ':');
    return at < 0 ? '' : src.slice(at, src.indexOf(';', at) + 1);
  };
  const cssBody = CSSD
    .split(declLine(CSSD, '--ui-active')).join('')
    .split(declLine(CSSD, '--selected')).join('');
  ['#6a6aff', '#2196f3'].forEach(hex => {
    if (count(cssBody, hex) > 0) throw new Error(hex + ' used in style.css outside its token declaration');
    if (count(HTM, hex) > 0) throw new Error(hex + ' still in index.html');
  });
});
check('#2196f3 is gone from app.js entirely', () => {
  if (count(APP, '#2196f3') > 0) throw new Error('#2196f3 reintroduced in app.js');
});

check('no raw #6a6aff anywhere in app.js', () => {
  // This started life as "…except in SVG presentation attributes, where var()
  // is invalid". That premise was wrong: stroke="var(--dim-color)" already
  // ships in five places here, so a presentation attribute resolves var() fine
  // on screen. The real hazard is narrower and lives elsewhere - markup
  // SERIALIZED into an exported file has no :root to resolve against, which is
  // why the context art substitutes a real colour on the way out. None of these
  // handles are serialized (Deck Studio draws its PDF with a separate
  // renderer), so there is no exception left to carve out.
  if (count(APP, '#6a6aff') > 0) throw new Error('raw #6a6aff is back in app.js; use var(--ui-active)');
});

check('the amber is one value, and STATUS_DEFS stays a hex literal', () => {
  if (count(APP, '#c08a2e') > 0) throw new Error('#c08a2e is back; the amber drifted again');
  // STATUS_DEFS feeds _annHexToRgb -> doc.setFillColor for the PDF status
  // legend. A var() there parses to nothing and silently drops the swatch.
  const at = APP.indexOf('const STATUS_DEFS');
  if (at < 0) throw new Error('STATUS_DEFS not found');
  const decl = APP.slice(at, APP.indexOf('\n', at));
  if (decl.indexOf('var(--') >= 0) throw new Error('STATUS_DEFS carries a var(); the PDF legend will lose that swatch');
  if (decl.indexOf('#') < 0) throw new Error('STATUS_DEFS has no hex colours at all');
});

check('selection is ONE colour across frames, context blocks and glazing runs', () => {
  // The bug this replaced: selecting a picture and selecting a bed on the same
  // drawing looked like two different gestures.
  ['.ctx-selected', '.ctx-run-sel', '.frame-vis.selection-highlight'].forEach(sel => {
    const at = CSSD.indexOf(sel);
    if (at < 0) throw new Error('rule ' + sel + ' not found');
    const body = CSSD.slice(at, CSSD.indexOf('}', at));
    if (body.indexOf('var(--selected)') < 0) throw new Error(sel + ' does not use var(--selected): ' + body.trim());
  });
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log('\n--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
