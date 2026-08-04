// REPORTED BUG: "up close they look ok, but from a distance it almost looks like
// they join. The dashed lines almost look like solid lines. Maybe I need a setting
// to control the spacing of the dashed lines." Seen in Illustrator and in the
// generated PDF alike.
//
// CAUSE: the dash rhythm was DERIVED FROM THE STROKE WIDTH — 3x the width on, 2x
// off. At the reported 0.5pt line that is a 1.5pt dash with a 1pt gap, which closes
// up to a solid line at any distance. It also meant the rhythm moved every time a
// pen weight moved, and that no setting could exist: on screen these were CSS
// `border-style: dashed`, whose rhythm the BROWSER picks with no property to ask
// for a different one.
//
// FIX: the dash is a setting in POINTS, absolute, exactly like the pen weights; and
// dashed strokes are painted with a repeating gradient instead of a dashed border,
// so the setting reaches the screen, the SVG and the PDF from one place.
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
    const S = window.__appSrc, C = window.__appCss;
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};
    const __var = (n) => document.documentElement.style.getPropertyValue(n);

    // ── The setting exists and is absolute ──
    __check('EXACT REQUEST: there is a dash spacing setting, in points', () => {
      if (typeof ELEV_DASH_PT === 'undefined' || !ELEV_DASH_PT.length) throw new Error('no dash ladder');
      if (typeof _dimDashPx !== 'function') throw new Error('no single source for the rhythm');
      if (typeof setAnnotDashPt !== 'function') throw new Error('no handler, so the control cannot be wired');
      if (!document.getElementById('annotDashSpacing')) throw new Error('the Settings panel has no Dash spacing strip');
      _seedAnnotWeightControls();
      const strip = document.getElementById('annotDashSpacing');
      if (strip.children.length !== ELEV_DASH_PT.length) throw new Error('the strip has ' + strip.children.length + ' segments for ' + ELEV_DASH_PT.length + ' values — it is not built from the ladder');
      if (!strip.querySelector('button.active')) throw new Error('nothing is marked as the current pick');
    });

    __check('EXACT BUG: the rhythm no longer depends on the stroke width', () => {
      // The reported setup: 0.5pt lines. The dash must be the same at any pen.
      setAnnotDashPt(3);
      setAnnotLineWeightPt(0.5);
      const light = _dimDashPx();
      setAnnotLineWeightPt(3);
      const heavy = _dimDashPx();
      if (light.len !== heavy.len || light.gap !== heavy.gap) throw new Error('THE BUG: the dash still moves with the pen weight (' + light.len + '/' + light.gap + ' vs ' + heavy.len + '/' + heavy.gap + ')');
      setAnnotLineWeightPt(1);
    });

    __check('EXACT BUG: the default rhythm is no longer fine enough to read as solid', () => {
      // The old derived pattern at 0.5pt: 3x1px on, 2x1px off = 1.5pt dash, 1pt gap.
      setAnnotDashPt(_normalizeAnnotationStyle() || 3);
      annotationStyle.dashPt = 3; _normalizeAnnotationStyle();
      const d = _dimDashPx();
      const oldLen = 0.5 * ELEV_PT_TO_PX * 3;   // what the old formula gave at 0.5pt
      if (!(d.len > oldLen)) throw new Error('the default dash (' + d.len + 'px) is no longer than the pattern that read as solid (' + oldLen + 'px)');
      // And a visible gap, not a hairline join.
      if (!(d.gap >= 2)) throw new Error('the default gap is ' + d.gap + 'px, still tight enough to close up');
    });

    __check('turning the dial scales the whole rhythm, and the ratio holds', () => {
      const seen = [];
      ELEV_DASH_PT.forEach(pt => {
        setAnnotDashPt(pt);
        const d = _dimDashPx();
        if (Math.abs(d.len - pt * ELEV_PT_TO_PX) > 1e-9) throw new Error(pt + 'pt gave a ' + d.len + 'px dash');
        if (Math.abs(d.gap / d.len - ELEV_DASH_GAP_RATIO) > 1e-9) throw new Error('the gap ratio drifted at ' + pt + 'pt');
        seen.push(d.len);
      });
      for (let i = 1; i < seen.length; i++) if (!(seen[i] > seen[i-1])) throw new Error('the ladder is not monotonic: ' + seen.join(','));
      setAnnotDashPt(3);
    });

    __check('an unknown or missing value snaps to the ladder rather than drawing something arbitrary', () => {
      [null, undefined, 0, -4, 'abc', 999].forEach(v => {
        annotationStyle.dashPt = v; _normalizeAnnotationStyle();
        if (ELEV_DASH_PT.indexOf(annotationStyle.dashPt) < 0) throw new Error(JSON.stringify(v) + ' normalised to ' + annotationStyle.dashPt);
      });
      // A project saved before the setting existed lands on the default, not on the
      // old derived pattern — that pattern is the bug.
      delete annotationStyle.dashPt; _normalizeAnnotationStyle();
      if (annotationStyle.dashPt !== 3) throw new Error('an older style did not pick up the default: ' + annotationStyle.dashPt);
    });

    // ── It reaches the screen ──
    __check('EXACT BLOCKER: dashed strokes are gradients, not CSS dashed borders', () => {
      // A CSS dashed border draws at the browser's own rhythm and there is no
      // property to ask for another, so the setting could not exist while these
      // were borders. This is the change that makes the control possible at all.
      if (!/\\.dim-dash-h\\b/.test(C) || !/\\.dim-dash-v\\b/.test(C)) throw new Error('no dashed-stroke classes in style.css');
      if (!/repeating-linear-gradient/.test(C)) throw new Error('the dashes are not painted as gradients, so no setting can change their rhythm');
      if (!/--dim-dash-len/.test(C) || !/--dim-dash-period/.test(C)) throw new Error('the gradient does not read the rhythm vars');
      // The old borders must be gone from the strokes that the report was about.
      const gone = /\\.hang-guide\\s*\\{[^}]*dashed/.test(C) || /\\.center-guide\\s*\\{[^}]*dashed/.test(C);
      if (gone) throw new Error('the hang / centre guides still use a CSS dashed border, so they ignore the setting');
    });

    __check('the rhythm is published as CSS vars whenever the style is applied', () => {
      setAnnotDashPt(4);
      const d = _dimDashPx();
      if (__var('--dim-dash-len') !== d.len + 'px') throw new Error('--dim-dash-len is ' + __var('--dim-dash-len'));
      if (__var('--dim-dash-gap') !== d.gap + 'px') throw new Error('--dim-dash-gap is ' + __var('--dim-dash-gap'));
      // The gradient wants the cycle end, not the gap length — getting this wrong
      // makes every dash overlap its own gap.
      if (__var('--dim-dash-period') !== (d.len + d.gap) + 'px') throw new Error('--dim-dash-period is ' + __var('--dim-dash-period') + ', expected len+gap');
      setAnnotDashPt(3);
    });

    __check('every dashed stroke on the drawing goes through the shared helper', () => {
      if (typeof _mkDashLine !== 'function' || typeof _dashLineHTML !== 'function') throw new Error('the shared dashed-line builders are missing');
      // No dimension stroke may still be built as a CSS dashed border: one that is
      // keeps the browser rhythm and reads differently from the ones beside it,
      // which is the second half of the report.
      const strays = (S.match(/dashed var\\(--dim-color\\)/g) || []).length;
      if (strays) throw new Error(strays + ' dashed annotation stroke(s) still use a CSS dashed border and will ignore the setting');
      const d = _mkDashLine('v', 'height:20px;', 'dim-leader');
      if (!d.classList.contains('dim-dash-v')) throw new Error('the helper does not paint a dash');
      if (!d.classList.contains('dim-leader')) throw new Error('the helper dropped the caller\\'s class');
      if (d.getAttribute('data-svg-dash') !== '1' || d.getAttribute('data-svg-pen') !== 'line') throw new Error('the helper does not mark the stroke for export');
      // A vertical line must not carry an inline width: the class supplies the
      // thickness and inline would win, so the line would be the wrong weight.
      if (/width/.test(d.style.cssText)) throw new Error('the helper wrote a width onto a vertical line');
    });

    // ── It reaches the exports ──
    __check('EXACT BUG: the SVG dash run is the setting, not a multiple of the stroke', () => {
      const i = S.indexOf('const dashFor =');
      const line = S.slice(i, S.indexOf(';', S.indexOf('_dimDashArray', i)) + 1);
      if (/w\\s*\\*\\s*3/.test(line) || /width\\s*\\*\\s*3/.test(line)) throw new Error('THE BUG: the dash run is still derived from the stroke width');
      if (line.indexOf('_dimDashArray()') < 0) throw new Error('the dash run does not come from the setting');
      setAnnotDashPt(4);
      const d = _dimDashPx();
      if (_dimDashArray() !== d.len.toFixed(3) + ',' + d.gap.toFixed(3)) throw new Error('the dasharray disagrees with the rhythm: ' + _dimDashArray());
      setAnnotDashPt(3);
    });

    __check('gradient dashes have their own export case, or they vanish from the file', () => {
      // They carry neither a border nor a background COLOUR, so every other case in
      // emitEl skips them. Missing this case means an SVG with no extension lines.
      const i = S.indexOf('const dashKind = el.getAttribute');
      if (i < 0) throw new Error('emitEl has no case for a gradient-painted dash');
      const body = S.slice(i, i + 2200);
      if (body.indexOf('cs.color') < 0) throw new Error('the stroke colour is guessed rather than read from what the gradient paints with');
      if (body.indexOf("dashKind === 'box'") < 0) throw new Error('the group bounding box has no case, so it exports as nothing');
      if (body.indexOf('_dimDashArray()') < 0) throw new Error('the exported dash does not use the setting');
      // It must run BEFORE the border/background cases, which would mis-handle it.
      const border = S.indexOf('const bTop = _parseBorder(cs.borderTop)');
      if (!(i < border)) throw new Error('the dash case runs after the border cases');
    });

    __check('the dash rhythm is part of the capture signature, so pages re-render on a change', () => {
      // annotationStyle is hashed whole into the elevation capture key, so a dash
      // change must invalidate the cached breaker/install captures like any other
      // style change. If it did not, the setting would appear to do nothing there.
      const k = S.indexOf('function _igGuideStamp');
      const body = S.slice(k, S.indexOf('function _igCapKey', k));
      if (body.indexOf('annotationStyle') < 0) throw new Error('the capture key ignores the annotation style, so a dash change would not reach the deck pages');
      setAnnotDashPt(2);
      const a = _igGuideStamp();
      setAnnotDashPt(6);
      if (_igGuideStamp() === a) throw new Error('changing the dash spacing does not move the capture key — every cached elevation would keep the old rhythm');
      setAnnotDashPt(3);
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\nwindow.__appCss = ' + JSON.stringify(cssSrc) + ';\n' + src + '\n' + testBlock);
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
