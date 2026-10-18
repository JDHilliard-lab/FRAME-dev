// 19.23: iPHONE. Portrait to work, landscape to look.
// A phone (touch screen under PHONE_MAX_W wide, or under PHONE_MAX_H tall when turned)
// gets html.phone (+ html.phone-land sideways) and a few built elements: a bottom tab
// bar, a more menu, the dashboard's list-then-detail screens, the deck's page bar and
// All pages sheet, a folded controller. Everything else is CSS on those classes over
// the desktop views. These checks drive the real code with a stubbed screen.
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

check('the phone layer is installed at module scope, ahead of boot', () => {
  const at = APP.indexOf(NL + '_phoneInit();');
  const boot = APP.lastIndexOf(NL + 'initMasterApp();');
  if (at < 0 || boot < 0 || at > boot) throw new Error('_phoneInit() not at module scope before initMasterApp');
});
check('landscape hides the menus on Walls and Deck only, never on Items', () => {
  if (CSS.indexOf('html.phone-land:not([data-phone-view="dashboard"]) .app-top-nav') < 0) throw new Error('landscape header rule is not scoped away from Items');
  if (CSS.indexOf('html.phone-land .app-top-nav') >= 0) throw new Error('an unscoped landscape rule hides the header everywhere');
});
check('the shell stops above the tab bar and uses the real screen height', () => {
  if (CSS.indexOf('html.phone #appShell { height: 100dvh !important;') < 0) throw new Error('100vh on iOS runs under the Safari toolbar');
  if (HTML.indexOf('<div id="appShell"') < 0) throw new Error('#appShell missing');
  if (HTML.indexOf('id="dsPagesRow"') < 0) throw new Error('#dsPagesRow missing');
});
check('the Walls panel on a phone is one scroll with every section its natural height', () => {
  if (CSS.indexOf('html.phone #view-elevation .elev-sidebar > * { flex: none !important; }') < 0) throw new Error('flex:1 sections collapse to nothing inside a scrolling panel');
});

check('the Project tab shows no page preview on a touch screen; a phone stacks one column', () => {
  if (CSS.indexOf('html.touch #dsProjRight { display: none !important; }') < 0) throw new Error('preview not dropped on touch screens');
  if (CSS.indexOf('html.phone #dsProjCols { flex-direction: column;') < 0) throw new Error('phone Project tab not one column');
});
check('the wall area holds off the browser pinch on touch screens', () => {
  if (CSS.indexOf('html.touch #scrollArea { touch-action: none; }') < 0) throw new Error('no touch-action:none on the wall');
  if (APP.indexOf("['gesturestart', 'gesturechange']") < 0) throw new Error('Safari gesture events not held off');
});
check('the frame browser on a phone is three across (five sideways)', () => {
  if (CSS.indexOf('html.phone #frameBrowser .fb-grid { grid-template-columns: repeat(3, minmax(0, 1fr));') < 0) throw new Error('not 3 across');
  if (CSS.indexOf('html.phone-land #frameBrowser .fb-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }') < 0) throw new Error('not 5 sideways');
});

check('frame swatches on a phone pin the corner photo to the box (Safari drew it cropped)', () => {
  if (CSS.indexOf('html.phone #frameBrowser .fb-pic img { position: absolute; inset: 0; width: 100%; height: 100%;') < 0) throw new Error('swatch photo still sized by percentage max-height');
});

check('Import offers New items from photos on every device', () => {
  if (APP.indexOf("{ label: 'New items from photos…', hint: 'one new item per picture', onClick: () => dashNewFromPhotos() }") < 0) throw new Error('not in the Import menu');
});

function inApp() {
  window.__phoneDone = (async () => {
    const out = [];
    const ok = async (label, fn) => { try { await fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
    const screen = (w, h, coarse) => {
      window.__coarse = coarse;
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
    };
    const R = document.documentElement;

    await ok('desktop and iPad never become a phone', () => {
      screen(1920, 1080, false); _phoneApply(true);
      if (R.classList.contains('phone')) throw new Error('a mouse desktop went phone');
      screen(1180, 820, true); _phoneApply(true);
      if (R.classList.contains('phone')) throw new Error('an iPad in landscape went phone');
      screen(820, 1180, true); _phoneApply(true);
      if (R.classList.contains('phone')) throw new Error('an iPad in portrait went phone');
      screen(390, 844, false); _phoneApply(true);
      if (R.classList.contains('phone')) throw new Error('a narrow DESKTOP window went phone (no touch)');
    });

    await ok('an iPhone in portrait is a phone; turned, it is phone-land', () => {
      screen(390, 844, true); _phoneApply(true);
      if (!R.classList.contains('phone') || R.classList.contains('phone-land')) throw new Error('portrait classes: ' + R.className);
      screen(844, 390, true); _phoneApply(true);
      if (!R.classList.contains('phone') || !R.classList.contains('phone-land')) throw new Error('landscape classes: ' + R.className);
      screen(390, 844, true); _phoneApply(true);
    });

    await ok('the bottom tab bar switches views and lights the current one', () => {
      // Three VIEW tabs (19.24 added Controls beside them, which is not a view).
      const tabs = document.querySelectorAll('#phoneTabBar .phone-tab[data-view]');
      if (tabs.length !== 3) throw new Error(tabs.length + ' view tabs');
      document.querySelector('#phoneTabBar [data-view="elevation"]').click();
      if (currentView !== 'elevation') throw new Error('tab did not switch: ' + currentView);
      if (!document.querySelector('#phoneTabBar [data-view="elevation"]').classList.contains('active')) throw new Error('Walls not lit');
      if (R.getAttribute('data-phone-view') !== 'elevation') throw new Error('data-phone-view not kept');
      document.querySelector('#phoneTabBar [data-view="dashboard"]').click();
    });

    await ok('Items: tapping a row opens that item; the back bar returns to the list', async () => {
      const r2 = _cloneData(dashProjectData[0]); r2.id = 'ART.9'; dashProjectData.push(r2);
      renderDashTable();
      const rows = document.querySelectorAll('#rfiTable tbody tr');
      const td = rows[rows.length - 1].querySelector('td');
      td.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 10));
      const v = document.getElementById('view-dashboard');
      if (!v.classList.contains('phone-detail')) throw new Error('no detail screen after a row tap');
      if (document.getElementById('phoneDashTitle').textContent !== 'ART.9') throw new Error('title is ' + document.getElementById('phoneDashTitle').textContent);
      document.querySelector('#phoneDashBack button').click();
      if (v.classList.contains('phone-detail')) throw new Error('back did not return to the list');
    });

    await ok('Items: with Shift on, a row tap builds the selection and stays on the list', async () => {
      _touchMods.shift = true;
      try {
        const td = document.querySelector('#rfiTable tbody tr td');
        td.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        await new Promise(r => setTimeout(r, 10));
      } finally { _touchMods.shift = false; }
      if (document.getElementById('view-dashboard').classList.contains('phone-detail')) throw new Error('a Shift tap left the list');
    });

    await ok('Deck: the page bar steps within the deck and says where you are', () => {
      _dsPages = [{ kind: 'fixed', fixed: 'cover' }, { kind: 'fixed', fixed: 'slogan' }, { kind: 'fixed', fixed: 'thanks' }];
      const real = _dsSelectPage; const went = [];
      _dsSelectPage = (i) => { went.push(i); _dsIndex = i; _phoneDeckBarSync(); };
      try {
        _dsIndex = 0; _phoneDeckBarSync();
        if (document.getElementById('phoneDeckNum').textContent !== '1 / 3') throw new Error('reads ' + document.getElementById('phoneDeckNum').textContent);
        const [prev, next] = document.querySelectorAll('#phoneDeckBar .phone-pg-btn');
        if (!prev.disabled) throw new Error('previous enabled on page 1');
        _phoneDeckStep(1); _phoneDeckStep(1); _phoneDeckStep(1);
        if (went.join() !== '1,2') throw new Error('stepped ' + went.join() + ' (must stop at the last page)');
        if (!next.disabled) throw new Error('next enabled on the last page');
      } finally { _dsSelectPage = real; }
    });

    await ok('Deck: All pages opens the page list as a sheet; Done closes it', () => {
      document.getElementById('phoneDeckAll').click();
      const rail = document.getElementById('dsRail');
      if (!rail.classList.contains('phone-sheet') || !R.classList.contains('phone-sheet-open')) throw new Error('sheet did not open');
      document.getElementById('phoneRailClose').click();
      if (rail.classList.contains('phone-sheet') || R.classList.contains('phone-sheet-open')) throw new Error('Done did not close it');
    });

    await ok('Deck: picking a page in the sheet closes it', async () => {
      const rail = document.getElementById('dsRail');
      _phoneRailSheet(true);
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', 'k'); rail.appendChild(cell);
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 10));
      cell.remove();
      if (rail.classList.contains('phone-sheet')) throw new Error('sheet stayed open after picking a page');
    });

    await ok('the more menu carries what the compact header leaves out', () => {
      const labels = [];
      const real = _frameMenu; _frameMenu = (a, items) => items.forEach(i => i.label && labels.push(i.label));
      try { openPhoneMenu(document.getElementById('phoneMoreBtn')); } finally { _frameMenu = real; }
      ['Open project...', 'Settings', 'Help'].forEach(l => { if (labels.indexOf(l) < 0) throw new Error('missing ' + l); });
      if (!document.getElementById('phoneMoreBtn')) throw new Error('no more button in the header');
    });

    await ok('the controller starts hidden on a phone and the tab bar Controls shows it (19.24)', () => {
      _touchKeysBuild();
      _phoneBuild();
      const pad = document.getElementById('touchKeys');
      const tab = document.getElementById('phoneTabPad');
      if (!tab) throw new Error('no Controls button in the tab bar');
      if (!pad.classList.contains('collapsed')) throw new Error('not hidden to start');
      if (pad.querySelector('.touch-pad-toggle')) throw new Error('the floating fold button is back (it covered buttons)');
      tab.click();
      if (pad.classList.contains('collapsed') || !tab.classList.contains('active')) throw new Error('Controls did not show it');
      tab.click();
      if (!pad.classList.contains('collapsed') || tab.classList.contains('active')) throw new Error('Controls did not hide it');
    });

    await ok('Deck: Generate PDF and Approval live under one menu on a phone (19.24)', () => {
      const mb = document.getElementById('phoneDeckMenuBtn');
      if (!mb) throw new Error('no deck menu button');
      const items = [];
      const real = _frameMenu; _frameMenu = (a, list) => list.forEach(i => items.push(i));
      try { openPhoneDeckMenu(mb); } finally { _frameMenu = real; }
      const gen = items.find(i => i.label === 'Generate PDF...');
      if (!gen) throw new Error('no Generate PDF in the menu');
      let opened = false; const rg = _dsOpenGenerate; _dsOpenGenerate = () => { opened = true; };
      try { gen.onClick(); } finally { _dsOpenGenerate = rg; }
      if (!opened) throw new Error('Generate PDF item does not open the generator');
      if (!items.find(i => i.label === 'Approval stamp')) throw new Error('no Approval in the menu');
    });

    await ok('All pages sheet: cells zoom to the phone width (19.24)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      _phoneRailSheet(true);
      const z = parseFloat(document.getElementById('dsRail').style.getPropertyValue('--rail-zoom'));
      _phoneRailSheet(false);
      if (!(z > 1.8 && z < 2.1)) throw new Error('zoom ' + z + ' for a 390px phone');
    });

    await ok('Frame browser on a phone: lists in a drawer named after the list, filters folded, picking a list closes it (19.24)', async () => {
      openFrameBrowser();
      const menu = document.getElementById('fbMenuBtn'), flt = document.getElementById('fbFilterBtn');
      if (!menu || !flt) throw new Error('phone buttons missing');
      const card = document.querySelector('#frameBrowser .fb-card');
      menu.click();
      if (!card.classList.contains('side-open')) throw new Error('drawer did not open');
      const src = document.querySelector('#fbSide .fb-src[data-fb-src="project"]');
      src.click();
      await new Promise(r => setTimeout(r, 20));
      if (card.classList.contains('side-open')) throw new Error('picking a list left the drawer open');
      if (document.getElementById('fbMenuLabel').textContent.indexOf('Project') < 0) throw new Error('label reads ' + document.getElementById('fbMenuLabel').textContent);
      flt.click();
      if (!document.getElementById('fbTop').classList.contains('filters-open')) throw new Error('Filters did not open');
      _fbClose();
    });

    await ok('pinch on the wall zooms the wall, about the fingers, not the app (19.24)', () => {
      switchView('elevation');
      const ws = document.getElementById('scrollArea');
      const z0 = elevZoomFactor;
      const t = (id, x) => ({ identifier: id, clientX: x, clientY: 100, target: ws });
      const fire = (type, touches, changed) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: touches });
        Object.defineProperty(ev, 'changedTouches', { value: changed });
        ws.dispatchEvent(ev); return ev;
      };
      fire('touchstart', [t(1, 100)], [t(1, 100)]);
      fire('touchstart', [t(1, 100), t(2, 140)], [t(2, 140)]);
      const mv = fire('touchmove', [t(1, 80), t(2, 160)], [t(1, 80), t(2, 160)]);
      fire('touchend', [], [t(1, 80), t(2, 160)]);
      const z = elevZoomFactor;
      elevZoomFactor = z0; drawElevAll();
      if (Math.abs(z - z0 * 2) > 0.01) throw new Error('fingers spread 2x, zoom went ' + z0 + ' -> ' + z);
      if (!mv.defaultPrevented) throw new Error('the browser would zoom the whole app');
      if (document.getElementById('zoomSlider').value !== String(Math.round(z * 10) / 10)) throw new Error('slider not following');
      if (_touchPinch) throw new Error('pinch left open after the fingers lifted');
    });

    await ok('pinch outside the wall is left to the browser', () => {
      const z0 = elevZoomFactor;
      const el = document.getElementById('phoneTabBar');
      const t = (id, x) => ({ identifier: id, clientX: x, clientY: 10, target: el });
      const fire = (type, touches, changed) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: touches });
        Object.defineProperty(ev, 'changedTouches', { value: changed });
        el.dispatchEvent(ev);
      };
      fire('touchstart', [t(1, 10)], [t(1, 10)]);
      fire('touchstart', [t(1, 10), t(2, 50)], [t(2, 50)]);
      fire('touchmove', [t(1, 0), t(2, 90)], [t(1, 0), t(2, 90)]);
      fire('touchend', [], [t(1, 0), t(2, 90)]);
      if (elevZoomFactor !== z0) throw new Error('a pinch on the tab bar zoomed the wall');
    });

    // ── 19.25 ──
    await ok('Deck on a phone: the tool dock rides in the page bar above the page, and goes home after', () => {
      _dsDockPlace('left');
      const dock = document.getElementById('dsToolDock');
      if (dock.parentNode.id !== 'phoneDeckTools') throw new Error('dock is in ' + dock.parentNode.id);
      if (dock.classList.contains('vert')) throw new Error('dock still vertical in the bar');
      if (document.getElementById('dsDockLeftSlot').style.display !== 'none') throw new Error('the empty side slot still shows');
    });

    await ok('the breaker / layout header is unpinned on a phone (it covered the choices)', () => {
      if (CSS_SRC.indexOf('html.phone .ds-tools-sticky { position: static !important; }') < 0) throw new Error('no phone unpin rule');
      if (APP_SRC.indexOf("head.className = 'ds-tools-sticky';") < 0) throw new Error('the pinned header has no class to unpin');
    });

    await ok('the frame grid builds a screenful at a time and adds more on scroll (all frames lagged)', () => {
      const obs = [];
      const realIO = window.IntersectionObserver;
      window.IntersectionObserver = function (cb) { this.cb = cb; this.els = []; obs.push(this); };
      window.IntersectionObserver.prototype.observe = function (el) { this.els.push(el); };
      window.IntersectionObserver.prototype.disconnect = function () {};
      try {
        _fbState.src = 'all';
        const rec = (n) => ({ code: 'X-' + n, item: { code: 'X-' + n, corner: 'c.png' } });
        const all = []; for (let i = 0; i < 300; i++) all.push(rec(i));
        const byCode = {}; all.forEach(r => { byCode[r.code] = r; });
        const realCards = _fbCards;
        _fbCards = () => [{ head: 'All', cards: all.map(r => ({ code: r.code, rec: r })) }];
        const grid = document.createElement('div'); grid.id = 'fbGrid'; document.body.appendChild(grid);
        const foot = document.createElement('div'); foot.id = 'fbFoot'; document.body.appendChild(foot);
        let n1, n2, n3;
        try {
          _fbRenderGrid(all, byCode);
          n1 = grid.querySelectorAll('.fb-frame').length;
          obs[0].cb([{ isIntersecting: true }]);
          n2 = grid.querySelectorAll('.fb-frame').length;
          obs[0].cb([{ isIntersecting: true }]); obs[0].cb([{ isIntersecting: true }]);
          n3 = grid.querySelectorAll('.fb-frame').length;
        } finally { _fbCards = realCards; grid.remove(); foot.remove(); }
        if (n1 !== FB_CHUNK) throw new Error('first build made ' + n1 + ' cards');
        if (n2 !== FB_CHUNK * 2) throw new Error('scrolling added ' + (n2 - n1));
        if (n3 !== 300) throw new Error('rows ran out at ' + n3 + ' of 300');
      } finally { window.IntersectionObserver = realIO; }
    });

    // ── 19.26 ──
    const tfire = (el, type, x, y, id) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      const t = { identifier: id || 1, clientX: x, clientY: y, screenX: x, screenY: y, target: el };
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] });
      Object.defineProperty(ev, 'changedTouches', { value: [t] });
      el.dispatchEvent(ev); return ev;
    };
    const swipeOn = (el, dx, dy) => {
      tfire(el, 'touchstart', 200, 300);
      const m = tfire(el, 'touchmove', 200 + dx / 2, 300 + dy / 2);
      tfire(el, 'touchmove', 200 + dx, 300 + dy);
      tfire(el, 'touchend', 200 + dx, 300 + dy);
      return m;
    };

    await ok('EXACT ASK: a sideways swipe across the empty wall flips to the next / previous wall', () => {
      const w2 = _cloneData(elevations[0]); w2.id = _elevNewId(); w2.name = 'Wall B'; w2.frames = []; elevations.push(w2);
      switchView('elevation', 0);
      const wall = document.getElementById('wall');
      const m = swipeOn(wall, -120, 6);
      if (currentElevIndex !== 1) throw new Error('swipe left stayed on wall ' + currentElevIndex);
      if (!m.defaultPrevented) throw new Error('the swipe was not held from the page');
      swipeOn(document.getElementById('wall'), 120, 0);
      if (currentElevIndex !== 0) throw new Error('swipe right went to ' + currentElevIndex);
    });

    await ok('a swipe that starts on a frame drags the frame and flips nothing', () => {
      switchView('elevation', 0);
      const el = document.createElement('div'); el.className = 'frame-vis'; document.getElementById('frame-layer').appendChild(el);
      let pressed = 0; el.addEventListener('mousedown', () => pressed++);
      swipeOn(el, -120, 0);
      el.remove();
      if (currentElevIndex !== 0) throw new Error('a drag on a frame flipped the wall');
      if (pressed !== 1) throw new Error('the frame was pressed ' + pressed + ' times');
    });

    await ok('an up-down move on the wall is the ordinary gesture, and a tap is still a tap', () => {
      switchView('elevation', 0);
      const wall = document.getElementById('wall');
      let downs = 0, ups = 0;
      const d = () => downs++, u = () => ups++;
      wall.addEventListener('mousedown', d); document.addEventListener('mouseup', u);
      swipeOn(wall, 4, 120);
      tfire(wall, 'touchstart', 50, 50); tfire(wall, 'touchend', 50, 50);
      wall.removeEventListener('mousedown', d); document.removeEventListener('mouseup', u);
      if (currentElevIndex !== 0) throw new Error('a vertical move flipped walls');
      if (downs !== 2 || ups !== 2) throw new Error('presses ' + downs + ' / releases ' + ups + ' (want 2 / 2)');
    });

    await ok('no swipe while a drawing tool is armed (the measure tool draws by dragging)', () => {
      switchView('elevation', 0);
      lineToolActive = true;
      try { swipeOn(document.getElementById('wall'), -120, 0); } finally { lineToolActive = false; }
      if (currentElevIndex !== 0) throw new Error('flipped walls with the measure tool armed');
      elevations.pop(); switchView('elevation', 0);
    });

    await ok('deck: a swipe across the page background flips the page; never on a floor plan page', () => {
      switchView('deck');
      const c = document.getElementById('dsCenter');
      const cv = document.createElement('canvas'); c.appendChild(cv);
      _dsPages = [{ kind: 'fixed', fixed: 'cover' }, { kind: 'fixed', fixed: 'slogan' }, { kind: 'floorplan', level: 0 }];
      const real = _dsSelectPage; const went = [];
      _dsSelectPage = (i) => { went.push(i); _dsIndex = i; };
      try {
        _dsIndex = 0; swipeOn(cv, -120, 0);
        if (went.join() !== '1') throw new Error('swipe left went ' + went.join());
        _dsIndex = 2; swipeOn(cv, 120, 0);
        if (went.join() !== '1') throw new Error('a floor plan page flipped: ' + went.join());
      } finally { _dsSelectPage = real; cv.remove(); }
    });

    // The project here has a GAP in its numbering on purpose (ART.9 from an earlier check):
    // the first new item is minted as ART.10 and renumbered at once, which lost its picture.
    await ok('EXACT ASK: photos become new items, each with its picture, and the first opens', async () => {
      switchView('dashboard');
      const before = dashProjectData.length;
      const realP = processArtworkFile;
      processArtworkFile = (f, cb) => cb('data:image/png;base64,' + f.name, f.name.replace('.jpg', ''), 800, 600);
      let codes;
      try {
        codes = await new Promise(ok => _dashItemsFromFiles([{ name: 'a.jpg' }, { name: 'b.jpg' }], ok));
      } finally { processArtworkFile = realP; }
      if (dashProjectData.length !== before + 2) throw new Error((dashProjectData.length - before) + ' items made');
      const rows = codes.map(c => dashProjectData.find(r => r.id === c));
      if (!rows[0] || rows[0].artworkFile !== 'a' || rows[1].artworkFile !== 'b') throw new Error('pictures went ' + rows.map(r => r && r.artworkFile).join(',') + ' codes ' + codes.join(',') + ' all ' + dashProjectData.map(r => r.id + '=' + (r.artworkFile||'')).join(' '));
      if (dashProjectData[dashSelectedRowIndex].id !== codes[0]) throw new Error('the first new item is not the one open');
      // The finding marker is gone again: nothing temporary rides into the project file.
      if (dashProjectData.some(r => Object.keys(r).some(k => k.indexOf('_photoNew') === 0))) throw new Error('a temporary marker was left on a row');
      if (!document.getElementById('view-dashboard').classList.contains('phone-detail')) throw new Error('its settings did not open on the phone');
      if (!document.getElementById('phoneSnapBtn')) throw new Error('no camera button on the phone');
    });

    await ok('leaving phone size takes the classes off (an iPad rotating, a resize)', () => {
      screen(1180, 820, true); _phoneApply(false);
      if (R.classList.contains('phone') || R.classList.contains('phone-land')) throw new Error('classes left on: ' + R.className);
    });
    return out;
  })();
}

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.__coarse = false;
window.matchMedia = (q) => ({ matches: q.indexOf('coarse') >= 0 ? !!window.__coarse : false, addListener() {}, removeListener() {} });
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s || '').length * 4 }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
global.window = window; global.document = window.document; global.navigator = window.navigator;
const q = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
(async () => {
  try {
    window.APP_SRC = APP; window.CSS_SRC = CSS;
    window.eval(APP + NL + '_autosaveToldUser = true; var APP_SRC = window.APP_SRC, CSS_SRC = window.CSS_SRC;' + NL + '(' + inApp.toString() + ')();');
    (await window.__phoneDone).forEach(r => results.push(r));
  } catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
  console.error = q; console.warn = w;
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  setTimeout(() => process.exit(fail ? 1 : 0), 50);
})();
