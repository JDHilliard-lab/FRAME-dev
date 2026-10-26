// 19.70: the baseboard is per wall. Asked on the Ford Admin Rouge timeline wall: "I'm not
// sure if the wall will have a baseboard, I need an option to include or exclude baseboard
// for individual walls." The height stays deck-wide (Elevation settings).
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


    const wc = (y) => ({ id: 'ART.3', letter: 'A', product: 'Wallcovering (EGD)', x: 0, y: y, w: 272, h: 96.5, active: true, dimTo: [] });
    const setup = () => {
      editorialContent = _editorialDefaults();
      elevUnit = 'in'; dashUnit = 'in'; elevBaseboardIn = 4;
      dashProjectData = [{ id: 'ART.3', product: 'Wallcovering (EGD)', extW: 272, extH: 96.5 }];
      elevations = [
        { id: 'wA', name: 'WITH', wallW: 272, wallH: 100.5, egdWall: true, frames: [wc(4)] },
        { id: 'wB', name: 'WITHOUT', wallW: 272, wallH: 96.5, egdWall: true, baseboard: false, frames: [wc(0)] },
      ];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };

    __check('EXACT ASK: a wall can have no baseboard while another keeps one', () => {
      setup();
      if (getBaseboardHeight(elevations[0]) !== 4) throw new Error('wall A lost its baseboard: ' + getBaseboardHeight(elevations[0]));
      if (getBaseboardHeight(elevations[1]) !== 0) throw new Error('wall B still has one: ' + getBaseboardHeight(elevations[1]));
      currentElevIndex = 1;
      if (getBaseboardHeight() !== 0) throw new Error('no argument does not read the wall on screen');
    });
    __check('a wall with no baseboard draws no baseboard line on screen', () => {
      setup(); currentElevIndex = 1; elevFrames = elevations[1].frames;
      try { drawElevAll(); } catch (e) {}
      if (document.getElementById('baseboard-line')) throw new Error('baseboard line drawn on wall B');
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      try { drawElevAll(); } catch (e) {}
      if (!document.getElementById('baseboard-line')) throw new Error('wall A lost its line (the screen test proves nothing)');
    });
    __check('fit to wall and the EGD clamp use THAT wall: floor to ceiling with none', () => {
      setup(); currentElevIndex = 0;              // the screen shows A; B is fitted
      const f = elevations[1].frames[0]; f.y = 9; f.h = 50;
      fitFlatGraphicToWall(elevations[1], f);
      if (f.y !== 0 || f.h !== 96.5) throw new Error('fit gave y ' + f.y + ' h ' + f.h);
      const g = elevations[1].frames[0]; g.y = 0; g.h = 96.5;
      _clampFlatToWall(elevations[1], g);
      if (g.y !== 0) throw new Error('clamp lifted it onto a baseboard the wall does not have: y ' + g.y);
    });
    __check('a spec-page thumbnail of a wall with no baseboard reports none', async () => {
      setup(); currentElevIndex = 0;
      const er = await renderElevationToCanvas(elevations[1], null, { dpi: 10 });
      if (!er || er.bbIn !== 0) throw new Error('bbIn ' + (er && er.bbIn));
      const er2 = await renderElevationToCanvas(elevations[0], null, { dpi: 10 });
      if (!er2 || er2.bbIn !== 4) throw new Error('wall A bbIn ' + (er2 && er2.bbIn));
    });
    __check('the This wall switch turns it off, and the wallcovering drops to the floor with it', () => {
      setup(); currentElevIndex = 0; elevFrames = elevations[0].frames;
      _elevWallGuidesSync();
      const cb = document.querySelector('#elevWallGuides input[data-ewg="baseboard"]');
      if (!cb) throw new Error('no Baseboard switch on an EGD wall');
      if (!cb.checked) throw new Error('switch shows off for a wall with a baseboard');
      setElevBaseboard(false);
      if (elevations[0].baseboard !== false) throw new Error('not stored');
      if (elevations[0].frames[0].y !== 0) throw new Error('wallcovering left floating at y ' + elevations[0].frames[0].y);
      if (elevations[0].frames[0].h !== 96.5) throw new Error('size changed');
      setElevBaseboard(true);
      if ('baseboard' in elevations[0]) throw new Error('on should store nothing');
      if (elevations[0].frames[0].y !== 4) throw new Error('did not go back onto the baseboard');
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
