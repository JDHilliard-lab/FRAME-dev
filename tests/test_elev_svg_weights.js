// REPORTED BUG: "when I export the SVG I want it to keep my line weight settings so
// when I open it in Illustrator it's the same. I have line weight 0.5 and the ticks
// set to 1 but everything looks the same."
//
// Three separate causes, all of them in the exported file rather than in the drawing:
//
// 1. NO REAL-WORLD UNIT. The root <svg> declared a bare `width="1400"`, so an
//    importer reads user units as pixels. Strokes are written in CSS px, which is
//    points x ELEV_PT_TO_PX, so a 0.5pt line arrived as 0.75pt and a 1pt tick as
//    1.5pt. Both heavier than the setting, and on a big artboard both render as a
//    hairline, which is the "everything looks the same". Fixed by declaring the
//    document in POINTS at 1 user unit = 1/ELEV_PT_TO_PX pt, so the px numbers
//    already in the file land as exactly the chosen weights.
//
// 2. A 1px FLOOR. Dimension lines are thin background boxes, and the exporter wrote
//    Math.max(1, thickness) — so every pen under 0.5pt collapsed onto 0.5pt.
//
// 3. RE-MEASURING THE WEIGHT. It read the thickness back out of getComputedStyle
//    instead of asking the setting, and sub-pixel widths don't survive that round
//    trip intact on every engine.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};

    // The user's exact setup from the report: lines 0.5pt, ticks 1pt, unlinked.
    const __setPens = (linePt, tickPt) => {
      annotationStyle.lineWeightPt = linePt;
      annotationStyle.tickWeightPt = tickPt;
      annotationStyle.weightLinked = (linePt === tickPt);
      _normalizeAnnotationStyle();
    };

    // ── 1. The document declares a real-world size in points ──
    __check('EXACT BUG: the exported SVG states its size in POINTS, so an importer does not read the weights as pixels', () => {
      const head = _elevSvgHead(1400, 900);
      const w = /width="([\\d.]+)(\\w*)"/.exec(head), h = /height="([\\d.]+)(\\w*)"/.exec(head);
      if (!w || !h) throw new Error('no width/height on the root element');
      if (w[2] !== 'pt' || h[2] !== 'pt') throw new Error('THE BUG: the root size is unitless (' + w[0] + '), so Illustrator reads 1 unit as 1px = 0.75pt and every weight comes in 1.5x heavy');
      // 1 user unit must be exactly 1/ELEV_PT_TO_PX points, or the px strokes
      // already in the file do not land on the chosen weights.
      const perUnit = parseFloat(w[1]) / 1400;
      if (Math.abs(perUnit - 1 / ELEV_PT_TO_PX) > 1e-9) throw new Error('1 user unit = ' + perUnit + 'pt; expected ' + (1 / ELEV_PT_TO_PX));
      if (Math.abs(parseFloat(h[1]) / 900 - 1 / ELEV_PT_TO_PX) > 1e-9) throw new Error('height uses a different scale than width, so the drawing would be distorted');
    });

    __check('the viewBox stays in USER UNITS, so no geometry moves', () => {
      const head = _elevSvgHead(1400, 900);
      const vb = /viewBox="0 0 ([\\d.]+) ([\\d.]+)"/.exec(head);
      if (!vb) throw new Error('no viewBox');
      if (parseFloat(vb[1]) !== 1400 || parseFloat(vb[2]) !== 900) throw new Error('the viewBox was converted too (' + vb[0] + '); every coordinate in the file would silently rescale and the PDF ops would drift off the picture');
    });

    __check('a 0.5pt line and a 1pt tick come out as 0.5pt and 1pt in the file', () => {
      __setPens(0.5, 1);
      // Strokes are written in px; the document says 1 unit = 1/ELEV_PT_TO_PX pt.
      const toPt = (px) => px / ELEV_PT_TO_PX;
      const linePt = toPt(_dimLineWeight()), tickPt = toPt(_dimTickWeight());
      if (Math.abs(linePt - 0.5) > 1e-9) throw new Error('a 0.5pt line exports as ' + linePt + 'pt');
      if (Math.abs(tickPt - 1) > 1e-9) throw new Error('a 1pt tick exports as ' + tickPt + 'pt');
      if (linePt === tickPt) throw new Error('THE REPORTED SYMPTOM: the line and the tick came out identical');
    });

    __check('every pen in the ladder survives the round trip, including the lightest', () => {
      ELEV_WEIGHT_PT.forEach(pt => {
        __setPens(pt, pt);
        const out = _dimLineWeight() / ELEV_PT_TO_PX;
        if (Math.abs(out - pt) > 1e-9) throw new Error(pt + 'pt exports as ' + out + 'pt');
      });
    });

    // ── 2. The 1px floor ──
    __check('EXACT BUG: the stroke floor no longer collapses the light pens onto each other', () => {
      if (typeof _svgStrokePx !== 'function') throw new Error('_svgStrokePx is missing');
      // 0.25pt is 0.5px at ELEV_PT_TO_PX. The old Math.max(1, ...) rounded that to a
      // whole pixel, i.e. to 0.5pt, so the two lightest pens exported identically.
      const light = parseFloat(_svgStrokePx(null, 0.25 * ELEV_PT_TO_PX));
      const next = parseFloat(_svgStrokePx(null, 0.5 * ELEV_PT_TO_PX));
      if (light === next) throw new Error('THE BUG: 0.25pt and 0.5pt still export as the same stroke (' + light + ')');
      if (Math.abs(light - 0.5) > 1e-6) throw new Error('0.25pt exports as ' + (light / ELEV_PT_TO_PX) + 'pt');
      // ...but never zero, which would be an invisible line.
      if (!(parseFloat(_svgStrokePx(null, 0)) > 0)) throw new Error('a zero thickness exports as an invisible stroke');
      // Enough decimals to tell the light pens apart. One decimal re-rounds 0.5.
      if (!/\\.\\d{2,}/.test(_svgStrokePx(null, 0.5))) throw new Error('the width is rounded too coarsely to distinguish the light pens');
    });

    __check('the source of the ladder is unchanged: points, absolute, six pens', () => {
      if (ELEV_PT_TO_PX !== 2) throw new Error('ELEV_PT_TO_PX moved; the SVG document scale is derived from it and both must move together');
      if (!ELEV_WEIGHT_PT.length) throw new Error('the pen set is gone');
    });

    // ── 3. Weights come from the setting, not from a CSS round trip ──
    __check('EXACT BUG: the exporter asks the setting for a dimension weight instead of re-measuring it', () => {
      const i = S.indexOf('const bTop = _parseBorder(cs.borderTop)');
      const emit = S.slice(Math.max(0, i - 3000), i + 4000);
      if (/Math\\.max\\(1,\\s*pos\\.[hw]\\)/.test(emit)) throw new Error('THE BUG: the 1px floor is back on the background-line case');
      // The pen is resolved once, up front, and EVERY stroke case uses it. Missing
      // one is how the group box and the dashed extension lines came out at a
      // different weight from the dimension lines beside them, off one setting.
      if (emit.indexOf('const penW = _elevPenWeight(el)') < 0) throw new Error('the pen is not resolved from the setting at all');
      const uses = (emit.match(/penW/g) || []).length;
      if (uses < 6) throw new Error('only ' + uses + ' references to the resolved pen; a stroke case is still re-measuring (rect, h-line, v-line, background x2, tick)');
      // Dash runs are proportional to the stroke, so a corrected weight with an
      // uncorrected dash pattern still reads as the wrong line.
      if (/stroke-dasharray="\\$\\{b(Top|Left)\\.width/.test(emit)) throw new Error('a dash pattern is still sized from the measured border rather than the corrected weight');
    });

    __check('_elevPenWeight covers every dimension stroke, by class or by marker', () => {
      if (typeof _elevPenWeight !== 'function') throw new Error('_elevPenWeight is missing');
      __setPens(0.5, 1);
      const mk = (attrs) => { const d = document.createElement('div'); Object.keys(attrs).forEach(k => k === 'class' ? (d.className = attrs[k]) : d.setAttribute(k, attrs[k])); return d; };
      const line = _dimLineWeight(), tick = _dimTickWeight();
      // The group dims are inline-styled with no useful class — the marker is the
      // only way the exporter can know which pen they are.
      if (_elevPenWeight(mk({ 'data-svg-pen': 'line' })) !== line) throw new Error('the group box / group dim lines are not recognised');
      if (_elevPenWeight(mk({ 'data-svg-pen': 'tick' })) !== tick) throw new Error('the group dim ticks are not recognised');
      // The CSS-driven types come by class.
      [['dim-line-segment', line], ['dim-line-segment-v', line], ['dim-leader', line],
       ['hang-guide', line], ['center-guide', line], ['dim-tick dim-tick-h', tick]].forEach(([cls, want]) => {
        if (_elevPenWeight(mk({ class: cls })) !== want) throw new Error('.' + cls + ' is not recognised as a dimension stroke, so it exports a re-measured weight');
      });
      // And nothing else is claimed: a frame or a wall keeps its own weight.
      if (_elevPenWeight(mk({ class: 'frame' })) !== 0) throw new Error('a non-dimension element was given the dimension pen');
    });

    __check('the group dims and the wall extension stubs carry the marker in the source', () => {
      // Both are built by hand with inline styles, so if the attribute is dropped
      // there the exporter silently falls back to re-measuring and the symptom
      // returns with no error anywhere.
      const g = S.indexOf('const mkLine = (x, y, w, h, lineStyle)');
      const mk = S.slice(g, g + 900);
      // Dashed goes through _mkDashLine (which sets both markers); solid sets its own.
      if (mk.indexOf('_mkDashLine(') < 0) throw new Error('dashed group extension lines are not built by the shared dashed-line helper, so they miss the rhythm and the markers');
      if (mk.indexOf("data-svg-pen', 'line'") < 0) throw new Error('solid group dimension lines lost their pen marker');
      const t = S.indexOf('const mkTick = (cx, cy, vertical)');
      if (S.slice(t, t + 400).indexOf("data-svg-pen', 'tick'") < 0) throw new Error('group dimension ticks lost their pen marker');
      const r = S.indexOf('rect.setAttribute(\\'data-svg-pen\\'');
      if (r < 0) throw new Error('the group bounding box lost its pen marker');
      // The wall's four outer extension stubs are innerHTML, so they go through
      // _dashLineHTML, which writes both markers and the dash class.
      const a = S.indexOf('function createElevArchDim');
      const stubs = (S.slice(a, S.indexOf('\\nfunction ', a + 10)).match(/_dashLineHTML\\(/g) || []).length;
      if (stubs < 4) throw new Error('the wall outer extension stubs are not all built by the shared helper (' + stubs + ' of 4)');
      const h = S.indexOf('function _dashLineHTML');
      const hb = S.slice(h, S.indexOf('\\n}', h));
      if (hb.indexOf('data-svg-pen="line"') < 0 || hb.indexOf('data-svg-dash="1"') < 0) throw new Error('the shared dashed-line HTML lost a marker, so those strokes vanish from the SVG');
    });

    __check('a non-dimension thin element still exports its measured thickness', () => {
      // The setting applies to dimension lines. Everything else thin (guides, the
      // hang line, custom measure lines) keeps its own weight.
      __setPens(3, 3);
      const measured = parseFloat(_svgStrokePx(null, 1.4));
      if (Math.abs(measured - 1.4) > 1e-6) throw new Error('a measured 1.4px stroke exported as ' + measured + '; the dimension setting leaked onto everything thin');
    });

    // ── The raster path must not be broken by the new unit ──
    __check('EXACT RISK: the capture reads its natural size from the viewBox, not the pt width', () => {
      const i = S.indexOf('async function _captureElevWithGuides');
      const body = S.slice(i, S.indexOf('// Template-driven single-spec page', i));
      if (body.indexOf('viewBox') < 0) throw new Error('the capture still sizes itself from width/height, which are now POINTS — every capture would rasterize 1.33x off');
      if (body.indexOf('vbOK ? vb[2]') < 0) throw new Error('the viewBox is parsed but not used for the natural width');
      // And the upscale it writes back must be a bare pixel count.
      if (body.indexOf('(?:pt|px|in|mm|cm|pc)?') < 0) throw new Error('the rewrite does not strip the unit, so the rasterizer is handed a pt size and renders too big');
    });

    __check('the two halves and the download share one header builder', () => {
      const n = (S.match(/_elevSvgHead\\(svgW, svgH\\)/g) || []).length;
      if (n < 2) throw new Error('only ' + n + ' call site(s); the download and the PDF path can drift apart on the artboard again');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
