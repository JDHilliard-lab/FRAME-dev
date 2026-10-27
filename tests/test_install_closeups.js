// 19.85: "one more style of zoomed in detail after this page, and if that style can be full
// bleed and I can pan the image so I can drag the wallcovering and dimension lines for the
// best view"; and "Wallcovering has ABCDEFGHI in the item code in the legend and not A-I".
// Same wall as test_install_detail_pages (Ford Admin Rouge timeline, 272 x 96.5).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    const PPI = 10, WW = 272, WH = 96.5;
    const URL = 'data:image/png;base64,FAKEWALLCOVERING';
    const mkPix = () => {
      const w = WW * PPI, h = Math.round(WH * PPI), L = new Uint8Array(w * h).fill(215);
      const x0 = 3.25 * PPI, x1 = 14.25 * PPI, yb = h - 51.6 * PPI, yt = h - 54.75 * PPI;
      for (let y = Math.round(yt); y < Math.round(yb); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) L[y * w + x] = 60;
      return { w, h, L };
    };
    // Wallcovering I, panel J (3.25..24.75 x 44.1..50.6), frames K and M further along.
    const seed = () => {
      elevUnit = 'in'; dashUnit = 'in';
      const wc = { id: 'ART.3', letter: 'I', product: 'Wallcovering (EGD)', x: 0, y: 0, w: WW, h: WH, active: true, dimTo: [], artworkUrl: URL, artZoom: 1, artPanX: 0, artPanY: 0 };
      const panel = { id: 'ART.3A', letter: 'J', product: 'Didactic Panel', x: 3.25, y: 44.1, w: 21.5, h: 6.5, active: true, dimTo: [] };
      const k = { id: 'ART.2A', letter: 'K', product: 'Framed Art', x: 80, y: 40, w: 30, h: 30, active: true, dimTo: [] };
      const m = { id: 'ART.2B', letter: 'M', product: 'Framed Art', x: 170, y: 40, w: 30, h: 30, active: true, dimTo: [] };
      elevations = [{ id: 'w', name: 'TIMELINE WALL', wallW: WW, wallH: WH, egdWall: true, baseboard: false, frames: [wc, panel, k, m] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      try { drawElevAll(); } catch (e) {}
      elevResolvedWallW = WW; elevResolvedWallH = WH; elevScale = 5;
      _gfxPix.set(_gfxKey(URL), mkPix());
    };
    const ev = (x, y, extra) => Object.assign({ __pt: { x, y }, preventDefault() {}, stopPropagation() {} }, extra || {});
    const withPt = (fn) => { const keep = eventToElevInches; eventToElevInches = (e) => e.__pt; try { return fn(); } finally { eventToElevInches = keep; } };



    // ── CLOSE-UP PAGES ───────────────────────────────────────────────────────
    __check('EXACT ASK: close-up pages follow the detail pages, one per view, keyed apart; none = no page', () => {
      seed();
      editorialContent.specTemplate = 'installGuide';
      _igSet({ detail: true }, 'elev:0');
      setIgCloseups('elev:0', [{ x: 0.3, y: 0.5, z: 2 }, { x: 0.8, y: 0.4, z: 3 }]);
      const keys = _deckPageList().filter(d => d._install).map(_deckPageKey);
      const n = _igDetailPlan(elevations[0]).n;
      const want = ['spec:elev:0'].concat(Array.from({ length: n }, (_, i) => 'spec:elev:0~d' + (i + 1)), ['spec:elev:0~c1', 'spec:elev:0~c2']);
      if (keys.join(',') !== want.join(',')) throw new Error(keys.join(','));
      setIgCloseups('elev:0', []);
      if ('closeups' in ((editorialContent.installGuide.perPage || {})['elev:0'] || {})) throw new Error('an empty list was stored');
      if (_deckPageList().some(d => d._igCloses)) throw new Error('a close-up page stayed');
      _igSet({ detail: false }, 'elev:0');
    });
    __check('a stored view is cleaned on read (zoom clamped, junk dropped)', () => {
      const n = _igCloseN([{ x: 0.5, y: 0.5, z: 99 }, null, 'x', { x: 'a', y: 0.2, z: 0.1 }]);
      if (n.length !== 2 || n[0].z !== IG_CLOSE_Z_MAX || n[1].z !== IG_CLOSE_Z_MIN || n[1].x !== 0.5) throw new Error(JSON.stringify(n));
    });
    __check('EXACT ASK: dragging the page moves the drawing with the pointer', () => {
      const geo = { vw: 3000, vh: 1000, PW: 960, PH: 540 };
      const v = { x: 0.5, y: 0.5, z: 2 };
      const r0 = _igCloseRect(v, geo.vw, geo.vh, geo.PW, geo.PH);
      const v2 = _igCloseAfter(v, geo, { dx: 100, dy: -40, m: 1, ox: 0, oy: 0 });
      const r1 = _igCloseRect(v2, geo.vw, geo.vh, geo.PW, geo.PH);
      if (Math.abs((r1.x - r0.x) - 100) > 1e-6 || Math.abs((r1.y - r0.y) + 40) > 1e-6) throw new Error('moved ' + (r1.x - r0.x) + ',' + (r1.y - r0.y));
    });
    __check('EXACT ASK: scrolling zooms about the pointer, after a drag, as the preview showed it', () => {
      const geo = { vw: 3000, vh: 1000, PW: 960, PH: 540 };
      const v = { x: 0.4, y: 0.6, z: 2 };
      const g = { dx: 30, dy: 10, m: 1.5, ox: 200, oy: -80 };
      const r0 = _igCloseRect(v, geo.vw, geo.vh, geo.PW, geo.PH);
      const r1 = _igCloseRect(_igCloseAfter(v, geo, g), geo.vw, geo.vh, geo.PW, geo.PH);
      // A drawing point's page position under the CSS transform vs in the new render.
      const O = { x: geo.PW / 2 + g.ox, y: geo.PH / 2 + g.oy };
      [[0.1, 0.2], [0.7, 0.9]].forEach(([fx, fy]) => {
        const X = r0.x + fx * r0.w, Y = r0.y + fy * r0.h;
        const sx = O.x + g.dx + g.m * (X - O.x), sy = O.y + g.dy + g.m * (Y - O.y);
        const nx = r1.x + fx * r1.w, ny = r1.y + fy * r1.h;
        if (Math.abs(sx - nx) > 1e-6 || Math.abs(sy - ny) > 1e-6) throw new Error('the render does not match the preview: ' + [sx, nx, sy, ny].join(','));
      });
    });
    __check('the close-up page has its own panel (view, another view, delete), and the wall page offers Add close-up', () => {
      seed();
      editorialContent.specTemplate = 'installGuide';
      const wall = _deckPageList().find(d => d._install);
      const box = document.createElement('div');
      _dsInstallGuideControls(box, wall, {});
      const add = box.querySelector('#igCloseAdd');
      if (!add) throw new Error('no Add close-up');
      const keepR = _dsRefresh; _dsRefresh = () => {};
      try { add.onclick(); } finally { _dsRefresh = keepR; }
      const cu = _igCfg('elev:0').closeups;
      if (!cu || cu.length !== 1) throw new Error('Add did not add a view');
      const page = _deckPageList().find(d => d._igCloses);
      const box2 = document.createElement('div');
      _dsInstallGuideControls(box2, page, {});
      ['igCloseZoom', 'igCloseReset', 'igCloseDup', 'igCloseDel'].forEach(id => { if (!box2.querySelector('#' + id)) throw new Error('missing ' + id); });
      if (box2.querySelector('#igLayoutSel')) throw new Error('a close-up page offers a wall page layout');
      setIgCloseups('elev:0', []);
    });
    __check('a view change gives the page a new thumbnail', () => {
      seed();
      editorialContent.specTemplate = 'installGuide';
      setIgCloseups('elev:0', [{ x: 0.5, y: 0.5, z: 2 }]);
      const d = _deckPageList().find(x => x._igCloses);
      const k1 = _dsThumbCacheKey(d);
      setIgCloseups('elev:0', [{ x: 0.6, y: 0.5, z: 2 }]);
      if (_dsThumbCacheKey(d) === k1) throw new Error('same key after a pan');
      setIgCloseups('elev:0', []);
    });

    // ── FLOOR PLAN KEY ───────────────────────────────────────────────────────
    __check('EXACT ASK: the key prints the set as A–I, not the set code among its letters', () => {
      const keep = _fpGroups;
      _fpGroups = () => [{ key: 'ART.3', num: 3, ids: ['ART.3', 'ART.3A', 'ART.3B', 'ART.3C', 'ART.3D', 'ART.3E', 'ART.3F', 'ART.3G', 'ART.3H', 'ART.3I'], level: 0, rows: [] }];
      try {
        const en = _fpKeyEntries(0)[0];
        if (en.letters.join('') !== 'ABCDEFGHI') throw new Error('letters ' + en.letters.join(','));
        if (_planLetters(en.letters, ' / ') !== 'A–I') throw new Error(_planLetters(en.letters, ' / '));
        if (en.code !== 'ART.3') throw new Error('code column ' + en.code);
      } finally { _fpGroups = keep; }
    });

    window.__cuTest = (async () => {
      const r = [];
      const ck = async (label, fn) => { try { await fn(); r.push({ label, ok: true }); } catch (e) { r.push({ label, ok: false, err: e.message }); } };
      seed();
      const calls = [];
      const doc = new Proxy({}, { get: (t, k) => (...a) => { calls.push([k, a]); return 10; } });
      const keepCap = _igElevCapture, keepFoot = _drawPdfFooter;
      _drawPdfFooter = () => calls.push(['FOOTER']);
      _igElevCapture = async () => ({ cap: { allGuides: true, dataUrl: 'data:image/jpeg;base64,AAAA', w: 3000, h: 1125, pad: { left: 140, safe: 80 },
        boxes: { wall: [140, 80, 2860, 1045] }, vec: { w: 3000, h: 1125, ops: [] } } });
      _pdfFooterDrawn = {};
      try {
        setIgCloseups('elev:0', [{ x: 0.5, y: 0.5, z: 1 }]);
        const arg = Object.assign({}, elevations[0], { _ovKey: 'elev:0', _idx: 0, _igClose: 0, _igCloses: 1 });
        await _drawInstallGuidePage(doc, {}, 9, {}, arg, { PW: 960, PH: 540 });
        await ck('EXACT ASK: full bleed: the drawing reaches every edge, with no title, caption or footer', () => {
          const img = calls.find(c => c[0] === 'addImage');
          if (!img) throw new Error('no image');
          const [, , x, y, w, h] = img[1];
          if (!(x <= 0.01 && y <= 0.01 && x + w >= 959.99 && y + h >= 539.99)) throw new Error('not full bleed: ' + [x, y, w, h].join(','));
          if (calls.some(c => c[0] === 'FOOTER')) throw new Error('a footer was drawn');
          if (calls.some(c => c[0] === 'text')) throw new Error('text printed: ' + calls.filter(c => c[0] === 'text').map(c => c[1][0]).join(' / '));
          if (!_pdfFooterDrawn[9]) throw new Error('the export sweep would add a footer');
          if (!_igCloseGeo['spec:elev:0~c1']) throw new Error('the drag has no geometry to work from');
        });
      } finally { _igElevCapture = keepCap; _drawPdfFooter = keepFoot; _pdfFooterDrawn = null; setIgCloseups('elev:0', []); }
      return r;
    })();
  `;
  window.__SRC = src;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const extra = await window.__cuTest;
  const all = (window.__testResults || []).concat(extra || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
