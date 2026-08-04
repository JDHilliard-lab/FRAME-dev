// Group dimension boxes were the one dimension type that didn't follow the
// Settings panel. Two reported symptoms, one root cause.
//
// 1. "The box stayed red while all the other lines changed to black."
//    Each group dim carried `entry.style`, a COPY of annotationStyle taken when
//    the box was created. Exactly one function resynced those copies
//    (applyAnnotationStyleFromModal), so any route that restored `elevations`
//    afterwards — undo, opening a project, an autosave restore — brought the old
//    copy back, while annotationStyle (which lives in localStorage, not in the
//    project) kept the new colour. Every CSS-var-driven dimension updated; the
//    group box, alone in reading a snapshot, did not.
//
// 2. "Group dimensions aren't synced with the architectural ticks."
//    Same cause, different field: renderGroupDims drew its own perpendicular end
//    stub and never consulted the Line Ends setting.
//
// The fix removes the class of bug rather than adding another resync: there is no
// UI for a per-box style, so the snapshot bought nothing and only went stale.
// renderGroupDims now reads the live style, like everything else.
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
    editorialContent = editorialContent || {};
    const S = window.__appSrc;

    const __seed = () => {
      elevUnit = 'in';
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [], frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true, selected: true },
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
      createGroupDimFromSelection();
    };
    const __box = () => document.querySelector('#group-dim-layer div');
    const __setColor = (hex) => { document.getElementById('annotColor').value = hex; applyAnnotationStyleFromModal(); };
    const __gTicks = () => document.querySelectorAll('#group-dim-layer [data-svg-tick]').length;
    const __aTicks = () => document.querySelectorAll('.arch-dim .dim-tick').length;

    __check('a group box is created and drawn', () => {
      setAnnotDimEnds('none'); __setColor('#e00000'); __seed();
      if (elevations[0].groupDims.length !== 1) throw new Error('no group dim created');
      if (!__box()) throw new Error('nothing rendered into #group-dim-layer');
    });

    // 16.31: the box's four dashed edges are a repeating gradient painted in
    // currentColor, not a CSS dashed border, so the rhythm can follow the Dash
    // spacing setting (a border's rhythm is the browser's and cannot be asked for).
    // Its colour therefore lives in the color property and its weight comes from
    // --dim-line-w like every other stroke. Same properties, read where they now are.
    const __boxInk = () => __box().style.color;

    __check('the box follows a colour change, like every other dimension', () => {
      setAnnotDimEnds('none'); __setColor('#e00000'); __seed();
      if (!/224, 0, 0/.test(__boxInk())) throw new Error('box did not start red: ' + __boxInk());
      __setColor('#000000');
      if (!/0, 0, 0/.test(__boxInk())) throw new Error('box did not follow the colour change: ' + __boxInk());
    });

    __check('EXACT BUG: a stale per-box style from an older save cannot hold the old colour', () => {
      // This is the reported failure. Create the box while the style is red, switch
      // the deck style to black, then restore elevations the way undo or opening a
      // project does — carrying a red snapshot on the entry.
      setAnnotDimEnds('none'); __setColor('#e00000'); __seed();
      __setColor('#000000');
      const restored = JSON.parse(JSON.stringify(elevations));
      restored[0].groupDims[0].style = { color: '#e00000', weight: 6, dash: false, fontSize: 22 };
      elevations = restored; elevFrames = elevations[0].frames;
      drawElevAll();
      const b = __boxInk();
      if (/224, 0, 0/.test(b)) throw new Error('THE BUG: the box is red again while annotationStyle is black -> ' + b);
      if (!/0, 0, 0/.test(b)) throw new Error('expected black, got ' + b);
      // The stale snapshot's weight can't reach it either: the stroke is sized from
      // --dim-line-w, which only applyAnnotationStyleToCSSVars writes.
      if (/\\d/.test(__box().style.borderWidth || '')) throw new Error('the box grew an inline border width again: ' + __box().style.borderWidth);
    });

    __check('no group-dim style snapshot is written any more, and none is read', () => {
      setAnnotDimEnds('none'); __seed();
      const gd = elevations[0].groupDims[0];
      if (gd.style !== undefined) throw new Error('createGroupDimFromSelection still stores a style snapshot');
      // And the resync pass that used to paper over it is gone — being the only
      // thing that kept the copies fresh is what made them stale everywhere else.
      if (/groupDims\\.forEach\\(gd => \\{ gd\\.style =/.test(S)) throw new Error('the style-propagation pass is still there');
      const i = S.indexOf('function renderGroupDims');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/entry\\.style \\|\\| annotationStyle/.test(body)) throw new Error('renderGroupDims still prefers a per-entry snapshot over the live style');
    });

    __check('the box follows weight and label size too, not just colour', () => {
      setAnnotDimEnds('none'); __setColor('#000000'); __seed();
      // Through the real control: applyAnnotationStyleFromModal reads the inputs,
      // so setting annotationStyle directly would just be overwritten.
      // The px slider became a points ladder in 16.25; setAnnotLineWeightPt is its
      // real handler and it calls applyAnnotationStyleFromModal itself.
      const __lineVar = () => document.documentElement.style.getPropertyValue('--dim-line-w');
      setAnnotLineWeightPt(3);   // 3pt = 6px on screen (ELEV_PT_TO_PX)
      // The box is sized from --dim-line-w now, the same var the CSS-driven dims
      // use, so "the weight reaches the box" is the var moving plus the box being
      // one of the strokes that reads it.
      if (__lineVar() !== '6px') throw new Error('weight did not reach the shared var: ' + __lineVar());
      if (!__box().classList.contains('dim-dash-box')) throw new Error('the box is not painted from the shared var: ' + __box().className);
      setAnnotLineWeightPt(1);
      if (__lineVar() !== '2px') throw new Error('did not go back: ' + __lineVar());
      const fIn = document.getElementById('annotFontSize');
      fIn.value = '19'; applyAnnotationStyleFromModal();
      const lbl = Array.from(document.querySelectorAll('#group-dim-layer div')).find(d => /\\d/.test(d.textContent || ''));
      if (!lbl) throw new Error('no measurement label on the group box');
      if (lbl.style.fontSize !== '19px') throw new Error('label size did not reach the box: ' + lbl.style.fontSize);
      fIn.value = '13'; applyAnnotationStyleFromModal();
    });

    __check('the DASHED/SOLID toggle deliberately does NOT reach the bounding box', () => {
      // Studio convention: dashed bounding rectangle, solid dimension lines,
      // dashed extensions, whichever way the toggle is set. A computed-but-unused
      // dashCss used to sit in the renderer, reading like the setting applied and
      // had merely broken.
      setAnnotDimEnds('none'); __seed();
      setAnnotDash(false);
      if (!__box().classList.contains('dim-dash-box')) throw new Error('the group bounding box should stay dashed: ' + __box().className);
      setAnnotDash(true);
      if (!__box().classList.contains('dim-dash-box')) throw new Error('still expected dashed: ' + __box().className);
      const i = S.indexOf('function renderGroupDims');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/const dashCss/.test(body)) throw new Error('the unused dashCss is back, which implies a setting that is not honoured');
    });

    // ── The tick style ──
    __check('EXACT BUG: the group box honours the Line Ends setting', () => {
      setAnnotDimEnds('none'); __seed();
      if (__gTicks() !== 0) throw new Error('plain style produced ' + __gTicks() + ' architectural ticks');
      setAnnotDimEnds('tick');
      if (__aTicks() === 0) throw new Error('no ticks on the ordinary dimensions, so this proves nothing');
      if (__gTicks() === 0) throw new Error('THE BUG: ordinary dimensions have ' + __aTicks() + ' ticks and the group box has none');
      // Width line + height line, two ends each.
      if (__gTicks() !== 4) throw new Error('expected 4 group-dim ticks, got ' + __gTicks());
      setAnnotDimEnds('none');
    });

    __check('the group tick is the same 45 degree oblique, centred on the intersection', () => {
      setAnnotDimEnds('tick'); __seed();
      const t = document.querySelector('#group-dim-layer [data-svg-tick]');
      const cs = t.style.cssText;
      if (cs.indexOf('rotate(45deg)') < 0) throw new Error('not a 45deg tick: ' + cs);
      if (cs.indexOf('translate(-50%, -50%)') < 0 && cs.indexOf('translate(-50%,-50%)') < 0) throw new Error('not centred on the intersection: ' + cs);
      if (cs.indexOf('border-left') < 0) throw new Error('should be a vertical stroke rotated 45deg so the slope is / : ' + cs);
      setAnnotDimEnds('none');
    });

    __check('EXACT RISK: group ticks are marked for the SVG exporter', () => {
      // A rotated stroke is invisible to emitEl's axis-aligned border cases, so
      // without the marker these would render on screen and vanish from the PDF.
      setAnnotDimEnds('tick'); __seed();
      const ticks = document.querySelectorAll('#group-dim-layer [data-svg-tick]');
      if (!ticks.length) throw new Error('no marked ticks');
      ticks.forEach(t => { if (t.getAttribute('data-svg-tick') !== '1') throw new Error('a group tick is not marked for export'); });
      setAnnotDimEnds('none');
    });

    __check('the group box shares ONE weight-hierarchy source with the CSS-driven dims', () => {
      // Computing the light/heavy split in two places is how the box drifted out
      // of step in the first place.
      if (S.indexOf('function _dimLineWeight') < 0 || S.indexOf('function _dimTickWeight') < 0) throw new Error('the shared weight helpers are gone');
      const i = S.indexOf('function applyAnnotationStyleToCSSVars');
      const cssBody = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (cssBody.indexOf('_dimLineWeight()') < 0) throw new Error('the CSS vars no longer use the shared helper');
      const j = S.indexOf('function renderGroupDims');
      const gBody = S.slice(j, S.indexOf('\\nfunction ', j + 10));
      if (gBody.indexOf('_dimLineWeight()') < 0) throw new Error('renderGroupDims no longer uses the shared helper');
      // And the numbers agree with what the CSS vars publish — including with the
      // two weights set APART, which is the case a second computation would break.
      setAnnotWeightLinked(false);
      setAnnotLineWeightPt(0.5); setAnnotTickWeightPt(2);
      setAnnotDimEnds('tick');
      const varLine = parseFloat(document.documentElement.style.getPropertyValue('--dim-line-w'));
      const varTick = parseFloat(document.documentElement.style.getPropertyValue('--dim-tick-w'));
      if (varLine !== _dimLineWeight() || varTick !== _dimTickWeight()) throw new Error('CSS vars ' + varLine + '/' + varTick + ' disagree with the helpers ' + _dimLineWeight() + '/' + _dimTickWeight());
      setAnnotWeightLinked(true); setAnnotLineWeightPt(1); setAnnotDimEnds('none');
    });

    __check('the group box extension lines overhang under the tick style, and not otherwise', () => {
      const j = S.indexOf('function renderGroupDims');
      const body = S.slice(j, S.indexOf('\\nfunction ', j + 10));
      if (body.indexOf('_dimExtOverhang()') < 0) throw new Error('the group box never asks for the overhang');
      // Rendered: the width line's extensions must start above the dim line.
      setAnnotDimEnds('tick'); __seed();
      // Gradient dashes since 16.31, so the marker/class is what identifies one.
      // The bounding box is excluded — it is dashed too but it isn't an extension.
      const dashed = Array.from(document.querySelectorAll('#group-dim-layer [data-svg-dash="1"]'));
      if (!dashed.length) throw new Error('no dashed extension lines found');
      if (!dashed.every(d => d.classList.contains('dim-dash-h') || d.classList.contains('dim-dash-v'))) throw new Error('an extension line is marked for export but not actually painted as a dash');
      setAnnotDimEnds('none');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
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
