// 18.36: the header shows a control only in the views where it does something, and
// Versions / Bulk Images moved to where their job is.
//   - The dashboard layout toggle only means something in the Frame Dashboard.
//   - Drop shadows change frames in the Dashboard AND on elevations (walls and their
//     PNG exports), never on a Deck page.
//   - Versions is about saving: it sits in the menu beside Save Project.
//   - Bulk Images relinks artwork onto pieces: it sits in the Dashboard row by Import CSV.
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
    const vis = (id) => !document.getElementById(id).classList.contains('hdr-off');
    __check('EXACT ASK: the dashboard layout toggle shows only in the Frame Dashboard', () => {
      switchView('dashboard'); if (!vis('dashViewToggle')) throw new Error('hidden in the dashboard');
      switchView('elevation'); if (vis('dashViewToggle')) throw new Error('shown in Elevations');
      switchView('deck'); if (vis('dashViewToggle')) throw new Error('shown in Deck Studio');
    });
    // 18.47: the Dashboard/Elevations-only frame effects button became the Settings gear,
    // shown in EVERY view (frame effects reach spec pages too, so the Deck needs it).
    __check('the Settings gear shows in every view, and the old shadow button is gone', () => {
      if (document.getElementById('outerShadowToggle')) throw new Error('the old frame effects button is still in the header');
      ['dashboard', 'elevation', 'deck'].forEach(v => { switchView(v); if (!vis('appSettingsBtn')) throw new Error('gear hidden in ' + v); });
    });
    __check('the theme toggle, help, units, undo and save are in every view', () => {
      switchView('deck');
      ['helpBtn', 'appSettingsBtn', 'unitChip', 'undoBtn', 'saveProjectBtn', 'saveMenuBtn'].forEach(id => { const e = document.getElementById(id); if (!e || e.classList.contains('hdr-off')) throw new Error(id + ' missing in Deck Studio'); });
    });
    __check('Versions moved into the Save menu, which also offers Save and Save As', () => {
      let opened = 0; openVersionsModal = () => { opened++; };
      openSaveMenu();
      const m = document.getElementById('saveMenu');
      if (!m) throw new Error('no Save menu');
      const items = Array.from(m.querySelectorAll('.ds-fly-item'));
      const labels = items.map(b => b.textContent);
      ['Save', 'Save As', 'Versions'].forEach(l => { if (!labels.some(t => t.indexOf(l) === 0)) throw new Error('menu lacks ' + l + ': ' + labels.join(' | ')); });
      items.find(b => b.textContent.indexOf('Versions') === 0).onclick();
      if (opened !== 1) throw new Error('Versions item does not open Versions');
      if (document.getElementById('saveMenu')) throw new Error('menu stayed open after choosing');
    });
    __check('Versions and Bulk Images are no longer header buttons; Bulk Images is in the dashboard Import menu', () => {
      const header = document.getElementById('saveProjectBtn').closest('.save-split').parentElement;
      Array.from(header.querySelectorAll(':scope > button')).forEach(b => { const t = (b.textContent || '').trim(); if (t === 'Versions' || t === 'Bulk Images') throw new Error(t + ' is still in the header'); });
      // 18.52: the dashboard row groups it under Import (openDashMenu).
      const imp = document.querySelector('#view-dashboard .dash-left-pane #dashImportMenuBtn');
      if (!imp) throw new Error('no Import menu in the dashboard row');
      let called = 0; const real = window.openBulkReplaceModal; window.openBulkReplaceModal = () => { called++; };
      try {
        openDashMenu(imp, 'import');
        const it = Array.from(document.querySelectorAll('.frame-menu button')).find(x => (x.textContent || '').indexOf('Bulk Images') === 0);
        if (!it) throw new Error('Bulk Images is not in the dashboard Import menu');
        it.click();
      } finally { window.openBulkReplaceModal = real; }
      if (called !== 1) throw new Error('Bulk Images item does not open Bulk Images');
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
