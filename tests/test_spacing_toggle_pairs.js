// 20.74 Spacing toggle pairs gaps (harness from test_elev_spacing_all_scope).
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

    // 20.74: Spacing ON with no gap picked dimensions every neighbouring gap.
    const __dimLayer = () => document.getElementById('dim-layer');
    const __spacingOff = () => { __dimLayer().style.display = 'none'; document.getElementById('dimToggle').classList.remove('active'); };
    __check('EXACT ASK: switching Spacing on with no gap picked dimensions every gap', () => {
      __seed(); __spacingOff();
      toggleElevLayer('dim-layer', document.getElementById('dimToggle'));
      const p = __pairs(elevFrames);
      if (!p.has('A-B') || !p.has('B-C')) throw new Error('pairs ' + [...p]);
      if (__spacingDims().length === 0) throw new Error('no spacing dims drawn');
      if (__pairs(elevations[1].frames).size) throw new Error('another wall changed: Spacing on is this wall only');
    });
    __check('a wall with a gap picked keeps exactly its chips', () => {
      __seed(); __spacingOff();
      elevFrames[0].dimTo = ['B'];
      toggleElevLayer('dim-layer', document.getElementById('dimToggle'));
      const p = __pairs(elevFrames);
      if (p.size !== 1 || !p.has('A-B')) throw new Error('pairs ' + [...p]);
    });
    __check('switching Spacing off keeps the pairs, so on again shows the same', () => {
      __seed(); __spacingOff();
      const t = document.getElementById('dimToggle');
      toggleElevLayer('dim-layer', t); const a = __pairs(elevFrames);
      toggleElevLayer('dim-layer', t);
      if (__dimLayer().style.display !== 'none') throw new Error('not hidden');
      toggleElevLayer('dim-layer', t);
      if (!__same(a, __pairs(elevFrames))) throw new Error('pairs changed');
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
