// 20.49: in a sector project a new code with no sector given inherits one (the level's, else
// the last piece's) or asks; + Add code on the floorplan used to make house codes.
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

    const row = (id, extra) => Object.assign({ id: id, product: 'Framed Art', category: 'framed', extW: 20, extH: 20, qty: 1, level: 0 }, extra || {});
    const fr = (id, letter, x) => ({ id: id, letter: letter, x: x, y: 40, w: 20, h: 20, active: true, dimTo: [] });
    const LEVEL_SECTOR = '{level}.{type}.S{zone}-{nn}';
    const setup = (ids, pat) => {
      editorialContent = _editorialDefaults();
      editorialContent.codePattern = pat == null ? LEVEL_SECTOR : pat;
      floorplanLevels = [{ name: 'Level 03', imageData: '', imageName: '' }, { name: 'Level 04', imageData: '', imageName: '' }];
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = (ids || []).map(x => typeof x === 'string' ? row(x) : row(x[0], x[1]));
      elevations = [];
      currentElevIndex = 0; elevFrames = [];
      dashSelectedRowIndex = 0;
    };
    const ids = () => dashProjectData.map(r => r.id).join(' ');

    const SECTOR = '{level}.{type}.S{zone}-{nn}';
    const addBtn = (lv) => Array.from(_fpAddCodesBar({ level: lv || 0 }).querySelectorAll('button')).find(b => b.textContent === '+ Add code');
    __check("EXACT BUG: + Add code on the floorplan made ART.1 beside L1.ART.S1-01; it now continues the sector", async () => {
      setup([['L1.ART.S1-01', { zone: '1', level: 0 }]], SECTOR);
      floorplanLevels = [{ name: 'Level 1', imageData: '', imageName: '' }];
      _artCatsApplyPreset('types');
      await addBtn(0).onclick();
      if (ids() !== 'L1.ART.S1-01 L1.ART.S1-02') throw new Error(ids());
      if (dashProjectData[1].zone !== '1') throw new Error('zone ' + dashProjectData[1].zone);
    });
    __check('a level Sector beats the last piece; a new level with nothing set inherits the project’s last sector', () => {
      setup([['L3.ART.S16-01', { zone: '16', level: 0 }]], SECTOR);
      floorplanLevels[1].zone = '24';
      if (_nextPlacementCode('ART', { level: 1 }) !== 'L4.ART.S24-01') throw new Error(_nextPlacementCode('ART', { level: 1 }));
      delete floorplanLevels[1].zone;
      if (_nextPlacementCode('ART', { level: 1 }) !== 'L4.ART.S16-01') throw new Error(_nextPlacementCode('ART', { level: 1 }));
    });
    __check('with no sector anywhere, + Add code asks instead of making a house code', async () => {
      setup([], SECTOR);
      floorplanLevels = [{ name: 'Level 1', imageData: '', imageName: '' }];
      _artCatsApplyPreset('types');
      const p = addBtn(0).onclick();
      await new Promise(r => setTimeout(r, 0));
      const form = document.querySelector('.ask-fields form');
      if (!form) throw new Error('no question; made ' + ids());
      const fi = form.querySelector('input'); fi.value = '7'; fi.dispatchEvent(new window.Event('input'));
      form.dispatchEvent(new window.Event('submit', { cancelable: true }));
      await p;
      if (ids() !== 'L1.ART.S7-01') throw new Error(ids());
    });
    __check('Add Item starts from the inherited sector, so Create is ready', () => {
      setup([['L1.ART.S1-03', { zone: '1', level: 0 }]], SECTOR);
      floorplanLevels = [{ name: 'Level 1', imageData: '', imageName: '' }];
      dashSelectedRowIndex = -1;
      const p = _askPlacement('item', {});
      const go = document.querySelector('[data-ask="go-new"]');
      if (go.disabled || go.textContent !== 'Create L1.ART.S1-04') throw new Error(go.textContent);
      Array.from(document.querySelectorAll('.ask-actions button')).pop().onclick();
      return p;
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
