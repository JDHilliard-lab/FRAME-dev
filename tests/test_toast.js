// A TRANSIENT NOTICE, FOR THINGS THAT ARE NOT A DECISION.
//
// There were 80 showInfoModal() calls and no other way for this app to say
// anything, so "Nothing selected" took over the screen and demanded a click to
// dismiss information you already half-knew.
//
// The dividing line, and the part worth protecting: a toast is safe to MISS. So
// it gets acknowledgements and nudges, and never gets something you must read to
// act on ("commit studio-defaults.json to the repo root"), a change you did not
// ask for ("Units auto-corrected"), or a failure. A notice you can miss is the
// wrong shape for information you cannot afford to miss.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};
const count = (h, n) => h.split(n).length - 1;

// ── live DOM, so these are behaviour and not spelling ───────────────────
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
window.eval(APP + NL + 'window.__toast = _toast;');
const doc = window.document;

check('a toast appears, carries its text, and is announced politely', () => {
  const el = window.__toast('Nothing selected', 'Tick at least one item code first.');
  if (!el) throw new Error('_toast returned nothing');
  const host = doc.querySelector('.frame-toast-host');
  if (!host) throw new Error('no toast host was created');
  if (host.getAttribute('role') !== 'status') throw new Error('host is not role=status');
  if (host.getAttribute('aria-live') !== 'polite') throw new Error('host is not aria-live=polite');
  if (host.querySelector('.frame-toast-title').textContent !== 'Nothing selected') {
    throw new Error('title not rendered');
  }
  if (host.querySelector('.frame-toast-body').textContent.indexOf('Tick at least one') < 0) {
    throw new Error('body not rendered');
  }
});

check('notices STACK rather than replacing each other', () => {
  // Two things happening at once should say so. A queue that shows one and drops
  // the other is how a user learns the second thing never happened.
  const host = doc.querySelector('.frame-toast-host');
  const before = host.children.length;
  window.__toast('Library Synced', 'Synced 9 swatches.');
  if (host.children.length !== before + 1) throw new Error('the second notice did not stack');
});

check('clicking dismisses early', () => {
  const el = window.__toast('Spec pages only', 'Select a spec page first.');
  el.onclick();
  if (!el.classList.contains('leaving')) throw new Error('a clicked toast does not start leaving');
});

check('it fails QUIET with no DOM instead of throwing', () => {
  // The caller is telling a user something and there is no user. Throwing here
  // would take down whatever action raised the notice.
  const b = APP.slice(APP.indexOf('function _toastHostEl'), APP.indexOf('const TOAST_MS'));
  if (b.indexOf('return null') < 0) throw new Error('_toastHostEl does not return null without a body');
  const t = APP.slice(APP.indexOf('function _toast('), APP.indexOf('function showInfoModal('));
  if (t.indexOf('if (!host) return null;') < 0) throw new Error('_toast does not bail when there is no host');
});

check('the host never blocks the page, but each toast stays clickable', () => {
  const hostRule = CSS.slice(CSS.indexOf('.frame-toast-host {'), CSS.indexOf('}', CSS.indexOf('.frame-toast-host {')));
  if (hostRule.indexOf('pointer-events: none') < 0) {
    throw new Error('the host takes pointer events, so a stack of notices would block the page under it');
  }
  const toastRule = CSS.slice(CSS.indexOf(NL + '.frame-toast {'), CSS.indexOf('}', CSS.indexOf(NL + '.frame-toast {')));
  if (toastRule.indexOf('pointer-events: auto') < 0) {
    throw new Error('the toast itself takes no pointer events, so it cannot be dismissed');
  }
});

check('toasts sit ABOVE every modal layer', () => {
  // One is routinely raised from inside a modal ("Nothing selected" while the
  // templates dialog is open). Rendering behind the thing that triggered it is
  // worse than not showing it.
  const val = (name) => {
    const at = CSS.indexOf(name + ':');
    if (at < 0) throw new Error('missing token ' + name);
    return parseInt(CSS.slice(at + name.length + 1, CSS.indexOf(';', at)).trim(), 10);
  };
  if (!(val('--z-toast') > val('--z-modal-alert'))) {
    throw new Error('--z-toast ' + val('--z-toast') + ' is not above --z-modal-alert ' + val('--z-modal-alert'));
  }
});

check('THE LINE HOLDS: what must be read is still a modal', () => {
  // These three are the reason the split exists. Each is either instructions to
  // follow, a change the user did not ask for, or a hard failure.
  [['Studio defaults exported', 'instructions you must follow'],
   ['Units auto-corrected', 'a change to the data nobody asked for'],
   ['Storage Limit Reached', 'a failure']].forEach(([title, why]) => {
    if (count(APP, "_toast('" + title + "'") > 0) {
      throw new Error('"' + title + '" became a toast, but it is ' + why);
    }
    if (count(APP, "showInfoModal('" + title + "'") === 0) {
      throw new Error('"' + title + '" no longer shows a modal at all');
    }
  });
});

check('the nudges really did move off the modal', () => {
  // Otherwise this is a helper nobody calls.
  ['Nothing selected', 'Select a text box', 'Not available here'].forEach(title => {
    if (count(APP, "_toast('" + title + "'") === 0) throw new Error('"' + title + '" is not a toast');
    if (count(APP, "showInfoModal('" + title + "'") > 0) throw new Error('"' + title + '" still also opens a modal');
  });
  if (count(APP, '_toast(') < 10) throw new Error('barely any call sites; the helper is not actually in use');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log(NL + '--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
