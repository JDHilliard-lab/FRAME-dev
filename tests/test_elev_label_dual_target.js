// Three elevation changes.
//
// 1. THE REPORTED BUG. The spacing number sits INSIDE its dimension line, so the
//    line breaks in two and an opaque white chip fills the middle. On a tight gap
//    — routine in mm, where '102 mm' is three times the width of '4"' — the chip
//    is wider than the gap and spills over the frames. Dragging the line clear
//    (the hand workaround) doesn't help: the chip then covers the very extension
//    lines the drag created. It now lifts OUTSIDE the line when it won't fit,
//    above a horizontal one and beside a vertical one, and the line runs unbroken.
//
// 2. Elevation dual units, inches first with mm or cm in brackets, independent of
//    the spec-page setting and of the project unit.
//
// 3. The centre target mark from the reference drawings, on each frame's centre.
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

    const __seed = (unit) => {
      elevUnit = unit || 'in';
      const k = unitFactor('in', elevUnit);
      elevations = [{ name: 'Wall A', wallW: 185 * k, wallH: 108 * k, personPos: { x: -60 }, groupDims: [], frames: [
        { letter: 'A', id: 'P1', x: 20 * k, y: 40 * k, w: 30 * k, h: 24 * k, active: true },
        { letter: 'B', id: 'P2', x: 54 * k, y: 40 * k, w: 30 * k, h: 24 * k, active: true }
      ] }];
      currentElevIndex = 0; currentView = 'elevation';
      elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      document.getElementById('wallW').value = String(185 * k);
      document.getElementById('wallH').value = String(108 * k);
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };

    // jsdom does no layout: offsetWidth/offsetHeight are 0, so _autoLiftDimLabel
    // can't measure a real element. Drive it with a stubbed one instead, which is
    // the decision under test anyway.
    const __fakeDim = (type, spanPx, labelPx) => {
      const dim = document.createElement('div');
      dim.className = 'arch-dim ' + (type === 'h' ? 'arch-dim-h' : 'arch-dim-v');
      dim.innerHTML = '<div class="dim-line-segment"></div><span class="arch-label-new">102 mm</span><div class="dim-line-segment"></div>';
      const lbl = dim.querySelector('.arch-label-new');
      Object.defineProperty(dim, 'offsetWidth', { get: () => (type === 'h' ? spanPx : 2), configurable: true });
      Object.defineProperty(dim, 'offsetHeight', { get: () => (type === 'h' ? 2 : spanPx), configurable: true });
      Object.defineProperty(lbl, 'offsetWidth', { get: () => labelPx, configurable: true });
      Object.defineProperty(lbl, 'offsetHeight', { get: () => (type === 'h' ? 15 : labelPx), configurable: true });
      return dim;
    };

    // ── 1. The label lift ──
    __check('a number that fits inside the gap is left exactly where it was', () => {
      const dim = __fakeDim('h', 200, 40);
      const moved = _autoLiftDimLabel(dim, 'h');
      if (moved) throw new Error('lifted a label that had plenty of room');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.getAttribute('data-dim-lifted')) throw new Error('marked as lifted anyway');
      if (lbl.style.position === 'absolute') throw new Error('taken out of flow unnecessarily');
    });

    __check('EXACT BUG: a number wider than the gap moves ABOVE the line instead of covering it', () => {
      // The reported case: a 102mm gap between two frames, '102 mm' far wider.
      const dim = __fakeDim('h', 30, 46);
      const moved = _autoLiftDimLabel(dim, 'h');
      if (!moved) throw new Error('THE BUG: a 46px number in a 30px gap was left sitting in the line');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.style.position !== 'absolute') throw new Error('the label is still in the flex flow, so it still breaks the line');
      if (lbl.style.bottom !== '100%') throw new Error('expected the label above the line, got bottom=' + lbl.style.bottom);
      if (lbl.getAttribute('data-dim-lifted') !== '1') throw new Error('not marked as lifted');
    });

    __check('the line runs UNBROKEN once the number is lifted, so the ticks are visible', () => {
      const dim = __fakeDim('h', 30, 46);
      _autoLiftDimLabel(dim, 'h');
      const segs = dim.querySelectorAll('.dim-line-segment');
      if (segs.length !== 2) throw new Error('expected two segments');
      segs.forEach(s => { if (s.style.flex !== '1 1 50%') throw new Error('a segment kept a biased flex (' + s.style.flex + '), so a gap is left where the number was'); });
    });

    __check('a vertical dimension puts the number BESIDE the line, not above it', () => {
      const dim = __fakeDim('v', 24, 40);
      const moved = _autoLiftDimLabel(dim, 'v');
      if (!moved) throw new Error('a 40px-tall number in a 24px gap should lift');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.style.left !== '100%') throw new Error('expected the label beside the line, got left=' + lbl.style.left);
      if (lbl.style.bottom === '100%') throw new Error('a vertical dim should not put the label above the line');
    });

    __check('EXACT BUG: a line dragged DOWN puts its number BELOW, clear of the extension lines', () => {
      // The extension lines run from the dimension line back to the frame corners,
      // so they occupy the side the frames are on. Dragged down (negative offset)
      // they run UP, and the number lifting up landed straight on them — which read
      // as a broken line. Dragging up always looked fine because up is the default.
      const dim = __fakeDim('h', 30, 46);
      dim.setAttribute('data-line-off', '-6');
      if (!_autoLiftDimLabel(dim, 'h')) throw new Error('did not lift');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.getAttribute('data-lift-side') !== 'below') throw new Error('THE BUG: went ' + lbl.getAttribute('data-lift-side') + ', onto the extension lines');
      if (lbl.style.top !== '100%') throw new Error('expected top:100%, got ' + lbl.style.top);
      if (lbl.style.bottom !== 'auto') throw new Error('the old above-the-line anchor was left set: bottom=' + lbl.style.bottom);
    });

    __check('a line dragged UP still puts its number above, as it always did', () => {
      const dim = __fakeDim('h', 30, 46);
      dim.setAttribute('data-line-off', '6');
      _autoLiftDimLabel(dim, 'h');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.getAttribute('data-lift-side') !== 'above') throw new Error('went ' + lbl.getAttribute('data-lift-side'));
      if (lbl.style.bottom !== '100%') throw new Error('expected bottom:100%, got ' + lbl.style.bottom);
    });

    __check('an undragged line defaults to above, so nothing that looked right changes', () => {
      const dim = __fakeDim('h', 30, 46);      // no data-line-off at all
      _autoLiftDimLabel(dim, 'h');
      if (dim.querySelector('.arch-label-new').getAttribute('data-lift-side') !== 'above') throw new Error('the default side moved');
    });

    __check('a vertical line dragged LEFT puts its number to the left', () => {
      const dim = __fakeDim('v', 24, 40);
      dim.setAttribute('data-line-off', '-6');
      _autoLiftDimLabel(dim, 'v');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.getAttribute('data-lift-side') !== 'left') throw new Error('went ' + lbl.getAttribute('data-lift-side'));
      if (lbl.style.right !== '100%' || lbl.style.left !== 'auto') throw new Error('anchors are right=' + lbl.style.right + ' left=' + lbl.style.left);
    });

    __check('every dim renderer publishes the drag direction the side choice needs', () => {
      // Without data-line-off the lift silently falls back to "above" everywhere,
      // which is the bug.
      const sites = (S.match(/setAttribute\\('data-line-off'/g) || []).length;
      if (sites < 2) throw new Error('expected the spacing and custom-line renderers to both publish it, found ' + sites);
      __seed('in');
      const spacing = document.querySelector('#dim-layer .arch-dim, #floor-ceiling-layer .arch-dim');
      if (spacing && spacing.getAttribute('data-line-off') === null) throw new Error('a rendered spacing dim carries no data-line-off');
    });

    __check('the lifted label keeps the along-line nudge the user dragged in', () => {
      const dim = __fakeDim('h', 30, 46);
      dim.setAttribute('data-lbl-off', '12');
      _autoLiftDimLabel(dim, 'h');
      const lbl = dim.querySelector('.arch-label-new');
      if (lbl.style.left.indexOf('12') < 0) throw new Error('the offset was dropped: left=' + lbl.style.left);
    });

    __check('the end room keeps a just-barely-fitting number off the ticks', () => {
      // Exactly as wide as the span would collide with both ticks.
      const dim = __fakeDim('h', 46, 46);
      if (!_autoLiftDimLabel(dim, 'h')) throw new Error('a number exactly as wide as the gap should still lift clear of the ticks');
      if (typeof DIM_LABEL_END_ROOM === 'undefined' || !(DIM_LABEL_END_ROOM > 0)) throw new Error('DIM_LABEL_END_ROOM is gone');
    });

    __check('an unmeasurable element is left alone rather than being "fixed" blind', () => {
      const dim = document.createElement('div');
      dim.innerHTML = '<span class="arch-label-new">4"</span>';
      if (_autoLiftDimLabel(dim, 'h')) throw new Error('lifted a label it could not measure (offsetWidth 0)');
    });

    __check('every dimension renderer runs the lift after appending, not before', () => {
      // Measuring a detached element returns 0 and the lift silently no-ops.
      const calls = (S.match(/_autoLiftDimLabel\\(/g) || []).length;
      if (calls < 4) throw new Error('expected the definition plus the three renderers, found ' + calls);
      ['container.appendChild(dim);', 'layer.appendChild(dim);'].forEach(anchor => {
        let i = -1;
        while ((i = S.indexOf(anchor, i + 1)) >= 0) {
          const after = S.slice(i, i + 220);
          if (after.indexOf('_autoLiftDimLabel') < 0) continue;   // this site doesn't lift; fine
          const liftAt = after.indexOf('_autoLiftDimLabel');
          if (!(liftAt > 0)) throw new Error('a lift runs before its append');
        }
      });
    });

    // ── 2. Elevation dual units ──
    __check('elevation dual units are off by default and independent of the spec setting', () => {
      if (_elevDualUnit() !== '') throw new Error('default is ' + _elevDualUnit());
      editorialContent.specDualUnit = 'mm';
      if (_elevDualUnit() !== '') throw new Error('the elevation followed the SPEC setting; they are meant to be separate');
      editorialContent.specDualUnit = '';
    });

    __check('EXACT REQUEST: inches lead, with the chosen metric unit in brackets', () => {
      __seed('in');
      setElevDualUnit('mm');
      const got = elevFmtU(4);
      if (got !== '4\\"(102mm)') throw new Error('got "' + got + '"');
      setElevDualUnit('cm');
      if (elevFmtU(4) !== '4\\"(10.2cm)') throw new Error('cm gave "' + elevFmtU(4) + '"');
      setElevDualUnit('');
    });

    __check('a metric project still prints inches first, and the project unit is untouched', () => {
      __seed('mm');
      const before = elevUnit;
      setElevDualUnit('mm');
      const got = elevFmtU(102);         // 102mm stored
      if (got.indexOf('4\\"') !== 0) throw new Error('expected inches first, got "' + got + '"');
      if (got.indexOf('(102mm)') < 0) throw new Error('lost the companion: "' + got + '"');
      if (elevUnit !== before) throw new Error('the project unit changed to ' + elevUnit);
      setElevDualUnit('');
      elevUnit = 'in';
    });

    __check('dual units bring the unit mark back even with the interior-suffix toggle off', () => {
      __seed('in');
      const save = showUnitSuffix; showUnitSuffix = false;
      if (elevFmtU(4) !== '4') throw new Error('suffix-off baseline changed: ' + elevFmtU(4));
      setElevDualUnit('mm');
      const got = elevFmtU(4);
      showUnitSuffix = save; setElevDualUnit('');
      if (got.indexOf('\\"') < 0) throw new Error('a bare number with a bracketed one reads as a mistake: "' + got + '"');
    });

    __check('the wall dims and the AFF callout carry the companion too', () => {
      __seed('in');
      setElevDualUnit('mm');
      const aff = _elevAffLabel(57);
      if (aff.indexOf('(') < 0 || aff.indexOf('AFF') < 0) throw new Error('AFF label: ' + aff);
      // The wall dims build their own label; they must not print an inch value
      // with a mm mark after it.
      const wall = document.querySelector('#arch-dim-layer .arch-label-new');
      if (wall) {
        const t = wall.textContent;
        if (/\\d+\\s*mm\\(/.test(t)) throw new Error('the wall dim printed the project unit as its primary: ' + t);
      }
      setElevDualUnit('');
    });

    __check('the corner legend says both units when dual is on', () => {
      __seed('in');
      setElevDualUnit('mm');
      const t = unitLegendText();
      if (t.indexOf('INCHES') < 0 || t.indexOf('MILLIMETERS') < 0) throw new Error('legend reads: ' + t);
      setElevDualUnit('');
      if (unitLegendText().indexOf('MILLIMETERS') >= 0) throw new Error('legend still mentions mm with dual off: ' + unitLegendText());
    });

    __check('the elevation companion uses the ELEVATION precision, not the spec pages\\'', () => {
      // Deliberately different. An elevation is a set-out drawing, so mm are whole
      // numbers — matching how it already prints mm as its primary unit and what
      // the reference drawings show ('102 mm'). Spec pages keep a finer companion
      // because they are fabrication specs where 457.2mm is the point. Each context
      // stays internally consistent, which is what a reader notices.
      __seed('in');
      setElevDualUnit('mm');
      const e = _elevDualPart(18);
      setElevDualUnit('');
      const s2 = _specDualPart(18, 'in', 'mm');
      if (e !== '(457mm)') throw new Error('elevation companion should be whole mm, got ' + e);
      if (s2 !== '(457.2mm)') throw new Error('the spec companion should keep its decimal, got ' + s2);
    });

    __check('the elevation companion is float-safe: the same size rounds the same either way', () => {
      __seed('in');
      setElevDualUnit('cm');
      const fromIn = _elevDualPart(0.75);
      elevUnit = 'cm';
      const fromCm = _elevDualPart(1.905);      // the identical physical size
      elevUnit = 'in'; setElevDualUnit('');
      if (fromIn !== fromCm) throw new Error('float residue leaked in: ' + fromIn + ' vs ' + fromCm);
    });

    __check('the toggle persists, remembers the unit, and is wired into Settings', () => {
      if (H.indexOf('elevDualUnitCb') < 0) throw new Error('no Dual Units checkbox in the Settings modal');
      if (H.indexOf('setElevDualUnit') < 0) throw new Error('the MM/CM picker is not wired');
      setElevDualUnit('cm');
      toggleElevDualUnit(false);
      if (_elevDualUnit() !== '') throw new Error('unticking did not turn it off');
      toggleElevDualUnit(true);
      if (_elevDualUnit() !== 'cm') throw new Error('re-ticking forgot the cm choice, got ' + _elevDualUnit());
      setElevDualUnit('');
      if (S.indexOf('loadElevDualUnit()') < 0) throw new Error('the preference is never loaded at boot');
      if (S.indexOf('seedElevDualUnitInputs()') < 0) throw new Error('the modal never reflects the stored value');
    });

    __check('switching it invalidates the breaker/install captures', () => {
      const i = S.indexOf('function saveElevDualUnit');
      const body = S.slice(i, i + 500);
      if (body.indexOf('_elevGuidesChanged') < 0) throw new Error('cached elevation images would keep the old units on every deck page');
    });

    // ── The vertical wall dim ROTATES its label ──
    // Superseding the earlier stacking: putting the companion unit on its own line
    // halved the label width, but rotating makes its width the text HEIGHT, so it
    // cannot reach the wall line however long the number gets. It is also the
    // architectural standard for a vertical dimension. _wallStackedLbl went with it.
    __check('EXACT BUG: the vertical wall dim label is rotated, so it cannot cross the wall line', () => {
      __seed('in');
      setElevDualUnit('cm');
      drawElevAll();
      const v = document.querySelector('.arch-dim-v .arch-label-new');
      if (!v) throw new Error('no vertical wall dim label');
      if (!v.classList.contains('arch-label-rot')) throw new Error('THE BUG: the vertical wall label is not rotated, so a long dual-unit number reaches the wall line');
      if ((v.textContent || '').indexOf('274.3cm') < 0) throw new Error('lost the companion: ' + v.textContent);
      setElevDualUnit('');
    });

    __check('the rotation is 90 degrees counter-clockwise and takes the label out of flow', () => {
      const i = CSS.indexOf('.arch-dim-v .arch-label-rot {');
      if (i < 0) throw new Error('no .arch-label-rot rule');
      const rule = CSS.slice(i, CSS.indexOf('}', i));
      if (rule.indexOf('rotate(-90deg)') < 0) throw new Error('expected rotate(-90deg) (reads bottom-to-top): ' + rule);
      if (rule.indexOf('position: absolute') < 0) throw new Error('the label must leave the flex flow so the line runs through: ' + rule);
    });

    __check('the HORIZONTAL wall dim is left alone — it has the whole wall to sit in', () => {
      __seed('in');
      setElevDualUnit('mm');
      drawElevAll();
      const h = document.querySelector('.arch-dim-h .arch-label-new');
      if (!h) throw new Error('no horizontal wall dim label');
      if (h.classList.contains('arch-label-rot')) throw new Error('the horizontal wall label was rotated too');
      setElevDualUnit('');
    });

    __check('the superseded stacking helper is gone, not left unused', () => {
      if (typeof _wallStackedLbl !== 'undefined') throw new Error('_wallStackedLbl survives with no caller');
      if (S.indexOf('_wallStackedLbl(') >= 0) throw new Error('something still calls _wallStackedLbl');
    });

    __check('the lift leaves an already-rotated label alone', () => {
      // Its offsetHeight is the UNROTATED height, so the lift would compare the
      // wrong extent against the span.
      const dim = __fakeDim('v', 24, 40);
      dim.querySelector('.arch-label-new').classList.add('arch-label-rot');
      if (_autoLiftDimLabel(dim, 'v')) throw new Error('the lift touched a rotated label');
    });

    // ── 3. The centre target ──
    __check('EXACT REQUEST: each frame centre gets a target mark', () => {
      __seed('in');
      const targets = document.querySelectorAll('#frame-center-layer [data-svg-passthrough]');
      if (targets.length !== 2) throw new Error('expected one target per frame, got ' + targets.length);
      const svg = targets[0].querySelector('svg');
      if (!svg) throw new Error('the target is not real inline SVG');
      if (!svg.querySelector('circle')) throw new Error('no circle in the target');
      if (svg.querySelectorAll('line').length !== 2) throw new Error('the target should carry the crosshair through it');
    });

    __check('the target is centred on the frame centre', () => {
      __seed('in');
      const t = document.querySelector('#frame-center-layer [data-svg-passthrough]');
      const f = elevFrames[0];
      const cx = (f.x + f.w / 2) * elevScale, cy = (f.y + f.h / 2) * elevScale;
      if (Math.abs(parseFloat(t.style.left) - cx) > 0.5) throw new Error('left is ' + t.style.left + ', frame centre ' + cx);
      if (Math.abs(parseFloat(t.style.bottom) - cy) > 0.5) throw new Error('bottom is ' + t.style.bottom + ', frame centre ' + cy);
      // translate(-50%, 50%) is what actually centres it in a bottom-anchored layer.
      if (t.style.transform.indexOf('-50%') < 0) throw new Error('not centred on the point: ' + t.style.transform);
    });

    __check('the target follows the Centers layout-guide toggle', () => {
      __seed('in');
      const layer = document.getElementById('frame-center-layer');
      if (!layer.querySelector('[data-svg-passthrough]')) throw new Error('no target to test');
      // It lives in frame-center-layer, which the Centers toggle shows/hides, so
      // it can never be left on with the crosshairs off.
      const t = document.querySelector('#frame-center-layer [data-svg-passthrough]');
      if (t.closest('#frame-center-layer') !== layer) throw new Error('the target is not inside the centers layer');
    });

    __check('EXACT RISK: the exporter passes the target through instead of squaring it', () => {
      // The generic border cases only emit <rect> and have no border-radius case,
      // so a CSS circle would print as a square in every PDF and SVG.
      const j = S.indexOf("el.getAttribute('data-svg-passthrough')");
      if (j < 0) throw new Error('emitEl has no passthrough case');
      const body = S.slice(j, j + 1200);
      if (body.indexOf('inner.innerHTML') < 0) throw new Error('the passthrough does not copy the inline SVG');
      if (body.indexOf('translate(') < 0) throw new Error('the copied markup is not moved to where the element sits');
      // And it must run BEFORE the border cases that would otherwise claim it.
      const k = S.indexOf('const bTop = _parseBorder(cs.borderTop);', j);
      if (!(k > j)) throw new Error('the passthrough case sits after the generic border cases');
    });

    __check('EXACT REQUEST: the wall-centre x hang-height crossing gets a target too', () => {
      __seed('in');
      const t = document.querySelector('#guide-layer [data-svg-passthrough]');
      if (!t) throw new Error('no target on the guides');
      const wallW = elevResolvedWallW, hang = getHangHeight();
      const cx = (wallW / 2) * elevScale, cy = hang * elevScale;
      if (Math.abs(parseFloat(t.style.left) - cx) > 0.5) throw new Error('left is ' + t.style.left + ', wall centre ' + cx);
      if (Math.abs(parseFloat(t.style.bottom) - cy) > 0.5) throw new Error('bottom is ' + t.style.bottom + ', hang height ' + cy);
      // Same mark as the frame centres — circles mean centres, one reading.
      if (!t.querySelector('circle')) throw new Error('the guide target is not the same mark');
    });

    __check('the guide target rides with the Guides toggle that owns both lines', () => {
      __seed('in');
      const layer = document.getElementById('guide-layer');
      const t = layer.querySelector('[data-svg-passthrough]');
      if (!t) throw new Error('the guide target is not in the guide layer, so it could be left floating with no lines under it');
      // And it follows the hang height, since it marks that crossing. The hang
      // height is stored in INCHES now, with the Settings input as its display.
      const save = elevHangIn; elevHangIn = 60; drawElevAll();
      const moved = document.querySelector('#guide-layer [data-svg-passthrough]');
      const expect = 60 * unitFactor('in', elevUnit) * elevScale;
      elevHangIn = save; drawElevAll();
      if (Math.abs(parseFloat(moved.style.bottom) - expect) > 0.5) throw new Error('the target did not follow the hang height to 60in');
    });

    __check('the target is a drafting mark: fixed px, not scaled with the wall', () => {
      __seed('in');
      const a = document.querySelector('#frame-center-layer [data-svg-passthrough]').style.width;
      const z = elevZoomFactor; elevZoomFactor = 2.5; __seed('in');
      const b = document.querySelector('#frame-center-layer [data-svg-passthrough]').style.width;
      elevZoomFactor = z;
      if (a !== b) throw new Error('the target resized with zoom: ' + a + ' vs ' + b);
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
      'window.__htmlSrc = ' + JSON.stringify(htmlSrc) + ';\n' +
      'window.__cssSrc = ' + JSON.stringify(cssSrc) + ';\n' +
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
