// 20.30: an item code pattern per project. Some clients track art against their drawings with codes
// like L3.ART.S16-10A (level, type, sector, placement, piece), which designers typed by hand
// in InDesign because FRAME only minted ART.n. A project names its pattern once; new codes,
// the Add Item dialog and a one-shot recode of house codes all follow it.
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

    __check('EXACT BUG: a new piece is the next code in its sector, not ART.n', () => {
      setup(['L3.ART.S16-09', 'L3.ART.S16-10A', 'L3.ART.S16-10B', 'L3.ART.S24-07A']);
      if (_nextPlacementCode('ART', { level: 0, zone: '16' }) !== 'L3.ART.S16-11') throw new Error('S16: ' + _nextPlacementCode('ART', { level: 0, zone: '16' }));
      if (_nextPlacementCode('ART', { level: 0, zone: '24' }) !== 'L3.ART.S24-08') throw new Error('S24: ' + _nextPlacementCode('ART', { level: 0, zone: '24' }));
      if (_nextPlacementCode('ART', { level: 0, zone: '23' }) !== 'L3.ART.S23-01') throw new Error('new sector: ' + _nextPlacementCode('ART', { level: 0, zone: '23' }));
      if (_nextPlacementCode('EGD', { level: 1, zone: '16' }) !== 'L4.EGD.S16-01') throw new Error('level 4 EGD: ' + _nextPlacementCode('EGD', { level: 1, zone: '16' }));
    });
    __check('a pattern it cannot fill falls back to the house code, never L3.ART.S-01', () => {
      setup(['ART.1', 'L3.ART.S16-01']);
      const c = _nextPlacementCode('ART', { level: 0, zone: '' });
      if (c !== 'ART.2') throw new Error(c);
      setup(['ART.1'], '');
      if (_nextPlacementCode('ART', { zone: '16' }) !== 'ART.2') throw new Error('no pattern: ' + _nextPlacementCode('ART', { zone: '16' }));
      setup([], '{type}-{nnn}');
      if (_nextPlacementCode('WF') !== 'WF-001') throw new Error('padding: ' + _nextPlacementCode('WF'));
    });
    __check('level codes come from the plan name, and a typed code wins', () => {
      setup([]);
      floorplanLevels.push({ name: 'Mezzanine' }, { name: '' });
      if (_levelCode(0) !== 'L3' || _levelCode(2) !== 'MEZ' || _levelCode(3) !== 'L4') throw new Error([0, 1, 2, 3].map(_levelCode).join(','));
      floorplanLevels[0].code = '03';
      if (_nextPlacementCode('ART', { level: 0, zone: '16' }) !== '03.ART.S16-01') throw new Error(_nextPlacementCode('ART', { level: 0, zone: '16' }));
    });
    __check('a new set takes the pattern code, its level and sector, and keeps its letters through a settle', () => {
      setup(['L3.ART.S16-10A', 'L3.ART.S16-10B', 'ART.4']);
      const code = _fpAddCodes('framed', 3, { quiet: true, ctx: { level: 0, zone: '16' } });
      if (code !== 'L3.ART.S16-11') throw new Error('code ' + code);
      const mine = dashProjectData.filter(r => _artGroupKey(r.id) === 'L3.ART.S16-11');
      if (mine.map(r => r.id).join(' ') !== 'L3.ART.S16-11A L3.ART.S16-11B L3.ART.S16-11C') throw new Error(ids());
      if (mine.some(r => r.zone !== '16' || r.level !== 0)) throw new Error('fields: ' + JSON.stringify(mine.map(r => [r.zone, r.level])));
      if (ids().indexOf('ART.1') < 0) throw new Error('house code beside it should settle to ART.1: ' + ids());
    });
    __check('a project prefix (GLA) is the {type} of its category', () => {
      setup(['L3.ART.S16-01']);
      _artCatsApplyPreset('types');
      const wf = editorialContent.artCategories.find(c => c.key === 'wf'); wf.prefix = 'GLA';
      const code = _fpAddCodes('wf', 1, { quiet: true, ctx: { level: 0, zone: '16' } });
      if (code !== 'L3.GLA.S16-01') throw new Error(code);
    });
    __check('recode moves house codes with a sector to the pattern; the rest wait and renumber', () => {
      setup([['ART.1', { zone: '24' }], ['ART.2A', { zone: '16' }], ['ART.2B', { zone: '16' }], ['ART.3', {}], ['L3.ART.S16-01', { zone: '16' }]]);
      elevations = [{ id: 'w1', name: 'ART.2 LOBBY', wallW: 120, wallH: 108, frames: [fr('ART.2A', 'A', 10), fr('ART.2B', 'B', 40)] }];
      const res = recodeToPattern(true);
      const got = ids();
      ['L3.ART.S16-02A', 'L3.ART.S16-02B', 'L3.ART.S24-01'].forEach(c => { if (got.indexOf(c) < 0) throw new Error('missing ' + c + ': ' + got); });
      if (res.skipped.join() !== 'ART.3') throw new Error('skipped ' + res.skipped.join());
      if (got.indexOf('ART.1') < 0 || got.indexOf('ART.3') >= 0) throw new Error('the one left should settle to ART.1: ' + got);
      if (elevations[0].name !== 'L3.ART.S16-02 LOBBY') throw new Error('wall ' + elevations[0].name);
      if (elevations[0].frames.map(f => f.id).join() !== 'L3.ART.S16-02A,L3.ART.S16-02B') throw new Error('frames');
    });
    __check('the item form has a Sector field that loads and saves', () => {
      setup([['L3.ART.S16-01', { zone: '16' }]]);
      loadDashDataIntoControls(dashProjectData[0]);
      const z = document.getElementById('m_zone');
      if (!z || z.value !== '16') throw new Error('load: ' + (z && z.value));
      z.value = '24';
      syncDashAndCalculate();
      if (dashProjectData[0].zone !== '24') throw new Error('save: ' + dashProjectData[0].zone);
    });
    __check('Add Item asks for the sector and previews the code it will make', async () => {
      setup([['L3.ART.S16-10', { zone: '16' }]]);
      const p = _askPlacement('item', {});
      const z = document.querySelector('[data-ask="zone"]');
      const go = document.querySelector('[data-ask="go-new"]');
      if (!z || z.value !== '16') throw new Error('zone field ' + (z && z.value));
      if (go.textContent !== 'Create L3.ART.S16-11') throw new Error('preview ' + go.textContent);
      z.value = '24'; z.oninput();
      if (go.textContent !== 'Create L3.ART.S24-01') throw new Error('preview after edit ' + go.textContent);
      go.onclick();
      const ans = await p;
      if (!ans || ans.kind !== 'new' || !ans.ctx || ans.ctx.zone !== '24') throw new Error(JSON.stringify(ans));
    });
    __check('the Item codes panel sets the pattern and offers the recode', () => {
      setup([['ART.1', { zone: '16' }]], '');
      const host = document.createElement('div');
      _codePatternPanelInto(host);
      const sel = host.querySelector('[data-code-pattern="preset"]');
      sel.value = LEVEL_SECTOR; sel.onchange();
      if (editorialContent.codePattern !== LEVEL_SECTOR) throw new Error('pattern ' + editorialContent.codePattern);
      const host2 = document.createElement('div');
      _codePatternPanelInto(host2);
      const b = host2.querySelector('[data-code-pattern="recode"]');
      if (!b || b.textContent.indexOf('Recode 1 placement') < 0) throw new Error('button ' + (b && b.textContent));
      const lc = host2.querySelector('[data-level-code="0"]');
      if (!lc || lc.placeholder !== 'L3') throw new Error('level code ' + (lc && lc.placeholder));
      // Nothing to recode yet: the button says why rather than "Recode 0".
      dashProjectData[0].zone = ''; dashProjectData[0].id = 'ART.1';
      const host3 = document.createElement('div'); _codePatternPanelInto(host3);
      const b3 = host3.querySelector('[data-code-pattern="recode"]');
      if (!b3 || !b3.disabled || b3.textContent !== '1 placement needs a Sector to recode') throw new Error('empty recode: ' + (b3 && b3.textContent));
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
