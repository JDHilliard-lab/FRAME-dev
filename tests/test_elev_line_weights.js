// Elevation line weights: a drafting pen set in POINTS, with lines and ticks set
// independently or locked together.
//
// The request, verbatim: "I want to be able to change the lineweight of the
// lines/dashed lines between 0.25pt, 0.5pt, 0.75pt, 1pt, 2pt, 3pt and I also want
// the ability to change the architectural ticks the same way … some times I might
// want the lines to be 0.25 and the ticks to be 0.5 or 1 and some times I might
// want them to be all the same lineweight."
//
// What that forced, and what each block below defends:
//   • Six discrete steps, one definition (ELEV_WEIGHT_PT), both pickers built from it.
//   • Two independent values, plus a link where LINKED means literally EQUAL. The
//     old code DERIVED a light-line/heavy-tick split from one px slider; keeping
//     that would have made "all the same weight" unreachable.
//   • A weight named in points has to BE that many points on the page. The PDF used
//     to scale stroke widths by the placement scale k, and k comes from the
//     capture's artboard — which is the fit-to-window pixel size. So the printed
//     weight depended on how wide the browser window was. Absolute now.
//   • A style stored by an older build migrates from the single px weight, and a
//     deck already on ticks keeps the split that build gave it.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
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
    const S = window.__appSrc, H = window.__htmlSrc, CSS = window.__cssSrc;
    const __cssVar = (n) => parseFloat(document.documentElement.style.getPropertyValue(n));

    const __seed = () => {
      elevUnit = 'in';
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [], frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true, selected: true, distToggles: { left: true, floor: true } },
        { letter: 'B', id: 'P2', x: 80, y: 40, w: 30, h: 24, active: true, selected: true }
      ] }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      document.getElementById('wallW').value = '185';
      document.getElementById('wallH').value = '108';
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };
    // A stand-in for jsPDF that records only what we assert on. _drawElevAnnOps
    // wraps several calls in try/catch, so every method it touches must exist or a
    // silent skip would read as a pass.
    const __fakeDoc = () => {
      const rec = { widths: [], dashes: [] };
      const d = {
        setLineWidth: (w) => rec.widths.push(w),
        setLineDashPattern: (a) => rec.dashes.push((a || []).slice()),
        setDrawColor: () => {}, setFillColor: () => {}, setTextColor: () => {},
        setFont: () => {}, setFontSize: () => {}, getTextWidth: () => 10,
        line: () => {}, rect: () => {}, circle: () => {}, lines: () => {}, text: () => {}
      };
      return { doc: d, rec };
    };
    const __reset = () => { setAnnotWeightLinked(true); setAnnotLineWeightPt(1); setAnnotDimEnds('none'); };

    // ── The pen set ──
    __check('EXACT REQUEST: the six weights are 0.25, 0.5, 0.75, 1, 2 and 3 points', () => {
      if (!Array.isArray(ELEV_WEIGHT_PT)) throw new Error('ELEV_WEIGHT_PT is not a list');
      if (ELEV_WEIGHT_PT.join(',') !== '0.25,0.5,0.75,1,2,3') throw new Error('the ladder is ' + ELEV_WEIGHT_PT.join(','));
    });

    __check('both pickers are BUILT from that list, so the ladder has one definition', () => {
      // Written out in the HTML twice, the two strips could disagree, and adding a
      // weight would mean editing three places.
      _seedAnnotWeightControls();
      ['annotLineWeight', 'annotTickWeight'].forEach(id => {
        const host = document.getElementById(id);
        if (!host) throw new Error('#' + id + ' is not in the Settings panel');
        const btns = host.querySelectorAll('button');
        if (btns.length !== ELEV_WEIGHT_PT.length) throw new Error(id + ' has ' + btns.length + ' segments for ' + ELEV_WEIGHT_PT.length + ' weights');
        // Every segment must carry its real point value, not just a label.
        ELEV_WEIGHT_PT.forEach((pt, i) => {
          if (btns[i].title !== pt + 'pt') throw new Error(id + ' segment ' + i + ' is titled "' + btns[i].title + '"');
        });
      });
      // And the HTML holds the hosts only — no hardcoded weight list.
      if (/setAnnotLineWeightPt\\(/.test(H)) throw new Error('index.html wires weight buttons by hand instead of letting _seedAnnotWeightControls build them');
    });

    __check('the picked weight is marked active in the strip, so the panel shows the truth', () => {
      setAnnotWeightLinked(true);
      setAnnotLineWeightPt(3);
      _seedAnnotWeightControls();
      const on = Array.from(document.querySelectorAll('#annotLineWeight button')).filter(b => b.classList.contains('active'));
      if (on.length !== 1) throw new Error(on.length + ' segments marked active');
      if (on[0].title !== '3pt') throw new Error('the active segment is ' + on[0].title + ' after picking 3pt');
      // Linked, so the tick strip has to move with it.
      const tOn = Array.from(document.querySelectorAll('#annotTickWeight button')).filter(b => b.classList.contains('active'));
      if (tOn.length !== 1 || tOn[0].title !== '3pt') throw new Error('the tick strip did not follow the linked line weight');
      __reset();
    });

    __check('a junk or out-of-set weight snaps onto the ladder rather than drawing something else', () => {
      [[0.3, 0.25], [0.4, 0.5], [0.9, 1], [1.4, 1], [2.6, 3], [99, 3], [-4, 1], ['', 1], [null, 1], [undefined, 1]].forEach(([inp, want]) => {
        if (_snapWeightPt(inp) !== want) throw new Error(JSON.stringify(inp) + ' snapped to ' + _snapWeightPt(inp) + ', expected ' + want);
      });
      // A tie resolves UP: too light is a printing fault, too heavy is a choice.
      if (_snapWeightPt(1.5) !== 2) throw new Error('1.5 snapped to ' + _snapWeightPt(1.5) + ', ties should resolve upward');
      if (_snapWeightPt(0.375) !== 0.5) throw new Error('0.375 snapped to ' + _snapWeightPt(0.375));
    });

    // ── Independent, or linked ──
    __check('EXACT REQUEST: lines at 0.25 with ticks at 1 — the two are independent', () => {
      setAnnotWeightLinked(false);
      setAnnotLineWeightPt(0.25);
      setAnnotTickWeightPt(1);
      setAnnotDimEnds('tick');
      if (annotationStyle.lineWeightPt !== 0.25) throw new Error('line weight is ' + annotationStyle.lineWeightPt);
      if (annotationStyle.tickWeightPt !== 1) throw new Error('tick weight is ' + annotationStyle.tickWeightPt);
      if (__cssVar('--dim-line-w') !== 0.25 * ELEV_PT_TO_PX) throw new Error('--dim-line-w is ' + __cssVar('--dim-line-w'));
      if (__cssVar('--dim-tick-w') !== 1 * ELEV_PT_TO_PX) throw new Error('--dim-tick-w is ' + __cssVar('--dim-tick-w'));
      // Changing one must not move the other.
      setAnnotLineWeightPt(0.75);
      if (annotationStyle.tickWeightPt !== 1) throw new Error('the tick weight followed the line weight while unlinked');
      __reset();
    });

    __check('EXACT REQUEST: linked gives ONE weight for everything, at every step', () => {
      setAnnotWeightLinked(true);
      ELEV_WEIGHT_PT.forEach(pt => {
        setAnnotLineWeightPt(pt);
        if (annotationStyle.tickWeightPt !== pt) throw new Error(pt + 'pt linked left the tick at ' + annotationStyle.tickWeightPt);
        if (__cssVar('--dim-line-w') !== __cssVar('--dim-tick-w')) throw new Error(pt + 'pt linked published ' + __cssVar('--dim-line-w') + ' vs ' + __cssVar('--dim-tick-w'));
      });
      __reset();
    });

    __check('linking WRITES the value through rather than only reading past it', () => {
      // A link that just reads the line weight at draw time leaves tickWeightPt
      // stale in the stored style — the same second-copy trap that left the
      // group-dim box on an old colour.
      setAnnotWeightLinked(false);
      setAnnotLineWeightPt(0.5); setAnnotTickWeightPt(3);
      setAnnotWeightLinked(true);
      if (annotationStyle.tickWeightPt !== 0.5) throw new Error('the stored tick weight is still ' + annotationStyle.tickWeightPt + ' after linking');
      __reset();
    });

    __check('picking a tick weight while linked unlinks, rather than doing nothing', () => {
      setAnnotWeightLinked(true); setAnnotLineWeightPt(1);
      setAnnotTickWeightPt(3);
      if (annotationStyle.weightLinked) throw new Error('still linked, so the click was silently discarded');
      if (annotationStyle.tickWeightPt !== 3) throw new Error('the pick did not take: ' + annotationStyle.tickWeightPt);
      if (annotationStyle.lineWeightPt !== 1) throw new Error('it dragged the line weight along: ' + annotationStyle.lineWeightPt);
      // Re-picking the SAME value the lines already have is not an unlink.
      __reset();
      setAnnotTickWeightPt(annotationStyle.lineWeightPt);
      if (!annotationStyle.weightLinked) throw new Error('picking the value it already had broke the link');
      __reset();
    });

    __check('the link box and the tick row reflect state — no dead-looking control', () => {
      setAnnotWeightLinked(true); _seedAnnotWeightControls();
      const cb = document.getElementById('annotWeightLink');
      if (!cb) throw new Error('no link checkbox in the Settings panel');
      if (!cb.checked) throw new Error('linked but the box is unticked');
      const strip = document.getElementById('annotTickWeight');
      if (strip.style.pointerEvents !== 'none') throw new Error('the tick strip is still clickable while linked, so a click would silently unlink');
      setAnnotWeightLinked(false); _seedAnnotWeightControls();
      if (cb.checked) throw new Error('unlinked but the box is ticked');
      if (strip.style.pointerEvents === 'none') throw new Error('the tick strip stayed disabled after unlinking');
      __reset();
    });

    // ── It reaches the drawing ──
    __check('the weight reaches every dimension type on the wall, CSS-driven and JS-positioned', () => {
      setAnnotWeightLinked(true); setAnnotLineWeightPt(3); setAnnotDimEnds('tick');
      // Seed FIRST — __seed replaces the elevations array, which would drop the box.
      __seed();
      createGroupDimFromSelection();
      drawElevAll();
      const px = 3 * ELEV_PT_TO_PX;
      if (__cssVar('--dim-line-w') !== px) throw new Error('the CSS var is ' + __cssVar('--dim-line-w') + ', expected ' + px);
      // The group box is inline-styled, so it is the one that can drift. 16.31 moved
      // its four dashed edges from a CSS border to gradients sized by --dim-line-w,
      // so the weight now reaches it through the same var as everything else —
      // which is stronger than the old inline copy, and is what this asserts.
      const box = document.querySelector('#group-dim-layer .dim-dash-box');
      if (!box) throw new Error('no group-dim bounding box drawn');
      if (box.style.border) throw new Error('the box grew an inline border again, which is a second weight source: ' + box.style.border);
      if (box.getAttribute('data-svg-dash') !== 'box') throw new Error('the box lost its export marker, so it would vanish from the SVG and the PDF');
      const tick = document.querySelector('#group-dim-layer [data-svg-tick]');
      if (!tick) throw new Error('no group tick');
      if (tick.style.borderLeftWidth !== px + 'px') throw new Error('the group tick is at ' + tick.style.borderLeftWidth);
      elevations[0].groupDims = [];
      __reset();
    });

    __check('the weight survives a save/load round trip through localStorage', () => {
      setAnnotWeightLinked(false); setAnnotLineWeightPt(0.5); setAnnotTickWeightPt(2);
      saveAnnotationStyle();
      annotationStyle = { color: '#e00000', dash: true, fontSize: 13, font: 'serif', fontFamily: null, fontWeight: 600, dimEnds: 'none' };
      loadAnnotationStyle();
      if (annotationStyle.lineWeightPt !== 0.5 || annotationStyle.tickWeightPt !== 2) throw new Error('came back as ' + annotationStyle.lineWeightPt + '/' + annotationStyle.tickWeightPt);
      if (annotationStyle.weightLinked !== false) throw new Error('the link state did not persist');
      __reset(); saveAnnotationStyle();
    });

    // ── Absolute points in the export ──
    __check('EXACT BUG: a printed weight no longer depends on the browser window width', () => {
      // vec.w is the capture artboard — the elevation's fit-to-window pixel size.
      // Scaling stroke widths by w/vec.w meant a wider window printed thinner lines.
      const line = { t: 'line', x1: 0, y1: 0, x2: 100, y2: 0, c: '#000000', w: 1 * ELEV_PT_TO_PX, dash: null };
      const wide = __fakeDoc(), narrow = __fakeDoc();
      _drawElevAnnOps(wide.doc,   { w: 1400, h: 800, ops: [line] }, 0, 0, 600, 343);
      _drawElevAnnOps(narrow.doc, { w: 700,  h: 400, ops: [line] }, 0, 0, 600, 343);
      if (!wide.rec.widths.length || !narrow.rec.widths.length) throw new Error('no stroke width was set at all');
      if (wide.rec.widths[0] !== narrow.rec.widths[0]) throw new Error('the same 1pt line printed at ' + wide.rec.widths[0] + 'pt from one artboard and ' + narrow.rec.widths[0] + 'pt from another');
    });

    __check('EXACT SPEC: 1pt prints as 1 point, and each step prints as itself', () => {
      ELEV_WEIGHT_PT.forEach(pt => {
        const f = __fakeDoc();
        _drawElevAnnOps(f.doc, { w: 1400, h: 800, ops: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, c: '#000', w: pt * ELEV_PT_TO_PX, dash: null }] }, 0, 0, 600, 343);
        if (Math.abs(f.rec.widths[0] - pt) > 0.001) throw new Error(pt + 'pt printed at ' + f.rec.widths[0] + 'pt');
      });
    });

    __check('a placement size change still scales GEOMETRY — only the weights are absolute', () => {
      // If the whole op were unscaled the drawing would come apart, so prove the
      // change is surgical: same artboard, two placement widths, same stroke width.
      const rec = [];
      const mk = () => { const f = __fakeDoc(); f.doc.line = (a, b, c) => rec.push(c); return f; };
      const vec = { w: 1000, h: 500, ops: [{ t: 'line', x1: 0, y1: 0, x2: 1000, y2: 0, c: '#000', w: 2, dash: null }] };
      const a = mk(); _drawElevAnnOps(a.doc, vec, 0, 0, 600, 300);
      const b = mk(); _drawElevAnnOps(b.doc, vec, 0, 0, 300, 150);
      if (a.rec.widths[0] !== b.rec.widths[0]) throw new Error('stroke width scaled: ' + a.rec.widths[0] + ' vs ' + b.rec.widths[0]);
      if (!(rec[0] > rec[1])) throw new Error('the line geometry did NOT scale with the placement: ' + rec.join(' vs '));
    });

    __check('dash runs follow the weight out of the scaling, so a dashed line reads the same at any size', () => {
      // emitEl derives the dash array FROM the stroke width (3x/2x). Leave the
      // dashes on k while the width goes absolute and the same line is finely
      // dotted at one placement and near-solid at another.
      const op = { t: 'line', x1: 0, y1: 0, x2: 100, y2: 0, c: '#000', w: 2, dash: '6,4' };
      const a = __fakeDoc(); _drawElevAnnOps(a.doc, { w: 1400, h: 800, ops: [op] }, 0, 0, 600, 343);
      const b = __fakeDoc(); _drawElevAnnOps(b.doc, { w: 700, h: 400, ops: [op] }, 0, 0, 600, 343);
      const firstDash = (r) => (r.dashes.find(d => d.length) || []);
      if (!firstDash(a.rec).length) throw new Error('no dash pattern was ever set');
      if (firstDash(a.rec).join(',') !== firstDash(b.rec).join(',')) throw new Error('dash runs differ by artboard: ' + firstDash(a.rec).join(',') + ' vs ' + firstDash(b.rec).join(','));
      // Proportional to the stroke, which is what keeps 6,4 reading as dashes.
      const d = firstDash(a.rec);
      if (!(d[0] > d[1])) throw new Error('the 6,4 ratio was lost: ' + d.join(','));
    });

    __check('a 0.25pt hairline still gets a real width, not jsPDF thinnest-possible', () => {
      // setLineWidth(0) is a special value in PDF meaning "the thinnest line the
      // device can draw", which is resolution-dependent and can vanish.
      const f = __fakeDoc();
      _drawElevAnnOps(f.doc, { w: 4000, h: 2000, ops: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0, c: '#000', w: 0.25 * ELEV_PT_TO_PX, dash: null }] }, 0, 0, 200, 100);
      if (!(f.rec.widths[0] > 0)) throw new Error('a hairline came out at width ' + f.rec.widths[0]);
    });

    __check('the Deck Studio canvas preview gets the same absolute weight as the PDF', () => {
      // CanvasPdfRec is a SECOND renderer with the jsPDF API, and it renders at page
      // POINT scale (ctx.scale(s,s) over a PW/PH in points). So an absolute pt line
      // width passes straight through — but only if _drawElevAnnOps hands it the
      // same number it hands jsPDF, which is what this pins. A preview that
      // disagreed with the export reads to a designer as a broken tool.
      const rec = new CanvasPdfRec(936, 540);
      _drawElevAnnOps(rec, { w: 1400, h: 800, ops: [{ t: 'line', x1: 0, y1: 0, x2: 100, y2: 0, c: '#000', w: 0.5 * ELEV_PT_TO_PX, dash: null }] }, 0, 0, 600, 343);
      const op = rec.ops.find(o => o.t === 'line');
      if (!op) throw new Error('the canvas recorder recorded no line at all');
      if (Math.abs(op.st.lw - 0.5) > 0.001) throw new Error('the preview recorded a ' + op.st.lw + 'pt stroke for a 0.5pt line');
    });

    __check('the px-per-point constant is the ONE place the two units meet', () => {
      if (typeof ELEV_PT_TO_PX !== 'number' || !(ELEV_PT_TO_PX > 0)) throw new Error('ELEV_PT_TO_PX is ' + ELEV_PT_TO_PX);
      // Screen and export must both go through it, or they diverge silently.
      const i = S.indexOf('function _dimLineWeight');
      if (S.slice(i, i + 300).indexOf('ELEV_PT_TO_PX') < 0) throw new Error('_dimLineWeight does not use the shared constant');
      const j = S.indexOf('function _drawElevAnnOps');
      const body = S.slice(j, j + 2600);
      if (body.indexOf('ELEV_PT_TO_PX') < 0) throw new Error('_drawElevAnnOps does not use the shared constant');
      // And no stroke width may still be multiplied by the placement scale.
      if (/setLineWidth\\(Math\\.max\\([\\d.]+, o\\.(w|wdt) \\* k\\)\\)/.test(body)) throw new Error('a stroke width is still scaled by k');
    });

    // ── Migration ──
    __check('a style stored before the split migrates from the single px weight', () => {
      const load = (w, ends) => {
        annotationStyle = { color: '#000000', weight: w, dash: true, fontSize: 13, font: 'serif', fontFamily: null, fontWeight: 600, dimEnds: ends };
        _normalizeAnnotationStyle();
        return annotationStyle;
      };
      // Plain style: one weight, linked. 2px was the old default and is 1pt.
      let a = load(2, 'none');
      if (a.lineWeightPt !== 1 || a.tickWeightPt !== 1 || a.weightLinked !== true) throw new Error('2px/plain became ' + a.lineWeightPt + '/' + a.tickWeightPt + ' linked=' + a.weightLinked);
      a = load(1, 'none');
      if (a.lineWeightPt !== 0.5) throw new Error('1px/plain became ' + a.lineWeightPt + 'pt');
      a = load(6, 'none');
      if (a.lineWeightPt !== 3) throw new Error('6px/plain became ' + a.lineWeightPt + 'pt');
      // Tick style: the old code split the weight 2:1 automatically, so that deck
      // has to land UNLINKED on the two weights it was already drawing.
      a = load(2, 'tick');
      if (a.weightLinked !== false) throw new Error('a stored tick style came back linked, which flattens its hierarchy');
      if (!(a.tickWeightPt > a.lineWeightPt)) throw new Error('the old 2:1 split was lost: ' + a.lineWeightPt + '/' + a.tickWeightPt);
      __reset();
    });

    __check('the legacy px field stays a true mirror, so an older build reads the right weight', () => {
      setAnnotWeightLinked(true); setAnnotLineWeightPt(3);
      if (annotationStyle.weight !== 3 * ELEV_PT_TO_PX) throw new Error('weight is ' + annotationStyle.weight + ' at 3pt');
      setAnnotLineWeightPt(0.25);
      if (annotationStyle.weight !== 0.25 * ELEV_PT_TO_PX) throw new Error('weight is ' + annotationStyle.weight + ' at 0.25pt');
      __reset();
    });

    __check('nothing draws from the legacy px field any more', () => {
      // Two sources for one weight is how they drift. The only permitted mentions
      // are the normaliser (which writes the mirror), the migration read, and the
      // legacy-slider seeding. The \\b matters: annotationStyle.weightLinked would
      // otherwise match and make this pass for the wrong reason.
      const hits = (t) => (t.match(/annotationStyle\\.weight\\b/g) || []).length;
      const all = hits(S);
      const j = S.indexOf('function _normalizeAnnotationStyle');
      const inNorm = hits(S.slice(j, S.indexOf('\\nfunction ', j + 10)));
      const i = S.indexOf('function seedAnnotationStyleInputs');
      const inSeed = hits(S.slice(i, S.indexOf('\\nfunction ', i + 10)));
      if (all - inNorm - inSeed > 0) throw new Error((all - inNorm - inSeed) + ' place(s) outside the normaliser and the legacy seeding still read annotationStyle.weight');
      if (inNorm < 2) throw new Error('the normaliser no longer both migrates from and mirrors to the legacy field');
    });

    __check('the old px slider is gone from the panel, not left sitting there dead', () => {
      if (/id="annotWeight"/.test(H)) throw new Error('the 1-6px Line Weight slider is still in index.html');
      if (/Line Weight<\\/span>/.test(H)) throw new Error('the old Line Weight row label is still there');
      if (!/Lines \\(pt\\)/.test(H) || !/Ticks \\(pt\\)/.test(H)) throw new Error('the two point ladders are not labelled in the panel');
    });

    __check('six segments get their own CSS so the labels fit the strip', () => {
      if (CSS.indexOf('.unit-toggle.wt-ladder button') < 0) throw new Error('no wt-ladder rule — six segments at the 2-3 segment padding overflow the strip');
      const i = CSS.indexOf('.unit-toggle.wt-ladder button');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (rule.indexOf('tabular-nums') < 0) throw new Error('proportional figures make .25 and 1 different widths, so the strip reads uneven: ' + rule);
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
      'window.__cssSrc = ' + JSON.stringify(cssSrc) + ';\n' +
      'window.__htmlSrc = ' + JSON.stringify(htmlSrc) + ';\n' +
      src + '\n' + testBlock
    );
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
