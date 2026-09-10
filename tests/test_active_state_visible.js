// A CLASS SET IS NOT A STYLE APPLIED.
//
// .action-btn is on 154 elements in index.html and had no .active rule anywhere
// in style.css, so a button marked active tracked its state perfectly and
// painted nothing. That is most of why wall mode looked invisible for several
// versions. It was fixed by giving .wall-mode-btn its own rule, which closed one
// button and left the trap armed for the next.
//
// Plain Node: these are questions about two source files.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const HTM = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const { JSDOM } = require('jsdom');
const dom = new JSDOM(HTM);
const document = dom.window.document;

// Every selector in style.css that mentions .active, split off its rule body and
// its comma groups. Media/keyframe wrappers are skipped by requiring a leading
// dot or tag character rather than trying to parse the at-rule.
// Comments stripped first, by hand: a regex for them needs backslashes, and a
// backslash in a generated file is the single most reliable way to lose an hour.
const CSS_NC = CSS.split('/*').map((p, i) => i === 0 ? p : p.split('*/').slice(1).join('*/')).join('');
const ACTIVE_SELECTORS = CSS_NC
  .split('}')
  .filter(chunk => chunk.indexOf('{') >= 0)
  .map(chunk => chunk.slice(0, chunk.indexOf('{')))   // the selector IS what precedes {
  .join(',')
  .split(',')
  .map(sel => sel.trim())
  .filter(sel => sel.length > 0 && sel.indexOf('.active') >= 0 && sel.indexOf('@') < 0);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

check('.action-btn has an .active rule at all', () => {
  if (CSS.indexOf('.action-btn.active') < 0) {
    throw new Error('no .action-btn.active rule: an active button would paint nothing');
  }
});

check('.action-btn.active outranks everything it shares weight with', () => {
  // Every one of these weighs (0,2,0), so SOURCE ORDER is the only thing
  // deciding, and .active has to come last.
  const at = CSS.indexOf('.action-btn.active {');
  if (at < 0) throw new Error('.action-btn.active rule not found');
  const mustPrecede = {
    '.action-btn:hover': 'a lit button would turn grey under the cursor',
    '.btn-secondary {': 'a lit "action-btn btn-secondary" would paint plain grey',
    '.btn-outline {': 'a lit "action-btn btn-outline" would paint transparent',
    '.btn-danger {': 'a lit "action-btn btn-danger" would keep the danger fill',
  };
  Object.keys(mustPrecede).forEach(sel => {
    const i = CSS.indexOf(sel);
    if (i < 0) throw new Error('expected rule missing: ' + sel);
    if (i > at) throw new Error(sel + ' comes AFTER .action-btn.active, so ' + mustPrecede[sel]);
  });
});

check('disabled outranks active: a control you cannot press must not look armed', () => {
  if (CSS.indexOf('.action-btn.active:disabled') < 0) {
    throw new Error('no .action-btn.active:disabled rule; a disabled button would still paint as active');
  }
});

check('every element marked active is matched by some .active rule', () => {
  // Needs a REAL matcher, not string comparison: the rule that paints the
  // LIBRARY/COLOR pair is ".unit-toggle button.active", a descendant selector
  // that mentions none of the element's own classes. Comparing class names
  // reported it as an orphan when it is perfectly well styled.
  const orphans = [];
  document.querySelectorAll('.active').forEach(el => {
    if (!ACTIVE_SELECTORS.some(sel => { try { return el.matches(sel); } catch (_) { return false; } })) {
      orphans.push((el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' class="' + el.className + '"');
    }
  });
  if (orphans.length) throw new Error('markup says active, no rule matches: ' + orphans.join(' | '));
});

check('an .action-btn GIVEN .active is matched - the trap itself', () => {
  // The original bug in its live form: set the class on a real .action-btn and
  // ask whether anything in the stylesheet would paint it. Before the fix this
  // was false for all 154 of them.
  const btn = document.querySelector('.action-btn');
  if (!btn) throw new Error('no .action-btn in index.html');
  const had = btn.classList.contains('active');
  btn.classList.add('active');
  const matched = ACTIVE_SELECTORS.some(sel => { try { return btn.matches(sel); } catch (_) { return false; } });
  if (!had) btn.classList.remove('active');
  if (!matched) throw new Error('an .action-btn marked active is matched by no rule: it would paint nothing');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log('\n--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
