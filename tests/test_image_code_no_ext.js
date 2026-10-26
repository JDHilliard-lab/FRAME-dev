// 19.78: an image code never prints a file extension. Asked on the Ford Admin Rouge
// rebuild: "do not include the file extension in the image, for example I do not want to
// see .jpg after all the image codes." Cleaned in the DATA: on opening a project, on CSV
// import and when typed. Dots inside a code are part of it.
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
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {}; showInfoModal = () => {};
    __check('EXACT ASK: a project whose codes carry .jpg opens with them gone, on rows and wall frames', () => {
      const r = _cloneData(dashDefaultData);
      Object.assign(r, { id: 'ART.2A', imageCode: 'FFI.F.DSP 50.1.jpg', artworkFile: 'FFI.F.DSP 50.1.jpg' });
      const r2 = _cloneData(dashDefaultData); Object.assign(r2, { id: 'ART.3A', imageCode: 'PANEL_2014-2017-P8.PNG' });
      const data = { type: 'master-studio-v6', dashUnit: 'in', elevUnit: 'in', dashProjectData: [r, r2],
        elevations: [{ id: 'w', name: 'W', wallW: 120, wallH: 100, frames: [{ id: 'ART.2A', letter: 'A', x: 1, y: 1, w: 10, h: 10, imageCode: 'FFI.F.DSP 50.1.jpg', active: true }] }],
        editorial: _editorialDefaults() };
      _readProjectText(JSON.stringify(data));
      if (dashProjectData[0].imageCode !== 'FFI.F.DSP 50.1') throw new Error('row code ' + dashProjectData[0].imageCode);
      if (dashProjectData[0].artworkFile !== 'FFI.F.DSP 50.1') throw new Error('artworkFile ' + dashProjectData[0].artworkFile);
      if (dashProjectData[1].imageCode !== 'PANEL_2014-2017-P8') throw new Error('upper-case extension kept: ' + dashProjectData[1].imageCode);
      if (elevations[0].frames[0].imageCode !== 'FFI.F.DSP 50.1') throw new Error('wall frame code ' + elevations[0].frames[0].imageCode);
    });
    __check('dots in a code are part of it, and only a trailing image extension goes', () => {
      const cases = { 'FFI.F.DSP 50.1': 'FFI.F.DSP 50.1', 'ART.001.2': 'ART.001.2', 'WALL.003_wallcovering-only.png': 'WALL.003_wallcovering-only',
        'scan.tif': 'scan', 'scan.TIFF': 'scan', 'design.ai': 'design', 'jpg.notes': 'jpg.notes', 'TBD': 'TBD' };
      Object.keys(cases).forEach(k => { if (_imgCodeClean(k) !== cases[k]) throw new Error(k + ' -> ' + _imgCodeClean(k)); });
    });
    __check('typed in the table or the form, the extension is dropped', () => {
      const r = _cloneData(dashDefaultData); r.id = 'ART.9'; dashProjectData = [r]; dashSelectedRowIndex = 0;
      dashHtIn(0, 'imageCode', 'IMG_0012.jpeg', true);
      if (dashProjectData[0].imageCode !== 'IMG_0012') throw new Error('table kept ' + dashProjectData[0].imageCode);
      loadDashDataIntoControls(dashProjectData[0]);
      document.getElementById('m_imageCode').value = 'IMG_0013.png';
      syncDashAndCalculate();
      if (dashProjectData[0].imageCode !== 'IMG_0013') throw new Error('form kept ' + dashProjectData[0].imageCode);
    });
  `;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
