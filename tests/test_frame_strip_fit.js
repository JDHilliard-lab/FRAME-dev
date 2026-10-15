// 18.89: THE FRAME STRIP SHRINKS BEFORE IT GIVES WAY.
//
// Reported: on a Group A/B/C page with three mouldings, ticking Moulding profile made
// every frame CORNER disappear too; unticking it brought the corners back. The strip
// returned null whenever corners + profiles were wider than the band, so it dropped
// whole. Now, in order: draw the images smaller (bottom-aligned, codes full size on the
// caption baseline), then leave the profiles off and keep the corners, and only then
// give way. What happened is recorded per page so the panel can say "no room".
//
// Checks run inside the same eval as app.js (CanvasPdfRec and _frameStripFit are not
// window properties), written as a plain function appended by .toString().
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];

function inApp() {
  const out = [];
  const ok = (label, fn) => { try { fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
  // Three mouldings, each with a tall corner photo and a wide profile drawing.
  const corner = { naturalWidth: 45, naturalHeight: 120 };
  const prof = { naturalWidth: 110, naturalHeight: 120 };
  const frames = ['MICH 243-11', 'MICH 204-20', 'MICH 43-29'].map(c => ({ code: c, img: corner, profileImg: prof, color: '#888888' }));
  const H = 100, TOP = 400, RIGHT = 900;
  const draw = (maxW, extra) => {
    const rec = new CanvasPdfRec(936, 540); const imgs = [];
    const real = rec.addImage.bind(rec);
    rec.addImage = function (src, fmt, x, y, w, h) { imgs.push({ src: src, x: x, y: y, w: w, h: h }); return real(src, fmt, x, y, w, h); };
    const left = _drawFrameStrip(rec, frames, Object.assign({ right: RIGHT, top: TOP, height: H, maxW: maxW, corner: true, profile: true }, extra || {}));
    const texts = (rec.ops || []).filter(o => o && o.t === 'text');
    return { left: left, imgs: imgs, corners: imgs.filter(i => i.src === corner), profiles: imgs.filter(i => i.src === prof), texts: texts };
  };
  const full = _drawFrameStrip(new CanvasPdfRec(936, 540), frames, { right: 0, top: 0, height: H, maxW: Infinity, measure: true, corner: true, profile: true });
  const imgH = H - 9;

  ok('a strip with room draws full size, as before', () => {
    const r = draw(full + 1);
    if (r.left == null) throw new Error('refused a box it fits');
    if (r.corners.length !== 3 || r.profiles.length !== 3) throw new Error(r.corners.length + ' corners, ' + r.profiles.length + ' profiles');
    r.imgs.forEach(i => { if (Math.abs(i.h - imgH) > 0.01 || Math.abs(i.y - TOP) > 0.01) throw new Error('not full size: y ' + i.y + ' h ' + i.h); });
  });

  _curPageKey = 'test:strip';
  ok('EXACT BUG: too wide at full size, it SHRINKS instead of dropping every corner', () => {
    const r = draw(full * 0.8);
    if (r.left == null) throw new Error('the strip vanished (corners and profiles both gone)');
    if (r.corners.length !== 3) throw new Error('corners drawn: ' + r.corners.length);
    if (r.profiles.length !== 3) throw new Error('profiles drawn: ' + r.profiles.length + ' (they fit when shrunk)');
    r.imgs.forEach(i => {
      if (!(i.h < imgH)) throw new Error('image not shrunk: h ' + i.h);
      if (Math.abs(i.y + i.h - (TOP + imgH)) > 0.01) throw new Error('not bottom-aligned: ends at ' + (i.y + i.h) + ', want ' + (TOP + imgH));
    });
    const lastRight = Math.max.apply(null, r.imgs.map(i => i.x + i.w));
    if (lastRight > RIGHT + 0.01) throw new Error('ran past its right edge: ' + lastRight);
    if (r.left < RIGHT - full * 0.8 - 0.01) throw new Error('wider than the band it was given');
    if (_frameStripFit['test:strip'] !== 'scaled') throw new Error('recorded ' + _frameStripFit['test:strip']);
  });

  ok('codes keep their size and baseline when the images shrink', () => {
    const a = draw(full + 1).texts, b = draw(full * 0.8).texts;
    if (a.length !== 3 || b.length !== 3) throw new Error('code labels: ' + a.length + ' / ' + b.length);
    if (Math.abs(a[0].y - b[0].y) > 0.01) throw new Error('baseline moved: ' + a[0].y + ' -> ' + b[0].y);
  });

  ok('when even shrunk it cannot fit, PROFILES go and the corners stay', () => {
    const r = draw(full * 0.42);
    if (r.left == null) throw new Error('dropped the corners too');
    if (r.corners.length !== 3) throw new Error('corners drawn: ' + r.corners.length);
    if (r.profiles.length !== 0) throw new Error('profiles still drawn: ' + r.profiles.length);
    if (_frameStripFit['test:strip'] !== 'noProfile') throw new Error('recorded ' + _frameStripFit['test:strip']);
  });

  ok('a measure is always full size (the left column shrinks its own row)', () => {
    const m = _drawFrameStrip(new CanvasPdfRec(936, 540), frames, { right: 0, top: 0, height: H, maxW: 10, measure: true, corner: true, profile: true });
    if (Math.abs(m - full) > 0.01) throw new Error('measure ' + m + ' vs ' + full);
  });

  ok('a band too narrow for even the codes still gives way, and says so', () => {
    const r = draw(30);
    if (r.left != null || r.imgs.length) throw new Error('drew into a 30pt band');
    if (_frameStripFit['test:strip'] !== 'none') throw new Error('recorded ' + _frameStripFit['test:strip']);
  });

  ok('the Show on page panel warns beside the tick that lost out', () => {
    const src = _dsSpecSlotsInto.toString();
    if (src.indexOf('_frameStripFit[') < 0) throw new Error('the panel does not read what the page drew');
    if (src.indexOf('data-noroom') < 0) throw new Error('no no-room marker');
    if (src.indexOf("k === 'profile' && (_fit === 'noProfile'") < 0) throw new Error('profile tick not warned on noProfile');
  });
  window.__stripOut = out;
}

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s || '').length * 4 }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error, warn = console.warn; console.error = () => {}; console.warn = () => {};
try { window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();'); }
catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
console.error = quiet; console.warn = warn;
(window.__stripOut || []).forEach(r => results.push(r));
let fail = 0;
results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
console.log(NL + '--- Summary ---');
console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
setTimeout(() => process.exit(fail ? 1 : 0), 50);
