// A HALF-CACHED BUILD USED TO BEHAVE STRANGELY INSTEAD OF SAYING SO.
//
// index.html has linked style.css?v=<APP_VERSION> for a long time, for a
// failure this project has already paid for once: a cached stylesheet beside a
// fresh app.js makes every new CSS rule silently absent, which is how the
// gradient dashes vanished on screen while still exporting correctly.
//
// The REVERSE was wide open. app.js was loaded with no query at all, so a
// browser could serve fresh HTML and fresh CSS against a CACHED app.js. That is
// the worse direction, because the version pill is read out of app.js: the one
// indicator a designer would check agrees with itself and is wrong.
//
// Two halves, and both are needed. The query string stops a NEW visit picking
// up an old file. The stamp catches a browser that already holds a mismatched
// pair, where the URL in the cached HTML is the old one and no query can help.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const PROMOTE = fs.readFileSync(path.join(root, 'tools', 'promote.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

const VER = (APP.match(/const APP_VERSION = '([^']+)'/) || [])[1];

// ── the pins ────────────────────────────────────────────────────────────
check('APP_VERSION is readable, which everything else here hangs off', () => {
  if (!VER) throw new Error('could not read APP_VERSION from app.js');
});

check('EXACT BUG: app.js is cache-busted, or a JS change never reaches the user', () => {
  const m = HTML.match(/<script src="app\.js(\?v=([^"]*))?"><\/script>/);
  if (!m) throw new Error('could not find the app.js script tag');
  if (!m[2]) throw new Error('THE BUG: app.js has no version query, so a browser serves a cached copy beside a fresh index.html and style.css, and the version pill reports the stale build as if it were current');
  if (m[2] !== VER) throw new Error('app.js?v=' + m[2] + ' but APP_VERSION is ' + VER + ' - bump both together');
});

check('style.css is still pinned to the same version', () => {
  const m = HTML.match(/style\.css\?v=([^"]*)"/);
  if (!m) throw new Error('style.css lost its version query');
  if (m[1] !== VER) throw new Error('style.css?v=' + m[1] + ' but APP_VERSION is ' + VER);
});

check('index.html stamps the version it was built against', () => {
  const m = HTML.match(/window\.FRAME_HTML_VERSION = '([^']*)'/);
  if (!m) throw new Error('index.html does not stamp FRAME_HTML_VERSION, so a cached pair cannot be detected at runtime');
  if (m[1] !== VER) throw new Error('FRAME_HTML_VERSION is ' + m[1] + ' but APP_VERSION is ' + VER);
});

check('and the stamp is set BEFORE app.js loads, or it reads undefined', () => {
  const stamp = HTML.indexOf('window.FRAME_HTML_VERSION');
  const script = HTML.indexOf('<script src="app.js');
  if (stamp < 0 || script < 0) throw new Error('missing the stamp or the script tag');
  if (stamp > script) throw new Error('the stamp is set after app.js loads, so the check always sees undefined and never fires');
});

// ── the runtime half, driven ────────────────────────────────────────────
const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const TAIL = [
  'window.__fx = {',
  '  pairing: _checkBuildPairing,',
  '  version: APP_VERSION,',
  '  spy: function (f) { showInfoModal = f; },',
  '};',
].join(NL);
window.eval(APP + NL + TAIL);
const fx = window.__fx;
const modals = [];
fx.spy((t, b) => modals.push({ title: t || '', body: b || '' }));

check('a mismatched pair is reported, with both build numbers', () => {
  modals.length = 0;
  window.FRAME_HTML_VERSION = '17.01';
  const ok = fx.pairing();
  if (ok !== false) throw new Error('a mismatched pair was reported as fine');
  if (modals.length !== 1) throw new Error('the designer was shown ' + modals.length + ' notices for a stale tab');
  const all = modals[0].title + ' ' + modals[0].body;
  if (all.indexOf('17.01') < 0) throw new Error('the notice does not say which build index.html is from');
  if (all.indexOf(fx.version) < 0) throw new Error('the notice does not say which build app.js is from');
  if (all.indexOf('Ctrl+Shift+R') < 0) throw new Error('the notice does not say how to fix it, which is the only thing the designer can do');
  if (all.toLowerCase().indexOf('save') < 0) throw new Error('the notice does not warn about unsaved work before a hard reload');
});

check('a matched pair says nothing at all', () => {
  modals.length = 0;
  window.FRAME_HTML_VERSION = fx.version;
  if (fx.pairing() !== true) throw new Error('a matched pair was reported as mismatched');
  if (modals.length) throw new Error('a correct build nagged the designer anyway');
});

check('and a page with no stamp is left alone', () => {
  // A test harness, a stripped page, or index.html opened from a build that
  // predates the stamp. None of those is a mismatch, and an alert on boot that
  // nobody can act on is worse than no alert.
  modals.length = 0;
  delete window.FRAME_HTML_VERSION;
  if (fx.pairing() !== true) throw new Error('a page with no stamp was called mismatched');
  if (modals.length) throw new Error('a page with no stamp raised a notice');
});

check('the check runs on BOTH boot branches', () => {
  // readyState is 'loading' on a cold load and already past it when app.js is
  // evaluated some other way. Wiring only one leaves half the users unguarded.
  const i = APP.indexOf("if (document.readyState === 'loading')");
  if (i < 0) throw new Error('could not find the boot branches');
  const tail = APP.slice(i, APP.indexOf('END SAVE / AUTOSAVE'));
  if (tail.split('_checkBuildPairing()').length - 1 !== 2) throw new Error('the pairing check is not wired into both boot branches');
});

// ── and the release cannot ship a mismatch ──────────────────────────────
check('promote gates on all three pins, since stable is where nobody watches a console', () => {
  ['style.css?v=', 'app.js?v=', 'FRAME_HTML_VERSION'].forEach((needle) => {
    if (PROMOTE.indexOf(needle) < 0) throw new Error('promote.js does not check ' + needle + ', so a release can ship a mismatched pair');
  });
});

results.forEach(r => console.log((r.ok ? 'OK:   ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
const bad = results.filter(r => !r.ok);
console.log('');
console.log('--- Summary ---');
if (bad.length) { console.log('FAILED (' + bad.length + ' of ' + results.length + ')'); process.exitCode = 1; }
else console.log('ALL PASSED (' + results.length + ')');
