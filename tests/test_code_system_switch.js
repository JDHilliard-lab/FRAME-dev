// 20.47: switching the item code pattern recodes every placement (no mixed systems), level
// and sector edits follow, typed codes must fit, and + Add Item picks sets from pictures and
// hangs them.
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

    const SECTOR = '{level}.{type}.S{zone}-{nn}', LEVEL = '{level}.{type}-{nn}';
    __check('EXACT BUG: switching sector to level codes left L1.ART.S22-02 beside L1.ART-01; now every code follows', () => {
      setup([['L3.ART.S22-01', { zone: '22' }], ['L3.ART.S22-02A', { zone: '22' }], ['L3.ART.S22-02B', { zone: '22' }], ['L3.ART.S24-01', { zone: '24' }]], SECTOR);
      const res = _codesApplyPattern(LEVEL, { renumber: true });
      if (ids() !== 'L3.ART-01 L3.ART-02A L3.ART-02B L3.ART-03') throw new Error(ids());
      if (editorialContent.codePattern !== LEVEL) throw new Error('pattern not set');
      if (res.moved.length !== 3) throw new Error('moved ' + res.moved.length);
    });
    __check('house to sector: order kept, sector from the level', () => {
      setup(['ART.1', 'ART.2A', 'ART.2B', 'ART.3', 'EGD.1'], '');
      floorplanLevels[0].zone = '22';
      _codesApplyPattern(SECTOR, { renumber: true });
      if (ids() !== 'L3.ART.S22-01 L3.ART.S22-02A L3.ART.S22-02B L3.ART.S22-03 L3.EGD.S22-01') throw new Error(ids());
      if (dashProjectData.some(r => r.zone !== '22')) throw new Error('zones');
    });
    __check('sector back to house: ART.1.. in code order, types kept, sectors kept on the rows', () => {
      setup([['L3.ART.S16-01', { zone: '16' }], ['L3.ART.S16-02', { zone: '16' }], ['L3.ART.S24-01', { zone: '24' }], ['L3.EGD.S16-01', { zone: '16' }]], SECTOR);
      _codesApplyPattern('', { renumber: true });
      if (ids() !== 'ART.1 ART.2 ART.3 EGD.1') throw new Error(ids());
      if (dashProjectData[2].zone !== '24') throw new Error('zone lost');
      _codesApplyPattern(SECTOR, { renumber: true });
      if (ids().indexOf('L3.ART.S24-01') < 0 || ids().indexOf('L3.ART.S16-02') < 0) throw new Error('round trip ' + ids());
    });
    __check('a custom pattern parses and recodes', () => {
      setup(['ART.1', 'ART.2', 'WF.1'], '');
      _codesApplyPattern('{type}-{nnn}', { renumber: true });
      if (ids() !== 'ART-001 ART-002 WF-001') throw new Error(ids());
      const pz = _codeParse('L3.ART.S16-10', SECTOR);
      if (!pz || pz.level !== 'L3' || pz.type !== 'ART' || pz.zone !== '16' || pz.n !== 10) throw new Error(JSON.stringify(pz));
      if (_codeParse('L3.ART-01', SECTOR)) throw new Error('level code read as sector code');
    });
    __check('no sector: nothing changes unless told to skip them', () => {
      setup(['ART.1', ['ART.2', { zone: '16' }]], '');
      const r1 = _codesApplyPattern(SECTOR, { renumber: true });
      if (r1.missing.join() !== 'ART.1' || ids() !== 'ART.1 ART.2' || editorialContent.codePattern !== '') throw new Error(ids() + ' ' + editorialContent.codePattern);
    });
    __check('the pattern menu asks for a sector, then recodes everything', async () => {
      setup(['ART.1', 'ART.2'], '');
      const p = _codesSwitchPattern(SECTOR);
      await new Promise(r => setTimeout(r, 0));
      const form = document.querySelector('.ask-fields form');
      if (!form) throw new Error('no question');
      form.querySelector('input').value = '24';
      form.dispatchEvent(new window.Event('submit', { cancelable: true }));
      await p;
      if (ids() !== 'L3.ART.S24-01 L3.ART.S24-02') throw new Error(ids());
    });
    __check('cancelling the sector question keeps the old system', async () => {
      setup(['ART.1'], '');
      const p = _codesSwitchPattern(SECTOR);
      await new Promise(r => setTimeout(r, 0));
      const btn = Array.from(document.querySelectorAll('.ask-fields button')).find(b => b.textContent === 'Cancel');
      btn.onclick();
      const res = await p;
      if (res !== null || ids() !== 'ART.1' || editorialContent.codePattern !== '') throw new Error(ids());
    });
    __check('a level code change keeps the numbers', () => {
      setup([['L1.ART.S22-02', { zone: '22' }], ['L1.ART.S22-05', { zone: '22' }]], SECTOR);
      floorplanLevels[0].code = 'L1';
      const host = document.createElement('div'); _codePatternPanelInto(host);
      const ci = host.querySelector('[data-level-code="0"]'); ci.value = 'L3'; ci.onchange();
      if (ids() !== 'L3.ART.S22-02 L3.ART.S22-05') throw new Error(ids());
    });
    __check('a level Sector change moves its pieces, numbers kept; a piece with its own other sector stays', () => {
      setup([['L3.ART.S22-02', { zone: '22' }], ['L3.ART.S22-05', { zone: '22' }], ['L3.ART.S16-01', { zone: '16' }]], SECTOR);
      floorplanLevels[0].zone = '22';
      const host = document.createElement('div'); _codePatternPanelInto(host);
      const zi = host.querySelector('[data-level-zone="0"]'); zi.value = '23'; zi.onchange();
      const got = ids();
      ['L3.ART.S23-02', 'L3.ART.S23-05', 'L3.ART.S16-01'].forEach(c => { if (got.indexOf(c) < 0) throw new Error(c + ': ' + got); });
    });
    __check("an item's Sector edit moves it to the end of that sector", () => {
      setup([['L3.ART.S16-01', { zone: '16' }], ['L3.ART.S16-02', { zone: '16' }], ['L3.ART.S24-01', { zone: '24' }]], SECTOR);
      dashSelectedRowIndex = 0;
      dashProjectData[0].zone = '24';
      _codesZoneEdited();
      const got = ids();
      if (got.indexOf('L3.ART.S24-02') < 0 || got.indexOf('L3.ART.S16-02') < 0 || got.indexOf('L3.ART.S16-01') >= 0) throw new Error(got);
    });
    __check('a typed code must fit the pattern; one that fits takes its sector', () => {
      setup([['L3.ART.S16-01', { zone: '16' }]], SECTOR);
      const bad = _codesRenameRow(dashProjectData[0], 'L3.ART-07');
      if (bad.ok || ids() !== 'L3.ART.S16-01') throw new Error('mixed in: ' + ids());
      const good = _codesRenameRow(dashProjectData[0], 'L3.ART.S24-07');
      if (!good.ok || ids() !== 'L3.ART.S24-07' || dashProjectData[0].zone !== '24') throw new Error(ids() + ' ' + dashProjectData[0].zone);
    });
    __check('Add Item: no Create without a sector, picture picker sets the set, a set hangs by default', () => {
      setup([['L3.ART.S16-01', {}]], SECTOR);
      const p = _askPlacement('item', {});
      const z = document.querySelector('[data-ask="zone"]'), go = document.querySelector('[data-ask="go-new"]');
      if (!go.disabled || go.textContent.indexOf('Sector') < 0) throw new Error('should wait for a sector: ' + go.textContent);
      z.value = '16'; z.dispatchEvent(new window.Event('input'));
      if (go.disabled || go.textContent !== 'Create L3.ART.S16-02') throw new Error(go.textContent);
      const hang = document.querySelector('[data-ask="hang"]');
      if (!hang || hang.checked) throw new Error('single piece should not hang by default');
      document.querySelector('[data-ask="set-pick"]').onclick();
      const tiles = Array.from(document.querySelectorAll('#frameSetPicker .fsp-tile'));
      if (tiles.length < 5) throw new Error('picker tiles ' + tiles.length);
      const t3 = tiles.find(t => t.getAttribute('data-set') === 'n3'); t3.onclick();
      if (document.querySelector('[data-ask="set"]').value !== 'n3' || !hang.checked) throw new Error('pick ' + document.querySelector('[data-ask="set"]').value + ' hang ' + hang.checked);
      const want = _placementSetChoices().find(c => c.value === 'n3').label;
      if (document.querySelector('[data-ask="set-pick"] b').textContent !== want) throw new Error('button label ' + document.querySelector('[data-ask="set-pick"] b').textContent);
      go.onclick();
      return p.then(ans => { if (!ans || ans.set !== 'n3' || ans.hang !== true) throw new Error(JSON.stringify(ans)); });
    });
    __check('a hung new set is on its own wall in its layout', () => {
      setup([], '');
      const before = elevations.length;
      const res = _placementMint('framed', SALON_PRESETS[0].key, true, null);
      if (!res.wall || elevations.length !== before + 1) throw new Error('no wall');
      if ((res.wall.frames || []).length !== SALON_PRESETS[0].n) throw new Error('frames ' + (res.wall.frames || []).length);
      const xs = res.wall.frames.map(f => Math.round(f.y));
      if (SALON_PRESETS[0].frames.some(f => f.y > 0) && new Set(xs).size < 2) throw new Error('laid out in a row');
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
