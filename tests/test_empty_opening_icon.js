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
    __check('19.10: the preview is the ONE place to add artwork: a caption on the button, no upload row in the panel', () => {
      const b = av().querySelector('.art-add-btn');
      if (!b.querySelector('.art-add-cap') || b.querySelector('.art-add-cap').textContent !== 'Click or drag & drop here') throw new Error('no caption under the icon');
      if (document.getElementById('m_artworkDrop')) throw new Error('the Upload / Drag & Drop row is still in the panel');
      const f = document.getElementById('m_artworkFile');
      if (!f || f.style.display !== 'none') throw new Error('the file input must stay, hidden');
      if (!document.getElementById('m_artCropControls').contains(document.getElementById('m_artworkClear'))) throw new Error('Remove is not with the zoom controls');
      if (_artAddIconHTML(80, 80, 'x()').indexOf('art-add-cap') >= 0) throw new Error('a small opening got a caption it cannot fit');
    });
    // 19.12: "once an image is framed you can still swap images by dragging and dropping. maybe a
    // little note somewhere, or how do you clear the image in case designers want to remove it"
    __check('EXACT ASK: a framed picture carries Replace, Remove and the swap note', () => {
      const r = dashProjectData[0];
      r.artworkUrl = 'data:image/png;base64,AAAA'; r.artworkW = 100; r.artworkH = 100;
      updateDashVisualsFromDOM();
      const tools = av().querySelector('.art-tools');
      if (!tools) throw new Error('no tools on the picture');
      const btns = tools.querySelectorAll('.art-tool-btn');
      if (btns.length !== 2) throw new Error(btns.length + ' buttons');
      if ((btns[0].getAttribute('onclick') || '').indexOf("m_artworkFile") < 0) throw new Error('Replace does not open the upload');
      if ((btns[1].getAttribute('onclick') || '').indexOf('clearDashArtwork()') < 0) throw new Error('Remove does not clear');
      const pxW = parseFloat(av().style.width);
      const hint = av().querySelector('.art-hint');
      if (pxW >= 150 && (!hint || hint.textContent.indexOf('drop an image to replace') < 0)) throw new Error('no swap note on a ' + pxW + 'px picture');
      if (av().querySelector('.art-add-btn')) throw new Error('the empty-opening button is still there');
      window.eval(btns[1].getAttribute('onclick'));
      if (r.artworkUrl) throw new Error('Remove left the picture');
      if (!av().querySelector('.art-add-btn')) throw new Error('after Remove the opening is not empty again');
    });
    __check('a press on Replace or Remove never starts a pan', () => {
      const S = window.__src || '';
      const i = S.indexOf('function _wireArtPan()'); const B = S.slice(i, S.indexOf('function ', i + 30));
      if (B.indexOf(".closest('.art-tool-btn')) return;") < 0) throw new Error('the pan ignores nothing');
    });
    __check('the icon scales with the opening, and drops out where it cannot be read', () => {
      const big = _artAddIconHTML(400, 500), tiny = _artAddIconHTML(20, 16);
      if (_artAddIconHTML(12, 9) !== '') throw new Error('a 12px opening still draws an icon');
      const px = h => parseFloat(h.split('width="')[1]);
      if (px(big) !== 44 || px(tiny) !== 10) throw new Error('sizes ' + px(big) + ' / ' + px(tiny));
      if (big.indexOf('<button') >= 0) throw new Error('without an action it must not be a button (a click on the wall selects)');
    });
  `;
  try { window.eval('window.__src = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
