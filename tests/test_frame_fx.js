// 18.41: Frame Effects. One strength per shadow a framed piece casts, read by every
// renderer. Asked: "a settings area for frame effects, and have sliders that designers
// can get their best looking frames", covering the mat onto the artwork, the deckled
// paper lift, the frame onto the mat and the drop shadow onto the wall and the page.
// Found while building it: the opening's shadow was drawn BEFORE the artwork, which
// covers the whole opening, so a piece with art never showed a shadow on the art.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A 2D context that RECORDS every shadow it is given, in order, plus image draws.
  window.__log = [];
  const mk = () => { const st = {}; return new Proxy(st, {
    get: (t, k) => { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 0 }); if (k === 'createLinearGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'drawImage') return () => window.__log.push({ t: 'img' }); if (k === 'strokeRect') return () => window.__log.push({ t: 'stroke', blur: t.shadowBlur, off: t.shadowOffsetY, col: t.shadowColor }); return () => {}; },
    set: (t, k, v) => { t[k] = v; return true; } }); };
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__c || (this.__c = mk()); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  // jsdom has no Path2D; the deckled paper edge builds one.
  window.Path2D = function () { return { moveTo() {}, lineTo() {}, closePath() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {} }; };
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const row = () => Object.assign(_frameDataInInches(Object.assign(_cloneData(dashDefaultData), { extW: 24, extH: 30 }), 'in'), {});
    const strokes = (fn) => { window.__log.length = 0; fn(); return window.__log.slice(); };
    const art = { naturalWidth: 100, naturalHeight: 100, width: 100, height: 100 };
    __check('at 100% every shadow recipe comes back exactly as it was written', () => {
      resetFrameFx();
      if (_fxCss('mat', 0, 2, 6, 0.3, true) !== 'inset 0px 2px 6px rgba(0,0,0,0.3)') throw new Error(_fxCss('mat', 0, 2, 6, 0.3, true));
      const v = _fxSh('outer', 35, 18, 0.55); if (v.b !== 35 || v.o !== 18 || v.a !== 0.55) throw new Error(JSON.stringify(v));
    });
    __check('a slider deepens its own shadow and only its own', () => {
      setFrameFx('mat', 2);
      const m = _fxSh('mat', 20, 8, 0.45), f = _fxSh('frame', 35, 14, 0.6);
      if (!(m.a > 0.45 && m.b > 20)) throw new Error('mat at 200% did not deepen: ' + JSON.stringify(m));
      if (f.a !== 0.6 || f.b !== 35) throw new Error('frame moved with the mat slider');
      setFrameFx('mat', 0);
      if (_fxSh('mat', 20, 8, 0.45).a !== 0) throw new Error('0% still casts a shadow');
      resetFrameFx();
    });
    __check('the frame renderer reads the strengths (the PNG, the spec pages, the PDF)', () => {
      resetFrameFx();
      const base = strokes(() => renderFrameToCanvas(row(), null, { dpi: 72, pad: 0 })).filter(s => s.t === 'stroke' && s.blur);
      setFrameFx('frame', 2);
      const deep = strokes(() => renderFrameToCanvas(row(), null, { dpi: 72, pad: 0 })).filter(s => s.t === 'stroke' && s.blur);
      resetFrameFx();
      if (!base.length) throw new Error('no inner shadow was drawn at all');
      if (Math.max(...deep.map(s => s.blur)) <= Math.max(...base.map(s => s.blur))) throw new Error('frame at 200% drew the same shadow');
    });
    __check('EXACT BUG: with artwork in the opening, its shadow lands ON the artwork', () => {
      resetFrameFx();
      const log = strokes(() => renderFrameToCanvas(row(), null, { dpi: 72, pad: 0, artworkImg: art }));
      const img = log.findIndex(s => s.t === 'img');
      if (img < 0) throw new Error('the artwork was not drawn');
      if (!log.slice(img + 1).some(s => s.t === 'stroke' && s.blur)) throw new Error('no shadow is drawn after the artwork, so it is hidden under it');
    });
    __check('EXACT BUG (18.45): with no mat, the FRAME casts its shadow onto the artwork', () => {
      resetFrameFx();
      const r = Object.assign(row(), { m1A: false });
      const log = strokes(() => renderFrameToCanvas(r, null, { dpi: 72, pad: 0, artworkImg: art }));
      const img = log.findIndex(s => s.t === 'img');
      const after = log.slice(img + 1).filter(s => s.t === 'stroke' && s.blur);
      if (!after.some(s => s.blur >= 30)) throw new Error('only the thin opening shadow lands on the art: blurs ' + after.map(s => s.blur).join(','));
      setFrameFx('frame', 2);
      const deep = strokes(() => renderFrameToCanvas(r, null, { dpi: 72, pad: 0, artworkImg: art }));
      resetFrameFx();
      if (Math.max(...deep.filter(s => s.t === 'stroke' && s.blur).map(s => s.blur)) <= Math.max(...after.map(s => s.blur))) throw new Error('Frame onto mat does not drive it');
      const matted = strokes(() => renderFrameToCanvas(row(), null, { dpi: 72, pad: 0, artworkImg: art }));
      const mi = matted.findIndex(s => s.t === 'img');
      if (matted.slice(mi + 1).some(s => s.t === 'stroke' && s.blur >= 30)) throw new Error('a matted piece now gets the frame shadow on its art');
    });
    __check('the live Dashboard and elevation views give an unmatted frame the same cast', () => {
      if (css.indexOf('.art-visual.fx-frame-cast {') < 0 || css.indexOf('var(--fx-frame', css.indexOf('.art-visual.fx-frame-cast {')) < 0) throw new Error('no fx-frame-cast rule reading --fx-frame');
      if (window.__appSrc.split("classList.add('fx-frame-cast')").length - 1 !== 2) throw new Error('both DOM views must set fx-frame-cast');
    });
    __check('...but not on a wireframe placement block', () => {
      const log = strokes(() => renderFrameToCanvas(row(), null, { dpi: 72, pad: 0, wireframe: true }));
      if (log.some(s => s.t === 'img')) throw new Error('wireframe drew an image');
    });
    __check('the Dashboard preview mats and art read the strengths through CSS variables', () => {
      ['--fx-frame', '--fx-mat', '--fx-art'].forEach(v => { if (css.indexOf('var(' + v) < 0) throw new Error('style.css does not read ' + v); });
      setFrameFx('art', 1.5);
      if (document.documentElement.style.getPropertyValue('--fx-art') !== '1.5') throw new Error('the CSS variable did not follow');
      resetFrameFx();
    });
    __check('the settings travel in the project file and come back on open', () => {
      setFrameFx('outer', 1.8);
      const S = window.__appSrc;
      if (S.indexOf('frameFx: _cloneData(frameFx)') < 0) throw new Error('the save does not write frameFx');
      resetFrameFx();
      _readProjectText(JSON.stringify({ type: 'master-studio-v6', dashUnit: 'in', elevUnit: 'in', dashProjectData: [], elevations: [], editorial: {}, frameFx: { outer: 1.8, art: 0.5 } }));
      if (_fx('outer') !== 1.8 || _fx('art') !== 0.5 || _fx('frame') !== 1) throw new Error('loaded ' + JSON.stringify(frameFx));
      resetFrameFx();
    });
    __check('the panel has the on/off, five sliders and a reset, and the sliders drive the setting', () => {
      openFrameFx();
      const m = document.getElementById('frameFxModal');
      if (!m.querySelector('#frameFxOuterOn')) throw new Error('no drop shadow on/off');
      const rs = m.querySelectorAll('input[type=range][data-fx]');
      if (rs.length !== 5) throw new Error(rs.length + ' sliders');
      const art = m.querySelector('[data-fx="art"]'); art.value = '150'; art.oninput();
      if (_fx('art') !== 1.5) throw new Error('slider did not set art');
      Array.from(m.querySelectorAll('button')).find(b => b.textContent.indexOf('Reset') === 0).onclick();
      if (_fx('art') !== 1) throw new Error('reset did not restore');
      m.remove();
    });
    // 18.44: sample tabs, so every shadow can be seen on a build that actually casts it.
    __check('the panel steps through every build on a sample, one tab lit at a time', () => {
      openFrameFx();
      const m = document.getElementById('frameFxModal');
      const tabs = Array.from(m.querySelectorAll('#frameFxCases [data-fx-case]'));
      const want = ['nomat', 'mat1', 'mat2', 'faux', 'float', 'floater'];
      if (tabs.map(b => b.getAttribute('data-fx-case')).join() !== want.join()) throw new Error('tabs: ' + tabs.map(b => b.getAttribute('data-fx-case')).join());
      tabs[2].onclick();
      if (_frameFxCase !== 'mat2') throw new Error('tab did not pick its case');
      const lit = tabs.filter(b => b.classList.contains('active'));
      if (lit.length !== 1 || lit[0] !== tabs[2]) throw new Error(lit.length + ' tabs lit');
      _frameFxCase = 'mat1'; m.remove();
    });
    __check('each sample is the build its tab names, and nothing leaks between them', () => {
      const S = k => _frameFxSample(k);
      if (S('nomat').m1A || S('nomat').m2A || S('nomat').useFloatMount) throw new Error('no-mat sample carries a mat or float');
      if (!S('mat1').m1A || S('mat1').m2A) throw new Error('single mat is not one mat');
      if (!(S('mat2').m1A && S('mat2').m2A)) throw new Error('double mat is not two mats');
      if (!S('faux').useFauxMat || S('faux').useFloatMount) throw new Error('faux mat sample wrong');
      if (!S('float').useFloatMount || S('float').sbPaperEdge !== 'torn') throw new Error('float sample is not a deckled float mount');
      if (S('floater').product !== 'Framed Canvas (Floater)') throw new Error('floater sample wrong');
      const one = S('mat1'); if (one.extW !== 24 || one.extH !== 24) throw new Error('sample is not square');
      // 18.45: asked for MICH-32-22 everywhere, MICH-301-22 on the floater, and a
      // double mat of two white mats of one width (it showed a black band).
      if (one.fCode !== 'MICH-32-22' || S('nomat').fCode !== 'MICH-32-22') throw new Error('samples are not in MICH-32-22: ' + one.fCode);
      if (S('floater').fCode !== 'MICH-301-22') throw new Error('floater is not MICH-301-22');
      if (S('floater').floaterInset !== FRAME_FX_FLOATER.faceWidth + FLOATER_SHADOW_REVEAL) throw new Error('floater inset is not face + reveal');
      const d2 = S('mat2');
      if (d2.m2ColorHex !== d2.m1ColorHex) throw new Error('double mat inner mat is ' + d2.m2ColorHex + ', not the first mat colour');
      if (d2.m2 !== d2.m1T) throw new Error('double mat widths differ: ' + d2.m1T + ' and ' + d2.m2);

    });
    __check('a sample previews whatever piece is selected', async () => {
      openFrameFx(); _frameFxCase = 'float';
      window.__fxPv = _frameFxPreview().then(() => { const h = document.getElementById('frameFxPreview'); window.__fxPvTxt = h.textContent; window.__fxPvCanvas = !!h.querySelector('canvas'); _frameFxCase = 'mat1'; });
    });
    __check('the panel has no "this piece" tab (the sliders are global)', () => {
      if (FRAME_FX_CASES.some(c => c[0] === 'piece')) throw new Error('the selected-piece tab is back');
    });
    __check('the panel is reachable from the header and from Deck Studio', () => {
      if ((document.getElementById('outerShadowToggle').getAttribute('onclick') || '').indexOf('openFrameFx') < 0) throw new Error('header button does not open it');
      if (!document.getElementById('projFrameFxBtn')) throw new Error('no entry in the Project tab');
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nconst css = ' + JSON.stringify(css) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  await window.__fxPv;
  window.__testResults.push(window.__fxPvCanvas ? { label: 'the float-mount sample drew', ok: true }
    : { label: 'the float-mount sample drew', ok: false, err: 'no canvas: ' + window.__fxPvTxt });
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
