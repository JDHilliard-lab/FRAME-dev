// Glazing panels for window film. Asked for: "we sometimes fit graphics into the
// window panels to avoid certain elements in the graphic from landing on seams. I
// might need a window panel option for WF and sometimes window panels are different
// sizes but sometimes they are the same."
//
// And on output: "sometimes for WF we send the full file, and when we want more control
// we split the panels in Illustrator on different artboards. Each artboard is set to
// have image bleed too. So most of the time we have artboards overlapping each other so
// they print overlap per panels and the installers cut the excess and align the graphic
// to the next panel seamlessly."
//
// The design that follows from that:
//  • Widths are an ARRAY, not {count, equal}. Unequal is the general case and equal is
//    only a shortcut, so a count-based model has to be rebuilt the moment one panel
//    differs. "Make equal" fills the array instead.
//  • An ARRAY of runs per elevation — one wall can carry a full-height WF-1 on one
//    window and a WF-4 privacy band on another. Cheap now, a migration later.
//  • The overlap is NOT a new rule. An artboard is panel + bleed on every edge, which
//    is exactly what _rowOpeningAndPrint already does for a whole graphic, so adjacent
//    artboards overlap by 2x bleed and a 2" bleed means the same thing everywhere.
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
    const S = window.__appSrc, H = window.__indexHtml;
    scheduleAutosave = () => {};

    const seed = (glazing) => {
      elevUnit = 'in'; dashUnit = 'in';
      elevations = [{ name: 'Glass', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 },
        glazing: glazing || [] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      elevZoomFactor = 1;
      const wwEl = document.getElementById('wallW'), whEl = document.getElementById('wallH');
      if (wwEl) wwEl.value = '240'; if (whEl) whEl.value = '108';
      const ws = document.querySelector('#view-elevation .workspace');
      if (ws) { Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
                Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true }); }
      return elevations[0];
    };

    // ── The model ───────────────────────────────────────────────────────────
    __check('panel widths are an ARRAY, so unequal panels are the general case', () => {
      const run = { x: 12, y: 30, h: 60, panels: [48, 48, 36, 48] };
      if (_glazingRunWidth(run) !== 180) throw new Error('run width should be the sum of the panels, got ' + _glazingRunWidth(run));
      // Equal is just an array that happens to be uniform — no separate mode.
      if (_glazingRunWidth({ panels: [45, 45, 45, 45] }) !== 180) throw new Error('equal panels should total the same');
      // Junk in, zero out rather than NaN spreading into the geometry.
      if (_glazingRunWidth(null) !== 0) throw new Error('null run should measure 0');
      if (_glazingRunWidth({ panels: [48, 'x', null, 12] }) !== 60) throw new Error('non-numeric panels should count as 0');
    });

    __check('seams are the INTERNAL mullions only, in wall coordinates', () => {
      const run = { x: 12, y: 30, h: 60, panels: [48, 48, 36, 48] };
      const s = _glazingSeams(run);
      // Cumulative from the run's own x, and 4 panels give 3 seams.
      if (s.join(',') !== '60,108,144') throw new Error('seams read ' + s.join(','));
      if (s.length !== run.panels.length - 1) throw new Error('a 4-panel run should have 3 seams, got ' + s.length);
      // The outer edges must NOT be seams: they duplicate the wall/frame snap targets,
      // and two identical candidates make the nearest-target search pick arbitrarily.
      if (s.indexOf(12) >= 0) throw new Error('the run start leaked in as a seam');
      if (s.indexOf(192) >= 0) throw new Error('the run end leaked in as a seam');
      if (_glazingSeams({ panels: [100] }).length !== 0) throw new Error('a single panel has no seams');
      if (_glazingSeams(null).length !== 0) throw new Error('a null run should have no seams');
    });

    __check('an elevation with no glazing is not broken by asking', () => {
      const e = seed();
      if (_elevGlazing(e).length !== 0) throw new Error('a fresh elevation should have no runs');
      // Lazily created like groupDims / customLines, so an older project loads clean.
      if (!Array.isArray(e.glazing)) throw new Error('the array was not created on demand');
      if (_elevGlazing(null).length !== 0) throw new Error('null elevation blew up');
    });

    // ── The overlap / print sizes ───────────────────────────────────────────
    __check('EXACT ASK: each artboard is panel + bleed, so neighbours overlap by 2x bleed', () => {
      const run = { x: 0, y: 0, h: 108, panels: [48, 48, 36] };
      const p = _glazingPanelPrints(run, 2, 108);
      if (p.length !== 3) throw new Error('expected one artboard per panel, got ' + p.length);
      // Finished width is what goes on the glass; print width is the artboard.
      if (p[0].finishedW !== 48 || p[0].printW !== 52) throw new Error('panel 1 reads ' + p[0].finishedW + '/' + p[0].printW);
      if (p[2].finishedW !== 36 || p[2].printW !== 40) throw new Error('panel 3 reads ' + p[2].finishedW + '/' + p[2].printW);
      if (p[0].printH !== 112) throw new Error('artboard height should be graphic + bleed*2 = 112, got ' + p[0].printH);
      // The lap the installer trims: bleed on every SHARED edge, none at the two ends
      // of the run where there is nothing to lap onto.
      if (p[0].overlapLeft !== 0) throw new Error('the first panel should not lap off the end of the glass');
      if (p[2].overlapRight !== 0) throw new Error('the last panel should not lap off the end of the glass');
      if (p[1].overlapLeft !== 2 || p[1].overlapRight !== 2) throw new Error('a middle panel should lap both ways');
      // Total overlap across a seam is both neighbours' bleed.
      if (p[0].overlapRight + p[1].overlapLeft !== 4) throw new Error('a seam should carry 2x bleed of overlap');
    });

    __check('and the bleed is the SAME rule the whole graphic uses, not a second one', () => {
      // A 2" bleed has to mean 2" everywhere, or a panel set and the full file disagree.
      dashUnit = 'in';
      const row = Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), {
        product: 'Window Film (WF)', extW: 132, extH: 108, bleed: 2
      });
      const whole = _rowOpeningAndPrint(row);
      if (whole.printW !== 136) throw new Error('the full file should be 132 + 2*2 = 136, got ' + whole.printW);
      // One panel spanning the whole graphic must give the identical artboard.
      const one = _glazingPanelPrints({ panels: [132] }, 2, 108)[0];
      if (one.printW !== whole.printW || one.printH !== whole.printH) {
        throw new Error('a single-panel run disagrees with the full file: ' + one.printW + 'x' + one.printH + ' vs ' + whole.printW + 'x' + whole.printH);
      }
    });

    // ── Drawing ─────────────────────────────────────────────────────────────
    __check('the glass and its mullions are drawn, one mullion per seam', () => {
      seed([{ x: 12, y: 24, h: 72, panels: [48, 48, 36] }]);
      drawElevAll();
      const layer = document.getElementById('glazing-layer');
      if (!layer) throw new Error('#glazing-layer is missing from index.html');
      if (!layer.querySelector('.glazing-run')) throw new Error('the glass outline was not drawn');
      const mull = layer.querySelectorAll('.glazing-mullion');
      if (mull.length !== 2) throw new Error('a 3-panel run should draw 2 mullions, got ' + mull.length);
      // Positioned from the run's own origin, not the wall's.
      const left = parseFloat(layer.querySelector('.glazing-run').style.left);
      if (!(left > 0)) throw new Error('the run ignores its x offset');
      // Every stroke must be weightable by the exporter from the pen setting rather
      // than a re-measured computed style (a sub-pixel width does not survive that).
      // TEXT is exempt and must stay exempt: 16.54 added the panel letter tags to this
      // layer, and emitEl routes an element with direct text down its text path, where
      // a pen weight means nothing. Written as "every stroke", not "every child", so
      // the rule keeps its teeth for the next line added here.
      Array.from(layer.children).forEach(el => {
        if ((el.textContent || '').trim()) return;   // a label, not a stroke
        if (!el.getAttribute('data-svg-pen')) throw new Error('a glazing stroke carries no data-svg-pen, so the SVG re-measures it');
      });
    });

    __check('a width dimension per panel, in the dim layer', () => {
      seed([{ x: 0, y: 0, h: 108, panels: [60, 60, 60, 60] }]);
      drawElevAll();
      const dims = document.querySelectorAll('#glazing-dim-layer .arch-dim');
      if (dims.length < 4) throw new Error('expected a dimension per panel, found ' + dims.length);
      // EQ mode still reaches them. 16.65 swapped _spacingLabel for
      // _glazingSpacingLabel, which is the same rule plus EXACT precision: a panel
      // width is a fabrication number, and elevFmt's whole-inch rounding printed 29"
      // on the drawing beside 28.86" in the print schedule for the same pane.
      // Pinned on BEHAVIOUR, since the point was never which function is called.
      const _eq = dimVisibility.spacingEQ;
      dimVisibility.spacingEQ = true;
      drawElevAll();
      const eqTexts = Array.from(document.querySelectorAll('#glazing-dim-layer .arch-dim-h'))
        .map(d => (d.textContent || '').trim());
      dimVisibility.spacingEQ = _eq;
      if (!eqTexts.length || eqTexts.slice(0, 4).some(t => t.indexOf('EQ') < 0)) {
        throw new Error('panel dims format their own label, so EQ mode skipped them: ' + eqTexts.join(' | '));
      }
      // And with EQ off the number must NOT be rounded to a whole inch.
      drawElevAll();
      if (_elevFmtExact(28.857) !== '28.857') throw new Error('the exact formatter is rounding');
      if (_elevFmtExact(29) !== '29') throw new Error('a whole panel should still read 29, not 29.000');
    });

    __check('nothing is drawn when there is no glazing, and it survives junk', () => {
      seed([]);
      drawElevAll();
      const layer = document.getElementById('glazing-layer');
      if (layer.children.length) throw new Error('an elevation with no glazing drew something');
      // A run with no panels, zero height, or garbage must be skipped rather than
      // producing a zero-size box or NaN geometry.
      seed([{ x: 0, y: 0, h: 0, panels: [48] }, { x: 0, y: 0, h: 60, panels: [] }, {}]);
      drawElevAll();
      if (document.getElementById('glazing-layer').children.length) throw new Error('a degenerate run was drawn anyway');
    });

    // ── Snapping ────────────────────────────────────────────────────────────
    __check('EXACT ASK: a graphic snaps to the seams so elements miss the mullions', () => {
      const e = seed([{ x: 0, y: 0, h: 108, panels: [60, 60, 60, 60] }]);
      // Seams at 60, 120, 180.
      e.frames.push({ id: 'WF1', letter: 'A', product: 'Window Film (WF)',
        w: 60, h: 108, x: 0, y: 0, active: true, dimTo: [], distToggles: {} });
      elevFrames = e.frames;
      elevScale = 1;                    // 1 unit == 1px, so the threshold is in units
      // Drop the left edge 2 units shy of the seam at 60 — inside SNAP_THRESHOLD_PX.
      const r = computeSnapForDrag(0, 58, 0);
      if (Math.abs(r.snappedX - 60) > 0.001) throw new Error('the graphic did not snap to the seam, x=' + r.snappedX);
      if (!r.guides.length) throw new Error('no snap guide was reported for the seam');
      // And the source must be the glazing, not a coincidental wall/frame target.
      // The targets live in _elevSnapTargets, which computeSnapForDrag and the
      // context-block drag now SHARE — a block that lines up with a frame on screen but
      // not in the model is worse than no snapping, so both pull from one pool.
      const i = S.indexOf('function _elevSnapTargets');
      const body = S.slice(i, i + 5200);
      if (body.indexOf('_glazingSeams(run)') < 0) throw new Error('seams are not in the snap target pool');
      if (body.indexOf("kind: 'glazing-seam'") < 0) throw new Error('seam targets are unlabelled, so a guide cannot say what it snapped to');
    });

    __check('the run edges, head and sill are snap targets too', () => {
      // The targets live in _elevSnapTargets, which computeSnapForDrag and the
      // context-block drag now SHARE — a block that lines up with a frame on screen but
      // not in the model is worse than no snapping, so both pull from one pool.
      const i = S.indexOf('function _elevSnapTargets');
      const body = S.slice(i, i + 5200);
      ["kind: 'glazing-left'", "kind: 'glazing-right'"].forEach(k => {
        if (body.indexOf(k) < 0) throw new Error('missing X target ' + k + ' — a film flush to the glass edge has nothing to snap to');
      });
      ["kind: 'glazing-sill'", "kind: 'glazing-head'"].forEach(k => {
        if (body.indexOf(k) < 0) throw new Error('missing Y target ' + k);
      });
    });

    // ── Units and export ────────────────────────────────────────────────────
    __check('EXACT RISK: glazing converts with the wall, panel array included', () => {
      // A run left in inches on a cm project draws mullions in the wrong PLACES, which
      // is worse than a wrong number: it silently moves where a graphic may be cut.
      // Panel widths are an array, so the hand-maintained field allowlists the frames
      // use would skip them entirely.
      const e = { glazing: [{ x: 10, y: 20, h: 60, panels: [30, 30] }] };
      _scaleElevGlazing(e, 2.54);
      const r = e.glazing[0];
      if (Math.abs(r.x - 25.4) > 0.001) throw new Error('x did not convert: ' + r.x);
      if (Math.abs(r.y - 50.8) > 0.001) throw new Error('y did not convert: ' + r.y);
      if (Math.abs(r.h - 152.4) > 0.001) throw new Error('h did not convert: ' + r.h);
      if (Math.abs(r.panels[0] - 76.2) > 0.001) throw new Error('panel widths did not convert: ' + r.panels.join(','));
      // Called from BOTH conversion sites — a project load with divergent units, and
      // the unit toggle.
      const lm = S.indexOf('function loadMasterProject');
      if (S.slice(lm, lm + 9000).indexOf('_scaleElevGlazing(elev, f)') < 0) throw new Error('project load does not convert glazing');
      const su = S.indexOf('function setUnit(');
      if (S.slice(su, su + 4000).indexOf('_scaleElevGlazing(elev, f)') < 0) throw new Error('the unit toggle does not convert glazing');
    });

    __check('the seams reach the PDF, and the editor shows them the same way round', () => {
      // emitEl only walks the ANNOTATION layers — a layer left off that list is on
      // screen and absent from every export, with no error.
      const i = S.indexOf('const annotationLayers = [');
      const list = S.slice(i, S.indexOf('];', i));
      if (list.indexOf("'glazing-layer'") < 0) throw new Error('#glazing-layer is not exported, so seams vanish from the PDF');
      // And the on-screen z-order must match: the export writes annotation layers OVER
      // the rasterised artwork, so glazing must sit above #frame-layer on screen too or
      // the editor and the PDF disagree about whether a seam crosses the graphic.
      const gz = /id="glazing-layer"[^>]*z-index:(\\d+)/.exec(H);
      const fz = /id="frame-layer"[^>]*z-index:(\\d+)/.exec(H);
      if (!gz || !fz) throw new Error('could not read the layer z-indexes');
      if (parseInt(gz[1], 10) <= parseInt(fz[1], 10)) {
        throw new Error('glazing (' + gz[1] + ') is not above frame-layer (' + fz[1] + '), so screen and PDF disagree');
      }
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n'
      + 'window.__indexHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
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
