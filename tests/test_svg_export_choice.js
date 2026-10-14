// 18.49: THE SVG FRAME CHOICE IS MADE IN THE EXPORT MENU, PER EXPORT. It was a stored
// Texture / Vector setting in Elevation settings, which also steered the elevation
// captures on PDF pages without saying so.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    window.__run = (async () => {
      const seen = [];
      exportElevSVG = async () => { seen.push('one:' + svgFrameMode); };
      bulkExportElevations = async (f) => { seen.push('all:' + svgFrameMode); };
      exportElevPNG = async () => {};
      const anchor = document.createElement('button'); document.body.appendChild(anchor);
      openElevExportMenu(anchor);
      const items = Array.from(document.querySelectorAll('.frame-menu button'));
      const lab = items.map(b => b.querySelector('span').textContent);
      document.querySelector('.frame-menu')._close();
      __check('EXACT ASK: the menu offers both frame styles, for this wall and for all walls', () => {
        ['SVG', 'SVG, vector frames', 'All as SVG', 'All as SVG, vector frames'].forEach(l => { if (lab.indexOf(l) < 0) throw new Error('missing ' + l + ' in ' + lab.join(' | ')); });
      });
      for (const l of ['SVG', 'SVG, vector frames', 'All as SVG', 'All as SVG, vector frames']) {
        openElevExportMenu(anchor);
        const b = Array.from(document.querySelectorAll('.frame-menu button')).find(x => x.querySelector('span').textContent === l);
        b.click(); await new Promise(r => setTimeout(r, 0));
      }
      __check('each export runs in the style it was picked with', () => {
        if (seen.join() !== 'one:texture,one:autocolor,all:texture,all:autocolor') throw new Error(seen.join());
      });
      __check('and the style is put back afterwards, so a PDF capture never inherits it', () => {
        if (svgFrameMode !== 'texture') throw new Error('left at ' + svgFrameMode);
      });
      let threw = false;
      try { await _svgExportAs('autocolor', async () => { throw new Error('boom'); }); } catch (e) { threw = true; }
      __check('...a failed export puts it back too', () => { if (!threw || svgFrameMode !== 'texture') throw new Error('mode ' + svgFrameMode + ' threw ' + threw); });
      __check('it is not a stored setting any more, and the old stored choice is cleared', () => {
        localStorage.setItem('svgFrameMode', 'autocolor');
        loadSvgFrameMode();
        if (svgFrameMode !== 'texture') throw new Error('an old stored vector choice came back');
        if (localStorage.getItem('svgFrameMode') !== null) throw new Error('the old key was left behind');
        if (document.getElementById('svgModeTexture')) throw new Error('the Texture / Vector control is still in Elevation settings');
      });
    })();
  `;
  try { window.eval(src + '\n' + testBlock); await window.__run; }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
