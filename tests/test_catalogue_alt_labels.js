// AN ALTERNATE ARRANGEMENT SAYS SO ON ITS BREAKER, AND AN OPTION PAGE SAYS WHICH OPTION (17.99).
//  "when I do an option with same frames new arrangement or different frame count and
//   images and then the breaker page.. should that get an additional title like alternate
//   layout some short title that lets people know this is an alternate set/layout for the
//   placement"
// The breaker for ART.1B read ELEVATION DETAIL · B, and the letter told a client nothing.
// Now: the original reads ELEVATION DETAIL, a re-hang of the same frames ALTERNATE LAYOUT,
// a different set of frames ALTERNATE FRAME SET, each with the designer's name after a
// dot. An option's group page carries OPTION n (plus the alternate kind) as its subheading.
// NO REGEX IN THIS FILE: patterns in a test block lose their backslashes.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__done = (async () => {
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _toast = function () { return null; };
    const __realConfirm = showConfirmModal;
    showConfirmModal = function () { __realConfirm.apply(this, arguments); const y = document.querySelector('#infoModalButtons button'); if (y) y.click(); };
    const slot = (id, letter, x) => ({ id: id, letter: letter, w: 24, h: 30, x: x, y: 48, fW: 1, fType: 'color', fColor: '#111', fCode: 'BLK',
      m1A: true, m1: 2, product: 'Framed Art', artworkUrl: '', imageCode: '', active: true, dimTo: [], distToggles: {} });
    const row = (id, extra) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id, qty: 0, product: 'Framed Art', extW: 24, extH: 30, level: 0, notes: 'was ' + id }, extra || {});
    // The reported shape: a three-piece placement ART.1 (A B C), with plain codes either side.
    const project = (withNeighbours) => {
      elevations.length = 0; dashProjectData.length = 0;
      editorialContent = _editorialDefaults();
      if (withNeighbours) { dashProjectData.push(row('ART.2')); }
      ['A', 'B', 'C'].forEach(L => dashProjectData.push(row('ART.1' + L)));
      if (withNeighbours) { dashProjectData.push(row('ART.3')); }
      elevations.push({ id: _elevNewId(), name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 },
        frames: [slot('ART.1A', 'A', 40), slot('ART.1B', 'B', 80), slot('ART.1C', 'C', 120)] });
      currentElevIndex = 0; currentView = 'elevation';
      undoStack.length = 0; redoStack.length = 0; _isFirstHistoryPush = true;
      return elevations[0];
    };
    const walls = () => elevations.map(e => e.name).join();
    const options = () => elevations.filter(e => e.catalogueOption).map(e => e.name + '=' + e.catalogueOption).join();
    const optIds = () => dashProjectData.filter(r => r.id.indexOf('ART.1.') === 0).map(r => r.id).join();
    const kind = (k, label) => _catAddOptionOfKind(elevations.indexOf(elevations.filter(e => _isCatalogueMaster(e))[0] || elevations[0]), k, label);

    const wallOf = code => elevations.filter(e => _catBaseCode(e) === code && _isCatalogueMaster(e))[0];
    const fnBody = (name) => { const S = window.__appSrc; const i = S.indexOf('function ' + name + '('); const j = S.indexOf(String.fromCharCode(10) + '}', i); return S.slice(i, j); };
    const groupSubText = async (opt) => {
      const rows = opt.frames.map(f => dashProjectData.filter(r => r.id === f.id)[0]).filter(Boolean);
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 4, {}, { rep: rows[0], members: rows, key: opt.name }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      return rec.ops.filter(o => o.t === 'text').map(o => String(o.str)).join(' | ');
    };

    __check('EXACT ASK: the original reads ELEVATION DETAIL, a re-hang ALTERNATE LAYOUT, new frames ALTERNATE FRAME SET', () => {
      project();
      kind('images'); kind('arrangeNew', ''); kind('setNew', 'Salon hang');
      const a = wallOf('ART.1'), b = wallOf('ART.1B'), c = wallOf('ART.1C');
      if (!a || !b || !c) throw new Error('setup: ' + walls());
      if (_catBreakerSub(a) !== 'ELEVATION DETAIL') throw new Error('original: ' + _catBreakerSub(a));
      if (_catBreakerSub(b) !== 'ALTERNATE LAYOUT') throw new Error('re-hang: ' + _catBreakerSub(b));
      if (_catBreakerSub(c) !== 'ALTERNATE FRAME SET \u00b7 Salon hang') throw new Error('frame set: ' + _catBreakerSub(c));
    });

    __check('a named original keeps its name and no ALTERNATE; the bare letter is gone', () => {
      project();
      kind('images'); kind('arrangeNew', 'Triptych');
      const a = wallOf('ART.1'), b = wallOf('ART.1B');
      a.catalogueLabel = 'Salon';
      if (_catBreakerSub(a) !== 'ELEVATION DETAIL \u00b7 Salon') throw new Error(_catBreakerSub(a));
      if (_catBreakerSub(b).indexOf(' B') >= 0 || _catBreakerSub(b).indexOf('\u00b7 B') >= 0) throw new Error('letter still printed: ' + _catBreakerSub(b));
      if (_catBreakerSub(b) !== 'ALTERNATE LAYOUT \u00b7 Triptych') throw new Error(_catBreakerSub(b));
    });

    __check('a second layout of the ALTERNATE frame set is an ALTERNATE LAYOUT', () => {
      project();
      kind('images'); kind('setNew', '');
      const b = wallOf('ART.1B');
      _catAddArrangement(elevations.indexOf(b), { stay: true });
      const c = wallOf('ART.1C');
      if (!c) throw new Error('setup: ' + walls());
      if (_catSetKey('ART.1C') !== _catSetKey('ART.1B')) throw new Error('setup: C is not in set 2');
      if (_catBreakerSub(b) !== 'ALTERNATE FRAME SET') throw new Error('B: ' + _catBreakerSub(b));
      if (_catBreakerSub(c) !== 'ALTERNATE LAYOUT') throw new Error('C: ' + _catBreakerSub(c));
    });

    __check('the breaker MEASURES and DRAWS the same subtitle, so the drawing cannot rise into it', () => {
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('getTextWidth(isElev ? _catBreakerSub(arg)') < 0) throw new Error('the measure does not use _catBreakerSub');
      if (b.indexOf('doc.text(isElev ? _catBreakerSub(arg)') < 0) throw new Error('the draw does not use _catBreakerSub');
    });

    __check('the option page label: OPTION n, plus the alternate kind', () => {
      project();
      kind('images'); kind('setNew', 'Salon');
      const ids = e => e.frames.map(f => f.id);
      const o1 = elevations.filter(e => e.name === 'ART.1.1')[0], o3 = elevations.filter(e => e.name === 'ART.1.3')[0];
      if (!o1 || !o3) throw new Error('setup: ' + options());
      if (_catOptionPageSub(ids(o1)) !== 'OPTION 1') throw new Error(_catOptionPageSub(ids(o1)));
      if (_catOptionPageSub(ids(o3)) !== 'OPTION 3 \u00b7 ALTERNATE FRAME SET') throw new Error(_catOptionPageSub(ids(o3)));
      if (_catOptionPageSub(['ART.1A']) !== '') throw new Error('a mockup slot got a label');
      if (_catOptionPageSub(['NOPE']) !== '') throw new Error('a stray row got a label');
    });

    // Rendered, not read from source: the label has to reach the page.
    const _p = [];
    _p.push((async () => {
      project();
      kind('images'); kind('setNew', '');
      const o3 = elevations.filter(e => e.name === 'ART.1.3')[0];
      const o1 = elevations.filter(e => e.name === 'ART.1.1')[0];
      const t3 = await groupSubText(o3), t1 = await groupSubText(o1);
      __check('RENDERED: the option group page prints OPTION 3 \u00b7 ALTERNATE FRAME SET', () => {
        if (t3.indexOf('OPTION 3 \u00b7 ALTERNATE FRAME SET') < 0) throw new Error(t3.slice(0, 300));
        if (t1.indexOf('OPTION 1') < 0 || t1.indexOf('ALTERNATE') >= 0) throw new Error('option 1: ' + t1.slice(0, 300));
      });
      // An ordinary group (not a catalogue) prints no subheading.
      elevations.length = 0; dashProjectData.length = 0;
      ['A', 'B'].forEach(L => dashProjectData.push(row('ART.5' + L)));
      const rec = new CanvasPdfRec(936, 540);
      await _drawSpecSetPage(rec, {}, 4, {}, { rep: dashProjectData[0], members: dashProjectData.slice(), key: 'ART.5' }, 'setLegend', { PW: 936, PH: 540, M: 40 });
      const t = rec.ops.filter(o => o.t === 'text').map(o => String(o.str)).join(' | ');
      __check('RENDERED: an ordinary group page grows no OPTION line', () => {
        if (t.indexOf('OPTION') >= 0) throw new Error(t.slice(0, 300));
      });
    })().catch(e => __check('render harness', () => { throw e; })));
    await Promise.all(_p);
    })();
  `;
  try {
    window.__appSrc = src;
    window.eval(src + '\n' + testBlock);
    await window.__done;
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const failures = results.filter(r => !r.ok);
  results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' -> ' + r.err); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
