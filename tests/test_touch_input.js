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

check('the dashboard row handler reads the CLICK (why a tap needs _touchClickMods)', () => {
  if (APP.indexOf("tr.addEventListener('click', (ev) => {") < 0) throw new Error('row selection moved off click: recheck _touchClickMods');
  if (APP.indexOf("window.addEventListener('click', _touchClickMods, true);") < 0) throw new Error('the click fixer is not installed');
});
check('both exports unfold a folded wall panel and fold it back', () => {
  if (APP.split('const _sbRestore = _elevSidebarUnfoldForExport();').length - 1 !== 2) throw new Error('an export does not unfold the sidebar');
  if (APP.split('        _sbRestore();').length - 1 !== 2) throw new Error('an export does not restore the sidebar');
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
    // ── 19.19 ──
    await ok('a latched modifier rides on every synthetic mouse event, and lets go when tapped off', () => {
      const el = document.createElement('div'); host.appendChild(el);
      const seen = [];
      el.addEventListener('mousedown', (e) => {
        seen.push([e.shiftKey, e.ctrlKey, e.metaKey, e.altKey].join());
        const mv = (m) => seen.push('m' + [m.shiftKey, m.altKey].join());
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      _touchKeyPress('shift'); _touchKeyPress('ctrl'); _touchKeyPress('alt');
      touch('touchstart', el, 0, 0); touch('touchmove', el, 20, 0); touch('touchend', el, 20, 0);
      _touchKeyPress('shift'); _touchKeyPress('ctrl'); _touchKeyPress('alt');
      touch('touchstart', el, 0, 0); touch('touchend', el, 0, 0);
      if (seen[0] !== 'true,true,true,true') throw new Error('mousedown carried ' + seen[0]);
      if (seen[1] !== 'mtrue,true') throw new Error('mousemove carried ' + seen[1]);
      if (seen[2] !== 'false,false,false,false') throw new Error('still latched after tapping off: ' + seen[2]);
    });

    await ok('the key bar: four keys, latches light, Delete sends the Delete key, its presses stay on the bar', () => {
      _touchKeysBuild();
      const bar = document.getElementById('touchKeys');
      if (!bar || bar.querySelectorAll('.touch-key').length !== 4) throw new Error('bar not built with four keys');
      const sh = bar.querySelector('[data-key="shift"]');
      sh.click();
      if (!sh.classList.contains('active') || sh.getAttribute('aria-pressed') !== 'true' || !_touchMods.shift) throw new Error('Shift did not latch visibly');
      sh.click();
      if (sh.classList.contains('active') || _touchMods.shift) throw new Error('Shift did not release');
      let keys = [], downs = 0;
      const kd = (e) => keys.push(e.key), md = () => downs++;
      document.addEventListener('keydown', kd); document.addEventListener('mousedown', md);
      bar.querySelector('[data-key="del"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      bar.querySelector('[data-key="del"]').click();
      document.removeEventListener('keydown', kd); document.removeEventListener('mousedown', md);
      if (keys.join() !== 'Delete') throw new Error('Delete sent ' + JSON.stringify(keys));
      if (downs) throw new Error('a press on the bar reached the page (it would clear the selection Delete is for)');
    });

    await ok('Delete leaves a focused text field alone', () => {
      const inp = document.createElement('input'); host.appendChild(inp); inp.focus();
      let n = 0; const kd = () => n++;
      document.addEventListener('keydown', kd);
      _touchKeyPress('del');
      document.removeEventListener('keydown', kd);
      inp.remove();
      if (n) throw new Error('Delete fired while typing in a field');
    });

    await ok('a finger just off a small handle grabs the handle; a big resize box is never a magnet', () => {
      const box = document.createElement('div'); host.appendChild(box);
      const handle = document.createElement('div');
      handle.style.cssText = 'position:absolute; width:8px; height:8px; cursor:nwse-resize;';
      box.appendChild(handle);
      const big = document.createElement('div'); big.style.cssText = 'cursor:ew-resize;'; host.appendChild(big);
      handle.getBoundingClientRect = () => ({ left: 100, top: 100, right: 108, bottom: 108, width: 8, height: 8 });
      big.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 });
      box.getBoundingClientRect = () => ({ left: 0, top: 0, right: 104, bottom: 104, width: 104, height: 104 });
      const efp = document.elementFromPoint;
      document.elementFromPoint = (x, y) => (x >= 100 && x <= 108 && y >= 100 && y <= 108) ? handle : box;
      let got = '';
      handle.addEventListener('mousedown', () => { got = 'handle'; });
      box.addEventListener('mousedown', (e) => { if (!got) got = 'box'; });
      try {
        touch('touchstart', box, 118, 116); touch('touchend', box, 118, 116);   // 10px off the corner
        if (got !== 'handle') throw new Error('near miss went to ' + got);
        got = '';
        touch('touchstart', box, 60, 60); touch('touchend', box, 60, 60);       // far away
        if (got !== 'box') throw new Error('a far touch was pulled to ' + got);
        // Covered by something else (a dialog): not a magnet.
        document.elementFromPoint = () => box;
        got = '';
        touch('touchstart', box, 112, 112); touch('touchend', box, 112, 112);
        if (got !== 'box') throw new Error('a hidden handle was grabbed');
      } finally { document.elementFromPoint = efp; }
    });

    await ok('the dashboard preview column stands aside when it cannot fit, and the choice is kept', () => {
      const iw = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      const setW = (w) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
      try {
        setW(1024);
        applyDashViewMode(true);
        if (document.getElementById('dashPreviewCol')) throw new Error('THE BUG: the column squeezes the table at 1024px');
        if (!_dashWantMode2) throw new Error('the saved choice was dropped');
        if (document.body.classList.contains('dash-view-2')) throw new Error('mode-2 class left on');
        setW(1440);
        applyDashViewMode(_dashWantMode2);
        if (!document.getElementById('dashPreviewCol')) throw new Error('the column did not come back with room');
      } finally { if (iw) Object.defineProperty(window, 'innerWidth', iw); else setW(1024); applyDashViewMode(false); }
    });

    await ok('the wall list folds by a CLASS (exports restore style.display) and is remembered', () => {
      const rail = document.getElementById('elev-wall-rail');
      const before = rail.classList.contains('collapsed');
      toggleElevRail();
      if (rail.classList.contains('collapsed') === before) throw new Error('did not fold');
      if (rail.style.display) throw new Error('fold wrote an inline display');
      if (localStorage.getItem('elevRailCollapsed') !== (before ? '0' : '1')) throw new Error('not remembered');
      toggleElevRail();
      if (rail.classList.contains('collapsed') !== before) throw new Error('did not unfold');
    });
    // ── 19.20 ──
    await ok('EXACT BUG: a tap with Shift latched reaches a click handler as a Shift-click (dashboard range select)', () => {
      const el = document.createElement('div'); host.appendChild(el);
      const got = [];
      el.addEventListener('click', (e) => got.push(e.shiftKey + '/' + e.ctrlKey));
      _touchMods.shift = true; _touchCompatUntil = Date.now() + 500;
      const fake = { isTrusted: true, target: el, shiftKey: false, ctrlKey: false, altKey: false, detail: 1, clientX: 1, clientY: 1, screenX: 1, screenY: 1,
        stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
      _touchClickMods(fake);
      _touchMods.shift = false; _touchCompatUntil = 0;
      if (!fake.stopped || !fake.prevented) throw new Error('the plain click was not replaced');
      if (got.join() !== 'true/false') throw new Error('handler saw ' + got.join());
      // Nothing latched: the real click passes untouched (file pickers, links).
      const plain = Object.assign({}, fake, { stopped: false, stopImmediatePropagation() { this.stopped = true; } });
      _touchCompatUntil = Date.now() + 500; _touchClickMods(plain); _touchCompatUntil = 0;
      if (plain.stopped) throw new Error('a click with nothing latched was replaced');
    });

    await ok('a key is a TAP-to-latch or a HOLD-while-used', () => {
      _touchMods.shift = false;
      _touchKeyDown('shift'); _touchKeyUp('shift');
      if (!_touchMods.shift) throw new Error('a quick tap did not latch');
      _touchKeyDown('shift'); _touchKeyUp('shift');
      if (_touchMods.shift) throw new Error('a second tap did not release');
      _touchKeyDown('shift');
      if (!_touchMods.shift) throw new Error('not on while held');
      _touchMarkHeldUsed();          // the other hand dragged meanwhile
      _touchKeyUp('shift');
      if (_touchMods.shift) throw new Error('a used hold stayed on after release');
    });

    await ok('a finger on the controller does not end the one-finger drag on the page', () => {
      _touchKeysBuild();
      const key = document.querySelector('#touchKeys [data-key="shift"]');
      const { el, log } = mkDrag();
      touch('touchstart', el, 0, 0);
      touch('touchmove', el, 10, 0);
      // The thumb lands on Shift: touches now holds both fingers.
      const ev = new Event('touchstart', { bubbles: true, cancelable: true });
      const a = { identifier: 1, clientX: 10, clientY: 0, target: el }, b = { identifier: 9, clientX: 5, clientY: 5, target: key };
      Object.defineProperty(ev, 'touches', { value: [a, b] });
      Object.defineProperty(ev, 'changedTouches', { value: [b] });
      key.dispatchEvent(ev);
      touch('touchmove', el, 30, 0);
      touch('touchend', el, 30, 0);
      _touchKeyUp('shift', true); _touchMods.shift = false;
      if (log.join('|') !== 'down:0,0:1|move:10,0:1|move:30,0:1|up:30,0') throw new Error('got ' + log.join('|'));
    });

    await ok('joystick directions: dead zone, four ways and diagonals', () => {
      const d = (x, y) => _touchStickDirs(x, y).join('');
      if (d(3, 3) !== '') throw new Error('dead zone moved');
      if (d(30, 0) !== 'r' || d(-30, 2) !== 'l' || d(0, -30) !== 'u' || d(1, 30) !== 'd') throw new Error('four ways wrong');
      if (d(20, -20) !== 'ru') throw new Error('diagonal is ' + d(20, -20));
      if (!(_touchStickDelay(TOUCH_STICK_R, 0) < _touchStickDelay(TOUCH_STICK_DEAD + 1, 0))) throw new Error('a full push is not faster');
    });

    await ok('holding the joystick repeats arrow keys (Shift rides along) and stops on release', async () => {
      _touchKeysBuild();
      const stick = document.querySelector('#touchKeys .touch-stick');
      stick.getBoundingClientRect = () => ({ left: 0, top: 0, width: 90, height: 90, right: 90, bottom: 90 });
      const keys = [];
      const kd = (e) => keys.push(e.key + (e.shiftKey ? '+S' : ''));
      document.addEventListener('keydown', kd);
      _touchMods.shift = true;
      touch('touchstart', stick, 45 + 34, 45, 4);
      await new Promise(r => setTimeout(r, 300));
      touch('touchend', stick, 45 + 34, 45, 4);
      const n = keys.length;
      await new Promise(r => setTimeout(r, 200));
      document.removeEventListener('keydown', kd);
      _touchMods.shift = false;
      if (n < 3) throw new Error('only ' + n + ' steps in 300ms at a full push');
      if (keys.some(k => k !== 'ArrowRight+S')) throw new Error('sent ' + keys.join());
      if (keys.length !== n) throw new Error('kept nudging after release');
    });

    await ok('one joystick push is ONE undo entry', () => {
      const base = { b: 1 };
      const saved = undoStack.slice();
      undoStack.length = 0; undoStack.push({ old: 1 }, base);
      const s = { base };
      for (let i = 0; i < 5; i++) { undoStack.push({ step: i }); _touchStickFoldHistory(s); }
      const ok1 = undoStack.length === 3 && undoStack[1] === base && undoStack[2].step === 4;
      undoStack.length = 0; saved.forEach(x => undoStack.push(x));
      if (!ok1) throw new Error('stack is ' + JSON.stringify(undoStack));
    });

    await ok('folding the item table makes room for the preview column at 1024px', () => {
      const iw = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      try {
        _dashTableApply(false);
        if (_dashColumnFits()) throw new Error('fits with the table open at 1024?');
        toggleDashTable();
        if (!_dashTableFolded() || localStorage.getItem('dashTableFolded') !== '1') throw new Error('did not fold / not remembered');
        if (!_dashColumnFits()) throw new Error('THE ASK: still no room with the table folded');
        if (_dashTableFloor() !== DASH_TABLE_FOLDED_W) throw new Error('the picture still budgets the open table');
        toggleDashTable();
        if (_dashTableFolded()) throw new Error('did not unfold');
      } finally { if (iw) Object.defineProperty(window, 'innerWidth', iw); applyDashViewMode(false); }
    });

    await ok('on a touch screen the form is four tabs; Frame shows only the frame section', () => {
      _dashTabsInit();
      const bar = document.getElementById('dashFormTabs');
      if (!bar || bar.querySelectorAll('.frame-tab').length !== 4) throw new Error('no four-tab strip');
      if (!bar.classList.contains('frame-tabs')) throw new Error('not the shared .frame-tabs strip');
      setDashFormTab('frame');
      const pane = document.getElementById('dashRightPane');
      if (pane.dataset.dtabOn !== 'frame') throw new Error('tab not recorded');
      if (document.getElementById('frameStyleSection').dataset.dtab !== 'frame') throw new Error('frame section not tagged frame');
      if (document.getElementById('matWrapper').dataset.dtab !== 'mat') throw new Error('mat not tagged');
      if (document.getElementById('sec-notes').dataset.dtab !== 'notes') throw new Error('notes not tagged');
      const itemKids = Array.from(document.getElementById('sec-meta').children).filter(c => c.id !== 'frameStyleSection');
      if (!itemKids.length || itemKids.some(c => c.dataset.dtab !== 'item')) throw new Error('item fields not tagged item');
      if (!bar.querySelector('[data-dtab-btn="frame"]').classList.contains('active')) throw new Error('active tab not lit');
      setDashFormTab('bogus');
      if (pane.dataset.dtabOn !== 'item') throw new Error('an unknown tab did not fall back to Item');
    });

    await ok('the wall panel folds by a class, and an export unfolds it for its duration', () => {
      const sb = document.querySelector('#view-elevation .elev-sidebar');
      toggleElevSidebar();
      if (!sb.classList.contains('collapsed') || sb.style.display) throw new Error('did not fold by class');
      const restore = _elevSidebarUnfoldForExport();
      if (sb.classList.contains('collapsed')) throw new Error('still folded during the export');
      restore();
      if (!sb.classList.contains('collapsed')) throw new Error('not folded again after');
      toggleElevSidebar();
      if (sb.classList.contains('collapsed')) throw new Error('did not unfold');
      if (localStorage.getItem('elevSidebarCollapsed') !== '0') throw new Error('not remembered');
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
