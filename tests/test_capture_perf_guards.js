// REPORTED: "my computer kind of slows down while using FRAME, and it really
// freezes if I click Generate PDF before the preview builder is done."
//
// Two independent causes, both in the elevation-capture path.
//
// 1. THE FREEZE — two captures at once. There is exactly ONE elevation DOM. A
//    capture loads a wall into it, pins the export padding, hides the rail, forces
//    the zoom, walks the whole tree into a multi-megabyte SVG string (artwork
//    included), rasterizes it, and puts all of that back. Two of those interleaved
//    corrupt each other's restore and hold both giant strings at once.
//    The existing flag guards could not stop it: Generate PDF deliberately forces
//    _igNoCapture OFF so a busy rail cannot blank its breaker pages — which is
//    exactly the moment an already-in-flight thumbnail render is still running and
//    now free to capture too. Hence a guard on the capture itself.
//
// 2. THE SLOWDOWN — an unbounded cache. _igCapCache is keyed on _elevCapGen, so
//    every elevation edit mints a new key and the previous entry becomes
//    permanently unreachable. Nothing evicted it: the cache was only emptied
//    wholesale on a guide change or a project load. An afternoon of nudging frames
//    left hundreds of megabytes of dead captures behind.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
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
    const S = window.__appSrc;
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};

    const __seed = (n) => {
      elevations = [];
      for (let i = 0; i < (n || 3); i++) {
        elevations.push({ name: 'W' + i, wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [],
          frames: [{ letter: 'A', id: 'P' + i, x: 20, y: 40, w: 30, h: 24, active: true }] });
      }
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      dimVisibility = {}; annotationStyle = annotationStyle || {};
      for (const k in _igCapCache) delete _igCapCache[k];
      _igNoCapture = false; lineToolActive = false;
      _exportSettle = async () => {};
    };

    // ── 1. Never two captures at once ──
    __checkAsync('EXACT BUG: a second capture cannot start while one is running', async () => {
      __seed(2);
      let running = 0, maxRunning = 0;
      // Stand in for the expensive innards, and hold the "capture" open across an
      // await so a second call has a real chance to interleave.
      exportElevSVG = async () => {
        running++; maxRunning = Math.max(maxRunning, running);
        await new Promise(r => setTimeout(r, 15));
        running--;
        return null;
      };
      await Promise.all([_captureElevWithGuides(0), _captureElevWithGuides(1)]);
      if (maxRunning > 1) throw new Error('THE BUG: ' + maxRunning + ' captures ran at once — they fight over the single elevation DOM and hold a multi-megabyte SVG each, which is the freeze');
    });

    __checkAsync('the loser returns null rather than a half-built capture', async () => {
      __seed(2);
      exportElevSVG = async () => { await new Promise(r => setTimeout(r, 15)); return null; };
      const [a, b] = await Promise.all([_captureElevWithGuides(0), _captureElevWithGuides(1)]);
      // null marks the page incomplete, so nothing caches it and it renders again
      // later. Anything else would be a page built from another wall's state.
      if (a !== null || b !== null) throw new Error('a capture returned something other than null when it could not run');
    });

    __checkAsync('the guard clears, so a later capture is not blocked forever', async () => {
      __seed(1);
      exportElevSVG = async () => { throw new Error('boom'); };   // even on failure
      await _captureElevWithGuides(0);
      let reached = false;
      exportElevSVG = async () => { reached = true; return null; };
      await _captureElevWithGuides(0);
      if (!reached) throw new Error('the in-flight flag was left set after a failed capture — nothing can ever capture again');
    });

    __check('the guard is on the capture itself, not only on the caller flags', () => {
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('// Template-driven single-spec page', i));
      if (body.indexOf('_elevCapInFlight') < 0) throw new Error('no re-entrancy guard');
      // It must be released in a finally, or one throw wedges the app.
      const g = body.indexOf('_elevCapInFlight = true');
      const fin = body.indexOf('finally', g);
      const clear = body.indexOf('_elevCapInFlight = false', g);
      if (!(fin > 0 && clear > fin)) throw new Error('the guard is not released in a finally; a thrown capture would block every later one');
      // And AFTER the cancel checkpoint, or a cancel during a busy moment is missed.
      if (!(body.indexOf('_pdfCheckCancel') < g)) throw new Error('the guard runs before the cancel check');
    });

    __check('the export still forces captures on, but restores from the LIVE state', () => {
      const i = S.indexOf('async function exportSpecPagePDF');
      const body = S.slice(i, S.indexOf('PDF build progress overlay', i));
      // Restoring the snapshot alone strands the flag: it was read while a thumb job
      // may have been in flight, and that job clears the flag on its own way out.
      if (body.indexOf('_igNoCapture = _prevNoCap && _thumbBusy;') < 0) throw new Error('the export restores a stale snapshot, which can leave captures suppressed for the rest of the session');
    });

    // ── 2. The cache is bounded ──
    __check('EXACT BUG: the capture cache does not grow without bound', () => {
      __seed(3);
      if (typeof _igCapCacheSet !== 'function') throw new Error('there is no bounded write path');
      const limit = _igCapCacheLimit();
      // Simulate a working session: edit an elevation, capture, repeat. Each edit
      // moves _elevCapGen, so each capture mints a brand new key.
      for (let i = 0; i < limit * 4; i++) {
        elevations[i % 3].frames[0].x = 20 + i;
        pushHistory();
        _igCapCacheSet(_igCapKey(i % 3), { dataUrl: 'data:image/jpeg;base64,AAAA', w: 10, h: 10 });
      }
      const n = Object.keys(_igCapCache).length;
      if (n > limit) throw new Error('THE BUG: ' + n + ' entries after ' + (limit * 4) + ' edits (limit ' + limit + ') — every one holds a multi-megabyte capture that can never be read again');
    });

    __check('the bound tracks the deck, so a full set of walls always fits', () => {
      __seed(9);
      if (!(_igCapCacheLimit() >= elevations.length)) throw new Error('a deck of ' + elevations.length + ' walls cannot all be cached at once (limit ' + _igCapCacheLimit() + '), so every render recaptures');
      __seed(1);
      if (!(_igCapCacheLimit() >= 2)) throw new Error('the floor is too low to keep even one generation of history');
    });

    __check('EXACT RISK: eviction drops DEAD generations before live ones', () => {
      // Editing one wall repeatedly must not evict another wall's CURRENT capture —
      // that wall would then recapture for nothing, which is the slowness this is
      // meant to fix. A key whose generation is stale can never be read again, so
      // those go first.
      __seed(3);
      pushHistory();
      const live = [0, 1, 2].map(i => _igCapKey(i));
      live.forEach(k => _igCapCacheSet(k, { dataUrl: 'x', w: 1, h: 1 }));
      // Now churn wall 0 until the cache is well over the limit.
      const limit = _igCapCacheLimit();
      for (let i = 0; i < limit * 3; i++) {
        elevations[0].frames[0].x = 100 + i;
        pushHistory();
        _igCapCacheSet(_igCapKey(0), { dataUrl: 'x', w: 1, h: 1 });
      }
      // Walls 1 and 2 never changed, but pushHistory moved the generation, so their
      // keys moved too — what must hold is that nothing is over the bound and the
      // CURRENT key for the churned wall survived.
      if (Object.keys(_igCapCache).length > limit) throw new Error('over the bound after churn');
      if (!_igCapCache[_igCapKey(0)]) throw new Error('the most recent capture was evicted, so the very next render recaptures it');
    });

    __check('a refreshed entry counts as the newest, not the oldest', () => {
      __seed(2);
      const limit = _igCapCacheLimit();
      const first = 'k0';
      _igCapCacheSet(first, { dataUrl: 'x' });
      for (let i = 1; i < limit; i++) _igCapCacheSet('k' + i, { dataUrl: 'x' });
      _igCapCacheSet(first, { dataUrl: 'y' });     // touched again
      _igCapCacheSet('overflow', { dataUrl: 'x' });
      if (!_igCapCache[first]) throw new Error('re-writing an entry left it at the front of the eviction queue, so a hot capture gets dropped');
    });

    __check('every write to the capture cache goes through the bounded path', () => {
      // A direct assignment anywhere OUTSIDE the bounded setter is a leak again.
      const a = S.indexOf('function _igCapCacheSet');
      const outside = S.slice(0, a) + S.slice(S.indexOf('\\n}', a));
      const writes = (outside.match(/_igCapCache\\[[^\\]]+\\]\\s*=/g) || []);
      if (writes.length) throw new Error(writes.length + ' direct write(s) to _igCapCache bypass the bound: ' + writes.join(', '));
      if (S.indexOf('_igCapCacheSet(jobs[n].key, cap)') < 0) throw new Error('the prime pass does not use the bounded write');
      if (S.indexOf('_igCapCacheSet(capKey, cap)') < 0) throw new Error('the page renderer does not use the bounded write');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
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
