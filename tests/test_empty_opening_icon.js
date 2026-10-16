// 19.08: an empty opening shows an add-image icon, not its size.
//
// Asked: "I don't know if I need the art dims to be in there anymore in the elevations or
// in the dashboard preview, maybe if its empty an add image icon would be more
// appropriate?" The size ("10" x 15"") repeated the OD/spacing dims and the dashboard's
// own fields, and broke into a scramble on small openings. Dashboard: a button into the
// same upload as "Upload / Drag & Drop Here". Elevation: a cue only (a click on the wall
// selects), covered in test_elev_wireframe_labels.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    dashUnit = 'in';
    dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.1B', extW: 17, extH: 22, fW: 2, fType: 'color', artworkUrl: '' })];
    dashSelectedRowIndex = 0;
    loadDashDataIntoControls(dashProjectData[0]);
    updateDashVisualsFromDOM();
    const av = () => document.getElementById('dash-art-visual');
    __check('EXACT ASK: an empty dashboard opening shows an add-image button, not its size', () => {
      if (!av()) throw new Error('no opening drawn');
      const b = av().querySelector('.art-add-btn');
      if (!b) throw new Error('no add-image button: ' + av().innerHTML.slice(0, 120));
      if (/[0-9]/.test(av().textContent)) throw new Error('the size is still printed: ' + av().textContent);
    });
    __check('the button opens the same artwork upload as the Upload button', () => {
      let clicked = false;
      document.getElementById('m_artworkFile').click = () => { clicked = true; };
      // Inline onclick does not run under runScripts outside-only; run its own text.
      window.eval(av().querySelector('.art-add-btn').getAttribute('onclick'));
      if (!clicked) throw new Error('the upload did not open');
    });
    __check('the icon scales with the opening, and drops out where it cannot be read', () => {
      const big = _artAddIconHTML(400, 500), tiny = _artAddIconHTML(20, 16);
      if (_artAddIconHTML(12, 9) !== '') throw new Error('a 12px opening still draws an icon');
      const px = h => parseFloat(h.split('width="')[1]);
      if (px(big) !== 44 || px(tiny) !== 10) throw new Error('sizes ' + px(big) + ' / ' + px(tiny));
      if (big.indexOf('<button') >= 0) throw new Error('without an action it must not be a button (a click on the wall selects)');
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
