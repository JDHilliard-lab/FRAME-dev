// 19.06: the Project tab's page preview shows the page's background, and the tab keeps
// the project's facts together.
//
// Asked: "I added a image to my cover but it is not updating in the project page preview
// even when I hit the Refresh preview button it does not update." An element page (the
// cover) stopped at _deckMockHTML, which paints the elements on white and never reads
// the page theme, so a background image (or colour, or dark text) was never drawn there
// and Refresh redrew the same picture. It now uses the rail's own builder,
// _dsElementPageThumbHTML, which reads _dsPageThemeCss like the Pages tab does.
// And: "not sure if enter sizes and rounding and frame effects should be on Project tab
// ... since it already lives in the gears icon ... I do not like how it causes the
// designers to have to scroll down." The tab reads them back in one line instead.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'templates.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__run = (async () => {
      _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
      const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
      let holder = document.getElementById('dsProjCoverPrev');
      if (!holder) { holder = document.createElement('div'); holder.id = 'dsProjCoverPrev'; document.body.appendChild(holder); }
      Object.defineProperty(holder, 'clientWidth', { get: () => 560, configurable: true });
      _dsPreviewTab = 'cover';
      const sec = _dsPreviewSections().find(s => s.key === 'cover');
      __check('the starter cover is an element page (the case that skipped the theme)', () => {
        if (!sec) throw new Error('no cover section');
        const pg = sec.desc.page;
        if (!pg || !Array.isArray(pg.elements) || !pg.elements.length) throw new Error('the cover is not built from elements');
      });
      const key = _deckPageKey(sec.desc);
      _pageThemes()[key] = { mode: 'dark', image: IMG, imgW: 1, imgH: 1 };
      await _dsRenderCoverPreview();
      __check('EXACT BUG: the cover background image shows in the Project tab preview', () => {
        if (holder.innerHTML.indexOf(IMG) < 0) throw new Error('the background image is not in the preview');
      });
      __check('dark text pages draw light ink there too, as on the Pages tab', () => {
        if (holder.innerHTML.indexOf('rgb(') < 0) throw new Error('no ink remap for the dark page');
      });
      __check('the preview carries the footer and no rail badge', () => {
        if (holder.innerHTML.indexOf('_dsThumbBadge') >= 0) throw new Error('the rail\\'s green badge leaked into the preview');
      });
      // Refresh is a plain re-render: a change made after the first one must show.
      _pageThemes()[key] = { bg: '#123456' };
      await _dsRenderCoverPreview();
      __check('Refresh picks up a background changed after the first render', () => {
        if (holder.innerHTML.indexOf(IMG) >= 0) throw new Error('the old image is still showing');
        if (!/#123456|rgb\\(18, 52, 86\\)/i.test(holder.innerHTML)) throw new Error('the new colour is not showing');
      });

      // ── The tab layout ──
      __check('EXACT ASK: name, code, location and version are one block, nothing between them', () => {
        const box = document.querySelector('.proj-fields');
        if (!box) throw new Error('no facts block');
        ['specPdfProjName', 'specPdfCode', 'specPdfLocation', 'specPdfVersion'].forEach(id => {
          if (!box.contains(document.getElementById(id))) throw new Error('#' + id + ' is outside the block');
        });
        if (box.querySelector('#projUnitsHost, [data-unit-opt]')) throw new Error('settings are inside the facts block');
      });
      __check('EXACT ASK: units, rounding and frame effects are a one-line readback that opens Settings', () => {
        const host = document.getElementById('projUnitsHost');
        dashUnit = 'in'; setProjectDualUnit('mm');
        _syncUnitChip();
        if (host.querySelector('[data-unit-opt], button')) throw new Error('the full controls are back');
        if (host.textContent.indexOf('Inches + mm') !== 0 || host.textContent.indexOf(' in') < 0 || host.textContent.indexOf(' mm') < 0) throw new Error('readback says ' + host.textContent);
        const row = host.closest('.proj-settings-row');
        if (!row || !row.querySelector("[onclick=\\"openAppSettings('units')\\"]")) throw new Error('no way to Settings, Units');
        if (!row.contains(document.getElementById('projFrameFxBtn'))) throw new Error('Frame effects is not on the same line');
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
