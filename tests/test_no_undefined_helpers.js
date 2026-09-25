// `node --check` CANNOT SEE A CALL TO A FUNCTION THAT DOES NOT EXIST.
//
// 17.68 shipped `_round2(...)` inside the breaker page's letter legend. The identifier
// had never existed: a rename in the edit that introduced it silently failed to apply.
// The file parsed, the whole suite went green, and the breaker page threw a
// ReferenceError the first time anyone opened it. Reported as "it seems broken".
//
// This is the same family as the two other traps written up in CLAUDE.md - the blanket
// rename that rewrote a function's own declaration into a one-line self-call, and the
// landmark slice that deleted _dsPinChrome - and all three share the property that
// `node --check` passes. A parse is not a load, and a load is not a render.
//
// So: every bare call to an underscore-prefixed helper must resolve to a declaration in
// the same file. Underscore-prefixed because that is this file's convention for its own
// helpers; a bare `foo()` could be a browser global, but `_foo()` is always ours.
//
// Plain Node, no jsdom: this is a question about the SOURCE, so reading the file directly
// sidesteps the doubled-backslash template literal that bites every check in here.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

// SCANNED RAW, NOT COMMENT-STRIPPED. Stripping looked obviously right and was the first
// thing tried: it removed three false positives and FORTY-FOUR real declarations, because
// app.js carries `/*` inside string literals and a naive block-comment strip swallows
// everything to the next `*/`. Writing a stripper that is safe here means writing most of
// a JavaScript lexer. Raw plus a named allowlist is four lines and cannot eat the file.
const SRC = RAW;

// Everything this file declares, in every form it uses: hoisted declarations, arrow and
// function expressions bound to const/let/var, object and prototype members, and
// parameters (a helper passed in is declared for the scope that calls it).
const declared = new Set();
[
  /function\s+(_[A-Za-z0-9_$]*)\s*\(/g,
  /(?:const|let|var)\s+(_[A-Za-z0-9_$]*)\s*=/g,
  /(_[A-Za-z0-9_$]*)\s*:\s*function/g,
  /(_[A-Za-z0-9_$]*)\s*:\s*\(/g,
  /(_[A-Za-z0-9_$]*)\s*:\s*async/g,
  /(_[A-Za-z0-9_$]*)\s*=\s*function/g,
  /(_[A-Za-z0-9_$]*)\s*=\s*\(/g,
  /(_[A-Za-z0-9_$]*)\s*=\s*async/g,
].forEach((r) => { let x; while ((x = r.exec(SRC))) declared.add(x[1]); });

const paramRe = /\(([^()]{0,400})\)\s*(?:=>|\{)/g;
let p;
while ((p = paramRe.exec(SRC))) {
  p[1].split(',').forEach((a) => {
    const t = a.trim().split(/[\s=:]/)[0];
    if (t.length > 1 && /^_[A-Za-z0-9_$]*$/.test(t)) declared.add(t);
  });
}

// A GROUP INSIDE A REGEX LITERAL LOOKS EXACTLY LIKE A CALL. `_parseFrameFile`'s pattern
// contains `_([0-9.]+)` and `_r([0-9.]+)`, which read as calls to `_` and `_r`. Rather
// than teach the scanner to lex regex literals - which is most of a JavaScript parser -
// these two are named, because a real helper would never be called `_` or `_r`.
// And PROSE reads like code too: "_igCaptureUsed() wraps that pattern" and "a loaded
// _img (images)" are sentences. Named rather than stripped, for the reason above. An
// entry that stops matching simply goes unused - it can never hide a new failure,
// because a genuinely undeclared helper would have to be called one of these four names.
const KNOWN_FALSE_POSITIVES = ['_', '_r', '_img', '_igCaptureUsed'];

const called = new Set();
let m;
const callRe = /(^|[^A-Za-z0-9_$.])(_[A-Za-z0-9_$]*)\s*\(/g;
while ((m = callRe.exec(SRC))) called.add(m[2]);

const missing = [...called]
  .filter((n) => !declared.has(n))
  .filter((n) => KNOWN_FALSE_POSITIVES.indexOf(n) < 0)
  .sort();

check('EXACT BUG: every _helper() that is CALLED is also DECLARED', () => {
  if (!missing.length) return;
  // Name the line, because "something is undefined" is not actionable in a 2.4MB file.
  const where = missing.map((n) => {
    const at = RAW.search(new RegExp('[^A-Za-z0-9_$.]' + n.replace(/\$/g, '\\$') + '\\s*\\('));
    return n + ' (line ' + (at < 0 ? '?' : RAW.slice(0, at).split('\n').length) + ')';
  });
  throw new Error(missing.length + ' helper(s) called but never declared: ' + where.join(', '));
});

check('the scan is actually looking at something', () => {
  // A scanner that silently matched nothing would pass forever. These numbers only have
  // to be the right order of magnitude; they exist so a broken regex fails loudly.
  if (called.size < 400) throw new Error('only ' + called.size + ' helper calls found — the call scan is broken');
  if (declared.size < 400) throw new Error('only ' + declared.size + ' declarations found — the declaration scan is broken');
});

check('it would have caught the bug that prompted it', () => {
  // Drive the scanner over a synthetic file rather than trusting it by inspection.
  const fake = 'function _real() { return 1; }\nfunction _caller() { return _round2(_real()); }\n';
  const d = new Set();
  let x; const rr = /function\s+(_[A-Za-z0-9_$]*)\s*\(/g;
  while ((x = rr.exec(fake))) d.add(x[1]);
  const c = new Set();
  let y; const cr = /(^|[^A-Za-z0-9_$.])(_[A-Za-z0-9_$]*)\s*\(/g;
  while ((y = cr.exec(fake))) c.add(y[2]);
  const miss = [...c].filter((n) => !d.has(n));
  if (miss.indexOf('_round2') < 0) throw new Error('the scanner does not flag an undeclared call');
  if (miss.indexOf('_real') >= 0) throw new Error('the scanner flags a declared call');
});

let failures = [];
results.forEach((r) => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
console.log('\n--- Summary ---');
if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
else console.log('ALL PASSED (' + results.length + ')');
