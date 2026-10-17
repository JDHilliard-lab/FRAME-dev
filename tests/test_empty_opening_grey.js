// 19.17: AN EMPTY FRAME ON A DECK PAGE PRINTS A LIGHT GREY OPENING, NOT A BLACK ONE.
//
// Reported: on breaker / install pages, frames with no picture showed a black opening.
// renderFrameToCanvas leaves the opening transparent (for InDesign compositing), and the
// "also on deck pages" drop shadow is drawn UNDER each frame in the capture, so it showed
// through the hole. Both deck elevation renderers now pass emptyFill
// (ELEV_EMPTY_OPENING_FILL); the downloads keep the transparent opening.
// jsdom has no canvas, so a recording context VALIDATES what is filled, and where.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); }
};

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
// A context that records clears and fills (with the fill colour at the time), and
// accepts everything else.
let log = [];
const mkCtx = () => {
  const st = { fillStyle: '#000' };
  return new Proxy(st, {
    get(t, k) {
      if (k === 'clearRect') return (x, y, w, h) => log.push({ op: 'clear', x, y, w, h });
      if (k === 'fillRect') return (x, y, w, h) => log.push({ op: 'fill', c: String(t.fillStyle), x, y, w, h });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => ({ setTransform() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.getContext = function () { return this.__c || (this.__c = mkCtx()); };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = { get fill() { return ELEV_EMPTY_OPENING_FILL; }, get wf() { return ELEV_WF_FILL; },',
  '  row: function (extra) { return _frameDataInInches(Object.assign(_cloneData(dashDefaultData), { extW: 20, extH: 30, artworkUrl: "" }, extra || {}), dashUnit); } };',
].join(NL));
console.error = quiet; console.log = qlog;
const fx = window.__fx;

const frame = (extra) => fx.row(extra);
const render = (opts, d) => {
  log = [];
  window.renderFrameToCanvas(frame(d), null, Object.assign({ dpi: 10, pad: 0 }, opts || {}));
  const clear = log.find(e => e.op === 'clear');
  const fill = clear ? log.slice(log.indexOf(clear)).find(e => e.op === 'fill' && e.c === fx.fill) : null;
  return { clear, fill };
};

check('the fill is a light grey, lighter than the wireframe block', () => {
  const g = (h) => parseInt(h.slice(1, 3), 16);
  if (!/^#[0-9a-f]{6}$/i.test(fx.fill)) throw new Error('not a hex literal: ' + fx.fill);
  if (!(g(fx.fill) >= 200 && g(fx.fill) < 255)) throw new Error('not a light grey: ' + fx.fill);
  if (!(g(fx.fill) > g(fx.wf))) throw new Error('as dark as the wireframe block');
});

check('EXACT BUG: an empty opening asked to be filled is filled grey, exactly over the opening', () => {
  const r = render({ emptyFill: fx.fill });
  if (!r.clear) throw new Error('no opening cut (else this proves nothing)');
  if (!r.fill) throw new Error('opening left transparent');
  ['x', 'y', 'w', 'h'].forEach(k => {
    if (!Number.isFinite(r.fill[k]) || Math.abs(r.fill[k] - r.clear[k]) > 1e-9) throw new Error('fill ' + k + ' ' + r.fill[k] + ' vs opening ' + r.clear[k]);
  });
});

check('a floater opening is filled too', () => {
  const r = render({ emptyFill: fx.fill }, { product: 'Framed Canvas (Floater)', floaterInset: 0.75 });
  if (!r.fill) throw new Error('floater opening left transparent');
});

check('without the option (downloads) the opening stays transparent', () => {
  if (render({}).fill) throw new Error('filled without being asked');
});

check('artwork or a wireframe block is never covered by it', () => {
  const img = { naturalWidth: 10, naturalHeight: 10, width: 10, height: 10 };
  if (render({ emptyFill: fx.fill, artworkImg: img }).fill) throw new Error('filled under artwork');
  if (render({ emptyFill: fx.fill, wireframe: true }).fill) throw new Error('filled under the wireframe block');
});

check('both deck elevation renderers ask for it; the downloads do not', () => {
  // From the landmark to the next top-level function of either kind.
  const sec = (a) => {
    const i = APP.indexOf(a); if (i < 0) throw new Error('landmark ' + a);
    const ends = [NL + 'function ', NL + 'async function '].map(k => APP.indexOf(k, i + 1)).filter(j => j > 0);
    return APP.slice(i, Math.min(...ends));
  };
  const thumb = sec('async function renderElevationToCanvas');
  if (thumb.indexOf('emptyFill: ELEV_EMPTY_OPENING_FILL') < 0) throw new Error('renderElevationToCanvas does not fill');
  const svg = sec('async function exportElevSVG');
  if (svg.indexOf('emptyFill: _empty ? ELEV_EMPTY_OPENING_FILL') < 0) throw new Error('the PDF capture does not fill');
  if (svg.indexOf('const _empty = !!_capK') < 0) throw new Error('the capture fill is not limited to the capture');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'PASS: ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -- ' + r.err)));
if (failed.length) { console.log(failed.length + ' FAILURE' + (failed.length > 1 ? 'S' : '')); process.exit(1); }
console.log('ALL PASSED (' + results.length + ')');
process.exit(0);
