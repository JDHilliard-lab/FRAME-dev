// 18.81: EACH IMAGE IS STORED ONCE IN THE PROJECT FILE.
//
// A real 46 MB project carried every artwork twice (dashboard row + every wall frame
// showing it), swatches once per row, and the first floor plan twice: 44.0 MB of JSON
// became 28.2 MB pooled (31 distinct images), with a byte-identical round trip. The outer
// type is NOT 'master-studio...' on purpose, so an older build refuses the file instead
// of opening a deck with every picture missing.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'templates.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const noop = () => ctx2d;
  const ctx2d = new Proxy({}, { get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
    if (k === 'canvas') return undefined;
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  // A real tiny JPEG when one is asked for: jsdom would hand back PNG bytes labelled
  // JPEG, which jsPDF then stores raw, and the end-to-end check would be testing jsdom.
  const JPG1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  window.HTMLCanvasElement.prototype.toDataURL = (t) => (/jpe?g/.test(t || '') ? JPG1 : PNG1);
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator; global.self = window;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    window.__run = (async () => {
      scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
      const IMG = 'data:image/jpeg;base64,' + 'Q'.repeat(5000);
      const SW = 'data:image/png;base64,' + 'W'.repeat(3000);
      const row = (id) => Object.assign(_cloneData(dashDefaultData), { id: id, artworkUrl: IMG, swatchDataUrl: SW, fType: 'image', extW: 24, extH: 30 });
      dashProjectData = [row('ART.1'), row('ART.2')];
      elevations = [{ id: 'e1', name: 'W', w: 200, h: 108, frames: [{ id: 'ART.1', letter: 'A', x: 1, y: 1, w: 24, h: 30, active: true, artworkUrl: IMG, swatchDataUrl: SW }] }];
      // Opening a file normalises a project built in code, so the reference is a project
      // that has been through one open already (as every real file has).
      _readProjectText(JSON.stringify(_projectPayload(), null, 2));
      const before = JSON.stringify(_projectPayload(), null, 2);
      const text = _projectFileText(_projectPayload());
      const file = JSON.parse(text);
      __check('every repeated image is written once', () => {
        if (file.imagePool.length !== 2) throw new Error(file.imagePool.length + ' pooled');
        if (text.split(IMG).length - 1 !== 1) throw new Error('the artwork is written ' + (text.split(IMG).length - 1) + ' times');
        if (before.split(IMG).length - 1 < 3) throw new Error('fixture does not repeat the artwork');
        if (!(before.length - text.length > IMG.length * 2)) throw new Error('no saving: ' + text.length + ' vs ' + before.length);
      });
      __check('the outer type is one an older build refuses', () => {
        if (String(file.type).indexOf('master-studio') === 0) throw new Error('older builds would read this file and show no pictures');
        if (String(file.project.type).indexOf('master-studio') !== 0) throw new Error('the project itself lost its type');
      });
      __check('small strings and non-images are never pooled', () => {
        const t2 = _projectFileText({ type: 'master-studio-v6', a: 'data:image/png;base64,AAAA', b: 'x'.repeat(5000) });
        if (JSON.parse(t2).imagePool.length) throw new Error('pooled something that is not a big image');
      });
      dashProjectData = []; elevations = [];
      const ok = _readProjectText(text);
      __check('a pooled file opens and the project is exactly what was saved', () => {
        if (!ok) throw new Error('not installed');
        const after = JSON.stringify(_projectPayload(), null, 2);
        if (after !== before) throw new Error('round trip differs');
        if (dashProjectData[0].artworkUrl !== IMG || elevations[0].frames[0].swatchDataUrl !== SW) throw new Error('images not restored');
        if (JSON.stringify(dashProjectData).indexOf('frame-img:') >= 0) throw new Error('a marker leaked into the project');
      });
      __check('an older single-level project file still opens', () => {
        dashProjectData = [];
        if (!_readProjectText(before)) throw new Error('old file refused');
        if (dashProjectData.length !== 2 || dashProjectData[1].artworkUrl !== IMG) throw new Error('old file read wrong');
      });
      __check('a reference to a missing image reads as no image, never the marker', () => {
        const d = _projectFromFile({ type: PROJECT_FILE_TYPE, imagePool: [], project: { x: POOL_MARK + 7 } });
        if (d.x !== '') throw new Error(JSON.stringify(d.x));
      });
      __check('Save writes the pooled form', () => {
        const a = S.indexOf('async function saveMasterProject');
        if (S.slice(a, S.indexOf('\\n}\\n', a)).indexOf('_projectFileText(_projectPayload())') < 0) throw new Error('save path not pooled');
        if (S.indexOf('JSON.stringify(_projectPayload()') >= 0) throw new Error('an unpooled save path is left');
      });
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
