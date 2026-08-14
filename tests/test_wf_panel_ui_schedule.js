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

    __check('EXACT BUG: the drawing and the print schedule agree on a panel width', () => {
      // Reported: the elevation read 29" for a panel the schedule called 28.86" — two
      // roundings of 202/7 = 28.857142, disagreeing by 0.14" about a pane of glass.
      // elevFmt rounds inches to whole for legibility, which is right for a hang height
      // and wrong for something being cut.
      const el = seed([{ x: 0, y: 4, h: 82, panels: [] }]);
      el.glazing[0].panels = [0, 0, 0, 0, 0, 0, 0];
      setGlazingRunField(0, 'w', 202);
      const w = el.glazing[0].panels[0];
      // What the drawing prints, stripped of unit marks, vs what the schedule prints.
      const drawn = parseFloat(_elevFmtExact(w));
      const sched = _glazingPanelPrints(el.glazing[0], 0, 82)[0].finishedW;
      if (Math.abs(drawn - sched) > 0.001) throw new Error('drawing says ' + drawn + ', schedule says ' + sched);
    });

    __check('EXACT ASK: Equal snaps to 1/16" — a width someone can cut to', () => {
      // An exact division of 202 over 7 is 28.857142, which is not a width anyone can
      // cut glass to. The drift correction made the SUM right while every panel stayed
      // an awkward number.
      const el = seed([{ x: 0, y: 4, h: 82, panels: [0, 0, 0, 0, 0, 0, 0] }]);
      setGlazingRunField(0, 'w', 202);
      const p = el.glazing[0].panels;
      // Every panel but the last lands on a sixteenth.
      p.slice(0, -1).forEach((v, i) => {
        if (Math.abs(v * 16 - Math.round(v * 16)) > 1e-6) throw new Error('panel ' + i + ' is ' + v + ', not a sixteenth');
      });
      // The remainder still lands on the last panel, so the run totals EXACTLY.
      if (_glazingRunWidth(el.glazing[0]) !== 202) throw new Error('the run no longer totals its target: ' + _glazingRunWidth(el.glazing[0]));
      if (p[0] !== 28.875) throw new Error('expected 28.875 per panel, got ' + p[0]);
    });

    __check('a TYPED width is left exactly as measured — only Equal snaps', () => {
      // A width you type is a measurement, not a division. Snapping it would silently
      // move a pane the installer had already measured.
      const el = seed([{ x: 0, y: 4, h: 82, panels: [40, 40] }]);
      setGlazingPanelWidth(0, 0, 33.3333);
      if (el.glazing[0].panels[0] !== 33.3333) throw new Error('a typed width was snapped to ' + el.glazing[0].panels[0]);
    });

    __check('the snap is a physical increment, so a cm project gets the same glass', () => {
      // Authored in inches and converted, like every other standard here — snapping to
      // a whole centimetre instead would be a different pane.
      elevUnit = 'cm';
      const step = GLAZING_SNAP_IN * unitFactor('in', 'cm');
      if (Math.abs(step - 0.15875) > 1e-6) throw new Error('the cm step is ' + step + ', not 1/16 inch');
      elevUnit = 'in';
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

    __check('typing is LIVE — the wall follows each keystroke without losing the caret', () => {
      // onchange only fires on blur/Enter, so a width could not be watched as it was
      // typed. The live path must redraw the WALL and NOT rebuild the sidebar: an
      // innerHTML rebuild destroys the input you are typing into.
      seed([{ x: 0, y: 30, h: 60, panels: [40, 40] }]);
      const d0 = __drew, c0 = __ctl;
      setGlazingPanelWidthLive(0, 0, 55);
      setGlazingRunFieldLive(0, 'h', 70);
      if (__drew - d0 !== 2) throw new Error('the live path did not redraw the wall');
      if (__ctl !== c0) throw new Error('the live path rebuilt the sidebar, which kills focus mid-type');
      if (elevations[0].glazing[0].panels[0] !== 55) throw new Error('the live edit did not reach the model');
      if (elevations[0].glazing[0].h !== 70) throw new Error('the live height edit did not reach the model');
      // And both handlers are actually wired to the inputs.
      renderGlazingControls();
      const box = document.getElementById('glazingControls').innerHTML;
      if (box.indexOf('oninput="setGlazingPanelWidthLive(0, 0,') < 0) throw new Error('panel inputs have no live handler');
      if (box.indexOf('onchange="setGlazingPanelWidth(0, 0,') < 0) throw new Error('panel inputs lost their commit handler');
      if (box.indexOf('oninput="setGlazingRunFieldLive(0,') < 0) throw new Error('run fields have no live handler');
    });

    __check('a live keystroke does NOT file an undo step — one per edit, not per character', () => {
      let hist = 0; const _ph = pushHistory; pushHistory = () => { hist++; };
      seed([{ x: 0, y: 30, h: 60, panels: [40, 40] }]);
      setGlazingPanelWidthLive(0, 0, 41);
      setGlazingPanelWidthLive(0, 0, 42);
      setGlazingPanelWidthLive(0, 0, 43);
      if (hist !== 0) throw new Error('typing filed ' + hist + ' undo steps');
      setGlazingPanelWidth(0, 0, 43);
      if (hist !== 1) throw new Error('committing should file exactly one, got ' + hist);
      pushHistory = _ph;
    });

    __check('the letter tags sit ABOVE the glass, not on the artwork', () => {
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40] }]);
      renderGlazingRuns(240, 108);
      const tag = document.querySelector('#glazing-layer .glazing-tag');
      const b = parseFloat(tag.style.bottom);
      // Head of the glass is (20 + 80) * elevScale; the tag must clear it.
      if (!(b >= 100 * elevScale)) throw new Error('the tag is inside the pane, over the graphic (bottom ' + b + ')');
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

    // ── Calling out each panel ──────────────────────────────────────────────
    __check('EXACT BUG: two runs on one wall do not both start at A', () => {
      // A wall with two windows was showing A,B,C on each of them, so "panel B" named
      // two different sheets of glass and a print file had no unambiguous home.
      const el = seed([{ x: 243, y: 4, h: 82, panels: [33, 33, 33] },
                       { x: 20, y: 4, h: 82, panels: [50, 50] }]);
      const m = _glazingWallLabels(el);
      // Ordered by the run's X, not by the order the runs were added — the letters read
      // left to right the way the wall does. Run index 1 is the LEFT-hand window here.
      if (m['1:0'] !== 'A' || m['1:1'] !== 'B') throw new Error('the left window should be A,B — got ' + m['1:0'] + ',' + m['1:1']);
      if (m['0:0'] !== 'C' || m['0:2'] !== 'E') throw new Error('the right window should continue C,D,E — got ' + m['0:0'] + '..' + m['0:2']);
      // No duplicates anywhere on the wall.
      const all = Object.keys(m).map(k => m[k]);
      if (new Set(all).size !== all.length) throw new Error('a letter is used twice: ' + all.join(','));
    });

    __check('the schedule uses the WALL letter, so a second window is unambiguous', () => {
      const el = seed([{ x: 0, y: 4, h: 82, panels: [50, 50] },
                       { x: 200, y: 4, h: 82, panels: [40, 40] }]);
      const fr = { id: 'WF-2', x: 200, y: 4, w: 80, h: 82, active: true };
      el.frames.push(fr);
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      if (rows.map(p => p.label).join(',') !== 'C,D') throw new Error('second window scheduled as ' + rows.map(p => p.label).join(','));
    });

    __check('panels are LETTERED, using the same sequence frames use', () => {
      if (_glazingPanelLabel(0) !== 'A' || _glazingPanelLabel(3) !== 'D') throw new Error('panels are not A..D');
      // 27 panels is absurd, but running off the end of the alphabet silently is worse
      // than a long label — getElevLetter already solved this for frames.
      if (_glazingPanelLabel(26) !== 'AA') throw new Error('the 27th panel should be AA, got ' + _glazingPanelLabel(26));
    });

    __check('the SAME letter appears in the pane, the editor and the schedule', () => {
      // Three places naming one panel. If they can disagree, the schedule points at
      // nothing and a graphic goes on the wrong lite.
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40, 40] }]);
      const fr = { id: 'WF-1', x: 0, y: 20, w: 120, h: 80, active: true };
      el.frames.push(fr);
      renderGlazingRuns(240, 108);
      const tags = Array.from(document.querySelectorAll('#glazing-layer .glazing-tag')).map(t => t.textContent);
      if (tags.join(',') !== 'A,B,C') throw new Error('pane tags read ' + tags.join(','));
      renderGlazingControls();
      const eds = Array.from(document.querySelectorAll('#glazingControls .gz-panels .gz-panel > span')).map(s => s.textContent);
      if (eds.join(',') !== 'A,B,C') throw new Error('editor labels read ' + eds.join(','));
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      if (rows.map(p => p.label).join(',') !== 'A,B,C') throw new Error('schedule labels read ' + rows.map(p => p.label).join(','));
    });

    __check('a clipped schedule keeps the WALL letter, not a renumbered one', () => {
      // The installer is told which pane each file goes on. Renumbering from 1 would
      // point the second file at the first pane.
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40, 40, 40] }]);
      const fr = { id: 'WF-2', x: 40, y: 20, w: 80, h: 80, active: true };
      el.frames.push(fr);
      const rows = _glazingScheduleForFrame(el, fr, 2, 'panels');
      if (rows.map(p => p.label).join(',') !== 'B,C') throw new Error('clipped labels read ' + rows.map(p => p.label).join(','));
    });

    __check('a panel tag is NOT styled like a frame letter — they can share a wall', () => {
      // "Panel B" and "piece B" are different things. The tag is a small chip in the
      // dimension ink; a frame letter is a large grey glyph on the artwork.
      seed([{ x: 0, y: 20, h: 80, panels: [40, 40] }]);
      renderGlazingRuns(240, 108);
      const t = document.querySelector('#glazing-layer .glazing-tag');
      if (!t) throw new Error('no panel tag drawn');
      if (t.className.indexOf('glazing-tag') < 0) throw new Error('the tag has no class of its own to style');
      // Opaque, because it sits over artwork.
      const css = window.__cssSrc || '';
      const i = css.indexOf('.glazing-tag');
      if (i < 0) throw new Error('.glazing-tag is unstyled, so it inherits whatever is nearby');
      if (css.slice(i, i + 320).indexOf('background: #fff') < 0) throw new Error('the tag chip is not opaque');
    });

    __check('the CSV qualifies each panel by item code, because these become filenames', () => {
      // A bare "B" collides with the frame letters.
      const i = S.indexOf('_glazingScheduleForFrame(el, fr, bl, r.printOutput)');
      if (i < 0) throw new Error('the CSV no longer builds a panel list');
      if (S.slice(i, i + 320).indexOf("(r.id || '') + '.' + p.label") < 0) {
        throw new Error('the CSV emits a bare panel label instead of ITEMCODE.LETTER');
      }
    });

    // ── Seeing the window dimensions ────────────────────────────────────────
    // createElevArchSpacing uses its dimId for control/offset state, NOT as the
    // element id, so these count the drawn lines rather than looking ids up.
    const __dims = () => {
      const L = document.getElementById('glazing-dim-layer');
      return { h: L.querySelectorAll('.arch-dim-h').length, v: L.querySelectorAll('.arch-dim-v').length };
    };
    const __clearDims = () => { const L = document.getElementById('glazing-dim-layer'); if (L) L.innerHTML = ''; };

    __check('EXACT BUG: panel dims are NOT in the frame-spacing layer', () => {
      // They were, and #dim-layer's display is owned by the frame-spacing guide button
      // (#dimToggle) — so every window-panel dimension was invisible unless you happened
      // to have frame spacing switched on. They were in the DOM the whole time, which is
      // why this only showed up from a screenshot. A window panel dim is not a frame
      // spacing dim and must not be hostage to that button.
      __clearDims();
      const dl = document.getElementById('dim-layer');
      if (dl) dl.innerHTML = '';
      seed([{ x: 12, y: 20, h: 80, panels: [40, 40, 40] }]);
      renderGlazingRuns(240, 108);
      if (dl && dl.querySelectorAll('.arch-dim').length) throw new Error('panel dims are back in #dim-layer');
      if (!document.getElementById('glazing-dim-layer')) throw new Error('#glazing-dim-layer is missing from index.html');
      if (!__dims().h) throw new Error('nothing was drawn into the glazing dim layer');
      // And it has to be exported, or the dims are on screen and absent from the PDF.
      const i = S.indexOf('const annotationLayers = [');
      if (S.slice(i, S.indexOf('];', i)).indexOf("'glazing-dim-layer'") < 0) throw new Error('the layer is not in annotationLayers');
      if (S.indexOf("'group-dim-layer','figure-dim-layer','glazing-dim-layer'") < 0) throw new Error('the layer is not in the artboard bounds list, so it can be cropped');
    });

    __check('a multi-panel run dimensions its OVERALL glass, not just each panel', () => {
      // A chain of panel widths with no overall above it makes the reader add three
      // numbers to learn how big the window is.
      __clearDims();
      seed([{ x: 12, y: 20, h: 80, panels: [40, 40, 40] }]);
      renderGlazingRuns(240, 108);
      const d = __dims();
      if (d.h !== 4) throw new Error('expected 3 panel dims + 1 overall, got ' + d.h);
      if (d.v !== 1) throw new Error('expected 1 glass height dim, got ' + d.v);
    });

    __check('EXACT BUG: a tight dim chain STAGGERS instead of overlapping itself', () => {
      // Six 31" panels each print 31"(783mm) — about 78px — in a slot nearer 60px, so
      // the chain smeared into itself. Alternating rows is exact: neighbours are never
      // on the same row, so they cannot touch however long the label gets.
      __clearDims();
      seed([{ x: 48, y: 0, h: 82, panels: [31, 31, 31, 31, 31, 31] }]);
      // Pinned: whether a chain is crowded depends on the ZOOM, so a test that leaves
      // elevScale to whatever ran before it is testing nothing in particular. At 2px/in
      // a 31" panel is 62px and its dual-unit label about 78px — crowded.
      elevScale = 2;
      // Dual units ON: that is the reported case. "31"" alone fits fine; it is
      // "31"(783mm)" that does not, which is why the stagger keys on the LABEL and
      // not on the panel count.
      elevDualUnit = 'mm';
      renderGlazingRuns(400, 108);
      const L = document.getElementById('glazing-dim-layer');
      const rows = Array.from(L.querySelectorAll('.arch-dim-h')).map(d => Math.round(parseFloat(d.style.bottom)));
      const panelRows = rows.slice(0, 6);
      // Two distinct rows, alternating.
      if (new Set(panelRows).size !== 2) throw new Error('the chain did not stagger: ' + panelRows.join(','));
      if (panelRows[0] === panelRows[1]) throw new Error('neighbours share a row');
      if (panelRows[0] !== panelRows[2]) throw new Error('the stagger should alternate, not climb');
      // And the overall still clears BOTH rows.
      const ov = rows[6];
      if (!(ov > Math.max.apply(null, panelRows))) throw new Error('the overall dim sits inside the staggered chain');
      elevDualUnit = '';   // don't leak the setting into the checks below
    });

    __check('a roomy chain does NOT stagger — the fix is for crowding only', () => {
      __clearDims();
      seed([{ x: 0, y: 0, h: 82, panels: [120, 120] }]);
      elevScale = 2;   // 120" is 240px, far wider than any label
      renderGlazingRuns(400, 108);
      const L = document.getElementById('glazing-dim-layer');
      const rows = Array.from(L.querySelectorAll('.arch-dim-h')).slice(0, 2).map(d => Math.round(parseFloat(d.style.bottom)));
      if (rows[0] !== rows[1]) throw new Error('wide panels were staggered for no reason: ' + rows.join(','));
    });

    __check('EXACT ASK: the glass HEIGHT dim is rotated so it clears the mullions', () => {
      __clearDims();
      seed([{ x: 20, y: 0, h: 82, panels: [60, 60] }]);
      renderGlazingRuns(400, 108);
      const v = document.getElementById('glazing-dim-layer').querySelector('.arch-dim-v');
      if (!v) throw new Error('no glass height dim');
      if (!v.querySelector('.arch-label-rot')) throw new Error('the height label is still upright, so it lands across the glass');
      // createElevArchSpacing has to actually support the flag, not just be handed it.
      const i = S.indexOf('function createElevArchSpacing');
      const body = S.slice(i, i + 11000);
      if (body.indexOf('bandOpt.rotateLabel') < 0) throw new Error('createElevArchSpacing ignores rotateLabel');
      if (body.indexOf('rotateLabel: !!bandOpt.rotateLabel') < 0) throw new Error('the flag never reaches buildDimControls, so the chevrons rotate with it');
    });

    __check('an upright vertical dim is unchanged — rotation is opt-in', () => {
      // Every other caller passes no flag and must keep the label it has.
      __clearDims();
      const L = document.getElementById('glazing-dim-layer');
      createElevArchSpacing(10, 0, 10, 50, 'v', L, '50', 'plain-v', 0, {});
      const d = L.querySelector('.arch-dim-v');
      if (d.querySelector('.arch-label-rot')) throw new Error('a dim with no flag came out rotated');
    });

    __check('the sill field says how a door is handled', () => {
      // Decided with the user: no per-panel height. The graphic is built to the tallest
      // opening anyway, so sill 0 describes a door bay and a panel stays a plain number.
      seed([{ x: 0, y: 30, h: 60, panels: [40, 40] }]);
      renderGlazingControls();
      const t = document.getElementById('glazingControls').textContent;
      if (t.indexOf('door') < 0) throw new Error('nothing tells you what to do when a door is in the run');
    });

    __check('EXACT BUG: the panel-count field cannot outgrow its container', () => {
      // The global input[type="number"] rule sets width:100% and height:26px at
      // specificity (0,1,1), which outranks a bare .gz-in-n (0,1,0) — that is what
      // pushed the field across the panel and shoved "N seams" out through the side.
      const css = window.__cssSrc || '';
      if (css.indexOf('#glazingControls .gz-in-n') < 0) throw new Error('.gz-in-n is not specific enough to beat the global number-input rule');
      if (css.indexOf('#glazingControls .gz-in {') < 0) throw new Error('.gz-in is not specific enough either');
      const i = css.indexOf('#glazingControls .gz-in {');
      if (css.slice(i, i + 200).indexOf('height: auto') < 0) throw new Error('the global height:26px still applies');
      // And the seam note must clip rather than push the row wider.
      const n = css.indexOf('.gz-note {');
      if (css.slice(n, n + 200).indexOf('overflow: hidden') < 0) throw new Error('the seam note can still overflow the panel');
    });

    __check('a SINGLE-panel run does not print its width twice', () => {
      __clearDims();
      seed([{ x: 0, y: 20, h: 80, panels: [120] }]);
      renderGlazingRuns(240, 108);
      const d = __dims();
      if (d.h !== 1) throw new Error('the panel dim already IS the overall on a single lite, got ' + d.h + ' width dims');
      if (d.v !== 1) throw new Error('a single lite still needs its height');
    });

    __check('the overall dim never prints EQ — EQ is about a repeated gap', () => {
      // Pinned on BEHAVIOUR rather than a source string: 16.57 gave the overall dim an
      // id variable and a drag offset, which moved the literal this used to match.
      // With EQ on, the panel dims read EQ and the overall must still read its size.
      __clearDims();
      seed([{ x: 0, y: 20, h: 80, panels: [60, 60] }]);
      const _eq = dimVisibility.spacingEQ;
      dimVisibility.spacingEQ = true;
      renderGlazingRuns(240, 108);
      const L2 = document.getElementById('glazing-dim-layer');
      const texts = Array.from(L2.querySelectorAll('.arch-dim-h')).map(d => (d.textContent || '').trim());
      if (texts.slice(0, 2).some(t => t.indexOf('EQ') < 0)) throw new Error('the panel dims should honour EQ: ' + texts.join(' | '));
      const ov = texts[2] || '';
      if (ov.indexOf('EQ') >= 0) throw new Error('the OVERALL printed EQ, which says nothing about how big the window is');
      if (ov.indexOf('120') < 0) throw new Error('the overall should read its own size, got "' + ov + '"');
      dimVisibility.spacingEQ = _eq;
    });

    // ── Dragging the lines, leaders, and undoing a delete ──────────────────
    __check('EXACT BUG: a dragged dim LINE stays where it was dragged', () => {
      // buildDimControls STORES the offset under the dim's id, but a renderer that
      // hardcodes 0 never reads it back — so the line snapped home on the next redraw
      // while the label (stored separately and applied inside the dim) stayed put.
      // That is exactly "I can slide the text but not move the line".
      __clearDims();
      seed([{ x: 20, y: 20, h: 80, panels: [60, 60] }]);
      elevScale = 2;
      renderGlazingRuns(240, 108);
      const before = parseFloat(document.getElementById('glazing-dim-layer').querySelector('.arch-dim-h').style.bottom);
      setDimOffset('glazing-0-0', 12);          // as a drag would
      __clearDims();
      renderGlazingRuns(240, 108);
      const after = parseFloat(document.getElementById('glazing-dim-layer').querySelector('.arch-dim-h').style.bottom);
      if (Math.abs(after - before) < 1) throw new Error('the dragged line snapped back (' + before + ' -> ' + after + ')');
      if (Math.abs((after - before) - 12 * elevScale) > 1) throw new Error('the line moved, but not by the dragged amount');
      setDimOffset('glazing-0-0', 0);
    });

    __check('the overall and the height dim are draggable too, each on its own axis', () => {
      __clearDims();
      seed([{ x: 40, y: 20, h: 80, panels: [60, 60] }]);
      elevScale = 2;
      renderGlazingRuns(240, 108);
      const L = document.getElementById('glazing-dim-layer');
      const ovBefore = parseFloat(L.querySelectorAll('.arch-dim-h')[2].style.bottom);
      const vBefore = parseFloat(L.querySelector('.arch-dim-v').style.left);
      setDimOffset('glazing-ov-0', 10);
      setDimOffset('glazing-ovh-0', -8);        // a vertical dim moves in X
      __clearDims();
      renderGlazingRuns(240, 108);
      const L2 = document.getElementById('glazing-dim-layer');
      if (Math.abs(parseFloat(L2.querySelectorAll('.arch-dim-h')[2].style.bottom) - ovBefore) < 1) throw new Error('the overall dim is not draggable');
      if (Math.abs(parseFloat(L2.querySelector('.arch-dim-v').style.left) - vBefore) < 1) throw new Error('the height dim is not draggable');
      setDimOffset('glazing-ov-0', 0); setDimOffset('glazing-ovh-0', 0);
    });

    __check('EXACT ASK: panel dims draw dashed LEADERS back to the glass', () => {
      // A dimension floating above the drawing with nothing joining it to the glass
      // does not say WHICH edges it spans. Frame spacing dims get theirs from
      // band1/band2; these were passing an empty options object.
      __clearDims();
      seed([{ x: 20, y: 20, h: 80, panels: [60, 60] }]);
      elevScale = 2;
      renderGlazingRuns(240, 108);
      const L = document.getElementById('glazing-dim-layer');
      if (!L.querySelector('.dim-leader')) throw new Error('no leader lines — the dims float free of the glass');
      // The band is the GLASS extent, not the dim's own line, or the leader has
      // nothing to reach down to.
      const i = S.indexOf('const gband = {');
      if (i < 0) throw new Error('no glass band is computed');
      if (S.slice(i, i + 90).indexOf('lo: y0, hi: y0 + h') < 0) throw new Error('the band is not the glass extent');
      // The vertical dim's band is a HORIZONTAL extent — a copy of gband would send
      // its leaders off at 90 degrees to where the glass is.
      const j = S.indexOf('const vband = {');
      if (j < 0 || S.slice(j, j + 90).indexOf('lo: x0, hi: x0 + runW') < 0) throw new Error('the height dim reuses the vertical band');
    });

    __check('EXACT ASK: a deleted panel dim can be brought back', () => {
      __clearDims();
      const el = seed([{ x: 20, y: 20, h: 80, panels: [60, 60] }]);
      renderGlazingControls();
      if (document.querySelector('#glazingControls .gz-restore')) throw new Error('the restore button shows when nothing is hidden');
      hideDim('glazing-0-0');
      if (_glazingHiddenCount() !== 1) throw new Error('the dim was not recorded as hidden');
      renderGlazingControls();
      const btn = document.querySelector('#glazingControls .gz-restore');
      if (!btn) throw new Error('no way to bring a deleted panel dim back');
      if (btn.textContent.indexOf('1 deleted panel dimension') < 0) throw new Error('the button does not say what it restores: ' + btn.textContent);
      restoreGlazingDims();
      if (_glazingHiddenCount() !== 0) throw new Error('restore did not unhide the dim');
    });

    __check('restoring panel dims leaves OTHER hidden dims and every drag alone', () => {
      // resetDimOffsets would have done this job, but it is named for something else
      // and throws away every nudge you have made.
      __clearDims();
      seed([{ x: 20, y: 20, h: 80, panels: [60, 60] }]);
      hideDim('glazing-0-0');
      // Set directly: hideDim ROUTES a frame-spacing id to a per-frame flag rather
      // than the generic map, so calling it here would not have put anything in the
      // map for restoreGlazingDims to spare — the check would pass for the wrong reason.
      getElevHiddenDims()['spacing-h-A-B'] = true;
      setDimOffset('glazing-0-1', 9);
      restoreGlazingDims();
      if (getElevHiddenDims()['spacing-h-A-B'] !== true) throw new Error('it unhid a frame dim as well');
      if (Math.abs(getDimOffset('glazing-0-1') - 9) > 0.001) throw new Error('it threw away a drag offset');
      getElevHiddenDims()['spacing-h-A-B'] = false; setDimOffset('glazing-0-1', 0);
    });

    // ── Discoverability: Split must say where panels come from ─────────────
    __check('picking Split with no window panels SAYS SO instead of failing quiet', () => {
      // _glazingScheduleForFrame returning [] is right for a renderer and wrong for
      // the control that turns it on.
      const el = seed([]);
      const row = { id: 'WF-9', product: 'Window Film (WF)', printOutput: 'panels' };
      el.frames.push({ id: 'WF-9', x: 0, y: 20, w: 100, h: 60, active: true });
      _updatePrintOutputHint(row);
      const h = document.getElementById('printOutputHint');
      if (!h) throw new Error('#printOutputHint is missing from index.html');
      if (h.textContent.indexOf('No window panels') < 0) throw new Error('no warning: "' + h.textContent + '"');
      if (h.className.indexOf('po-hint-warn') < 0) throw new Error('the empty case is not flagged');
      if (h.textContent.indexOf('Elevations') < 0) throw new Error('it does not say where to define them');
    });

    __check('with panels defined the hint counts the files and names the panels', () => {
      const el = seed([{ x: 0, y: 20, h: 80, panels: [40, 40, 40] }]);
      const row = { id: 'WF-9', product: 'Window Film (WF)', printOutput: 'panels' };
      el.frames.push({ id: 'WF-9', x: 0, y: 20, w: 120, h: 80, active: true });
      _updatePrintOutputHint(row);
      const h = document.getElementById('printOutputHint');
      if (h.textContent.indexOf('3 print files') < 0) throw new Error('wrong count: "' + h.textContent + '"');
      if (h.textContent.indexOf('A, B, C') < 0) throw new Error('the panels are not named: "' + h.textContent + '"');
      if (h.className.indexOf('po-hint-warn') >= 0) throw new Error('a working setup should not be flagged');
      // Silent for full output and for wallcovering — the control is not even shown.
      _updatePrintOutputHint({ id: 'WF-9', product: 'Window Film (WF)', printOutput: 'full' });
      if (document.getElementById('printOutputHint').textContent !== '') throw new Error('the hint should be blank for full output');
      _updatePrintOutputHint({ id: 'E', product: 'Wallcovering (EGD)', printOutput: 'panels' });
      if (document.getElementById('printOutputHint').textContent !== '') throw new Error('the hint should be blank for wallcovering');
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
      // 16.59 moved the schedule call into _drawFlatPanelSchedule so the sheet can
      // carry SEVERAL graphics — inline, it could only ever describe the first one.
      // The two requirements are unchanged: it is drawn before the floorplan claims
      // the space, and it advances the layout cursor rather than being drawn over.
      const i = S.indexOf('function _drawFlatGraphicSpecPage');
      const body = S.slice(i, i + 12000);
      const sched = body.indexOf('_drawFlatPanelSchedule(');
      const plan = body.indexOf('const planSide');
      if (sched < 0) throw new Error('the flat-graphic sheet never draws a panel schedule');
      if (plan < 0 || sched > plan) throw new Error('the schedule must be drawn before the floorplan claims the space');
      const h = S.indexOf('function _drawFlatPanelSchedule');
      if (h < 0) throw new Error('the schedule helper is missing');
      if (S.slice(h, h + 900).indexOf('setY(_drawGlazingSchedule(') < 0) throw new Error('the schedule does not advance the layout cursor');
    });

    __check('the sheet and the schedule share ONE definition of "which wall"', () => {
      // Two copies of "the wall this graphic is on" is exactly the predicate that
      // drifts — the capture would draw one wall and the schedule read another. The
      // two callers are now the sheet (for its elevation) and the schedule helper.
      if (S.indexOf('function _flatGraphicElevFor') < 0) throw new Error('no shared lookup');
      const uses = (S.match(/_flatGraphicElevFor\\(/g) || []).length;
      if (uses < 4) throw new Error('expected the definition plus the sheet, the schedule helper, the CSV and the merge — found ' + uses);
      const body = S.slice(S.indexOf('function _drawFlatGraphicSpecPage'), S.indexOf('function _drawFlatGraphicSpecPage') + 8000);
      if (body.indexOf('e.frames.some(fr =>') >= 0) throw new Error('an inline copy of the wall lookup is back');
    });

    __check('EXACT BUG: two graphics on ONE wall share ONE sheet', () => {
      // Two window films on one elevation produced two pages carrying the same
      // drawing twice. The elevation is the subject of this sheet, so repeating it
      // per item code is a duplicate, not a spec.
      const el = seed([]);
      el.frames.push({ id: 'EGD.001-A', x: 0, y: 4, w: 100, h: 82, active: true, product: 'Window Film (WF)' });
      el.frames.push({ id: 'EGD.001-B', x: 120, y: 4, w: 202, h: 82, active: true, product: 'Window Film (WF)' });
      const a = { id: 'EGD.001-A', product: 'Window Film (WF)' };
      const b = { id: 'EGD.001-B', product: 'Window Film (WF)' };
      dashProjectData = [a, b];
      const pages = [
        { kind: 'spec', _specTpl: 'egdDetail', row: a, title: 'EGD.001-A' },
        { kind: 'spec', _specTpl: 'egdDetail', row: b, title: 'EGD.001-B' }
      ];
      const merged = _mergeFlatPages(pages);
      if (merged.length !== 1) throw new Error('expected 1 sheet, got ' + merged.length);
      if (!merged[0].members || merged[0].members.length !== 2) throw new Error('the surviving sheet does not carry both graphics');
      // The FIRST page survives, so a per-page setting or approval already attached
      // to it stays attached.
      if (merged[0].row !== a) throw new Error('the merge kept the wrong page');
      if (merged[0].title.indexOf('EGD.001-A') < 0 || merged[0].title.indexOf('EGD.001-B') < 0) {
        throw new Error('the shared page is not findable by both codes: ' + merged[0].title);
      }
    });

    __check('EXACT BUG: the PDF merges flat sheets too, not just Deck Studio', () => {
      // Deck Studio showed one combined sheet while the PDF still printed two. There
      // are TWO page-list builders and the merge had only been wired into the studio
      // one — the exact failure the "TWO PAGE-LIST BUILDERS" note warns about.
      const el = seed([]);
      el.frames.push({ id: 'W-A', x: 0, y: 4, w: 100, h: 82, active: true, product: 'Window Film (WF)' });
      el.frames.push({ id: 'W-B', x: 120, y: 4, w: 80, h: 82, active: true, product: 'Window Film (WF)' });
      const a = { id: 'W-A', product: 'Window Film (WF)' }, b = { id: 'W-B', product: 'Window Film (WF)' };
      dashProjectData = [a, b];
      const steps = [
        { type: 'spec', unit: { rep: a, members: [a], key: 'W-A' }, li: 0 },
        { type: 'spec', unit: { rep: b, members: [b], key: 'W-B' }, li: 0 }
      ];
      const merged = _mergeFlatSteps(steps);
      if (merged.length !== 1) throw new Error('the export still emits ' + merged.length + ' sheets');
      if (!merged[0].unit.members || merged[0].unit.members.length !== 2) throw new Error('the surviving step does not carry both graphics');
      // Without _forceTpl the surviving step falls back to the group/per-piece dispatch
      // and a merged sheet renders as something other than the flat layout.
      if (merged[0]._forceTpl !== 'egdDetail') throw new Error('the merged step does not force the flat layout');
      // Non-flat and unplaced steps are left alone.
      const keep = _mergeFlatSteps([
        { type: 'spec', unit: { rep: { id: 'ART.1', product: 'Framed Art' } } },
        { type: 'key', li: 0 },
        { type: 'spec', unit: { rep: { id: 'ORPH', product: 'Window Film (WF)' } } }
      ]);
      if (keep.length !== 3) throw new Error('the export merge touched steps it should not have');
    });

    __check('EXACT BUG: the PDF keys a merged sheet the same way the studio does', () => {
      // Reported: dividers held their place in Deck Studio but some were kicked to the
      // bottom of the generated PDF. The studio keys a spec page 'spec:' + its TITLE;
      // the export keys it 'spec:' + unit.key. Identical for every ordinary page, which
      // is why it went unnoticed — but a merged flat sheet's title is the joined codes
      // while unit.key stays the first one, so the export never emitted the key the
      // divider was pinned to and the end-of-run sweep appended it at the end.
      const el = seed([]);
      el.frames.push({ id: 'W-A', x: 0, y: 4, w: 100, h: 82, active: true, product: 'Window Film (WF)' });
      el.frames.push({ id: 'W-B', x: 120, y: 4, w: 80, h: 82, active: true, product: 'Window Film (WF)' });
      const a = { id: 'W-A', product: 'Window Film (WF)' }, b = { id: 'W-B', product: 'Window Film (WF)' };
      dashProjectData = [a, b];
      const merged = _mergeFlatSteps([
        { type: 'spec', unit: { rep: a, members: [a], key: 'W-A' }, li: 0 },
        { type: 'spec', unit: { rep: b, members: [b], key: 'W-B' }, li: 0 }
      ]);
      if (merged.length !== 1) throw new Error('expected one merged step');
      // The key the export will emit must equal the studio's 'spec:' + merged title.
      if (merged[0]._pageKey !== 'spec:W-A + W-B') throw new Error('export page key is ' + merged[0]._pageKey);
      // unit.key is deliberately NOT rewritten — it also resolves per-page overrides
      // and approval state.
      if (merged[0].unit.key !== 'W-A') throw new Error('unit.key was rewritten, which moves per-page overrides');
      // And the walk must actually prefer it.
      if (S.indexOf('const stepKey = step._pageKey ? step._pageKey :') < 0) {
        throw new Error('the export walk ignores _pageKey, so the pinned divider is still unanchored');
      }
    });

    __check('BOTH page-list builders wire the merge in', () => {
      // Source-level, because the two builders are structurally separate and a fix to
      // one has already silently missed the other twice now.
      const dpl = S.indexOf('function _deckPageList');
      if (S.slice(dpl, dpl + 22000).indexOf('_mergeFlatPages(') < 0) throw new Error('the studio builder does not merge');
      const sf = S.indexOf('const _stepsFor = (u, li) =>');
      if (S.slice(sf, sf + 12000).indexOf('_mergeFlatSteps(') < 0) throw new Error('the export builder does not merge');
      // And the export must merge BEFORE it counts pages, or page numbers and the
      // id-to-page map are built from a list that no longer exists.
      const mg = S.indexOf('_mergeFlatSteps(plan)');
      const cnt = S.indexOf('const idToPage = {};');
      if (mg < 0 || cnt < 0 || mg > cnt) throw new Error('the export merges after it has already numbered the pages');
    });

    __check('EXACT BUG: ghost panel dims do not survive onto the next elevation', () => {
      // Reported as "I made a new elevation for framed artwork but I'm getting ghost
      // measurements from my previous WF elevation". The dim layer was cleared AFTER
      // the no-runs early return, and nothing else clears it — #dim-layer gets wiped by
      // drawElevTargetedSpacing, which is the free ride this layer gave up when it
      // moved out of there.
      __clearDims();
      seed([{ x: 20, y: 4, h: 82, panels: [60, 60] }]);
      elevScale = 2;
      renderGlazingRuns(240, 108);
      if (!__dims().h) throw new Error('nothing was drawn for the wall that HAS glazing');
      // Now a fresh wall with no glazing at all, as clicking "Add Wall" produces.
      elevations.push({ name: 'Elevation 2', wallW: 185, wallH: 108, frames: [], personPos: { x: 0 } });
      currentElevIndex = 1; elevFrames = elevations[1].frames;
      renderGlazingRuns(185, 108);
      const d = __dims();
      if (d.h || d.v) throw new Error('the previous wall\\'s panel dims are still on screen (' + d.h + 'h, ' + d.v + 'v)');
      if (document.querySelectorAll('#glazing-layer .glazing-tag').length) throw new Error('the previous wall\\'s panel tags are still on screen');
    });

    __check('graphics on DIFFERENT walls keep their own sheets', () => {
      const el = seed([]);
      elevations.push({ name: 'W2', wallW: 200, wallH: 108, frames: [], personPos: { x: 0 } });
      el.frames.push({ id: 'A1', x: 0, y: 4, w: 100, h: 82, active: true, product: 'Window Film (WF)' });
      elevations[1].frames.push({ id: 'B1', x: 0, y: 4, w: 100, h: 82, active: true, product: 'Window Film (WF)' });
      const a = { id: 'A1', product: 'Window Film (WF)' }, b = { id: 'B1', product: 'Window Film (WF)' };
      dashProjectData = [a, b];
      const merged = _mergeFlatPages([
        { kind: 'spec', _specTpl: 'egdDetail', row: a }, { kind: 'spec', _specTpl: 'egdDetail', row: b }
      ]);
      if (merged.length !== 2) throw new Error('separate walls were merged into one sheet');
    });

    __check('the merge leaves non-flat pages, and unplaced graphics, alone', () => {
      const el = seed([]);
      el.frames.push({ id: 'A1', x: 0, y: 4, w: 100, h: 82, active: true, product: 'Window Film (WF)' });
      const a = { id: 'A1', product: 'Window Film (WF)' };
      const orphan = { id: 'A9', product: 'Window Film (WF)' };   // on no wall
      dashProjectData = [a, orphan];
      const merged = _mergeFlatPages([
        { kind: 'cover' },
        { kind: 'spec', _specTpl: 'frameRight', row: { id: 'ART.001' } },
        { kind: 'spec', _specTpl: 'egdDetail', row: a },
        { kind: 'spec', _specTpl: 'egdDetail', row: orphan }
      ]);
      if (merged.length !== 4) throw new Error('the merge touched pages it should not have: ' + merged.length);
    });

    __check('EXACT BUG: a divider pinned next to a merged sheet is not sent to the bottom', () => {
      // A spec page's key is 'spec:' + its TITLE, and _mergeFlatPages REWRITES that
      // title on the surviving page to the joined codes. With the merge running AFTER
      // the pin insertion, the key the user pinned to — read off the list they can see —
      // did not exist when the insertion searched for it, and idx < 0 pushed the page
      // to the very bottom of the deck, past Thank You. Reported as: a divider can go
      // BEFORE a run of EGD/WF/ART but never between two graphics sharing a wall.
      const i = S.indexOf('function _deckPageList');
      const body = S.slice(i, i + 22000);
      const mg = body.indexOf('_mergeFlatPages(');
      const pin = body.indexOf("if (p.afterKey === '__start__')");
      if (mg < 0 || pin < 0) throw new Error('could not find the merge and the pin pass');
      if (mg > pin) throw new Error('the merge still runs after the pins, so an anchor on a merged sheet is unfindable');
      // The pin pass must see the merged titles, so the hidden-fixed filter has to move
      // with it — otherwise a pin could anchor to a page that is filtered out later.
      if (body.indexOf('hid0[p.fixed]') < 0) throw new Error('the hidden-fixed filter did not move ahead of the pins');
      // And nothing may re-merge on the way out, which would rename titles again.
      if (body.indexOf('return _mergeFlatPages(') >= 0) throw new Error('the list is merged a second time after pinning');
    });

    __check('the merge runs on the REAL page list, not just when called directly', () => {
      // In Per-piece mode each row is already its own unit, so there is nothing left
      // to group by inside the unit builder — the duplication only becomes visible
      // once the pages exist. That is why this is a post-pass, and it has to be wired.
      const i = S.indexOf('function _deckPageList');
      const body = S.slice(i, i + 22000);
      if (body.indexOf('_mergeFlatPages(') < 0) throw new Error('_deckPageList never merges flat pages');
    });

    __check('EXACT BUG: the schedule states the print HEIGHT once, not on every row', () => {
      // Under dual units each cell reads 28.86"(732.9mm), and printing W x H on every
      // row pushed the two columns straight through each other — unreadable in the PDF.
      // Every artboard in a run is the same height, so it belongs in one place. The
      // table cannot just be widened: its right edge is the spec column, and past that
      // is the elevation.
      const i = S.indexOf('function _drawGlazingSchedule');
      // Widened from 3000 in 16.89: the two-column split for a long schedule made the
      // function longer and pushed the footer out of the window, which read as the footer
      // having been deleted. The window has to hold the whole function, not a guess at it.
      const body = S.slice(i, i + 4400);
      if (body.indexOf("fmt(row.printW) + ' x ' + fmt(row.printH)") >= 0) {
        throw new Error('the per-row cell still carries both dimensions');
      }
      if (body.indexOf('ALL PRINT FILES') < 0) throw new Error('the shared artboard height is not stated anywhere');
      if (body.indexOf("'PRINT W'") < 0) throw new Error('the column header still promises a full size');
      // The height is still available per row for anything that needs it (the CSV does).
      if (S.indexOf("dashFmt(p.printH * toIn)") < 0) throw new Error('the CSV lost the artboard height');
    });

    __check('EXACT BUG: a graphic with NO schedule says why, instead of looking broken', () => {
      // Reported twice as "I'm still missing the H, I, J panel dims". A graphic sitting
      // on lettered window panels with no print-file table beside it reads as a missing
      // table; the honest answer is usually that the row is still set to one file.
      const i = S.indexOf('function _drawFlatPanelSchedule');
      if (i < 0) throw new Error('the schedule helper is gone');
      const body = S.slice(i, i + 1800);
      if (body.indexOf("_glazingScheduleForFrame(el, fr, bl, 'panels')") < 0) {
        throw new Error('nothing checks whether the wall HAS panels under this graphic');
      }
      if (body.indexOf('Set Print Output to Split per window panel') < 0) throw new Error('no explanation is printed');
      // It must never nag about a wall with no glazing at all.
      if (body.indexOf('if (!covered.length) return;') < 0) throw new Error('the note would appear on a wall with no window panels');
      // And it names the panels that WOULD be scheduled, so the letters on the drawing
      // and the letters in the message are the same set.
      if (body.indexOf('covered.map(p => p.label)') < 0) throw new Error('the note does not name the panels');
    });

    __check('EXACT BUG: a live capture WAITS for the prime batch instead of giving up', () => {
      // Reported as the EGD elevation appearing in the PDF sometimes and not others,
      // with the character toggle seemingly involved. Toggling it changes
      // _elevCaptureSignature, which mints a new _igCapKey and starts the 1.5s
      // post-edit prime sweep — so Generate PDF inside that window found every page
      // needing a LIVE capture suppressed, while cached pages came out fine. That is
      // the whole intermittency.
      const i = S.indexOf('async function _igElevCapture');
      if (i < 0) throw new Error('_igElevCapture is gone');
      const body = S.slice(i, i + 2200);
      // It must WAIT on the prime, not just test it. "Don't fight for the #wall
      // element" and "give up" are different answers.
      if (body.indexOf('&& _elevPrimeActive) {') < 0) throw new Error('nothing waits for the prime batch');
      if (body.indexOf('_elevPrimeActive; i++') < 0) throw new Error('the wait is not a loop on the flag');
      // Bounded, so a stuck flag degrades to the old behaviour rather than hanging a
      // build with no way out.
      if (body.indexOf('i < 60') < 0) throw new Error('the wait is unbounded');
      // A cancel still gets out.
      if (body.slice(body.indexOf('&& _elevPrimeActive) {')).indexOf('_pdfCheckCancel') < 0) {
        throw new Error('Cancel cannot interrupt the wait');
      }
      // And the batch may have filled this very key on its way past.
      if (body.indexOf('cap = _igCapCache[capKey] || cap;') < 0) throw new Error('it does not re-read the cache after waiting');
      // The suppressor itself stays: a THUMBNAIL render must still not steal the view.
      if (body.indexOf('!_igNoCapture && !_elevPrimeActive') < 0) throw new Error('the original guard was removed rather than preceded');
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
      + 'window.__indexHtml = ' + JSON.stringify(htmlSrc) + ';\n'
      + 'window.__cssSrc = ' + JSON.stringify(cssSrc) + ';\n' + src + '\n' + testBlock);
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
