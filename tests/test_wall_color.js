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
    window.__draw = () => { try { drawElevAll(); } catch (e) { window.__drawErr = e.message; } return document.getElementById('wall').style.background; };
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
  await check('the swatch sets the wall colour and paints the editor wall; Clear deletes the key and unpaints it', async () => {
    window.__setup({});
    A.setElevWallColor('#1F3A5C');
    if (A.elev.wallColor !== '#1f3a5c') throw new Error('not stored: ' + A.elev.wallColor);
    const wall = document.getElementById('wall');
    if (!/rgb\(31, 58, 92\)|#1f3a5c/i.test(wall.style.background)) throw new Error('wall shows ' + JSON.stringify(wall.style.background));
    if (document.getElementById('wallColorClear').style.display === 'none') throw new Error('Clear hidden on a painted wall');
    A.setElevWallColor('');
    if ('wallColor' in A.elev) throw new Error('key kept after clear');
    if (wall.style.background) throw new Error('wall still painted: ' + wall.style.background);
    if (document.getElementById('wallColorClear').style.display !== 'none') throw new Error('Clear shown on a plain wall');
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
  await check('the PNG export keeps a painted wall instead of making it transparent', async () => {
    if (src.indexOf("wall.style.background = _wallColor(elevations[currentElevIndex]) || 'transparent'") < 0) throw new Error('PNG export clears the colour');
  });
  await check('a redraw of the elevation paints a coloured wall and leaves a plain one grey', async () => {
    window.__setup({ wallColor: '#c8a27a', frames: [] });
    document.getElementById('wall').style.background = '';
    const bg = window.__draw();
    if (!/rgb\(200, 162, 122\)|#c8a27a/i.test(bg)) throw new Error('redraw shows ' + JSON.stringify(bg) + (window.__drawErr ? ' (' + window.__drawErr + ')' : ''));
    window.__setup({ frames: [] });
    const bg2 = window.__draw();
    if (bg2) throw new Error('plain wall painted ' + bg2);
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
