// Export fidelity after the wall rail took 120px off the elevation workspace.
//
// drawElevAll derives elevScale from a LIVE measurement of
// #view-elevation .workspace, but dimension text and line weights are CSS px
// that do not scale with elevScale. So a narrower workspace makes every label
// and line proportionally fatter relative to the wall. exportElevSVG feeds the
// elevation images inside the generated PDF, so without a guard every PDF in
// the project would silently change appearance the moment the rail shipped.
//
// The guard hides the rail for the whole duration of an export, so the
// measurement matches what it was before the rail existed.
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
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      const p = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }));
      __chain = p.then(() => {});
      window.__asyncChecks.push(p);
    };

    editorialContent = editorialContent || {};
    // jsdom does no layout, so drive the measurement drawElevAll actually reads.
    const __mockWorkspace = (w, h) => {
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => w, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => h, configurable: true });
      return ws;
    };
    const __seed = () => {
      elevations = [{ name: 'Wall A', frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      document.getElementById('wallW').value = '185';
      document.getElementById('wallH').value = '108';
    };

    // ── The clamp ──
    __check('EXACT BUG: a hidden or tiny workspace can no longer produce a negative wall size', () => {
      __seed();
      __mockWorkspace(0, 0);   // what a workspace measures on any other view
      drawElevAll();
      const wall = document.getElementById('wall');
      const w = parseFloat(wall.style.width), h = parseFloat(wall.style.height);
      if (!(w > 0)) throw new Error('wall width is ' + wall.style.width + ' — (0 - 160) / wallW used to hand back a NEGATIVE scale');
      if (!(h > 0)) throw new Error('wall height is ' + wall.style.height);
      if (!isFinite(w) || !isFinite(h)) throw new Error('non-finite wall size: ' + wall.style.width + ' x ' + wall.style.height);
    });

    __check('a normal workspace still scales to fit as before (the clamp only catches degenerate sizes)', () => {
      __seed();
      __mockWorkspace(1200, 800);
      drawElevAll();
      const wide = parseFloat(document.getElementById('wall').style.width);
      __seed();
      __mockWorkspace(900, 800);
      drawElevAll();
      const narrow = parseFloat(document.getElementById('wall').style.width);
      if (!(narrow < wide)) throw new Error('a narrower workspace should give a smaller wall: ' + narrow + ' vs ' + wide);
    });

    // ── The rail guard ──
    __check('both export paths hide the wall rail and restore it in their finally block', () => {
      const S = window.__appSrc;
      ['exportElevPNG', 'exportElevSVG'].forEach(fn => {
        const i = S.indexOf('async function ' + fn);
        if (i < 0) throw new Error(fn + ' not found');
        const end = S.indexOf('\\nasync function ', i + 10);
        const body = S.slice(i, end > 0 ? end : i + 60000);
        if (body.indexOf("getElementById('elev-wall-rail')") < 0) throw new Error(fn + ' never looks up the wall rail, so the workspace it measures is 120px narrower than it used to be and every label/line weight shifts relative to the wall');
        if (body.indexOf("style.display = 'none'") < 0) throw new Error(fn + ' does not hide the rail');
        if (body.indexOf('_railDisp') < 0) throw new Error(fn + ' does not restore the rail\\'s previous display value');
        // Restoring must be in the finally, or a thrown/cancelled export leaves
        // the rail hidden for good.
        const fin = body.lastIndexOf('finally');
        const restore = body.lastIndexOf('_rail.style.display = _railDisp');
        if (fin < 0) throw new Error(fn + ' has no finally block to restore from');
        if (!(restore > fin)) throw new Error(fn + ' restores the rail OUTSIDE its finally — a failed or cancelled export would leave the rail hidden');
      });
    });

    __check('EXACT RISK: the rail changes the scale on screen, and hiding it restores the pre-rail value exactly', () => {
      __seed();
      const rail = document.getElementById('elev-wall-rail');
      // Model the real geometry: the rail costs .workspace 120px while displayed
      // and gives it back when hidden. This is the whole reason the guard exists.
      const FULL = 1200;
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', {
        get: () => (rail.style.display === 'none' ? FULL : FULL - 120), configurable: true
      });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });

      rail.style.display = 'none';        // the pre-rail world / what an export sees
      drawElevAll();
      const exportScale = elevScale;

      rail.style.display = '';            // normal on-screen layout
      drawElevAll();
      const screenScale = elevScale;

      // Confirms the hazard is real: without the guard an export would render at
      // screenScale, and since text/line weights are CSS px they would come out
      // proportionally heavier against a smaller wall.
      if (!(screenScale < exportScale)) throw new Error('expected the rail to shrink the on-screen scale; got screen ' + screenScale + ' vs export ' + exportScale);

      rail.style.display = 'none';        // and the guard puts it back exactly
      drawElevAll();
      if (elevScale !== exportScale) throw new Error('hiding the rail did not restore the pre-rail scale: ' + elevScale + ' vs ' + exportScale);
    });

    __check('the guard hides the rail rather than compensating arithmetically', () => {
      const S = window.__appSrc;
      // clientWidth + 120 style fudges break the moment the rail changes width or
      // its presence flips whether .workspace shows a scrollbar.
      if (/clientWidth\\s*\\+\\s*120/.test(S)) throw new Error('found arithmetic compensation for the rail width; hide the rail instead');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
