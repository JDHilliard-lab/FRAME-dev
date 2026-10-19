// 19.39: THE CLIENT LOGO PRINTS BEFORE OR AFTER THE PROJECT LINE, WHITE ON A DARK PAGE,
// AND AN SVG LOGO ACTUALLY PRINTS.
//
// Asked for on the Ford SLC deck: choose whether the client logo sits before or after
// the footer's project text, and have one dark (SVG) logo follow the page's light/dark
// theme. Found doing it: an SVG logo was handed to the PDF writer as a JPEG, which
// failed silently, so it showed on screen and never printed.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};
  window.eval(src + `
    _autosaveToldUser = true;
    const DARK_SVG = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10"><rect width="30" height="10"/></svg>');
    window.__fx = {
      DARK_SVG: DARK_SVG,
      // jsdom never decodes images, so the prepared versions are put in the cache the
      // way _footerLogoPrep leaves them.
      prep: () => { _footerLogoCache[DARK_SVG] = { png: 'data:image/png;base64,PNGVERSION', white: 'data:image/png;base64,WHITEVERSION', aspect: 3 }; },
      unprep: () => { delete _footerLogoCache[DARK_SVG]; },
      set: (o) => { editorialContent.footerClientLogo = Object.assign({ dataUrl: DARK_SVG, aspect: 3 }, o || {}); },
      draw: (theme) => {
        _curFooter = { text: theme, leftTheme: theme, hideCopyright: true, hideLogo: true, hideClientLogo: false, hideFooter: false };
        const doc = { internal: { pageSize: { getWidth: () => 936, getHeight: () => 540 } }, ops: [],
          setFont() {}, setFontSize() {}, setTextColor() {}, getTextWidth: (s) => String(s).length * 3,
          text(s, x, y) { this.ops.push({ t: 'text', s: String(s), x: x }); },
          addImage(d, f, x) { this.ops.push({ t: 'img', d: String(d), f: f, x: x }); } };
        const realPng = _addPngImage;
        _addPngImage = (d2, s2, x) => { d2.ops.push({ t: 'img', d: String(s2), f: 'PNG', x: x }); };
        try { _drawPdfFooter(doc, {}, 7, { location: 'SLC', code: 'FORD', version: 'V7' }); } finally { _addPngImage = realPng; }
        return doc.ops;
      },
      cfg: () => _clientLogoCfg(),
    };
  `);
  console.error = quiet;
  const fx = window.__fx;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const parts = (ops) => ({ img: ops.find(o => o.t === 'img'), num: ops.find(o => o.t === 'text' && o.s === '7'), line: ops.find(o => o.t === 'text' && o.s.indexOf('FORD') >= 0) });

  await check('defaults: after the text, white on dark (nothing stored for either)', async () => {
    fx.set();
    const c = fx.cfg();
    if (c.before || c.asUploaded) throw new Error(JSON.stringify(c));
  });

  await check('EXACT REQUEST: AFTER puts the logo right of the project line', async () => {
    fx.prep(); fx.set();
    const p = parts(fx.draw('dark'));
    if (!p.img || !p.line) throw new Error('nothing drawn');
    if (!(p.img.x > p.line.x)) throw new Error('logo at ' + p.img.x + ' is not after the line at ' + p.line.x);
  });

  await check('EXACT REQUEST: BEFORE puts the logo first, and the page number and line move over', async () => {
    fx.prep(); fx.set({ place: 'before' });
    const p = parts(fx.draw('dark'));
    if (!(p.img.x < p.num.x && p.num.x < p.line.x)) throw new Error('order is img ' + p.img.x + ', number ' + p.num.x + ', line ' + p.line.x);
    if (!(p.num.x >= p.img.x + 3 * 11)) throw new Error('the page number overlaps the logo');
  });

  await check('EXACT REQUEST: on a DARK page a dark logo prints in its white version', async () => {
    fx.prep(); fx.set();
    const p = parts(fx.draw('light'));   // light text = a dark page
    if (p.img.d.indexOf('WHITEVERSION') < 0) throw new Error('printed ' + p.img.d.slice(0, 40));
  });

  await check('on a LIGHT page it prints as uploaded', async () => {
    fx.prep(); fx.set();
    const p = parts(fx.draw('dark'));
    if (p.img.d.indexOf('PNGVERSION') < 0) throw new Error('printed ' + p.img.d.slice(0, 40));
  });

  await check('"As uploaded" keeps a coloured logo\'s own colours on a dark page', async () => {
    fx.prep(); fx.set({ onDark: 'asis' });
    const p = parts(fx.draw('light'));
    if (p.img.d.indexOf('PNGVERSION') < 0) throw new Error('printed ' + p.img.d.slice(0, 40));
  });

  await check('EXACT BUG: an SVG logo never reaches the PDF writer as an SVG', async () => {
    fx.prep(); fx.set();
    const p = parts(fx.draw('dark'));
    if (p.img.d.indexOf('image/svg') >= 0) throw new Error('the SVG itself was handed over');
    if (p.img.f === 'JPEG') throw new Error('a PNG went in as JPEG');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
