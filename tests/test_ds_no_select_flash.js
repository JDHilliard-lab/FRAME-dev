// 18.69: selecting a drawn page (options sheet, card, plan detail, spec, floorplan) flashed.
// The centre drew the title-only mock ("ART.1 OPTIONS 1/2" on a blank page) and the rail
// cell mirrored that mock, then both swapped to the real render a beat later, on every
// click. Now the centre holds the page's last render (or its thumbnail) while it redraws,
// and the rail cell refuses to mirror a centre still marked data-ds-pending.
// Checked in real headless Chrome over CDP on a 14-option catalogue (four sheet pages),
// sampling every 30ms after each click: 18.68 showed the mock in the centre and the
// selected cell on every selection, 18.69 never does.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    function mockRect(el, w, h) { el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h }); }
    const S = window.__appSrc;
    const between = (a, b) => { const i = S.indexOf(a); const j = S.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('landmark missing: ' + (i < 0 ? a : b)); return S.slice(i, j); };

    const setup = () => {
      editorialContent.layoutPages = [];
      _dsPages = [{ kind: 'card', card: 'timeline', type: 'timeline', title: 'Timeline' }]; _dsIndex = 0;
      _dsCenterPreviewItem = null;
      document.getElementById('view-deck').classList.add('active');
      const c = document.getElementById('dsCenter'); c.innerHTML = '';
      const page = document.createElement('div');
      const base = document.createElement('div'); base.innerHTML = '<div class="mock">ART.1 OPTIONS 1/2</div>';
      page.appendChild(base); c.appendChild(page); mockRect(page, 936, 540);
      const rail = document.getElementById('dsRail'); rail.innerHTML = '';
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      cell.innerHTML = '<img class="cached" src="data:image/jpeg;base64,AAAA">';
      mockRect(cell, 168, 97); rail.appendChild(cell);
      return { base, cell };
    };

    __check('EXACT ASK: the selected rail cell keeps its thumbnail while the centre is still drawing (no mirrored placeholder)', () => {
      const { base, cell } = setup();
      base.dataset.dsPending = '1';
      _dsSyncActiveThumbnailMirror();
      if (cell.querySelector('._dsThumbMirrorWrap')) throw new Error('mirrored the placeholder: the cell flashes to a blank page with a title');
      if (!cell.querySelector('img.cached')) throw new Error('the cached thumbnail was removed');
    });
    __check('...and mirrors as soon as the real render is in', () => {
      const { base, cell } = setup();
      base.innerHTML = '<canvas width="10" height="10"></canvas>';
      _dsSyncActiveThumbnailMirror();
      if (!cell.querySelector('._dsThumbMirrorWrap canvas')) throw new Error('no mirror of the rendered page');
    });

    __check('EXACT ASK: a page drawn before shows its LAST RENDER in the centre while it redraws, never the mock', () => {
      const d = { kind: 'catov', type: 'catov', title: 'ART.1 OPTIONS 1/2' };
      const cv = document.createElement('canvas'); cv.width = 936; cv.height = 540;
      _dsCenterLastSet('catov:test', cv);
      const ph = _dsCenterPlaceholder(d, 'catov:test');
      if (!ph || ph.tagName !== 'CANVAS') throw new Error('expected a copy of the last render, got ' + (ph && ph.tagName));
      if (ph === cv) throw new Error('must be a copy (the stored canvas may be in the DOM elsewhere)');
      if (ph.width !== 936 || ph.height !== 540) throw new Error('copy is the wrong size');
    });
    __check('...falls back to the rail thumbnail, then to nothing (the caller draws the mock)', () => {
      const d = { kind: 'catov', type: 'catov', title: 'ART.1 OPTIONS 2/2', _k: 'fresh' };
      if (_dsCenterPlaceholder(d, 'catov:none') !== null) throw new Error('invented a placeholder for a page never drawn');
      _dsThumbCache[_dsThumbCacheKey(d)] = 'data:image/jpeg;base64,BBBB';
      const ph = _dsCenterPlaceholder(d, 'catov:none');
      if (!ph || ph.tagName !== 'IMG') throw new Error('did not use the rail thumbnail');
    });
    __check('the last-render store is bounded', () => {
      for (let i = 0; i < DS_CENTER_LAST_MAX + 5; i++) { const c = document.createElement('canvas'); c.width = c.height = 1; _dsCenterLastSet('k' + i, c); }
      if (_dsCenterLast.size > DS_CENTER_LAST_MAX) throw new Error('kept ' + _dsCenterLast.size);
      if (!_dsCenterLast.has('k' + (DS_CENTER_LAST_MAX + 4))) throw new Error('dropped the newest instead of the oldest');
    });

    __check('the drawn-page centre uses the placeholder before the mock, marks pending, stores the render, clears pending on every exit', () => {
      const a = S.indexOf("if (desc.kind === 'card' || desc.kind === 'fixed' || desc.kind === 'planDetail' || desc.kind === 'catov') {");
      const b = S.indexOf('}).catch(', a);
      if (a < 0 || b < 0) throw new Error('card branch landmarks missing');
      const body = S.slice(a, S.indexOf(';', b) + 1);
      const ph = body.indexOf('_dsCenterPlaceholder(desc, _pk)'), mock = body.indexOf('_deckMockHTML(');
      if (ph < 0) throw new Error('centre does not try the last render first');
      if (mock < ph) throw new Error('mock drawn before the placeholder is tried');
      if (body.indexOf("base.dataset.dsPending = '1'") < 0) throw new Error('base not marked pending');
      if (body.indexOf('_dsCenterLastSet(_pk, cv2)') < 0) throw new Error('render not remembered');
      if (body.split('delete base.dataset.dsPending').length - 1 < 2) throw new Error('pending not cleared in both the then and the catch');
    });
    __check('spec and floorplan centres also hold the rail cell while they draw', () => {
      const spec = between("specBase.style.cssText = 'position:absolute; inset:0;';", '}).catch(() => { _igNoCapture = _prevNoCap;');
      if (spec.indexOf("specBase.dataset.dsPending = '1'") < 0) throw new Error('spec base not marked pending');
      if (spec.indexOf('delete specBase.dataset.dsPending') < 0) throw new Error('spec pending never cleared');
      const fp = between('\\nfunction _dsRenderCenterFloorplan(', '}).catch(() => { delete base.dataset.dsPending; });');
      if (fp.indexOf("base.dataset.dsPending = '1'") < 0) throw new Error('floorplan base not marked pending');
      if (fp.indexOf('delete base.dataset.dsPending') < 0) throw new Error('floorplan pending never cleared in the then');
    });
  `;
  try { window.__appSrc = JSON.stringify(src); window.eval('window.__appSrc = ' + window.__appSrc + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
