// 20.65: the client's FULL sheet, the elevation picked on it, and calibration you cannot skip.
// "Keep the full sheet we get from the client intact... pick the elevation by cropping it,
// then calibrate it. This is a must. How can we force designers to always calibrate?"
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.__src = src;
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const U = () => ({ src: 'data:image/png;base64,QUJD', x: -10, y: -2, w: 320, h: 145, opacity: 0.35, natW: 946, natH: 425, lockAspect: true });
    const seed = (u) => {
      editorialContent = _editorialDefaults();
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [];
      elevations = [{ id: 'w1', name: 'L3.ART.S24-10 MEETING ROOM', wallW: 249, wallH: 144, frames: [], contextBlocks: [], glazing: [], groupDims: [], customLines: [], hiddenDims: {}, dimOffsets: {} }];
      if (u) elevations[0].underlay = u;
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const SRC = window.__src;
    const body = (name) => { const i = SRC.indexOf('async function ' + name + '('); const j = SRC.indexOf('\\nasync function ', i + 10); const k = SRC.indexOf('\\nfunction ', i + 10); return SRC.slice(i, Math.min(j < 0 ? 1e12 : j, k < 0 ? 1e12 : k)); };



    let __info = [];
    showInfoModal = (t, b) => { __info.push(t); };
    __check('lengths are read the way they are written on a drawing', () => {
      const Q = String.fromCharCode(34);   // a double quote; no backslashes inside this template literal
      const cases = [["11'-0" + Q, 132], ["11' 6" + Q, 138], ["11'6", 138], ["10'-6 1/2" + Q, 126.5], ['132' + Q, 132], ['132 in', 132], ['132', 132], ["9'", 108], ['26 1/4' + Q, 26.25]];
      cases.forEach(([s, v]) => { const got = _ulParseLen(s); if (Math.abs(got - v) > 1e-9) throw new Error(s + ' read as ' + got + ', want ' + v); });
      if (!isNaN(_ulParseLen('eleven feet'))) throw new Error('nonsense read as a length');
    });
    __check('a new client elevation arrives NOT CALIBRATED and cannot be shown in the deck', () => {
      seed(Object.assign(U(), { uncal: true }));
      if (_underlayCalibrated(elevations[0].underlay)) throw new Error('reads calibrated');
      __info = [];
      setUnderlayInDeck(true);
      if (elevations[0].underlay.inDeck) throw new Error('Show in deck went on for an uncalibrated drawing');
      if (!__info.length) throw new Error('refused without saying why');
      _setUnderlayInDeckAll(true);
      if (elevations[0].underlay.inDeck) throw new Error('All walls switched on an uncalibrated drawing');
      const imp = body('importElevUnderlay') || SRC.slice(SRC.indexOf('function importElevUnderlay('), SRC.indexOf('function setUnderlayFieldLive('));
      if (imp.indexOf('uncal: true') < 0) throw new Error('an added image does not start uncalibrated');
    });
    __check('an underlay saved before 20.65 (no flag) reads as calibrated, so issued decks are untouched', () => {
      seed(Object.assign(U(), { inDeck: true }));
      if (!_underlayCalibrated(elevations[0].underlay)) throw new Error('an old file would lose its drawing');
    });
    __check('calibrating clears the flag; calibrate takes two clicks and then waits', () => {
      seed(Object.assign(U(), { uncal: true }));
      _ulCalFirst = { x: 0, y: 0 }; _ulCalSpan = 50;
      applyUnderlayCalibration('100');
      if (!_underlayCalibrated(elevations[0].underlay)) throw new Error('still uncalibrated after calibrating');
      const c = SRC.slice(SRC.indexOf('function _ulCalibrateClick('), SRC.indexOf('function applyUnderlayCalibration('));
      if (c.indexOf('if (_ulCalSpan) return;') < 0) throw new Error('a third click still measures again');
      if (c.indexOf('_ulCalLine(') < 0) throw new Error('no line between the two clicks');
    });
    __check('Preflight lists every uncalibrated client elevation', () => {
      seed(Object.assign(U(), { uncal: true }));
      const out = _underlayCalPreflight();
      if (out.length !== 1 || out[0].sev !== 'warn' || out[0].text.indexOf('not calibrated') < 0) throw new Error(JSON.stringify(out));
      seed(U());
      if (_underlayCalPreflight().length) throw new Error('flagged a calibrated one');
      if (SRC.indexOf('issues.push.apply(issues, _underlayCalPreflight())') < 0) throw new Error('not wired into the Preflight run');
    });
    __check('the wall says NOT CALIBRATED, and while calibrating says what to click', () => {
      seed(Object.assign(U(), { uncal: true }));
      _ulBanner(elevations[0].underlay);
      let b = document.querySelector('#wall ._ulBanner');
      if (!b || b.textContent.indexOf('NOT CALIBRATED') !== 0) throw new Error('no banner: ' + (b && b.textContent));
      if (b.getAttribute('data-export-skip') !== '1') throw new Error('the banner could reach an export');
      _ulCalibrateActive = true; _ulCalFirst = null; _ulCalSpan = null;
      _ulBanner(elevations[0].underlay);
      b = document.querySelector('#wall ._ulBanner');
      if (!b || b.textContent.indexOf('click one end') < 0) throw new Error('calibrating gives no prompt');
      _ulCalibrateActive = false;
      seed(U()); _ulBanner(elevations[0].underlay);
      if (document.querySelector('#wall ._ulBanner')) throw new Error('a calibrated wall still has a banner');
    });
    __check('the Wall tab leads with the full sheet; an uncalibrated drawing shows Calibrate now and a locked Show in deck', () => {
      seed(null); renderUnderlayControls();
      if (!document.querySelector('#underlayControls [data-ul-sheet]')) throw new Error('no + Add client sheet');
      seed(Object.assign(U(), { uncal: true })); renderUnderlayControls();
      if (!document.querySelector('#underlayControls [data-ul-uncal]')) throw new Error('no Not calibrated block');
      const sb = document.querySelector('#underlayControls [data-ul-indeck]');
      if (!sb || !sb.disabled) throw new Error('Show in deck is not locked');
      seed(Object.assign(U(), { sheet: { src: 'data:image/png;base64,QQ==', name: 'AI4101-02', natW: 8400, natH: 6000 }, crop: { x: 1, y: 2, w: 3, h: 4 }, cal: { at: '2026-11-18' } })); renderUnderlayControls();
      if (!document.querySelector('#underlayControls [data-ul-recrop]')) throw new Error('no Re-crop or recalibrate');
      elevations.push({ id: 'w2', name: 'W2', wallW: 100, wallH: 100, frames: [], underlay: Object.assign(U(), { sheet: elevations[0].underlay.sheet }) });
      if (_ulSheets().length !== 1) throw new Error('two walls on one sheet should list it once');
    });
    __check('the sheet maths: scale from a known dimension, the wall from its floor ends and ceiling', () => {
      const st = { a: { x: 100, y: 500 }, b: { x: 600, y: 500 }, real: 125, fl: { x: 120, y: 900 }, fr: { x: 620, y: 902 }, top: { x: 120, y: 372 } };
      if (Math.abs(_ulShScale(st) - 4) > 1e-9) throw new Error('scale ' + _ulShScale(st));
      const W = _ulShWall(st);
      if (Math.abs(W.w - 125) > 1e-9 || Math.abs(W.h - 132.25) > 1e-9 || W.floorY !== 901 || W.left !== 120) throw new Error(JSON.stringify(W));
      const fin = SRC.slice(SRC.indexOf('async function _ulSheetFinish('), SRC.indexOf('function _underlayCalPreflight('));
      ['sheet: st.sheet', 'crop: {', "deckView: 'drawing'", 'cal: {', '(c.x - W.left) / k * toU', '(W.floorY - (c.y + c.h)) / k * toU'].forEach(t => { if (fin.indexOf(t) < 0) throw new Error('finish lost: ' + t); });
      if (fin.indexOf('uncal') >= 0) throw new Error('a finished sheet must not be marked uncalibrated');
    });
    __check('the print area is drawn on the editor when the drawing prints whole', () => {
      seed(Object.assign(U(), { inDeck: true, deckView: 'drawing' })); elevScale = 2;
      _ulPlacing = false;   // a calibration hands over to Place; the box hides while placing
      renderElevUnderlay(249, 144);
      const pa = document.querySelector('#underlay-layer ._ulPrintArea');
      if (!pa || pa.textContent.indexOf('PRINTS ON THE PAGE') < 0) throw new Error('no print area box');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
