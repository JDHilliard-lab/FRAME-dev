// 18.48: ELEVATION SETTINGS IS ONE SCREEN. Asked: tighten the look, keep every
// paragraph behind a ? icon, make ticks the only line ends, avoid scrolling. (That it
// fits without scrolling is measured in headless Chrome; this pins the rules that
// keep it short.)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const M = () => document.getElementById('precisionModal');
    __check('EXACT ASK: no paragraphs in Elevation settings; explanations are ? dots', () => {
      if (M().querySelectorAll('p').length) throw new Error(M().querySelectorAll('p').length + ' paragraph(s) left');
      const dots = M().querySelectorAll('.help-dot');
      if (dots.length < 10) throw new Error('only ' + dots.length + ' help dots');
      dots.forEach(d => { const t = d.getAttribute('data-help') || ''; if (t.length < 15) throw new Error('a ? dot with no explanation: ' + t); });
      // The only free text left is the conditional "figure is hidden" hint.
      const notes = Array.from(M().querySelectorAll('div')).filter(d => !d.children.length && (d.textContent || '').trim().length > 60);
      if (notes.length) throw new Error('long text outside a ? dot: ' + notes[0].textContent.trim().slice(0, 60));
    });
    __check('EXACT ASK: ticks are the only line ends, with no control to change them', () => {
      if (M().querySelector('#annotEndsNone, #annotEndsTick')) throw new Error('the PLAIN / TICKS buttons are still there');
      if (M().textContent.indexOf('Line Ends') >= 0) throw new Error('a Line Ends row is still there');
      annotationStyle.dimEnds = 'none'; _normalizeAnnotationStyle();
      if (_dimEndStyle() !== 'tick') throw new Error('a stored plain style still draws plain');
    });
    __check('units are not set here twice: the window shows them and opens Settings > Units', () => {
      if (M().querySelector('#elevBtnInch, #elevDualUnitCb')) throw new Error('a units control is still in Elevation settings');
      setProjectDualUnit('mm'); openPrecisionModal();
      const t = document.getElementById('elevSetUnitsTxt').textContent;
      if (t.indexOf('IN') < 0 || t.indexOf('MM') < 0) throw new Error('units readout says ' + t);
      document.getElementById('elevSetUnitsBtn').click();
      if (M().style.display !== 'none') throw new Error('Elevation settings stayed open');
      if (!document.getElementById('appSettingsModal') || _appSettingsTab !== 'units') throw new Error('did not land on Settings > Units');
      document.getElementById('appSettingsModal').remove();
    });
    __check('three columns, one row rhythm, and every control still wired', () => {
      if (M().querySelectorAll('.es-grid > .es-col').length !== 3) throw new Error('not three columns');
      if (css.indexOf('.es-grid { display: grid; grid-template-columns: repeat(3,') < 0) throw new Error('the three-column grid rule is missing');
      ['annotColorSwatches', 'annotLineWeight', 'annotTickWeight', 'annotWeightLink', 'annotDashOn', 'annotDashSpacing', 'annotFontSize', 'annotFontFamily', 'annotWeightSemi',
       'imgCodeColorSwatches', 'imgCodeFontSize', 'imgCodeFontFamily', 'annotWfSize',
       'hangHeight', 'baseboardHeight', 'personShadeSwatches', 'figureDimToggle', 'gridSize', 'dragSnap', 'nudgeSmall', 'nudgeBig', 'snapEnabledToggle', 'dimSnapEnabledToggle']
        .forEach(id => { if (!M().querySelector('#' + id)) throw new Error('lost #' + id); });
      if (M().querySelectorAll('[data-modal-close]').length !== 1) throw new Error('needs exactly one close control');
    });
  `;
  try { window.eval('const css = ' + JSON.stringify(css) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
