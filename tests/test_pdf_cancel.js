// Cancelling a PDF build mid-generation.
//
// Reported: "is it possible to have a cancel button in the middle of generating
// a pdf, currently I'm locked in and have to wait for it to complete." A long
// build was a one-way door.
//
// The build is a deep async walk, so cancelling sets a flag and lets the next
// checkpoint throw a sentinel. Unwinding through the existing `finally` blocks
// is what restores the light theme, the elevation view and the zoom level — so
// the checks below cover both "it stops" and "it stops CLEANLY", plus the two
// ways this could go wrong: emitting a truncated PDF, or reporting a deliberate
// cancel to the user as a crash.
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

    __check('the overlay has a Cancel button wired to _pdfRequestCancel', () => {
      const b = document.getElementById('pdfBuildCancelBtn');
      if (!b) throw new Error('no Cancel button in the PDF build overlay — the user is still locked in');
      const on = (b.getAttribute('onclick') || '');
      if (on.indexOf('_pdfRequestCancel') < 0) throw new Error('Cancel button is not wired to _pdfRequestCancel: ' + on);
      if (typeof _pdfRequestCancel !== 'function') throw new Error('_pdfRequestCancel is not defined');
    });

    __check('EXACT BUG: after a cancel request, the next checkpoint aborts the build', () => {
      window._specPdfBusy = true;
      _pdfCancelled = false;
      // Before cancelling, checkpoints must be transparent.
      _pdfCheckCancel();          // must not throw
      _pdfRequestCancel();
      if (!_pdfIsCancelled()) throw new Error('cancel request did not register');
      let threw = false;
      try { _pdfCheckCancel(); } catch (e) { threw = true; if (!_pdfWasCancelError(e)) throw new Error('checkpoint threw the wrong error: ' + e.message); }
      if (!threw) throw new Error('the exact reported bug: checkpoint did not abort after cancel, so the build runs to completion regardless');
      window._specPdfBusy = false; _pdfCancelled = false;
    });

    __check('a cancel is never reported to the user as a crash', () => {
      const cancelErr = new Error('__PDF_CANCELLED__');
      if (!_pdfWasCancelError(cancelErr)) throw new Error('a genuine cancel would be misreported as a PDF error');
      if (_pdfWasCancelError(new Error('Cannot read properties of undefined'))) throw new Error('a real crash would be silently swallowed as a cancel');
      if (_pdfWasCancelError(null)) throw new Error('null must not read as a cancel');
    });

    __check('the build cannot hand back a truncated PDF after a cancel', () => {
      const S = window.__appSrc;
      const save = S.indexOf('doc.save(fname)');
      if (save < 0) throw new Error('PDF save call not found');
      // A checkpoint must sit between the page walk and the save/preview, so a
      // swallowed sentinel upstream still cannot produce a partial document.
      const before = S.slice(Math.max(0, save - 700), save);
      if (before.indexOf('_pdfCheckCancel()') < 0) throw new Error('no cancel checkpoint guards the save — a cancelled build could still emit a partial PDF');
      if (before.indexOf('showSpecPdfPreview') < 0) throw new Error('expected the preview branch beside the save; check the guard covers both');
    });

    __check('cancelling is checked at every page boundary and before each slow elevation capture', () => {
      const S = window.__appSrc;
      const np = S.indexOf('const newPage = (key) => {');
      if (np < 0) throw new Error('newPage not found');
      if (S.slice(np, np + 400).indexOf('_pdfCheckCancel()') < 0) throw new Error('no per-page cancel checkpoint — cancel would not take effect until the whole deck finished');
      const cap = S.indexOf('async function _captureElevWithGuides');
      if (S.slice(cap, cap + 500).indexOf('_pdfCheckCancel') < 0) throw new Error('elevation capture (the slowest step) has no cancel checkpoint');
    });

    __check('a fresh run clears a previous cancel, so cancelling once does not poison the next build', () => {
      const S = window.__appSrc;
      const i = S.indexOf('async function exportSpecPagePDF');
      // Anchored on what FOLLOWS the function, not a byte count — a fixed window
      // kept going stale as the function gained comments.
      const body = S.slice(i, S.indexOf('PDF build progress overlay', i));
      if (body.indexOf('_pdfCancelled = false') < 0) throw new Error('exportSpecPagePDF never resets the cancel flag — a second build would abort instantly');
      // And the flag must be cleared on the way out too, not just on entry.
      const fin = body.lastIndexOf('_pdfCancelled = false');
      if (fin === body.indexOf('_pdfCancelled = false')) throw new Error('cancel flag is reset on entry only; it should also be cleared in the finally');
    });

    __check('cancelling unwinds through finally blocks so the theme is restored, not stranded in light mode', () => {
      document.body.classList.remove('light-theme');
      window._specPdfBusy = true; _pdfCancelled = false;
      // Simulate the real shape: outer run holds the theme, a capture starts,
      // then a cancel throws and everything unwinds.
      _pushLightTheme();                      // the PDF run
      let caught = null;
      try {
        _pushLightTheme();                    // an elevation capture
        try { _pdfRequestCancel(); _pdfCheckCancel(); }
        finally { _popLightTheme(); }         // capture's own finally
      } catch (e) { caught = e; }
      _popLightTheme();                       // run's finally
      if (!caught || !_pdfWasCancelError(caught)) throw new Error('cancel did not propagate out as a cancel');
      if (document.body.classList.contains('light-theme')) throw new Error('theme stranded in light mode after a cancel — the user is left in the wrong theme');
      window._specPdfBusy = false; _pdfCancelled = false;
    });

    __check('Cancel does nothing when no build is running', () => {
      window._specPdfBusy = false;
      _pdfCancelled = false;
      _pdfRequestCancel();
      if (_pdfIsCancelled()) throw new Error('a stray Cancel click with no build running armed the flag, which would abort the NEXT build');
    });

    __check('showing the overlay re-arms a Cancel button left disabled by a previous cancel', () => {
      const b = document.getElementById('pdfBuildCancelBtn');
      b.disabled = true; b.textContent = 'Cancelling…';
      _pdfShowOverlay();
      if (b.disabled) throw new Error('Cancel stayed disabled on the next run — the user could not cancel again');
      if (b.textContent !== 'Cancel') throw new Error('Cancel label not reset, still reads: ' + b.textContent);
      _pdfHideOverlay();
    });

    // ── The "289 of ~238" nonsense in the same overlay ──
    __check('the page total tracks upward so it can never read lower than the page being drawn', () => {
      const S = window.__appSrc;
      const i = S.indexOf("'Building page '");
      if (i < 0) throw new Error('progress label not found');
      const before = S.slice(Math.max(0, i - 600), i);
      if (before.indexOf('pageNum > _pdfEst') < 0) throw new Error('nothing corrects the estimate, so a big deck still shows e.g. "page 289 of ~238"');
    });

    __check('_pdfProgress can update the label without snapping the bar back to zero', () => {
      const bar = document.getElementById('pdfBuildBar');
      _pdfProgress(0.5, 'Halfway…');
      const mid = bar.style.width;
      _pdfProgress(null, 'Cancelling…');
      if (bar.style.width !== mid) throw new Error('a label-only update moved the bar from ' + mid + ' to ' + bar.style.width + ' — cancelling would look like a restart');
      if (document.getElementById('pdfBuildLabel').textContent !== 'Cancelling…') throw new Error('label did not update');
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
