// Two reported bugs on breaker / install-guide pages.
//
// 1. THE LAG. Every breaker preview re-captured its elevation after ANY edit — the
//    whole app visibly switches to the Elevations tab, renders SVG and rasterizes,
//    which is the flash the user saw once per installation note. Cause: the capture
//    cache key included `_dsEditGen`, which pushHistory() bumps on every undoable
//    change anywhere in the app. It now uses `_elevCapGen`, bumped only when the
//    elevation state itself differs.
//
//    The safety requirement cuts both ways: a real elevation change MUST still
//    invalidate, or a page shows a stale drawing — worse than being slow. So the
//    signature is compared rather than a hand-listed set of fields.
//
// 2. THE LETTER LEGEND CHECKBOX DID NOTHING on a breaker page. _igCfg forced
//    legend:false for breakers and ignored the global the checkbox wrote.
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
    editorialContent = editorialContent || {};
    const S = window.__appSrc;
    scheduleAutosave = () => {};

    const __seed = () => {
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [], frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true, distToggles: { left: false, floor: false } },
        { letter: 'B', id: 'P2', x: 80, y: 40, w: 30, h: 24, active: true }
      ] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      // Hang height and baseboard are stored in INCHES, unit-independent, with the
      // Settings inputs as their display — so the signature hashes these, not the
      // boxes (whose text changes on a unit switch without the drawing moving).
      elevHangIn = 57;
      elevBaseboardIn = 4;
      pushHistory();          // establish a baseline signature
    };
    // Did the capture generation move across this change?
    const __gen = (fn) => { const before = _elevCapGen; fn(); pushHistory(); return _elevCapGen !== before; };

    // ── 1. The lag ──
    __check('EXACT BUG: the capture key no longer moves on an unrelated edit', () => {
      // 16.27 moved this out of _drawInstallGuidePage into _igCapKey so the prime
      // pass can fill the cache under the keys the renderer will ask for. Same
      // string, one definition — so the check follows it there rather than reading
      // the (now one-line) call site.
      const i = S.indexOf('function _igCapKey(');
      if (i < 0) throw new Error('_igCapKey is gone — the key has no single definition again');
      const body = S.slice(i, S.indexOf('}', i));
      if (/_dsEditGen/.test(body)) throw new Error('THE BUG: the capture key still keys off the global edit counter, so any edit anywhere forces a recapture');
      if (!/_elevCapGen/.test(body)) throw new Error('the capture key does not use the elevation generation: ' + body);
      // And the renderer must actually use it, or there are two keys again.
      const call = S.indexOf('const capKey = _igCapKey(');
      if (call < 0) throw new Error('_drawInstallGuidePage builds its own key instead of calling _igCapKey');
    });

    __check('EXACT BUG: ticking an installation note does not invalidate the captures', () => {
      __seed();
      const moved = __gen(() => {
        editorialContent.installNotes = { keys: { aff: true }, custom: '' };
      });
      if (moved) throw new Error('THE BUG: a note tick bumped the capture generation, so every breaker page re-captures');
    });

    __check('other unrelated edits are equally free', () => {
      __seed();
      [
        () => { editorialContent.specTemplate = 'setRight'; },
        () => { editorialContent.specDualUnit = 'mm'; },
        () => { editorialContent.installNotes = { keys: {}, custom: 'Site contact: Jordan.' }; },
        () => { editorialContent.approvedStamp = true; }
      ].forEach((fn, i) => {
        if (__gen(fn)) throw new Error('unrelated edit #' + i + ' bumped the capture generation');
      });
      editorialContent.specDualUnit = '';
    });

    // ── and the other half: real changes MUST still invalidate ──
    __check('EXACT RISK: moving a frame still invalidates, or the page shows a stale drawing', () => {
      __seed();
      if (!__gen(() => { elevations[0].frames[0].x = 25; })) throw new Error('a frame move did not invalidate the capture');
    });

    __check('EXACT RISK: the changes the old field-by-field stamp MISSED still invalidate', () => {
      // These are why _dsEditGen was folded in to begin with. The signature covers
      // them because it compares the state rather than a list of fields.
      const cases = {
        'frame turned off':      () => { elevations[0].frames[1].active = false; },
        'per-frame edge dim':    () => { elevations[0].frames[0].distToggles.floor = true; },
        'group dim added':       () => { elevations[0].groupDims.push({ id: 'gd1', frameLetters: ['A', 'B'], showWidth: true, showHeight: true }); },
        'custom measure line':   () => { elevations[0].customLines = [{ id: 'cl1', type: 'h', a: {}, b: {} }]; },
        'character moved':       () => { elevations[0].personPos.x = -20; },
        'wall resized':          () => { elevations[0].wallH = 120; },
        'hang height':           () => { elevHangIn = 60; },
        'baseboard':             () => { elevBaseboardIn = 6; },
        'unit':                  () => { elevUnit = 'cm'; },
        'interior suffix':       () => { showUnitSuffix = !showUnitSuffix; },
        'elevation dual units':  () => { elevDualUnit = 'mm'; }
      };
      Object.keys(cases).forEach(name => {
        __seed(); elevUnit = 'in'; elevDualUnit = '';
        if (!__gen(cases[name])) throw new Error(name + ' did NOT invalidate the capture — that page would keep a stale drawing');
      });
      elevUnit = 'in'; elevDualUnit = '';
    });

    __check('a huge artwork data URL is hashed by length, not stringified whole', () => {
      __seed();
      const big = 'data:image/png;base64,' + new Array(400).join('A');
      if (!__gen(() => { elevations[0].frames[0].artworkUrl = big; })) throw new Error('adding artwork did not invalidate');
      const sig = _elevCaptureSignature();
      if (sig.indexOf(big) >= 0) throw new Error('the full data URL is in the signature — megabytes of base64 compared on every pushHistory');
      if (sig.indexOf('#' + big.length) < 0) throw new Error('the length stand-in is missing: long strings must still be distinguishable');
      // And a DIFFERENT image of a different size is still seen as a change.
      if (!__gen(() => { elevations[0].frames[0].artworkUrl = big + 'BB'; })) throw new Error('swapping the artwork did not invalidate');
    });

    __check('an unhashable state is treated as CHANGED, never as unchanged', () => {
      // Failing closed is the only safe direction: a false "unchanged" ships a
      // stale drawing. (Tested on the signature directly — a circular elevations
      // array also breaks pushHistory's own snapshot, which is a separate concern.)
      __seed();
      const save = elevations;
      const circular = [{ name: 'X' }]; circular[0].self = circular;
      elevations = circular;
      const sig = _elevCaptureSignature();
      elevations = save;
      if (sig !== null) throw new Error('a circular state hashed to ' + typeof sig + ' instead of failing closed');
      // And the caller must read that null as "changed".
      const i = S.indexOf('function pushHistory');
      const body = S.slice(i, i + 700);
      if (!/sig === null \\|\\| sig !== _lastElevSig/.test(body)) throw new Error('pushHistory does not treat an unhashable signature as changed');
      if (body.indexOf('catch') < 0 || !/catch \\(e\\) \\{ _elevCapGen\\+\\+; \\}/.test(body)) throw new Error('a throw while hashing must also count as changed');
    });

    __check('_dsEditGen itself still moves on every edit — the preview staleness check needs it', () => {
      __seed();
      const before = _dsEditGen;
      editorialContent.approvedStamp = false;
      pushHistory();
      if (_dsEditGen === before) throw new Error('_dsEditGen stopped counting, which would strand _dsBuiltGen');
    });

    // ── 1b. The breaker that wouldn't build its preview ──
    __check('EXACT BUG: an incomplete render is not cached as the finished page', () => {
      // _drawInstallGuidePage draws a "Hit Build" placeholder when captures are
      // suppressed and none is cached. Both cache writes stored that placeholder —
      // and _dsBuilt stamped it with the current edit generation, marking it FRESH —
      // so the page never re-rendered and sat on the placeholder. That is the
      // reported bug: a breaker that only came good after visiting another page and
      // building it (which bumped the generation and un-staled this one).
      if (typeof _igCaptureDeferred === 'undefined') throw new Error('nothing records that a render came out incomplete');
      if (typeof _igBeginRender !== 'function' || typeof _igRenderWasComplete !== 'function') throw new Error('the begin/read helpers are missing');
      // The placeholder branch must set the flag. Its condition widened from
      // "not cap AND suppressed" to just "not cap" — see the next check for why.
      // Anchored INSIDE _drawInstallGuidePage (like the next check already is): the
      // bare indented string matched the retry in _elevPrimeCaptures once that
      // existed, and searched from the top of the file it hit that first.
      const fn = S.indexOf('async function _drawInstallGuidePage');
      if (fn < 0) throw new Error('_drawInstallGuidePage is gone');
      const i = S.indexOf('            if (!cap) {', fn);
      if (i < 0) throw new Error('the placeholder branch is gone');
      const branch = S.slice(i, i + 2600);
      if (branch.indexOf('_igCaptureDeferred = true') < 0) throw new Error('THE BUG: the placeholder branch does not flag the page as incomplete');
    });

    __check('EXACT BUG: a capture that was ALLOWED but FAILED no longer exports a blank page', () => {
      // The old condition was "not cap AND suppressed", so a failed-but-allowed capture
      // matched neither the placeholder branch nor the draw branch. The page fell
      // through both and exported with NO elevation, silently, and counted as
      // complete — which is how a breaker reached a client PDF with its drawing
      // missing even after being previewed.
      const i = S.indexOf('async function _drawInstallGuidePage');
      const body = S.slice(i, i + 40000);
      if (/if \\(!cap && _igNoCapture\\) \\{/.test(body)) throw new Error('THE BUG: the placeholder branch still only fires when captures were suppressed, so a FAILED capture exports blank');
      const at = body.indexOf('            if (!cap) {');
      if (at < 0) throw new Error('no unconditional !cap branch — a failed capture would fall through again');
      // It must sit BEFORE the branch that draws the elevation, or the fall-through
      // returns.
      const draw = body.indexOf('if (cap && cap.dataUrl) {');
      if (!(draw > at)) throw new Error('the !cap branch must come before the draw branch');
      // And it must distinguish the two causes: "hit Build" is misleading when Build
      // is exactly what just ran and failed.
      if (body.indexOf('capFailed') < 0) throw new Error('the two causes are not distinguished, so a failure reads as "hit Build"');
    });

    __check('a failed capture is retried once before giving up', () => {
      // _captureElevWithGuides bails to null on transient conditions (the measure
      // tool mid-use, a settle that did not land). One page in an otherwise-good
      // export silently losing its drawing is the worst outcome, so a second attempt
      // is worth its cost.
      // 16.44: the cache-lookup + retry + suppressor block was EXTRACTED from
      // _drawInstallGuidePage into _igElevCapture so the flat-graphic sheet
      // (_drawFlatGraphicSpecPage) shares it instead of carrying a second copy that
      // could drift. Same code, one home — so the retry is checked there now, plus
      // that the install-guide page still routes through it.
      const i = S.indexOf('async function _igElevCapture');
      if (i < 0) throw new Error('_igElevCapture is gone — the retry has no home');
      const body = S.slice(i, S.indexOf('\\n}', i));
      const first = body.indexOf('cap = await _captureElevWithGuides(elevIdx);');
      if (first < 0) throw new Error('the capture call is gone');
      const second = body.indexOf('cap = await _captureElevWithGuides(elevIdx);', first + 10);
      if (second < 0) throw new Error('no retry — a transient failure loses the drawing for that page');
      const between = body.slice(first, second);
      if (between.indexOf('if (!cap)') < 0) throw new Error('the retry is not conditional on the first attempt failing');
      // Nobody may bypass it by calling _captureElevWithGuides directly from a page
      // renderer — that is how the second copy would come back.
      ['async function _drawInstallGuidePage', 'async function _drawFlatGraphicSpecPage'].forEach(sig => {
        const j = S.indexOf(sig);
        if (j < 0) throw new Error('cannot find ' + sig);
        const rb = S.slice(j, j + 40000);
        if (rb.indexOf('_igElevCapture(') < 0) throw new Error(sig + ' does not use the shared capture helper');
      });
    });

    __check('EXACT BUG: both cache writes are gated on the render being complete', () => {
      // The centre preview (_dsBuilt) and the rail thumbnails (_dsThumbCache).
      ['_dsBuilt[_deckPageKey(desc)] =', '_dsThumbCache[job.ck] ='].forEach(write => {
        const at = S.indexOf(write);
        if (at < 0) throw new Error('cache write not found: ' + write);
        // Walk back a little: the guard has to be between the render callback and
        // the write.
        const before = S.slice(Math.max(0, at - 700), at);
        if (before.indexOf('_igRenderWasComplete()') < 0) throw new Error('THE BUG: ' + write + ' is not gated, so a placeholder gets cached as the finished page');
      });
    });

    __check('the flag is reset before each render, or one bad page poisons the next', () => {
      ['function _thumbPump', 'function _dsRenderCenter'].forEach(fn => {
        const i = S.indexOf(fn);
        if (i < 0) throw new Error(fn + ' not found');
        const body = S.slice(i, i + 17000);
        if (body.indexOf('_igBeginRender()') < 0) throw new Error(fn + ' never resets the incomplete flag, so a stale one would block a good page from caching');
      });
    });

    __check('a placeholder is still PAINTED — the fix must not leave a blank cell', () => {
      const i = S.indexOf('_dsThumbCache[job.ck] =');
      const around = S.slice(i - 200, i + 400);
      if (around.indexOf('_dsPaintThumb(job.ck, url)') < 0) throw new Error('the thumbnail is no longer painted when the render was incomplete');
      // and the paint must NOT be inside the cache guard
      const guardAt = around.indexOf('_igRenderWasComplete()');
      const paintAt = around.indexOf('_dsPaintThumb(job.ck, url)');
      if (guardAt >= 0 && paintAt >= 0 && paintAt < guardAt) throw new Error('paint/cache order changed unexpectedly');
    });

    __check('the SELECTED page is allowed to capture, background renders are not', () => {
      // Suppressing the capture for the page you just clicked is what stopped it
      // building itself. Thumbnails must stay suppressed — they must never steal the
      // view — which is what the _prevNoCap carry-through preserves.
      const i = S.indexOf('function _dsRenderCenter');
      const body = S.slice(i, i + 17000);
      if (/const _prevNoCap = _igNoCapture; _igNoCapture = true;/.test(body)) throw new Error('THE BUG: the centre preview still forces captures off, so a breaker cannot build itself');
      if (body.indexOf('const _prevNoCap = _igNoCapture;') < 0) throw new Error('the nested-render guard was dropped');
      if (body.indexOf('_igNoCapture = _prevNoCap;') < 0) throw new Error('the flag is not restored after the render');
      const j = S.indexOf('function _thumbPump');
      const tb = S.slice(j, j + 2000);
      if (tb.indexOf('_igNoCapture = true') < 0) throw new Error('thumbnails no longer suppress captures — background renders would steal the view');
    });

    // ── 1c. The export could not capture while the rail was busy ──
    __check('EXACT BUG: an export forces captures ON, whatever the rail is doing', () => {
      // _igNoCapture is a single global that ALSO means "a background thumbnail render
      // is in flight" — _thumbPump sets it for the life of every job. Hit Generate PDF
      // while the rail is still building (it usually is) and every breaker page saw
      // captures suppressed and printed the placeholder. THAT is why previewing each
      // page by hand first appeared to be required: it filled _igCapCache so the
      // export never had to capture anything itself.
      const i = S.indexOf('async function exportSpecPagePDF');
      if (i < 0) throw new Error('exportSpecPagePDF not found');
      const body = S.slice(i, S.indexOf('PDF build progress overlay', i));
      if (body.indexOf('_igNoCapture = false') < 0) throw new Error('THE BUG: the export does not force captures on, so a busy rail silently blanks every breaker page');
      if (body.indexOf('const _prevNoCap = _igNoCapture;') < 0) throw new Error('the previous value is not saved');
      // Restored, but ANDed with the live _thumbBusy since 16.32. The snapshot is
      // read while a thumbnail job may still be in flight, and that job's finish()
      // clears the flag on its way out — putting a stale TRUE back strands it and
      // nothing may ever capture again. Restoring the snapshot ALONE is the bug now.
      if (body.indexOf('_igNoCapture = _prevNoCap && _thumbBusy;') < 0) throw new Error('the flag is not restored from the live state, so a stale snapshot can strand it forced OFF');
    });

    __check('the background thumbnail queue is stopped first, so nothing competes for the view', () => {
      // Forcing captures on while a thumbnail render is mid-flight would let THAT
      // render steal the view — the exact thing the flag exists to prevent.
      const i = S.indexOf('async function exportSpecPagePDF');
      const body = S.slice(i, S.indexOf('PDF build progress overlay', i));
      const stop = body.indexOf('_thumbQueue = []');
      const force = body.indexOf('_igNoCapture = false');
      if (stop < 0) throw new Error('the export does not drop the queued thumbnails');
      if (body.indexOf('_thumbRunToken++') < 0) throw new Error('an in-flight thumbnail is not invalidated');
      if (!(stop < force)) throw new Error('the queue must be stopped BEFORE captures are enabled');
      // And the rail has to be rebuilt afterwards or it sits on stale cells.
      if (body.indexOf('_dsBuildAllThumbs') < 0) throw new Error('the thumbnails are dropped and never rebuilt');
    });

    __check('the restore happens in a finally, so a cancelled or failed export cannot leave it forced', () => {
      const i = S.indexOf('async function exportSpecPagePDF');
      const body = S.slice(i, S.indexOf('PDF build progress overlay', i));
      const fin = body.lastIndexOf('finally');
      const restore = body.lastIndexOf('_igNoCapture = _prevNoCap');
      if (fin < 0) throw new Error('no finally block');
      if (!(restore > fin)) throw new Error('the flag is restored outside the finally — a cancelled export would leave captures forced on');
    });

    // ── 2. The letter legend on breaker pages ──
    __check('EXACT BUG: the Letter legend checkbox works on a breaker page', () => {
      editorialContent.installGuide = {};
      const key = 'elevgrp:ART-1';
      if (_igCfg(key).legend !== false) throw new Error('breaker legend should start off');
      _igSet({ legend: true }, null, true);          // deck-wide, from a breaker panel
      if (_igCfg(key).legend !== true) throw new Error('THE BUG: the checkbox wrote a value the breaker renderer ignores');
      _igSet({ legend: false }, null, true);
      if (_igCfg(key).legend !== false) throw new Error('turning it back off did not take');
    });

    __check('breaker and install-guide legends stay independent — no bleed either way', () => {
      // The forced base exists so Install-guide globals can't leak onto breakers.
      // Giving breakers their own slots must not undo that.
      editorialContent.installGuide = {};
      _igSet({ legend: true }, null, false);          // an INSTALL page turns it on
      if (_igCfg('elevgrp:ART-1').legend !== false) throw new Error('an install-page legend bled onto breakers');
      if (_igCfg('elev:0').legend !== true) throw new Error('the install page did not get its own legend');
      editorialContent.installGuide = {};
      _igSet({ legend: true }, null, true);           // a BREAKER turns it on
      if (_igCfg('elev:0').legend !== false) throw new Error('a breaker legend bled onto install pages');
      if (_igCfg('elevgrp:ART-1').legend !== true) throw new Error('the breaker did not get its own legend');
      editorialContent.installGuide = {};
    });

    __check('a per-page override still wins over both globals', () => {
      editorialContent.installGuide = {};
      const key = 'elevgrp:ART-1';
      _igSet({ legend: false }, null, true);
      _igSet({ legend: true }, key, true);            // this page only
      if (_igCfg(key).legend !== true) throw new Error('the per-page override lost to the global');
      if (_igCfg('elevgrp:OTHER').legend !== false) throw new Error('a per-page override leaked to another breaker');
      editorialContent.installGuide = {};
    });

    __check('the breaker panel tells _igSet it is a breaker', () => {
      const i = S.indexOf('function _dsInstallGuideControls');
      const body = S.slice(i, i + 2000);
      if (body.indexOf('_igIsBreaker') < 0) throw new Error('the panel does not work out whether it is editing a breaker');
      if (!/_igSet\\(patch, scope === 'page' \\? ovKey : null, _igIsBreaker\\)/.test(body)) throw new Error('commit does not pass the breaker flag through');
    });

    __check('a breaker still cannot inherit the layout settings that must stay fixed', () => {
      editorialContent.installGuide = {};
      _igSet({ variant: 'elevFrames', plan: 'zoom', planScale: 0.5 }, null, false);
      const c = _igCfg('elevgrp:ART-1');
      if (c.variant !== 'elevOnly') throw new Error('a breaker picked up variant ' + c.variant);
      if (c.plan !== 'full') throw new Error('a breaker picked up plan ' + c.plan);
      if (c.planScale !== 1) throw new Error('a breaker picked up planScale ' + c.planScale);
      editorialContent.installGuide = {};
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
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
