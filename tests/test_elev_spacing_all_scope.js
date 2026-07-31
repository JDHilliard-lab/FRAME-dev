// Auto-spacing magnet, "All elevations" scope: the wall you were looking at
// didn't get its spacing dims.
//
// Reported: on a wall with no spacing yet, hit the magnet, choose "All
// elevations" — nothing happens on screen. Switch to the next wall and the
// spacing dims are there. Switch back to the first wall and NOW they show up.
//
// Cause: applySpacingToAllElevations set the pairs on every elevation
// (including the current one, whose live `elevFrames` IS
// elevations[currentElevIndex].frames) and then called `renderElevation()` to
// redraw. There is no such function anywhere in app.js — the ReferenceError was
// swallowed by the `try {} catch {}` around it, so the DOM was never rebuilt.
// The data was right the whole time; only the view was stale, which is why
// leaving the wall and coming back (that switch redraws) "fixed" it. It also
// skipped pushHistory (no undo) and _syncMagnetBtn (button stayed off).
//
// The "This elevation" scope also carried its own copy of the pairing loop,
// with the vertical neighbour search running in the opposite direction from the
// shared helper — two implementations of the one feature, free to drift.
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

    // Two walls, each with two frames side by side and a third stacked above —
    // so both the horizontal and the vertical neighbour search have something
    // to find. No dimTo anywhere: "no spacing applied yet", the reported state.
    const __wall = (name) => ({
      name: name, wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [
        { letter: 'A', id: name + '-1', x: 20, y: 40, w: 30, h: 24, active: true },
        { letter: 'B', id: name + '-2', x: 80, y: 40, w: 30, h: 24, active: true },
        { letter: 'C', id: name + '-3', x: 80, y: 74, w: 30, h: 24, active: true }
      ]
    });
    const __seed = () => {
      elevUnit = 'in';
      elevations = [__wall('Wall A'), __wall('Wall B')];
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
    // The pairs a frame set holds, direction-independent (either frame may own
    // the entry) — this is what actually gets drawn.
    const __pairs = (frames) => {
      const s = new Set();
      (frames || []).forEach(f => (f.dimTo || []).forEach(l => s.add([f.letter, l].sort().join('-'))));
      return s;
    };
    const __same = (a, b) => a.size === b.size && [...a].every(k => b.has(k));
    const __spacingDims = () => document.querySelectorAll('#dim-layer .arch-dim');

    // ── The bug ──
    __check('EXACT BUG: choosing All elevations draws the spacing on the wall you are looking at', () => {
      __seed();
      if (__spacingDims().length !== 0) throw new Error('the test wall started with spacing dims already drawn');
      toggleAllSpacing('all');
      if (__spacingDims().length === 0) throw new Error('THE BUG: the current wall shows no spacing dims until you leave the elevation and come back');
    });

    __check('the other elevations got it too — that half always worked, keep it', () => {
      __seed();
      toggleAllSpacing('all');
      if (__pairs(elevations[1].frames).size === 0) throw new Error('Wall B got no spacing pairs');
    });

    __check('the current wall stores the same pairs as the others, not fewer', () => {
      __seed();
      toggleAllSpacing('all');
      const a = __pairs(elevations[0].frames), b = __pairs(elevations[1].frames);
      if (a.size === 0) throw new Error('the current wall stored no pairs at all');
      if (!__same(a, b)) throw new Error('Wall A got [' + [...a] + '] but Wall B got [' + [...b] + ']');
    });

    __check('EXACT CAUSE: nothing calls renderElevation, because no such function exists', () => {
      if (typeof renderElevation !== 'undefined') throw new Error('renderElevation exists now — this check is stale, but the redraw must still happen');
      const i = S.indexOf('function applySpacingToAllElevations');
      if (i < 0) throw new Error('applySpacingToAllElevations not found');
      // Comments are stripped: the fix documents the dead call by name, and
      // that note is the reason the bug won't be reintroduced.
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10)).replace(/\\/\\/[^\\n]*/g, '');
      if (/renderElevation\\s*\\(/.test(body)) throw new Error('THE BUG: still calling the non-existent renderElevation(), swallowed by its try/catch');
      if (body.indexOf('drawElevAll(') < 0) throw new Error('the all-elevations scope must redraw through drawElevAll, the same as the single-wall scope');
    });

    __check('the magnet button lights up, so a second click reads as "clear"', () => {
      __seed();
      const btn = document.getElementById('autoSpacingToggle');
      if (!btn) throw new Error('#autoSpacingToggle not found');
      toggleAllSpacing('all');
      if (!btn.classList.contains('active')) throw new Error('the magnet stayed off after applying to all elevations');
    });

    __check('applying to all elevations is undoable', () => {
      __seed();
      undoStack.length = 0; _isFirstHistoryPush = false;
      toggleAllSpacing('all');
      if (undoStack.length === 0) throw new Error('no history snapshot, so undo skips straight past the spacing');
    });

    __check('a second click still clears, and the wall redraws empty', () => {
      __seed();
      toggleAllSpacing('all');
      if (__spacingDims().length === 0) throw new Error('setup failed: no dims to clear');
      toggleAllSpacing();   // no scope: dims exist, so this clears without asking
      if (document.getElementById('spacingScopePopup')) throw new Error('clearing should not ask about scope');
      if (__spacingDims().length !== 0) throw new Error('the spacing dims are still drawn after clearing');
    });

    __check('the scope prompt only appears when there is nothing to clear', () => {
      __seed();
      toggleAllSpacing();
      const p = document.getElementById('spacingScopePopup');
      if (!p) throw new Error('no scope prompt on a wall with no spacing yet');
      if (__pairs(elevFrames).size !== 0) throw new Error('the prompt applied spacing before the user chose a scope');
      p.remove();
    });

    // ── One pairing implementation ──
    __check('both scopes pair the frames identically', () => {
      __seed();
      toggleAllSpacing('one');
      const one = __pairs(elevations[0].frames);
      __seed();
      toggleAllSpacing('all');
      const all = __pairs(elevations[0].frames);
      if (one.size === 0) throw new Error('the single-wall scope paired nothing');
      if (!__same(one, all)) throw new Error('this-elevation gave [' + [...one] + '] but all-elevations gave [' + [...all] + ']');
    });

    __check('the single-wall scope routes through the shared _autoSpacePairs, so the two cannot drift', () => {
      const i = S.indexOf('function toggleAllSpacing');
      if (i < 0) throw new Error('toggleAllSpacing not found');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('_autoSpacePairs(') < 0) throw new Error('toggleAllSpacing no longer uses the shared helper');
      if (/bestGapV/.test(body)) throw new Error('THE DUPLICATE: toggleAllSpacing carries its own copy of the neighbour search again');
    });

    __check('adjacent frames only: A-B side by side and B-C stacked, never the diagonal A-C', () => {
      __seed();
      toggleAllSpacing('all');
      const p = __pairs(elevations[0].frames);
      if (!p.has('A-B')) throw new Error('missed the horizontal gap A-B: [' + [...p] + ']');
      if (!p.has('B-C')) throw new Error('missed the vertical gap B-C: [' + [...p] + ']');
      if (p.has('A-C')) throw new Error('paired the diagonal A-C, which shares no overlap: [' + [...p] + ']');
    });

    __check('the spacing layer is turned on by the all-elevations scope too', () => {
      __seed();
      const dl = document.getElementById('dim-layer');
      dl.style.display = 'none';
      const tb = document.getElementById('dimToggle'); if (tb) tb.classList.remove('active');
      toggleAllSpacing('all');
      if (dl.style.display !== 'block') throw new Error('spacing was applied to every wall while the layer stayed hidden');
      if (tb && !tb.classList.contains('active')) throw new Error('the Spacing layer button disagrees with the layer it controls');
    });

    __check('inactive frames are left out on every wall', () => {
      __seed();
      elevations[1].frames[1].active = false;   // B on Wall B
      toggleAllSpacing('all');
      const p = __pairs(elevations[1].frames);
      if ([...p].some(k => k.indexOf('B') >= 0)) throw new Error('paired an inactive frame: [' + [...p] + ']');
    });
  `;

  try {
    window.eval(
      'window.__appSrc = ' + JSON.stringify(src) + ';\n' +
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
