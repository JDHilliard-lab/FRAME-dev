// NOTHING WAS LISTENING FOR AN UNCAUGHT ERROR.
//
// This is a 27k-line file in one global scope where, as the project notes put
// it, a parse is not a load and a load is not a render. Four ReferenceErrors
// have shipped that `node --check` waved through and that died the first time
// the page was opened: _round2, _igElevIdx, IG_LEG_TOP_GAP, and the blanket
// rename that rewrote a declaration into a self-call.
//
// On the maintainer's machine you notice, because the console is open. On a
// designer's machine the button does nothing, they work around it, and the
// report arrives a week later as "the breaker pages are weird sometimes".
//
// So these checks drive REAL error events at the real window and ask what the
// user would have seen. The modal is spied on rather than stubbed away, and
// what it was handed is inspected: a notice that fires but says nothing
// actionable is the same dead end with a dialog in front of it.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

// Swallow the console noise these checks deliberately produce.
const realErr = console.error;
console.error = () => {};

const TAIL = [
  'window.__fx = {',
  '  get log() { return _frameErrors; },',
  '  get told() { return _frameErrToldUser; },',
  '  detail: _frameErrDetail,',
  '  reset: function () {',
  '    _frameErrors.length = 0;',
  '    _frameErrToldUser = false;',
  '    Object.keys(_frameErrSeen).forEach(function (k) { delete _frameErrSeen[k]; });',
  '  },',
  '  spy: function (o) {',
  '    if (o.showConfirmModal) showConfirmModal = o.showConfirmModal;',
  '    if (o.toast) _toast = o.toast;',
  '    if (o.copy) _dsCopyText = o.copy;',
  '  },',
  '  version: APP_VERSION, build: APP_BUILD,',
  '};',
].join(NL);
window.eval(APP + NL + TAIL);
const fx = window.__fx;

const modals = [];
const toasts = [];
const copied = [];
fx.spy({
  showConfirmModal: (t, b, y, n, onYes) => { modals.push({ title: t || '', body: b || '', yes: y || '', no: n || '', onYes }); },
  toast: (t, b) => { toasts.push({ title: t || '', body: b || '' }); return null; },
  copy: (text) => { copied.push(text); },
});

// Real events at the real window, so this is the wiring and not the helper.
const raise = (message, filename, lineno, colno, error) => {
  const ev = new window.ErrorEvent('error', { message, filename, lineno, colno, error });
  window.dispatchEvent(ev);
};
const reject = (reason) => {
  // jsdom does not emit unhandledrejection for a real floating rejection, so the
  // event is dispatched directly. The listener is the thing under test either way.
  const ev = new window.Event('unhandledrejection');
  ev.reason = reason;
  window.dispatchEvent(ev);
};
const reset = () => { fx.reset(); modals.length = 0; toasts.length = 0; copied.length = 0; };

// ── the bug: a ReferenceError that used to vanish ────────────────────────
check('a ReferenceError at render reaches the user instead of only the console', () => {
  reset();
  const err = new window.Error('_round2 is not defined');
  err.stack = 'ReferenceError: _round2 is not defined' + NL + '    at drawLegendBlocks (app.js:31004:9)';
  raise('Uncaught ReferenceError: _round2 is not defined', 'https://example.com/app.js', 31004, 9, err);
  if (fx.log.length !== 1) throw new Error('the error was not recorded, log has ' + fx.log.length);
  if (modals.length !== 1) throw new Error('the user was shown ' + modals.length + ' notices, expected 1');
});

check('and the notice carries what a report actually needs', () => {
  const m = modals[0];
  const all = m.title + ' ' + m.body;
  if (all.indexOf('_round2 is not defined') < 0) throw new Error('the notice does not name the fault');
  if (all.indexOf(fx.version) < 0) throw new Error('the notice does not carry the version, which is the first question asked of any report');
  if (all.indexOf(fx.build) < 0) throw new Error('the notice does not say which build');
  if (all.indexOf('app.js:31004') < 0) throw new Error('the notice does not say where it happened');
  if (all.indexOf('drawLegendBlocks') < 0) throw new Error('the stack was dropped, so the report cannot be acted on');
  if (all.toLowerCase().indexOf('save project') < 0) throw new Error('the notice does not tell the designer to save first, which is the one useful action');
});

check('Copy details puts the whole thing on the clipboard', () => {
  if (modals[0].yes.toLowerCase().indexOf('copy') < 0) throw new Error('there is no copy affordance, so the details have to be retyped');
  modals[0].onYes();
  if (copied.length !== 1) throw new Error('Copy details copied nothing');
  const t = copied[0];
  if (t.indexOf(fx.version) < 0 || t.indexOf('_round2') < 0 || t.indexOf('drawLegendBlocks') < 0) {
    throw new Error('the copied text is missing the version, the fault or the stack');
  }
});

// ── the part that keeps the app usable ───────────────────────────────────
check('the SAME fault firing again says nothing new', () => {
  // A render loop raises this sixty times a second. A modal per occurrence takes
  // the app away from the person trying to save their work.
  const before = modals.length + toasts.length;
  for (let i = 0; i < 40; i++) {
    const e = new window.Error('_round2 is not defined');
    raise('Uncaught ReferenceError: _round2 is not defined', 'https://example.com/app.js', 31004, 9, e);
  }
  if (modals.length + toasts.length !== before) throw new Error('a repeating fault raised ' + (modals.length + toasts.length - before) + ' extra notices');
});

check('but a DIFFERENT fault still gets through, on a toast', () => {
  const beforeModals = modals.length;
  const e = new window.Error('_dsPinChrome is not defined');
  raise('Uncaught ReferenceError: _dsPinChrome is not defined', 'https://example.com/app.js', 12000, 3, e);
  if (modals.length !== beforeModals) throw new Error('a second fault took the screen again');
  if (toasts.length !== 1) throw new Error('a new fault was swallowed entirely');
  if (toasts[0].body.indexOf('_dsPinChrome') < 0) throw new Error('the toast does not name the new fault');
});

check('the log is bounded, so a loop cannot eat the session', () => {
  reset();
  for (let i = 0; i < 200; i++) {
    const e = new window.Error('fault number ' + i);
    raise('fault number ' + i, 'https://example.com/app.js', i, 1, e);
  }
  if (fx.log.length > 25) throw new Error('the log grew to ' + fx.log.length + ' entries');
  if (fx.log.length < 25) throw new Error('the log is not retaining recent faults, only ' + fx.log.length);
  if (fx.log[fx.log.length - 1].message.indexOf('199') < 0) throw new Error('the log kept the oldest faults instead of the newest');
});

// ── a rejected promise, which is most of the async work in this file ─────
check('an unhandled promise rejection is reported too', () => {
  reset();
  const e = new window.Error('capture failed to settle');
  e.stack = 'Error: capture failed to settle' + NL + '    at _captureElevWithGuides (app.js:9000:5)';
  reject(e);
  if (fx.log.length !== 1) throw new Error('the rejection was not recorded');
  if (modals.length !== 1) throw new Error('the rejection was never surfaced');
  if (modals[0].body.indexOf('capture failed to settle') < 0) throw new Error('the notice does not name the rejection');
  if (fx.log[0].kind.toLowerCase().indexOf('rejection') < 0) throw new Error('a rejection is not distinguished from a throw in the log');
});

check('a rejection with no Error object still says something', () => {
  reset();
  reject('just a string');
  if (fx.log.length !== 1) throw new Error('a string rejection was dropped');
  if (modals.length !== 1 || modals[0].body.indexOf('just a string') < 0) throw new Error('a string rejection was not reported readably');
  reset();
  reject(undefined);
  if (fx.log.length !== 1) throw new Error('a rejection with no reason was dropped');
});

// ── noise that is not a fault in this app ────────────────────────────────
check('browser noise is not reported as a FRAME error', () => {
  reset();
  // A cross-origin script reports only this, with no file, line or stack, so
  // there is nothing to report and nothing to fix.
  raise('Script error.', '', 0, 0, null);
  // Every layout-heavy page raises this; it is a scheduling notice.
  raise('ResizeObserver loop completed with undelivered notifications.', 'https://example.com/app.js', 1, 1, null);
  if (fx.log.length) throw new Error('browser noise was reported to the designer as a fault');
  if (modals.length || toasts.length) throw new Error('browser noise raised a notice');
});

check('a failed image load is left to the handler that already owns it', () => {
  reset();
  // There are 20-odd img.onerror / reader.onerror handlers in this file, each
  // saying something specific about the file that failed. A generic crash box
  // on top of those would be worse than useless.
  const img = window.document.createElement('img');
  const ev = new window.ErrorEvent('error', { message: 'failed to load' });
  Object.defineProperty(ev, 'target', { value: img });
  window.dispatchEvent(ev);
  if (fx.log.length) throw new Error('a resource load failure was reported as an app crash');
});

// ── it must never become the fault itself ────────────────────────────────
check('the reporter survives a notifier that throws', () => {
  reset();
  fx.spy({ showConfirmModal: () => { throw new Error('modal is broken too'); } });
  let threw = false;
  try {
    const e = new window.Error('something broke');
    raise('something broke', 'https://example.com/app.js', 5, 5, e);
  } catch (e) { threw = true; }
  fx.spy({ showConfirmModal: (t, b, y, n, onYes) => { modals.push({ title: t || '', body: b || '', yes: y || '', no: n || '', onYes }); } });
  if (threw) throw new Error('a broken notifier escapes out of the error handler');
  if (fx.log.length !== 1) throw new Error('the fault was not logged when the notifier failed');
});

check('both halves are actually registered at module scope', () => {
  // Source-level, because the behavioural checks above would also pass if the
  // listeners were attached from some init path a headless render never runs.
  const i = APP.indexOf('function _frameReportError');
  if (i < 0) throw new Error('missing _frameReportError');
  const reg = APP.slice(i, APP.indexOf('// HELP MODAL'));
  if (reg.indexOf("addEventListener('error'") < 0) throw new Error('the error listener is not registered');
  if (reg.indexOf("addEventListener('unhandledrejection'") < 0) throw new Error('the rejection listener is not registered');
  // It has to be wired BEFORE the app boots, or a fault during init is the one
  // class of error nobody hears about.
  const boot = APP.lastIndexOf('initMasterApp();');
  if (boot < 0) throw new Error('missing the boot call');
  if (APP.indexOf("addEventListener('unhandledrejection'") > boot) throw new Error('the listeners are registered after the app boots');
});

console.error = realErr;
results.forEach(r => console.log((r.ok ? 'OK:   ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
const bad = results.filter(r => !r.ok);
console.log('');
console.log('--- Summary ---');
if (bad.length) { console.log('FAILED (' + bad.length + ' of ' + results.length + ')'); process.exitCode = 1; }
else console.log('ALL PASSED (' + results.length + ')');
