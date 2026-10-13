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
    __check('the panel is reachable from the header and from Deck Studio', () => {
      if ((document.getElementById('outerShadowToggle').getAttribute('onclick') || '').indexOf('openFrameFx') < 0) throw new Error('header button does not open it');
      if (!document.getElementById('projFrameFxBtn')) throw new Error('no entry in the Project tab');
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nconst css = ' + JSON.stringify(css) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
