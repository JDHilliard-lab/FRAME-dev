// The type and corner ladders.
//
// Before this there were THIRTY distinct rem font sizes across 894 declarations,
// eight of them inside one 0.12rem band - a third of a pixel apart at a 16px
// root, indistinguishable to the eye and a guarantee that nothing lines up. And
// eleven border radii from 1px to 11px across 360 declarations. Neither was a
// scale; both were sediment.
//
// Plain Node: questions about three source files. Regex LITERALS only - a
// pattern built from a string loses its backslashes, and one containing var(--x)
// matches nothing because the parentheses are a capture group.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = ['app.js', 'style.css', 'index.html'];
const SRC = {};
FILES.forEach(f => { SRC[f] = fs.readFileSync(path.join(root, f), 'utf8'); });
const CSS = SRC['style.css'];
// Declarations only: a token's comment may legitimately name the values it replaced.
const CSSD = CSS.split('/*').map((p, i) => i === 0 ? p : p.split('*/').slice(1).join('*/')).join('');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

const FS_LADDER = [45, 50, 55, 60, 65, 70, 75, 80, 85, 95, 105, 120];
const R_LADDER = [2, 4, 6, 8, 10];

check('the type ladder is exactly the declared steps, each a literal', () => {
  FS_LADDER.forEach(n => {
    const key = '--fs-' + n + ':';
    const at = CSSD.indexOf(key);
    if (at < 0) throw new Error('missing ' + key);
    const val = CSSD.slice(at + key.length, CSSD.indexOf(';', at)).trim();
    const want = (n / 100) + 'rem';
    if (val !== want) throw new Error(key + ' should be ' + want + ', found ' + val);
  });
  // and nothing beyond them, or the ladder has quietly grown a rung
  const all = (CSSD.match(/--fs-[0-9]+:/g) || []).map(s => parseInt(s.slice(5), 10));
  const extra = all.filter(n => FS_LADDER.indexOf(n) < 0);
  if (extra.length) throw new Error('undeclared rungs added: ' + extra.join(', '));
});

check('the corner ladder is exactly the declared steps', () => {
  R_LADDER.forEach(n => {
    const key = '--r-' + n + ':';
    const at = CSSD.indexOf(key);
    if (at < 0) throw new Error('missing ' + key);
    const val = CSSD.slice(at + key.length, CSSD.indexOf(';', at)).trim();
    if (val !== n + 'px') throw new Error(key + ' should be ' + n + 'px, found ' + val);
  });
  const all = (CSSD.match(/--r-[0-9]+:/g) || []).map(s => parseInt(s.slice(4), 10));
  const extra = all.filter(n => R_LADDER.indexOf(n) < 0);
  if (extra.length) throw new Error('undeclared rungs added: ' + extra.join(', '));
});

check('no raw rem font-size survives anywhere', () => {
  // This is the check that stops the ladder rotting: one hand-written 0.62rem is
  // how thirty sizes happened the first time.
  const bad = [];
  FILES.forEach(f => {
    const hits = SRC[f].match(/font-size:\s*[0-9]*\.?[0-9]+rem/g) || [];
    if (hits.length) bad.push(f + ': ' + hits.slice(0, 5).join(', ') + (hits.length > 5 ? ' …+' + (hits.length - 5) : ''));
  });
  if (bad.length) throw new Error('raw rem font-size: ' + bad.join(' | '));
});

check('no raw px border-radius except the one deliberate pill', () => {
  const hits = [];
  FILES.forEach(f => (SRC[f].match(/border-radius:\s*[0-9]+px/g) || []).forEach(h => hits.push(f + ' ' + h)));
  // 99px means "fully rounded". It is a SHAPE, not a size, and any rung of a
  // 2-10 ladder would square its ends off. 50% circles are the same idea and do
  // not match this pattern at all.
  const notPill = hits.filter(h => h.indexOf('99px') < 0);
  if (notPill.length) throw new Error('raw px radius: ' + notPill.slice(0, 6).join(', '));
  if (hits.length === 0) throw new Error('the 99px pill was swallowed by the ladder; it should stay a pill');
});

check('every ladder token used is declared, and none is self-referential', () => {
  const joined = FILES.map(f => SRC[f]).join('');
  const used = {};
  (joined.match(/var\(--fs-[0-9]+\)/g) || []).forEach(s => { used[s.slice(4, -1)] = 1; });
  (joined.match(/var\(--r-[0-9]+\)/g) || []).forEach(s => { used[s.slice(4, -1)] = 1; });
  const missing = Object.keys(used).filter(t => CSSD.indexOf(t + ':') < 0);
  if (missing.length) throw new Error('used but never declared: ' + missing.join(', '));

  const circ = [];
  CSSD.split(String.fromCharCode(10)).forEach(line => {
    const i = line.indexOf('--');
    if (i < 0 || line.indexOf(':', i) < 0) return;
    const nm = line.slice(i, line.indexOf(':', i)).trim();
    if (nm.indexOf('--') !== 0) return;
    if (line.slice(line.indexOf(':', i) + 1).indexOf('var(' + nm + ')') >= 0) circ.push(nm);
  });
  if (circ.length) throw new Error('self-referential (resolves to nothing, silently): ' + circ.join(', '));
});

check('circle radii are untouched', () => {
  // border-radius:50% is how every round swatch and dot is drawn. A ladder value
  // here turns a circle into a rounded square across the whole app.
  const n = (SRC['app.js'] + CSS + SRC['index.html']).split('border-radius:').filter(s => s.slice(0, 5).indexOf('50%') >= 0).length;
  if (n < 20) throw new Error('expected the 50% circles to survive, found ' + n);
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log('\n--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
