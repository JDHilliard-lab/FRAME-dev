// 19.05: frame shadows true to size on the wall, the drop shadow on breaker and
// install pages, the elevation tool dock, and the sidebar tabs as categories.
//
// Asked: "can we make sure the frame shadow effects show up in the elevation breaker
// pages, the shadow effects look good in the spec pages. also, the dropshadow in the
// elevation tab look really spread out, can we make it more accurate to the frame
// settings set by designers." Then: make Art / Guides / Context / Glass stand out as
// categories, and move the Add & Arrange tools, the keyboard shortcuts and the measure
// tool into a vertical bar left of the elevation, like Deck Studio's.
//
// THE SPREAD-OUT SHADOW: every shadow on the wall was written as N * elevScale, and
// elevScale is px per INCH, so the drop shadow was a 16" drop under a 40" blur and the
// frame cast 10" of blur onto the mat. The canvas renderer (PNG export, spec pages) uses
// the same recipes in px at 72 dpi. Now the wall uses those recipes in real inches.
// THE BREAKER SHADOW: exportElevSVG draws frames at pad 0 with the outer shadow off, so
// the PDF capture had nowhere to put one; spec pages draw a separate shadow image. The
// capture now draws that same image (_frameShadowCanvas) under the frames.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(4), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc, H = window.__indexHtml;
    scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
    const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const frame = (o) => Object.assign({ id: 'ART.1', letter: 'A', w: 24, h: 30, fW: 1.25, fType: 'color', fColor: '#111111',
      product: 'Framed Art', m1T: 3, m1B: 3, m1L: 3, m1R: 3, m1A: true, m2: 0, m2A: false, x: 40, y: 40,
      active: true, dimTo: [], distToggles: { ceiling: false, floor: false, left: false, right: false } }, o || {});
    const seed = (unit, frames, extra) => {
      elevUnit = unit; dashUnit = unit;
      const k = unitFactor('in', unit);
      elevations = [Object.assign({ name: 'Lobby', wallW: 150 * k, wallH: 108 * k, frames: frames.map(f => Object.assign({}, f, {
        w: f.w * k, h: f.h * k, fW: f.fW * k, x: f.x * k, y: f.y * k, m1T: f.m1T * k, m1B: f.m1B * k, m1L: f.m1L * k, m1R: f.m1R * k })),
        personPos: { x: -60 } }, extra || {})];
      currentElevIndex = 0; elevFrames = elevations[0].frames; elevZoomFactor = 1;
      const ww = document.getElementById('wallW'), wh = document.getElementById('wallH');
      if (ww) ww.value = String(150 * k); if (wh) wh.value = String(108 * k);
      const ws = document.querySelector('#view-elevation .workspace');
      Object.defineProperty(ws, 'clientWidth', { get: () => 1100, configurable: true });
      Object.defineProperty(ws, 'clientHeight', { get: () => 800, configurable: true });
      drawElevAll();
    };
    const pxNums = (s) => (String(s || '').match(/-?[0-9.]+px/g) || []).map(parseFloat);
    const ppi = () => elevScale * unitFactor('in', elevUnit);

    ['in', 'cm'].forEach(unit => {
      __check('EXACT ASK (' + unit + '): the drop shadow on the wall is the 72-dpi recipe in real inches, not inches of blur', () => {
        seed(unit, [frame()]);
        const el = document.querySelector('#frame-layer .frame-vis');
        if (!el) throw new Error('no frame drawn');
        const n = pxNums(el.style.boxShadow);
        if (!n.length) throw new Error('no shadow at all: ' + el.style.boxShadow);
        const blurIn = n[n.length - 1] / ppi(), dropIn = n[n.length - 2] / ppi();
        if (Math.abs(blurIn - 35 / 72) > 0.01) throw new Error('blur is ' + blurIn.toFixed(2) + ' in, expected ' + (35 / 72).toFixed(2) + ' (it was 40 in)');
        if (Math.abs(dropIn - 18 / 72) > 0.01) throw new Error('drop is ' + dropIn.toFixed(2) + ' in, expected 0.25');
      });
    });
    __check('the frame onto the mat is under an inch too (it was 10 in of blur)', () => {
      seed('in', [frame()]);
      const m = document.querySelector('#frame-layer .mat-visual');
      if (!m) throw new Error('no mat drawn');
      const n = pxNums(m.style.boxShadow);
      if (!n.length || n.some(v => v > ppi())) throw new Error('a mat shadow is over an inch: ' + m.style.boxShadow + ' at ' + ppi().toFixed(2) + ' px/in');
      if (m.style.boxShadow.indexOf('inset') < 0) throw new Error('the frame no longer casts onto the mat');
    });
    __check('the Frame effects strength still reaches the wall', () => {
      const prev = frameFx.outer; frameFx.outer = 2;
      try {
        seed('in', [frame()]);
        const n = pxNums(document.querySelector('#frame-layer .frame-vis').style.boxShadow);
        const blurIn = n[n.length - 1] / ppi();
        if (Math.abs(blurIn - 35 / 72 * 1.4) > 0.01) throw new Error('200% did not deepen the shadow: ' + blurIn);
      } finally { frameFx.outer = prev; }
    });
    __check('with artwork, the opening still casts onto the picture (the picture used to cover it)', () => {
      seed('in', [frame({ artworkUrl: PNG1, artworkW: 10, artworkH: 10 })]);
      const sh = document.querySelector('#frame-layer .art-visual .art-shade');
      if (!sh) throw new Error('no shade over the artwork');
      if ((sh.style.boxShadow.split('inset').length - 1) !== 1) throw new Error('with a mat, only the opening casts: ' + sh.style.boxShadow);
      seed('in', [frame({ artworkUrl: PNG1, artworkW: 10, artworkH: 10, m1A: false, m1T: 0, m1B: 0, m1L: 0, m1R: 0 })]);
      const sh2 = document.querySelector('#frame-layer .art-visual .art-shade');
      if (!sh2 || (sh2.style.boxShadow.split('inset').length - 1) !== 2) throw new Error('with no mat the moulding must cast onto the art too');
      seed('in', [frame({ product: 'Framed Canvas (Floater)', artworkUrl: PNG1, artworkW: 10, artworkH: 10 })]);
      if (document.querySelector('#frame-layer .art-shade')) throw new Error('a floater got an opening shadow');
    });

    // ── Breaker and install pages ──
    __check('EXACT ASK: the deck-page shadow is one builder, and it obeys the switch, the drop shadow and the product', () => {
      const p = frameFx.pageShadow;
      try {
        frameFx.pageShadow = false;
        if (_frameShadowCanvas({ product: 'Framed Art' }, 24, 30)) throw new Error('drawn with the switch off');
        frameFx.pageShadow = true;
        const s = _frameShadowCanvas({ product: 'Framed Art' }, 24, 30);
        if (!s || !s.canvas || !(s.padIn > 0)) throw new Error('not drawn with the switch on');
        if (_frameShadowCanvas({ product: 'Wallcovering (EGD)' }, 24, 30)) throw new Error('a wallcovering cast one');
        const d = dashOuterShadowsOn; dashOuterShadowsOn = false;
        const off = _frameShadowCanvas({ product: 'Framed Art' }, 24, 30); dashOuterShadowsOn = d;
        if (off) throw new Error('drawn with the drop shadow switched off');
      } finally { frameFx.pageShadow = p; }
      if (S.indexOf('const s = _frameShadowCanvas(d, wIn, hIn)') < 0) throw new Error('spec pages no longer use the shared builder');
    });
    __check('the PDF capture puts that shadow UNDER every frame; the SVG download stays clean', () => {
      const a = S.indexOf('async function exportElevSVG(');
      const B = S.slice(a, S.indexOf('// ── PERSON (back layer)', a));
      if (B.indexOf('const _wantShadow = !!_capK') < 0) throw new Error('the shadow is not limited to the PDF capture');
      if (B.indexOf('_frameShadowCanvas(dIn,') < 0) throw new Error('the capture does not draw the deck-page shadow');
      const sp = B.indexOf('backLayer.splice(_shadowAt < 0 ? backLayer.length : _shadowAt, 0, ..._shadows)');
      if (sp < 0) throw new Error('shadows are not inserted under the frames');
      if (sp < B.lastIndexOf('xlink:href="\${dataUrl}"')) throw new Error('the splice runs before the frames are drawn');
      // 19.69: frames go in flat graphics first, and the insertion point is the first
      // framed piece, so shadows land on a wallcovering rather than under it
      // (behaviour pinned by test_flat_behind_framed_export).
      const loop = B.indexOf('for (const f of _capOrder)');
      if (loop < 0) throw new Error('the capture no longer walks the flat-first order');
      const at = B.indexOf('if (_shadowAt < 0 && !_isFlatGraphic(f.product)) _shadowAt = backLayer.length');
      if (at < loop || at > B.indexOf('if (!f.active) continue', loop)) throw new Error('the insertion point is not taken as the first framed piece goes in');
    });
    __check('the switch is labelled for every deck page it covers', () => {
      if (S.indexOf('Also on deck pages: spec, breaker and install') < 0) throw new Error('label still says spec pages only');
    });

    // ── The dock ──
    __check('EXACT ASK: the tools are one vertical dock between the sidebar and the drawing', () => {
      const v = document.getElementById('view-elevation');
      const kids = Array.prototype.slice.call(v.children);
      const sb = kids.indexOf(v.querySelector('.elev-sidebar')), sl = kids.indexOf(document.getElementById('elevDockSlot')), ws = kids.indexOf(v.querySelector('.workspace'));
      if (!(sb >= 0 && sl === sb + 1 && ws === sl + 1)) throw new Error('order is sidebar ' + sb + ', dock ' + sl + ', workspace ' + ws);
      const dock = document.getElementById('elevToolDock');
      if (!dock.classList.contains('ds-dock')) throw new Error('not the Deck Studio dock component');
      ['elevDockSelect', 'lineToolBtn', 'contextToolBtn', 'bulkImportBtn', 'alignBtn', 'groupDimBtn', 'fitFlatBtn', 'shortcutsBtn'].forEach(id => {
        const b = document.getElementById(id);
        if (!b || !dock.contains(b)) throw new Error('#' + id + ' is not in the dock');
      });
      ['autoElevRelabel()', '_jumpToCodes()', 'importSelectedFramesBulk()'].forEach(fn => {
        if (dock.innerHTML.indexOf(fn) < 0) throw new Error(fn + ' is not reachable from the dock');
      });
      const wsEl = v.querySelector('.workspace');
      if (wsEl.querySelector('#shortcutsBtn, #lineToolBtn')) throw new Error('a button is still floating on the drawing');
      if (document.querySelector('[data-elevtabpane="art"] .elev-add-arrange-fixed')) throw new Error('the Add & Arrange row is still in the sidebar');
    });
    __check('Select is lit whenever no wall tool is armed, and puts the tool down', () => {
      seed('in', [frame()]);
      const sel = document.getElementById('elevDockSelect'), m = document.getElementById('lineToolBtn');
      toggleLineTool(true);
      if (sel.classList.contains('active') || !m.classList.contains('active')) throw new Error('measure armed, but the lights are wrong');
      _elevDockSelect();
      if (lineToolActive) throw new Error('Select did not put the measure tool down');
      if (!sel.classList.contains('active')) throw new Error('Select is not lit');
      const k = S.indexOf("(e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey");
      if (k < 0 || S.indexOf('_elevDockSelect()', k) - k > 200) throw new Error('V is not bound to Select');
    });
    __check('Add frames opens from the dock as a flyout listing the project, and the button shows it is open', () => {
      dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.7' })];
      toggleBulkDropdown();
      const list = document.getElementById('bulkDropdownList');
      if (list.style.display !== 'block') throw new Error('did not open');
      if (list.innerHTML.indexOf('ART.7') < 0) throw new Error('the list was not filled on open');
      if (!document.getElementById('bulkImportBtn').classList.contains('open')) throw new Error('the dock button is not marked open');
      toggleBulkDropdown();
      if (list.style.display !== 'none' || document.getElementById('bulkImportBtn').classList.contains('open')) throw new Error('did not close');
    });
    __check('exports and captures take the dock out of the layout, as they do the rail', () => {
      ['async function exportElevPNG(', 'async function exportElevSVG('].forEach(h => {
        const a = S.indexOf(h); if (a < 0) throw new Error(h + ' not found');
        const B = S.slice(a, S.indexOf(String.fromCharCode(10) + 'async function ', a + 10));
        if (B.indexOf("if (_dockSl) _dockSl.style.display = 'none';") < 0) throw new Error(h + ' leaves the dock in');
        if (B.indexOf('if (_dockSl) _dockSl.style.display = _dockDisp;') < 0) throw new Error(h + ' never puts it back');
      });
    });

    // ── The tabs ──
    __check('EXACT ASK: the tabs read as categories: icon, name and a count', () => {
      const strip = document.querySelector('.elev-tabs');
      if (!strip.classList.contains('elev-cat-tabs')) throw new Error('no category styling');
      document.querySelectorAll('[data-elevtab]').forEach(b => {
        if (!b.querySelector('svg')) throw new Error(b.getAttribute('data-elevtab') + ' has no icon');
      });
      seed('in', [frame(), frame({ id: 'ART.2', letter: 'B', x: 80 })], { glazing: [{ x: 10, y: 4, h: 80, panels: [30, 30] }] });
      initElevControls();
      const n = k => (document.querySelector('[data-elevtab-n="' + k + '"]') || {}).textContent;
      if (n('art') !== '2') throw new Error('art count is ' + n('art'));
      if (n('glass') !== '1') throw new Error('glass count is ' + n('glass'));
      if (n('context') !== '') throw new Error('an empty tab shows a count: ' + n('context'));
    });
  `;
  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__indexHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
