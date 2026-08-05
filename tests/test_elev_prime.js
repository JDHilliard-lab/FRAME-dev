// Two reported bugs, one cause.
//
// 1. THE FLASHING. "I'm still getting that flashing back and forth to Deck Studio
//    and elevation light theme like it's building out the image in elevations then
//    jumping back to Deck Studio to place it, and it's doing that multiple times."
//    An elevation can only be captured IN the Elevations tab, so
//    _captureElevWithGuides switches there and back. It was called from inside
//    whatever render happened to need a capture — one page at a time — so a deck
//    with N breakers made N round trips, each one rebuilding the whole studio on the
//    way back, with nothing on screen to say why.
//
// 2. THE CONFLICT. "The build-all preview for the page thumbnails is conflicting with
//    the middle preview button, especially when it is building the elevation breaker
//    pages." _thumbPump holds _igNoCapture for the life of EVERY thumbnail job (a
//    background render must never steal the view). Clicking Preview during that meant
//    the render saw captures suppressed and drew the "Hit Build" placeholder — the
//    exact thing Preview exists to replace.
//
// The fix is one batch pass, _elevPrimeCaptures: capture every wall the deck needs
// ONCE, behind a modal that says so, restore the view ONCE, and let every later
// render be a cache read. So there is nothing left to interleave.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      const p = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }));
      __chain = p.then(() => {});
      window.__asyncChecks.push(p);
    };
    const S = window.__appSrc, H = window.__appHtml;
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};

    const __seed = (n) => {
      elevations = [];
      for (let i = 0; i < (n || 3); i++) {
        elevations.push({ name: 'Wall ' + i, wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [],
          frames: [{ letter: 'A', id: 'P' + i, x: 20, y: 40, w: 30, h: 24, active: true }] });
      }
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      dimVisibility = {}; annotationStyle = {};
      for (const k in _igCapCache) delete _igCapCache[k];
      _igNoCapture = false; lineToolActive = false;
      _exportSettle = async () => {};
    };

    // ── 1. The flashing: the visible view is never left at all ──
    __checkAsync('EXACT BUG: capturing elevations no longer changes the visible view, once or otherwise', async () => {
      __seed(4);
      switchView('deck');
      const realSwitch = switchView;
      let switches = [];
      switchView = (v, i) => { switches.push(v); return realSwitch(v, i); };
      exportElevSVG = async () => null;   // the capture's own machinery is not under test
      try {
        await _elevPrimeCaptures([0, 1, 2, 3]);
        if (switches.length) throw new Error('THE BUG: the batch still switched views (' + switches.join(',') + ') — that is the flashing in the video. The portal exists so it never has to.');
        if (currentView !== 'deck') throw new Error('ended on ' + currentView + ' instead of staying on the deck');
        if (!document.getElementById('view-deck').classList.contains('active')) throw new Error('#view-deck lost .active, so the studio was torn down after all');
      } finally { switchView = realSwitch; }
    });

    __checkAsync('the elevation view is laid out OFF SCREEN while capturing, then put back', async () => {
      __seed(2);
      switchView('deck');
      const host = document.getElementById('view-elevation');
      let sawPortal = false, sawSized = false, wasActive = null;
      _captureElevWithGuides = async (idx) => {
        sawPortal = sawPortal || host.classList.contains('elev-portal');
        sawSized = sawSized || (!!host.style.width && !!host.style.height);
        wasActive = host.classList.contains('active');
        return { dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400 };
      };
      await _elevPrimeCaptures([0, 1]);
      if (!sawPortal) throw new Error('the elevation view was never portalled, so it can only have been captured by switching to it');
      if (wasActive) throw new Error('the elevation view was made the ACTIVE view — that is the jump, portal or not');
      // A display:none view measures 0, which is the whole reason the old code had to
      // switch. The portal must therefore carry a real box.
      if (!sawSized) throw new Error('the portal has no explicit size, so the workspace measures its fallback and the fitted scale can differ from what the Elevations tab shows');
      if (host.classList.contains('elev-portal')) throw new Error('the portal was left up after the batch');
      if (host.style.width || host.style.height) throw new Error('the inline size was left behind, so a later resize leaves the real view pinned to a stale box');
    });

    __check('the capture switches walls in place instead of switching views', () => {
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('// Template-driven single-spec page', i));
      // Comment lines stripped: the comment explains what it USED to do.
      const code = body.split('\\n').filter(l => !/^\\s*\\/\\//.test(l)).join('\\n');
      if (/switchView\\(/.test(code)) throw new Error('the capture still calls switchView, so it still yanks the visible view around');
      if (body.indexOf('_elevPortalOpen()') < 0) throw new Error('the capture does not open the off-screen portal');
      if (body.indexOf('_elevLoadWall(elevIdx)') < 0) throw new Error('the capture does not load the wall directly');
      // The per-wall restore is skipped inside a batch, or N walls cost N redraws.
      if (body.indexOf('if (!_elevPrimeActive) {') < 0) throw new Error('the capture restores the wall per call even inside a batch');
    });

    __check('the portal is ref-counted, so a batch lays the view out once for N walls', () => {
      if (typeof _elevPortalOpen !== 'function' || typeof _elevPortalClose !== 'function') throw new Error('the portal helpers are missing');
      const host = document.getElementById('view-elevation');
      host.classList.remove('active');
      if (!_elevPortalOpen()) throw new Error('the portal refused to open for a hidden elevation view');
      if (!_elevPortalOpen()) throw new Error('a nested open failed');
      _elevPortalClose();
      if (!host.classList.contains('elev-portal')) throw new Error('an inner close took the portal down under the batch still using it');
      _elevPortalClose();
      if (host.classList.contains('elev-portal')) throw new Error('the last close did not take the portal down');
    });

    __check('there is nothing to portal when the Elevations tab is already the visible view', () => {
      const host = document.getElementById('view-elevation');
      host.classList.add('elev-portal');   // prove it is not left behind
      _elevPortalClose();
      host.classList.add('active');
      try {
        if (_elevPortalOpen() !== false) throw new Error('it portalled the view the user is looking at, which would yank the drawing off screen');
      } finally { host.classList.remove('active'); }
    });

    __check('the portal rule is off-screen and out of flow', () => {
      const m = /\\.view-container\\.elev-portal\\s*\\{([^}]*)\\}/.exec(window.__appCss);
      if (!m) throw new Error('no .elev-portal rule in style.css');
      const rule = m[1];
      if (!/position:\\s*fixed/.test(rule)) throw new Error('the portal is in flow, so the visible view reflows around it while capturing');
      if (!/left:\\s*-\\d{4,}px/.test(rule)) throw new Error('the portal is not parked off screen');
      if (!/display:\\s*flex/.test(rule)) throw new Error('the portal is not laid out, so every measurement comes back 0 — the exact reason the old code had to switch views');
      if (/visibility:\\s*hidden|opacity:\\s*0/.test(rule)) throw new Error('visibility/opacity hiding either kills the layout boxes or leaks into the SVG export');
    });

    __check('the restore skip is a module flag, not a parameter — every caller gets an identical capture', () => {
      if (_captureElevWithGuides.length !== 1) throw new Error('arity is ' + _captureElevWithGuides.length + '; a per-caller override is back and a page could disagree with the editor');
    });

    __checkAsync('the batch is covered by a modal that names what it is doing', async () => {
      __seed(2);
      const ov = document.getElementById('elevPrimeOverlay');
      if (!ov) throw new Error('#elevPrimeOverlay is missing from index.html — the view switching would be visible and unexplained');
      let sawShown = false, sawLabel = '';
      _captureElevWithGuides = async (idx) => {
        sawShown = sawShown || (ov.style.display === 'flex');
        sawLabel = (document.getElementById('elevPrimeLabel') || {}).textContent || '';
        return { dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400 };
      };
      await _elevPrimeCaptures([0, 1]);
      if (!sawShown) throw new Error('the overlay was not up while capturing, so the flashing is merely uncovered');
      if (!/of 2/.test(sawLabel)) throw new Error('no per-wall progress in the label: ' + JSON.stringify(sawLabel));
      if (ov.style.display !== 'none') throw new Error('the overlay was left up after the batch finished');
    });

    __check('the overlay carries the ids the progress code drives, above every other layer', () => {
      ['elevPrimeOverlay', 'elevPrimeLabel', 'elevPrimeBar', 'elevPrimePct', 'elevPrimeCount', 'elevPrimeCancelBtn'].forEach(id => {
        if (!document.getElementById(id)) throw new Error('missing #' + id);
      });
      // The deck's own preview modal is 100002; a scrim under it leaves a hole
      // exactly where the flashing shows.
      const m = /id="elevPrimeOverlay"[^>]*z-index:(\\d+)/.exec(H);
      if (!m) throw new Error('no z-index on the overlay');
      if (parseInt(m[1], 10) <= 100002) throw new Error('z-index ' + m[1] + ' sits under the deck preview modal');
    });

    // ── 2. The conflict: Preview vs the rail ──
    __check('EXACT BUG: Preview drops the rail queue instead of drawing the placeholder', () => {
      const i = S.indexOf('async function _dsBuildPage');
      const body = S.slice(i, S.indexOf('function _dsClearBuilt', i));
      if (body.indexOf('_thumbQueue = []') < 0) throw new Error('THE BUG: Preview still runs alongside the thumbnail queue, which holds _igNoCapture, so a breaker previews as the "Hit Build" placeholder');
      if (body.indexOf('_thumbRunToken++') < 0) throw new Error('the in-flight thumbnail job is not invalidated, so its result can land on top');
      if (body.indexOf('_dsBuildAllThumbs()') < 0) throw new Error('the rail is never put back to work after the Preview');
      // ...and only for a real click: the 700ms auto-refresh must not restart the
      // whole rail build on every nudge.
      if (body.indexOf('!silent &&') < 0) throw new Error('the auto-refresh also drops the queue, so a busy rail would never finish');
    });

    __check('Preview does not restore a stale snapshot of the capture-suppression flag', () => {
      const i = S.indexOf('async function _dsBuildPage');
      const body = S.slice(i, S.indexOf('function _dsClearBuilt', i));
      // _igNoCapture means "a thumbnail job is in flight", so _thumbBusy is the live
      // answer. Restoring a snapshot taken while one WAS in flight strands it true,
      // after which nothing may ever capture again.
      if (body.indexOf('_igNoCapture = _thumbBusy;') < 0) throw new Error('the flag is snapshotted and restored, which can strand it true');
    });

    __check('a page render will not start its own capture while a batch owns the view', () => {
      // 16.44: the guard moved out of _drawInstallGuidePage into the shared
      // _igElevCapture, so the flat-graphic sheet gets it too rather than needing its
      // own copy. Both suppressors still have to be there, and both page renderers
      // still have to go through it — a direct _captureElevWithGuides call from a page
      // would sidestep the guard entirely.
      const i = S.indexOf('async function _igElevCapture');
      if (i < 0) throw new Error('_igElevCapture is gone — the suppressors have no home');
      const body = S.slice(i, S.indexOf('\\n}', i));
      if (body.indexOf('!_igNoCapture && !_elevPrimeActive') < 0) throw new Error('a page render can still capture mid-batch and fight the batch for the view');
      ['async function _drawInstallGuidePage', 'async function _drawFlatGraphicSpecPage'].forEach(sig => {
        const j = S.indexOf(sig);
        if (j < 0) throw new Error('cannot find ' + sig);
        const rb = S.slice(j, j + 40000);
        if (rb.indexOf('_igElevCapture(') < 0) throw new Error(sig + ' bypasses the shared capture guard');
      });
    });

    __checkAsync('Preview captures its own elevation up front, so nothing is left to capture mid-render', async () => {
      __seed(2);
      _dsPages = [{ kind: 'spec', type: 'install', _install: true, _elevIdx: 1, _specTpl: 'installGuide', _ovKey: 'elev:1', row: {}, elev: elevations[1] }];
      _dsIndex = 0;
      let primed = [];
      _captureElevWithGuides = async (idx) => { primed.push(idx); return { dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400 }; };
      renderDeckPageCanvas = async () => null;   // the render itself is not what's under test
      await _dsBuildPage(true);
      if (primed.join(',') !== '1') throw new Error('expected the page\\'s own wall (1) to be captured first; got [' + primed.join(',') + ']');
    });

    // ── The build-all button: prime first, thumbnails second ──
    __check('EXACT REQUEST: the explicit build primes the elevations, the automatic sweep does not', () => {
      const i = S.indexOf('function _dsBuildAllThumbs(');
      const body = S.slice(i, S.indexOf('function _dsCancelBuildAll', i));
      if (body.indexOf('opts.prime') < 0) throw new Error('the build-all has no priming phase, so breaker thumbnails stay placeholders until something else captures');
      if (body.indexOf('_elevPrimeCaptures(') < 0) throw new Error('phase 1 does not run the batch');
      // The 1.5s post-edit sweep calls it with no options — a modal that appears by
      // itself after you type is worse than a placeholder.
      const auto = S.indexOf('_dsBuildAllThumbs(); } catch (e) {} }, 1500)');
      if (auto < 0) throw new Error('the automatic sweep now passes options; it must not prime');
      const btn = S.indexOf('buildBtn.onclick');
      if (S.slice(btn, btn + 120).indexOf('{ prime: true }') < 0) throw new Error('the Build all previews button does not prime');
    });

    __checkAsync('phase 2 does not start off the back of a cancelled phase 1', async () => {
      __seed(3);
      _dsPages = elevations.map((e, i) => ({ kind: 'spec', type: 'install', _install: true, _elevIdx: i, _specTpl: 'installGuide', _ovKey: 'elev:' + i, row: {}, elev: e }));
      _dsThumbCache = {}; _thumbQueue = []; _thumbBusy = false; _dsBuildAllActive = false;
      let queued = false;
      const realQueue = _dsQueueAllThumbs;
      _dsQueueAllThumbs = () => { queued = true; };
      _captureElevWithGuides = async (idx) => { _elevPrimeCancel(); return { dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400 }; };
      try {
        _dsBuildAllThumbs({ prime: true });
        await new Promise(r => setTimeout(r, 30));
        if (queued) throw new Error('cancelling the elevation pass rolled straight into the thumbnail build anyway');
        if (Object.keys(_igCapCache).length !== 1) throw new Error('the walls captured before the stop should stay cached so a second Build resumes; got ' + Object.keys(_igCapCache).length);
      } finally { _dsQueueAllThumbs = realQueue; }
    });

    __check('the button reports the elevation phase, and cannot be clicked twice into it', () => {
      const i = S.indexOf('function _dsSyncBuildAllUI');
      const body = S.slice(i, S.indexOf('function _dsUpdateThumbProgress', i));
      if (body.indexOf('_elevPrimeActive') < 0) throw new Error('the button re-enables itself mid-prime (the thumbnail queue is empty then), so a second click starts a second batch');
      const g = S.indexOf('function _dsBuildAllThumbs(');
      if (S.slice(g, g + 200).indexOf('_elevPrimeActive') < 0) throw new Error('_dsBuildAllThumbs does not refuse to run while a batch is in flight');
    });

    // ── The key: priming is only useful if it writes what the renderer reads ──
    __check('the capture key has ONE definition, shared by the renderer and the batch', () => {
      if (typeof _igCapKey !== 'function') throw new Error('_igCapKey is missing');
      if (S.indexOf('const capKey = _igCapKey(') < 0) throw new Error('the page renderer builds its own key, so priming fills entries nothing reads');
      const i = S.indexOf('function _elevPrimeJobs');
      const body = S.slice(i, S.indexOf('function _elevPrimeShow', i));
      if (body.indexOf('_igCapKey(i)') < 0) throw new Error('the batch names its entries some other way');
    });

    __check('the key reads no state that depends on which view is active', () => {
      // The batch computes every key BEFORE it starts switching walls, so that the
      // string still matches when a deck-side render asks for it later.
      const i = S.indexOf('function _igGuideStamp');
      const body = S.slice(i, S.indexOf('function _igCapKey', i));
      if (/classList\\.contains|\\.active|currentView/.test(body)) throw new Error('the guide stamp reads the active view, so a key computed in the Elevations tab would not match one computed in the Deck tab');
    });

    __checkAsync('a primed wall means the page renderer captures nothing', async () => {
      __seed(2);
      const key = _igCapKey(1);
      _captureElevWithGuides = async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400 });
      await _elevPrimeCaptures([1]);
      if (!_igCapCache[key]) throw new Error('the batch did not write the key the renderer will ask for');
      // Second run: nothing left to do, so no capture and no overlay.
      let calls = 0;
      _captureElevWithGuides = async () => { calls++; return { dataUrl: 'x', w: 1, h: 1 }; };
      const done = await _elevPrimeCaptures([1]);
      if (calls !== 0 || done !== 0) throw new Error('a cached wall was captured again (' + calls + ' calls) — the batch is not idempotent, so every Build would re-render everything');
    });

    __check('a real elevation change still invalidates a primed capture', () => {
      __seed(2);
      pushHistory();
      const before = _igCapKey(0);
      elevations[0].frames[0].x = 99;
      pushHistory();
      if (_igCapKey(0) === before) throw new Error('moving a frame did not change the key, so the deck would show a stale drawing — worse than being slow');
    });

    // ── Which wall does a page need? ──
    __check('_dsPageElevIdx resolves breakers, install pages and per-piece install layouts', () => {
      __seed(3);
      dashProjectData = [{ id: 'P2', location: 'Lobby' }];
      if (_dsPageElevIdx({ kind: 'spec', _install: true, _elevIdx: 2, row: {} }) !== 2) throw new Error('breaker/install page not resolved by _elevIdx');
      if (_dsPageElevIdx({ kind: 'spec', _install: true, row: {}, elev: { _idx: 1 } }) !== 1) throw new Error('page not resolved by elev._idx');
      // Per-piece page on the installGuide template: the renderer finds the wall by
      // frame id, so this must too.
      if (_dsPageElevIdx({ kind: 'spec', _install: true, _specTpl: 'installGuide', row: { id: 'P2' } }) !== 2) throw new Error('per-piece installGuide page not resolved by frame id');
      // An ordinary spec page draws no elevation and must not be primed for one.
      if (_dsPageElevIdx({ kind: 'spec', _specTpl: 'classic', row: { id: 'P2' } }) !== -1) throw new Error('an ordinary spec page claimed an elevation');
      if (_dsPageElevIdx({ kind: 'layout', page: {} }) !== -1) throw new Error('a layout page claimed an elevation');
    });

    __check('_dsDeckElevIdxs collects each wall once, in page order', () => {
      __seed(3);
      _dsPages = [
        { kind: 'spec', _install: true, _elevIdx: 2, row: {}, _specTpl: 'installGuide' },
        { kind: 'spec', _install: true, _elevIdx: 0, row: {}, _specTpl: 'installGuide' },
        { kind: 'spec', _install: true, _elevIdx: 2, row: {}, _specTpl: 'installGuide' }
      ];
      const got = _dsDeckElevIdxs().join(',');
      if (got !== '2,0') throw new Error('expected 2,0 (deduped, in order); got ' + got);
    });

    // ── Cancel ──
    __checkAsync('cancel stops between walls and keeps what it already captured', async () => {
      __seed(4);
      let calls = 0;
      _captureElevWithGuides = async (idx) => {
        calls++;
        if (calls === 2) _elevPrimeCancel();
        return { dataUrl: 'data:image/jpeg;base64,AAAA', w: 800, h: 400 };
      };
      const done = await _elevPrimeCaptures([0, 1, 2, 3]);
      if (calls !== 2) throw new Error('cancel did not stop the loop; ' + calls + ' walls captured');
      if (done !== 2) throw new Error('the walls captured before the stop were thrown away (' + done + ')');
      if (_elevPrimeActive) throw new Error('the batch is still flagged active after a cancel, which would block every later one');
      const ov = document.getElementById('elevPrimeOverlay');
      if (ov.style.display !== 'none') throw new Error('the overlay stayed up after a cancel');
    });

    __check('a PDF cancel is not swallowed by the batch', () => {
      // _captureElevWithGuides is where a PDF build checks for a cancel, and it
      // signals by THROWING. A blanket catch here would turn Cancel into "carry on".
      const i = S.indexOf('async function _elevPrimeCaptures');
      const body = S.slice(i, S.indexOf('function _dsPageElevIdx', i));
      if (body.indexOf('_pdfWasCancelError') < 0) throw new Error('the batch swallows every throw, including the cancel sentinel');
    });

    __checkAsync('the batch will not steal the view while the measure tool is in use', async () => {
      __seed(2);
      lineToolActive = true;
      let calls = 0;
      _captureElevWithGuides = async () => { calls++; return { dataUrl: 'x', w: 1, h: 1 }; };
      const done = await _elevPrimeCaptures([0, 1]);
      lineToolActive = false;
      if (calls !== 0 || done !== 0) throw new Error('a batch started mid-measure and pulled the view out from under the tool');
    });

    __check('the theme flips once for the whole batch, not once per wall', () => {
      const i = S.indexOf('async function _elevPrimeCaptures');
      const body = S.slice(i, S.indexOf('function _dsPageElevIdx', i));
      if (body.indexOf('_pushElevLightTheme') < 0 || body.indexOf('_popElevLightTheme') < 0) throw new Error('the batch does not hold the light theme, so each capture flips it and the panels strobe');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\nwindow.__appCss = ' + JSON.stringify(cssSrc) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
