// 19.98, THE BUDGET SKETCH. The BDQ Budget Estimator project: "Here's a floorplan for a hotel
// lobby with no markups, suggest artwork locations and sizes and give me a rough budget."
// On the floor plan: pick a type and a standard size (11x14 to 40x50), switch Sketch on, and
// every click drops a new piece there, priced by the rate card, with the budget under the bar.
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
    _autosaveToldUser = true; scheduleAutosave = () => {}; _toast = () => null;
    let __pushes = 0; pushHistory = () => { __pushes++; };
    _dsRefresh = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsRenderTools = () => {};
    const img = document.createElement('img'); img.id = 'dsFpPlanImg'; img.src = 'data:image/png;base64,AAAA';
    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400 });
    document.body.appendChild(img);
    const ev = (x, y) => ({ clientX: x, clientY: y, button: 0, preventDefault() {}, stopPropagation() {} });
    const artCat = () => (_artCats().find(c => _catCodeInfo(c.key).product === 'Framed Art') || {}).key;
    const egdCat = () => (_artCats().find(c => _catCodeInfo(c.key).prefix === 'EGD') || {}).key;
    const setup = () => {
      editorialContent = _editorialDefaults(); dashUnit = 'in';
      dashProjectData = [];
      _dsPages = [{ kind: 'floorplan', level: 1 }]; _dsIndex = 0; currentView = 'deck';
      _fpArmedId = null; _fpLineArmId = null; _fpLineStart = null; _fpSelLine = null;
      _fpSketchOn = false; _fpAddSize = ''; _fpSketchArea = ''; _fpAddType = artCat();
      __pushes = 0;
    };
    const card = () => setRateCard([{ product: 'Framed Art', base: 100, perSqFt: 10 }], '2026-10-01', { oversize: 150 });

    __check('EXACT ASK: with Sketch on, each click on the plan is a new piece of the type and size, pinned where it landed, one undo per click', () => {
      setup(); _fpAddSize = '36x24'; _fpSketchToggle(true);
      _dsFpPlace(ev(100, 100)); _dsFpPlace(ev(250, 300));
      if (dashProjectData.length !== 2) throw new Error(dashProjectData.length + ' pieces for two clicks');
      const a = dashProjectData[0], b = dashProjectData[1];
      if (parseFloat(a.extW) !== 36 || parseFloat(a.extH) !== 24) throw new Error('size ' + a.extW + 'x' + a.extH);
      if (a.product !== 'Framed Art') throw new Error(a.product);
      const pa = _fpPins(a), pb = _fpPins(b);
      if (pa.length !== 1 || pa[0].lv !== 1 || Math.abs(pa[0].x - 0.2) > 1e-9 || Math.abs(pa[0].y - 0.25) > 1e-9) throw new Error('pin ' + JSON.stringify(pa));
      if (Math.abs(pb[0].x - 0.5) > 1e-9 || Math.abs(pb[0].y - 0.75) > 1e-9) throw new Error('pin b ' + JSON.stringify(pb));
      if (a.id === b.id) throw new Error('same code twice');
      if (__pushes !== 2) throw new Error(__pushes + ' undo entries for two clicks');
      if (!_fpSketchOn) throw new Error('the sketch put itself down after one click');
      if (dashProjectData.some(r => '_fpSketchNew' in r)) throw new Error('marker left on a row');
    });

    __check('the sketch prices from the rate card at once (oversize past 40x50 included)', () => {
      setup(); card(); _fpSketchToggle(true);
      _fpAddSize = '30x40'; _dsFpPlace(ev(10, 10));
      _fpAddSize = '50x40'; _dsFpPlace(ev(20, 20));
      const t = _priceTotals();
      const want = (100 + 10 * 30 * 40 / 144) + (100 + 10 * 50 * 40 / 144);
      if (Math.abs(t.cost - want) > 0.05) throw new Error('cost ' + t.cost + ' vs ' + want);
      _fpAddSize = '40x60'; _dsFpPlace(ev(30, 30));
      const t2 = _priceTotals();
      if (Math.abs(t2.cost - want - (100 + 10 * 40 * 60 / 144 + 150)) > 0.05) throw new Error('oversize not added: ' + t2.cost);
    });

    __check('the Area goes onto each piece, so the budget totals by area', () => {
      setup(); card(); _fpSketchToggle(true); _fpAddSize = '24x36';
      _fpSketchArea = 'Lobby'; _dsFpPlace(ev(10, 10));
      _fpSketchArea = 'Corridor'; _dsFpPlace(ev(20, 20));
      const t = _priceTotals();
      if (!t.byArea.Lobby || !t.byArea.Corridor) throw new Error(JSON.stringify(Object.keys(t.byArea)));
    });

    __check('a flat graphic keeps its own size; a centimetre project gets the size converted', () => {
      setup(); _fpAddType = egdCat(); _fpAddSize = '30x40'; _fpSketchToggle(true);
      _dsFpPlace(ev(10, 10));
      const r = dashProjectData[0];
      if (!_isFlatGraphic(r.product)) throw new Error('not flat: ' + r.product);
      if (parseFloat(r.extW) === 30 && parseFloat(r.extH) === 40) throw new Error('standard art size forced onto a wallcovering');
      setup(); dashUnit = 'cm'; _fpAddSize = '16x20'; _fpSketchToggle(true);
      _dsFpPlace(ev(10, 10));
      const c = dashProjectData[0];
      if (Math.abs(parseFloat(c.extW) - 40.64) > 0.01 || Math.abs(parseFloat(c.extH) - 50.8) > 0.01) throw new Error('cm ' + c.extW + 'x' + c.extH);
    });

    __check('+ Add code takes the Size too, and still arms the code for one pin', () => {
      setup(); _fpAddSize = '11x14';
      const bar = _fpAddCodesBar({ level: 1 });
      const add = Array.prototype.find.call(bar.querySelectorAll('button'), b => b.textContent === '+ Add code');
      add.onclick();
      const r = dashProjectData[0];
      if (!r || parseFloat(r.extW) !== 11 || parseFloat(r.extH) !== 14) throw new Error('size ' + (r && r.extW));
      if (_fpArmedId !== r.id) throw new Error('not armed');
    });

    __check('without Sketch a plan click with nothing armed adds nothing; arming a code or a line puts the sketch down; Esc too', () => {
      setup(); _dsFpPlace(ev(10, 10));
      if (dashProjectData.length) throw new Error('added without Sketch');
      _fpSketchToggle(true); _dsFpArm('ART.1'); if (_fpSketchOn) throw new Error('still sketching after arming a code');
      _fpArmedId = null; _fpSketchToggle(true);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
      if (_fpSketchOn) throw new Error('Esc did not stop it');
    });

    __check('the bar has the Size list (11x14 to 40x50, both ways round) and a Sketch toggle lit while on; the Area shows only while sketching', () => {
      setup();
      let bar = _fpAddCodesBar({ level: 1 });
      const opts = Array.prototype.map.call(bar.querySelectorAll('#fpAddSize option'), o => o.value);
      ['11x14', '14x11', '16x20', '24x36', '36x24', '32x36', '30x40', '40x50', '50x40'].forEach(v => { if (opts.indexOf(v) < 0) throw new Error('no ' + v); });
      if (bar.querySelector('#fpSketchArea')) throw new Error('Area while not sketching');
      if (bar.querySelector('#fpSketchBtn').classList.contains('active')) throw new Error('lit while off');
      _fpSketchOn = true; bar = _fpAddCodesBar({ level: 1 });
      if (!bar.querySelector('#fpSketchBtn').classList.contains('active')) throw new Error('not lit');
      if (!bar.querySelector('#fpSketchArea')) throw new Error('no Area');
    });

    __check('the budget line: points at the rate card until something prices, then reads the totals', () => {
      setup();
      let s = _fpBudgetStrip();
      if (s.textContent.indexOf('No rate card') < 0) throw new Error(s.textContent);
      card(); _fpAddSize = '30x40'; _fpSketchToggle(true); _dsFpPlace(ev(10, 10));
      _pricingSet({ budget: 1000 }, true);
      s = _fpBudgetStrip();
      if (s.textContent.indexOf('Budget:') < 0 || s.textContent.indexOf('left') < 0) throw new Error(s.textContent);
    });
    __check('the plan is armed (crosshair, loupe) while sketching', () => {
      const i = src.indexOf("img.id = 'dsFpPlanImg'");
      const S = src.slice(i, src.indexOf('_fpLinePaintCtx = {', i));
      if (S.indexOf('_fpSketchOn') < 0) throw new Error('no crosshair while sketching');
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
