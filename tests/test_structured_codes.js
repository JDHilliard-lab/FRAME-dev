// 20.29, from the Ford Hub Phase B Level 03 package (a client's level-first codes):
//  1. L3.ART.S16-10A read as prefix L, number 3: every Level 3 piece was "L.3", so the rows,
//     the Items list and the deck sorted all the A pieces, then all the B pieces.
//  2. Duplicating L3.ART.S16-10A minted L3.1 (the level taken as the type). A duplicate of a
//     client code is now the next placement in that code; a house code still mints by prefix.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const row = (id, extra) => Object.assign({ id: id, product: 'Framed Art', category: 'framed', extW: 20, extH: 20, qty: 1 }, extra || {});
    const fr = (id, letter, x) => ({ id: id, letter: letter, x: x, y: 40, w: 20, h: 20, active: true, dimTo: [] });
    const FORD = ['L3.ART.S24-01', 'L3.ART.S24-03', 'L3.ART.S16-09', 'L3.ART.S24-02A', 'L3.ART.S16-02A', 'L3.ART.S16-10A',
                  'L3.ART.S24-02B', 'L3.ART.S16-02B', 'L3.ART.S16-10B', 'L3.ART.S16-01A', 'L3.ART.S16-01B'];
    const setup = (ids) => {
      editorialContent = _editorialDefaults();
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = ids.map(id => row(id));
      elevations = [{ id: 'w1', name: 'L3.ART.S16-02 FLEX MEETING ROOM', wallW: 120, wallH: 108, frames: [fr('L3.ART.S16-02A', 'A', 20), fr('L3.ART.S16-02B', 'B', 50)] },
                    { id: 'w2', name: 'L3.ART.S16-01 OPEN COLLABORATION', wallW: 120, wallH: 108, frames: [fr('L3.ART.S16-01A', 'A', 20), fr('L3.ART.S16-01B', 'B', 50)] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      dashSelectedRowIndex = 0;
    };

    __check('EXACT BUG: Level 3 codes sort by sector and placement, not all the A pieces first', () => {
      setup(FORD.concat(['ART.2', 'ART.1A']));
      _codesSortRows();
      const got = dashProjectData.map(r => r.id).join(' ');
      const want = 'ART.1A ART.2 L3.ART.S16-01A L3.ART.S16-01B L3.ART.S16-02A L3.ART.S16-02B L3.ART.S16-09 L3.ART.S16-10A L3.ART.S16-10B L3.ART.S24-01 L3.ART.S24-02A L3.ART.S24-02B L3.ART.S24-03';
      if (got !== want) throw new Error(got);
      _codesSortWalls();
      if (elevations[0].id !== 'w2') throw new Error('walls: ' + elevations.map(e => e.name).join(', '));
    });
    __check('a level-first code is not a house code; house and catalogue codes still parse', () => {
      ['L3.ART.S16-10A', 'L3.ART.S24-01', 'B2.EGD-04', 'P1-ART-03'].forEach(c => { if (_codeSortParts(c)) throw new Error('parsed ' + c + ' as ' + JSON.stringify(_codeSortParts(c))); });
      const ok = { 'ART.12B': 12, 'ART.01A.1': 1, 'EGD-3': 3, 'ART-1AA': 1, 'ART.1.A': 1, 'ART.1.2A': 1, 'WF.7': 7 };
      Object.keys(ok).forEach(c => { const p = _codeSortParts(c); if (!p || p.n !== ok[c]) throw new Error(c + ' -> ' + JSON.stringify(p)); });
    });
    __check('settling never renumbers a client code, and plain codes beside it still count 1..n', () => {
      setup(FORD.concat(['ART.4', 'ART.9']));
      _codesSettle();
      const ids = dashProjectData.map(r => r.id);
      FORD.forEach(c => { if (ids.indexOf(c) < 0) throw new Error('lost ' + c + ': ' + ids.join(' ')); });
      if (ids.indexOf('ART.1') < 0 || ids.indexOf('ART.2') < 0) throw new Error('plain codes: ' + ids.join(' '));
    });
    __check('EXACT BUG: duplicating L3.ART.S16-10A gives the next placement in its sector, not L3.1', () => {
      setup(FORD.slice());
      dashSelectedRowIndex = dashProjectData.findIndex(r => r.id === 'L3.ART.S16-10A');
      duplicateDashRow();
      const ids = dashProjectData.map(r => r.id);
      if (ids.indexOf('L3.ART.S16-11') < 0) throw new Error(ids.join(' '));
      if (ids.some(i => /^L3\.\d/.test(i))) throw new Error('minted a level code: ' + ids.join(' '));
      dashSelectedRowIndex = dashProjectData.findIndex(r => r.id === 'L3.ART.S16-10B');
      duplicateDashRow();
      if (dashProjectData.map(r => r.id).indexOf('L3.ART.S16-12') < 0) throw new Error('second: ' + dashProjectData.map(r => r.id).join(' '));
    });
    __check('a duplicate keeps the code shape and padding; house codes still mint by prefix', () => {
      setup(['1B.L3.ART-09', '1B.L3.ART-EA', 'ART.5', 'EGD.2']);
      const nx = (id) => _duplicateCodeFor(dashProjectData.find(r => r.id === id));
      if (nx('1B.L3.ART-09') !== '1B.L3.ART-10') throw new Error('1B: ' + nx('1B.L3.ART-09'));
      if (nx('ART.5') !== 'ART.6') throw new Error('ART: ' + nx('ART.5'));
      if (nx('EGD.2') !== 'EGD.3') throw new Error('EGD: ' + nx('EGD.2'));
      // No trailing number (an existing-inventory set): falls back to its TYPE, never "1B".
      if (!/^ART\./.test(nx('1B.L3.ART-EA'))) throw new Error('1B set: ' + nx('1B.L3.ART-EA'));
      if (_codePrefixOfRow({ id: 'L3.EGD.S23-01', category: 'framed' }) !== 'EGD') throw new Error('type token: ' + _codePrefixOfRow({ id: 'L3.EGD.S23-01' }));
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
