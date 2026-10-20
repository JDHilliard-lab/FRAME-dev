// 19.42: A GENERATED PDF NEVER SHIPS A PLACEHOLDER ELEVATION QUIETLY.
//
// Reported on the Ford SLC install guide: Generate PDF produced pages printing
// "Updating this elevation drawing…" where the wall should be. The rail's background
// "Updating elevations" pass held the one elevation view; a page waited six seconds for
// it and gave up, or lost the one-capture-at-a-time lock to it and gave up after one
// retry. The fail-safe: the export stops background work and waits for the view before
// it starts; a page waits and retries during an export; and every page that still drew
// a placeholder is recorded, so the export rebuilds once and, if any are still missing,
// asks before saving. This runs the REAL export with the REAL jsPDF.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABqADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAGAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/Be91dbzSNO0lbC1tzp5mJuIkZbi485g375ixDbMYTAXAz1JzWPRRQB//9k=';
  window.HTMLCanvasElement.prototype.toDataURL = () => JPG;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };
  window.__JPG = JPG;
  const quiet = console.error; console.error = () => {};
  window.eval(src + `
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    _pdfShowOverlay = () => {}; _pdfHideOverlay = () => {}; _pdfProgress = () => {};
    _registerPdfFonts = async () => {}; _loadEditorBrandFonts = async () => {};
    _getPdfLogos = async () => ({});
    _exportSettle = async () => {};
    _dsBuildAllThumbs = () => {};
    window.__setup = () => {
      const row = (id) => Object.assign(_cloneData(dashDefaultData), { id: id, location: 'Lobby', extW: 24, extH: 30 });
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [row('ART.1'), row('ART.2')];
      const fr = (id) => ({ id: id, letter: 'A', x: 40, y: 40, w: 24, h: 30, active: true, dimTo: [] });
      elevations = [{ id: 'e1', name: 'ART.1 | Lobby', wallW: 120, wallH: 108, frames: [fr('ART.1')] }, { id: 'e2', name: 'ART.2 | Hall', wallW: 120, wallH: 108, frames: [fr('ART.2')] }];
      floorplanLevels = [{ name: 'Level 1', imageData: null }];
      editorialContent.specTemplate = 'installGuide';
      ['cover', 'understanding', 'narrative', 'strategy', 'floorplanKey', 'slogan', 'contacts', 'frameRec', 'timeline'].forEach(k => { const cb = document.getElementById('specInc_' + k); if (cb) cb.checked = false; });
      const sp = document.getElementById('specInc_spec'); if (sp) sp.checked = true;
      for (const k in _igCapCache) delete _igCapCache[k];
    };
    window.__export = async (captureFn, answer) => {
      window.__setup();
      const asked = []; let shown = 0, calls = 0; const got = {};
      _captureElevWithGuides = async (i) => { calls++; const c = captureFn(i, calls); if (c) got[i] = 1; return c; };
      _askYesNo = async (t, body) => { asked.push(body); return answer; };
      showSpecPdfPreview = () => { shown++; };
      await exportSpecPagePDF({ all: true, include: _dsInclude(), meta: {}, preview: true });
      return { asked, shown, calls, walls: Object.keys(got).length };
    };
    window.__good = () => ({ dataUrl: window.__JPG, w: 120, h: 80, vec: null });
    window.__setPrime = (on) => { _elevPrimeActive = on; };
  `);
  console.error = quiet;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('a capture that fails a few times, then works, never reaches the user', async () => {
    // Each wall's first three attempts fail (more than one page's own retries), so the
    // ledger + rebuild has to rescue it.
    const tries = {};
    const r = await window.__export((i) => { tries[i] = (tries[i] || 0) + 1; return tries[i] > 3 ? window.__good() : null; }, false);
    if (r.asked.length) throw new Error('asked the user although a rebuild fixed it: ' + r.asked[0]);
    if (r.shown !== 1) throw new Error('PDF delivered ' + r.shown + ' times');
    if (r.walls !== 2) throw new Error('only ' + r.walls + ' of 2 walls were ever captured, so the PDF has a placeholder');
  });

  await check('EXACT BUG: elevations that never render are NOT handed over quietly', async () => {
    const r = await window.__export(() => null, false);
    if (!r.asked.length) throw new Error('the PDF was delivered with placeholders and nobody was told');
    if (r.asked[0].indexOf('Page') < 0 || r.asked[0].indexOf('ART.1') < 0) throw new Error('the question does not say which pages: ' + r.asked[0]);
    if (r.shown !== 0) throw new Error('Cancel still delivered the PDF');
  });

  await check('"Save anyway" still delivers it', async () => {
    const r = await window.__export(() => null, true);
    if (r.shown !== 1) throw new Error('not delivered after Save anyway');
  });

  await check('EXACT BUG: a background "Updating elevations" pass at Generate time is waited out, not printed as a placeholder', async () => {
    window.__setPrime(true);
    // Longer than the six seconds a page used to wait before giving up.
    setTimeout(() => window.__setPrime(false), 7000);
    const r = await window.__export(() => window.__good(), false);
    if (r.asked.length) throw new Error('a page printed its placeholder: ' + r.asked[0]);
    if (r.shown !== 1) throw new Error('not delivered');
    if (r.walls !== 2) throw new Error('only ' + r.walls + ' of 2 walls were captured');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
