// 19.60, "I like the thumbnails layout of ART.1, all elevation, planview, and frame thumbnails
// are the same height, but in ART.2 since I have a wider wall for the elevation the height
// is no longer aligned ... for the group abc, and per-piece presentation layouts". The
// elevation was fitted INSIDE a fixed box, so a wide wall drew shorter than the plan beside
// it. It is now drawn at the row height and grows wider, and a wall too wide for the room
// is cropped around its pieces (_elevThumbFit), never shrunk.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _planCropCanvasForRow = async () => null;
    _sharedSpecFrames = async () => [];
    const fakeElev = (w, h) => async () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      return { canvas: c, wIn: w / 10, hIn: h / 10, wallLeftFrac: 0.02, wallRightFrac: 0.98, wallTopFrac: 0.05 };
    };
    const fr = (id, letter, x, w) => ({ id: id, letter: letter, x: x, y: 40, w: w, h: 30, active: true, dimTo: [] });
    const setup = (tpl) => {
      editorialContent = _editorialDefaults();
      editorialContent.specTemplate = tpl;
      editorialContent.specGroupSlots = { frame: false, profile: false, plan: true, elevation: true };
      editorialContent.specSlots = { frame: false, profile: false, plan: true, elevation: true };
      elevUnit = 'in'; dashUnit = 'in';
      floorplanLevels = [{ name: 'L1', imageData: '' }];
      dashProjectData = [{ id: 'ART.1', product: 'Framed Art', extW: 30, extH: 30, level: 0 }];
      elevations = [{ id: 'w1', name: 'ART.1', wallW: 320, wallH: 108, frames: [fr('ART.1', 'A', 250, 30)] }];
    };
    // the floorplan box and the elevation's drawn rect on one page
    const row = async (tpl, w, h) => {
      setup(tpl);
      renderElevationToCanvas = fakeElev(w, h);
      let plan = null, elev = null;
      const realSw = _specSwatchBox, realLink = _specPlanRectAdd;
      _specSwatchBox = function (doc, x, y, bw, bh, cap) { if (cap === 'Floorplan') plan = { x, y, w: bw, h: bh }; return realSw.apply(this, arguments); };
      _specPlanRectAdd = function (doc, x, y, rw, rh, lv, el) { if (el) elev = { x, y, w: rw, h: rh }; };
      try {
        const rec = new CanvasPdfRec(936, 540); rec._pxPerPt = 2;
        if (tpl === 'setLegend') await _drawSpecSetPage(rec, {}, 3, {}, { rep: dashProjectData[0], members: dashProjectData, key: 'ART.1' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
        else await _drawSpecPageTemplate(rec, {}, 3, {}, dashProjectData[0], 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
      } finally { _specSwatchBox = realSw; _specPlanRectAdd = realLink; }
      if (!plan || !elev) throw new Error(tpl + ': plan ' + !!plan + ', elevation ' + !!elev);
      return { plan, elev };
    };

    ['setLegend', 'frameSpecDetail'].forEach(tpl => {
      __check('EXACT REQUEST (' + tpl + '): a wide wall is drawn as tall as the floorplan beside it', async () => {
        // 19.64: a per-piece page's room is the template's (the same on every page, so every page
        // of a wall shows the same windows): about 2:1 there, so its wide wall is 1.9:1.
        const asp = tpl === 'setLegend' ? 2.5 : 1.9;
        const r = await row(tpl, 300 * asp, 300);
        if (Math.abs(r.elev.h - r.plan.h) > 0.01) throw new Error('elevation ' + r.elev.h.toFixed(1) + ' tall, floorplan ' + r.plan.h.toFixed(1));
        if (Math.abs((r.elev.y + r.elev.h) - (r.plan.y + r.plan.h)) > 0.01) throw new Error('bottoms differ');
        if (Math.abs(r.elev.w / r.elev.h - asp) > 0.02) throw new Error('drawn at ' + (r.elev.w / r.elev.h).toFixed(2) + ':1, not its own ' + asp + ':1 (cropped or squashed)');
      });
      __check(tpl + ': a wall too long for the room is cropped to it, still full height', async () => {
        const r = await row(tpl, 3000, 300);                     // 10:1 corridor
        if (Math.abs(r.elev.h - r.plan.h) > 0.01) throw new Error('shrunk: ' + r.elev.h.toFixed(1) + ' vs ' + r.plan.h.toFixed(1));
        if (r.elev.w > 936 * 0.4) throw new Error('ran ' + r.elev.w.toFixed(0) + 'pt wide');
        const overlap = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01;
        if (overlap(r.elev, r.plan)) throw new Error('the elevation runs over the floorplan');
      });
    });
    // 19.66: "maybe I just need to make the per piece thumbnails the same size [as Group A/B/C]"
    __check('EXACT REQUEST: per-piece thumbnails are the Group A/B/C size, and a 3:1 wall fits there whole', async () => {
      const g = await row('setLegend', 600, 300), p = await row('frameSpecDetail', 600, 300);
      if (Math.abs(g.plan.h - p.plan.h) > 0.01) throw new Error('group row ' + g.plan.h.toFixed(1) + ', per-piece row ' + p.plan.h.toFixed(1));
      if (Math.abs(p.plan.h - _groupThumbRowH(936, 540)) > 0.01) throw new Error('not the shared row height');
      const w3 = await row('frameSpecDetail', 900, 300);
      if (Math.abs(w3.elev.w / w3.elev.h - 3) > 0.02) throw new Error('a 3:1 wall was split on a per-piece page: ' + (w3.elev.w / w3.elev.h).toFixed(2));
    });
    // 19.65: "maybe I need an option to click split elevation this set"
    ['setLegend', 'frameSpecDetail'].forEach(tpl => {
      __check('EXACT REQUEST (' + tpl + '): Whole wall draws the full long wall, shorter, on the same bottom line', async () => {
        const split = await row(tpl, 3000, 300);
        setSpecUnitElevFit('ART.1', 'whole');
        if (!editorialContent.unitElevFit || editorialContent.unitElevFit['spec:ART.1'] !== 'whole') throw new Error('not stored');
        // row() rebuilds editorialContent, so set it again inside a fresh fixture
        setup(tpl); renderElevationToCanvas = fakeElev(3000, 300);
        editorialContent.unitElevFit = { 'spec:ART.1': 'whole' };
        let plan = null, elev = null;
        const realSw = _specSwatchBox, realLink = _specPlanRectAdd;
        _specSwatchBox = function (doc, x, y, bw, bh, cap) { if (cap === 'Floorplan') plan = { x, y, w: bw, h: bh }; return realSw.apply(this, arguments); };
        _specPlanRectAdd = function (doc, x, y, rw, rh, lv, el) { if (el) elev = { x, y, w: rw, h: rh }; };
        try {
          const rec = new CanvasPdfRec(936, 540); rec._pxPerPt = 2;
          if (tpl === 'setLegend') await _drawSpecSetPage(rec, {}, 3, {}, { rep: dashProjectData[0], members: dashProjectData, key: 'ART.1' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
          else await _drawSpecPageTemplate(rec, {}, 3, {}, dashProjectData[0], 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
        } finally { _specSwatchBox = realSw; _specPlanRectAdd = realLink; }
        if (Math.abs(elev.w / elev.h - 10) > 0.05) throw new Error('not the whole wall: ' + (elev.w / elev.h).toFixed(2) + ':1');
        if (!(elev.h < plan.h - 1)) throw new Error('should be shorter than the row');
        if (Math.abs((elev.y + elev.h) - (plan.y + plan.h)) > 0.01) throw new Error('not on the bottom line of the row');
        if (Math.abs(elev.w - split.elev.w) > 0.5) throw new Error('took more room than the split one: ' + elev.w + ' vs ' + split.elev.w);
      });
    });
    __check('the choice is in This set, keyed into the thumbnail, and Split clears it', () => {
      setup('setLegend');
      const d = _deckPageList().find(x => x.kind === 'spec');
      const k0 = _dsThumbCacheKey(d);
      setSpecUnitElevFit('ART.1', 'whole');
      if (_dsThumbCacheKey(d) === k0) throw new Error('the thumbnail ignores it');
      const host = document.createElement('div'); _dsUnitPagesInto(host, d);
      if (!host.querySelector('#dsUnitElevFit') || host.textContent.indexOf('Whole wall') < 0) throw new Error('no control: ' + host.textContent);
      setSpecUnitElevFit('ART.1', 'split');
      if (editorialContent.unitElevFit) throw new Error('the default was stored');
    });
    __check('the crop keeps the piece in view and leaves the cut side of the wall open', () => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 300;
      const er = { canvas: c, wIn: 300, hIn: 30, wallLeftFrac: 0, wallRightFrac: 1, wallTopFrac: 0 };
      const ft = _elevThumbFit(er, 100, 300, [0.5, 0.52]);   // mid-wall: a window cut on both sides
      if (!ft.cropped || Math.abs(ft.w - 300) > 1e-9) throw new Error('not cropped to the room');
      const win = ft.canvas.width, sx = (0 - ft.er.wallLeftFrac) * win;   // where the crop starts on the wall
      if (!(sx < 0.5 * 3000 && sx + win > 0.52 * 3000)) throw new Error('the piece is outside the crop');
      if (!(ft.er.wallLeftFrac < 0) || !(ft.er.wallRightFrac > 1)) throw new Error('both wall ends should be cut here: ' + ft.er.wallLeftFrac + ' / ' + ft.er.wallRightFrac);
      // 19.64: a cut side gets a break line (a vertical run with a zig-zag), never a wall end
      const calls = []; const doc = { setLineDashPattern() {}, setDrawColor() {}, setLineWidth() {}, rect() { calls.push('rect'); }, line(x1, y1, x2, y2) { calls.push(x1 === x2 ? (y1 < -0.5 || y2 > 100.5 ? 'break' : 'side') : (y1 === y2 ? 'run' : 'zig')); } };
      _drawGroupElevOutline(doc, ft.er, 0, 0, 300, 100);
      if (calls.indexOf('rect') >= 0 || calls.indexOf('side') >= 0) throw new Error('drew a wall end where the wall was cut: ' + calls.join(','));
      if (calls.filter(c => c === 'zig').length < 4 || calls.indexOf('break') < 0) throw new Error('no break line at the cuts: ' + calls.join(','));
      const ok = _elevThumbFit(er, 100, 1200, null);
      if (ok.cropped) throw new Error('cropped a wall that fits');
    });
  `;

  try {
    window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\nwindow.__realREC = renderElevationToCanvas;\n' + testBlock);
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
