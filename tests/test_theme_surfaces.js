// "can we make the background behind the elevation light while in dark theme mode,
//  I cannot see the wall dim lines while in darkmode. Also, can we make the light
//  theme mode less intense with the white, maybe a softer white light grey. Also,
//  the toggle light dark theme mode icon only had a moon crescent, can it also have
//  a sun icon in the similar style"
//
// Three things.
//
// (1) THE ELEVATION'S GROUND IS NOT A THEME COLOUR. The drawing is print colours in
//     both themes - the wall, the dimension ink and every line weight come from
//     annotationStyle, never from a theme var - so the surface it sits on has to be
//     a print surface too. The outer wall dimensions are drawn OUTSIDE the wall in
//     near-black, and on the dark ground they were invisible: the measurements were
//     on screen and could not be read.
//
// (2) Light mode had #ffffff on the nav, every panel AND every input, so the whole
//     app glared and a field was told apart from its panel by its border alone.
//
// (3) The toggle carried a moon in both themes - the one control whose whole job is
//     to change something never changed itself.
//
// Plain Node for the source questions, jsdom only for the icon swap, because
// "a class is set" is not "a style is applied" (see .action-btn.active).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const HTM = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
// A token's own comment may legitimately name the value it replaced, and that is
// not a declaration.
const stripComments = s => s.split('/*').map((p, i) => i === 0 ? p : p.split('*/').slice(1).join('*/')).join('');
const CSSD = stripComments(CSS);

// The declaration blocks, as { sel, body } pairs.
const RULES = [];
CSSD.split('}').forEach(chunk => {
  const at = chunk.indexOf('{');
  if (at < 0) return;
  const sel = chunk.slice(0, at).trim();
  if (!sel || sel.charAt(0) === '@') return;
  RULES.push({ sel, body: chunk.slice(at + 1) });
});
const ruleBody = (sel) => {
  const hit = RULES.filter(r => r.sel === sel);
  if (!hit.length) throw new Error('no rule for ' + sel);
  if (hit.length > 1) throw new Error(hit.length + ' rules for ' + sel + '; this test reads one');
  return hit[0].body;
};
// A token's value as declared inside one rule.
const tokenIn = (sel, name) => {
  const body = ruleBody(sel);
  const at = body.indexOf(name + ':');
  if (at < 0) return null;
  return body.slice(at + name.length + 1, body.indexOf(';', at)).trim();
};
const rgb = (hex) => {
  const m = ('' + hex).trim().replace('#', '');
  if (m.length !== 6) throw new Error('not a 6-digit hex: ' + hex);
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};
// Plain average, not a perceptual curve: the question here is only "is this a
// light surface or a dark one", and a curve would invite arguing about the number.
const lum = (hex) => { const c = rgb(hex); return (c[0] + c[1] + c[2]) / 3 / 255; };

check('EXACT BUG: the elevation ground is declared ONCE and is not a theme colour', () => {
  const root_ = tokenIn(':root', '--elev-ground');
  if (!root_) throw new Error('--elev-ground is not declared in :root');
  if (root_.indexOf('var(') >= 0) throw new Error('--elev-ground points at a theme token, so it follows the theme again: ' + root_);
  // Redeclared anywhere and it is a theme value after all, which is the bug.
  const decls = RULES.filter(r => r.body.indexOf('--elev-ground:') >= 0);
  if (decls.length !== 1) throw new Error('--elev-ground is declared in ' + decls.length + ' rules: ' + decls.map(d => d.sel).join(', '));
  if (decls[0].sel !== ':root') throw new Error('declared in ' + decls[0].sel + ' rather than :root');
});

check('EXACT BUG: the drawing board reads the ground, not the app background', () => {
  const ws = RULES.filter(r => r.sel === '.workspace');
  if (ws.length !== 1) throw new Error('expected one .workspace rule, found ' + ws.length);
  const b = ws[0].body;
  if (b.indexOf('var(--elev-ground)') < 0) throw new Error('.workspace does not use --elev-ground');
  if (b.indexOf('var(--bg-main)') >= 0) throw new Error('.workspace still follows --bg-main, so it goes dark with the app and the wall dims vanish');
});

check('the ground is a LIGHT surface, so near-black dimension ink reads on it', () => {
  const g = tokenIn(':root', '--elev-ground');
  const L = lum(g);
  if (L < 0.8) throw new Error('the ground is not light enough for dark ink: ' + g + ' (' + L.toFixed(2) + ')');
  // And the dark theme itself was NOT relit as a side effect.
  const dark = tokenIn(':root', '--bg-main');
  if (lum(dark) > 0.3) throw new Error('the dark theme background went light too: ' + dark);
});

check('the wall still reads as a sheet on it: lighter than the board, and not equal', () => {
  // #wall is a literal, deliberately - it is the drawing, not chrome.
  const wallRule = RULES.filter(r => r.sel === '#wall');
  if (wallRule.length !== 1) throw new Error('expected one #wall rule');
  const at = wallRule[0].body.indexOf('background:');
  const wall = wallRule[0].body.slice(at + 11, wallRule[0].body.indexOf(';', at)).trim();
  const g = tokenIn(':root', '--elev-ground');
  if (wall.toLowerCase() === g.toLowerCase()) throw new Error('the wall and the board are the same colour, so the page has no edge: ' + wall);
  if (lum(wall) <= lum(g)) throw new Error('the board is lighter than the wall, so the sheet reads as a hole rather than a page');
});

check('EXACT ASK: light mode is OFF-white, and no surface is pure white but the input', () => {
  ['--bg-main', '--bg-nav', '--bg-panel', '--bg-subpanel'].forEach(k => {
    const v = tokenIn('.light-theme', k);
    if (!v) throw new Error('.light-theme no longer sets ' + k);
    if (v.toLowerCase() === '#ffffff' || v.toLowerCase() === '#fff') throw new Error(k + ' is still pure white, which is the glare that was reported');
  });
  const inp = tokenIn('.light-theme', '--bg-input');
  if (inp.toLowerCase() !== '#ffffff') throw new Error('--bg-input is no longer white, so a field stops looking like somewhere you can type: ' + inp);
});

check('a field is lighter than the panel behind it, not merely outlined', () => {
  // These were the SAME colour (#ffffff both), so in light mode an input was told
  // apart from its panel by its border alone.
  const panel = tokenIn('.light-theme', '--bg-panel');
  const input = tokenIn('.light-theme', '--bg-input');
  if (lum(input) <= lum(panel)) throw new Error('the input is not lighter than the panel: ' + input + ' on ' + panel);
});

check('the light surfaces step in one direction, so nothing reads as a hole', () => {
  const order = ['--bg-input', '--bg-panel', '--bg-nav', '--bg-subpanel', '--bg-main'];
  const vals = order.map(k => ({ k, L: lum(tokenIn('.light-theme', k)) }));
  for (let i = 1; i < vals.length; i++) {
    if (vals[i].L > vals[i - 1].L) throw new Error(vals[i].k + ' is lighter than ' + vals[i - 1].k + ', so the stack is out of order');
  }
  // And it is a real range, not five shades of the same thing.
  if (vals[0].L - vals[vals.length - 1].L < 0.03) throw new Error('the light surfaces are indistinguishable from each other');
});

check('both theme icons exist in the markup, in the .svg-icon convention', () => {
  ['theme-icon-sun', 'theme-icon-moon'].forEach(c => {
    const at = HTM.indexOf(c);
    if (at < 0) throw new Error('no ' + c + ' in index.html');
    if (at !== HTM.lastIndexOf(c)) throw new Error(c + ' appears more than once in the markup');
    const tag = HTM.slice(HTM.lastIndexOf('<svg', at), at + 40);
    if (tag.indexOf('svg-icon') < 0) throw new Error(c + ' is not an .svg-icon, so it will not stroke in currentColor');
  });
  // A sun drawn as a filled disc would be a black blob: .svg-icon is fill:none.
  const sunAt = HTM.indexOf('theme-icon-sun');
  const sun = HTM.slice(sunAt, HTM.indexOf('</svg>', sunAt));
  if (sun.indexOf('<circle') < 0) throw new Error('the sun has no disc');
  if (sun.split('M').length - 1 < 6) throw new Error('the sun has too few rays to read as a sun');
});

// ── jsdom: a class set is not a style applied ───────────────────────────
// Every selector in style.css whose block hides the element. Matched with the
// real engine, because string-comparing class names cannot see a descendant or
// :not() selector - the trap test_active_state_visible was written for.
const HIDERS = RULES.filter(r => r.body.replace(/\s+/g, '').indexOf('display:none') >= 0)
  .map(r => r.sel).join(',').split(',').map(s => s.trim()).filter(Boolean);

const dom = new JSDOM(HTM, { url: 'https://example.com/' });
const doc = dom.window.document;
const hidden = (el) => HIDERS.some(sel => { try { return el.matches(sel); } catch (_) { return false; } });
const sun = doc.querySelector('.theme-icon-sun');
const moon = doc.querySelector('.theme-icon-moon');

check('EXACT ASK: dark mode shows the SUN, which is the mode the click goes to', () => {
  if (!sun || !moon) throw new Error('one of the icons is not in the document');
  doc.body.classList.remove('light-theme');
  if (hidden(sun)) throw new Error('the sun is hidden in dark mode, so the button still only ever shows a moon');
  if (!hidden(moon)) throw new Error('both icons show at once in dark mode');
});

check('light mode shows the MOON, so the button changes when you press it', () => {
  doc.body.classList.add('light-theme');
  if (hidden(moon)) throw new Error('the moon is hidden in light mode, so the button shows nothing');
  if (!hidden(sun)) throw new Error('both icons show at once in light mode');
  doc.body.classList.remove('light-theme');
});

check('the swap is CSS, so nothing has to remember to keep the icon in step', () => {
  const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const at = APP.indexOf('function toggleTheme()');
  if (at < 0) throw new Error('toggleTheme is gone');
  const body = APP.slice(at, APP.indexOf('\n', at));
  if (body.indexOf('theme-icon') >= 0) throw new Error('toggleTheme hand-edits the icons; a second path will forget to');
});

const failures = [];
results.forEach(r => {
  console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
  if (!r.ok) failures.push(r.label);
});
console.log('\n--- Summary ---');
if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
else console.log('ALL PASSED (' + results.length + ')');
