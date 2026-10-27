// 19.82: "one of the two dashed lines ends up being missing ... maybe the spacer tool should
// have a drop down menu if it should add a measure line" and "I should include the person
// as an option to hide per page". Same wall as test_wall_coordination (19.80 notes below).
//  * "it would be nice if one of the line options could be a spacer ... a dimension on it
//    that you can type in ... attached to the edge of the frame or didactic panel and
//    you measuring lines could snap to it"
//  * "some times I want to flip the side the numbers land"
//  * "an option where the white boxes are not behind the numbers, but still need lines
//    not to be seen if they end up landing behind a the numbered measurement ... Or ...
//    fade the mural to a certain opacity"
//  * "maybe we do a zoom into the elevation along 1, 2, 3 pages so the numbers look right size"
//  * "when I click a frame or didactic panel then I click the graphic ... I could see the
//    other dashed line" (the leader to the point on the graphic was never drawn)
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
    const mkPix = () => {
      const w = WW * PPI, h = Math.round(WH * PPI), L = new Uint8Array(w * h).fill(215);
      const x0 = 3.25 * PPI, x1 = 14.25 * PPI, yb = h - 51.6 * PPI, yt = h - 54.75 * PPI;
      for (let y = Math.round(yt); y < Math.round(yb); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) L[y * w + x] = 60;
      return { w, h, L };
    };
    // Wallcovering I, panel J (3.25..24.75 x 44.1..50.6), frames K and M further along.
    const seed = () => {
      elevUnit = 'in'; dashUnit = 'in';
      const wc = { id: 'ART.3', letter: 'I', product: 'Wallcovering (EGD)', x: 0, y: 0, w: WW, h: WH, active: true, dimTo: [], artworkUrl: URL, artZoom: 1, artPanX: 0, artPanY: 0 };
      const panel = { id: 'ART.3A', letter: 'J', product: 'Didactic Panel', x: 3.25, y: 44.1, w: 21.5, h: 6.5, active: true, dimTo: [] };
      const k = { id: 'ART.2A', letter: 'K', product: 'Framed Art', x: 80, y: 40, w: 30, h: 30, active: true, dimTo: [] };
      const m = { id: 'ART.2B', letter: 'M', product: 'Framed Art', x: 170, y: 40, w: 30, h: 30, active: true, dimTo: [] };
      elevations = [{ id: 'w', name: 'TIMELINE WALL', wallW: WW, wallH: WH, egdWall: true, baseboard: false, frames: [wc, panel, k, m] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      try { drawElevAll(); } catch (e) {}
      elevResolvedWallW = WW; elevResolvedWallH = WH; elevScale = 5;
      _gfxPix.set(_gfxKey(URL), mkPix());
    };
    const ev = (x, y, extra) => Object.assign({ __pt: { x, y }, preventDefault() {}, stopPropagation() {} }, extra || {});
    const withPt = (fn) => { const keep = eventToElevInches; eventToElevInches = (e) => e.__pt; try { return fn(); } finally { eventToElevInches = keep; } };

    const makeSpacer = () => withPt(() => {
      markToolActive = true; markKind = 'spacer'; markFirstAnchor = null; markSpacerSize = 1;
      handleMarkToolClick(ev(12, 44.1 - 0.4));    // on the panel's bottom edge, at x 12
      handleMarkToolClick(ev(12, 40));            // below it
      const ms = elevations[0].marks || [];
      return ms[ms.length - 1];
    });
    const leaders = () => Array.from(document.querySelectorAll('#custom-lines-layer .dim-leader'));
    const num = (st, k) => parseFloat((st.split(k + ':')[1] || '').trim());

    __check('EXACT ASK: spacer to panel, number pulled aside over the panel: BOTH extension lines, each from its clicked point', () => {
      seed();
      const m = makeSpacer();
      const sa = stripAnchor(_elevSnapPoint(8, 43.1 - 0.4));
      const pa = { ref: 'frame', letter: 'J', xc: 'xf', xf: (8 - 3.25) / 21.5, yc: 'y0' };
      elevations[0].customLines = [{ id: 'c1', type: 'v', a: sa, b: pa, off: 5 }];
      dimVisibility.customLines = true;
      renderCustomLines();
      const ls = leaders();
      if (ls.length !== 2) throw new Error(ls.length + ' leaders (want 2)');
      ls.forEach(l => { const st = l.getAttribute('style'); if (Math.abs(num(st, 'left') - 8 * elevScale) > 0.05) throw new Error('not from the clicked x: ' + st); });
    });
    __check('frame to frame lines keep the edge rule (no dashes beside a printed edge)', () => {
      seed();
      const ka = { ref: 'frame', letter: 'K', xc: 'xf', xf: 0.5, yc: 'y1' };
      const ma = { ref: 'frame', letter: 'M', xc: 'xf', xf: 0.5, yc: 'y1' };
      elevations[0].customLines = [{ id: 'c2', type: 'h', a: ka, b: ma, off: -5 }];   // 5" down, inside both frames
      dimVisibility.customLines = true;
      renderCustomLines();
      if (leaders().length !== 0) throw new Error(leaders().length + ' leaders between two frames');
    });
    __check('EXACT ASK: Dimension on a spacer adds a measure line across the gap at the clicked point, and takes it away again', () => {
      seed();
      const m = makeSpacer();
      toggleSpacerDim(m.id);
      const L = (elevations[0].customLines || [])[0];
      if (!L || L.type !== 'v' || L.a.mid !== m.id || L.b.mid !== m.id) throw new Error('no spacer dimension: ' + JSON.stringify(L));
      const pa = resolveStoredAnchor(L.a), pb = resolveStoredAnchor(L.b);
      if (Math.abs(pa.x - 12) > 0.01 || Math.abs(pb.x - 12) > 0.01) throw new Error('not at the clicked x: ' + pa.x + ', ' + pb.x);
      if (Math.abs(Math.abs(pa.y - pb.y) - 1) > 0.01) throw new Error('does not span the gap: ' + pa.y + ' to ' + pb.y);
      L.off = 6; dimVisibility.customLines = true; renderCustomLines();
      if (leaders().length !== 2) throw new Error(leaders().length + ' leaders once pulled aside (want 2)');
      setMarkField(m.id, 'size', 2);
      const pb2 = resolveStoredAnchor(L.b), pa2 = resolveStoredAnchor(L.a);
      if (Math.abs(Math.abs(pa2.y - pb2.y) - 2) > 0.01) throw new Error('did not follow a new size');
      toggleSpacerDim(m.id);
      if ((elevations[0].customLines || []).length) throw new Error('second press did not remove it');
    });
    __check('deleting a spacer takes its dimension with it, and only its own', () => {
      seed();
      const m = makeSpacer();
      toggleSpacerDim(m.id);
      elevations[0].customLines.push({ id: 'other', type: 'h', a: { ref: 'frame', letter: 'K', xc: 'x0', yc: 'y0' }, b: { ref: 'frame', letter: 'M', xc: 'x0', yc: 'y0' }, off: 0 });
      deleteMark(m.id);
      const ids = (elevations[0].customLines || []).map(l => l.id);
      if (ids.length !== 1 || ids[0] !== 'other') throw new Error('left: ' + ids.join(','));
    });

    // ── HIDE PER PAGE ─────────────────────────────────────────────────────────
    __check('EXACT ASK: the scale figure can be hidden on one page, and only that page', () => {
      seed();
      setIgPageHide('elev:0', 'person', true);
      if (_igCfg('elev:0').hideGuides.join() !== 'person') throw new Error('not stored: ' + JSON.stringify(_igCfg('elev:0').hideGuides));
      if ((_igCfg('elev:1').hideGuides || []).length) throw new Error('reached another page');
      setIgPageHide('elev:0', 'person', false);
      if (((editorialContent.installGuide.perPage || {})['elev:0'])) throw new Error('an empty shell was left behind');
    });
    __check('a page key only takes the things that can be hidden', () => {
      setIgPageHide('elev:0', 'nonsense', true);
      if (((editorialContent.installGuide.perPage || {})['elev:0'])) throw new Error('stored an unknown key');
    });
  
    window.__hideTest = (async () => {
      const r = [];
      const ck = async (label, fn) => { try { await fn(); r.push({ label, ok: true }); } catch (e) { r.push({ label, ok: false, err: e.message }); } };
      ['person-wrap', 'dim-layer', 'mark-layer'].forEach(id => { const l = document.getElementById(id); if (l) l.style.display = 'block'; });
      const cap = { allGuides: true, dataUrl: 'data:image/jpeg;base64,AAAA', w: 200, h: 100, pad: { left: 4, safe: 2 },
        boxes: { wall: [20, 10, 190, 90], person: [2, 20, 14, 90], 'dim-layer': [20, 10, 190, 90] },
        person: { png: 'data:image/png;base64,AAAA', box: [2, 20, 14, 90] },
        vec: { w: 200, h: 100, ops: [ { t: 'line', gl: 'dim-layer', x1: 30, y1: 50, x2: 60, y2: 50 }, { t: 'line', gl: 'mark-layer', x1: 30, y1: 60, x2: 60, y2: 60 }, { t: 'line', x1: 20, y1: 90, x2: 190, y2: 90 } ] } };
      const shown = await _capView(cap);
      const hid = await _capView(cap, ['person', 'mark-layer']);
      await ck('a hidden figure leaves the page (and its box no longer holds the crop open)', () => {
        if (!shown.person) throw new Error('the figure is not shown when nothing is hidden');
        if (hid.person) throw new Error('the figure is still on the page');
      });
      await ck('a hidden guide drops its lines and nothing else', () => {
        if (hid.vec.ops.some(o => o.gl === 'mark-layer')) throw new Error('free lines still drawn');
        if (!hid.vec.ops.some(o => o.gl === 'dim-layer')) throw new Error('spacing went too');
        if (hid.vec.ops.length !== 2) throw new Error(hid.vec.ops.length + ' ops');
      });
      await ck('the page preview is keyed on what it hides', () => {
        const d = { kind: 'spec', _install: true, _ovKey: 'elev:0', _elevIdx: 0, title: 'W' };
        const k0 = _dsThumbCacheKey(d);
        setIgPageHide('elev:0', 'person', true);
        const k1 = _dsThumbCacheKey(d);
        setIgPageHide('elev:0', 'person', false);
        if (k0 === k1) throw new Error('same key: ' + k0);
      });
      await ck('the install page renderer passes this page hide list to the crop', () => {
        if (window.__SRC.indexOf('await _capView(_capRes.cap, cfg.hideGuides)') < 0) throw new Error('not passed');
      });
      return r;
    })();
  `;
  window.__SRC = src;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const extra = await window.__hideTest;
  const all = (window.__testResults || []).concat(extra || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
