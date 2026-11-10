// 20.32: WALL COLOUR. Designers were taking FRAME's elevations into InDesign to paint the
// walls. A wall carries elev.wallColor ('#rrggbb'); the editor wall, the SVG export, the PNG
// export and the spec thumbnail all read it through _wallColor. Cleared = key deleted.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const fills = [];
  window.HTMLCanvasElement.prototype.getContext = function () {
    const ctx = { scale(){}, fillRect(x, y, w, h){ fills.push({ style: ctx.fillStyle, x, y, w, h }); }, drawImage(){}, strokeRect(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, setTransform(){}, resetTransform(){} };
    // Anything else the renderer calls (gradients, patterns, ...) is a quiet no-op.
    const any = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : any, apply: () => any });
    return new Proxy(ctx, { get: (o, k) => (k in o ? o[k] : any), set: (o, k, v) => { o[k] = v; return true; } });
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const block = `
    _autosaveToldUser = true;
    scheduleAutosave = () => {};
    window.__setup = (wall) => {
      elevations = [Object.assign({ id: 'w1', name: 'A', wallW: 144, wallH: 108, frames: [] }, wall || {})];
      currentElevIndex = 0;
      _wallFinishSync();
    };
    window.__paint = () => { const p = document.getElementById('wall-paint'); return p ? { bg: p.style.background, h: p.style.height, first: p.parentElement && p.parentElement.firstChild === p } : null; };
    window.__draw = () => { try { drawElevAll(); } catch (e) { window.__drawErr = e.message; } return window.__paint(); };
    window.__bb = (inches) => { elevBaseboardIn = inches; };
    window.__api = { _wallColor, _wallColorPaint, setElevWallColor, CAT_WALL_FIELDS, renderElevationToCanvas,
      get elev() { return elevations[0]; } };
  `;
  const quiet = console.error; console.error = () => {};
  window.eval(src + '\n' + block);
  console.error = quiet;
  const A = window.__api;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('_wallColor reads a hex colour and ignores junk', async () => {
    if (A._wallColor({ wallColor: '#1F3A5C' }) !== '#1f3a5c') throw new Error('hex not read');
    if (A._wallColor({ wallColor: 'navy' }) !== '') throw new Error('junk accepted');
    if (A._wallColor({}) !== '') throw new Error('blank wall coloured');
  });
  await check('a swatch dot sets the wall colour and paints the editor wall; No paint deletes the key and unpaints it', async () => {
    window.__setup({});
    const dots = document.querySelectorAll('#wallColorSwatches button');
    if (dots.length < 6) throw new Error('only ' + dots.length + ' swatch dots');
    const navy = Array.from(dots).find(d => /1f2a44/i.test(d.title));
    navy.click();
    if (A.elev.wallColor !== '#1f2a44') throw new Error('not stored: ' + A.elev.wallColor);
    const p = window.__paint();
    if (!p || !/rgb\(31, 42, 68\)|#1f2a44/i.test(p.bg)) throw new Error('wall shows ' + JSON.stringify(p));
    if (!p.first) throw new Error('paint layer is not first in the wall, so it would cover the art');
    if (!/setElevWallColor\(''\)/.test(document.getElementById('wallColorNone').getAttribute('onclick') || '')) throw new Error('No paint does not clear');
    A.setElevWallColor('');
    if ('wallColor' in A.elev) throw new Error('key kept after No paint');
    if (window.__paint()) throw new Error('wall still painted');
  });
  await check('the picker is the app\'s own: round swatch dots and the colour wheel, no plain square', async () => {
    const sw = document.getElementById('wallColor');
    if (sw.classList.contains('color-swatch-flat') || sw.getAttribute('style')) throw new Error('the wheel is restyled: ' + sw.className + ' ' + sw.getAttribute('style'));
    const dot = document.querySelector('#wallColorSwatches button');
    if (!dot || !/border-radius:\s*50%/.test(dot.getAttribute('style'))) throw new Error('swatches are not the round dots');
    if (sw.parentElement !== document.getElementById('wallColorSwatches').parentElement) throw new Error('wheel not on the swatch row');
  });
  await check('No paint is lit on a plain wall; a colour lights its own dot instead', async () => {
    window.__setup({});
    const none = document.getElementById('wallColorNone');
    if (!/ui-active/.test(none.style.borderColor)) throw new Error('No paint not lit: ' + none.style.borderColor);
    A.setElevWallColor('#b9b8b2');
    if (/ui-active/.test(none.style.borderColor)) throw new Error('No paint still lit');
    const lit = Array.from(document.querySelectorAll('#wallColorSwatches button')).filter(d => /ui-active/.test(d.style.borderColor || d.getAttribute('style')));
    if (lit.length !== 1 || !/b9b8b2/i.test(lit[0].title)) throw new Error('lit: ' + lit.map(d => d.title));
    A.setElevWallColor('');
  });
  await check('switching walls shows that wall\'s colour in the swatch', async () => {
    window.__setup({ wallColor: '#c8a27a' });
    if (document.getElementById('wallColor').value !== '#c8a27a') throw new Error('swatch shows ' + document.getElementById('wallColor').value);
  });
  await check('the spec thumbnail fills the wall with its colour; a plain wall gets no such fill', async () => {
    fills.length = 0;
    await A.renderElevationToCanvas({ id: 'w1', name: 'A', wallW: 144, wallH: 108, frames: [{ id: 'ART.1', x: 50, y: 37, w: 40, h: 30, active: true }], wallColor: '#1f3a5c' }, null, {});
    if (!fills.some(f => f.style === '#1f3a5c' && f.w > 0)) throw new Error('no wall fill; fills: ' + JSON.stringify(fills.map(f => f.style)));
    fills.length = 0;
    await A.renderElevationToCanvas({ id: 'w1', name: 'A', wallW: 144, wallH: 108, frames: [{ id: 'ART.1', x: 50, y: 37, w: 40, h: 30, active: true }] }, null, {});
    if (fills.some(f => f.style === '#1f3a5c')) throw new Error('plain wall coloured');
  });
  await check('the SVG export draws the colour first in the back layer, before the client elevation', async () => {
    const i = src.indexOf('WALL COLOUR (20.32): the very first thing');
    const j = src.indexOf('CLIENT ELEVATION AS THE DRAWING (20.31)');
    if (i < 0 || j < 0 || i > j) throw new Error('order wrong ' + i + ' ' + j);
    if (!/backLayer\.push\(\`<rect data-wall-color[^\n]*fill="\$\{_wc\}"/.test(src)) throw new Error('no filled rect pushed');
  });
  await check('the wall colour rect is well-formed XML (a bare attribute fails the whole capture)', async () => {
    const m = src.match(/backLayer\.push\(`(<rect data-wall-color[^`]*)`\)/);
    if (!m) throw new Error('rect not found');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + m[1].replace(/\$\{[^}]+\}/g, '1') + '</svg>';
    const doc = new window.DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('not well-formed: ' + m[1]);
  });
  await check('EXACT ASK: the baseboard is not painted: the paint stops at its top in the editor, thumbnail and SVG', async () => {
    window.__bb(6);
    window.__setup({ wallColor: '#c8a27a', frames: [] });
    const p = window.__draw();
    if (!p) throw new Error('not painted' + (window.__drawErr ? ' (' + window.__drawErr + ')' : ''));
    const want = (1 - 6 / 108) * 100;
    if (Math.abs(parseFloat(p.h) - want) > 0.01) throw new Error('paint height ' + p.h + ', want ' + want.toFixed(3) + '%');
    fills.length = 0;
    await A.renderElevationToCanvas({ id: 'w1', name: 'A', wallW: 144, wallH: 108, frames: [{ id: 'ART.1', x: 50, y: 37, w: 40, h: 30, active: true }], wallColor: '#c8a27a' }, null, {});
    const f = fills.find(x => x.style === '#c8a27a'), wallPx = fills.find(x => x.style === '#c8a27a') && f.h / (1 - 6 / 108);
    if (!f || Math.abs(f.h / wallPx - (1 - 6 / 108)) > 1e-6 || !(f.h < f.w * 108 / 144)) throw new Error('thumbnail paint ' + JSON.stringify(f));
    if (!/_wr\.h \* \(1 - _wallPaintBaseFrac\(/.test(src)) throw new Error('SVG rect not shortened to the baseboard');
    window.__bb(0);
    window.__setup({ wallColor: '#c8a27a', frames: [] });
    const p0 = window.__draw();
    if (Math.abs(parseFloat(p0.h) - 100) > 0.01) throw new Error('no baseboard: paint ' + p0.h + ', want 100%');
  });
  await check('the PNG export leaves the paint layer alone (only the wall\'s background goes clear)', async () => {
    if (/wall\.style\.background = _wallColor\(/.test(src)) throw new Error('something still paints #wall\'s background');
  });
  await check('a redraw keeps a painted wall painted and a plain one bare', async () => {
    window.__bb(4);
    window.__setup({ wallColor: '#c8a27a', frames: [] });
    const p = window.__draw();
    if (!p || !/rgb\(200, 162, 122\)|#c8a27a/i.test(p.bg)) throw new Error('redraw shows ' + JSON.stringify(p) + (window.__drawErr ? ' (' + window.__drawErr + ')' : ''));
    window.__setup({ frames: [] });
    if (window.__draw()) throw new Error('plain wall painted');
  });
  await check('catalogue options inherit the wall colour', async () => {
    if (A.CAT_WALL_FIELDS.indexOf('wallColor') < 0) throw new Error('not in CAT_WALL_FIELDS');
  });

  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
