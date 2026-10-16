// 19.07: the Frame effects panel fits without scrolling.
//
// Asked: "my frame effects pop up window is scrolling, can we fix that I do not want
// designers to have to scroll". Inside Settings the preview and the sliders were a
// wrapping flex row, so the sliders dropped under the preview, and every slider had a
// help line beneath it: about a screen and a half. Now a two-column grid (it cannot
// wrap) with the help in ? dots. Measured in Chrome: no scroll down to 1366x768.
// jsdom has no layout, so this pins the structure that produces the fit.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {};
    const m = document.createElement('div'); m.id = 'appSettingsModal'; document.body.appendChild(m);
    const host = document.createElement('div'); m.appendChild(host);
    _frameFxInto(host);
    const body = document.getElementById('frameFxBody');
    __check('EXACT ASK: preview and sliders are two columns that cannot wrap', () => {
      if (body.style.display !== 'grid') throw new Error('the body is ' + body.style.display + ', which can wrap the sliders under the preview');
      if ((body.style.gridTemplateColumns || '').split('minmax').length - 1 !== 2) throw new Error('not two columns: ' + body.style.gridTemplateColumns);
    });
    __check('the preview has a fixed height, not a 300px floor that grows', () => {
      const pv = document.getElementById('frameFxPreview');
      if (pv.style.height !== '300px' || pv.style.minHeight) throw new Error('preview height ' + pv.style.height + ' / min ' + pv.style.minHeight);
    });
    __check('EXACT ASK: no help line under each slider; the help is a ? dot', () => {
      const rows = host.querySelectorAll('[data-fx-row]');
      if (rows.length !== FRAME_FX_ROWS.length) throw new Error(rows.length + ' rows');
      rows.forEach(r => {
        if (r.children.length !== 2) throw new Error(r.getAttribute('data-fx-row') + ' has ' + r.children.length + ' lines (label + slider expected)');
        const d = r.querySelector('.help-dot');
        if (!d || !d.title) throw new Error(r.getAttribute('data-fx-row') + ' lost its explanation');
      });
    });
    __check('syncing the values writes the % and leaves the ? dots alone', () => {
      frameFx.outer = 1.8; _frameFxSyncRows();
      const r = host.querySelector('[data-fx-row="outer"]');
      if (r.querySelector('[data-fx-val]').textContent !== '180%') throw new Error('value reads ' + r.querySelector('[data-fx-val]').textContent);
      host.querySelectorAll('.help-dot').forEach(d => { if (d.textContent !== '?') throw new Error('a help dot reads ' + d.textContent); });
      frameFx.outer = 1;
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
