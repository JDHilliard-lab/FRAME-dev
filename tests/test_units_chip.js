// 18.37: units are ONE chip in the header and ONE second-unit setting per project.
// Before: an IN/CM/MM trio in the header, a Dual units checkbox in each spec panel
// (saved in the project) and a separate elevation dual-unit switch saved per COMPUTER,
// so one project could print mm on one designer's elevations and not another's.
// Asked for: "my designers are going to like to include inches and mm in everything",
// so a NEW project starts at IN + MM; an existing one keeps what it had.
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
    _autosaveToldUser = true;
    // 18.57: no header chip any more; this reads the same state the chip used to show.
    const chip = () => String(dashUnit || 'in').toUpperCase() + (_specDualUnit() ? '+' + _specDualUnit().toUpperCase() : '');
    const proj = (ed, extra) => JSON.stringify(Object.assign({ type: 'master-studio-v6', dashUnit: 'in', elevUnit: 'in', dashProjectData: [], elevations: [], editorial: ed }, extra || {}));

    __check('the header has no units chip (18.57: units live in Settings) and no IN/CM/MM trio', () => {
      if (document.getElementById('unitChip')) throw new Error('the units chip is back in the header');
      if (document.getElementById('globalUnitToggle')) throw new Error('the old trio is still in the header');
    });
    __check('EXACT ASK: a NEW project starts at inches + mm, and the chip says so', () => {
      editorialContent.specDualUnit = '';
      _startNewProject({ name: 'Test', unit: 'in' });
      if (_specDualUnit() !== 'mm') throw new Error('new project second unit is ' + JSON.stringify(_specDualUnit()));
      if (chip() !== 'IN+MM') throw new Error('chip reads ' + chip());
    });
    __check('ONE setting: elevations print the same second unit as spec pages', () => {
      setProjectDualUnit('cm');
      if (_elevDualUnit() !== 'cm') throw new Error('elevation reads ' + _elevDualUnit());
      if (elevFmtU(24).indexOf('cm)') < 0) throw new Error('an elevation dim printed ' + elevFmtU(24));
      setProjectDualUnit('');
      if (_elevDualUnit() !== '' || elevFmtU(24).indexOf('(') >= 0) throw new Error('turning it off did not reach the elevation');
      if (chip() !== 'IN') throw new Error('chip reads ' + chip());
    });
    __check('the chip Settings tab and the Project tab are the same controls, and they work', () => {
      // 18.47: the chip opens Settings on its Units tab (was a popover).
      openUnitMenu();
      const m = document.getElementById('appSettingsModal');
      if (!m || _appSettingsTab !== 'units') throw new Error('the chip did not open Settings on Units');
      const b = m.querySelector('[data-unit-opt="Second unit:mm"]');
      if (!b) throw new Error('no + MM option in the menu');
      b.onclick();
      if (_specDualUnit() !== 'mm') throw new Error('menu did not set mm');
      const host = document.getElementById('projUnitsHost');
      if (!host || !host.querySelector('[data-unit-opt="Second unit:mm"].active')) throw new Error('the Project tab does not show the same choice');
      if (!host.querySelector('[data-unit-opt="Enter sizes in:in"].active')) throw new Error('the Project tab does not show the entry unit');
      m.remove();
    });
    __check('an EXISTING project opens with what it had: no field means no second unit', () => {
      _readProjectText(proj({ specTemplate: 'frameSpecDetail' }));
      if (_specDualUnit() !== '') throw new Error('an old project gained ' + _specDualUnit());
      _readProjectText(proj({ specDualUnit: 'cm' }));
      if (_specDualUnit() !== 'cm') throw new Error('a saved cm was lost');
    });
    __check('a file whose ELEVATIONS printed mm (old per-computer setting) keeps printing mm', () => {
      _readProjectText(proj({}, { elevDualUnit: 'mm' }));
      if (_specDualUnit() !== 'mm') throw new Error('elevation mm was dropped on load');
    });
    __check('the save still writes elevDualUnit, so an older build reading only that key matches', () => {
      setProjectDualUnit('mm');
      const S = window.__appSrc;
      if (S.indexOf('elevDualUnit: _specDualUnit()') < 0) throw new Error('save no longer writes the legacy key');
    });
    __check('the spec panels show a units line with Change, not a second checkbox', () => {
      const host = document.createElement('div'); _dsDualUnitInto(host);
      if (host.querySelector('input[type=checkbox]')) throw new Error('the panel still has its own checkbox');
      if (!host.querySelector('#dsUnitsChange')) throw new Error('no Change button');
      if ((host.textContent || '').indexOf('inches + mm') < 0) throw new Error('readout says ' + host.textContent);
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
