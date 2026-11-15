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

// Arcs were refused in 20.57; 20.58 reads them (Illustrator writes them for circles and
// rounded corners), so what falls back now is what cannot print as one flat colour.
check('the O cuts its counter with the nonzero rule: its two subpaths wind opposite ways', () => {
  const o = vec.subs.find(el => el[0].op === 'm' && Math.abs(el[0].c[0] - 688.66) < 0.01);
  const i = vec.subs.indexOf(o);
  if (vec.rules[i] !== 'nonzero') throw new Error('rule ' + vec.rules[i]);
  const parts = []; let cur = null;
  o.forEach(op => { if (op.op === 'm') { cur = [op.c.slice(0, 2)]; parts.push(cur); } else if (op.c.length) cur.push(op.c.slice(-2)); });
  const area = (pts) => pts.reduce((a, p, k) => { const q = pts[(k + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (Math.sign(area(parts[0])) === Math.sign(area(parts[1]))) throw new Error('same winding: the O would fill solid');
});

check('falls back (null) for anything that is not one flat colour, or has no size', () => {
  const no = {
    'no viewBox or size': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0L1,1L0,1Z"/></svg>',
    'two colours': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#f00" d="M0,0H5V5Z"/><path fill="#00f" d="M5,5H9V9Z"/></svg>',
    'a stroke': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path stroke="#000" d="M0,0H5V5Z"/></svg>',
    'a gradient': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="url(#g)" d="M0,0H5V5Z"/></svg>',
    'a clip': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g clip-path="url(#c)"><path d="M0,0H5V5Z"/></g></svg>',
    'an image': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="x.png" width="10" height="10"/></svg>',
    'text': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>ACME</text></svg>',
    'opacity': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path opacity=".5" d="M0,0H5V5Z"/></svg>',
    'broken path': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0,0 A5 5 0 2 1 10,10Z"/></svg>',
    'not xml': 'hello',
  };
  Object.keys(no).forEach(k => { if (window._svgLogoToVec(no[k]) !== null) throw new Error(k + ' parsed'); });
});

// An Illustrator-style client logo: navy through a class rule, a transform on a group, a
// rounded rect, a circle, an arc in a path, a fill="none" guide and a <title>.
const CLIENT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 200 100"><defs><style>.cls-1{fill:#1d3b6f;}</style></defs><title>Acme</title>'
  + '<g transform="translate(10 20)"><rect class="cls-1" x="0" y="0" width="60" height="100" rx="10"/>'
  + '<circle class="cls-1" cx="100" cy="50" r="40"/>'
  + '<path class="cls-1" d="M150,90a25,25 0 0,1 50,0z"/><rect fill="none" width="200" height="100"/></g></svg>';
const cvec = window._svgLogoToVec(CLIENT);

check('an Illustrator-style one-colour SVG parses: class fill, group transform, rect rx, circle, arc', () => {
  if (!cvec) throw new Error('null');
  if (cvec.subs.length !== 3) throw new Error('elements ' + cvec.subs.length + ' (the fill="none" rect must be skipped)');
  if (cvec.color.join(',') !== '29,59,111') throw new Error('colour ' + cvec.color);
  if (cvec.w !== 200 || cvec.h !== 100) throw new Error('size ' + cvec.w + 'x' + cvec.h);
});

check('the circle lands where it was drawn: transform and viewBox offset applied, arcs exact', () => {
  const c = cvec.subs[1], xs = [], ys = [];
  c.forEach(o => { for (let k = 0; k < o.c.length; k += 2) { xs.push(o.c[k]); ys.push(o.c[k + 1]); } });
  // circle (100,50) r40, +translate(10,20), -viewBox(10,20) = the same spot
  const on = c.filter(o => o.op !== 'h').map(o => o.c.slice(-2));
  on.forEach(p => { const r = Math.hypot(p[0] - 100, p[1] - 50); if (Math.abs(r - 40) > 0.01) throw new Error('point off the circle r=' + r); });
  if (Math.min.apply(null, xs) < 59.9 || Math.max.apply(null, xs) > 140.1) throw new Error('x range ' + Math.min.apply(null, xs) + '..' + Math.max.apply(null, xs));
  // a cubic quarter circle bulges ~0.027% of r: check a midpoint of the first curve
  const cv = c.find(o => o.op === 'c'), i0 = c.indexOf(cv), p0 = c[i0 - 1].c.slice(-2);
  const t = 0.5, mt = 1 - t, bx = mt*mt*mt*p0[0] + 3*mt*mt*t*cv.c[0] + 3*mt*t*t*cv.c[2] + t*t*t*cv.c[4], by = mt*mt*mt*p0[1] + 3*mt*mt*t*cv.c[1] + 3*mt*t*t*cv.c[3] + t*t*t*cv.c[5];
  const rm = Math.hypot(bx - 100, by - 50); if (Math.abs(rm - 40) > 0.05) throw new Error('arc midpoint r=' + rm);
});

check('rotate, scale and matrix transforms compose like SVG', () => {
  const v = window._svgLogoToVec('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(50 50) rotate(90)"><path transform="scale(2)" d="M0,0H10V5Z"/></g></svg>');
  const p = v.subs[0][1].c; // (10,0) scaled (20,0) rotated 90 (0,20) translated (50,70)
  if (Math.abs(p[0] - 50) > 1e-9 || Math.abs(p[1] - 70) > 1e-9) throw new Error(p.join(','));
  const m = window._svgLogoToVec('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><path transform="matrix(1 0 0 1 5 6)" d="M1,1h2v2z"/></svg>');
  if (!m || m.w !== 40 || m.subs[0][0].c.join(',') !== '6,7') throw new Error('matrix / width-height sizing ' + (m && m.subs[0][0].c));
});

check('packed arc flags parse (a1,1 0 011,1), and evenodd is read from fill-rule', () => {
  const v = window._svgLogoToVec('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill-rule="evenodd" d="M2,5a3,3 0 013,-3a3,3 0 010,6z"/></svg>');
  if (!v) throw new Error('null');
  if (v.rules[0] !== 'evenodd') throw new Error('rule ' + v.rules[0]);
  const end = v.subs[0].filter(o => o.op === 'c').pop().c.slice(-2);
  if (Math.abs(end[0] - 5) > 1e-9 || Math.abs(end[1] - 8) > 1e-9) throw new Error('arc end ' + end);
});

check('EXACT ASK: the PDF footer draws the studio logo as vector paths, not an image', () => {
  const doc = newDoc(); doc.addPage();
  let imgs = 0; const orig = doc.addImage.bind(doc); doc.addImage = function () { imgs++; return orig.apply(null, arguments); };
  window._drawPdfFooter(doc, { farmboy: 'data:image/png;base64,iVBORw0KGgo=', farmboyAR: vec.w / vec.h, farmboyVec: vec }, 2, {});
  if (imgs) throw new Error('addImage called ' + imgs + 'x');
  const o = stream(doc);
  const n = o.split(' c' + NL).length - 1, f = o.split(NL + 'f' + NL).length - 1;   // nonzero fills (20.58: SVG's own rule)
  if (n < 20) throw new Error('curves ' + n);
  if (f < 8) throw new Error('fills ' + f);
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
  if (rsrc.indexOf("op.t === 'path'") < 0 || rsrc.indexOf("x.fill(op.rule === 'nonzero' ? 'nonzero' : 'evenodd')") < 0) throw new Error('render() does not draw path ops');
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

check('EXACT ASK: an SVG client logo prints as vector in its own colour, white on a dark page', () => {
  const url = 'data:image/svg+xml;base64,' + Buffer.from(CLIENT).toString('base64');
  if (window._svgDataUrlText(url) !== CLIENT) throw new Error('data URL not decoded');
  const pc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CLIENT);
  if (window._svgDataUrlText(pc) !== CLIENT) throw new Error('percent-encoded data URL not decoded');
  const src = APP.slice(APP.indexOf('function _drawPdfFooter('), APP.indexOf('if (!F.hideCopyright)'));
  if (src.indexOf('_drawVecLogo(doc, clVec, cx, PH - 27, clW, clH, leftLight ? [255, 255, 255] : null)') < 0) throw new Error('client logo not drawn as vector');
  if (src.indexOf('clVec ? clVec.w / clVec.h : cl.aspect') < 0) throw new Error('client box not at the viewBox aspect');
  if (src.indexOf("const vecMark = _brand ? brandVec : logos.farmboyVec;") < 0) throw new Error('brand logo not drawn as vector');
  const prep = APP.slice(APP.indexOf('function _footerLogoPrep('), APP.indexOf('function _svgDataUrlText('));
  if (prep.indexOf('ent.vec = _svgLogoToVec(_svgDataUrlText(dataUrl))') < 0) throw new Error('prep does not parse the SVG');
  // Own colour with no override; white when asked.
  const rec = window.__mkRec();
  window._drawVecLogo(rec, cvec, 0, 0, 22, 11, null);
  window._drawVecLogo(rec, cvec, 0, 0, 22, 11, [255, 255, 255]);
  const ps = rec.ops.filter(o => o.t === 'path');
  if (ps[0].st.fc !== 'rgb(29,59,111)') throw new Error('light page colour ' + ps[0].st.fc);
  if (ps[3].st.fc !== 'rgb(255,255,255)') throw new Error('dark page colour ' + ps[3].st.fc);
  if (ps[0].rule !== 'nonzero') throw new Error('preview rule ' + ps[0].rule);
});

check('real jsPDF: the client logo writes nonzero fills (f) and no image', () => {
  const doc = newDoc(); let imgs = 0; doc.addImage = function () { imgs++; };
  window._drawVecLogo(doc, cvec, 40, 513, 22, 11, null);
  const o = doc.output();
  if (imgs) throw new Error('image');
  if ((o.split(NL + 'f' + NL).length - 1) < 3) throw new Error('nonzero fills missing');
  if (o.indexOf('0.114 0.231 0.435 rg') < 0 && o.indexOf('0.11 0.23 0.44 rg') < 0) throw new Error('navy fill colour missing');
});

const bad = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
console.log('\n--- Summary ---');
console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
process.exit(bad.length ? 1 : 0);
