// Elevation breaker pages must mirror the Elevations tab exactly.
//
// Reported bug: wall dimensions (185" / 108") were visibly ON in the Elevations
// tab, but the breaker page in Deck Studio showed a clean elevation without
// them. Same for the hang-height/AFF line. The cause was a "Show layout guides"
// opt-in: with it off, the breaker capture force-hid spacing, hang height and
// wall dims regardless of the editor, so the two views disagreed.
//
// The fix removes that split entirely — there is one capture path, it never
// overrides guide visibility, and the Elevations tab is the sole source of
// truth. These checks lock that in.
const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };

    __check('EXACT BUG: the breaker capture never force-hides wallDims/hangHeight/spacing, so guides on in the Elevations tab show on the breaker', () => {
      const S = window.__appSrc;
      // The old forcing object passed to _captureElevWithGuides for breakers.
      if (/wallDims:\\s*false/.test(S)) throw new Error('the exact reported bug: something still forces wallDims off, so a breaker can disagree with the Elevations tab');
      if (/hangHeight:\\s*false/.test(S)) throw new Error('something still forces hangHeight off for a capture');
      if (/spacing:\\s*false/.test(S)) throw new Error('something still forces spacing off for a capture');
    });

    __check('_captureElevWithGuides takes only an elevation index — it has no guide-override parameter to disagree with the editor through', () => {
      const S = window.__appSrc;
      const m = /async function _captureElevWithGuides\\(([^)]*)\\)/.exec(S);
      if (!m) throw new Error('_captureElevWithGuides not found');
      const params = m[1].split(',').map(s => s.trim()).filter(Boolean);
      if (params.length !== 1) throw new Error('expected exactly one parameter (elevIdx), got: ' + JSON.stringify(params));
      if (typeof _captureElevWithGuides !== 'function') throw new Error('_captureElevWithGuides is not defined');
      if (_captureElevWithGuides.length !== 1) throw new Error('arity should be 1, got ' + _captureElevWithGuides.length);
    });

    __check('the redundant "Show layout guides" breaker control and its stored setting are gone', () => {
      // Strip // comments first: the phrase legitimately survives in comments
      // explaining why the control was removed, which is not the same as the
      // control still existing. Only real code/strings count here.
      // Split on CRLF *or* LF: app.js uses CRLF, and a stray \\r would block the
      // comment regex from ever reaching end-of-line (JS "." excludes \\r).
      const code = window.__appSrc.split(/\\r?\\n/).map(l => l.replace(/(^|[^:'"\\\\])\\/\\/.*$/, '$1')).join('\\n');
      if (typeof _breakerMeasure !== 'undefined') throw new Error('_breakerMeasure still exists — the opt-in split is still reachable');
      if (code.indexOf('breakerMeasure') >= 0) throw new Error('breakerMeasure setting is still read/written somewhere');
      if (code.indexOf('Show layout guides') >= 0) throw new Error('the "Show layout guides" checkbox is still in the UI');
      // The sibling breaker options must survive — only the guides opt-in went.
      if (typeof _elevBreakers !== 'function') throw new Error('_elevBreakers was removed by mistake');
      if (typeof _breakerNoPlan !== 'function') throw new Error('_breakerNoPlan (Elevation only) was removed by mistake');
    });

    __check('a fresh project carries no breakerMeasure key, and normalizing an old project does not resurrect one', () => {
      const d = _editorialDefaults();
      if ('breakerMeasure' in d) throw new Error('breakerMeasure is still in the editorial defaults');
      // Simulate loading an OLD project that still has the retired flag saved.
      const old = _editorialDefaults(); old.breakerMeasure = false;
      editorialContent = old;
      if (typeof _normalizeEditorial === 'function') _normalizeEditorial(editorialContent);
      // Retired keys may linger harmlessly in old saves, but nothing may depend
      // on one: breakers must mirror the editor either way.
      if (typeof _breakerMeasure !== 'undefined') throw new Error('a retired flag is still driving behaviour');
    });

    __check('guide-layer holds the wall-center AND hang-height guides together, and neither is conditionally suppressed at draw time', () => {
      const S = window.__appSrc;
      const i = S.indexOf('function drawElevGuides');
      if (i < 0) throw new Error('drawElevGuides not found');
      // Slice to the NEXT function, not a fixed byte count. A 1400-char window
      // used to reach both guides, then a comment above the hang block pushed
      // 'hang-guide' past it and this failed on an unchanged renderer.
      const _end = S.indexOf('\\nfunction ', i + 10);
      const body = S.slice(i, _end > 0 ? _end : i + 6000);
      if (body.indexOf('center-guide') < 0) throw new Error('wall-center guide missing from drawElevGuides');
      if (body.indexOf('hang-guide') < 0) throw new Error('hang-height guide missing from drawElevGuides');
      // The hang block is gated on geometry only (it must fit on the wall) —
      // not on any capture/breaker suppression flag.
      if (!/if\\s*\\(hangVal < wallH\\)/.test(body)) throw new Error('hang-height should be gated on geometry alone; found an extra suppression condition');
    });

    __check('breaker and install-guide captures share one cache key per elevation state (no clean-vs-guides variants)', () => {
      const S = window.__appSrc;
      const i = S.indexOf('const capKey =');
      if (i < 0) throw new Error('capKey not found');
      const line = S.slice(i, S.indexOf('\\n', i));
      if (line.indexOf('breaker') >= 0) throw new Error('capKey still distinguishes a breaker-only capture variant');
    });
  `;
  try { window.__appSrc = JSON.stringify(src); window.eval('window.__appSrc = ' + window.__appSrc + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
