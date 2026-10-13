// 18.35: opening a project whose codes have gaps closes them up (the house standard)
// AND SAYS SO. Codes are file names: a framed mockup PNG is named after its code and
// InDesign links to it by name, so a silent ART.004-A -> ART.003-A on open meant the
// next re-export broke links nobody knew had moved. Found by opening a real project,
// rewritten in older padded codes with a gap, through the real loader in Chrome.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const __tick = () => new Promise(r => setTimeout(r, 20));
    const __proj = (ids) => {
      const rows = ids.map(id => Object.assign(_cloneData(dashDefaultData), { id: id, location: 'Lobby' }));
      return JSON.stringify({ type: 'master-studio-v6', dashUnit: 'in', elevUnit: 'in', dashProjectData: rows,
        elevations: [{ id: 'e1', name: 'Lobby', w: 200, h: 108, frames: ids.map((id, i) => ({ id: id, letter: 'ABCDEFGH'[i], x: 10 + i * 30, y: 50, w: 24, h: 30, active: true })) }],
        editorial: {} });
    };
    const __modal = () => document.getElementById('infoModal');
    // No IndexedDB in jsdom: without this the autosave-failed notice opens a dialog of its own.
    _autosaveToldUser = true;
    window.__run = (async () => {
      let copied = null; _dsCopyText = (t) => { copied = t; };
      __modal().style.display = 'none';
      _readProjectText(__proj(['ART.001-A', 'ART.001-B', 'ART.004-A', 'ART.004-B', 'ART.007']));
      await __tick();
      __check('EXACT BUG: opening a gappy project still closes the gaps (the house standard)', () => {
        const ids = dashProjectData.map(r => r.id).join(' ');
        if (ids !== 'ART.001-A ART.001-B ART.002-A ART.002-B ART.003') throw new Error('codes are ' + ids);
      });
      __check('...and SAYS so, in a dialog listing every old and new code', () => {
        if (__modal().style.display !== 'flex') throw new Error('no dialog: the renumber was silent');
        const t = document.getElementById('infoModalTitle').innerText, b = document.getElementById('infoModalBody').innerText;
        if (t !== '3 item codes renumbered') throw new Error('title was ' + t);
        ['ART.004-A', 'ART.002-A', 'ART.007', 'ART.003'].forEach(c => { if (b.indexOf(c) < 0) throw new Error('the list does not name ' + c); });
        if (b.indexOf('ART.001-A') >= 0) throw new Error('an unchanged code was listed');
        if (b.indexOf('InDesign') < 0) throw new Error('it does not say what the rename means for linked PNGs');
      });
      __check('Copy list puts old and new, tab-separated, on the clipboard', () => {
        const cp = document.querySelector('#infoModalButtons [data-codes-copy]');
        if (!cp) throw new Error('no Copy list button');
        cp.onclick();
        if (!copied || copied.indexOf('ART.004-B\\tART.002-B') < 0) throw new Error('copied ' + JSON.stringify(copied));
      });
      __modal().style.display = 'none';
      _readProjectText(__proj(['ART.1A', 'ART.1B', 'ART.2']));
      await __tick();
      __check('a project already in order opens with no dialog at all', () => {
        if (__modal().style.display === 'flex') throw new Error('a dialog opened with nothing renamed: ' + document.getElementById('infoModalTitle').innerText);
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
