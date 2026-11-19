// 20.68, THE FLOOR PLAN SAYS WHAT TO DO FIRST. A designer's review of the floor plan panel:
// "the size / sketch button, do we need it, it might confuse designers", "the rate card has no
// context on the floorplan page, it should only be in production", "how does a designer control
// the coding, when do they use house coding vs sector coding", "how were the sectors created,
// do I create the plan pages first and name them a certain way". So: Size, Sketch and the rate
// card line only in budget mode (from Production); a Set up this floor plan card with three live
// steps; a Floor plan guide popup; a plan named "Level 01 | Sector 10" takes its sector at once.
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
    window.__testResults = []; window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => { __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }))); window.__asyncChecks.push(__chain); };
    _autosaveToldUser = true; scheduleAutosave = () => {}; let __toasts = []; _toast = (a, b) => { __toasts.push(a); return null; };
    let __pushes = 0; pushHistory = () => { __pushes++; };
    let __asked = 0; _askFields = async () => { __asked++; return null; };
    _dsRefresh = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    renderFloorplanMarkup = () => {};
    const artCat = () => (_artCats().find(c => _catCodeInfo(c.key).product === 'Framed Art') || {}).key;
    const SECTOR = '{level}.{type}.S{zone}-{nn}';
    const setup = (names, imgs) => {
      editorialContent = _editorialDefaults(); dashUnit = 'in';
      dashProjectData = [];
      floorplanLevels = names.map((n, i) => ({ name: n, imageData: imgs && imgs[i] ? 'data:image/png;base64,AAAA' : '', imageName: '' }));
      _dsPages = [{ kind: 'floorplan', level: 0 }]; _dsIndex = 0; currentView = 'deck';
      _fpArmedId = null; _fpLineArmId = null; _fpSketchOn = false; _fpAddSize = ''; _fpAddType = artCat();
      _fpBudgetModeSet(false); _fpSetupOpen = null; _fpUnplacedOnly = false; _fpPanelTab = 'items';
      __pushes = 0; __asked = 0; __toasts = [];
    };
    const panel = (lvl) => { const h = document.createElement('div'); _fpPanelItems(h, { kind: 'floorplan', level: lvl || 0 }); return h; };

    __check('EXACT ASK: a designer on the floor plan sees no Size, no Sketch and no rate card line', () => {
      setup(['Level 01'], [1]);
      const h = panel(0);
      if (h.querySelector('#fpAddSize')) throw new Error('Size is on the floor plan');
      if (h.querySelector('#fpSketchBtn')) throw new Error('Sketch is on the floor plan');
      if (h.querySelector('#fpBudgetStrip')) throw new Error('the budget line is on the floor plan');
      if (h.textContent.indexOf('Rate card') >= 0 || h.textContent.indexOf('rate card') >= 0) throw new Error('the rate card is named on the floor plan');
      if (!Array.prototype.some.call(h.querySelectorAll('button'), b => b.textContent === '+ Add code')) throw new Error('+ Add code went too: ' + Array.prototype.map.call(h.querySelectorAll('button'), b => b.textContent).join('/'));
    });

    __check('budget mode (from Production) brings them back, and Done budgeting puts them away and stops the sketch', () => {
      setup(['Level 01'], [1]);
      _fpBudgetModeSet(true);
      let h = panel(0);
      if (!h.querySelector('#fpAddSize') || !h.querySelector('#fpSketchBtn') || !h.querySelector('#fpBudgetStrip')) throw new Error('budget tools missing in budget mode');
      _fpSketchOn = true; _fpAddSize = '30x40';
      h.querySelector('[data-fp-budget-done]').onclick();
      if (_fpBudgetMode || _fpSketchOn || _fpAddSize) throw new Error('Done left budget state on');
      h = panel(0);
      if (h.querySelector('#fpSketchBtn')) throw new Error('Sketch still there after Done');
      const i = src.indexOf('function _prodPricingInto');
      const P = src.slice(i, src.indexOf('\\n}\\n', i));
      if (P.indexOf('startBudgetSketch') < 0) throw new Error('Production, Pricing has no way into the budget sketch');
    });

    __check('the setup card: Plans, Code style, Add and pin, live from the project', () => {
      setup(['Level 01', 'Level 02'], [1, 0]);
      let h = panel(0);
      const card = h.querySelector('[data-fp-setup]');
      if (!card || card.getAttribute('data-fp-setup') !== 'todo') throw new Error('no to-do card on a fresh project');
      const steps = Array.prototype.map.call(card.querySelectorAll('[data-fp-step]'), s => s.getAttribute('data-fp-step'));
      if (steps.join() !== 'plans,codes,pins') throw new Error('steps ' + steps.join());
      const pl = card.querySelector('[data-fp-step="plans"]');
      if (pl.classList.contains('done') || pl.textContent.indexOf('1 of 2') < 0) throw new Error('plans step: ' + pl.textContent);
      if (card.querySelector('[data-fp-step="codes"]').classList.contains('done')) throw new Error('code style done before one was picked');
      floorplanLevels[1].imageData = 'data:image/png;base64,AAAA';
      editorialContent.codePattern = '';
      _fpAddCodes(artCat(), 1, { ctx: { level: 0 } });
      h = panel(0);
      const pins = h.querySelector('[data-fp-step="pins"]');
      if (pins.classList.contains('done') || pins.textContent.indexOf('1 of 1') < 0) throw new Error('pins step: ' + pins.textContent);
      _fpSetPin(dashProjectData[0], 0, 0.5, 0.5);
      h = panel(0);
      const c2 = h.querySelector('[data-fp-setup]');
      if (c2.getAttribute('data-fp-setup') !== 'done') throw new Error('not done with plans, a style and every code pinned');
      if (c2.querySelector('[data-fp-step]')) throw new Error('a finished card did not fold');
      c2.querySelector('[data-fp-setup-toggle]').onclick();
      if (!panel(0).querySelector('[data-fp-step]')) throw new Error('could not unfold it');
    });

    __check('the Codes step goes to Categories; Show them turns on Unplaced', () => {
      setup(['Level 01'], [1]);
      _fpAddCodes(artCat(), 1, { ctx: { level: 0 } });
      const h = panel(0);
      h.querySelector('[data-fp-step="codes"] .fp-setup-go').onclick();
      if (_fpPanelTab !== 'cats') throw new Error('Codes went to ' + _fpPanelTab);
      h.querySelector('[data-fp-step="pins"] .fp-setup-go').onclick();
      if (!_fpUnplacedOnly) throw new Error('Show them did not filter');
    });

    __check('EXACT ASK: plans named Level 01 | Sector 10 / 16 switch to the sector style with no question, codes per sector', async () => {
      setup(['Level 01 | Sector 10', 'Level 01 | Sector 16'], [1, 1]);
      _fpAddCodes(artCat(), 1, { ctx: { level: 0 } });
      _fpAddCodes(artCat(), 1, { ctx: { level: 1 } });
      await _codesSwitchPattern(SECTOR);
      if (__asked) throw new Error('asked for a sector the plan names already give');
      if (floorplanLevels[0].zone !== '10' || floorplanLevels[1].zone !== '16') throw new Error('zones ' + floorplanLevels.map(l => l.zone));
      const ids = dashProjectData.map(r => r.id).sort().join();
      if (ids !== 'L1.ART.S10-01,L1.ART.S16-01') throw new Error(ids);
    });

    __check('renaming a plan to name its sector sets it at once and the codes follow; a hand-typed sector is kept', async () => {
      setup(['Level 01 | Sector 10', 'Level 01'], [1, 1]);
      editorialContent.codePattern = SECTOR; floorplanLevels[0].zone = '10';
      _fpAddCodes(artCat(), 1, { ctx: { level: 0, zone: '10' } });
      _fpLevel = 0; _askText = async () => 'Level 01 | Sector 12';
      await _fpRenameLevel();
      if (floorplanLevels[0].zone !== '12') throw new Error('zone ' + floorplanLevels[0].zone);
      if (dashProjectData[0].id !== 'L1.ART.S12-01') throw new Error('code ' + dashProjectData[0].id);
      floorplanLevels[0].zone = 'X9';
      _askText = async () => 'Level 01 | Sector 14';
      await _fpRenameLevel();
      if (floorplanLevels[0].zone !== 'X9') throw new Error('a typed sector was overwritten: ' + floorplanLevels[0].zone);
      setup(['Level 01'], [1]); editorialContent.codePattern = '';
      _fpLevel = 0; _askText = async () => 'Level 01 | Sector 12';
      await _fpRenameLevel();
      if (floorplanLevels[0].zone) throw new Error('a house-code project got a sector');
    });

    __check('Item codes says what it does and when to use the chosen style; Which style? opens the guide on Code styles', () => {
      setup(['Level 01'], [1]);
      CODE_PATTERN_PRESETS.forEach(p => { if (!p.use) throw new Error('no when-to-use for ' + p.label); });
      const h = document.createElement('div'); _codePatternPanelInto(h);
      if (!h.querySelector('[data-code-pattern="about"]')) throw new Error('no what-it-does line');
      if (h.querySelector('[data-code-pattern="use"]').textContent !== CODE_PATTERN_PRESETS[0].use) throw new Error('use line');
      h.querySelector('[data-code-pattern="guide"]').onclick();
      const pop = document.getElementById('fpGuidePop');
      if (!pop || pop.style.display !== 'flex') throw new Error('guide did not open');
      const act = pop.querySelector('.csp-tab.active');
      if (!act || act.textContent !== 'Code styles') throw new Error('opened on ' + (act && act.textContent));
      const sec = HELP_REFERENCE_DATA.find(s => s.id === 'floorplan-guide');
      const titles = sec.entries.map(e => e.title).join('|');
      if (titles !== 'Start here|Plans and sectors|Code styles|Example: Ford Hub L01') throw new Error(titles);
      if (sec.entries.some(e => e.body.indexOf('\\u2014') >= 0)) throw new Error('em dash in the guide');
      const card = panel(0).querySelector('[data-fp-guide]');
      card.onclick();
      if (pop.querySelector('.csp-tab.active').textContent !== 'Start here') throw new Error('setup Guide did not open on Start here');
    });
  `;
  window.src = src;
  try { window.eval(src + '\n' + 'var src = window.src;' + '\n' + testBlock); } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = await Promise.all(window.__asyncChecks || []);
  const bad = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + all.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
