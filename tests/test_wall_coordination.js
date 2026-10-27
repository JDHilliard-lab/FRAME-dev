// 19.80: installs coordinated with a wallcovering (Ford Admin Rouge timeline wall).
//  * "it would be nice if one of the line options could be a spacer ... a dimension on it
//    that you can type in ... attached to the edge of the frame or didactic panel and
//    you measuring lines could snap to it"
//  * "some times I want to flip the side the numbers land"
//  * "an option where the white boxes are not behind the numbers, but still need lines
//    not to be seen if they end up landing behind a the numbered measurement ... Or ...
//    fade the mural to a certain opacity"
//  * "maybe we do a zoom into the elevation along 1, 2, 3 pages so the numbers look right size"
//  * "when I click a frame or didactic panel then I click the graphic ... I could see the
//    other dashed line" (the leader to the point on the graphic was never drawn)
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

    // ── SPACER ────────────────────────────────────────────────────────────────
    const makeSpacer = () => withPt(() => {
      markToolActive = true; markKind = 'spacer'; markFirstAnchor = null; markSpacerSize = 1;
      handleMarkToolClick(ev(12, 44.1 - 0.4));    // on the panel's bottom edge
      handleMarkToolClick(ev(12, 40));            // below it
      const ms = elevations[0].marks || [];
      return ms[ms.length - 1];
    });
    __check('EXACT ASK: a spacer is clicked onto a panel edge, takes the typed size and runs the panel\\'s edge', () => {
      seed();
      const m = makeSpacer();
      if (!m || m.kind !== 'spacer') throw new Error('no spacer: ' + JSON.stringify(m));
      if (m.axis !== 'y' || m.dir !== -1) throw new Error('wrong side: axis ' + m.axis + ' dir ' + m.dir);
      if (m.a.ref !== 'frame' || m.a.letter !== 'J') throw new Error('not attached to the panel: ' + JSON.stringify(m.a));
      const r = _markRectOf(m);
      if (Math.abs(r.x - 3.25) > 0.01 || Math.abs(r.w - 21.5) > 0.01) throw new Error('does not run the panel edge: ' + JSON.stringify(r));
      if (Math.abs(r.y - 43.1) > 0.01 || Math.abs(r.h - 1) > 0.01) throw new Error('not 1" below the panel: ' + JSON.stringify(r));
      setMarkField(m.id, 'size', 0.25);
      if (Math.abs(_markRectOf(m).h - 0.25) > 1e-6) throw new Error('a typed size did not take');
      if (markSpacerSize !== 0.25) throw new Error('the next spacer does not start at the last size');
      if (!m.guide) throw new Error('a spacer should be a guide (never prints) by default');
    });
    __check('a spacer moves with its panel, and frames snap to its far side (but the panel never snaps to its own spacer)', () => {
      seed();
      const m = makeSpacer();
      elevFrames[1].y += 10;
      if (Math.abs(_markRectOf(m).y - 53.1) > 0.01) throw new Error('did not follow the panel');
      const T = _elevSnapTargets({ frameIdx: 2 });
      if (!T.yTargets.some(t => Math.abs(t.value - 53.1) < 0.01)) throw new Error('its far side is no target for another frame');
      const own = _elevSnapTargets({ frameIdx: 1 });
      if (own.yTargets.some(t => Math.abs(t.value - 53.1) < 0.01 && /^guide/.test(t.kind))) throw new Error('the panel snaps to its own spacer');
    });
    __check('EXACT ASK: the measure tool snaps to a spacer, and the line follows it when resized', () => {
      seed();
      const m = makeSpacer();
      const a = _elevSnapPoint(15, 43.1 - 0.5);
      if (!a || a.ref !== 'mark' || a.mid !== m.id) throw new Error('did not snap to the spacer: ' + JSON.stringify(a));
      const st = stripAnchor(a);
      setMarkField(m.id, 'size', 2);
      const p = resolveStoredAnchor(st);
      if (Math.abs(p.y - 42.1) > 0.01) throw new Error('the measure end stayed at ' + p.y);
    });
    __check('a spacer can hang off a printed line in the graphic (runs a set length)', () => {
      seed();
      const m = withPt(() => {
        markToolActive = true; markKind = 'spacer'; markFirstAnchor = null; markSpacerSize = 1;
        handleMarkToolClick(ev(8, 51.6 + 0.4));
        handleMarkToolClick(ev(8, 49));
        return elevations[0].marks[elevations[0].marks.length - 1];
      });
      if (!m.a.gfx || m.axis !== 'y') throw new Error('not on the graphic edge: ' + JSON.stringify(m));
      const r = _markRectOf(m);
      if (Math.abs(r.y + r.h - 51.6) > 0.11) throw new Error('top not on the text bottom: ' + (r.y + r.h));
      if (Math.abs(r.w - MARK_SPACER_LEN_IN) > 0.01) throw new Error('length ' + r.w);
      renderMarks();
      const el = document.querySelector('#mark-layer [data-mark-id="' + m.id + '"]');
      if (!el || el.getAttribute('data-export-skip') !== '1') throw new Error('drawn wrong or would print');
      if (!el.textContent.includes('1')) throw new Error('its size is not shown');
    });

    // ── FLIP ──────────────────────────────────────────────────────────────────
    const fakeDim = (pin, force, fits) => {
      const d = document.createElement('div'); d.className = 'arch-dim arch-dim-h';
      d.innerHTML = '<div class="dim-line-segment"></div><span class="arch-label-new">1"</span><div class="dim-line-segment"></div>';
      if (pin) d.setAttribute('data-lift-pin', String(pin));
      if (force) d.setAttribute('data-lift-force', String(force));
      Object.defineProperty(d, 'offsetWidth', { get: () => 200 });
      Object.defineProperty(d.querySelector('.arch-label-new'), 'offsetWidth', { get: () => fits ? 40 : 400 });
      return d;
    };
    __check('EXACT ASK: a flipped number goes to the side asked for, even when it fits in its line and even against the leaders', () => {
      const d = fakeDim(-2, 1, true);
      if (!_autoLiftDimLabel(d, 'h')) throw new Error('a flipped number that fits was left in its line');
      if (d.querySelector('.arch-label-new').getAttribute('data-lift-side') !== 'below') throw new Error('went ' + d.querySelector('.arch-label-new').getAttribute('data-lift-side'));
      if (_autoLiftDimLabel(fakeDim(0, 0, true), 'h')) throw new Error('an unflipped number that fits was lifted');
      const d2 = fakeDim(-1, 1, false); _autoLiftDimLabel(d2, 'h');
      if (d2.querySelector('.arch-label-new').getAttribute('data-lift-side') !== 'above') throw new Error('a drag pin now beats the leaders');
    });
    __check('the flip button cycles in line, above, below, in line; and stores +-2', () => {
      seed();
      let side = 0;
      const host = document.createElement('div'); document.getElementById('wall').appendChild(host);
      const build = () => {
        host.innerHTML = '';
        const d = fakeDim(0, 0, true); host.appendChild(d);
        buildDimControls({ dim: d, type: 'h', id: 'dX', isSelected: () => true, select() {}, getLabelOff: () => 0, setLabelOff() {}, getLineOff: () => 0, setLineOff() {},
          getLiftSide: () => side, setLiftSide: (s) => { side = s; }, onDelete() {}, spanPx: 200 });
        _autoLiftDimLabel(d, 'h');
        if (!d.querySelector('.dim-flip')) throw new Error('no flip button on a selected dimension');
        return d;
      };
      build(); _selDimFlip.fn(); if (side !== 2) throw new Error('first flip gave ' + side);
      build(); _selDimFlip.fn(); if (side !== -2) throw new Error('second flip gave ' + side);
      build(); _selDimFlip.fn(); if (side !== 0) throw new Error('third flip gave ' + side);
      setDimLiftSide('q', 2); if (getDimLiftSide('q') !== 2) throw new Error('a spacing dim does not keep a flip');
      setDimLiftSide('q', 0); if (getDimLiftSide('q') !== 0) throw new Error('a flip cannot be cleared');
    });

    // ── FADE AND NO WHITE BOXES ──────────────────────────────────────────────
    __check('EXACT ASK: the graphic fades by a white wash on the wall, the art and panels stay full strength', () => {
      seed();
      setElevGfxFade(0.4);
      const wash = (L) => document.querySelector('#frame-layer .frame-vis[data-frame-letter="' + L + '"] .gfx-wash');
      if (!wash('I')) throw new Error('no wash over the wallcovering');
      if (!/0\\.6\\)/.test(wash('I').style.background)) throw new Error('wash ' + wash('I').style.background);
      if (wash('J') || wash('K')) throw new Error('the panel or a frame was washed');
      setElevGfxFade(1);
      if ('gfxFade' in elevations[0]) throw new Error('full strength is still stored');
    });
    __check('the fade reaches the PDF capture (SVG) and the spec thumbnail (canvas)', () => {
      const svgFn = window.__SRC.slice(window.__SRC.indexOf('async function exportElevSVG('), window.__SRC.indexOf('\\nfunction ', window.__SRC.indexOf('async function exportElevSVG(') + 30));
      if (svgFn.split('_gfxWashSvg(f, pos)').length - 1 < 2) throw new Error('both frame branches must wash');
      const cv = window.__SRC.slice(window.__SRC.indexOf('async function renderElevationToCanvas('), window.__SRC.indexOf('async function renderElevationToCanvas(') + 9000);
      if (cv.indexOf('_elevGfxWash(elev, f)') < 0) throw new Error('the thumbnail does not wash');
    });
    __check('EXACT ASK: no white boxes: a line under a number is cut, and only there', () => {
      const box = [{ x0: 40, y0: 5, x1: 60, y1: 15 }];
      const out = _knockSplitLine('<line x1="0.0" y1="10.0" x2="100.0" y2="10.0" stroke="#e00000" stroke-width="1"/>', box);
      const segs = out.split('\\n');
      if (segs.length !== 2) throw new Error('expected two pieces: ' + out);
      if (segs[0].indexOf('x2="40.0"') < 0 || segs[1].indexOf('x1="60.0"') < 0) throw new Error('cut in the wrong place: ' + out);
      if (segs[1].indexOf('stroke="#e00000"') < 0) throw new Error('lost its style');
      const miss = '<line x1="0.0" y1="30.0" x2="100.0" y2="30.0" stroke="#000"/>';
      if (_knockSplitLine(miss, box) !== miss) throw new Error('a line clear of the number changed');
      const diag = _knockSplitLine('<line x1="40.0" y1="0.0" x2="60.0" y2="20.0" stroke="#000"/>', box);
      if (diag.split('\\n').length !== 2) throw new Error('a sloped line was not cut: ' + diag);
      if (_knockSplitLine('<g transform="x"><line x1="0" y1="10" x2="100" y2="10"/></g>', box).indexOf('<g') !== 0) throw new Error('touched a group in local coordinates');
    });
    __check('no white boxes: the wall shows it and the export skips the chip', () => {
      seed();
      setElevDimKnockout(true);
      if (!document.getElementById('wall').classList.contains('dim-knock')) throw new Error('the wall still shows chips');
      const svgFn = window.__SRC.slice(window.__SRC.indexOf('async function exportElevSVG('), window.__SRC.indexOf('async function exportElevSVG(') + 60000);
      const i = svgFn.indexOf('if (_knock && (hasBg');
      if (i < 0 || i > svgFn.indexOf('Snug chip sized')) throw new Error('the chip is not skipped first');
      if (svgFn.indexOf('_knockSplitLine(midLayer[i], _knockBoxes)') < 0) throw new Error('the lines are not cut');
      setElevDimKnockout(false);
      if (elevations[0].dimKnockout) throw new Error('off is still stored');
    });

    // ── THE LEADER TO A POINT ON THE GRAPHIC ─────────────────────────────────
    __check('EXACT ASK: a measure line from the graphic to a panel, pulled aside, draws its leader back to the point on the graphic', () => {
      seed();
      const ga = stripAnchor(_elevSnapPoint(8, 51.6 + 0.4));
      const pa = { ref: 'frame', letter: 'J', xc: 'xf', xf: (8 - 3.25) / 21.5, yc: 'y1' };
      elevations[0].customLines = [{ id: 'cl1', type: 'v', a: ga, b: pa, off: 5 }];
      dimVisibility.customLines = true;
      renderCustomLines();
      const leaders = document.querySelectorAll('#custom-lines-layer .dim-leader');
      // 19.82: two (the panel end draws from its clicked point too, as a point-end line now does).
      if (leaders.length !== 2) throw new Error(leaders.length + ' leaders (want 2: the graphic end and the panel end)');
      const st = leaders[0].getAttribute('style');
      const num = (k) => parseFloat((st.split(k + ':')[1] || '').trim());
      if (Math.abs(num('left') - 8 * elevScale) > 0.05 || Math.abs(num('width') - 5 * elevScale) > 0.05) throw new Error('not from the point to the line: ' + st);
    });

    __check('EXACT ASK (19.81): a measure line from a spacer, pulled aside, draws its leader from the point clicked on the spacer', () => {
      seed();
      const m = makeSpacer();                          // 3.25..24.75 wide, 43.1..44.1 tall, under panel J
      const sa = stripAnchor(_elevSnapPoint(8, 43.1 - 0.4));   // the spacer's far (bottom) side at x 8
      if (!sa || sa.ref !== 'mark') throw new Error('did not snap to the spacer: ' + JSON.stringify(sa));
      const pa = { ref: 'frame', letter: 'J', xc: 'xf', xf: (8 - 3.25) / 21.5, yc: 'y0' };
      elevations[0].customLines = [{ id: 'cl2', type: 'v', a: sa, b: pa, off: 5 }];   // number 5" right, still over the spacer
      dimVisibility.customLines = true;
      renderCustomLines();
      const leaders = document.querySelectorAll('#custom-lines-layer .dim-leader');
      // 19.82: both ends, the panel end from its clicked point too.
      if (leaders.length !== 2) throw new Error(leaders.length + ' leaders (want 2: the spacer end and the panel end)');
      const st = leaders[0].getAttribute('style');
      const num = (k) => parseFloat((st.split(k + ':')[1] || '').trim());
      if (Math.abs(num('left') - 8 * elevScale) > 0.05 || Math.abs(num('width') - 5 * elevScale) > 0.05) throw new Error('not from the clicked point to the line: ' + st);
    });

    // ── A WALL ACROSS PAGES ──────────────────────────────────────────────────
    __check('the cuts fall in gaps between pieces, never through one, and the gap is on both pages', () => {
      seed();
      const ws = _igWindows(elevations[0], 3);
      if (ws.length !== 3) throw new Error(ws.length + ' windows');
      const pieces = elevFrames.filter(f => f.letter !== 'I');
      [ws[0].hi, ws[1].lo, ws[1].hi, ws[2].lo].forEach(c => {
        pieces.forEach(f => { if (c > f.x + 0.01 && c < f.x + f.w - 0.01) throw new Error('cut at ' + c + ' runs through ' + f.letter); });
      });
      if (!(ws[1].lo < ws[0].hi)) throw new Error('the first gap is not on both pages');
      if (ws[0].lo !== -Infinity || ws[2].hi !== Infinity) throw new Error('the ends lost their gutters');
    });
    __check('EXACT ASK: Full width on 3 pages lists three pages for the wall, keyed apart, sharing one setting', () => {
      seed();
      editorialContent.specTemplate = 'installGuide';
      _igSet({ variant: 'elevWide', parts: 3 }, 'elev:0');
      const pages = _deckPageList().filter(d => d._install);
      if (pages.length !== 3) throw new Error(pages.length + ' pages');
      const keys = pages.map(_deckPageKey);
      if (keys.join(',') !== 'spec:elev:0,spec:elev:0~2,spec:elev:0~3') throw new Error(keys.join(','));
      if (pages.some(p => p._ovKey !== 'elev:0')) throw new Error('the parts do not share one set of settings');
      _igSet({ variant: 'elevOnly' }, 'elev:0');
      if (_deckPageList().filter(d => d._install).length !== 1) throw new Error('pages split without Full width');
      _igSet({ variant: 'elevWide', parts: 1 }, 'elev:0');
    });
    __check('a zoomed capture is its own cache entry, and draws the wall that many times wider', () => {
      seed();
      if (_igCapKey(0, 3) === _igCapKey(0)) throw new Error('same cache key');
      if (_igCapKey(0, 1) !== _igCapKey(0)) throw new Error('an unzoomed key changed');
      _elevExportFloor = 1;
      try {
        _elevCaptureZoom = 1; drawElevAll(); const s1 = elevScale;
        _elevCaptureZoom = 3; drawElevAll(); const s3 = elevScale;
        if (Math.abs(s3 / s1 - 3) > 0.01) throw new Error('scale ' + s1 + ' -> ' + s3);
      } finally { _elevCaptureZoom = 1; _elevExportFloor = 0; }
      const z = _elevCaptureZoom; _elevCaptureZoom = 3;
      try { if (_elevCapTargetW() <= (_ELEV_CAP_QUALITY[_pdfQuality] || _ELEV_CAP_QUALITY.standard).w) throw new Error('the pixels did not grow with it'); }
      finally { _elevCaptureZoom = z; }
      const jobs = _elevPrimeJobs([{ idx: 0, z: 3 }, 0]);
      if (jobs.length !== 2 || jobs[0].z !== 3) throw new Error('prime jobs ' + JSON.stringify(jobs.map(j => j.z)));
    });
    __check('EXACT ASK: the zoom is what the page can really gain, over the number size; numbers never shrink by accident', () => {
      seed();   // 272 x 96.5: on a landscape page a third of it is held by the page height
      const z3 = _igZoomFor(elevations[0], { variant: 'elevWide', parts: 3 });
      if (z3 > 1.15) throw new Error('3 pages zoomed ' + z3 + 'x though a square third cannot print bigger: the numbers would shrink');
      elevations[0].wallH = 40;   // a low, long wall: a third of it really does print bigger
      const zl = _igZoomFor(elevations[0], { variant: 'elevWide', parts: 3 });
      if (!(zl > 1.4)) throw new Error('a low wall in thirds only zoomed ' + zl);
      elevations[0].wallH = WH;
      if (_igZoomFor(elevations[0], { variant: 'elevWide', parts: 1, numScale: 0.5 }) !== 2) throw new Error('Number size 50% is not a 2x capture');
      if (_igZoomFor(elevations[0], { variant: 'elevOnly', parts: 3 }) !== 1) throw new Error('a split off Full width still zooms');
      const R = window.__SRC.slice(window.__SRC.indexOf('async function _drawInstallGuidePage'), window.__SRC.indexOf('async function _drawInstallGuidePage') + 30000);
      if (R.indexOf('_igElevCapture(igElevIdx, _igZoomFor(elev, cfg))') < 0) throw new Error('the page asks for another zoom than the prime');
      if (window.__SRC.indexOf('_dsPageCapJob(desc, _pei)') < 0) throw new Error('the page build primes another zoom');
      if (_igCfg('elevgrp:x').numScale !== 1) throw new Error('breaker default');
      _igSet({ numScale: 0.7 }, null, true);
      if (_igCfg('elevgrp:x').numScale !== 0.7 || _igCfg('elev:0').numScale !== 1) throw new Error('breaker Number size bleeds or does not take');
      _igSet({ numScale: 1 }, null, true);
    });
    window.__winTest = (async () => {
      const r = [];
      const ck = (l, f) => { try { f(); r.push({ label: l, ok: true }); } catch (e) { r.push({ label: l, ok: false, err: e.message }); } };
      seed();
      // Wall from 10 to 282 on a 300-wide artboard: 1 in = 1 unit.
      const view = { dataUrl: 'data:x', w: 300, h: 100, wallBox: [10, 0, 282, 96.5], floorFrac: 0.96,
        vec: { w: 300, h: 100, ops: [
          { t: 'line', x1: 0, y1: 5, x2: 300, y2: 5, c: '#000', w: 1 },
          { t: 'text', x: 150, y: 50, s: 'MID' },
          { t: 'text', x: 20, y: 50, s: 'LEFT' }
        ] } };
      const w0 = await _capWindow(view, elevations[0], 0, 3);
      const w1 = await _capWindow(view, elevations[0], 1, 3);
      ck('each window keeps only its part, with lines clipped to it', () => {
        if (!(w0.vec.w < 300) || !(w1.vec.w < 300)) throw new Error('not cut');
        const ln = w1.vec.ops.find(o => o.t === 'line');
        if (!ln || Math.abs(ln.x1) > 0.01 || Math.abs(ln.x2 - w1.vec.w) > 0.01) throw new Error('line not clipped to the window: ' + JSON.stringify(ln));
        if (w0.vec.ops.some(o => o.s === 'MID') === w1.vec.ops.some(o => o.s === 'MID')) throw new Error('MID on both or neither');
        if (!w0.vec.ops.some(o => o.s === 'LEFT') || w1.vec.ops.some(o => o.s === 'LEFT')) throw new Error('LEFT misplaced');
      });
      ck('every page shares one scale (the widest window) and the ends keep their guides', () => {
        if (w0.envW !== w1.envW || !(w0.envW >= w0.vec.w) || !(w0.envW >= w1.vec.w)) throw new Error('envW ' + w0.envW + ' / ' + w1.envW);
        if (w0.align !== 'left' || w1.align !== 'center') throw new Error(w0.align + ' ' + w1.align);
      });
      return r;
    })();
  `;
  window.__SRC = src;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const extra = await window.__winTest;
  const all = (window.__testResults || []).concat(extra || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
