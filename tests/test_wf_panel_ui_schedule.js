// Making the window-panel feature USABLE: the sidebar editor that creates and edits a
// glazing run, and the panel schedule that documents the Illustrator artboard set.
//
// The engine (elev.glazing, seams, per-panel print sizes, snapping) landed in 16.51 and
// is covered by test_wf_glazing_panels.js. It was unreachable — nothing wrote to the
// model. These are the checks for the two halves that close that gap.
//
// The model decisions being pinned here:
//  • A run's TOTAL width is DERIVED from its panels, never stored, so the two cannot
//    drift. "Width" is therefore an operation: it rescales proportionally, which keeps
//    an equal division equal. Panel count rescales for the same reason.
//  • Editing ONE panel width is the deliberate exception that changes the total — a
//    measured panel width is a fact and the glass is whatever the panels add up to.
//  • The schedule CLIPS to the graphic's span. A graphic over panels 2-3 of a 4-panel
//    run is two print files, not four; the other two would print blank.
//  • The lap is a property of a SHARED edge, so it comes from position in the emitted
//    list, not the panel's index in the run.
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
    scheduleAutosave = () => {}; pushHistory = () => {};
    // The editor commits through initElevControls + drawElevAll. Neither is under test
    // here and both want a laid-out wall, so they're stubbed to the one thing that
    // matters: that renderGlazingControls is what repaints the panel.
    let __drew = 0, __ctl = 0;
    drawElevAll = () => { __drew++; };
    initElevControls = () => { __ctl++; renderGlazingControls(); };

    const seed = (glazing) => {
      elevUnit = 'in'; dashUnit = 'in';
      elevations = [{ name: 'Glass', wallW: 240, wallH: 108, frames: [], personPos: { x: -60 },
        glazing: glazing || [] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      return elevations[0];
    };

    // ── The editor ──────────────────────────────────────────────────────────
    __check('addGlazingRun writes a real run to the model, sized off the wall', () => {
      const el = seed();
      addGlazingRun();
      if (el.glazing.length !== 1) throw new Error('expected 1 run, got ' + el.glazing.length);
      const run = el.glazing[0];
      // Defaults must be USABLE, not zero: a run with no width draws nothing, which
      // reads as "the button did nothing".
      if (!(run.h > 0)) throw new Error('default run has no height');
      if (_glazingRunWidth(run) !== 240) throw new Error('a default run should span the wall, got ' + _glazingRunWidth(run));
      if (run.panels.length !== GLAZING_DEFAULT_PANELS) throw new Error('expected ' + GLAZING_DEFAULT_PANELS + ' panels');
      // Equal by default, so the common case needs no further editing.
      if (new Set(run.panels).size !== 1) throw new Error('default panels should be equal, got ' + run.panels.join(','));
    });

    __check('run defaults are authored in inches and CONVERT, so a cm project is sane', () => {
      const el = seed(); elevUnit = 'cm'; dashUnit = 'cm';
      el.wallW = 610; el.wallH = 274;             // ~240 x 108 in cm
      addGlazingRun();
      const run = el.glazing[0];
      // The 30" sill must land near 76cm, not at 30 (which would be a 12" sill).
      if (run.y < 60 || run.y > 90) throw new Error('sill did not convert: ' + run.y);
      if (_glazingRunWidth(run) !== 610) throw new Error('run should still span the wall in cm, got ' + _glazingRunWidth(run));
      elevUnit = 'in'; dashUnit = 'in';
    });

    __check('the Width field RESCALES panels proportionally, so a ratio survives', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [30, 60, 30] }]);   // 1:2:1, total 120
      setGlazingRunField(0, 'w', 240);
      const p = el.glazing[0].panels;
      if (_glazingRunWidth(el.glazing[0]) !== 240) throw new Error('total should be 240, got ' + _glazingRunWidth(el.glazing[0]));
      if (p.join(',') !== '60,120,60') throw new Error('proportions were not preserved: ' + p.join(','));
    });

    __check('a zero-width run divides EQUALLY instead of staying at zero', () => {
      // No proportions to preserve, and returning zeros would leave the run
      // undrawable — which looks exactly like the edit failing.
      const el = seed([{ x: 0, y: 30, h: 60, panels: [0, 0, 0, 0] }]);
      setGlazingRunField(0, 'w', 200);
      if (el.glazing[0].panels.join(',') !== '50,50,50,50') throw new Error('got ' + el.glazing[0].panels.join(','));
    });

    __check('the panel COUNT holds the run total — it divides glass, it does not add glass', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [60, 60] }]);      // total 120
      setGlazingPanelCount(0, 4);
      if (_glazingRunWidth(el.glazing[0]) !== 120) throw new Error('total moved to ' + _glazingRunWidth(el.glazing[0]));
      if (el.glazing[0].panels.length !== 4) throw new Error('expected 4 panels');
      setGlazingPanelCount(0, 2);
      if (_glazingRunWidth(el.glazing[0]) !== 120) throw new Error('total moved on shrink: ' + _glazingRunWidth(el.glazing[0]));
    });

    __check('the panel count is clamped to 1..GLAZING_MAX_PANELS', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [120] }]);
      setGlazingPanelCount(0, 0);
      if (el.glazing[0].panels.length !== 1) throw new Error('0 should clamp to 1, got ' + el.glazing[0].panels.length);
      setGlazingPanelCount(0, 999);
      if (el.glazing[0].panels.length !== GLAZING_MAX_PANELS) throw new Error('should clamp to ' + GLAZING_MAX_PANELS);
      setGlazingPanelCount(0, 'abc');
      if (el.glazing[0].panels.length !== 1) throw new Error('junk should clamp to 1');
    });

    __check('a run totals its target EXACTLY — the rounding residual lands on one panel', () => {
      // 610 / 3 is 203.3333, which re-sums to 609.9999: a hairline gap at the wall edge
      // and three panel dims reading a repeating decimal. A set-out drawing puts the
      // odd fraction on one panel instead of spreading it across all of them.
      const el = seed([{ x: 0, y: 30, h: 60, panels: [0, 0, 0] }]);
      setGlazingRunField(0, 'w', 610);
      if (_glazingRunWidth(el.glazing[0]) !== 610) throw new Error('run totals ' + _glazingRunWidth(el.glazing[0]) + ', not 610');
      // And the same must hold through Equal, which is where a second local division
      // would reintroduce it.
      setGlazingPanelCount(0, 7);
      equalizeGlazingPanels(0);
      if (_glazingRunWidth(el.glazing[0]) !== 610) throw new Error('after Equal the run totals ' + _glazingRunWidth(el.glazing[0]));
      // The seams still have to be strictly increasing — a residual big enough to
      // reorder them would put a mullion behind its neighbour.
      const s = _glazingSeams(el.glazing[0]);
      for (let i = 1; i < s.length; i++) if (!(s[i] > s[i - 1])) throw new Error('seams are not increasing: ' + s.join(','));
    });

    __check('Equal fills the array — it is a shortcut, not a stored mode', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [30, 60, 30] }]);
      equalizeGlazingPanels(0);
      const run = el.glazing[0];
      if (run.panels.join(',') !== '40,40,40') throw new Error('got ' + run.panels.join(','));
      if (_glazingRunWidth(run) !== 120) throw new Error('Equal must not change the glass width');
      // No flag left behind that a later per-panel edit would have to clear.
      if ('equal' in run || 'count' in run) throw new Error('Equal stored a mode instead of filling the array');
    });

    __check('editing ONE panel changes the total — a measured width is a fact', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [40, 40, 40] }]);
      setGlazingPanelWidth(0, 1, 60);
      if (el.glazing[0].panels.join(',') !== '40,60,40') throw new Error('got ' + el.glazing[0].panels.join(','));
      if (_glazingRunWidth(el.glazing[0]) !== 140) throw new Error('total should follow the panels, got ' + _glazingRunWidth(el.glazing[0]));
      // Negatives would put a seam behind the previous one.
      setGlazingPanelWidth(0, 0, -10);
      if (el.glazing[0].panels[0] !== 0) throw new Error('a negative width should clamp to 0');
    });

    __check('an out-of-range panel or run index is a no-op, not a throw', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [40, 40] }]);
      setGlazingPanelWidth(0, 9, 50); setGlazingPanelWidth(3, 0, 50);
      setGlazingRunField(7, 'w', 100); equalizeGlazingPanels(7); setGlazingPanelCount(7, 3);
      removeGlazingRun(7); removeGlazingRun(-1);
      if (el.glazing.length !== 1 || el.glazing[0].panels.join(',') !== '40,40') throw new Error('a bad index mutated the model');
    });

    __check('removeGlazingRun deletes only its own run', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [40] }, { x: 100, y: 30, h: 60, panels: [80] }]);
      removeGlazingRun(0);
      if (el.glazing.length !== 1) throw new Error('expected 1 run left');
      if (el.glazing[0].x !== 100) throw new Error('removed the wrong run');
    });

    __check('every edit REDRAWS the wall — a seam that moves must move on screen', () => {
      seed([{ x: 0, y: 30, h: 60, panels: [40, 40] }]);
      const before = __drew;
      setGlazingPanelWidth(0, 0, 50); equalizeGlazingPanels(0); setGlazingPanelCount(0, 3);
      setGlazingRunField(0, 'w', 150); addGlazingRun(); removeGlazingRun(1);
      if (__drew - before !== 6) throw new Error('expected 6 redraws, got ' + (__drew - before));
    });

    // ── The sidebar panel ───────────────────────────────────────────────────
    __check('renderGlazingControls fills #glazingControls with one block per run', () => {
      seed([{ x: 12, y: 30, h: 60, panels: [48, 48, 36, 48] }, { x: 200, y: 40, h: 30, panels: [20, 20] }]);
      renderGlazingControls();
      const box = document.getElementById('glazingControls');
      if (!box) throw new Error('#glazingControls is missing from index.html');
      if (box.querySelectorAll('.gz-run').length !== 2) throw new Error('expected 2 run blocks');
      // 4 + 2 panel inputs, each addressing its own index.
      if (box.querySelectorAll('.gz-panels .gz-in').length !== 6) throw new Error('expected 6 panel width inputs');
      if (box.innerHTML.indexOf('setGlazingPanelWidth(0, 3,') < 0) throw new Error('panel 4 of run 1 has no handler');
      if (box.innerHTML.indexOf('addGlazingRun()') < 0) throw new Error('no way to add a run');
      if (box.innerHTML.indexOf('equalizeGlazingPanels(1)') < 0) throw new Error('run 2 has no Equal button');
      // The seam count is the number a designer is actually placing art against.
      if (box.textContent.indexOf('3 seams') < 0) throw new Error('a 4-panel run should report 3 seams');
    });

    __check('with no runs the panel offers an explanation and an Add button, not a blank', () => {
      seed();
      renderGlazingControls();
      const box = document.getElementById('glazingControls');
      if (!box.querySelector('.gz-hint')) throw new Error('no empty-state hint');
      if (box.innerHTML.indexOf('addGlazingRun()') < 0) throw new Error('an empty panel must still offer Add');
      if (box.querySelector('.gz-run')) throw new Error('drew a run block with no runs');
    });

    __check('the field labels carry the ELEVATION unit, so 48 is never ambiguous', () => {
      seed([{ x: 0, y: 30, h: 60, panels: [60, 60] }]);
      elevUnit = 'cm'; renderGlazingControls();
      if (document.getElementById('glazingControls').textContent.indexOf('cm') < 0) throw new Error('cm not shown on the fields');
      elevUnit = 'in';
    });

    __check('the editor renders BEFORE initElevControls no-frames early return', () => {
      // Glass is independent of frames and a window-film-only wall has none, so a call
      // placed after that return would leave the panel unreachable on exactly the wall
      // that needs it most. Same trap as _drawSpecSetPage's footer.
      const i = S.indexOf('function initElevControls');
      if (i < 0) throw new Error('initElevControls not found');
      const body = S.slice(i, i + 1400);
      const call = body.indexOf('renderGlazingControls()');
      const ret = body.indexOf('elevFrames.length === 0');
      if (call < 0) throw new Error('initElevControls never renders the glazing panel');
      if (ret >= 0 && call > ret) throw new Error('the glazing render sits after the no-frames early return');
    });

    __check('the panel is reachable from the Elevations sidebar markup', () => {
      if (H.indexOf('id="glazingControls"') < 0) throw new Error('#glazingControls is not in index.html');
      if (H.indexOf('id="sec-glazing"') < 0) throw new Error('no Window Panels section');
      // <details>, deliberately: toggleDashSection rewrites the label span with a
      // chevron, so reusing it would replace "Window Panels" with an arrow.
      if (!/<details[^>]*id="sec-glazing"/.test(H)) throw new Error('sec-glazing should be a <details> element');
    });

    // ── The schedule ────────────────────────────────────────────────────────
    __check('a full-graphic row schedules NOTHING — one file has no panel list', () => {
      const el = seed([{ x: 0, y: 30, h: 60, panels: [60, 60] }]);
      const fr = { id: 'WF-1', x: 0, y: 30, w: 120, h: 60, active: true, product: 'Window Film (WF)' };
      el.frames.push(fr);
      if (_glazingScheduleForFrame(el, fr, 2, 'full').length !== 0) throw new Error('full output produced a schedule');
      if (_glazingScheduleForFrame(el, fr, 2, undefined).length !== 0) throw new Error('the default should be full');
      if (_glazingScheduleForFrame(el, fr, 2, 'panels').length !== 2) throw new Error('panels output should schedule 2 files');
    });

    __check('a Split row on a wall with NO glazing schedules nothing', () => {
      // Inventing one full-width panel would read as a schedule the installer could
      // work from, when in fact nobody has said where the mullions are.
      const el = seed([]);
      const fr = { id: 'WF-1', x: 0, y: 30, w: 120, h: 60, active: true };
      el.frames.push(fr);
      if (_glazingScheduleForFrame(el, fr, 2, 'panels').length !== 0) throw new Error('scheduled panels with no glazing run');
    });

    __check('the schedule CLIPS to the panels the graphic actually crosses', () => {
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40, 40, 40] }]);   // seams at 40/80/120
      // A graphic over panels 2 and 3 only.
      const fr = { id: 'WF-2', x: 40, y: 30, w: 80, h: 60, active: true };
      el.frames.push(fr);
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      if (rows.length !== 2) throw new Error('expected 2 print files, got ' + rows.length);
      // The PANEL's number on the wall, not its position in the list — the installer
      // is told which pane each file goes on.
      if (rows.map(r => r.index).join(',') !== '2,3') throw new Error('panel numbers read ' + rows.map(r => r.index).join(','));
      if (rows.some(r => r.finishedW !== 40)) throw new Error('finished widths should be the full 40 here');
    });

    __check('a graphic ending mid-panel schedules the CLIPPED width, not the pane width', () => {
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40, 40] }]);
      const fr = { id: 'WF-3', x: 20, y: 30, w: 40, h: 60, active: true };   // 20..60
      el.frames.push(fr);
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      if (rows.length !== 2) throw new Error('expected 2 files, got ' + rows.length);
      if (rows[0].finishedW !== 20 || rows[1].finishedW !== 20) throw new Error('widths read ' + rows.map(r => r.finishedW).join(','));
      if (rows[0].printW !== 24) throw new Error('print width should add bleed both edges, got ' + rows[0].printW);
    });

    __check('the lap is zero at the PRINTED SET ends, not the run ends', () => {
      // Deciding it from the panel's index in the run would put a lap on the outside
      // of a clipped graphic's first file and tell the installer to trim art that
      // was never printed.
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40, 40, 40] }]);
      const fr = { id: 'WF-4', x: 40, y: 30, w: 80, h: 60, active: true };   // panels 2,3
      el.frames.push(fr);
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      if (rows[0].overlapLeft !== 0) throw new Error('the first printed file should have no left lap');
      if (rows[rows.length - 1].overlapRight !== 0) throw new Error('the last printed file should have no right lap');
      if (rows[0].overlapRight !== 2) throw new Error('the shared seam should lap by the bleed, got ' + rows[0].overlapRight);
    });

    __check('one panel split equals the full-file numbers — bleed means one thing', () => {
      const el = seed([{ x: 0, y: 20, h: 80, panels: [120] }]);
      const fr = { id: 'WF-5', x: 0, y: 30, w: 120, h: 60, active: true };
      el.frames.push(fr);
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      const whole = _rowOpeningAndPrint({ product: 'Window Film (WF)', extW: 120, extH: 60, bleed: 2 });
      if (rows.length !== 1) throw new Error('expected 1 file');
      if (rows[0].printW !== whole.printW || rows[0].printH !== whole.printH) {
        throw new Error('split-of-one (' + rows[0].printW + 'x' + rows[0].printH + ') != full file ('
          + whole.printW + 'x' + whole.printH + ')');
      }
      if (rows[0].overlapLeft !== 0 || rows[0].overlapRight !== 0) throw new Error('a single panel has nothing to lap onto');
    });

    __check('the run is chosen by GREATEST overlap, not first hit', () => {
      // Two windows on one wall; a hairline past a mullion must not re-home the graphic.
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40] }, { x: 100, y: 20, h: 80, panels: [60, 60] }]);
      const fr = { id: 'WF-6', x: 95, y: 30, w: 100, h: 60, active: true };
      el.frames.push(fr);
      const run = _glazingRunForFrame(el, fr);
      if (!run || run.x !== 100) throw new Error('picked the wrong run');
      if (_glazingRunForFrame(el, { x: 500, y: 0, w: 10, h: 10 })) throw new Error('a graphic clear of every run should match none');
    });

    // ── Wiring: the field has to survive a keystroke and reach the exports ──
    __check('printOutput is in the sync field map, or a keystroke wipes it', () => {
      if (!/printOutput:\\s*\\['m_printOutput'\\]/.test(S)) throw new Error('printOutput is missing from the bulk-edit/field map');
      if (S.indexOf("setVal('m_printOutput'") < 0) throw new Error('loadDashDataIntoControls never seeds the control');
      if (S.indexOf('printOutput: "full"') < 0) throw new Error('dashDefaultData has no printOutput default');
    });

    __check('only Window Film can be set to panels, in the DATA as well as the UI', () => {
      // Hiding the control is not enough: a bulk edit or an imported row could leave a
      // wallcovering in a mode whose schedule has nothing to read.
      const i = S.indexOf('printOutput: (getStr(');
      if (i < 0) throw new Error('syncDashAndCalculate does not read printOutput');
      const seg = S.slice(i, i + 400);
      if (seg.indexOf("'Window Film (WF)'") < 0) throw new Error('the sync does not gate on Window Film');
      if (H.indexOf('id="printOutputRow"') < 0) throw new Error('the row has no id to hide');
      if (S.indexOf("getElementById('printOutputRow')") < 0) throw new Error('nothing hides the row for wallcovering');
    });

    __check('the CSV carries the artboard set, appended at the END of the header', () => {
      if (S.indexOf('Print Panels (in)') < 0) throw new Error('no Print Panels column');
      // The InDesign script addresses columns by name, so a new column must be
      // trailing — inserting one mid-header shifts every position after it.
      const hdr = S.indexOf('Material,Print Output,Print Panels (in)\\\\n');
      if (hdr < 0) throw new Error('the new columns are not the last ones in the header');
      // And it must read the same helper the sheet prints from.
      const rowI = S.indexOf("_isFlatGraphic(r.product) ? (r.printOutput || 'full') : ''");
      if (rowI < 0) throw new Error('the CSV row never emits printOutput');
      if (S.slice(rowI, rowI + 900).indexOf('_glazingScheduleForFrame') < 0) {
        throw new Error('the CSV computes its own panel sizes instead of reading the shared schedule');
      }
    });

    __check('the sheet draws the schedule and gives up the height it takes', () => {
      const i = S.indexOf('function _drawFlatGraphicSpecPage');
      const body = S.slice(i, i + 4000);
      const sched = body.indexOf('_drawGlazingSchedule');
      const plan = body.indexOf('const planSide');
      if (sched < 0) throw new Error('the flat-graphic sheet never draws a panel schedule');
      if (plan < 0 || sched > plan) throw new Error('the schedule must be drawn before the floorplan claims the space');
      // sy is the running cursor; reassigning it is what makes the floorplan shrink
      // instead of being drawn over.
      if (body.indexOf('sy = _drawGlazingSchedule') < 0) throw new Error('the schedule does not advance the layout cursor');
    });

    __check('the sheet and the schedule share ONE definition of "which wall"', () => {
      // Two copies of "the wall this graphic is on" is exactly the predicate that
      // drifts — the capture would draw one wall and the schedule read another.
      if (S.indexOf('function _flatGraphicElevFor') < 0) throw new Error('no shared lookup');
      const body = S.slice(S.indexOf('function _drawFlatGraphicSpecPage'), S.indexOf('function _drawFlatGraphicSpecPage') + 8000);
      if ((body.match(/_flatGraphicElevFor\\(/g) || []).length < 2) throw new Error('the sheet does not use the shared lookup in both places');
      if (body.indexOf('e.frames.some(fr =>') >= 0) throw new Error('an inline copy of the wall lookup is back');
    });

    __check('the schedule prints in the same unit convention as the spec rows above it', () => {
      // Two unit conventions on one sheet is a worse defect than no table at all.
      const i = S.indexOf('function _drawGlazingSchedule');
      if (i < 0) throw new Error('_drawGlazingSchedule not found');
      const body = S.slice(i, i + 2200);
      if (body.indexOf('_specDualUnit()') < 0) throw new Error('the table ignores the deck dual-unit setting');
      if (body.indexOf("du ? 'in' : dashUnit") < 0) throw new Error('dual units must lead with inches, like buildSpecStrings');
      if (body.indexOf("unitFactor(elevUnit,") < 0) throw new Error('panel widths arrive in elevUnit and must be converted');
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
