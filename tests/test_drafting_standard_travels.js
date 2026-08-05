// Three additions that make an elevation set reproducible rather than dependent on
// whoever's machine opened it — the other half of "the elevations need to look more
// consistent" on the Ford catalog.
//
// 1. THE DRAFTING STANDARD TRAVELS. annotationStyle (dimension ink, weights, dash
//    rhythm, font, line ends) and elevDualUnit live in localStorage — per-machine
//    drafting preferences, deliberately not project data so a metric project can be
//    drawn in cm without dragging the spec pages with it. Right for one person's own
//    work; wrong the moment a file is handed over, because the same project then drew
//    its elevations in a different colour, weight and unit. Now written into the
//    project file and read back, but OPTIONAL: absent means the file predates the idea
//    and the machine's own preference is correct, so loading an old project must not
//    wipe settings the user chose.
//
// 2. EQ MODE. The drafting convention for "equally spaced", used heavily in the
//    catalog (ART-2/3/4/5/8, ART-9 SHORT). Explicit, not an automatic equal-gap test.
//    Routed through ONE helper so it can't reach some spacing dims and not others.
//
// 3. NEW ELEVATION FOR THIS GRAPHIC. A wallcovering is 1:1 with a wall, so "put this
//    somewhere" is usually "give it its own wall". Offered in Push to Wall and NOT
//    fired from the product dropdown — see the check for why that would misfire.
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

    // ── 1. The drafting standard ────────────────────────────────────────────
    __check('the saved project carries annotationStyle and elevDualUnit', () => {
      const i = S.indexOf("const masterData = { type: 'master-studio-v6'");
      if (i < 0) throw new Error('the project writer changed shape');
      const decl = S.slice(i, i + 1400);
      if (decl.indexOf('annotationStyle:') < 0) throw new Error('annotationStyle is not written, so the drafting look cannot travel');
      if (decl.indexOf('elevDualUnit:') < 0) throw new Error('elevDualUnit is not written');
      // _cloneData, not a reference: annotationStyle keeps mutating after this.
      if (decl.indexOf('_cloneData(annotationStyle)') < 0) throw new Error('annotationStyle is written by reference');
    });

    __check('EXACT RISK: loading a file WITHOUT them leaves local settings alone', () => {
      // Every project saved before this existed has neither key. Wiping the user's
      // chosen dimension colour on opening an old job would be a bad trade.
      annotationStyle.color = '#123456';
      annotationStyle.fontSize = 21;
      elevDualUnit = 'mm';
      const before = { c: annotationStyle.color, f: annotationStyle.fontSize, d: elevDualUnit };
      _migrateLoadedProject({ type: 'master-studio-v6', elevations: [] });
      // The loader's guards are what matter; assert the conditions it uses.
      const i = S.indexOf('if (data.annotationStyle && typeof data.annotationStyle === ');
      if (i < 0) throw new Error('the loader does not guard on the key being present');
      const j = S.indexOf("if (typeof data.elevDualUnit === 'string')");
      if (j < 0) throw new Error('elevDualUnit is not guarded on being present');
      if (annotationStyle.color !== before.c || elevDualUnit !== before.d) throw new Error('a migration pass mutated the local style');
    });

    __check('and when they ARE present it merges rather than replaces', () => {
      const i = S.indexOf('if (data.annotationStyle && typeof data.annotationStyle === ');
      const body = S.slice(i, i + 1200);
      // Every renderer holds a live reference to annotationStyle, and a file missing a
      // field it has since gained would leave that field undefined rather than default.
      if (body.indexOf('Object.assign(annotationStyle, data.annotationStyle)') < 0) {
        throw new Error('it replaces the object, so live references go stale and missing fields become undefined');
      }
      // The derived CSS stacks and the legacy px weight must be re-derived, never
      // trusted from the file — annotationStyle.fontFamily is derived, not stored.
      if (body.indexOf('_normalizeAnnotationStyle()') < 0) throw new Error('the derived font stacks are not re-normalized');
      if (body.indexOf('applyAnnotationStyleToCSSVars()') < 0) throw new Error('the CSS vars are not refreshed, so the DOM keeps the old weights');
      if (body.indexOf('saveAnnotationStyle()') < 0) throw new Error('the loaded standard is not persisted, so it is lost on reload');
    });

    __check('a loaded elevDualUnit is validated, not trusted', () => {
      const i = S.indexOf("if (typeof data.elevDualUnit === 'string')");
      const body = S.slice(i, i + 500);
      if (body.indexOf("=== 'mm' || data.elevDualUnit === 'cm'") < 0) throw new Error('any string would be accepted as a unit');
      if (body.indexOf('_elevDualLast') < 0) throw new Error('the remembered unit is not updated, so unticking and reticking loses the choice');
    });

    __check('and the round trip actually preserves a standard', () => {
      // Write, then read back into a deliberately different local state.
      annotationStyle.color = '#e00000'; annotationStyle.fontSize = 13;
      annotationStyle.dimEnds = 'tick'; annotationStyle.lineWeightPt = 0.5;
      elevDualUnit = 'mm';
      const payload = {
        type: 'master-studio-v6', dashUnit: 'in', elevUnit: 'in',
        annotationStyle: _cloneData(annotationStyle), elevDualUnit: elevDualUnit
      };
      const wire = JSON.parse(JSON.stringify(payload));
      // Now the "other machine".
      annotationStyle.color = '#00ff00'; annotationStyle.fontSize = 30;
      annotationStyle.dimEnds = 'none'; annotationStyle.lineWeightPt = 3;
      elevDualUnit = '';
      Object.assign(annotationStyle, wire.annotationStyle);
      _normalizeAnnotationStyle();
      elevDualUnit = (wire.elevDualUnit === 'mm' || wire.elevDualUnit === 'cm') ? wire.elevDualUnit : '';
      if (annotationStyle.color !== '#e00000') throw new Error('colour did not survive: ' + annotationStyle.color);
      if (annotationStyle.fontSize !== 13) throw new Error('label size did not survive: ' + annotationStyle.fontSize);
      if (annotationStyle.dimEnds !== 'tick') throw new Error('line ends did not survive: ' + annotationStyle.dimEnds);
      if (annotationStyle.lineWeightPt !== 0.5) throw new Error('line weight did not survive: ' + annotationStyle.lineWeightPt);
      if (elevDualUnit !== 'mm') throw new Error('dual unit did not survive: ' + elevDualUnit);
      // The derived stack must be rebuilt, not left from the other machine.
      if (!annotationStyle.fontFamily) throw new Error('the derived CSS stack was not re-derived');
    });

    // ── 2. EQ mode ──────────────────────────────────────────────────────────
    __check('EXACT ASK: EQ replaces the measurement on spacing and edge-gap dims', () => {
      elevUnit = 'in';
      dimVisibility.spacingEQ = false;
      const num = _spacingLabel(26);
      if (num === 'EQ') throw new Error('EQ is on by default — an existing deck would change meaning on upgrade');
      if (!/26/.test(num)) throw new Error('the normal label lost its number: ' + num);
      dimVisibility.spacingEQ = true;
      if (_spacingLabel(26) !== 'EQ') throw new Error('EQ mode does not produce EQ, got ' + _spacingLabel(26));
      if (_spacingLabel(0) !== 'EQ') throw new Error('a zero gap should still read EQ in EQ mode');
      dimVisibility.spacingEQ = false;
    });

    __check('ALL SIX spacing / edge-gap labels go through the one helper', () => {
      // Three gaps reading EQ, EQ and 26" is worse than any consistent choice, so no
      // call site may format its own label.
      const n = (S.match(/_spacingLabel\\(/g) || []).length;
      if (n < 7) throw new Error('only ' + n + ' references — 1 definition + 6 call sites expected');
      // The two renderers that draw them must not call elevFmtU directly any more.
      ['function drawElevTargetedSpacing', 'function drawPerFrameDistanceDims'].forEach(sig => {
        const i = S.indexOf(sig);
        if (i < 0) throw new Error('cannot find ' + sig);
        const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
        const calls = (body.match(/createElevArchSpacing\\(/g) || []).length;
        const eqs = (body.match(/_spacingLabel\\(/g) || []).length;
        if (calls !== eqs) throw new Error(sig + ' has ' + calls + ' dims but only ' + eqs + ' go through the helper');
      });
    });

    __check('EQ is deck-wide, persisted, and invalidates the cached captures', () => {
      if (typeof toggleSpacingEQ !== 'function') throw new Error('no toggleSpacingEQ');
      if (!('spacingEQ' in dimVisibility)) throw new Error('spacingEQ is not part of dimVisibility');
      const i = S.indexOf('function toggleSpacingEQ');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      // saveDimVisibility is what calls _elevGuidesChanged, which is what makes
      // install-guide and breaker pages re-capture instead of keeping a stale drawing.
      if (body.indexOf('saveDimVisibility()') < 0) throw new Error('the toggle does not persist or invalidate the captures');
      if (body.indexOf('drawElevAll()') < 0) throw new Error('the wall is not redrawn');
      const sv = S.indexOf('function saveDimVisibility');
      if (S.slice(sv, sv + 500).indexOf('_elevGuidesChanged()') < 0) throw new Error('saveDimVisibility stopped invalidating the captures');
      // Wired in the UI, with state shown.
      if (H.indexOf('toggleSpacingEQ(this)') < 0) throw new Error('the EQ button is not in index.html');
      const sy = S.indexOf('function syncLayoutGuideButtonStates');
      if (S.slice(sy, S.indexOf('\\nfunction ', sy + 10)).indexOf('spacingEQToggle') < 0) throw new Error('the button never shows its state');
    });

    // ── 3. New elevation for this graphic ───────────────────────────────────
    __check('EXACT ASK: Push to Wall offers a new elevation, for flat graphics only', () => {
      dashUnit = 'in'; elevUnit = 'in';
      const mk = (over) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), over);
      const opts = () => Array.from(document.querySelectorAll('#dashPushSelector option')).map(o => o.value);
      elevations = [{ name: 'W1', wallW: 185, wallH: 108, frames: [], personPos: { x: -60 } }];
      dashProjectData = [mk({ id: 'ART.001' })];
      dashSelectedRowIndex = 0;
      populateDashPushSelector();
      if (opts().indexOf('__new__') >= 0) throw new Error('a framed piece was offered its own wall');
      dashProjectData = [mk({ id: 'EGD-1', product: 'Wallcovering (EGD)', extW: 185, extH: 104 })];
      populateDashPushSelector();
      if (opts().indexOf('__new__') < 0) throw new Error('a wallcovering was NOT offered its own wall');
    });

    __check('creating it sizes the wall for the graphic AND allows for the baseboard', () => {
      dashUnit = 'in'; elevUnit = 'in'; elevBaseboardIn = 4;
      const mk = (over) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), over);
      elevations = [{ name: 'W1', wallW: 185, wallH: 108, frames: [], personPos: { x: -60 } }];
      currentElevIndex = 0;
      dashProjectData = [mk({ id: 'EGD-1', location: 'CELEBRATION', product: 'Wallcovering (EGD)', extW: 192, extH: 120 })];
      dashSelectedRowIndex = 0;
      populateDashPushSelector();
      const sel = document.getElementById('dashPushSelector');
      sel.value = '__new__';
      const origAlert = window.alert; window.alert = () => {};
      try { pushFrameToElevation(); } finally { window.alert = origAlert; }
      if (elevations.length !== 2) throw new Error('no elevation was created (' + elevations.length + ')');
      const e = elevations[1];
      if (e.name !== 'CELEBRATION') throw new Error('the wall is not named after the piece: ' + e.name);
      if (!e.egdWall) throw new Error('the new wall is not in EGD mode, so the graphic would not be pinned');
      if (e.wallW !== 192) throw new Error('wall width should match the graphic: ' + e.wallW);
      // The graphic sits ABOVE the baseboard, so a wall exactly its height leaves
      // nowhere for it and fit-to-wall would then shrink the graphic to suit — the
      // wall driving the piece instead of the other way round.
      if (e.wallH !== 124) throw new Error('wall height should be graphic + baseboard = 124, got ' + e.wallH);
      // And the graphic is on it, filling it.
      const fr = (e.frames || [])[0];
      if (!fr) throw new Error('the graphic was not pushed onto the new wall');
      if (fr.w !== 192 || fr.h !== 120) throw new Error('the graphic does not fill the wall: ' + fr.w + 'x' + fr.h);
      if (fr.x !== 0 || fr.y !== 4) throw new Error('the graphic is not seated on the baseboard: ' + fr.x + ',' + fr.y);
      if (!Array.isArray(fr.dimTo)) throw new Error('dimTo is missing — initElevControls dereferences it unguarded');
    });

    __check('EXACT RISK: it is NOT fired from the product dropdown', () => {
      // loadDashDataIntoControls calls handleDashProductChange on every row SELECTION.
      // Auto-creating there would spawn one wall per flat row every time you clicked
      // through a loaded project, leave an orphan whenever you switched product and
      // back, and drift the quantities, since recalculateDashboardQuantities derives
      // qty from elevation frame counts.
      const i = S.indexOf('function handleDashProductChange');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/elevations\\.push\\(/.test(body)) throw new Error('THE RISK: the product dropdown creates elevations');
      // It DOES refresh the selector, which is how the option appears on row selection —
      // and it must sit above the early returns, since the canvas and flat branches
      // both return before the end.
      if (body.indexOf('populateDashPushSelector()') < 0) throw new Error('the option would never appear when you select a flat row');
      const at = body.indexOf('populateDashPushSelector()');
      const firstReturn = body.indexOf('return;');
      if (firstReturn >= 0 && at > firstReturn) throw new Error('the refresh sits after an early return, so some products never get it');
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
