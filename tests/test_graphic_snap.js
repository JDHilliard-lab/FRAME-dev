// 19.79: the measure and line tools "see the pixels in the graphic". Asked on the Ford
// timeline wall: "I want to measure the distance from the 1938 text which is on the
// wallpaper graphic from the didactic panel (ART.3A) ... click the pixel and then click an
// object like a frame or didactic panel", plus dashed notes marking objects in the graphic
// and "a tool that we could place as an empty to guide us in building the spacing".
// A synthetic wallcovering: light grey with a dark block (the printed 1938) whose bottom
// edge sits 1" above the panel's top.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    const PPI = 10, WW = 272, WH = 96.5;
    const URL = 'data:image/png;base64,FAKEWALLCOVERING';
    // The graphic: the "1938" block spans x 3.25..14.25 in, from 51.6 up to 54.75 in
    // above the graphic's bottom.
    const mkPix = () => {
      const w = WW * PPI, h = Math.round(WH * PPI), L = new Uint8Array(w * h).fill(215);
      const x0 = 3.25 * PPI, x1 = 14.25 * PPI, yb = h - 51.6 * PPI, yt = h - 54.75 * PPI;
      for (let y = Math.round(yt); y < Math.round(yb); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) L[y * w + x] = 60;
      return { w, h, L };
    };
    const seed = (bb) => {
      elevUnit = 'in'; dashUnit = 'in'; elevBaseboardIn = 4;
      const wc = { id: 'ART.3', letter: 'I', product: 'Wallcovering (EGD)', x: 0, y: bb, w: WW, h: WH, active: true, dimTo: [], artworkUrl: URL, artZoom: 1, artPanX: 0, artPanY: 0 };
      const panel = { id: 'ART.3A', letter: 'J', product: 'Didactic Panel', x: 3.25, y: bb + 44.1, w: 21.5, h: 6.5, active: true, dimTo: [] };
      elevations = [{ id: 'w', name: 'TIMELINE WALL', wallW: WW, wallH: WH + bb, egdWall: true, frames: [wc, panel] }];
      if (!bb) elevations[0].baseboard = false;
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      try { drawElevAll(); } catch (e) {}
      elevResolvedWallW = WW; elevResolvedWallH = WH + bb; elevScale = 5;
      _gfxPix.set(_gfxKey(URL), mkPix());
    };
    const textBottom = (bb) => 51.6 + bb;

    __check('EXACT ASK: a click near the bottom of the printed 1938 lands ON that edge in the graphic, not on the panel corner 1" below', () => {
      seed(4);
      const a = _elevSnapPoint(8, textBottom(4) + 0.4);      // 2px above the edge at 5 px/in
      if (!a) throw new Error('nothing snapped');
      if (a._kind !== 'gfx') throw new Error('snapped to ' + a._kind + ' ' + (a.letter || '') + ' instead of the graphic');
      if (Math.abs(a.y - textBottom(4)) > 0.11) throw new Error('edge at ' + a.y.toFixed(2) + ', text bottom ' + textBottom(4));
      if (a.letter !== 'I' || a.xc !== 'xf' || a.yc !== 'yf') throw new Error('not kept on the graphic: ' + JSON.stringify(a));
    });
    __check('EXACT ASK: then a click near the panel top lands on its edge, straight below, not at a corner', () => {
      seed(4);
      const p = elevFrames[1], top = p.y + p.h;
      const b = _elevSnapPoint(8, top - 0.6);
      if (!b || b.letter !== 'J' || b.yc !== 'y1' || b.xc !== 'xf') throw new Error('got ' + JSON.stringify(b));
      const r = resolveAnchor(stripAnchor(b));
      if (Math.abs(r.x - 8) > 0.01 || Math.abs(r.y - top) > 0.01) throw new Error('resolved to ' + r.x + ',' + r.y);
    });
    __check('the measure tool builds that line, and it reads text-to-panel (1")', () => {
      seed(4);
      const keep = eventToElevInches;
      eventToElevInches = (e) => e.__pt;
      lineToolActive = true; lineToolFirstAnchor = null;
      const ev = (x, y) => ({ __pt: { x, y }, preventDefault() {}, stopPropagation() {} });
      try { handleLineToolClick(ev(8, textBottom(4) + 0.4)); handleLineToolClick(ev(8, elevFrames[1].y + elevFrames[1].h - 0.6)); }
      finally { eventToElevInches = keep; lineToolActive = false; }
      const L = elevations[0].customLines[elevations[0].customLines.length - 1];
      if (!L || L.type !== 'v') throw new Error('no vertical line: ' + JSON.stringify(L));
      const pa = resolveStoredAnchor(L.a), pb = resolveStoredAnchor(L.b);
      const gap = Math.abs(pa.y - pb.y);
      if (Math.abs(gap - 1) > 0.11) throw new Error('measures ' + gap.toFixed(2));
      if (!L.a.gfx) throw new Error('the graphic end is not marked as one');
    });
    __check('a point picked on the graphic moves with it (the wall loses its baseboard)', () => {
      seed(4);
      const a = stripAnchor(_elevSnapPoint(8, textBottom(4) + 0.4));
      elevFrames[0].y = 0;                          // the wallcovering drops to the floor
      const r = resolveAnchor(a);
      if (Math.abs(r.y - textBottom(0)) > 0.11) throw new Error('stayed at ' + r.y.toFixed(2));
    });
    __check('Alt places a point exactly where clicked', () => {
      seed(4);
      if (_elevSnapPoint(8, textBottom(4) + 0.4, { altKey: true }) !== null) throw new Error('Alt still snapped');
    });
    __check('a level line snaps to an edge in the graphic', () => {
      seed(4);
      const keep = eventToElevInches; eventToElevInches = (e) => e.__pt;
      try {
        const at = _markAxisAt({ __pt: { x: 8, y: textBottom(4) + 0.4 } }, 'y');
        if (Math.abs(at.v - textBottom(4)) > 0.11) throw new Error('level at ' + at.v);
        if (!at.anchor.gfx) throw new Error('not attached to the graphic');
      } finally { eventToElevInches = keep; }
    });
    __check('EXACT ASK: a Guide box is an empty to space against: never prints, and frames snap to its edges', () => {
      seed(4);
      elevations[0].marks = [{ id: 'mk1', kind: 'box', a: { ref: 'free', x: 30, y: 40 }, b: { ref: 'free', x: 34, y: 60 }, dash: true, guide: true, arrow: 'none' }];
      renderMarks();
      const wrap = document.querySelector('#mark-layer [data-mark-id="mk1"]');
      if (!wrap) throw new Error('not drawn');
      if (wrap.getAttribute('data-export-skip') !== '1') throw new Error('a guide would print');
      if (!wrap.innerHTML.includes('<rect')) throw new Error('not drawn as a box');
      const T = _elevSnapTargets({});
      if (!T.xTargets.some(t => t.kind === 'guide-right' && t.value === 34)) throw new Error('its right edge is no snap target');
      if (!T.yTargets.some(t => t.kind === 'guide-top' && t.value === 60)) throw new Error('its top is no snap target');
      elevations[0].marks[0].guide = false; renderMarks();
      if (document.querySelector('#mark-layer [data-mark-id="mk1"]').getAttribute('data-export-skip')) throw new Error('Guide only off still skips the export');
      if (!MARK_KINDS.some(k => k[0] === 'box')) throw new Error('not offered in the Lines menu');
    });
  `;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
