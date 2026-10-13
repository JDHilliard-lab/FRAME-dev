// 18.40: the dock groups what was doubled up. Text box sat beside a Notes menu that
// already offered Text box and Paragraph; an Upload image button sat beside a Shapes
// menu that already offered Upload image. And the selection Settings button wore a SUN,
// the same icon as the light/dark theme toggle in the header, so it read as a theme
// switch: it is a gear now.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const labels = (id) => Array.from(document.querySelectorAll('#' + id + ' .ds-fly-item')).map(b => b.textContent);
    __check('EXACT ASK: one Text tool, and its menu has Text box and Paragraph', () => {
      if (document.getElementById('dsDockText')) throw new Error('the separate T button is back');
      const t = document.getElementById('dsDockNotes');
      if (!t || (t.title || '').indexOf('Text (T)') !== 0) throw new Error('the merged button does not say it is the Text tool');
      _dsOpenTextMenu({ stopPropagation() {}, preventDefault() {} });
      const l = labels('dsTextMenu');
      if (!l.some(s => s.indexOf('Text box') === 0) || !l.some(s => s.indexOf('Paragraph') === 0)) throw new Error('menu: ' + l.join(' | '));
      document.getElementById('dsTextMenu').remove();
    });
    __check('EXACT ASK: one Shapes tool, and its menu has Upload image', () => {
      if (document.getElementById('dsDockImage')) throw new Error('the separate image button is back');
      _dsOpenPlaceholderMenu({ stopPropagation() {}, preventDefault() {} });
      const m = Array.from(document.body.children).find(e => e.querySelector && e.querySelector('.ds-fly-item') && e.textContent.indexOf('Upload image') >= 0);
      if (!m) throw new Error('no Upload image in the shapes menu');
      m.remove();
    });
    __check('EXACT ASK: the selection settings button is a gear, not the theme sun', () => {
      const svg = document.querySelector('#dsSelSettings svg').innerHTML;
      const sun = document.querySelector('.theme-icon-sun').innerHTML;
      if (svg === sun) throw new Error('it still wears the sun');
      if (svg.indexOf('M19.4 15') < 0) throw new Error('not the gear outline');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
