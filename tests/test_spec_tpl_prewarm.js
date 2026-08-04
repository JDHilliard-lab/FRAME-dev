// Asked for: "is there a way they can be built in as default so there is no watching
// them build, they are just there."
//
// They're pre-warmed in the background instead of baked in. Two approaches were
// rejected on purpose and this file pins both reasons, because both look cheaper than
// they are:
//
//  * localStorage. performAutosave writes the WHOLE project — every artwork data URL,
//    megabytes — under one key, and it fails silently on quota. Spending the same
//    ~5MB origin budget on cosmetic swatch JPEGs would trade the crash safety net for
//    a loading flicker.
//  * Baked image files. They'd need regenerating whenever any template's coordinates
//    move, with nothing to detect staleness — the drift the "render with the SAME
//    engine as the page previews" rule exists to prevent.
//
// So: _dsPrewarmTplSwatches() fills the cache shortly after boot, yielding to real
// work, and the pump waits on the brand faces first — the type is baked into a cache
// that is locked for the session, so a card rendered before the fonts land would keep
// its Arial fallbacks for as long as the tab is open.
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

  const setup = `
    window.__testResults = [];
    window.__check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };

    // Swap the renderer for a counter: this file is about WHEN and WHETHER a swatch is
    // built, not what it draws (test_spec_tpl_swatch_demo.js covers that).
    window.__built = [];
    window.__fontsWhenBuilt = [];
    window.__fontsLoaded = false;
    renderSpecPageCanvas = async function (desc) {
      window.__built.push(desc._specTpl);
      window.__fontsWhenBuilt.push(window.__fontsLoaded);
      return { toDataURL: () => 'data:image/jpeg;base64,BUILT' + desc._specTpl };
    };
    _loadEditorBrandFonts = async function () { window.__fontsLoaded = true; };
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });

    window.__drain = async () => {
      // The pump chains itself through setTimeout(30); let every queued job land.
      for (let i = 0; i < 60 && (_dsTplSwatchQueue.length || _dsTplSwatchBusy); i++) {
        await new Promise(r => setTimeout(r, 12));
      }
    };
    window.__reset = () => {
      Object.keys(_dsTplSwatchCache).forEach(k => { delete _dsTplSwatchCache[k]; });
      _dsTplSwatchQueue.length = 0;
      window.__built = []; window.__fontsWhenBuilt = [];
      _dsTplPrewarmDone = false; _dsTplPrewarmTries = 0;
      _thumbBusy = false; _elevPrimeActive = false;
      dashUnit = 'in'; editorialContent.specDualUnit = '';
    };

    window.__run = (async () => {
      const S = window.__appSrc;
      const __check = window.__check;

      // ── The cards are ready before anything opens the panel ────────────────
      window.__reset();
      _dsPrewarmTplSwatches();
      await window.__drain();
      const prewarmed = window.__built.slice();
      const fontsFlags = window.__fontsWhenBuilt.slice();

      __check('EXACT ASK: every offered template is built up front, with no card on screen', () => {
        const want = Object.keys(SPEC_TEMPLATES).filter(k => k !== 'installGuide' && !SPEC_TEMPLATES[k].freeform);
        if (!want.length) throw new Error('no templates to prewarm');
        want.forEach(k => { if (prewarmed.indexOf(k) < 0) throw new Error(k + ' was not prewarmed'); });
        // No DOM element is involved — the point is filling the cache, and painting
        // into nothing must not throw or skip the render.
        want.forEach(k => { if (!_dsTplSwatchCache[_dsTplSwatchKey(k)]) throw new Error(k + ' rendered but was not cached'); });
      });

      __check('and nothing pointless is built: installGuide is not a card, custom has no canvas', () => {
        if (prewarmed.indexOf('installGuide') >= 0) throw new Error('prewarmed a template the picker never shows');
        Object.keys(SPEC_TEMPLATES).filter(k => SPEC_TEMPLATES[k].freeform).forEach(k => {
          if (prewarmed.indexOf(k) >= 0) throw new Error(k + ' is freeform — renderSpecPageCanvas returns null for it, so queueing it just churns');
        });
      });

      __check('opening a card after the prewarm costs no render at all', () => {
        const before = window.__built.length;
        const el = document.createElement('div');
        document.body.appendChild(el);
        _dsQueueTplSwatch('setRow', el);
        if (window.__built.length !== before) throw new Error('a warm card queued another render');
        if (!el.querySelector('img')) throw new Error('the warm card did not paint');
        el.remove();
      });

      __check('a second prewarm is a no-op — this runs on every boot, not once ever', () => {
        const before = window.__built.length;
        _dsPrewarmTplSwatches();
        if (_dsTplSwatchQueue.length) throw new Error('the second prewarm queued work for an already-full cache');
        if (window.__built.length !== before) throw new Error('the second prewarm re-rendered');
      });

      // ── The font trap ──────────────────────────────────────────────────────
      __check('EXACT BUG RISK: no swatch is rendered before the brand faces load', () => {
        if (!fontsFlags.length) throw new Error('nothing was built, so this proves nothing');
        if (fontsFlags.some(f => f !== true)) throw new Error('a card was rendered before the fonts loaded — the cache is locked for the session, so it would keep Arial fallbacks all session');
        const i = S.indexOf('async function _dsTplSwatchPump');
        const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
        // The wait itself lives in the shared _dsTplSwatchFonts helper (memoized, so
        // seven cards don't queue fourteen timers) — the pump just has to await it.
        if (body.indexOf('_dsTplSwatchFonts()') < 0) throw new Error('the pump no longer waits for the brand faces');
        const j = S.indexOf('function _dsTplSwatchFonts');
        if (S.slice(j, S.indexOf('\\n}', j)).indexOf('_loadEditorBrandFonts') < 0) throw new Error('the shared font wait does not actually load the brand faces');
      });

      // ── It must not fight real work ────────────────────────────────────────
      __check('it yields while the rail is building or an elevation prime is running', () => {
        window.__reset();
        _thumbBusy = true;
        _dsPrewarmTplSwatches();
        if (_dsTplSwatchQueue.length || window.__built.length) throw new Error('prewarm barged in during a thumbnail build');
        if (_dsTplPrewarmDone) throw new Error('it marked itself done without doing anything, so it will never retry');
        _thumbBusy = false; _elevPrimeActive = true;
        _dsPrewarmTplSwatches();
        if (_dsTplSwatchQueue.length) throw new Error('prewarm barged in during an elevation prime pass');
        _elevPrimeActive = false;
      });

      __check('and its retry is bounded, so a permanently busy deck does not tick forever', () => {
        window.__reset();
        _thumbBusy = true;
        _dsTplPrewarmTries = 999;
        _dsPrewarmTplSwatches();
        if (_dsTplPrewarmTries > 1000) throw new Error('the retry counter is unbounded');
        _thumbBusy = false;
        // Past the cap it simply gives up and the cards render on demand — the old
        // behaviour, not a broken one.
        window.__reset();
      });

      // ── A unit change re-keys the set, so it has to be rebuilt ─────────────
      window.__reset();
      _dsPrewarmTplSwatches();
      await window.__drain();
      const inKeys = Object.keys(_dsTplSwatchCache).length;
      dashUnit = 'cm';
      _dsRepwarmTplSwatches();
      await window.__drain();

      __check('a unit change rebuilds the set instead of leaving the picker to render on open', () => {
        if (!inKeys) throw new Error('nothing was cached for inches');
        const after = Object.keys(_dsTplSwatchCache).length;
        if (after <= inKeys) throw new Error('the cm set was never built (' + inKeys + ' -> ' + after + ')');
        const k = Object.keys(SPEC_TEMPLATES).find(x => x !== 'installGuide' && !SPEC_TEMPLATES[x].freeform);
        if (!_dsTplSwatchCache[_dsTplSwatchKey(k)]) throw new Error('the current unit has no cached swatch, which is the case that matters');
      });

      __check('the unit and dual-unit controls both trigger the rebuild', () => {
        const i = S.indexOf('function setUnit(');
        if (S.slice(i, S.indexOf('\\nfunction ', i + 10)).indexOf('_dsRepwarmTplSwatches') < 0) throw new Error('setUnit does not rebuild the swatches');
        const j = S.indexOf('function _dsDualUnitInto');
        if (S.slice(j, S.indexOf('\\nfunction ', j + 10)).indexOf('_dsRepwarmTplSwatches') < 0) throw new Error('the dual-units control does not rebuild the swatches');
      });

      // ── The two rejected approaches ────────────────────────────────────────
      __check('the swatches stay OUT of localStorage, where the autosave lives', () => {
        // performAutosave puts the entire project in localStorage under one key and
        // fails silently on quota. Cosmetic card images must not share that budget.
        // Just the swatch machinery, function by function — a fixed-size window from
        // the cache declaration runs on into unrelated code that legitimately stores
        // preferences, and would fail for the wrong reason.
        ['function _dsTplSwatchKey', 'function _dsQueueTplSwatch', 'function _dsPaintTplSwatch',
         'function _dsPrewarmTplSwatches', 'async function _dsTplSwatchPump'].forEach(sig => {
          const i = S.indexOf(sig);
          if (i < 0) throw new Error('missing ' + sig);
          const body = S.slice(i, S.indexOf('\\n}', i));
          if (/localStorage/.test(body)) throw new Error(sig + ' touches localStorage, which is the autosave budget');
        });
        const j = S.indexOf('function performAutosave');
        if (S.slice(j, j + 1200).indexOf('localStorage.setItem') < 0) throw new Error('autosave moved off localStorage — re-evaluate whether persisting swatches is safe now');
      });

      __check('and the cards are still rendered by the real page engine, not baked artwork', () => {
        const i = S.indexOf('async function _dsTplSwatchPump');
        const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
        if (body.indexOf('renderSpecPageCanvas') < 0) throw new Error('a card no longer goes through the page renderer, so it can promise a layout the export does not draw');
      });

      // ── Where it is triggered from, which is a suite-runtime decision ───────
      __check('it fires on entering the deck view, NOT from the boot tail', () => {
        // Seven real page renders. From the boot tail, every load pays for a panel
        // that may never open — and so does every one of the 100+ test harnesses,
        // which boot app.js and never switch to this view. That measured at ~4.5s
        // per file, roughly tripling a suite CLAUDE.md says to run on every change.
        const i = S.indexOf("if (viewType === 'deck') {");
        if (i < 0) throw new Error('switchView deck branch not found');
        if (S.slice(i, i + 1800).indexOf('_dsPrewarmTplSwatches') < 0) throw new Error('entering the deck view no longer prewarms the cards');
        const boot = S.slice(S.indexOf('// BOOT UP THE ENGINE'));
        if (boot.indexOf('_dsPrewarmTplSwatches') >= 0) throw new Error('the prewarm is back in the boot tail — that costs every test harness ~4.5s for a panel it never opens');
      });

      __check('_withTimeout clears its fallback timer, or the prewarm hangs the event loop', () => {
        // It used to leave the timer pending, so each call sat on the loop for its
        // full 2.5s even when the promise resolved at once. One page render hid it;
        // seven cards' worth did not.
        const i = S.indexOf('function _withTimeout');
        const body = S.slice(i, S.indexOf('\\n}', i));
        if (body.indexOf('clearTimeout') < 0) throw new Error('_withTimeout leaves a dangling timer again');
        // And the font wait is memoized, not repeated per card.
        if (S.indexOf('let _dsTplFontsReady') < 0) throw new Error('the per-session font wait is gone, so every card awaits again');
      });

      __check('the memoized font wait really is shared, not re-run per card', () => {
        let calls = 0;
        const prev = _loadEditorBrandFonts;
        _dsTplFontsReady = null;
        _loadEditorBrandFonts = async function () { calls++; window.__fontsLoaded = true; };
        _dsTplSwatchFonts(); _dsTplSwatchFonts(); _dsTplSwatchFonts();
        if (calls !== 1) throw new Error('the font load ran ' + calls + ' times for three waiters');
        _loadEditorBrandFonts = prev;
      });
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + setup);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
