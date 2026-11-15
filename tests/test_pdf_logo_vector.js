// 20.57: THE STUDIO LOGO PRINTS AS VECTOR. The footer and cover wordmark went into the PDF
// as the SVG rasterized to a PNG ~1200 px wide for a ~90 pt box; Preview and Chrome's PDF
// viewer shrink an image that oversampled with little filtering, so it read jagged at
// normal zoom and fine zoomed in. Now the SVG's own paths are replayed with doc.path.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SVG = fs.readFileSync(path.join(root, 'logo', 'Farmboy_dark-logo.svg'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message + (process.env.DBG ? e.stack : '') }); }
};

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }) });
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
window.jspdf = require(path.join(root, 'lib-jspdf.min.js'));
const quiet = console.error; console.error = () => {}; const qlog = console.log; console.log = () => {};
window.eval(APP + NL + '_autosaveToldUser = true; window.__mkRec = function () { return new CanvasPdfRec(936, 540); };');
console.error = quiet; console.log = qlog;
const { jsPDF } = window.jspdf;
const newDoc = () => new jsPDF({ orientation: 'landscape', unit: 'pt', format: [936, 540] });
const vec = window._svgLogoToVec(SVG);
const stream = (doc) => { const o = doc.output(); return o; };

check('the real Farmboy SVG parses: 8 elements (4 paths, 4 polygons), viewBox aspect', () => {
  if (!vec) throw new Error('null');
  if (vec.subs.length !== 8) throw new Error('elements ' + vec.subs.length);
  if (Math.abs(vec.w / vec.h - 8.3145) > 0.001) throw new Error('aspect ' + vec.w / vec.h);
});

check('every parsed point is finite and inside the viewBox (relative/shorthand commands resolved)', () => {
  vec.subs.forEach(el => el.forEach(o => {
    for (let k = 0; k < o.c.length; k += 2) {
      const x = o.c[k], y = o.c[k + 1];
      if (!isFinite(x) || !isFinite(y) || x < -0.5 || x > vec.w + 0.5 || y < -0.5 || y > vec.h + 0.5) throw new Error(o.op + ' ' + x + ',' + y);
    }
  }));
});

check('the O has its counter: its path has two closed subpaths', () => {
  const o = vec.subs.find(el => el[0].op === 'm' && Math.abs(el[0].c[0] - 688.66) < 0.01);
  if (!o) throw new Error('no O');
  const ms = o.filter(x => x.op === 'm').length, hs = o.filter(x => x.op === 'h').length;
  if (ms !== 2 || hs !== 2) throw new Error(ms + ' m / ' + hs + ' h');
});

check('an unsupported command (arc) falls back: returns null, not a broken shape', () => {
  if (window._svgLogoToVec('<svg viewBox="0 0 10 10"><path d="M0,0 A5,5 0 0 1 10,10Z"/></svg>') !== null) throw new Error('arc parsed');
  if (window._svgLogoToVec('<svg><path d="M0,0L1,1Z"/></svg>') !== null) throw new Error('no viewBox parsed');
});

check('EXACT ASK: the PDF footer draws the studio logo as vector paths, not an image', () => {
  const doc = newDoc(); doc.addPage();
  let imgs = 0; const orig = doc.addImage.bind(doc); doc.addImage = function () { imgs++; return orig.apply(null, arguments); };
  window._drawPdfFooter(doc, { farmboy: 'data:image/png;base64,iVBORw0KGgo=', farmboyAR: vec.w / vec.h, farmboyVec: vec }, 2, {});
  if (imgs) throw new Error('addImage called ' + imgs + 'x');
  const o = stream(doc);
  const n = o.split(' c' + NL).length - 1, f = o.split('f*').length - 1;
  if (n < 20) throw new Error('curves ' + n);
  if (f < 8) throw new Error('even-odd fills ' + f);
});

check('the cover logo is vector too', () => {
  const src = APP.slice(APP.indexOf('// Logo lower-right on the cover'), APP.indexOf('// Thin rule under the title.'));
  if (src.indexOf('_drawVecLogo(doc, logos.farmboyVec') < 0) throw new Error('cover still raster only');
});

check('without a parsed logo the footer still falls back to the image', () => {
  const doc = newDoc();
  let imgs = 0; doc.addImage = function () { imgs++; };
  window._drawPdfFooter(doc, { farmboy: 'data:image/png;base64,iVBORw0KGgo=', farmboyAR: 8, farmboyVec: null }, 2, {});
  if (imgs !== 1) throw new Error('addImage ' + imgs);
});

check('the preview renderer (CanvasPdfRec) has path + fillEvenOdd and records the logo', () => {
  const rec = window.__mkRec();
  if (!window._drawVecLogo(rec, vec, 10, 10, 91, 11, [255, 255, 255])) throw new Error('drew nothing');
  const ps = rec.ops.filter(o => o.t === 'path');
  if (ps.length !== 8) throw new Error('path ops ' + ps.length);
  if (ps[0].st.fc !== 'rgb(255,255,255)') throw new Error('fill ' + ps[0].st.fc);
  const rsrc = APP.slice(APP.indexOf('CanvasPdfRec.prototype.render = '), APP.indexOf('let _dsBuilt = {};'));
  if (rsrc.indexOf("op.t === 'path'") < 0 || rsrc.indexOf("fill('evenodd')") < 0) throw new Error('render() does not draw path ops');
});

check('logo boxes land where asked: scaled points stay inside the footer box', () => {
  const rec = window.__mkRec();
  window._drawVecLogo(rec, vec, 800, 513, 91.46, 11, [0, 0, 0]);
  rec.ops.filter(o => o.t === 'path').forEach(p => p.ops.forEach(o => {
    for (let k = 0; k < o.c.length; k += 2) if (o.c[k] < 799.9 || o.c[k] > 891.6 || o.c[k + 1] < 512.9 || o.c[k + 1] > 524.1) throw new Error(o.c[k] + ',' + o.c[k + 1]);
  }));
});

// THE CLIENT / BRAND FOOTER LOGO (also 20.57). Not vector (an upload is any PNG or JPEG),
// but it was handed to the PDF at full upload size, and its white version cut edges on/off.
check('EXACT ASK: the client logo is prepared at print size, not 240 px (22x an 11 pt box)', () => {
  const H = parseFloat(APP.split('const FOOTER_LOGO_PREP_H = ')[1]);
  if (!(H >= 64 && H <= 128)) throw new Error('prep height ' + H);
  const src = APP.slice(APP.indexOf('function _footerLogoPrep('), APP.indexOf('function _footerLogosPrep('));
  if (src.indexOf('_logoResample(') < 0) throw new Error('not resampled smoothly');
  if (src.indexOf('h > FOOTER_LOGO_PREP_H') < 0) throw new Error('a big raster upload still prints as uploaded');
});

check('the white version keeps soft edges: alpha ramps with darkness, no on/off cut', () => {
  const f = window._logoInkAlpha;
  if (f(0, 0, 0, 255) !== 255) throw new Error('ink ' + f(0, 0, 0, 255));
  if (f(255, 255, 255, 255) !== 0) throw new Error('paper ' + f(255, 255, 255, 255));
  const mid = f(160, 160, 160, 255);
  if (!(mid > 100 && mid < 155)) throw new Error('edge pixel ' + mid + ' (old rule gave 0)');
  if (f(150, 150, 150, 255) <= f(170, 170, 170, 255)) throw new Error('not monotonic');
  if (f(0, 0, 0, 100) !== 100) throw new Error('source alpha not kept');
  const src = APP.slice(APP.indexOf('function _footerLogoPrep('), APP.indexOf('function _footerLogosPrep('));
  if (src.indexOf('lum < 160') >= 0) throw new Error('old hard cut still in _footerLogoPrep');
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
