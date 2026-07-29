// Elevation jitter when dragging a dimension line at fit-to-window.
//
// Reported: at fit-to-window, dragging a measurement line made the vertical and
// horizontal scrollbars flash on and off repeatedly and the drawing jittered.
// Zooming in or out stopped it entirely.
//
// Mechanism: drawElevAll derived the scale from workspace.clientWidth, which
// EXCLUDES scrollbars, and subtracted exactly 160 — #export-wrap's own 80px
// padding on each side. So at fit-to-window the padded content came out exactly
// equal to clientWidth, sitting right on the scrollbar threshold. Each mousemove
// redraws, so: content grows -> scrollbar appears -> clientWidth drops ~15px ->
// smaller scale -> content shrinks -> scrollbar vanishes -> clientWidth recovers
// -> repeat. A feedback loop between the scale and its own measurement. Any
// other zoom puts content clearly above or below the threshold, where the
// scrollbars settle and the loop cannot start — hence "zooming fixes it".
//
// Fix: measure the BORDER box via getBoundingClientRect (a scrollbar eats into
// the content box, not the border box, so it can't feed back), plus a scrollbar
// reserve so the fitted drawing doesn't sit on the threshold either.
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
    const SBW = 15;               // scrollbar thickness the browser would take
    // Geometry chosen so HEIGHT binds the fit while WIDTH is the axis that
    // overflows. That combination is what closes the loop, and it is the case
    // the report describes: a horizontal scrollbar costs clientHEIGHT, so when
    // height is the binding axis the scrollbar feeds straight back into the
    // scale. (Pick a box where width binds instead and the old code happens to
    // be stable — which is why this needs the specific geometry, not just any
    // overflowing workspace.)
    const BOX_W = 1100, BOX_H = 700;
    // A dragged dimension line sits OUTSIDE the wall, so #export-wrap's
    // max-content is wider than wall + padding. This overhang is what tips the
    // fitted layout over the threshold mid-drag.
    const DIM_OVERHANG = 30;

    // .workspace is a fixed border box (its size comes from flex layout, NOT
    // from its own scrollbars), while clientWidth/Height shrink by the scrollbar
    // thickness whenever the padded content exceeds the box on the other axis.
    // That cross-coupling is the loop.
    const installWorkspace = () => {
      const ws = document.querySelector('#view-elevation .workspace');
      const wall = document.getElementById('wall');
      const contentW = () => (parseFloat(wall.style.width) || 0) + 160 + DIM_OVERHANG;
      const contentH = () => (parseFloat(wall.style.height) || 0) + 160;
      Object.defineProperty(ws, 'clientWidth',  { get: () => BOX_W - (contentH() > BOX_H ? SBW : 0), configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => BOX_H - (contentW() > BOX_W ? SBW : 0), configurable: true });
      ws.getBoundingClientRect = () => ({ width: BOX_W, height: BOX_H, top: 0, left: 0, right: BOX_W, bottom: BOX_H });
      return ws;
    };
    const seed = () => {
      elevations = [{ name: 'Wall A', frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;                                   // FIT TO WINDOW — the reported case
      document.getElementById('wallW').value = '185';
      document.getElementById('wallH').value = '108';
      installWorkspace();
    };

    __check('EXACT BUG: repeated redraws at fit-to-window settle on ONE scale instead of oscillating', () => {
      seed();
      // Each mousemove during a dimension drag calls drawElevAll. Run a burst and
      // collect the scale each time.
      const seen = [];
      for (let i = 0; i < 12; i++) { drawElevAll(); seen.push(elevScale); }
      const uniq = Array.from(new Set(seen.map(v => v.toFixed(6))));
      if (uniq.length !== 1) {
        throw new Error('the exact reported bug: scale oscillated across redraws (' + uniq.join(' -> ') + ') — that is the drawing jittering and the scrollbars flashing while you drag');
      }
      if (!(elevScale > 0)) throw new Error('scale is not positive: ' + elevScale);
    });

    __check('the fitted drawing stays clear of the scrollbar threshold, so no scrollbar appears at fit', () => {
      seed();
      drawElevAll();
      const wall = document.getElementById('wall');
      const cw = parseFloat(wall.style.width) + 160 + DIM_OVERHANG, ch = parseFloat(wall.style.height) + 160;
      if (cw > BOX_W) throw new Error('padded content width ' + cw.toFixed(1) + ' exceeds the workspace ' + BOX_W + ' at fit — a horizontal scrollbar would appear');
      if (ch > BOX_H) throw new Error('padded content height ' + ch.toFixed(1) + ' exceeds the workspace ' + BOX_H + ' at fit — a vertical scrollbar would appear');
    });

    __check('the scale ignores a scrollbar appearing, so growing content cannot feed back into it', () => {
      seed();
      drawElevAll();
      const fitted = elevScale;
      // Zoom in so content clearly overflows and both scrollbars are present.
      elevZoomFactor = 2;
      drawElevAll();
      const zoomed = elevScale;
      if (Math.abs(zoomed - fitted * 2) > 1e-9) throw new Error('zoomed scale ' + zoomed + ' is not exactly 2x the fitted ' + fitted + ' — the scrollbars changed the measurement');
      // And it stays put across further redraws while overflowing.
      const seen = [];
      for (let i = 0; i < 8; i++) { drawElevAll(); seen.push(elevScale.toFixed(6)); }
      if (Array.from(new Set(seen)).length !== 1) throw new Error('scale oscillated while scrollbars were present: ' + Array.from(new Set(seen)).join(' -> '));
      elevZoomFactor = 1;
    });

    __check('the measurement reads the border box, which a scrollbar cannot change', () => {
      const S = window.__appSrc;
      const i = S.indexOf('function drawElevAll');
      if (i < 0) throw new Error('drawElevAll not found');
      const body = S.slice(i, i + 4000);
      if (body.indexOf('getBoundingClientRect') < 0) throw new Error('drawElevAll does not measure the border box; clientWidth changes the moment a scrollbar appears, which is what caused the loop');
      if (/workspace\\.clientWidth\\s*-\\s*160/.test(body)) throw new Error('still deriving the scale from clientWidth - 160, the exact expression that sat on the scrollbar threshold');
    });

    __check('a zero-size workspace still yields a positive scale (hidden view, no negative wall)', () => {
      seed();
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 0, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 0, configurable: true });
      ws.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });
      drawElevAll();
      const w = parseFloat(document.getElementById('wall').style.width);
      if (!(w > 0) || !isFinite(w)) throw new Error('wall width is ' + document.getElementById('wall').style.width);
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
