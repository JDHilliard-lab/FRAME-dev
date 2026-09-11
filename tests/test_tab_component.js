// ONE tab strip, used by every panel in the app.
//
// There were FIVE and no two agreed: four pill strips built from hand-written
// cssText (28/28/26px tall, three different font rungs, font-weight 700 or
// absent) and one uppercase underline in the elevation sidebar. A designer moving
// between Deck Studio, the floorplan panel and the elevation sidebar met a
// different-looking control doing the same job each time.
//
// .nav-tab is deliberately excluded and this file pins that too: it switches
// VIEWS rather than panes, and the difference is what makes the two levels read
// as different things.
//
// NO REGEX IN THIS FILE. Patterns written into a test file here have lost their
// backslashes in transit three times, and ".frame-tabs.fit > .frame-tab {"
// contains ".frame-tab {" so an unanchored search reads the wrong rule anyway.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTM = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const document = new JSDOM(HTM).window.document;

const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
const count = (h, n) => h.split(n).length - 1;

// Line-anchored so a descendant selector ending in the same class cannot match.
const ruleBody = (sel) => {
  const at = CSS.indexOf(NL + sel + ' {');
  if (at < 0) return null;
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
};

check('the component exists and carries the whole look', () => {
  const body = ruleBody('.frame-tab');
  if (body === null) throw new Error('.frame-tab rule missing');
  ['height', 'font-size: var(--fs-', 'font-weight', 'border-radius: var(--r-',
   'background: var(--bg-input)', 'cursor: pointer'].forEach(p => {
    if (body.indexOf(p) < 0) throw new Error('.frame-tab missing ' + p);
  });
  if (CSS.indexOf('.frame-tab.active') < 0) {
    throw new Error('no .frame-tab.active: a selected tab would paint nothing');
  }
});

check('every panel tab strip in the markup uses it', () => {
  ['dsTabBtnProject', 'dsTabBtnPages', 'dsTabBtnTemplates',
   'dsToolsBtnPage', 'dsToolsBtnTemplates', 'dsToolsBtnLayers'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) throw new Error('#' + id + ' missing');
    if (!el.classList.contains('frame-tab')) {
      throw new Error('#' + id + ' is not a .frame-tab: class="' + el.className + '"');
    }
  });
  const elev = document.querySelectorAll('[data-elevtab]');
  if (elev.length !== 3) throw new Error('expected 3 elevation tabs, found ' + elev.length);
  elev.forEach(el => {
    if (!el.classList.contains('frame-tab')) {
      throw new Error('elevation tab is not a .frame-tab: class="' + el.className + '"');
    }
  });
});

check('selection is .active everywhere, and .elev-tab-on is gone', () => {
  if (count(CSS, '.elev-tab-on') > 0) throw new Error('.elev-tab-on still in style.css');
  if (count(HTM, 'elev-tab-on') > 0) throw new Error('elev-tab-on still in index.html');
  // The QUOTED form only in app.js: the name may appear in a comment explaining
  // why it was replaced, and that is documentation, not a call site.
  if (count(APP, "'elev-tab-on'") > 0) throw new Error('elev-tab-on still used in app.js');
});

check('no tab strip rewrites cssText to show its state any more', () => {
  // The old mechanism, and the reason _dsToolsTab needed a repair call after it:
  // rewriting the whole style string clobbered a display:none set elsewhere.
  if (count(APP, "off = 'background:var(--bg-input); color:var(--text-main);'") > 0) {
    throw new Error('a tab strip still builds its look as a style string');
  }
  if (count(APP, '_tplTabCss') > 0) {
    throw new Error('_tplTabCss is back; it duplicated every .frame-tab declaration');
  }
});

check('.nav-tab stays the deliberate exception, and stays different', () => {
  const nav = ruleBody('.nav-tab.active');
  if (nav === null) throw new Error('.nav-tab.active missing');
  if (nav.indexOf('border-bottom') < 0) {
    throw new Error('.nav-tab.active lost its underline, so it no longer reads as a different level from .frame-tab');
  }
  const tab = ruleBody('.frame-tab.active');
  if (tab === null) throw new Error('.frame-tab.active missing');
  if (tab.indexOf('background') < 0) throw new Error('.frame-tab.active is no longer a filled pill');
  if (tab.indexOf('border-bottom') >= 0) {
    throw new Error('.frame-tab.active grew an underline; the two levels now look the same');
  }
});

check('a strip that fills its panel says so once', () => {
  if (CSS.indexOf('.frame-tabs.fit') < 0) throw new Error('no .frame-tabs.fit modifier');
  if (HTM.indexOf('frame-tabs fit') < 0) throw new Error('no fit strip in the markup');
  if (APP.indexOf("'frame-tabs fit'") < 0) {
    throw new Error('the floorplan strip no longer uses the shared class');
  }
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
