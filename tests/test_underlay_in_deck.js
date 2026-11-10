// 20.31: a client elevation can be the wall's drawing. Designers took FRAME's frames into
// InDesign only to lay them over the architect's elevation, because the client's drawing is
// the page a client expects. A wall switched to Show in deck prints its calibrated client
// elevation behind the frames, at full strength, clipped to the wall. Off by default: the
// tracing guide still never exports unless asked.
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

    __check('off by default: a tracing guide draws nothing in an export', () => {
      seed(U());
      if (_underlayInDeck(elevations[0])) throw new Error('on by default');
      if (_underlayDeckSvg(elevations[0], { x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 80, h: 40 }, 'w1').length) throw new Error('drew a guide');
      seed(null);
      if (_underlayInDeck(elevations[0])) throw new Error('no underlay reads as in deck');
    });
    __check('Show in deck: the drawing is an image clipped to the wall box, behind the frames', () => {
      seed(Object.assign(U(), { inDeck: true }));
      if (!_underlayInDeck(elevations[0])) throw new Error('switched on but reads off');
      const out = _underlayDeckSvg(elevations[0], { x: 5, y: 6, w: 940, h: 425 }, { x: 40, y: 0, w: 730, h: 422 }, 'ev 1');
      if (out.length !== 2) throw new Error('parts ' + out.length);
      if (out[0] !== '<clipPath id="ulclip-ev_1"><rect x="40.0" y="0.0" width="730.0" height="422.0"/></clipPath>') throw new Error(out[0]);
      if (out[1].indexOf('<image x="5.0" y="6.0" width="940.0" height="425.0" preserveAspectRatio="none" clip-path="url(#ulclip-ev_1)" xlink:href="data:image/png;base64,QUJD"') !== 0) throw new Error(out[1]);
      if (_underlayDeckSvg(elevations[0], { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 10, h: 10 }).length) throw new Error('an unlaid-out image drew');
    });
    __check('the switch is one undo step, removes its key when off, and recaptures the wall', () => {
      seed(U());
      const before = _elevCaptureSignature();
      setUnderlayInDeck(true);
      if (elevations[0].underlay.inDeck !== true) throw new Error('not set');
      if (_elevCaptureSignature() === before) throw new Error('capture signature did not change, the deck would keep the old picture');
      setUnderlayInDeck(false);
      if ('inDeck' in elevations[0].underlay) throw new Error('off should delete the key');
    });
    __check('the wall panel offers it, and says what it does', () => {
      seed(U());
      renderUnderlayControls();
      let b = document.querySelector('#underlayControls [data-ul-indeck]');
      if (!b || b.textContent.trim() !== 'Show in deck') throw new Error('button ' + (b && b.textContent));
      setUnderlayInDeck(true);
      b = document.querySelector('#underlayControls [data-ul-indeck]');
      if (!b || b.className.indexOf('gz-btn-on') < 0 || b.textContent.indexOf('Shown in deck') < 0) throw new Error('on state ' + (b && b.outerHTML));
    });
    __check('the SVG export draws it first in the back layer; the artboard bounds still ignore it', () => {
      const b = body('exportElevSVG');
      const iUl = b.indexOf('backLayer.push(..._underlayDeckSvg(');
      const iWall = b.indexOf('WALL outline');
      const iFrames = b.indexOf('const _shadows');
      if (iUl < 0) throw new Error('exportElevSVG never draws the deck underlay');
      if (!(iUl < iWall)) throw new Error('underlay must be pushed before anything else in the back layer');
      if (iFrames >= 0 && !(iUl < iFrames)) throw new Error('underlay after the frames');
      const list = b.slice(b.indexOf("['frame-layer'"), b.indexOf('].forEach(id =>', b.indexOf("['frame-layer'")));
      if (list.indexOf('underlay') >= 0) throw new Error('the bounds list now includes the underlay: an unaligned drawing would resize the artboard');
    });
    __check('the PNG export hides a guide but keeps a deck drawing, full strength and clipped', () => {
      const b = body('exportElevPNG');
      if (b.indexOf("_underlayInDeck(elevations[currentElevIndex])") < 0) throw new Error('PNG export ignores the switch');
      if (b.indexOf("_ulLayer.style.overflow = 'hidden'") < 0 || b.indexOf("_ulImg.style.opacity = '1'") < 0) throw new Error('not clipped / not full strength');
      if (b.indexOf("else if (_ulLayer) _ulLayer.style.display = 'none'") < 0) throw new Error('a guide is no longer hidden');
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
