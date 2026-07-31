// Architectural tick dimension style (Elevations gear → Line Ends → TICKS).
//
// The standard being implemented, and the thing each check defends:
//   • No arrowheads, ever. Ticks only.
//   • 45° oblique, sloping bottom-left to top-right ( / ).
//   • The tick's CENTRE snaps to the dimension/extension intersection.
//   • Line-weight hierarchy: dimension and extension lines light, tick heavier.
//   • Extension lines overhang the intersection to form a crosshair under it.
//
// The one non-obvious trap: the SVG exporter is a generic DOM walker whose line
// cases only understand axis-aligned borders. A 45°-rotated border has a ~6px
// square bounding box, which fails the "thin line" tests and has no background to
// fall back on, so the ticks silently vanished from every SVG and PDF until
// emitEl learned about data-svg-tick.
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
    const S = window.__appSrc, CSS = window.__cssSrc;

    // Two frames with edge-gap dims on, so spacing dims, edge dims and the outer
    // wall dims are all on the page at once.
    const __seed = () => {
      elevUnit = 'in';
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true, distToggles: { left: true, floor: true } },
        { letter: 'B', id: 'P2', x: 80, y: 40, w: 30, h: 24, active: true }
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
    const __ticks = () => document.querySelectorAll('.dim-tick');
    const __cssVar = (n) => document.documentElement.style.getPropertyValue(n);

    // ── The option ──
    __check('the plain style is the default, so no existing deck restyles itself', () => {
      if (annotationStyle.dimEnds !== 'none') throw new Error('default dimEnds is ' + annotationStyle.dimEnds);
      __seed();
      if (__ticks().length !== 0) throw new Error('the plain style drew ' + __ticks().length + ' ticks');
    });

    __check('a stored style from before the option existed, or any junk value, reads as plain', () => {
      [undefined, '', 'arrow', 'arrowhead', 'TICK', true, 1, {}].forEach(v => {
        annotationStyle.dimEnds = v;
        _normalizeAnnotationStyle();
        if (annotationStyle.dimEnds !== 'none') throw new Error(JSON.stringify(v) + ' normalised to ' + annotationStyle.dimEnds);
      });
      annotationStyle.dimEnds = 'tick';
      _normalizeAnnotationStyle();
      if (annotationStyle.dimEnds !== 'tick') throw new Error('tick did not survive normalising');
      setAnnotDimEnds('none');
    });

    __check('EXACT REQUEST: switching to TICKS puts a tick on both ends of every dimension line', () => {
      setAnnotDimEnds('none'); __seed();
      const dims = document.querySelectorAll('.arch-dim').length;
      if (dims < 3) throw new Error('expected several dimension lines on the test wall, got ' + dims);
      setAnnotDimEnds('tick'); __seed();
      const t = __ticks().length;
      if (t === 0) throw new Error('no ticks after switching the style on');
      if (t % 2 !== 0) throw new Error('ticks come in pairs, one per end; got ' + t);
      // Every .arch-dim must carry exactly two.
      document.querySelectorAll('.arch-dim').forEach(d => {
        const n = d.querySelectorAll('.dim-tick').length;
        if (n !== 2) throw new Error('a ' + d.className + ' has ' + n + ' ticks, expected 2');
      });
      setAnnotDimEnds('none');
    });

    __check('EXACT REQUEST: no arrowheads exist as an option or in the output', () => {
      // The dim-arrow chevrons in the editor are DRAG CONTROLS and are marked
      // data-export-skip, so they never reach an export. Nothing else may draw a
      // head on a dimension line.
      setAnnotDimEnds('tick'); __seed();
      document.querySelectorAll('.dim-arrow').forEach(a => {
        if (!a.getAttribute('data-export-skip')) throw new Error('a dim-arrow control is not export-skipped, so it would print as an arrowhead');
      });
      if (/marker-end|marker-start/.test(S)) throw new Error('SVG arrow markers found in the source');
      const i = S.indexOf('dimEnds:');
      const near = S.slice(i - 700, i + 400);
      if (/'arrow'|"arrow"/.test(near)) throw new Error('an arrow option crept into the dimEnds values');
      setAnnotDimEnds('none');
    });

    // ── The geometry ──
    __check('EXACT SPEC: the tick is 45 degrees, sloping bottom-left to top-right', () => {
      const i = CSS.indexOf('.dim-tick {');
      if (i < 0) throw new Error('.dim-tick rule not found');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (!/rotate\\(45deg\\)/.test(rule)) throw new Error('expected rotate(45deg): ' + rule);
      // A vertical border rotated +45deg in a y-down space runs bottom-left to
      // top-right. A horizontal border, or -45deg, would give the wrong slope.
      if (!/border-left:/.test(rule)) throw new Error('the stroke should be a border-LEFT (a vertical stroke) so 45deg gives / not \\\\\\\\: ' + rule);
      if (/-45deg|135deg/.test(rule)) throw new Error('wrong slope direction: ' + rule);
    });

    __check('EXACT SPEC: the tick centre snaps to the intersection', () => {
      const i = CSS.indexOf('.dim-tick {');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (!/translate\\(-50%,\\s*-50%\\)/.test(rule)) throw new Error('the tick must be centred on the intersection, not hung off one side: ' + rule);
      // And the ends it is placed at are the line's actual ends.
      setAnnotDimEnds('tick'); __seed();
      const d = document.querySelector('.arch-dim-h');
      const ts = d.querySelectorAll('.dim-tick');
      // jsdom normalises a bare 0 to '0px'; both mean the start of the line.
      const norm = (v) => (parseFloat(v) === 0 ? '0' : v);
      const at = Array.from(ts).map(t => norm(t.style.left)).sort();
      if (at.join(',') !== '0,100%') throw new Error('horizontal ticks sit at ' + at.join(',') + ', expected the two ends');
      const dv = document.querySelector('.arch-dim-v');
      if (dv) {
        const atv = Array.from(dv.querySelectorAll('.dim-tick')).map(t => norm(t.style.top)).sort();
        if (atv.join(',') !== '0,100%') throw new Error('vertical ticks sit at ' + atv.join(','));
      }
      setAnnotDimEnds('none');
    });

    // CHANGED IN 16.25. The light-line/heavy-tick split used to be DERIVED (lines at
    // half the stored weight, ticks at full) because there was a single px weight
    // slider. Lines and ticks are now picked separately off a points ladder, so
    // LINKED has to mean literally the same weight — otherwise "I want them all the
    // same" is unreachable, which is the case the request named. The hierarchy is
    // still fully expressible, and is one unlink away; what this now pins is that
    // the two weights are independent and that linked means equal.
    __check('EXACT SPEC: line-weight hierarchy is reachable — lines light, tick heavier', () => {
      setAnnotWeightLinked(false);
      setAnnotLineWeightPt(0.5);
      setAnnotTickWeightPt(1);
      setAnnotDimEnds('tick');
      const line = parseFloat(__cssVar('--dim-line-w'));
      const tick = parseFloat(__cssVar('--dim-tick-w'));
      if (!(tick > line)) throw new Error('the tick must be heavier than the lines it crosses: line ' + line + ', tick ' + tick);
      if (!(tick / line >= 1.5)) throw new Error('the hierarchy is too subtle to read: line ' + line + ', tick ' + tick);
      // …and switching to the plain style must not silently rewrite either weight.
      setAnnotDimEnds('none');
      if (parseFloat(__cssVar('--dim-line-w')) !== line) throw new Error('the line weight moved when the ends changed');
      setAnnotWeightLinked(true); setAnnotLineWeightPt(1);
    });

    __check('EXACT REQUEST: linked means the SAME weight, not a derived split', () => {
      setAnnotLineWeightPt(1); setAnnotWeightLinked(true);
      [0.25, 0.5, 0.75, 1, 2, 3].forEach(pt => {
        setAnnotLineWeightPt(pt);
        ['none', 'tick'].forEach(ends => {
          setAnnotDimEnds(ends);
          const line = parseFloat(__cssVar('--dim-line-w'));
          const tick = parseFloat(__cssVar('--dim-tick-w'));
          if (line !== tick) throw new Error(pt + 'pt linked under ' + ends + ' gave line ' + line + ' vs tick ' + tick);
        });
      });
      setAnnotDimEnds('none'); setAnnotLineWeightPt(1);
    });

    __check('a hairline weight still renders on screen rather than vanishing', () => {
      setAnnotWeightLinked(true);
      setAnnotLineWeightPt(0.25);
      setAnnotDimEnds('tick');
      const line = parseFloat(__cssVar('--dim-line-w'));
      if (!(line > 0)) throw new Error('0.25pt gave a ' + line + 'px line');
      if (!(line >= 0.5)) throw new Error('0.25pt gave a ' + line + 'px line, too fine for a browser to paint');
      setAnnotLineWeightPt(1); setAnnotDimEnds('none');
    });

    __check('the dimension strokes read the light weight, not the raw weight', () => {
      ['.dim-line-segment {', '.dim-line-segment-v {'].forEach(sel => {
        const i = CSS.indexOf(sel);
        if (i < 0) throw new Error(sel + ' not found');
        const rule = CSS.slice(i, CSS.indexOf('}', i));
        if (rule.indexOf('--dim-line-w') < 0) throw new Error(sel + ' still uses the raw weight, so the hierarchy would not apply: ' + rule);
      });
    });

    __check('EXACT SPEC: extension lines overhang the intersection, and only under the tick style', () => {
      setAnnotDimEnds('none');
      if (_dimExtOverhang() !== 0) throw new Error('the plain style should have no overhang, got ' + _dimExtOverhang());
      setAnnotDimEnds('tick');
      const ov = _dimExtOverhang();
      if (!(ov > 0)) throw new Error('no overhang under the tick style');
      if (ov > 6) throw new Error('an overhang of ' + ov + 'px is far more than the ~1/16in the standard calls for');
      // The wall dims' extension stubs must actually get longer by it.
      __seed();
      const stub = document.querySelector('.arch-dim-h div[style*="border-left"]');
      if (stub && parseFloat(stub.style.top) >= 0) throw new Error('the wall extension line does not start above the dim line, so it cannot overhang it');
      setAnnotDimEnds('none');
    });

    __check('the overhang is a print constant, not a measurement that scales with zoom', () => {
      // A tick that grew with elevScale would be a different size on every page.
      setAnnotDimEnds('tick');
      const a = _dimExtOverhang();
      const z = elevZoomFactor; elevZoomFactor = 2.5; __seed();
      const b = _dimExtOverhang();
      elevZoomFactor = z; setAnnotDimEnds('none');
      if (a !== b) throw new Error('the overhang changed with zoom: ' + a + ' vs ' + b);
      if (S.indexOf('DIM_EXT_OVERHANG') < 0 || S.indexOf('DIM_TICK_LEN') < 0) throw new Error('the tick geometry constants are gone');
    });

    // ── Every dimension type, and the exports ──
    __check('the hang-height dimension uses the same ends as everything else', () => {
      // It used to draw its own perpendicular strokes regardless of the setting.
      setAnnotDimEnds('tick'); __seed();
      const fh = document.querySelector('.floor-hang-dim');
      if (!fh) throw new Error('no floor-to-hang dimension');
      if (fh.querySelectorAll('.dim-tick').length !== 2) throw new Error('the hang dimension kept its own end style: ' + fh.innerHTML.slice(0, 200));
      setAnnotDimEnds('none'); __seed();
      const fh2 = document.querySelector('.floor-hang-dim');
      if (fh2.querySelectorAll('.dim-tick').length !== 0) throw new Error('the plain style should restore the perpendicular ends');
    });

    __check('EXACT RISK: the SVG exporter has a case for the rotated tick', () => {
      // Without it, rectToSvg gives the ROTATED bbox (~6px square for a 9px
      // tick): too wide for the thin-line border cases, no background to fall
      // back on, so the tick emits nothing and vanishes from every SVG and PDF.
      const i = S.indexOf("data-svg-tick");
      if (i < 0) throw new Error('nothing marks the ticks for the exporter');
      const j = S.indexOf("el.getAttribute('data-svg-tick')");
      if (j < 0) throw new Error('emitEl has no data-svg-tick case, so ticks would be dropped from SVG/PDF output');
      const body = S.slice(j, j + 900);
      if (body.indexOf('<line') < 0) throw new Error('the tick case should emit a <line>');
      // The diagonal has to run bottom-left → top-right, i.e. y1 at the bbox
      // bottom and y2 at its top. Flipping those draws a backslash.
      if (body.indexOf('pos.y + pos.h') < 0) throw new Error('the emitted diagonal does not start at the bbox bottom, so the slope would be wrong');
      // And it must come BEFORE the axis-aligned border cases, which would
      // otherwise swallow it.
      const k = S.indexOf('const bTop = _parseBorder(cs.borderTop);', j - 2000);
      if (k > 0 && k < j) throw new Error('the tick case sits after the generic border cases');
    });

    __check('ticks are not interactive and cannot leak into a drag hit-test', () => {
      const i = CSS.indexOf('.dim-tick {');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (rule.indexOf('pointer-events: none') < 0) throw new Error('.dim-tick should be pointer-events:none: ' + rule);
    });

    __check('the setting is in the Elevations gear panel and persists', () => {
      const H = window.__htmlSrc;
      if (H.indexOf('annotEndsTick') < 0) throw new Error('no TICKS button in the Settings modal');
      if (H.indexOf('setAnnotDimEnds') < 0) throw new Error('the buttons are not wired to setAnnotDimEnds');
      // A real arrow OPTION would be a third button or a third mode value. (The
      // control's comment mentions arrowheads to say why there isn't one, so
      // match the wiring, not the prose.)
      if (H.indexOf('annotEndsArrow') >= 0) throw new Error('an arrowhead button appears in the Line Ends control');
      if (/setAnnotDimEnds\\((['"])arrow/.test(H) || /setAnnotDimEnds\\((['"])arrow/.test(S)) throw new Error('something calls setAnnotDimEnds with an arrow mode');
      // Seeding the modal must reflect the stored value, or reopening Settings
      // would show PLAIN while the drawing has ticks.
      if (S.indexOf('setAnnotDimEnds(annotationStyle.dimEnds)') < 0) throw new Error('seedAnnotationStyleInputs does not restore the stored value');
      // dimEnds rides on annotationStyle, which saveAnnotationStyle persists whole.
      if (S.indexOf('dimEnds:') < 0) throw new Error('dimEnds is not part of annotationStyle');
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
