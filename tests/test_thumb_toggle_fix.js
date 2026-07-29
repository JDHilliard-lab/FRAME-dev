const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {};

    function setupCell(desc) {
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div');
      cell.setAttribute('data-thumb-key', _dsThumbCacheKey(desc));
      cell.getBoundingClientRect = () => ({ width: 200, height: 115.6 });
      rail.appendChild(cell);
      return cell;
    }
    function setupSource() {
      const centerEl = document.getElementById('dsCenter');
      centerEl.innerHTML = '';
      const page = document.createElement('div');
      page.innerHTML = '<div id="dsLayoutCanvas"><div>LIVE MIRROR CONTENT</div></div>';
      centerEl.appendChild(page);
      page.getBoundingClientRect = () => ({ width: 936, height: 540 });
      return page;
    }

    __check('EXACT BUG: the canvas-rendered image no longer overwrites the active page live mirror (the visible toggle)', () => {
      editorialContent.layoutPages = [{ id: 'pgToggle', type: 'custom', title: 'Toggle', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      document.getElementById('view-deck').classList.add('active');
      document.getElementById('dsRail').innerHTML = '';
      setupSource();
      const cell = setupCell(_dsPages[0]);
      _dsSyncActiveThumbnailMirror();
      if (!cell.querySelector('._dsThumbMirrorWrap')) throw new Error('mirror not established');
      // Now the queued high-fidelity canvas render finishes and tries to paint.
      _dsPaintThumb(_dsThumbCacheKey(_dsPages[0]), 'data:image/jpeg;base64,CANVASRENDER');
      if (!cell.querySelector('._dsThumbMirrorWrap')) throw new Error('the exact reported bug: canvas image destroyed the live mirror');
      if (cell.innerHTML.indexOf('CANVASRENDER') >= 0) throw new Error('canvas image was injected over the mirror');
      if (cell.textContent.indexOf('LIVE MIRROR CONTENT') < 0) throw new Error('mirror content lost');
    });

    __check('anti-flash memory is still recorded even when the paint itself defers to the mirror', () => {
      editorialContent.layoutPages = [{ id: 'pgMem', type: 'custom', title: 'Mem', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      document.getElementById('dsRail').innerHTML = '';
      setupSource();
      const cell = setupCell(_dsPages[0]);
      cell.dataset.pageId = 'pgMem';
      _dsSyncActiveThumbnailMirror();
      _dsPaintThumb(_dsThumbCacheKey(_dsPages[0]), 'data:image/jpeg;base64,REMEMBERME');
      if (_dsThumbLast['pgMem'] !== 'data:image/jpeg;base64,REMEMBERME') throw new Error('anti-flash memory not recorded');
    });

    __check('a page with NO mirror still receives the normal canvas-rendered image (unchanged behaviour)', () => {
      editorialContent.layoutPages = [{ id: 'pgPlain', type: 'custom', title: 'Plain', elements: [] }];
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      document.getElementById('dsRail').innerHTML = '';
      const cell = setupCell(desc);
      _dsPaintThumb(_dsThumbCacheKey(desc), 'data:image/jpeg;base64,NORMALPAINT');
      if (cell.innerHTML.indexOf('NORMALPAINT') < 0) throw new Error('normal paint path regressed');
    });

    __check('the status badge now lives alongside the mirror, so it stops flickering as the systems alternate', () => {
      editorialContent.layoutPages = [{ id: 'pgBadge', type: 'custom', title: 'Badge', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      document.getElementById('dsRail').innerHTML = '';
      setupSource();
      const cell = setupCell(_dsPages[0]);
      _dsSyncActiveThumbnailMirror();
      const badgeHtml = _dsThumbBadgeHTML();
      if (badgeHtml && badgeHtml.trim() && cell.children.length < 2) throw new Error('badge was not preserved next to the mirror');
    });

    __check('switching pages releases the old cell mirror so it hands back to a normal render', () => {
      editorialContent.layoutPages = [
        { id: 'pgA1', type: 'custom', title: 'A1', elements: [] },
        { id: 'pgB1', type: 'custom', title: 'B1', elements: [] }
      ];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }, { kind: 'layout', page: editorialContent.layoutPages[1] }];
      _mbActiveCanvasId = 'dsLayoutCanvas';
      document.getElementById('dsRail').innerHTML = '';
      setupSource();
      const cellA = setupCell(_dsPages[0]);
      const cellB = setupCell(_dsPages[1]);
      _dsIndex = 0; _dsSyncActiveThumbnailMirror();
      if (!cellA.querySelector('._dsThumbMirrorWrap')) throw new Error('A did not get the mirror');
      _dsIndex = 1; _dsSyncActiveThumbnailMirror();
      if (!cellB.querySelector('._dsThumbMirrorWrap')) throw new Error('B did not get the mirror after switching');
      if (cellA.querySelector('._dsThumbMirrorWrap')) throw new Error('A still holds a stale mirror \\u2014 it would block its real render forever');
      _dsPaintThumb(_dsThumbCacheKey(_dsPages[0]), 'data:image/jpeg;base64,AFINALRENDER');
      if (cellA.innerHTML.indexOf('AFINALRENDER') < 0) throw new Error('released cell did not accept its normal render');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
