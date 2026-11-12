// 20.46: a plan level's Sector fills the code pattern's {zone} for pieces with none of their
// own (a designer set the pattern, typed 22 into the box that names the sector, and no code
// changed), and two placements can swap codes.
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

    __check('EXACT BUG: codes did not fill in; a level Sector now recodes items with none of their own', () => {
      setup(['ART.1', 'ART.2', 'ART.3']);
      floorplanLevels = [{ name: 'Level 1', imageData: '', imageName: '' }];
      editorialContent.codeZoneLabel = '22';   // what the screenshot had: a sector typed into the label box
      if (_codeZoneLabel() !== 'Sector') throw new Error('label ' + _codeZoneLabel());
      if (_codePatternPlan().todo.length !== 0) throw new Error('nothing has a sector yet');
      floorplanLevels[0].zone = '22';
      const res = recodeToPattern(true);
      if (res.skipped.length) throw new Error('skipped ' + res.skipped.join());
      if (ids() !== 'L1.ART.S22-01 L1.ART.S22-02 L1.ART.S22-03') throw new Error(ids());
      if (dashProjectData.some(r => r.zone !== '22')) throw new Error('zone not written: ' + dashProjectData.map(r => r.zone).join());
    });
    __check("a piece's own Sector beats its level's", () => {
      setup([['ART.1', { zone: '24' }], 'ART.2']);
      floorplanLevels[0].zone = '16';
      recodeToPattern(true);
      const got = ids();
      if (got.indexOf('L3.ART.S24-01') < 0 || got.indexOf('L3.ART.S16-01') < 0) throw new Error(got);
    });
    __check('a new item on a level with a Sector gets the pattern code and the sector', () => {
      setup(['L3.ART.S16-04']);
      floorplanLevels[0].zone = '16';
      const code = _fpAddCodes('framed', 1, { quiet: true, ctx: { level: 0 } });
      if (code !== 'L3.ART.S16-05') throw new Error(code);
      const r = dashProjectData.find(x => x.id === 'L3.ART.S16-05');
      if (!r || r.zone !== '16') throw new Error('zone ' + (r && r.zone));
      const c2 = _fpAddCodes('framed', 1, { quiet: true, ctx: { level: 0, zone: '24' } });
      if (c2 !== 'L3.ART.S24-01') throw new Error('typed sector wins: ' + c2);
    });
    __check("Add Item starts from the level's Sector and follows a level change until one is typed", () => {
      setup([['L3.ART.S16-10', {}]]);
      floorplanLevels[0].zone = '16'; floorplanLevels[1].zone = '24';
      const p = _askPlacement('item', {});
      const z = document.querySelector('[data-ask="zone"]');
      const lv = document.querySelector('[data-ask="level"]');
      const go = document.querySelector('[data-ask="go-new"]');
      if (!z || z.value !== '16') throw new Error('zone ' + (z && z.value));
      if (go.textContent !== 'Create L3.ART.S16-11') throw new Error('preview ' + go.textContent);
      lv.value = '1'; lv.dispatchEvent(new window.Event('change'));
      if (z.value !== '24') throw new Error('follow level: ' + z.value);
      if (go.textContent !== 'Create L4.ART.S24-01') throw new Error('preview after level ' + go.textContent);
      z.value = '9'; z.dispatchEvent(new window.Event('input'));
      lv.value = '0'; lv.dispatchEvent(new window.Event('change'));
      if (z.value !== '9') throw new Error('typed sector overwritten: ' + z.value);
      const cancel = Array.from(document.querySelectorAll('.ask-actions button')).pop();
      cancel.onclick();
      return p;
    });
    __check('the panel has a Sector box per level, and the label box never shows a number', () => {
      setup(['ART.1']);
      editorialContent.codeZoneLabel = '22';
      const host = document.createElement('div');
      _codePatternPanelInto(host);
      const zl = host.querySelector('[data-code-pattern="zone-label"]');
      if (!zl || zl.value !== '') throw new Error('label box ' + (zl && zl.value));
      const zi = host.querySelector('[data-level-zone="1"]');
      if (!zi) throw new Error('no level sector box');
      zi.value = '24'; zi.onchange();
      if (floorplanLevels[1].zone !== '24') throw new Error('saved ' + floorplanLevels[1].zone);
      if (!host.querySelector('[data-code-pattern="swap-hint"]')) throw new Error('no swap hint');
    });
    __check('swap: two pattern placements trade codes, pieces keep their art and walls follow', () => {
      setup([['L3.ART.S16-01', { zone: '16', location: 'LOBBY' }], ['L3.ART.S16-02A', { zone: '16', location: 'HALL' }], ['L3.ART.S16-02B', { zone: '16', location: 'HALL' }]]);
      elevations = [{ id: 'w1', name: 'L3.ART.S16-01 LOBBY', wallW: 120, wallH: 108, frames: [fr('L3.ART.S16-01', '', 10)] },
                    { id: 'w2', name: 'L3.ART.S16-02 HALL', wallW: 120, wallH: 108, frames: [fr('L3.ART.S16-02A', 'A', 10), fr('L3.ART.S16-02B', 'B', 40)] }];
      if (!_codesSwapPlacements('L3.ART.S16-01', 'L3.ART.S16-02', { quiet: true })) throw new Error('refused');
      const loc = (id) => (dashProjectData.find(r => r.id === id) || {}).location;
      if (loc('L3.ART.S16-02') !== 'LOBBY' || loc('L3.ART.S16-01A') !== 'HALL' || loc('L3.ART.S16-01B') !== 'HALL') throw new Error(ids());
      const w1 = elevations.find(e => e.id === 'w1'), w2 = elevations.find(e => e.id === 'w2');
      if (w1.name !== 'L3.ART.S16-02 LOBBY' || w2.name !== 'L3.ART.S16-01 HALL') throw new Error('walls ' + w1.name + ' / ' + w2.name);
      if (w1.frames[0].id !== 'L3.ART.S16-02' || w2.frames.map(f => f.id).join() !== 'L3.ART.S16-01A,L3.ART.S16-01B') throw new Error('frames');
      if (ids().indexOf('__SW') >= 0) throw new Error('temp code left: ' + ids());
    });
    __check('swap across sectors moves the Sector with the code', () => {
      setup([['L3.ART.S16-01', { zone: '16', location: 'A' }], ['L3.ART.S24-03', { zone: '24', location: 'B' }]]);
      _codesSwapPlacements('L3.ART.S16-01', 'L3.ART.S24-03', { quiet: true });
      const a = dashProjectData.find(r => r.location === 'A'), b = dashProjectData.find(r => r.location === 'B');
      if (a.id !== 'L3.ART.S24-03' || a.zone !== '24' || b.id !== 'L3.ART.S16-01' || b.zone !== '16') throw new Error(JSON.stringify(dashProjectData.map(r => [r.id, r.zone, r.location])));
    });
    __check('swap: house codes trade without renumbering the ones between', () => {
      setup([['ART.1', { location: 'A' }], ['ART.2', { location: 'B' }], ['ART.3', { location: 'C' }]], '');
      if (!_codesSwapPlacements('ART.1', 'ART.3', { quiet: true })) throw new Error('refused');
      const got = dashProjectData.map(r => r.id + ':' + r.location).join(' ');
      if (got !== 'ART.1:C ART.2:B ART.3:A') throw new Error(got);
      if (_codesCanSwap('ART.1', 'ART.9') || _codesCanSwap('ART.1', 'ART.1')) throw new Error('bad swap allowed');
    });
    __check('typing a taken code in the item code field offers the swap, and Swap does it', async () => {
      setup([['L3.ART.S16-01', { zone: '16', location: 'A' }], ['L3.ART.S16-02', { zone: '16', location: 'B' }]]);
      const res = _codesRenameRow(dashProjectData[0], 'L3.ART.S16-02');
      if (res.ok) throw new Error('should wait for the answer');
      const btns = Array.from(document.querySelectorAll('#infoModalButtons button'));
      const sw = btns.find(b => b.innerText === 'Swap codes' || b.textContent === 'Swap codes');
      if (!sw) throw new Error('no swap button: ' + btns.map(b => b.innerText || b.textContent).join('|'));
      sw.onclick();
      await new Promise(r => setTimeout(r, 0));
      const a = dashProjectData.find(r => r.location === 'A');
      if (a.id !== 'L3.ART.S16-02') throw new Error(ids());
    });
    __check('FRAME_API.swapCodes', () => {
      setup([['L3.ART.S16-01', { location: 'A' }], ['L3.ART.S16-02', { location: 'B' }]]);
      const r = FRAME_API.swapCodes('L3.ART.S16-01', 'L3.ART.S16-02');
      if (!r || !r.ok) throw new Error(JSON.stringify(r));
      if (dashProjectData.find(x => x.location === 'A').id !== 'L3.ART.S16-02') throw new Error(ids());
      if (!FRAME_API.swapCodes('L3.ART.S16-01', 'NOPE').error) throw new Error('bad swap allowed');
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
