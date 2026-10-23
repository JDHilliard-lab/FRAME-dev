// 19.59, "I'm noticing there is a little delay when switching frames when selecting them from
// the frame library, sometimes the switch is instant and sometimes it delayed from 30-60
// seconds and I think its broken ... we have 4802 frames to choose from", and "the Floater
// frames loaded from Frame presets in the floorplan area do not register as Framed canvas
// floater ... it sometimes loads as framed art".
//  1. (sw.js, see test_offline_sw) a new library file waited for the offline cache to be
//     stored and trimmed; a frame-browser scroll queues hundreds of those.
//  2. The frame list and code index (4802 frames) were rebuilt on every pick and every sync.
//  3. A slow pick showed nothing, and a slower earlier pick could land after a later one.
//  4. A set's floater became a floater only when its swatch picture arrived (never, if it
//     failed); product and sizes come from the catalogue and now apply at once.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const lib = () => {
      dashLocalLibrary = {
        michaelangelo: {
          'avant-garde': [{ code: 'MICH 41-29', width: 1.25, file: 'a.png', color: 'Black' }, { code: 'MICH 132-29', width: 1, file: 'b.png' }],
          'floaters': [{ code: 'MICH 305-29', width: 1.5, faceWidth: 0.25, depth: 2, file: 'f.png' }]
        }
      };
    };
    const setup = () => {
      lib();
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [Object.assign({}, dashDefaultData, { id: 'ART.1', product: 'Framed Art', extW: 20, extH: 24 }),
                         Object.assign({}, dashDefaultData, { id: 'ART.2', product: 'Framed Art', extW: 20, extH: 24 })];
      dashSelectedRowIndex = 0;
    };

    __check('EXACT BUG: the 4802-frame index is built once, not on every pick and sync', () => {
      setup();
      const a = _fbByCode(), b = _fbByCode();
      if (a !== b) throw new Error('rebuilt between two calls with nothing changed');
      if (_fbAll() !== _fbAll()) throw new Error('the flat list was rebuilt');
      if (!a[_fbNorm('MICH 305-29')]) throw new Error('index is missing a frame');
      dashLocalLibrary.michaelangelo['avant-garde'].push({ code: 'MICH 999-1', width: 1, file: 'n.png' });
      if (!_fbByCode()[_fbNorm('MICH 999-1')]) throw new Error('a frame added to the library is not found (stale index)');
      dashLocalLibrary = { other: { c: [{ code: 'X 1', width: 1, file: 'x.png' }] } };
      if (!_fbByCode()[_fbNorm('X 1')] || _fbByCode()[_fbNorm('MICH 41-29')]) throw new Error('a replaced library kept the old index');
    });

    __check('EXACT BUG: a slower earlier pick never lands over a later one', async () => {
      setup();
      const v = document.getElementById('libVendor'), c = document.getElementById('libCollection');
      const opt = (sel, val) => { const o = document.createElement('option'); o.value = val; o.textContent = val; sel.appendChild(o); sel.value = val; };
      opt(v, 'michaelangelo'); opt(c, 'avant-garde');
      const gates = {};
      _libEntryToDataUrl = (file) => new Promise(r => { gates[file] = r; });
      loadDashFromCustomLibrary(0);           // MICH 41-29, slow
      loadDashFromCustomLibrary(1);           // MICH 132-29, picked after
      gates['b.png']('data:image/png;base64,B');
      await wait(5);
      gates['a.png']('data:image/png;base64,A');
      await wait(5);
      if (dashProjectData[0].fCode !== 'MICH 132-29') throw new Error('the earlier pick landed last and won: ' + dashProjectData[0].fCode);
    });

    __check('a pick that takes a while says so; a quick one says nothing', async () => {
      setup();
      const v = document.getElementById('libVendor'), c = document.getElementById('libCollection');
      v.value = 'michaelangelo'; c.value = 'avant-garde';
      const toasts = []; const realToast = _toast; _toast = (t) => { toasts.push(t); return null; };
      try {
        let release; _libEntryToDataUrl = () => new Promise(r => { release = r; });
        loadDashFromCustomLibrary(0);
        await wait(LIB_PICK_SLOW_MS + 60);
        if (!toasts.some(t => t.indexOf('MICH 41-29') >= 0)) throw new Error('a slow pick showed nothing');
        release('data:image/png;base64,A'); await wait(5);
        toasts.length = 0;
        _libEntryToDataUrl = () => Promise.resolve('data:image/png;base64,B');
        loadDashFromCustomLibrary(1); await wait(LIB_PICK_SLOW_MS + 60);
        if (toasts.length) throw new Error('a quick pick raised a toast');
      } finally { _toast = realToast; }
    });

    __check('EXACT BUG: a set\\'s floater is a floater before its picture arrives (and if it never does)', async () => {
      setup();
      Object.keys(_libSwatchMemo).forEach(k => delete _libSwatchMemo[k]);
      const r = dashProjectData[1];
      const before = r.swatchDataUrl;
      const pend = _salonFrameDress([r], [{ f: 'MICH 305-29' }]);
      if (pend.length !== 1) throw new Error('fixture: expected the swatch to be pending');
      if (r.product !== 'Framed Canvas (Floater)') throw new Error('still ' + r.product + ' while the swatch loads');
      if (r.fCode !== 'MICH 305-29' || !(parseFloat(r.floaterInset) > 0.25)) throw new Error('code or inset not applied: ' + r.fCode + ' / ' + r.floaterInset);
      if (r.swatchDataUrl !== before) throw new Error('the old picture was relabelled before the new one arrived');
      // the picture never comes: the piece is still a floater
      _libEntryToDataUrl = () => Promise.reject(new Error('offline'));
      _salonFrameDressLater(pend); await wait(10);
      if (r.product !== 'Framed Canvas (Floater)') throw new Error('a failed swatch left it ' + r.product);
    });
    __check('a picture arriving later still dresses the piece fully', async () => {
      setup();
      Object.keys(_libSwatchMemo).forEach(k => delete _libSwatchMemo[k]);
      const r = dashProjectData[1];
      const pend = _salonFrameDress([r], [{ f: 'MICH 305-29' }]);
      _libEntryToDataUrl = () => Promise.resolve('data:image/png;base64,FLOAT');
      _salonFrameDressLater(pend); await wait(10);
      if (r.swatchDataUrl !== 'data:image/png;base64,FLOAT' || r.swatchName !== 'MICH 305-29' || r.fType !== 'image') throw new Error('not dressed: ' + r.swatchName);
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
