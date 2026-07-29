// PDF generation: no theme strobe, and it keeps working in a background tab.
//
// Two reported problems, one shared root:
//
//  1. "it flashes in between the dark and light theme" — every elevation export
//     added .light-theme on entry and removed it in its own finally block. A
//     deck with N elevations therefore flipped the whole UI dark→light→dark N
//     times over the course of one PDF build.
//
//  2. "I have to stay on that tab in the browser for it to generate" — the
//     export paths awaited `new Promise(r => rAF(() => rAF(r)))`. rAF does not
//     fire at all in a background tab, so the moment you switched away the
//     build stalled on that await and never resumed.
//
// Fixes: ref-counted _pushLightTheme/_popLightTheme (outermost caller flips
// once), and _exportSettle() which forces a synchronous layout flush instead of
// waiting for a paint that will never come while hidden.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;

  // Lets a check pretend the tab is hidden / visible.
  let __hidden = false;
  Object.defineProperty(window.document, 'hidden', { get: () => __hidden, configurable: true });
  window.__setHidden = (v) => { __hidden = v; };

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

    // ── The exact "have to stay on that tab" bug ──
    __checkAsync('EXACT BUG: _exportSettle resolves while the tab is hidden (a bare rAF await would hang forever there)', async () => {
      window.__setHidden(true);
      // rAF must be provably useless here, or the check proves nothing: stub it
      // out entirely, exactly like a real backgrounded tab.
      const realRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;   // never invokes its callback
      try {
        const raced = await Promise.race([
          _exportSettle().then(() => 'settled'),
          new Promise(r => setTimeout(() => r('HUNG'), 1500))
        ]);
        if (raced !== 'settled') throw new Error('the exact reported bug: _exportSettle never resolved with the tab hidden, so a PDF build stalls until you switch back');
      } finally {
        window.requestAnimationFrame = realRaf;
        window.__setHidden(false);
      }
    });

    __checkAsync('_exportSettle still resolves normally when the tab IS visible', async () => {
      window.__setHidden(false);
      const raced = await Promise.race([
        _exportSettle().then(() => 'settled'),
        new Promise(r => setTimeout(() => r('HUNG'), 2000))
      ]);
      if (raced !== 'settled') throw new Error('_exportSettle hung on a visible tab');
    });

    __check('no export path is left awaiting a bare nested-rAF promise (the construct that stalls when hidden)', () => {
      const S = window.__appSrc;
      if (S.indexOf('await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))') >= 0) {
        throw new Error('an export still awaits nested rAF directly — it will hang in a background tab');
      }
      // The one legitimate nested rAF is _exportSettle's own visible-tab path.
      const nested = (S.match(/requestAnimationFrame\\(\\(\\) => requestAnimationFrame/g) || []).length;
      if (nested !== 1) throw new Error('expected exactly one nested rAF (inside _exportSettle); found ' + nested);
    });

    // ── The theme strobe ──
    __check('EXACT BUG: nested exports flip the theme ONCE, not once per elevation', () => {
      document.body.classList.remove('light-theme');   // start dark, as the user does
      let flips = 0;
      const realToggle = document.body.classList.add.bind(document.body.classList);
      // Count actual transitions by observing the class across a simulated run.
      const wasLight = () => document.body.classList.contains('light-theme');
      const seen = [];
      const record = () => seen.push(wasLight());
      record();
      _pushLightTheme();            // the deck-wide PDF run
      record();
      _pushLightTheme();            // elevation 1 capture
      _popLightTheme();
      record();
      _pushLightTheme();            // elevation 2 capture
      _popLightTheme();
      record();
      _pushLightTheme();            // elevation 3 capture
      _popLightTheme();
      record();
      _popLightTheme();             // run ends
      record();
      // Count dark→light / light→dark transitions across the whole sequence.
      for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) flips++;
      if (flips !== 2) throw new Error('the exact reported bug: theme changed ' + flips + ' times during one build (expected exactly 2 — light at the start, dark again at the end). Sequence: ' + JSON.stringify(seen));
      if (wasLight()) throw new Error('theme was not restored to dark after the run');
    });

    __check('light theme is held for the whole run, and every nested capture sees it already applied', () => {
      document.body.classList.remove('light-theme');
      _pushLightTheme();
      if (!document.body.classList.contains('light-theme')) throw new Error('outer push did not apply light theme');
      _pushLightTheme();
      _popLightTheme();
      if (!document.body.classList.contains('light-theme')) throw new Error('a nested capture ending dropped the theme mid-build — that is the strobe');
      _popLightTheme();
      if (document.body.classList.contains('light-theme')) throw new Error('theme not restored after the outermost pop');
    });

    __check('a user already working in light theme is left in light theme afterwards', () => {
      document.body.classList.add('light-theme');
      _pushLightTheme();
      _pushLightTheme();
      _popLightTheme();
      _popLightTheme();
      if (!document.body.classList.contains('light-theme')) throw new Error('an export forced a light-theme user back to dark');
    });

    __check('unbalanced pops cannot drive the refcount negative and strand the UI in light theme', () => {
      document.body.classList.remove('light-theme');
      _popLightTheme(); _popLightTheme();      // stray pops, no push
      _pushLightTheme();
      if (!document.body.classList.contains('light-theme')) throw new Error('push stopped working after stray pops');
      _popLightTheme();
      if (document.body.classList.contains('light-theme')) throw new Error('theme stuck in light — refcount went negative');
    });

    __check('the elevation exports and the deck-wide PDF run all go through the ref-counted helpers', () => {
      const S = window.__appSrc;
      // No export may add/remove the class directly any more; only toggleTheme
      // (the user-facing switch) and the helpers themselves may touch it.
      const adds = (S.match(/classList\\.add\\('light-theme'\\)/g) || []).length;
      if (adds !== 1) throw new Error('expected exactly one direct light-theme add (inside _pushLightTheme); found ' + adds);
      const removes = (S.match(/classList\\.remove\\('light-theme'\\)/g) || []).length;
      if (removes !== 1) throw new Error('expected exactly one direct light-theme remove (inside _popLightTheme); found ' + removes);
      // And the whole PDF build must be wrapped, so the flip happens once.
      const i = S.indexOf('async function exportSpecPagePDF');
      if (i < 0) throw new Error('exportSpecPagePDF not found');
      const body = S.slice(i, i + 1400);
      if (body.indexOf('_pushLightTheme()') < 0) throw new Error('exportSpecPagePDF does not hold the theme for the whole build');
      if (body.indexOf('_popLightTheme()') < 0) throw new Error('exportSpecPagePDF never releases the theme');
    });
  `;

  try { window.__appSrc = src; window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
