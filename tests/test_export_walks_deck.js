// 18.32: THE PDF EXPORT WALKS THE DECK STUDIO PAGE LIST.
//
// The export used to build its own plan (`_stepsFor`, a hand mirror of _deckPageList)
// and its own per-page dispatch, and the preview had a third copy of the dispatch.
// Three rules drifted between the two lists before each was made a shared helper, and
// two still disagreed when this was written:
//   - a layout page placed `beforeContacts` printed BEFORE Good Art Good People in the
//     PDF and showed AFTER it in Deck Studio;
//   - an EMPTY layout page was skipped in its slot and then swept onto the END of the
//     PDF, while Deck Studio showed it in place.
// Both are in the fixture below, so this check fails on the old code (confirmed by
// running it against 18.31). It runs the REAL export with the REAL jsPDF, and reads
// the page key each page is created under, which is what annotations, themes, pinned
// pages and approval stamps all hang off.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // jsdom has no canvas. Every raster on these pages (frame mockups, captures) goes
  // through one, so give it a 2D context that accepts any call and draws nothing; this
  // test is about WHICH pages print, and the per-page drawers have their own tests.
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  window.HTMLCanvasElement.prototype.toDataURL = () => PNG1;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    window.__run = (async () => {
      scheduleAutosave = () => {}; pushHistory = () => {};
      _pdfShowOverlay = () => {}; _pdfHideOverlay = () => {}; _pdfProgress = () => {};
      _registerPdfFonts = async () => {}; _loadEditorBrandFonts = async () => {};
      _getPdfLogos = async () => ({});
      _captureElevWithGuides = async () => null;
      let shown = null; showSpecPdfPreview = (doc) => { shown = doc; };
      // Record the key every PDF page is created under. newPage() opens the plan-link
      // ledger for each page with its key, and only jsPDF documents have .internal.
      const keys = [];
      const _begin = _specPlanRectsBegin;
      _specPlanRectsBegin = (doc, key) => { if (doc && doc.internal && doc.addPage) keys.push(key); return _begin(doc, key); };

      const row = (id, extra) => Object.assign(_cloneData(dashDefaultData), { id: id, location: 'Lobby', extW: 24, extH: 30 }, extra || {});
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [
        row('ART.1'), row('ART.2A'), row('ART.2B'),
        row('EGD.1', { product: 'Wallcovering (EGD)', extW: 100, extH: 90 }),
        row('EGD.2', { product: 'Wallcovering (EGD)', extW: 60, extH: 90 })
      ];
      const fr = (id, x) => ({ id: id, letter: id.slice(-1), x: x, y: 50, w: 24, h: 30, active: true });
      elevations = [
        { id: 'e1', name: 'ART.2', w: 200, h: 108, frames: [fr('ART.2A', 20), fr('ART.2B', 80)] },
        { id: 'e2', name: 'EGD', w: 200, h: 108, frames: [Object.assign(fr('EGD.1', 0), { w: 100, h: 90 }), Object.assign(fr('EGD.2', 110), { w: 60, h: 90 })] }
      ];
      floorplanLevels = [{ name: 'Level 1', imageData: null }];
      editorialContent.specTemplate = 'frameSpecDetail';
      editorialContent.elevBreakers = true;
      editorialContent.layoutPages = [
        { id: 'pgfull', type: 'moodboard', place: 'beforeContacts', elements: [{ type: 'text', text: 'hi', x: .1, y: .1, w: .3, h: .1 }] },
        { id: 'pgempty', type: 'moodboard', place: 'afterCover', elements: [] }
      ];
      ['cover', 'understanding', 'narrative', 'strategy', 'floorplanKey', 'spec', 'slogan', 'contacts'].forEach(k => {
        const el = document.getElementById('specInc_' + k); if (el) el.checked = true;
      });
      ['timeline', 'frameRec'].forEach(k => { const el = document.getElementById('specInc_' + k); if (el) el.checked = false; });
      window._exportScope = { mode: 'all' };

      const want = _deckPageList().map(_deckPageKey);
      let err = null;
      try { await _buildSpecPagePDF({ all: true, include: _dsInclude(), meta: {}, preview: true }); } catch (e) { err = e; }

      __check('the export ran to the end with the real jsPDF', () => {
        if (err) throw new Error('threw: ' + (err.stack || err.message || err));
        if (!shown) throw new Error('no document reached the preview');
      });
      __check('EXACT BUG: the PDF prints the pages Deck Studio lists, in the same order, under the same keys', () => {
        const got = keys.join('\\n'), exp = want.join('\\n');
        if (got !== exp) throw new Error('studio:\\n' + exp + '\\n--- pdf:\\n' + got);
      });
      __check('the fixture really contains both pages that used to drift', () => {
        const iFull = want.indexOf('layout:pgfull'), iSlogan = want.indexOf('fixed:slogan'), iEmpty = want.indexOf('layout:pgempty');
        if (iFull < 0 || iSlogan < 0 || iEmpty < 0) throw new Error('fixture lost a page: ' + want.join(', '));
        if (iEmpty !== want.length - 1 && iEmpty > want.indexOf('fixed:narrative')) throw new Error('the empty page is not where the studio puts it');
      });
      __check('the page count matches too, so page-number links point where the rail says', () => {
        if (shown && shown.getNumberOfPages() !== want.length) throw new Error(shown.getNumberOfPages() + ' PDF pages vs ' + want.length + ' studio pages');
      });
      __check('a breaker, a merged flat sheet and a floorplan key are all in that list', () => {
        if (!want.some(k => k && k.indexOf('spec:elevgrp:') === 0)) throw new Error('no breaker in the fixture deck');
        if (want.indexOf('spec:EGD.1 + EGD.2') < 0) throw new Error('the two wallcoverings on one wall were not merged: ' + want.join(', '));
        if (want.indexOf('floorplan:0') < 0) throw new Error('no floorplan key');
      });
    })();
    __check('the export has no page list of its own left to drift', () => {
      const a = S.indexOf('async function _buildSpecPagePDF');
      const body = S.slice(a, S.indexOf('\\nasync function exportDashNativePNG', a));
      if (body.indexOf('_deckPageList()') < 0) throw new Error('the export does not walk _deckPageList');
      ['_deckPlanSlots(', '_buildSpecUnits(', '_breakerElevFor(', '_partitionFlatMembers(', 'emitLayout'].forEach(n => {
        if (body.indexOf(n) >= 0) throw new Error('the export builds pages itself again: ' + n);
      });
      if (body.indexOf('_drawDeckPage(') < 0) throw new Error('the export does not draw through the shared dispatch');
    });
    __check('the preview draws through the same dispatch', () => {
      const a = S.indexOf('async function renderDeckPageCanvas');
      const b = S.indexOf('async function renderSpecPageCanvas');
      if (S.slice(a, S.indexOf('\\n}\\n', a)).indexOf('_drawDeckPage(') < 0) throw new Error('renderDeckPageCanvas has its own dispatch');
      if (S.slice(b, S.indexOf('\\n}\\n', b)).indexOf('_drawDeckSpecPage(') < 0) throw new Error('renderSpecPageCanvas has its own dispatch');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
