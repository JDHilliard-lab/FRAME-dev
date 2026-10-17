// 19.18: A FINGER DRIVES THE MOUSE HANDLERS.
// Reported: on an iPad nothing could be dragged. Every drag in app.js is a mousedown
// handler that registers mousemove/mouseup on the document; iOS turns a tap into a click
// but a finger drag only scrolls and never sends mousemove. _touchInstall turns the
// finger into those mouse events, deciding drag vs scroll by whether the mousedown
// handler ARMED a drag. These checks fire real touch events through the installed layer.
// No regex: patterns written into a test file here lose their backslashes.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

check('the layer is installed at module scope, ahead of initMasterApp', () => {
  const at = APP.indexOf(NL + '_touchInstall();');
  const boot = APP.lastIndexOf(NL + 'initMasterApp();');
  if (at < 0) throw new Error('_touchInstall() is not called at module scope');
  if (boot < 0 || at > boot) throw new Error('installed after boot');
});
check('touchmove is NOT passive (a drag must be able to stop the scroll)', () => {
  if (APP.indexOf("addEventListener('touchmove', _touchMove, { capture: true, passive: false })") < 0)
    throw new Error('touchmove listener is passive or not in capture phase');
});
check('the CSS half: no double-tap zoom, no callout on surfaces, hover controls shown', () => {
  if (CSS.indexOf('html { touch-action: manipulation; }') < 0) throw new Error('double-tap zoom not disabled');
  if (CSS.indexOf('-webkit-touch-callout: none') < 0) throw new Error('no callout suppression');
  const hv = CSS.indexOf('@media (hover: none)');
  if (hv < 0) throw new Error('no hover-less block');
  const blk = CSS.slice(hv, CSS.indexOf('}' , CSS.indexOf('.tab-close', hv)) + 1);
  ['.fb-more', '.art-tools', '.ds-insstrip > button'].forEach(s => {
    if (blk.indexOf(s) < 0) throw new Error(s + ' stays hidden without a mouse');
  });
});

function inApp() {
  window.__touchDone = (async () => {
    const out = [];
    const ok = async (label, fn) => { try { await fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const touch = (type, target, x, y, id) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      const t = { identifier: id || 1, clientX: x, clientY: y, screenX: x, screenY: y, target };
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : [t] });
      Object.defineProperty(ev, 'changedTouches', { value: [t] });
      target.dispatchEvent(ev);
      return ev;
    };
    // A drag exactly as app.js writes them.
    const mkDrag = () => {
      const el = document.createElement('div');
      const log = [];
      el.addEventListener('mousedown', (e) => {
        log.push('down:' + e.clientX + ',' + e.clientY + ':' + e.buttons);
        const mv = (m) => log.push('move:' + m.clientX + ',' + m.clientY + ':' + m.buttons);
        const up = (u) => { log.push('up:' + u.clientX + ',' + u.clientY); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
      host.appendChild(el);
      return { el, log };
    };

    await ok('EXACT BUG: a finger drag reaches the drag handler as down, moves and up', () => {
      const { el, log } = mkDrag();
      touch('touchstart', el, 10, 10);
      const m1 = touch('touchmove', el, 30, 15);
      touch('touchmove', el, 60, 40);
      touch('touchend', el, 60, 40);
      const want = ['down:10,10:1', 'move:30,15:1', 'move:60,40:1', 'up:60,40'];
      if (log.join('|') !== want.join('|')) throw new Error('got ' + log.join('|'));
      if (!m1.defaultPrevented) throw new Error('the page would scroll under the drag');
    });

    await ok('a drag survives its element being redrawn away (drawElevAll rebuilds frames per move)', () => {
      const { el, log } = mkDrag();
      touch('touchstart', el, 0, 0);
      touch('touchmove', el, 10, 0);
      el.remove();   // the redraw: later touches go to a node that no longer reaches window
      touch('touchmove', el, 20, 0);
      touch('touchmove', el, 30, 0);
      touch('touchend', el, 30, 0);
      const want = ['down:0,0:1', 'move:10,0:1', 'move:20,0:1', 'move:30,0:1', 'up:30,0'];
      if (log.join('|') !== want.join('|')) throw new Error('got ' + log.join('|'));
    });

    await ok('an event reaching both window and the element counts once', () => {
      const { el, log } = mkDrag();
      touch('touchstart', el, 0, 0);
      touch('touchmove', el, 15, 0);
      touch('touchend', el, 15, 0);
      if (log.filter(s => s.indexOf('move:') === 0).length !== 1) throw new Error('got ' + log.join('|'));
      if (log.filter(s => s.indexOf('up:') === 0).length !== 1) throw new Error('mouseup sent twice: ' + log.join('|'));
    });

    await ok('document.onmousemove assignment counts as arming a drag', () => {
      const el = document.createElement('div'); host.appendChild(el);
      const log = [];
      el.onmousedown = () => { document.onmousemove = (m) => log.push(m.clientX); document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; log.push('up'); }; };
      touch('touchstart', el, 0, 0);
      const m = touch('touchmove', el, 50, 0);
      touch('touchend', el, 50, 0);
      if (log.join(',') !== '50,up') throw new Error('got ' + log.join(','));
      if (!m.defaultPrevented) throw new Error('scroll not stopped');
    });

    await ok('a touch on something with no drag scrolls natively and still gets its mouseup', () => {
      const el = document.createElement('button'); host.appendChild(el);
      const log = [];
      el.addEventListener('mousedown', () => log.push('down'));
      el.addEventListener('mouseup', () => log.push('up'));
      el.addEventListener('mousemove', () => log.push('move'));
      touch('touchstart', el, 5, 5);
      const m = touch('touchmove', el, 5, 80);
      touch('touchend', el, 5, 80);
      if (m.defaultPrevented) throw new Error('a plain touch blocked scrolling');
      if (log.join(',') !== 'down,up') throw new Error('got ' + log.join(','));
    });

    await ok('form controls are left to the browser', () => {
      const inp = document.createElement('input'); host.appendChild(inp);
      let n = 0; inp.addEventListener('mousedown', () => n++);
      touch('touchstart', inp, 1, 1); touch('touchend', inp, 1, 1);
      if (n) throw new Error('a synthetic mousedown was sent to an input');
    });

    await ok('inside a scrolling list, a quick swipe scrolls and the drag closes in place', () => {
      const list = document.createElement('div'); list.style.overflowY = 'auto';
      Object.defineProperty(list, 'scrollHeight', { value: 900 });
      Object.defineProperty(list, 'clientHeight', { value: 200 });
      host.appendChild(list);
      const { el, log } = mkDrag(); list.appendChild(el);
      touch('touchstart', el, 10, 10);
      const m = touch('touchmove', el, 10, 60);
      touch('touchmove', el, 10, 120);
      touch('touchend', el, 10, 120);
      if (m.defaultPrevented) throw new Error('the swipe was stopped from scrolling');
      if (log.join('|') !== 'down:10,10:1|up:10,10') throw new Error('got ' + log.join('|'));
    });

    await ok('inside a scrolling list, a press and hold becomes the drag', async () => {
      const list = document.createElement('div'); list.style.overflowY = 'auto';
      Object.defineProperty(list, 'scrollHeight', { value: 900 });
      Object.defineProperty(list, 'clientHeight', { value: 200 });
      host.appendChild(list);
      const { el, log } = mkDrag(); list.appendChild(el);
      touch('touchstart', el, 10, 10);
      await new Promise(r => setTimeout(r, TOUCH_HOLD_MS + 60));
      const m = touch('touchmove', el, 10, 60);
      touch('touchend', el, 10, 60);
      if (!m.defaultPrevented) throw new Error('held drag still scrolls');
      if (log.join('|') !== 'down:10,10:1|move:10,60:1|up:10,60') throw new Error('got ' + log.join('|'));
    });

    await ok('a drawing surface drags at once even when it overflows', () => {
      const surf = document.createElement('div'); surf.id = 'dsCenter'; surf.style.overflow = 'auto';
      Object.defineProperty(surf, 'scrollHeight', { value: 900 });
      Object.defineProperty(surf, 'clientHeight', { value: 200 });
      host.appendChild(surf);
      const { el, log } = mkDrag(); surf.appendChild(el);
      touch('touchstart', el, 0, 0);
      const m = touch('touchmove', el, 0, 40);
      touch('touchend', el, 0, 40);
      if (!m.defaultPrevented || log.length !== 3) throw new Error('got ' + log.join('|'));
      surf.remove();
    });

    await ok('a double tap is a dblclick', async () => {
      const el = document.createElement('div'); host.appendChild(el);
      let n = 0; el.addEventListener('dblclick', () => n++);
      touch('touchstart', el, 20, 20); touch('touchend', el, 20, 20);
      touch('touchstart', el, 22, 21); touch('touchend', el, 22, 21);
      await new Promise(r => setTimeout(r, 10));
      if (n !== 1) throw new Error('dblclick fired ' + n + ' times');
    });

    await ok('a second finger lets go of the one-finger drag', () => {
      const { el, log } = mkDrag();
      touch('touchstart', el, 0, 0);
      const ev = new Event('touchstart', { bubbles: true, cancelable: true });
      const a = { identifier: 1, clientX: 0, clientY: 0 }, b = { identifier: 2, clientX: 50, clientY: 50 };
      Object.defineProperty(ev, 'touches', { value: [a, b] });
      Object.defineProperty(ev, 'changedTouches', { value: [b] });
      el.dispatchEvent(ev);
      if (log[log.length - 1].indexOf('up:') !== 0) throw new Error('drag left open: ' + log.join('|'));
      touch('touchmove', el, 90, 90, 1);
      if (log.length !== 2) throw new Error('moves still forwarded after the pinch began');
    });

    await ok('iOS compatibility mouse events after a touch are swallowed; real mouse is not', () => {
      const fake = (trusted) => ({ isTrusted: trusted, cancelable: true, stopped: false, prevented: false,
        stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } });
      _touchCompatUntil = Date.now() + 500;
      const a = fake(true); _touchSwallowCompat(a);
      if (!a.stopped) throw new Error('compat mousedown got through: every tap would press twice');
      const b = fake(false); _touchSwallowCompat(b);
      if (b.stopped) throw new Error('our own synthetic event was swallowed');
      _touchCompatUntil = 0;
      const c = fake(true); _touchSwallowCompat(c);
      if (c.stopped) throw new Error('a real mouse (no recent touch) was swallowed');
    });

    await ok('the addEventListener watch is removed after each touch', () => {
      const before = EventTarget.prototype.addEventListener;
      const { el } = mkDrag();
      touch('touchstart', el, 0, 0); touch('touchend', el, 0, 0);
      if (EventTarget.prototype.addEventListener !== before) throw new Error('prototype left patched');
    });
    host.remove();
    return out;
  })();
}

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s || '').length * 4 }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
global.window = window; global.document = window.document; global.navigator = window.navigator;
const q = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
(async () => {
  try {
    window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();');
    (await window.__touchDone).forEach(r => results.push(r));
  } catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
  console.error = q; console.warn = w;
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  setTimeout(() => process.exit(fail ? 1 : 0), 50);
})();
