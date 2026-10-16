// 19.01: the floater reveal. Reported: "IM-310-725 should have a face of 5/8" ... the
// mock up preview is missing the 0.25" gap that should be from the edge", and "does the
// artwork drop a shadow onto the frame? This will also help the look of the gap".
// floaterInset is face + FLOATER_SHADOW_REVEAL, but every view painted the whole inset
// as moulding, so the quarter-inch slot read as more face. The SVG vector frame tried to
// draw the gap from the rail's inner edge, which on a floater lies INSIDE the opening,
// so it drew nothing. The canvas's cast borrowed the Frame onto mat slider.
// Also: the three Cape Cod floaters were stored with a 3/8 lip; their name says 5/8.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A 2D context that records rects, fills (with their style) and shadowed strokes.
  window.__log = [];
  const mk = () => { const st = {}; return new Proxy(st, {
    get: (t, k) => { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 0 }); if (k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'rect') return (...a) => window.__log.push({ t: 'rect', a });
      if (k === 'beginPath') return () => window.__log.push({ t: 'begin' });
      if (k === 'fill') return (rule) => window.__log.push({ t: 'fill', rule, style: t.fillStyle });
      if (k === 'drawImage') return () => window.__log.push({ t: 'img' });
      if (k === 'strokeRect') return (...a) => window.__log.push({ t: 'stroke', blur: t.shadowBlur, col: t.shadowColor, a });
      return () => {}; },
    set: (t, k, v) => { t[k] = v; return true; } }); };
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__c || (this.__c = mk()); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.Path2D = function () { return { moveTo() {}, lineTo() {}, closePath() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {} }; };
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const floater = () => Object.assign(_cloneData(dashDefaultData), { extW: 24, extH: 24, fW: 1.5, product: 'Framed Canvas (Floater)', floaterInset: 0.75, m1A: false });
    const run = (d, opts) => { window.__log.length = 0; renderFrameToCanvas(d, null, Object.assign({ dpi: 72, pad: 0 }, opts || {})); return window.__log.slice(); };
    // The ring is a beginPath, two rects (outer then the opening) and an evenodd fill.
    const gapRing = (log) => { for (let i = 0; i + 3 < log.length; i++) {
      if (log[i].t === 'begin' && log[i + 1].t === 'rect' && log[i + 2].t === 'rect' && log[i + 3].t === 'fill' && log[i + 3].rule === 'evenodd') return { outer: log[i + 1].a, hole: log[i + 2].a, style: log[i + 3].style };
    } return null; };
    __check('the reveal is the quarter inch, in the unit asked, and never eats the whole inset', () => {
      if (_floaterRevealOf(0.75, 'in') !== 0.25) throw new Error('in: ' + _floaterRevealOf(0.75, 'in'));
      if (Math.abs(_floaterRevealOf(1.905, 'cm') - 0.635) > 1e-9) throw new Error('cm: ' + _floaterRevealOf(1.905, 'cm'));
      if (_floaterRevealOf(0.3, 'in') !== 0.15) throw new Error('tiny inset: ' + _floaterRevealOf(0.3, 'in'));
      if (_floaterRevealOf('', 'in') !== 0) throw new Error('no inset still has a gap');
    });
    __check('EXACT BUG: the floater mockup paints the quarter-inch gap dark, just outside the canvas', () => {
      resetFrameFx();
      const g = gapRing(run(floater()));
      if (!g) throw new Error('no gap ring was filled');
      if (g.hole.join() !== [54, 54, 24 * 72 - 108, 24 * 72 - 108].join()) throw new Error('hole is not the opening: ' + g.hole.join());
      if (g.outer.join() !== [36, 36, 24 * 72 - 72, 24 * 72 - 72].join()) throw new Error('ring is not 0.25in wide: ' + g.outer.join());
      if (String(g.style).indexOf('rgba(0,0,0,') !== 0) throw new Error('ring is not a darkening: ' + g.style);
    });
    __check('the gap follows a hand-set inset (face = inset - reveal)', () => {
      const g = gapRing(run(Object.assign(floater(), { floaterInset: 0.875 })));   // 5/8 face
      if (!g || g.hole[0] !== 63 || g.outer[0] !== 45) throw new Error(g ? g.outer.join() + ' / ' + g.hole.join() : 'no ring');
    });
    __check('...and stays on with artwork in the canvas', () => {
      const log = run(floater(), { artworkImg: { naturalWidth: 100, naturalHeight: 100, width: 100, height: 100 } });
      if (!gapRing(log)) throw new Error('artwork removed the gap');
    });
    __check('a framed piece (not a floater) gets no gap ring', () => {
      const d = Object.assign(_cloneData(dashDefaultData), { extW: 24, extH: 24 });
      if (gapRing(run(d))) throw new Error('a gap ring on a framed piece');
    });
    __check('Floater gap is its own slider: it drives the ring and the cast, Frame onto mat does not', () => {
      resetFrameFx();
      const castBlur = (log) => Math.max(0, ...log.filter(s => s.t === 'stroke' && s.blur).map(s => s.blur));
      const base = run(floater()), b0 = castBlur(base);
      setFrameFx('frame', 2); const fr = run(floater());
      if (castBlur(fr) !== b0) throw new Error('Frame onto mat still moves the floater cast');
      resetFrameFx(); setFrameFx('gap', 2); const deep = run(floater());
      if (!(castBlur(deep) > b0)) throw new Error('Floater gap at 200% did not deepen the cast');
      setFrameFx('gap', 0); const none = gapRing(run(floater()));
      resetFrameFx();
      if (none.style !== 'rgba(0,0,0,0)') throw new Error('0% still darkens the gap: ' + none.style);
      if (FRAME_FX_ROWS.map(r => r[0]).indexOf('gap') < 0) throw new Error('no Floater gap row in the panel');
    });
    __check('the Dashboard and wall views draw the same ring as a spread shadow exactly the gap wide', () => {
      resetFrameFx();
      const css = _floaterGapCss(9, 36);
      if (css.indexOf('0 0 0 9px rgba(0,0,0,0.6)') !== 0) throw new Error(css);
      const S = window.__appSrc;
      if (S.indexOf("art.style.boxShadow = art.dataset.gapShadow || 'none';") < 0) throw new Error('the wall drops the gap when the canvas has artwork');
      if (S.indexOf("artVis.style.boxShadow = _dashGapShadow || 'none';") < 0) throw new Error('the Dashboard drops the gap when the canvas has artwork');
    });
    __check('EXACT BUG: the vector SVG floater draws its gap ring around the opening', () => {
      const f = { w: 24, h: 24, fW: 1.5, product: 'Framed Canvas (Floater)', floaterInset: 0.75, fType: 'color', fColor: '#333333' };
      const parts = buildFrameSVG(f, { x: 0, y: 0, w: 240, h: 240 }, 'in', '#333333');   // 10px per inch
      const want = '<path d="M 5.0 5.0 h 230.0 v 230.0 h -230.0 Z M 7.5 7.5 h 225.0 v 225.0 h -225.0 Z"';
      if (!parts.some(p => p.indexOf(want) === 0)) throw new Error('no ring from 0.5in to 0.75in: ' + parts.filter(p => p.indexOf('<path') === 0).join(' | '));
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  // Data: the Cape Cod floaters are named 5/8" Face, and the file name carries the lip.
  const cc = path.join(root, 'library', 'international-moulding', 'cape-cod-floaters');
  const files = fs.readdirSync(cc).filter(f => f.endsWith('.jpg'));
  const bad = ['IM-310-715', 'IM-310-720', 'IM-310-725'].filter(c => !files.some(f => f.indexOf(c + '_') === 0 && f.indexOf('_f0.625.') > 0));
  all.push(bad.length ? { label: 'Cape Cod floaters carry their 5/8 lip', ok: false, err: bad.join(', ') } : { label: 'Cape Cod floaters carry their 5/8 lip', ok: true });
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
