// 20.69, THE CODE BUILDER. "What if I want to change sector or S to zone Z, or make up a new
// coding system... a custom code builder, like add a column to extend the code, and create a
// letter system and whether or not it gets a number system attached to it." Parts (Category,
// Level, Plan field, Fixed text, Number) build the pattern; plan fields beyond the sector are
// {f1}..{f3}, set per plan; the level can print as L1, 1 or 01.
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
    const __check = (label, fn) => { __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }))); window.__asyncChecks.push(__chain); };
    _autosaveToldUser = true; scheduleAutosave = () => {}; _toast = () => null;
    let __pushes = 0; pushHistory = () => { __pushes++; };
    let __asked = []; let __answer = null; _askFields = async (o) => { __asked.push(o); return __answer; };
    _dsRefresh = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    const artCat = () => (_artCats().find(c => _catCodeInfo(c.key).product === 'Framed Art') || {}).key;
    const setup = (names, pat) => {
      editorialContent = _editorialDefaults(); dashUnit = 'in'; dashProjectData = [];
      floorplanLevels = names.map(n => ({ name: n, imageData: '', imageName: '' }));
      if (pat !== undefined) editorialContent.codePattern = pat;
      __pushes = 0; __asked = []; __answer = null;
      const m = document.getElementById('codeBuilderModal'); if (m) m.remove();
    };
    const ford = () => {
      setup(['Level 01 | Sector 10', 'Level 01 | Sector 16'], '{level}.{type}.S{zone}-{nn}');
      floorplanLevels[0].zone = '10'; floorplanLevels[1].zone = '16';
      _fpAddCodes(artCat(), 1, { ctx: { level: 0 } }); _fpAddCodes(artCat(), 2, { ctx: { level: 0 } }); _fpAddCodes(artCat(), 1, { ctx: { level: 1 } });
    };
    const M = () => document.getElementById('codeBuilderModal');
    const ids = () => dashProjectData.map(r => r.id).join();

    __check('every preset and start reads into parts and back to the same pattern', () => {
      const pats = CODE_PATTERN_PRESETS.map(p => p.v).filter(Boolean)
        .concat(CODE_BUILDER_STARTS.filter(s => s.parts).map(s => { const p = JSON.parse(JSON.stringify(s.parts)); _cbFieldKeys(p); return _codeBuilderToPattern(p); }))
        .concat(['1B.{level}.{type}-{nn}', 'B{f1}_{lvnn}/{type}-{nnn}', '{type}{nnn}', '{level}-{type}-{n}-X']);
      pats.forEach(p => { const back = _codeBuilderToPattern(_codeBuilderFromPattern(p)); if (back !== p) throw new Error(p + ' came back as ' + back); });
    });

    __check('EXACT ASK: change Sector / S to Zone / Z, and every code follows, values kept', async () => {
      ford();
      if (ids() !== 'L1.ART.S10-01,L1.ART.S10-02A,L1.ART.S10-02B,L1.ART.S16-01') throw new Error('setup ' + ids());
      openCodeBuilder();
      const zp = _cbState.parts.find(p => p.t === 'field');
      if (!zp || zp.tag !== 'S' || zp.label !== 'Sector') throw new Error('sector part ' + JSON.stringify(zp));
      zp.tag = 'Z'; zp.label = 'Zone';
      _codeBuilderLive();
      if (M().querySelector('[data-cb-preview]').textContent !== 'L1.ART.Z10-01') throw new Error('preview ' + M().querySelector('[data-cb-preview]').textContent);
      await _codeBuilderApply();
      if (ids() !== 'L1.ART.Z10-01,L1.ART.Z10-02A,L1.ART.Z10-02B,L1.ART.Z16-01') throw new Error('codes ' + ids());
      if (_codeZoneLabel() !== 'Zone' || floorplanLevels[1].zone !== '16') throw new Error('label/zone');
      if (__asked.length) throw new Error('asked a question it did not need');
      if (_nextPlacementCode('ART', { level: 1 }) !== 'L1.ART.Z16-02') throw new Error('next ' + _nextPlacementCode('ART', { level: 1 }));
    });

    __check('EXACT ASK: add a column (a Building field), set per plan, and the code grows', async () => {
      ford();
      openCodeBuilder();
      _codeBuilderAdd({ t: 'field', label: 'Building' });
      const bp = _cbState.parts.find(p => p.t === 'field' && p.label === 'Building');
      if (!bp || bp.k !== 'f1') throw new Error('new field key ' + (bp && bp.k));
      if (_cbState.parts[_cbState.parts.length - 1].t !== 'n') throw new Error('the Number is no longer last');
      if (!M().querySelector('[data-cb-val="' + bp.uid + ':0"]')) throw new Error('no Building column in the plan table');
      bp.tag = 'B'; _cbState.vals[bp.uid] = ['N', 'S'];
      await _codeBuilderApply();
      if (_codePattern() !== '{level}.{type}.S{zone}-B{f1}-{nn}') throw new Error('pattern ' + _codePattern());
      if (ids() !== 'L1.ART.S10-BN-01,L1.ART.S10-BN-02A,L1.ART.S10-BN-02B,L1.ART.S16-BS-01') throw new Error('codes ' + ids());
      if (_codeFieldLabel('f1') !== 'Building' || floorplanLevels[1].fields.f1 !== 'S') throw new Error('field not stored');
      if (_codeParse('L1.ART.S16-BS-01', _codePattern()).f1 !== 'S') throw new Error('cannot read the field back');
      // the Item codes table shows the column too
      const h = document.createElement('div'); _codePatternPanelInto(h);
      if (!h.querySelector('[data-level-field="f1:1"]') || h.querySelector('[data-level-field="f1:1"]').value !== 'S') throw new Error('no Building column on the panel');
    });

    __check('EXACT ASK: a made-up system: fixed text, the level as 01, letters, a 3-digit number', async () => {
      setup(['Level 02', 'Level 03']);
      _fpAddCodes(artCat(), 1, { ctx: { level: 0 } }); _fpAddCodes(artCat(), 1, { ctx: { level: 1 } });
      openCodeBuilder();
      if (_cbState.parts !== null) throw new Error('house should read as no parts');
      _codeBuilderAdd({ t: 'text', txt: 'PH1' }); _codeBuilderAdd({ t: 'level', fmt: 'nn' }); _codeBuilderAdd({ t: 'type' }); _codeBuilderAdd({ t: 'n', w: 3 });
      _cbState.parts[1].tag = 'FL';
      _codeBuilderLive();
      if (M().querySelector('[data-cb-use]').disabled) throw new Error('Use disabled: ' + M().querySelector('[data-cb-msgs]').textContent);
      await _codeBuilderApply();
      if (ids() !== 'PH1-FL02-ART-001,PH1-FL03-ART-001') throw new Error('codes ' + ids() + ' pattern ' + _codePattern());
    });

    __check('the builder refuses what cannot work: no Number, two values with nothing between', () => {
      setup(['Level 01']);
      openCodeBuilder();
      _codeBuilderAdd({ t: 'level', fmt: 'code' }); _codeBuilderAdd({ t: 'type' });
      if (!M().querySelector('[data-cb-use]').disabled) throw new Error('Use enabled with no Number');
      _codeBuilderAdd({ t: 'n', w: 2 });
      if (M().querySelector('[data-cb-use]').disabled) throw new Error('still disabled: ' + M().querySelector('[data-cb-msgs]').textContent);
      _cbState.parts[0].sep = ''; _codeBuilderLive();
      if (!M().querySelector('[data-cb-use]').disabled) throw new Error('L1ART read-back problem not caught');
      if (M().querySelector('.cb-err').textContent.indexOf('separator') < 0) throw new Error(M().querySelector('.cb-err').textContent);
    });

    __check('Start from fills plan fields from plan names (Building A, Zone 3)', () => {
      setup(['Level 02 | Building A', 'Level 02 | Building B']);
      openCodeBuilder();
      M().querySelector('[data-cb-start="bldg"]').onclick();
      const bp = _cbState.parts.find(p => p.t === 'field');
      if (_cbState.vals[bp.uid].join() !== 'A,B') throw new Error('values ' + _cbState.vals[bp.uid].join());
      if (M().querySelector('[data-cb-preview]').textContent !== 'A-L2-ART-001') throw new Error('preview ' + M().querySelector('[data-cb-preview]').textContent);
    });

    __check('a part dragged to a new place moves, and the codes read in the new order', () => {
      setup(['Level 01 | Sector 4']);
      openCodeBuilder();
      M().querySelector('[data-cb-start="sector"]').onclick();
      _codeBuilderMove(2, 0);   // Sector first
      _codeBuilderLive();
      const t = M().querySelector('[data-cb-preview]').textContent;
      if (t !== 'S4-L1.ART.01' && t.indexOf('S4') !== 0) throw new Error('preview ' + t);
      if (M().querySelector('[data-cb-use]').disabled) throw new Error('blocked after a move: ' + M().querySelector('[data-cb-msgs]').textContent);
    });

    __check('back to House from the builder', async () => {
      ford();
      openCodeBuilder();
      M().querySelector('[data-cb-start="house"]').onclick();
      await _codeBuilderApply();
      if (_codePattern() !== '' || ids() !== 'ART.1,ART.2A,ART.2B,ART.3') throw new Error(ids());
    });

    __check('+ Add code on a plan with no Building asks once and keeps it on the plan', async () => {
      setup(['Level 01', 'Level 02'], '{level}-B{f1}-{type}-{nn}');
      editorialContent.codeFields = { f1: 'Building' };
      floorplanLevels[0].fields = { f1: 'A' };
      _dsPages = [{ kind: 'floorplan', level: 1 }]; _dsIndex = 0; currentView = 'deck'; _fpAddType = artCat();
      __answer = { f1: 'C' };
      const bar = _fpAddCodesBar({ level: 1 });
      await Array.prototype.find.call(bar.querySelectorAll('button'), b => b.textContent === '+ Add code').onclick();
      if (!__asked.length || __asked[0].fields[0].label !== 'Building') throw new Error('not asked for Building');
      if (floorplanLevels[1].fields.f1 !== 'C') throw new Error('not kept on the plan');
      if (dashProjectData[0].id !== 'L2-BC-ART-01') throw new Error('code ' + dashProjectData[0].id);
    });

    __check('the Item codes panel has Build your own, and Custom opens the builder', () => {
      setup(['Level 01']);
      const h = document.createElement('div'); _codePatternPanelInto(h);
      h.querySelector('[data-code-pattern="builder"]').onclick();
      if (!M()) throw new Error('no builder');
      M().remove();
      const sel = h.querySelector('[data-code-pattern="preset"]'); sel.value = '__custom'; sel.onchange();
      if (!M()) throw new Error('Custom did not open the builder');
      if (_codePattern() !== '') throw new Error('choosing Custom changed the style by itself');
    });
  `;
  window.src = src;
  try { window.eval(src + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = await Promise.all(window.__asyncChecks || []);
  const bad = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + all.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
