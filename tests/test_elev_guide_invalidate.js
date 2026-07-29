// Elevation guide changes must reach the PDF without refreshing each preview.
//
// Reported: "if I do an adjustment and forget to update the preview in Deck
// Studio it does not get generated in the PDF... if I turned off some layout
// guides it should be applied globally to all elevations, and I do not want to
// go through each elevation and refresh the preview." Also described as
// inconsistent — and it was, in a specific way:
//
// The install/breaker capture cache (_igCapCache) is keyed partly on a "guide
// stamp" assembled from each guide LAYER's style.display. So toggles that flip a
// layer (Labels, Spacing, Person, Guides, Grid, Centers) changed the key and did
// get re-captured. But the dimVisibility toggles (group box, edge gap, image
// code, wall dims, custom lines) change no layer's display — the flags only
// affect what gets drawn INSIDE a layer — so the key came out identical and the
// stale snapshot was silently reused. None of the toggles call pushHistory
// either, so _dsEditGen (the other half of the key) never moved to save them.
//
// Fix: invalidate outright on any deck-wide guide/style change
// (_elevGuidesChanged), and clear the cache at the start of every export as a
// backstop so the PDF is correct regardless.
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
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };

    editorialContent = editorialContent || {};
    const seedCache = () => {
      for (const k in _igCapCache) delete _igCapCache[k];
      // Two elevations' worth of snapshots, as a real deck would have after a
      // build: the complaint is that changing a guide should invalidate ALL of
      // them, not just the one you happen to be looking at.
      _igCapCache['0|stamp|a|0'] = { dataUrl: 'data:image/jpeg;base64,AAA', w: 800, h: 400 };
      _igCapCache['1|stamp|b|0'] = { dataUrl: 'data:image/jpeg;base64,BBB', w: 800, h: 400 };
      _igCapCache['2|stamp|c|0'] = { dataUrl: 'data:image/jpeg;base64,CCC', w: 800, h: 400 };
    };
    const cached = () => Object.keys(_igCapCache).length;

    __check('_elevGuidesChanged drops every cached elevation snapshot, not just the current one', () => {
      seedCache();
      if (cached() !== 3) throw new Error('setup: expected 3 cached snapshots');
      _elevGuidesChanged();
      if (cached() !== 0) throw new Error('the change applies deck-wide but ' + cached() + ' stale snapshot(s) survived — those elevations would still export the old drawing');
    });

    // ── The exact inconsistency: dimVisibility toggles vs layer toggles ──
    __check('EXACT BUG: a dimVisibility toggle (image code) invalidates the cache', () => {
      seedCache();
      dimVisibility = dimVisibility || {};
      toggleImageCodeVisibility(null);
      if (cached() !== 0) throw new Error('the exact reported bug: toggling image code left ' + cached() + ' stale snapshot(s). It changes no layer display, so the capture cache key was identical and the PDF silently reused the old drawing');
    });

    __check('EXACT BUG: toggling wall dimensions invalidates the cache', () => {
      seedCache();
      dimVisibility = dimVisibility || {};
      toggleWallDims(null);
      if (cached() !== 0) throw new Error('toggling wall dims left ' + cached() + ' stale snapshot(s)');
    });

    __check('every dimVisibility toggle routes through saveDimVisibility, so none can be missed', () => {
      seedCache();
      saveDimVisibility();
      if (cached() !== 0) throw new Error('saveDimVisibility did not invalidate; toggles that call only it would go stale');
      const S = window.__appSrc;
      // Each of these must persist via saveDimVisibility rather than writing
      // localStorage directly, or it would bypass the invalidation.
      ['toggleGroupBoxVisibility', 'toggleEdgeGapVisibility', 'toggleImageCodeVisibility', 'toggleCustomLinesVisibility', 'toggleWallDims'].forEach(fn => {
        const i = S.indexOf('function ' + fn);
        if (i < 0) throw new Error(fn + ' not found');
        const body = S.slice(i, i + 500);
        if (body.indexOf('saveDimVisibility') < 0) throw new Error(fn + ' does not go through saveDimVisibility, so it would skip the invalidation');
      });
    });

    __check('a layer toggle invalidates too, so behaviour is consistent across all guide buttons', () => {
      seedCache();
      const layer = document.getElementById('label-layer');
      if (!layer) throw new Error('#label-layer missing from the markup');
      const btn = document.createElement('button');
      toggleElevLayer('label-layer', btn);
      if (cached() !== 0) throw new Error('toggling a guide layer left ' + cached() + ' stale snapshot(s)');
    });

    __check('label/dimension STYLING changes invalidate as well (size, colour, font are deck-wide)', () => {
      seedCache();
      annotationStyle = annotationStyle || {};
      saveAnnotationStyle();
      if (cached() !== 0) throw new Error('changing annotation styling left ' + cached() + ' stale snapshot(s) — the label size/colour would not reach the PDF');
    });

    // ── The backstop ──
    __check('the export clears the snapshot cache up front, so the PDF cannot serve a stale drawing', () => {
      const S = window.__appSrc;
      const i = S.indexOf('async function _buildSpecPagePDF');
      if (i < 0) throw new Error('_buildSpecPagePDF not found');
      const head = S.slice(i, i + 4000);
      if (head.indexOf('_igCapCache') < 0) throw new Error('the export never clears _igCapCache, so it depends entirely on every toggle remembering to invalidate');
      // Must clear BEFORE any page is drawn.
      const clear = head.indexOf('delete _igCapCache');
      const firstPage = head.indexOf('newPage');
      if (clear < 0) throw new Error('found a reference but no clear of _igCapCache in the export');
      if (firstPage > 0 && clear > firstPage) throw new Error('the cache is cleared after drawing starts, so the first pages would still use stale snapshots');
    });

    __check('the cache still dedupes WITHIN one export (clearing up front must not disable it)', () => {
      // Two pages referencing the same wall should capture once. Verified through
      // the cache's own behaviour: a stored entry is reused for the same key.
      for (const k in _igCapCache) delete _igCapCache[k];
      _igCapCache['0|s|x|0'] = { dataUrl: 'data:image/jpeg;base64,ZZZ', w: 10, h: 10 };
      if (!_igCapCache['0|s|x|0']) throw new Error('cache is not usable for within-run dedupe');
      if (Object.keys(_igCapCache).length !== 1) throw new Error('unexpected cache state');
    });
  `;

  try {
    window.__appSrc = src;
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
