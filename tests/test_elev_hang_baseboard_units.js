// Hang height and baseboard hold their real value across a unit change.
//
// The reported bug, verbatim: "I noticed when I opened projects my Hang Height and
// Baseboard changes this is due to me opening a project that started in in and
// opening it in a new project when I have it in cm."
//
// Two separate faults produced it, both from the same cause — the values lived
// ONLY in their DOM inputs, in whatever unit happened to be current:
//   1. loadMasterProject set elevUnit straight from the file and never touched the
//      inputs. Open an inches project while the app sits in cm and the 144.78 in
//      the box is read as 144.78 INCHES. (They were never saved either, so the
//      drawing silently inherited the previous project's numbers.)
//   2. setElevUnit multiplied the input and rounded to 2dp, so 57" drifted a little
//      on every toggle.
//
// The fix stores INCHES and derives the display, which also makes the standards
// exact in every unit: 57" / 144.78cm / 1447.8mm and 4" / 10.16cm / 101.6mm.
// A custom height stays custom — 60" is still 60" (152.4cm), the standard is the
// default and what the reset buttons snap back to.
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
    const S = window.__appSrc, H = window.__htmlSrc;
    const __hangBox = () => document.getElementById('hangHeight');
    const __baseBox = () => document.getElementById('baseboardHeight');

    const __seed = (unit) => {
      elevUnit = unit || 'in'; dashUnit = elevUnit;
      elevHangIn = ELEV_STD_HANG_IN; elevBaseboardIn = ELEV_STD_BASEBOARD_IN;
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [
        { letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true }
      ] }];
      currentElevIndex = 0; currentView = 'elevation'; elevFrames = elevations[0].frames;
      seedHangBaseboardInputs();
    };

    // ── The standards ──
    __check('EXACT REQUEST: 57in shows as 57 / 144.78 / 1447.8 and 4in as 4 / 10.16 / 101.6', () => {
      const want = { in: ['57', '4'], cm: ['144.78', '10.16'], mm: ['1447.8', '101.6'] };
      Object.keys(want).forEach(u => {
        __seed(u);
        const h = __hangBox().value, b = __baseBox().value;
        if (h !== want[u][0]) throw new Error('hang height in ' + u + ' reads ' + h + ', expected ' + want[u][0]);
        if (b !== want[u][1]) throw new Error('baseboard in ' + u + ' reads ' + b + ', expected ' + want[u][1]);
      });
      __seed('in');
    });

    __check('the display rounds to 2dp, NOT to the unit display precision', () => {
      // unitInfo('cm').decimals is 1, which would print the standard as 144.8.
      // This is a box the user types into, not a dimension on the drawing.
      if (unitInfo('cm').decimals >= 2) throw new Error('this check assumes cm displays dimensions at under 2dp');
      __seed('cm');
      if (__hangBox().value !== '144.78') throw new Error('cm hang height reads ' + __hangBox().value);
      __seed('in');
    });

    // ── The reported bug ──
    __check('EXACT BUG: opening an inches project while the app is in cm keeps 57in', () => {
      __seed('cm');
      if (__hangBox().value !== '144.78') throw new Error('setup: cm should read 144.78, got ' + __hangBox().value);
      // The load path, minus the file read: an inches project with the standards.
      elevUnit = 'in'; dashUnit = 'in';
      elevHangIn = 57; elevBaseboardIn = 4;
      seedHangBaseboardInputs();
      if (getHangHeight() !== 57) throw new Error('THE BUG: getHangHeight() is ' + getHangHeight() + ' in inches, so the drawing hangs at the cm number');
      if (getBaseboardHeight() !== 4) throw new Error('baseboard is ' + getBaseboardHeight() + ' in inches');
      if (__hangBox().value !== '57') throw new Error('the input still shows ' + __hangBox().value);
      __seed('in');
    });

    __check('EXACT BUG: the other direction too — a cm project opened from inches', () => {
      __seed('in');
      elevUnit = 'cm'; dashUnit = 'cm';
      elevHangIn = 57; elevBaseboardIn = 4;
      seedHangBaseboardInputs();
      if (Math.abs(getHangHeight() - 144.78) > 0.001) throw new Error('getHangHeight() is ' + getHangHeight() + ' in cm');
      if (__hangBox().value !== '144.78') throw new Error('the input shows ' + __hangBox().value);
      __seed('in');
    });

    __check('the load path really does reseed the inputs and default a project that never saved them', () => {
      const i = S.indexOf('function loadMasterProject');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('seedHangBaseboardInputs()') < 0) throw new Error('loadMasterProject does not reseed the inputs, which IS the bug');
      if (body.indexOf('ELEV_STD_HANG_IN') < 0) throw new Error('a project saved before hangHeightIn existed would inherit the previous project’s value');
      // And a save has to carry them, in inches, or a reopened project is a guess.
      const j = S.indexOf('function saveMasterProject');
      const sBody = S.slice(j, S.indexOf('\\nfunction ', j + 10));
      if (sBody.indexOf('hangHeightIn') < 0 || sBody.indexOf('baseboardIn') < 0) throw new Error('the project JSON does not carry the hang height / baseboard');
    });

    // ── Unit toggling ──
    __check('EXACT BUG: repeated unit toggles do not drift the standard', () => {
      __seed('in');
      for (let n = 0; n < 8; n++) { setElevUnit('cm'); setElevUnit('mm'); setElevUnit('in'); }
      if (__hangBox().value !== '57') throw new Error('after 24 unit switches the hang height reads ' + __hangBox().value);
      if (__baseBox().value !== '4') throw new Error('after 24 unit switches the baseboard reads ' + __baseBox().value);
      if (elevHangIn !== 57) throw new Error('the stored inches drifted to ' + elevHangIn);
    });

    __check('the unit conversion pass no longer multiplies these two inputs', () => {
      // It is what rounded 57 -> 144.78 -> 57.00 and back, a little off each time.
      // setElevUnit / setDashUnit are both thin wrappers; setUnit does the work.
      const i = S.indexOf('function setUnit');
      if (i < 0) throw new Error('setUnit not found');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/\\['hangHeight', null\\]|\\['baseboardHeight', null\\]/.test(body)) throw new Error('hangHeight/baseboardHeight are still in the multiply-the-input list');
      if (body.indexOf('seedHangBaseboardInputs()') < 0) throw new Error('setUnit does not re-derive the two inputs from the stored inches');
    });

    __check('the inputs are labelled with the unit they are showing', () => {
      // 144.78 in an unlabelled box is exactly what made this look like corruption.
      __seed('cm');
      const l = document.getElementById('hangHeightUnitLabel');
      const b = document.getElementById('baseboardUnitLabel');
      if (!l || !b) throw new Error('no unit labels beside the two inputs');
      if (l.textContent !== '(cm)') throw new Error('the hang height label reads ' + l.textContent + ' in cm');
      __seed('mm');
      if (l.textContent !== '(mm)') throw new Error('the label reads ' + l.textContent + ' in mm');
      __seed('in');
      if (l.textContent !== '(in)') throw new Error('the label reads ' + l.textContent + ' in inches');
    });

    // ── A custom value is still custom ──
    __check('a custom hang height is NOT forced back to the standard', () => {
      // The studio hangs at 60 as well as 57; the rule is that the value keeps its
      // meaning across units, not that it is locked to one number.
      __seed('in');
      __hangBox().value = '60'; updateHangHeight();
      if (elevHangIn !== 60) throw new Error('typing 60 stored ' + elevHangIn + ' inches');
      setElevUnit('cm');
      if (__hangBox().value !== '152.4') throw new Error('60in became ' + __hangBox().value + 'cm');
      if (Math.abs(getHangHeight() - 152.4) > 0.001) throw new Error('getHangHeight() is ' + getHangHeight() + ' in cm');
      setElevUnit('in');
      if (__hangBox().value !== '60') throw new Error('came back as ' + __hangBox().value);
      __seed('in');
    });

    __check('typing in the box in ANY unit stores the right inches', () => {
      __seed('cm');
      __baseBox().value = '15.24'; updateBaseboard();
      if (Math.abs(elevBaseboardIn - 6) > 0.001) throw new Error('15.24cm stored ' + elevBaseboardIn + ' inches');
      __seed('mm');
      __hangBox().value = '1524'; updateHangHeight();
      if (Math.abs(elevHangIn - 60) > 0.001) throw new Error('1524mm stored ' + elevHangIn + ' inches');
      __seed('in');
    });

    __check('the inputs are wired to the handlers that store inches, not to a bare redraw', () => {
      // oninput="drawElevAll()" would redraw from a value nothing had stored.
      if (!/id="hangHeight"[^>]*oninput="updateHangHeight\\(\\)"/.test(H)) throw new Error('the hang height input does not call updateHangHeight()');
      if (!/id="baseboardHeight"[^>]*oninput="updateBaseboard\\(\\)"/.test(H)) throw new Error('the baseboard input does not call updateBaseboard()');
    });

    __check('a blank or nonsense entry falls back rather than zeroing the drawing', () => {
      __seed('in');
      ['', 'abc', '-5'].forEach(v => {
        __hangBox().value = v; updateHangHeight();
        if (!(getHangHeight() > 0)) throw new Error('"' + v + '" left the hang height at ' + getHangHeight());
      });
      // Baseboard 0 is legitimate — it means no baseboard.
      __baseBox().value = '0'; updateBaseboard();
      if (getBaseboardHeight() !== 0) throw new Error('0 should mean no baseboard, got ' + getBaseboardHeight());
      __seed('in');
    });

    // ── The reset buttons ──
    __check('the reset buttons snap back to the standard in the active unit', () => {
      __seed('cm');
      elevHangIn = 61; elevBaseboardIn = 9; seedHangBaseboardInputs();
      resetHangHeightToStandard();
      if (elevHangIn !== ELEV_STD_HANG_IN) throw new Error('reset stored ' + elevHangIn + ' inches');
      if (__hangBox().value !== '144.78') throw new Error('reset in cm shows ' + __hangBox().value);
      resetBaseboardToStandard();
      if (__baseBox().value !== '10.16') throw new Error('baseboard reset in cm shows ' + __baseBox().value);
      if (!/resetHangHeightToStandard\\(\\)/.test(H) || !/resetBaseboardToStandard\\(\\)/.test(H)) throw new Error('the reset buttons are not in the panel');
      __seed('in');
    });

    __check('the studio standards are named constants, not literals scattered about', () => {
      if (ELEV_STD_HANG_IN !== 57) throw new Error('ELEV_STD_HANG_IN is ' + ELEV_STD_HANG_IN);
      if (ELEV_STD_BASEBOARD_IN !== 4) throw new Error('ELEV_STD_BASEBOARD_IN is ' + ELEV_STD_BASEBOARD_IN);
      const i = S.indexOf('function getHangHeight');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('ELEV_STD_HANG_IN') < 0) throw new Error('getHangHeight still hardcodes its fallback');
      if (body.indexOf("getElementById('hangHeight')") >= 0) throw new Error('getHangHeight still reads the DOM, so the input is a second source of truth');
    });

    // ── Undo / autosave ──
    __check('the value survives undo, autosave and the version history', () => {
      // All three go through snapshotProjectState. It carries INCHES, so an undo
      // across a unit switch cannot restore a number that means something else now.
      __seed('in');
      __hangBox().value = '62'; updateHangHeight();
      const snap = snapshotProjectState();
      if (snap.hangHeightIn !== 62) throw new Error('the snapshot holds ' + snap.hangHeightIn);
      elevHangIn = 57; setElevUnit('cm');
      restoreProjectState(snap);
      if (elevHangIn !== 62) throw new Error('restore gave ' + elevHangIn + ' inches');
      if (__hangBox().value !== '157.48') throw new Error('the input after restore in cm reads ' + __hangBox().value);
      __seed('in');
    });

    __check('a snapshot from before these were in the format leaves the live value alone', () => {
      __seed('in');
      __hangBox().value = '58'; updateHangHeight();
      restoreProjectState({ dashProjectData: [], elevations: elevations, currentElevIndex: 0, editorial: editorialContent });
      if (elevHangIn !== 58) throw new Error('an old snapshot reset the hang height to ' + elevHangIn);
      __seed('in');
    });

    // ── The capture cache ──
    __check('a unit switch alone does not invalidate every elevation capture', () => {
      // The signature used to hash the INPUT TEXT. Switching units rewrites that
      // text without the drawing changing shape, so every breaker and install page
      // recaptured — a view switch plus SVG plus rasterize, per page, for nothing.
      const i = S.indexOf('function _elevCaptureSignature');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/g\\('hangHeight'\\)/.test(body)) throw new Error('the signature still hashes the hang height INPUT rather than the stored inches');
      if (body.indexOf('elevHangIn') < 0) throw new Error('the signature does not hash the stored hang height at all, so a change to it would keep a stale drawing');
      // It must still notice a real change (pinned end-to-end in test_elev_capture_cache.js).
      __seed('in');
      const a = _elevCaptureSignature();
      elevHangIn = 60;
      if (_elevCaptureSignature() === a) throw new Error('changing the hang height did not change the signature');
      __seed('in');
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
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
