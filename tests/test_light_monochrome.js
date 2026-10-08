// "can we make the white theme less intense white, lets have an off white maybe
//  baige color. also, when tabs are selected lets get rid of the blue highlights in
//  the UI and make it so it just gets inverted ... buttons can be light grey and when
//  they are selected they can go black with white text/icons"
// "YES keep the blue highlights where it makes sense, like in the elevations when
//  selecting frames. But lets make the overall light theme less blue highlights"
//
// The split this rests on: --accent / --ui-active are CHROME (tabs, toggles, primary
// buttons), and the light theme turns them near-black. --selected is "this object on
// the drawing or page is selected" and stays blue in both themes, because a black
// outline on black linework vanishes. So every on-canvas selection site has to read
// --selected, or it silently goes black with the chrome.
//
// Plain Node, no regex (see CLAUDE.md on backslashes in test files).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
const stripComments = s => s.split('/*').map((p, i) => i === 0 ? p : p.split('*/').slice(1).join('*/')).join('');
const CSSD = stripComments(CSS);
const RULES = [];
CSSD.split('}').forEach(chunk => {
  const at = chunk.indexOf('{');
  if (at < 0) return;
  RULES.push({ sel: chunk.slice(0, at).trim(), body: chunk.slice(at + 1) });
});
const ruleBody = sel => {
  const hit = RULES.filter(r => r.sel === sel);
  if (hit.length !== 1) throw new Error(hit.length + ' rules for ' + sel);
  return hit[0].body;
};
const tokenIn = (sel, name) => {
  const body = ruleBody(sel);
  const at = body.indexOf(name + ':');
  if (at < 0) return null;
  return body.slice(at + name.length + 1, body.indexOf(';', at)).trim();
};
const rgb = hex => {
  const m = ('' + hex).trim().replace('#', '');
  if (m.length !== 6) throw new Error('not a 6-digit hex: ' + hex);
  return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16));
};

check('light theme turns the chrome tokens into a near-black neutral', () => {
  ['--accent', '--ui-active', '--btn-primary'].forEach(k => {
    const v = tokenIn('.light-theme', k);
    if (!v) throw new Error('.light-theme does not override ' + k + ', so it stays blue');
    const c = rgb(v);
    const L = (c[0] + c[1] + c[2]) / 3 / 255;
    const spread = Math.max.apply(null, c) - Math.min.apply(null, c);
    if (L > 0.2) throw new Error(k + ' is not dark enough to read as inverted: ' + v);
    if (spread > 12) throw new Error(k + ' carries a hue, not a neutral: ' + v);
  });
});

check('light theme does NOT override --selected; the drawing keeps its blue', () => {
  if (tokenIn('.light-theme', '--selected') !== null) throw new Error('--selected is overridden in .light-theme; a black selection disappears into the linework');
});

check('the light surfaces are WARM, not blue-grey', () => {
  ['--bg-main', '--bg-nav', '--bg-panel', '--bg-subpanel', '--border-color'].forEach(k => {
    const c = rgb(tokenIn('.light-theme', k));
    if (!(c[0] > c[2])) throw new Error(k + ' is not warm (red <= blue): ' + tokenIn('.light-theme', k));
  });
});

check('a lit segmented toggle inverts in light mode', () => {
  const b = ruleBody('.light-theme .unit-toggle button.active');
  if (b.indexOf('var(--accent)') < 0 || b.indexOf('#fff') < 0) throw new Error('not inverted: ' + b.trim());
});

check('drop targets ON the drawing or page read --selected', () => {
  ['.frame-vis.art-drop-hover', '.ds-art-drop'].forEach(sel => {
    if (ruleBody(sel).indexOf('var(--selected)') < 0) throw new Error(sel + ' would go black with the chrome');
  });
});

// The on-canvas renderers: selection outlines, handles, grips, marquees and the
// elevation line tool. Sliced between landmarks, never by a character distance.
const CANVAS = ['_dsRenderAnnots', 'renderMoodboardCanvas', '_dsTitleHandles', '_dsAddGuides',
  'renderOneCustomLine', 'renderElevUnderlay', '_ulCalMark', '_mbDrawGuides', '_dsMoveGrip',
  '_mbSegEl', '_mbMarqueeStart', '_mbHandles', '_mbDot', '_elevMarqueeStart',
  '_dsAnnMarqueeAttach', '_dsAnnHandles', 'renderCustomLines', 'buildDimControls',
  'renderGlazingRuns', 'updateAnchorHoverDot', '_dsGearButton', '_dsImgZoomPill',
  '_dsDragPill', '_dsTextGearButton'];
const fnBody = name => {
  let at = APP.indexOf('\nfunction ' + name + '(');
  if (at < 0) at = APP.indexOf('\nasync function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found');
  let end = APP.indexOf('\nfunction ', at + 1);
  const end2 = APP.indexOf('\nasync function ', at + 1);
  if (end2 >= 0 && (end < 0 || end2 < end)) end = end2;
  return APP.slice(at, end < 0 ? APP.length : end);
};
check('every on-canvas selection site reads --selected, never a chrome token', () => {
  const bad = [];
  CANVAS.forEach(n => {
    const b = fnBody(n);
    if (b.indexOf('var(--ui-active)') >= 0 || b.indexOf('var(--accent') >= 0) bad.push(n);
    if (b.indexOf('var(--selected)') < 0) bad.push(n + ' (no --selected at all)');
  });
  if (bad.length) throw new Error('would turn black in light mode: ' + bad.join(', '));
});

check('no hand-written blue wash survives in app.js', () => {
  // rgba(106,106,255,a) was --ui-active spelled out, so it ignored the theme.
  if (APP.split('106,106,255').length > 1) throw new Error('raw rgba(106,106,255,...) is back; use color-mix on a token');
  if (APP.split('#3b82f6').length > 1) throw new Error('#3b82f6 fallback is back');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
if (failed.length) process.exit(1);
console.log('ALL PASSED (' + results.length + ')');
