// 19.83: "additional pages of it zoomed in as much as possible: lock in the height of the
// safe frame and have the wallcovering pan from left to right showing a section on each
// page, and remove the title, subheader and installation notes"; "an option to add a
// redline outlining the panels as well as the frames"; "under layout I cannot read the
// other buttons next to Elev only, maybe it should be a dropdown". Same wall as
// test_wall_coordination (Ford Admin Rouge timeline, 272 x 96.5).
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


    // ── DETAIL PAGES ─────────────────────────────────────────────────────────
    __check('EXACT ASK: the wall at full safety height takes as few pages as fit, each window inside the width', () => {
      seed();
      const P = _igDetailPlan(elevations[0]);
      if (!(P.n >= 2 && P.n <= IG_DETAIL_MAX)) throw new Error(P.n + ' pages');
      const s = P.BH / (WH + 2 * P.Gv);
      if (!(P.widest * s <= P.BW * 1.0001)) throw new Error('widest window does not fit: ' + (P.widest * s) + ' > ' + P.BW);
      if (P.n > 1) {
        const wins = _igWindows(elevations[0], P.n - 1);
        const w2 = Math.max.apply(null, wins.map(w => (isFinite(w.hi) ? w.hi : WW + P.G) - (isFinite(w.lo) ? w.lo : -P.G)));
        if (w2 * s <= P.BW * 1.0001) throw new Error('one page fewer would have fitted');
      }
    });
    __check('EXACT ASK: Detail pages follow the wall page, keyed apart, sharing its settings; off takes them away', () => {
      seed();
      editorialContent.specTemplate = 'installGuide';
      _igSet({ detail: true }, 'elev:0');
      const n = _igDetailPlan(elevations[0]).n;
      const pages = _deckPageList().filter(d => d._install);
      const keys = pages.map(_deckPageKey);
      const want = ['spec:elev:0'].concat(Array.from({ length: n }, (_, i) => 'spec:elev:0~d' + (i + 1)));
      if (keys.join(',') !== want.join(',')) throw new Error(keys.join(','));
      if (pages.some(p => p._ovKey !== 'elev:0')) throw new Error('not one set of settings');
      _igSet({ detail: false }, 'elev:0');
      if (_deckPageList().filter(d => d._install).length !== 1) throw new Error('detail pages stayed');
    });
    __check('EXACT ASK: on a detail page the numbers zoom with the drawing (the ordinary capture); Number size still calms them', () => {
      seed();
      if (_igDetailZoom(elevations[0], { numScale: 1 }) !== 1) throw new Error('numbers held at the overview size: ' + _igDetailZoom(elevations[0], { numScale: 1 }));
      if (_igDetailZoom(elevations[0], { numScale: 0.8 }) !== 1.25) throw new Error('number size ignored');
      _igSet({ numScale: 1 }, 'elev:0');
      if (_dsPageCapJob({ _install: true, _ovKey: 'elev:0', _igDetail: 0, _igDetails: 3 }, 0) !== 0) throw new Error('a second capture for a detail page');
      _igSet({ numScale: 0.8 }, 'elev:0');
      const job = _dsPageCapJob({ _install: true, _ovKey: 'elev:0', _igDetail: 0, _igDetails: 3 }, 0);
      if (!job || job.z !== 1.25) throw new Error('the prime pass captures another zoom: ' + JSON.stringify(job));
      _igSet({ numScale: 1 }, 'elev:0');
    });
    __check('a detail page carries its part to the renderer', () => {
      if (window.__SRC.indexOf("_igDetail: desc._igDetail || 0, _igDetails: desc._igDetails") < 0) throw new Error('not passed');
      const f = window.__SRC.slice(window.__SRC.indexOf('async function _drawInstallGuidePage('), window.__SRC.indexOf('async function _drawInstallGuidePage(') + 400);
      if (f.indexOf('_drawInstallDetailPage(') < 0) throw new Error('install renderer does not hand a detail page over');
    });

    // ── OUTLINES ─────────────────────────────────────────────────────────────
    __check('EXACT ASK: Outlines draws a line round every frame and panel, never round the wallcovering', () => {
      seed();
      document.getElementById('outline-layer').style.display = 'block';
      drawElevAll();
      const ol = Array.from(document.querySelectorAll('#outline-layer .piece-outline')).map(d => d.getAttribute('data-outline')).sort();
      if (ol.join(',') !== 'J,K,M') throw new Error('outlined: ' + ol.join(','));
      const d = document.querySelector('#outline-layer [data-outline="J"]');
      if (d.getAttribute('data-svg-pen') !== 'line') throw new Error('no pen weight for the export');
      if (Math.abs(parseFloat(d.style.left) - 3.25 * elevScale) > 0.01 || Math.abs(parseFloat(d.style.width) - 21.5 * elevScale) > 0.01) throw new Error('not on the panel: ' + d.getAttribute('style'));
    });
    __check('Outlines is a guide: its button, All on / off, the export, the crop and Show on this page all know it', () => {
      if (!document.getElementById('outlineToggle')) throw new Error('no button');
      if (!_ELEV_GUIDE_LAYERS.some(p => p[0] === 'outline-layer' && p[1] === 'outlineToggle')) throw new Error('not a guide layer');
      if (!('outline-layer' in _elevGuideVis())) throw new Error('page view does not know it');
      if (!IG_PAGE_HIDE.some(h => h[0] === 'outline-layer')) throw new Error('cannot hide it per page');
      const S = window.__SRC, a = S.indexOf('const annotationLayers = ['), b = S.indexOf('];', a);
      if (S.slice(a, b).indexOf("'outline-layer'") < 0) throw new Error('not exported');
      if (S.indexOf("'context-layer','mark-layer','outline-layer'].forEach") < 0) throw new Error('not in the artboard bounds');
    });

    // ── LAYOUT DROPDOWN ──────────────────────────────────────────────────────
    __check('EXACT ASK: Layout is a dropdown with every name readable, and the page offers Detail pages', () => {
      seed();
      editorialContent.specTemplate = 'installGuide';
      const desc = _deckPageList().find(d => d._install);
      const box = document.createElement('div');
      _dsInstallGuideControls(box, desc, {});
      const sel = box.querySelector('#igLayoutSel');
      if (!sel || sel.tagName !== 'SELECT') throw new Error('no dropdown');
      const names = Array.from(sel.options).map(o => o.textContent);
      if (names.join('|') !== 'Elev only|Elev + plan|Elev + frames|Full width') throw new Error(names.join('|'));
      if (!box.querySelector('#igDetailToggle')) throw new Error('no Detail pages switch');
    });
  
    window.__detTest = (async () => {
      const r = [];
      const ck = async (label, fn) => { try { await fn(); r.push({ label, ok: true }); } catch (e) { r.push({ label, ok: false, err: e.message }); } };
      seed();
      const calls = [];
      const doc = new Proxy({}, { get: (t, k) => (...a) => { calls.push([k, a]); return 10; } });
      const keepCap = _igElevCapture, keepFoot = _drawPdfFooter;
      _drawPdfFooter = () => calls.push(['FOOTER']);
      _igElevCapture = async () => ({ cap: { allGuides: true, dataUrl: 'data:image/jpeg;base64,AAAA', w: 3000, h: 1125, pad: { left: 140, safe: 80 },
        boxes: { wall: [140, 80, 2860, 1045] }, vec: { w: 3000, h: 1125, ops: [] } } });
      try {
        const arg = Object.assign({}, elevations[0], { _ovKey: 'elev:0', _idx: 0, _igDetail: 1, _igDetails: _igDetailPlan(elevations[0]).n });
        await _drawInstallGuidePage(doc, {}, 7, {}, arg, { PW: 960, PH: 540 });
        const SR = _safeFrameRect(960, 540);
        await ck('EXACT ASK: a detail page has no title, subheading or installation notes', () => {
          const texts = calls.filter(c => c[0] === 'text').map(c => String(c[1][0]));
          if (texts.some(t => /ELEVATION DETAIL|INSTALLATION NOTE/i.test(t))) throw new Error('printed: ' + texts.join(' / '));
          if (texts.some(t => t === 'TIMELINE WALL')) throw new Error('a title was printed');
          if (!calls.some(c => c[0] === 'FOOTER')) throw new Error('no footer');
        });
        await ck('EXACT ASK: the drawing takes the full safety height (less its caption)', () => {
          const img = calls.find(c => c[0] === 'addImage');
          if (!img) throw new Error('no image');
          const [, , x, y, w, h] = img[1];
          if (Math.abs(h - ((SR.B - 13) - SR.T)) > 0.5) throw new Error('height ' + h + ' vs ' + ((SR.B - 13) - SR.T));
          if (x < SR.L - 0.5 || x + w > SR.R + 0.5) throw new Error('outside the safety width');
        });
      } finally { _igElevCapture = keepCap; _drawPdfFooter = keepFoot; }
      return r;
    })();
  `;
  window.__SRC = src;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const extra = await window.__detTest;
  const all = (window.__testResults || []).concat(extra || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
