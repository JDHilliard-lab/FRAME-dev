// 18.47: ONE SETTINGS GEAR. Asked: units and frame effects are things designers should
// set up at the start, so put them behind a gear at the top, global for every area,
// reachable from the Frame Dashboard, Elevations and Deck Studio.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const gear = () => document.getElementById('appSettingsBtn');
    const modal = () => document.getElementById('appSettingsModal');
    const tabIs = (k) => { const a = modal().querySelectorAll('#appSettingsTabs .frame-tab.active'); return a.length === 1 && a[0].getAttribute('data-settings-tab') === k; };
    __check('EXACT ASK: the gear is in the header and opens Settings from all three views', () => {
      ['dashboard', 'elevation', 'deck'].forEach(v => {
        switchView(v);
        if (!gear() || gear().classList.contains('hdr-off')) throw new Error('no gear in ' + v);
        gear().click();
        if (!modal() || modal().style.display !== 'flex') throw new Error('gear did not open Settings in ' + v);
        modal().querySelector('[data-modal-close]').click();
        if (modal()) throw new Error('Done did not close it');
      });
    });
    __check('Settings has Units, Frame effects and Elevations, one tab lit', () => {
      openAppSettings('units');
      const keys = Array.from(modal().querySelectorAll('[data-settings-tab]')).map(b => b.getAttribute('data-settings-tab'));
      if (keys.join() !== 'units,fx,elev') throw new Error(keys.join());
      if (!tabIs('units')) throw new Error('units not lit');
      modal().querySelector('[data-settings-tab="fx"]').onclick();
      if (!tabIs('fx') || !modal().querySelector('input[data-fx="outer"]')) throw new Error('Frame effects tab has no sliders');
      modal().querySelector('[data-settings-tab="units"]').onclick();
      if (!modal().querySelector('[data-unit-opt="Enter sizes in:in"]')) throw new Error('Units tab has no unit controls');
      modal().remove();
    });
    __check('the Units tab really sets the units, and the header chip follows', () => {
      openAppSettings('units');
      modal().querySelector('[data-unit-opt="Second unit:cm"]').onclick();
      if (_specDualUnit() !== 'cm') throw new Error('second unit not set');
      if (document.getElementById('unitChipDual').textContent !== '+CM') throw new Error('chip reads ' + document.getElementById('unitChipDual').textContent);
      if (!modal().querySelector('[data-unit-opt="Second unit:cm"].active')) throw new Error('tab did not redraw lit');
      setProjectDualUnit('mm'); modal().remove();
    });
    __check('the units chip opens Settings on Units, the Deck button on Frame effects', () => {
      document.getElementById('unitChip').click();
      if (!modal() || !tabIs('units')) throw new Error('chip did not land on Units');
      modal().remove();
      document.getElementById('projFrameFxBtn').click();
      if (!modal() || !tabIs('fx')) throw new Error('Deck Studio button did not land on Frame effects');
      modal().remove();
    });
    __check('Elevations hands off to the drafting window, closing Settings first', () => {
      openAppSettings('elev');
      modal().querySelector('#appSettingsElevBtn').click();
      if (modal()) throw new Error('Settings is still open under the elevation window');
      if (document.getElementById('precisionModal').style.display !== 'flex') throw new Error('elevation settings did not open');
      document.getElementById('precisionModal').style.display = 'none';
    });
    __check('Escape closes Settings like every dialog', () => {
      openAppSettings();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (modal()) throw new Error('Escape left Settings open');
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
