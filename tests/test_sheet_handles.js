// 20.67: the sheet window's crop, measure and art wall are all things you grab and adjust.
// "I'm not able to get the exact width and height of the wall the first go... it should be a
// box I can grab and move with similar transform handles." / "Anchor points to grab and move
// around to get the perfect crop instead of click and dragging." / "Add an image instead I
// can't even read because it's so dark blue against the dark grey."
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


    const SHEET = { src: 'data:image/png;base64,UVVF', name: 'AI4101-02', natW: 2000, natH: 1000 };
    const SRC = window.__src;
    const seed = (u) => {
      editorialContent = _editorialDefaults();
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = [];
      elevations = [{ id: 'w1', name: 'L1.ART.S24-11', wallW: 126.5, wallH: 131.5, frames: [], contextBlocks: [], glazing: [], groupDims: [], customLines: [], hiddenDims: {}, dimOffsets: {} }];
      if (u) elevations[0].underlay = u;
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const ev = (x, y, extra) => Object.assign({ clientX: x, clientY: y, button: 0, shiftKey: false, altKey: false, preventDefault() {}, stopPropagation() {} }, extra || {});
    const open = () => { seed(null); _ulSheetOpen({ sheet: SHEET }); const st = _ulSh; st.z = 1; st.tx = 0; st.ty = 0; _ulShDraw(); return st; };

    __check('the crop opens as a box with eight handles, not an empty sheet', () => {
      const st = open();
      if (!(st.crop && st.crop.w > 0 && st.crop.h > 0)) throw new Error('no starting box');
      if (st.crop.x <= 0 || st.crop.x + st.crop.w >= 2000) throw new Error('a sheet box should start inside the sheet ' + JSON.stringify(st.crop));
      if (document.querySelectorAll('#ulSheetModal [data-uls-h]').length !== 8) throw new Error('handles ' + document.querySelectorAll('#ulSheetModal [data-uls-h]').length);
      if (_ulShDefaultCrop(SHEET, true).w !== 2000) throw new Error('a picture that is already one elevation should start whole');
      _ulSheetClose();
    });
    __check('hit testing: handles, edges, inside, outside', () => {
      const b = { x: 100, y: 100, w: 200, h: 100 };
      const t = (x, y) => _ulShHit(b, { x, y }, 5);
      if (t(100, 100) !== 'nw' || t(300, 200) !== 'se' || t(200, 100) !== 'n' || t(300, 150) !== 'e') throw new Error('handles');
      if (t(150, 102) !== 'n' || t(103, 170) !== 'w') throw new Error('edges ' + t(150, 102) + ' ' + t(103, 170));
      if (t(200, 150) !== 'move') throw new Error('inside');
      if (t(50, 50) !== null || t(400, 150) !== null) throw new Error('outside');
    });
    __check('dragging a crop handle trims it, inside slides it, a click off the box keeps it', () => {
      const st = open(); const c0 = Object.assign({}, st.crop);
      _ulShDown(ev(c0.x + c0.w, c0.y + c0.h));          // se handle
      _ulShMove(ev(c0.x + c0.w - 100, c0.y + c0.h - 50));
      _ulShUp();
      if (Math.abs(st.crop.w - (c0.w - 100)) > 1e-6 || Math.abs(st.crop.h - (c0.h - 50)) > 1e-6 || st.crop.x !== c0.x) throw new Error('se ' + JSON.stringify(st.crop));
      const c1 = Object.assign({}, st.crop);
      _ulShDown(ev(c1.x + c1.w / 2, c1.y + c1.h / 2)); _ulShMove(ev(c1.x + c1.w / 2 + 40, c1.y + c1.h / 2 + 10)); _ulShUp();
      if (Math.abs(st.crop.x - (c1.x + 40)) > 1e-6 || st.crop.w !== c1.w) throw new Error('move ' + JSON.stringify(st.crop));
      const c2 = Object.assign({}, st.crop);
      _ulShDown(ev(5, 5)); _ulShUp();
      if (JSON.stringify(st.crop) !== JSON.stringify(c2)) throw new Error('a stray click lost the box');
      _ulShDown(ev(10, 10)); _ulShMove(ev(210, 110)); _ulShUp();
      if (st.crop.x !== 10 || st.crop.w !== 200 || st.crop.h !== 100) throw new Error('new box ' + JSON.stringify(st.crop));
      _ulSheetClose();
    });
    __check('the measure: both ends can be dragged after they are down', () => {
      const st = open(); _ulShGo(2); st.z = 1; st.tx = 0; st.ty = 0;
      _ulShDown(ev(100, 500)); _ulShDown(ev(600, 500));
      st.real = 125;
      if (Math.abs(_ulShScale(st) - 4) > 1e-9) throw new Error('scale');
      _ulShDown(ev(602, 501)); _ulShMove(ev(700, 503, { shiftKey: true })); _ulShUp();
      if (st.b.x !== 700 || st.b.y !== 500 || st.a.x !== 100) throw new Error('drag end ' + JSON.stringify([st.a, st.b]));
      _ulSheetClose();
    });
    __check('the art wall is a box at the wall size, its bottom on the floor, with handles', () => {
      const st = open(); st.crop = { x: 200, y: 100, w: 1200, h: 700 };
      _ulShGo(2); st.a = { x: 0, y: 0 }; st.b = { x: 400, y: 0 }; st.real = 100;   // 4 px per inch
      _ulShGo(3); st.z = 1; st.tx = 0; st.ty = 0; _ulShDraw();
      const b = st.wb;
      if (Math.abs(b.w - 126.5 * 4) > 1e-6 || Math.abs(b.h - 131.5 * 4) > 1e-6) throw new Error('size ' + JSON.stringify(b));
      if (Math.abs(b.y + b.h - (800 - 24)) > 1e-6) throw new Error('floor 6 in above the crop bottom ' + (b.y + b.h));
      if (document.querySelectorAll('#ulSheetModal [data-uls-h]').length !== 8) throw new Error('wall handles');
      const W = _ulShWall(st);
      if (Math.abs(W.w - 126.5) > 1e-9 || Math.abs(W.h - 131.5) > 1e-9) throw new Error('reads ' + JSON.stringify(W));
      // Drag the right edge 10 in wider and the top 2 in lower.
      _ulShDown(ev(b.x + b.w, b.y + b.h / 2)); _ulShMove(ev(b.x + b.w + 40, b.y + b.h / 2)); _ulShUp();
      _ulShDown(ev(b.x + 30, b.y)); _ulShMove(ev(b.x + 30, b.y + 8)); _ulShUp();
      const W2 = _ulShWall(st);
      if (Math.abs(W2.w - 136.5) > 1e-9 || Math.abs(W2.h - 129.5) > 1e-9 || Math.abs(W2.floorY - W.floorY) > 1e-9) throw new Error('after drags ' + JSON.stringify(W2));
      if (!_ulShSetWall(st)) throw new Error('Make this wall should tick itself when the box differs');
      st.setWall = false;
      if (_ulShSetWall(st)) throw new Error('an untick must stick');
      _ulSheetClose();
    });
    __check('typing the wall size keeps the left end and the floor, and the field is not rebuilt under the caret', () => {
      const st = open(); _ulShGo(2); st.a = { x: 0, y: 0 }; st.b = { x: 400, y: 0 }; st.real = 100; _ulShGo(3);
      const L = st.wb.x, F = st.wb.y + st.wb.h;
      const inp = document.querySelector('#ulSheetModal [data-uls-ww]');
      inp.value = "10'-0" + String.fromCharCode(34); inp.onchange();
      if (Math.abs(st.wb.w - 480) > 1e-6 || st.wb.x !== L) throw new Error('width ' + JSON.stringify(st.wb));
      _ulShSetWallSize('h', '96');
      if (Math.abs(st.wb.h - 384) > 1e-6 || Math.abs(st.wb.y + st.wb.h - F) > 1e-6) throw new Error('height ' + JSON.stringify(st.wb));
      if (document.querySelector('#ulSheetModal [data-uls-ww]') !== inp) throw new Error('the footer was rebuilt');
      _ulSheetClose();
    });
    __check('arrow keys nudge the box one screen pixel, Shift ten', () => {
      const st = open(); st.z = 2; const x0 = st.crop.x;
      _ulShKey({ key: 'ArrowRight', shiftKey: false, preventDefault() {}, stopPropagation() {} });
      _ulShKey({ key: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {} });
      if (Math.abs(st.crop.x - (x0 + 0.5 + 5)) > 1e-9) throw new Error('nudge ' + (st.crop.x - x0));
      _ulSheetClose();
    });
    __check('Finish writes the three wall points from the box, so files read as before', () => {
      const fin = SRC.slice(SRC.indexOf('async function _ulSheetFinish('), SRC.indexOf('function _underlayCalPreflight('));
      if (fin.indexOf('st.fl = { x: st.wb.x, y: fy }') < 0 || fin.indexOf('st.top = { x: st.wb.x, y: st.wb.y }') < 0) throw new Error('wall box not written as fl/fr/top');
      if (fin.indexOf('const setWall = _ulShSetWall(st)') < 0) throw new Error('Make this wall not honoured');
      const st = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, real: 100, fl: { x: 100, y: 900 }, fr: { x: 600, y: 900 }, top: { x: 100, y: 400 } };
      const wb = _ulShWallInit(Object.assign(st, { elevIdx: 0, sheet: SHEET }));
      if (wb.x !== 100 || wb.w !== 500 || wb.y !== 400 || wb.h !== 500) throw new Error('reopening should rebuild the box from the saved points ' + JSON.stringify(wb));
    });
    __check('the magnifier follows a dragged handle and hides on release', () => {
      const st = open(); const L = document.querySelector('#ulSheetModal [data-uls-loupe]');
      if (!L || L.style.backgroundImage.indexOf(SHEET.src) < 0) throw new Error('no magnifier with the sheet');
      _ulShDown(ev(st.crop.x, st.crop.y)); _ulShMove(ev(st.crop.x + 20, st.crop.y + 20));
      if (L.style.display !== 'block') throw new Error('not shown while dragging');
      _ulShUp();
      if (L.style.display !== 'none') throw new Error('still shown after release');
      _ulSheetClose();
    });
    __check('the panel: status chip, one Edit button, Advanced folded, a readable image button', () => {
      seed(null); renderUnderlayControls();
      const box = document.getElementById('underlayControls');
      if (box.querySelector('a')) throw new Error('a bare link is back (unreadable dark blue)');
      if (!box.querySelector('[data-ul-image]')) throw new Error('no Add a cropped image instead button');
      seed({ src: 'data:image/png;base64,QUJD', x: 0, y: 0, w: 200, h: 100, opacity: 0.35, natW: 800, natH: 400, inDeck: true, deckView: 'drawing',
             sheet: SHEET, crop: { x: 1, y: 2, w: 800, h: 400 }, cal: { at: '2026-11-18' } });
      renderUnderlayControls();
      const chip = box.querySelector('[data-ul-status]');
      if (!chip || chip.textContent.indexOf('Calibrated') < 0) throw new Error('no Calibrated chip');
      const ed = box.querySelector('[data-ul-recrop]');
      if (!ed || ed.getAttribute('onclick').indexOf('_ulEditCropWall') < 0) throw new Error('no Edit crop, scale & wall');
      const adv = box.querySelector('details[data-ul-adv]');
      if (!adv || adv.open || !adv.querySelector('[data-ul-name]')) throw new Error('Advanced should be folded and hold the name and numbers');
      if (box.querySelector('[data-ul-crop]')) throw new Error('the on-wall crop button should be gone');
      elevations[0].underlay.uncal = true; renderUnderlayControls();
      if (box.querySelector('[data-ul-status]').textContent.indexOf('Not calibrated') < 0) throw new Error('no Not calibrated chip');
    });
    __check('Edit on a plain picture opens it as its own sheet, whole', () => {
      seed({ src: 'data:image/png;base64,QUJD', x: 0, y: 0, w: 200, h: 100, opacity: 0.35, natW: 800, natH: 400 });
      _ulEditCropWall();
      if (!_ulSh || _ulSh.sheet.src !== 'data:image/png;base64,QUJD' || _ulSh.crop.w !== 800 || _ulSh.step !== 1) throw new Error(JSON.stringify(_ulSh && _ulSh.crop));
      _ulSheetClose();
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
