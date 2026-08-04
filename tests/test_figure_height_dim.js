// Scale-figure height dimension — floor to the top of the head, built from the
// same parts as every other dimension on the drawing.
//
// The request, verbatim: "lets keep it consistant lets have the dim lines from on
// the character if we want to know its height. soo a dashed line will come from the
// top of the head and the line can be moved like the others and the text will be
// vertical. I can move the line so its just beside it on the left, or directly in
// center, or I can drag the line to the right of it."
//
// (This replaces the standalone caption chip from the first pass at the same
// request. Its test file went with it — the behaviour it pinned was withdrawn, not
// broken.)
//
// The trap that had to be solved first: the number is ROTATED, and until now only
// the outer wall dims rotated theirs. Everything else was blocked in
// buildDimControls, which appends the four drag chevrons as children of the LABEL —
// rotate the label and the chevrons rotate with it, so up/down become left/right.
// The fix is an unrotated stand-in box for the arrows, sized to the label's
// on-screen footprint (a 90-degree turn swaps its width and height).
//
// The second trap: the dimension cannot live inside #person-wrap. That element is
// position + z-index, so it opens a stacking context its children can never leave,
// and another dim would cross this one on screen while the PDF drew it on top,
// because the SVG's text group is always emitted last.
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
    const __layer = () => document.getElementById('figure-dim-layer');
    const __dim = () => __layer().querySelector('.arch-dim');
    const __lbl = () => __layer().querySelector('.arch-label-new');
    const __leader = () => __layer().querySelector('.dim-leader');
    const __wrap = () => document.getElementById('person-wrap');
    const __figW = () => _elevPersonWidthPx(document.getElementById('person'), 72 * elevScale);

    const __seed = (unit, dual) => {
      elevUnit = unit || 'in';
      elevDualUnit = dual || '';
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: 6, placed: true }, frames: [
        { letter: 'A', id: 'P1', x: 40, y: 40, w: 30, h: 24, active: true }
      ] }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames; elevPersonPos = elevations[0].personPos;
      elevZoomFactor = 1; selectedDimId = null;
      document.getElementById('wallW').value = '185';
      document.getElementById('wallH').value = '108';
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      __wrap().style.display = 'block';
      drawElevAll();
    };

    // ── The tick box ──
    __check('EXACT REQUEST: a tick box in the elevation settings turns it on and off', () => {
      if (!/id="figureDimToggle"/.test(H)) throw new Error('no tick box in the Settings panel');
      if (!/onchange="toggleFigureDim\\(this.checked\\)"/.test(H)) throw new Error('the tick box is not wired to toggleFigureDim');
      const sf = H.indexOf('SCALE FIGURE'), cb = H.indexOf('figureDimToggle'), next = H.indexOf('NUDGE STEP', sf);
      if (!(cb > sf && cb < next)) throw new Error('the tick box is not inside the Scale Figure section');
      if (dimVisibility.figureHeight !== false) throw new Error('it should default off, got ' + dimVisibility.figureHeight);
      __seed('in');
      if (__dim()) throw new Error('a dimension drew with the setting off');
      toggleFigureDim(true); __seed('in');
      if (!__dim()) throw new Error('nothing drew after ticking the box');
      toggleFigureDim(false); __seed('in');
      if (__dim()) throw new Error('unticking did not remove it');
    });

    __check('it is deck-wide and drops the cached elevation captures like every other guide', () => {
      const i = S.indexOf('function toggleFigureDim');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('saveDimVisibility()') < 0) throw new Error('toggleFigureDim does not persist through saveDimVisibility, which is what invalidates the captures');
      if (S.indexOf('figureHeight: false') < 0) throw new Error('the flag is not part of dimVisibility');
      // Reopening Settings shows the truth.
      toggleFigureDim(true);
      document.getElementById('figureDimToggle').checked = false;
      openPrecisionModal();
      if (!document.getElementById('figureDimToggle').checked) throw new Error('reopening Settings shows the box unticked while the dimension is on');
      toggleFigureDim(false);
    });

    // ── EXACT REQUEST: it is a real dimension, like the others ──
    __check('EXACT REQUEST: it is a dimension line, not a bespoke callout', () => {
      toggleFigureDim(true); __seed('in');
      const d = __dim();
      if (!d.classList.contains('arch-dim-v')) throw new Error('not a vertical arch-dim: ' + d.className);
      if (d.querySelectorAll('.dim-line-segment-v').length !== 2) throw new Error('it does not use the shared line segments');
      if (!__lbl()) throw new Error('it does not use the shared .arch-label-new');
    });

    __check('it runs from the floor to the top of the head', () => {
      toggleFigureDim(true); __seed('in');
      const d = __dim();
      // Floor-anchored dims drop the extra 1px to sit flush on the wall's floor
      // border, exactly like every other dimension starting at y = 0.
      if (parseFloat(d.style.bottom) !== -1) throw new Error('it does not start flush on the floor: bottom ' + d.style.bottom);
      const want = 72 * elevScale + 1;
      if (Math.abs(parseFloat(d.style.height) - want) > 0.5) throw new Error('it is ' + d.style.height + ' tall, the figure is ' + want + 'px');
    });

    __check('EXACT REQUEST: the number reads vertically', () => {
      toggleFigureDim(true); __seed('in');
      if (!__lbl().classList.contains('arch-label-rot')) throw new Error('the label is not rotated');
      const i = CSS.indexOf('.arch-dim-v .arch-label-rot');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (!/rotate\\(-90deg\\)/.test(rule)) throw new Error('the rotation is not the architectural 90 CCW: ' + rule);
    });

    __check('the number follows the deck dual-unit setting and the suffix toggle', () => {
      toggleFigureDim(true);
      const sfx = showUnitSuffix; showUnitSuffix = true;
      __seed('in', '');
      if (__lbl().textContent !== '72\\u0022') throw new Error('inches gave: ' + __lbl().textContent);
      __seed('in', 'mm');
      // 72in is 1828.8mm, which rounds to 1829 at the elevation's whole-mm precision.
      if (__lbl().textContent !== '72\\u0022(1829mm)') throw new Error('dual mm gave: ' + __lbl().textContent);
      __seed('cm', '');
      if (__lbl().textContent !== '182.9 cm') throw new Error('a cm project gave: ' + __lbl().textContent);
      // Interior dims drop the suffix when that toggle is off — this is one of them.
      showUnitSuffix = false; __seed('in', '');
      if (__lbl().textContent !== '72') throw new Error('with the suffix toggle off it still reads: ' + __lbl().textContent);
      showUnitSuffix = sfx;
      // One height for the drawn figure and the number that measures it.
      const i = S.indexOf('function _elevFigureDimLabel');
      if (S.slice(i, i + 200).indexOf('ELEV_PERSON_HEIGHT_IN') < 0) throw new Error('the dimension hardcodes its own height');
    });

    __check('it takes the shared dimension styling — colour, weight, dash and line ends', () => {
      toggleFigureDim(true);
      setAnnotDimEnds('none'); __seed('in');
      if (__layer().querySelectorAll('[data-svg-tick]').length) throw new Error('ticks drew under the PLAIN style');
      setAnnotDimEnds('tick'); __seed('in');
      if (__layer().querySelectorAll('[data-svg-tick]').length !== 2) throw new Error('TICKS mode did not put an architectural tick on each end');
      // The segments are the CSS-var-driven ones, so weight and colour arrive for free.
      const seg = __layer().querySelector('.dim-line-segment-v');
      if (seg.getAttribute('style')) throw new Error('the line segment overrides the shared CSS: ' + seg.getAttribute('style'));
      setAnnotDimEnds('none');
    });

    // ── EXACT REQUEST: the dashed leader to the crown ──
    __check('EXACT REQUEST: a dashed line connects the top of the head to the dimension line', () => {
      toggleFigureDim(true); __seed('in');
      // Down the middle there is nothing to connect — the line already touches the
      // crown — so the leader correctly does not draw.
      elevPersonPos.dimOff = 0; drawElevAll();
      if (__leader()) throw new Error('a zero-length leader drew with the line down the figure centre');
      elevPersonPos.dimOff = -0.8; drawElevAll();
      const l = __leader();
      if (!l) throw new Error('THE MISSING PIECE: no leader when the line is moved off the figure centre');
      // 16.31: dashed strokes are a repeating gradient, not a CSS dashed border, so
      // the rhythm can follow the Dash spacing setting (a border's rhythm is the
      // browser's and cannot be asked for). The class IS the dash now.
      if (!l.classList.contains('dim-dash-h')) throw new Error('the leader is not dashed: ' + l.className);
      if (l.getAttribute('data-svg-dash') !== '1') throw new Error('the leader has no export marker, so it would vanish from the SVG and the PDF');
      // It sits at the crown, not anywhere else up the figure.
      if (Math.abs(parseFloat(l.style.bottom) - 72 * elevScale) > 0.5) throw new Error('the leader is at ' + l.style.bottom + ', the crown is at ' + (72 * elevScale) + 'px');
      // And it spans the gap it was created to close.
      const gap = Math.abs(0.8 * __figW());
      if (Math.abs(parseFloat(l.style.width) - gap) > 4) throw new Error('the leader is ' + l.style.width + ' for a ' + gap + 'px offset');
      elevPersonPos.dimOff = 0;
    });

    __check('the leader overhangs the dimension line under TICKS, so the tick has its crosshair', () => {
      toggleFigureDim(true);
      setAnnotDimEnds('none'); __seed('in');
      elevPersonPos.dimOff = 0.8; drawElevAll();
      const plain = parseFloat(__leader().style.width);
      setAnnotDimEnds('tick'); drawElevAll();
      const ticked = parseFloat(__leader().style.width);
      if (!(ticked > plain)) throw new Error('the leader did not gain the overhang under TICKS: ' + plain + ' vs ' + ticked);
      if (ticked - plain !== _dimExtOverhang()) throw new Error('the overhang is ' + (ticked - plain) + ', expected ' + _dimExtOverhang());
      setAnnotDimEnds('none'); elevPersonPos.dimOff = 0;
    });

    // ── EXACT REQUEST: left of the figure, centred, or right of it ──
    __check('EXACT REQUEST: the line moves to the left of the figure, the centre, or the right', () => {
      toggleFigureDim(true); __seed('in');
      const w = __figW(), centre = elevPersonPos.x * elevScale + w / 2;
      const at = (off) => { elevPersonPos.dimOff = off; drawElevAll(); return parseFloat(__dim().style.left); };
      // Centre.
      if (Math.abs(at(0) - centre) > 0.5) throw new Error('at 0 the line is at ' + at(0) + ', the figure centre is ' + centre);
      // Clear to the LEFT of the figure's left edge…
      const left = at(-1);
      if (!(left < centre - w / 2)) throw new Error('fully left puts the line at ' + left + ', inside the figure (left edge ' + (centre - w / 2) + ')');
      // …and clear to the RIGHT of its right edge.
      const right = at(1);
      if (!(right > centre + w / 2)) throw new Error('fully right puts the line at ' + right + ', inside the figure (right edge ' + (centre + w / 2) + ')');
      elevPersonPos.dimOff = 0;
    });

    __check('the travel is clamped, so the line cannot wander off across the artwork', () => {
      const D = ELEV_FIG_DIM_DEFAULT;
      [[-9, -1], [9, 1], [0.5, 0.5], ['x', D], [null, D], [undefined, D]].forEach(([inp, want]) => {
        elevPersonPos.dimOff = inp;
        if (_elevFigDimOff() !== want) throw new Error(JSON.stringify(inp) + ' resolved to ' + _elevFigDimOff() + ', expected ' + want);
      });
      elevPersonPos.dimOff = 0;
    });

    __check('EXACT REQUEST: by default the line sits to the LEFT of the character', () => {
      // It used to default down the figure's centre, drawing straight through the
      // silhouette.
      if (!(ELEV_FIG_DIM_DEFAULT < 0)) throw new Error('the default is ' + ELEV_FIG_DIM_DEFAULT + ', which is not to the left');
      toggleFigureDim(true);
      __seed('in');                                  // a fresh elevation, nothing stored
      if (elevPersonPos.dimOff !== undefined) throw new Error('this check needs an unset offset');
      const w = __figW(), centre = elevPersonPos.x * elevScale + w / 2;
      const at = parseFloat(__dim().style.left);
      if (!(at < centre)) throw new Error('the line defaults to ' + at + ', at or right of the figure centre ' + centre);
      // Clear of the silhouette, not through it.
      if (at > centre - w / 2 + 0.5) throw new Error('the line defaults inside the figure: ' + at + ' vs a left edge of ' + (centre - w / 2));
      // And the leader draws, because there is now a gap to close.
      if (!__leader()) throw new Error('no leader at the default position');
      // Still room to drag further left.
      if (!(ELEV_FIG_DIM_DEFAULT > -ELEV_FIG_DIM_RANGE)) throw new Error('the default is already at the left clamp, so it cannot be nudged out');
    });

    __check('the offset is a FRACTION of the figure, so a unit change does not move the line', () => {
      // Wall units here would have to be reconverted on every toggle, the same
      // fault the hang height had.
      toggleFigureDim(true); __seed('in');
      elevPersonPos.dimOff = -0.6;
      const a = _elevFigDimOff();
      setElevUnit('cm'); drawElevAll();
      const b = _elevFigDimOff();
      setElevUnit('in');
      if (a !== b) throw new Error('a unit switch moved it from ' + a + ' to ' + b);
      elevPersonPos.dimOff = 0;
    });

    __check('the line tracks the figure when the character is moved along the wall', () => {
      toggleFigureDim(true); __seed('in');
      const a = parseFloat(__dim().style.left);
      elevPersonPos.x = 80; drawElevAll();
      const b = parseFloat(__dim().style.left);
      if (Math.abs((b - a) - (74 * elevScale)) > 0.5) throw new Error('the line moved ' + (b - a) + 'px for a ' + (74 * elevScale) + 'px figure move');
    });

    // ── The rotated-label arrow fix ──
    __check('EXACT REQUEST: it is moved "like the others" — the same 4-way chevron cluster', () => {
      toggleFigureDim(true); __seed('in');
      const arrows = __layer().querySelectorAll('.dim-arrow');
      if (arrows.length !== 4) throw new Error(arrows.length + ' chevrons, expected 4');
      arrows.forEach(a => {
        if (!a.getAttribute('data-export-skip')) throw new Error('a chevron is not export-skipped, so it would print as an arrowhead');
      });
      // Clicking the line selects it, same as any other dimension.
      if (!__layer().querySelector('[data-export-skip]')) throw new Error('no hit strip to click the line with');
    });

    __check('EXACT BUG CLASS: rotating the label must not rotate its arrows', () => {
      // buildDimControls appends the chevrons to the LABEL. With the label turned
      // 90 degrees they turn too, and the up arrow drags left. This is the reason
      // every vertical dim except the outer wall ones stayed unrotated.
      toggleFigureDim(true); __seed('in');
      const arrow = __layer().querySelector('.dim-arrow');
      const host = arrow.parentNode;
      if (host.classList.contains('arch-label-rot')) throw new Error('THE BUG: the chevrons are children of the rotated label, so up/down drag sideways');
      const t = host.style.transform || '';
      if (/rotate/.test(t)) throw new Error('the chevron host is itself rotated: ' + t);
      // The host must still be placed over the label, or the cluster floats away
      // from the number it belongs to.
      if (host.parentNode !== __dim()) throw new Error('the chevron host is not on the dimension');
      if (!/translate\\(-50%,\\s*-50%\\)/.test(t)) throw new Error('the host is not centred on the label: ' + t);
      // And it is sized to the label's ON-SCREEN box — a 90 degree turn swaps the
      // label's width and height, so the arrows sit at the turned extents.
      if (!host.style.width || !host.style.height) throw new Error('the host has no size, so all four chevrons stack on one point');
      if (host.getAttribute('data-export-skip') !== '1') throw new Error('the chevron host would print');
    });

    __check('EXACT BUG: the number sits ON the line, not hanging off the bottom of it', () => {
      // buildDimControls forces the label position:relative, which is right for an
      // upright label sitting in the flex flow between the two segments. A rotated
      // label is placed absolutely by .arch-label-rot, and forcing it relative
      // dropped it back into that flow — where the rule's top:50% stops meaning
      // "centred on the line" and starts meaning "half its own height below
      // wherever the flow put it". The number ended up low and out to one side
      // while the chevrons, on their own box, stayed correctly at mid-line.
      toggleFigureDim(true); __seed('in');
      const lbl = __lbl();
      if (lbl.style.position !== 'absolute') throw new Error('THE BUG: the rotated number is position:' + lbl.style.position + ', so top:50% offsets it from its flow position instead of centring it on the line');
      // Centred on the line at zero slide — same anchor the chevron cluster uses.
      const host = __layer().querySelector('.dim-arrow').parentNode;
      if (lbl.style.top !== host.style.top) throw new Error('the number is at ' + lbl.style.top + ' and its chevrons are at ' + host.style.top + ' — they must share one anchor');
      if (!/50%/.test(lbl.style.top)) throw new Error('at zero slide the number should be at mid-line, got ' + lbl.style.top);
      // And still on the line's own axis, not pushed aside by the flex flow.
      const i = CSS.indexOf('.arch-dim-v .arch-label-rot');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (!/left:\\s*50%/.test(rule) || !/translate\\(-50%,\\s*-50%\\)/.test(rule)) throw new Error('the rotated label rule no longer centres on the line: ' + rule);
      if (lbl.style.left) throw new Error('something overrode the horizontal centring: left=' + lbl.style.left);
    });

    __check('the number slides along the line, and the line stays continuous behind it', () => {
      toggleFigureDim(true); __seed('in');
      const top0 = __lbl().style.top;
      elevPersonPos.dimLblOff = 12; drawElevAll();
      if (__lbl().style.top === top0) throw new Error('the number did not move along the line');
      // A rotated label is out of the flex flow, so biasing the segments would only
      // open an empty gap. The line runs through under the chip instead.
      const segs = __layer().querySelectorAll('.dim-line-segment-v');
      segs.forEach(s => { if (s.style.flex) throw new Error('the segments were biased for an out-of-flow label: ' + s.style.flex); });
      // The chevron cluster travels with the number.
      const host = __layer().querySelector('.dim-arrow').parentNode;
      if (host.style.top === 'calc(50% - 0px)') throw new Error('the chevrons stayed at mid-line while the number moved');
      elevPersonPos.dimLblOff = 0;
    });

    __check('the x deletes it by turning the setting off, not by orphaning the tick box', () => {
      // A hidden-dim id would leave the box ticked with nothing drawn — a state
      // this codebase has been bitten by before.
      const i = S.indexOf('function renderFigureHeightDim');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('toggleFigureDim(false)') < 0) throw new Error('the x does not clear the setting');
      if (/hideDim\\('figureHeight'\\)/.test(S)) throw new Error('it uses the hidden-dim list, which the tick box cannot see');
    });

    __check('the reset button puts the line back beside the figure', () => {
      toggleFigureDim(true); __seed('in');
      elevPersonPos.dimOff = 1; elevPersonPos.dimLblOff = 30;
      resetFigureDimPos();
      if (_elevFigDimOff() !== ELEV_FIG_DIM_DEFAULT || _elevFigDimLblOff() !== 0) throw new Error('reset gave ' + _elevFigDimOff() + ' / ' + _elevFigDimLblOff());
      if (!/resetFigureDimPos\\(\\)/.test(H)) throw new Error('the reset button is not in the panel');
    });

    // ── It belongs to the figure ──
    __check('no figure, no dimension', () => {
      toggleFigureDim(true); __seed('in');
      if (!__dim()) throw new Error('setup: it should be showing');
      __wrap().style.display = 'none'; drawElevAll();
      if (__dim()) throw new Error('it drew with the character hidden');
      const hint = document.getElementById('figureDimHint');
      if (!hint || hint.style.display === 'none') throw new Error('a ticked box with the figure hidden gives no explanation');
      __wrap().style.display = 'block'; drawElevAll();
      if (!__dim()) throw new Error('it did not come back with the character');
      if (hint.style.display !== 'none') throw new Error('the hint stayed up once the figure was shown');
    });

    __check('the position is per-elevation and rides in the project, undo and the capture cache', () => {
      toggleFigureDim(true); __seed('in');
      elevPersonPos.dimOff = -0.5;
      if (elevations[0].personPos.dimOff !== -0.5) throw new Error('the offset did not land on the elevation');
      const snap = snapshotProjectState();
      const sig = _elevCaptureSignature();
      elevPersonPos.dimOff = 0.9;
      if (_elevCaptureSignature() === sig) throw new Error('a moved line would leave a stale drawing on every breaker page');
      restoreProjectState(snap);
      if (elevations[0].personPos.dimOff !== -0.5) throw new Error('undo restored ' + elevations[0].personPos.dimOff);
      elevPersonPos.dimOff = 0;
    });

    // ── Exports ──
    __check('EXACT RISK: the layer is walked by the SVG exporter and its bounds pass', () => {
      const i = S.indexOf('const annotationLayers = [');
      if (S.slice(i, S.indexOf('];', i)).indexOf("'figure-dim-layer'") < 0) throw new Error('figure-dim-layer is not in the exporter\\'s layer list, so it would be on screen and missing from every PDF');
      const j = S.indexOf("['frame-layer','arch-dim-layer'");
      if (S.slice(j, S.indexOf('].forEach', j)).indexOf("'figure-dim-layer'") < 0) throw new Error('figure-dim-layer is not in the export bounds list, so a line parked left of the figure could be cropped');
    });

    __check('EXACT RISK: it sits ABOVE the other dim layers, as it does in the PDF', () => {
      const z = parseInt((__layer().getAttribute('style') || '').match(/z-index:\\s*(\\d+)/)[1], 10);
      ['dim-layer', 'arch-dim-layer', 'label-layer', 'custom-lines-layer'].forEach(id => {
        const m = (document.getElementById(id).getAttribute('style') || '').match(/z-index:\\s*(\\d+)/);
        const oz = m ? parseInt(m[1], 10) : 0;
        if (z <= oz) throw new Error('the figure dim is at z-index ' + z + ', at or under ' + id + ' at ' + oz);
      });
      if (__layer().parentNode === __wrap()) throw new Error('the layer is inside person-wrap, whose stacking context traps it below the dims');
    });

    __check('the rotated number is plain text with an opaque chip, which is what the exporters need', () => {
      // emitEl treats an element as text only when its element children are all
      // export-skipped, and turns a background into the knock-out rect behind it.
      // The rotated-chip and rotated-text cases are pinned in
      // test_elev_vector_rotated_labels.js — this just proves we hand them the shape
      // they expect.
      toggleFigureDim(true); __seed('in');
      Array.from(__lbl().children).forEach(c => {
        if (!c.getAttribute('data-export-skip')) throw new Error('the number has a non-skipped child, so emitEl would emit no text for it');
      });
      if (!__lbl().textContent.trim()) throw new Error('the number has no direct text');
      const i = CSS.indexOf('.arch-label-new {');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (!/background:\\s*#ffffff/.test(rule)) throw new Error('the shared label has no opaque chip, so the line would read through the number: ' + rule);
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
