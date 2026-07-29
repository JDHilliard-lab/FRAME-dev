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
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => { const p2 = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message })); __chain = p2.then(() => {}); window.__asyncChecks.push(p2); };
    editorialContent = editorialContent || {};

    function mockRect(el, w, h) {
      el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h });
    }

    // ── Source guards: chrome elements are correctly marked ──
    __check('SOURCE GUARD: transform handles are marked as chrome', () => {
      const S = window.__appSrc;
      const count = (S.match(/h\\.className = '_dsChrome';/g) || []).length;
      if (count < 2) throw new Error('expected both _mbHandles and _dsAnnHandles to mark their handles, found ' + count);
    });
    __check('SOURCE GUARD: corner-radius handle, marquee box, move grip, zoom pill, pan handle, arrow dot, and image-placeholder hint are all marked chrome', () => {
      const S = window.__appSrc;
      ["rHandle.className = '_dsChrome';", "box.className = '_dsChrome';", "g.className = '_dsChrome';", "zWrap.className = '_dsChrome';", "ph.className = '_dsChrome';", "hnd.className = '_dsChrome';", "hint.className = '_dsChrome';"].forEach(snippet => {
        if (S.indexOf(snippet) < 0) throw new Error('missing chrome marker: ' + snippet);
      });
    });
    __check('SOURCE GUARD: CSS hides _dsChrome, _mbGuideLine, and all buttons inside the mirror, and suppresses outline everywhere inside it', () => {
      const css = document.querySelector('style').textContent;
      if (css.indexOf('._dsThumbMirrorWrap ._dsChrome') < 0) throw new Error('chrome-hiding rule missing');
      if (css.indexOf('._dsThumbMirrorWrap ._mbGuideLine') < 0) throw new Error('guide-line-hiding rule missing');
      if (css.indexOf('._dsThumbMirrorWrap button') < 0) throw new Error('button-hiding rule missing');
      if (css.indexOf('outline: none !important') < 0) throw new Error('outline-suppression rule missing');
    });

    // ── Throttling behavior ──
    __checkAsync('THROTTLE: rapid successive calls collapse into throttled syncs, not one per call', async () => {
      let syncCount = 0;
      const orig = _dsSyncActiveThumbnailMirror;
      _dsSyncActiveThumbnailMirror = () => { syncCount++; };
      for (let i = 0; i < 10; i++) { _dsRequestThumbnailSync(); await new Promise(r => setTimeout(r, 10)); }
      await new Promise(r => setTimeout(r, 100));
      if (syncCount >= 10) throw new Error('no throttling occurred \\u2014 got ' + syncCount + ' syncs for 10 rapid calls');
      if (syncCount < 1) throw new Error('throttling suppressed everything, including the trailing catch-up sync');
      _dsSyncActiveThumbnailMirror = orig;
    });

    // ── Core mirroring behavior ──
    __check('MIRROR: clones the source canvas into the correct rail cell, scaled by the cell/source ratio', () => {
      editorialContent.layoutPages = [{ id: 'pgMirror', type: 'moodboard', title: 'Mirror', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const source = document.createElement('div'); source.id = 'dsLayoutCanvas';
      source.innerHTML = '<div>Real content</div>';
      mockRect(source, 936, 540);
      document.body.appendChild(source);
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      mockRect(cell, 200, 115.6);
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      const wrap = cell.querySelector('._dsThumbMirrorWrap');
      if (!wrap) throw new Error('mirror wrapper not created');
      if (wrap.textContent.indexOf('Real content') < 0) throw new Error('cloned content missing');
      const clone = wrap.firstElementChild;
      const expectedScale = 200/936;
      if (clone.style.transform.indexOf('scale(' + expectedScale) < 0) throw new Error('scale not computed correctly: ' + clone.style.transform);
      source.remove(); cell.remove(); modal.classList.remove('active');
    });

    __check('MIRROR: strips ids from the clone to avoid duplicate-ID collisions', () => {
      editorialContent.layoutPages = [{ id: 'pgMirror2', type: 'moodboard', title: 'M2', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const source = document.createElement('div'); source.id = 'dsLayoutCanvas';
      source.innerHTML = '<div id="dsGearBtnSomething">x</div>';
      mockRect(source, 936, 540);
      document.body.appendChild(source);
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      mockRect(cell, 200, 115.6);
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      const wrap = cell.querySelector('._dsThumbMirrorWrap');
      if (wrap.querySelector('[id]')) throw new Error('ids were not stripped from the clone');
      source.remove(); cell.remove(); modal.classList.remove('active');
    });

    __check('MIRROR: strips contenteditable from the clone so it is fully inert', () => {
      editorialContent.layoutPages = [{ id: 'pgMirror3', type: 'moodboard', title: 'M3', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const source = document.createElement('div'); source.id = 'dsLayoutCanvas';
      source.innerHTML = '<div contenteditable="true">editable text</div>';
      mockRect(source, 936, 540);
      document.body.appendChild(source);
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      mockRect(cell, 200, 115.6);
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      const wrap = cell.querySelector('._dsThumbMirrorWrap');
      if (wrap.querySelector('[contenteditable]')) throw new Error('contenteditable not stripped from the clone');
      source.remove(); cell.remove(); modal.classList.remove('active');
    });

    __check('GUARD: does nothing when Deck Studio is closed', () => {
      editorialContent.layoutPages = [{ id: 'pgMirror4', type: 'moodboard', title: 'M4', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.remove('active');
      const source = document.createElement('div'); source.id = 'dsLayoutCanvas';
      mockRect(source, 936, 540);
      document.body.appendChild(source);
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      mockRect(cell, 200, 115.6);
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      if (cell.querySelector('._dsThumbMirrorWrap')) throw new Error('mirror created even though Deck Studio is closed');
      source.remove(); cell.remove();
    });

    __check('INTEGRATION: renderMoodboardCanvas triggers a thumbnail sync request', () => {
      const S = window.__appSrc;
      if (S.indexOf('_dsRequestThumbnailSync();\\n}') < 0 && S.indexOf('_dsRequestThumbnailSync();\\r\\n}') < 0) {
        // Looser check: the call exists right before the function's closing brace region
        if (S.indexOf('_dsRequestThumbnailSync();') < 0) throw new Error('renderMoodboardCanvas does not call _dsRequestThumbnailSync at all');
      }
    });
    __check('PAGE SWITCH: mirror correctly retargets to whichever page is currently selected', () => {
      editorialContent.layoutPages = [
        { id: 'pgSwitchA', type: 'moodboard', title: 'A', elements: [] },
        { id: 'pgSwitchB', type: 'moodboard', title: 'B', elements: [] }
      ];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }, { kind: 'layout', page: editorialContent.layoutPages[1] }];
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const source = document.createElement('div'); source.id = 'dsLayoutCanvas';
      source.innerHTML = '<div>Whichever page is active</div>';
      mockRect(source, 936, 540);
      document.body.appendChild(source);
      const rail = document.getElementById('dsRail');
      const cellA = document.createElement('div'); cellA.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0])); mockRect(cellA, 200, 115.6);
      const cellB = document.createElement('div'); cellB.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[1])); mockRect(cellB, 200, 115.6);
      rail.appendChild(cellA); rail.appendChild(cellB);
      _dsIndex = 0;
      _dsSyncActiveThumbnailMirror();
      if (!cellA.querySelector('._dsThumbMirrorWrap')) throw new Error('page A cell did not get the mirror');
      if (cellB.querySelector('._dsThumbMirrorWrap')) throw new Error('page B cell incorrectly got a mirror while A was active');
      _dsIndex = 1;
      _dsSyncActiveThumbnailMirror();
      if (!cellB.querySelector('._dsThumbMirrorWrap')) throw new Error('page B cell did not get the mirror after switching to it');
      source.remove(); cellA.remove(); cellB.remove(); modal.classList.remove('active');
    });

    __check('RAIL REBUILD: if the rail wipes the mirror wrapper (e.g. a full rail re-render), the next sync rebuilds it cleanly', () => {
      editorialContent.layoutPages = [{ id: 'pgRebuild', type: 'moodboard', title: 'R', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const source = document.createElement('div'); source.id = 'dsLayoutCanvas';
      source.innerHTML = '<div>Content</div>';
      mockRect(source, 936, 540);
      document.body.appendChild(source);
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0])); mockRect(cell, 200, 115.6);
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      if (!cell.querySelector('._dsThumbMirrorWrap')) throw new Error('initial mirror not created');
      // Simulate a full rail rebuild (e.g. _dsRenderRail or the high-fidelity
      // _dsPaintThumb overwriting this cell with a static cached <img>).
      cell.innerHTML = '<img src="data:image/jpeg;base64,X">';
      _dsSyncActiveThumbnailMirror();
      if (!cell.querySelector('._dsThumbMirrorWrap')) throw new Error('mirror was not rebuilt after the cell was wiped');
      if (cell.querySelector('._dsThumbMirrorWrap').textContent.indexOf('Content') < 0) throw new Error('rebuilt mirror missing content');
      source.remove(); cell.remove(); modal.classList.remove('active');
    });
    __check('SOURCE GUARD (second sweep): mockup-piece, pannable-shape, and text resize handles are also marked chrome', () => {
      const S = window.__appSrc;
      const count = (S.match(/handle\.className = '_dsChrome';/g) || []).length;
      if (count < 3) throw new Error('expected at least 3 additional "handle" variables marked, found ' + count);
      if (S.indexOf("th.className = '_dsChrome';") < 0) throw new Error('text box resize handle (th) not marked');
    });
    __check('EXACT BUG: annotations (shapes/images), which render as SIBLINGS of the inner mb-elements canvas under dsCenter, are now correctly included in the mirror', () => {
      editorialContent.layoutPages = [{ id: 'pgRealBug', type: 'custom', title: 'Real Bug', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const centerEl = document.getElementById('dsCenter');
      centerEl.innerHTML = '';
      const page = document.createElement('div');
      const cv = document.createElement('div'); cv.id = 'dsLayoutCanvas'; cv.innerHTML = '<div>mb element text</div>';
      const annBox = document.createElement('div'); annBox.innerHTML = '<img src="data:image/jpeg;base64,ANNOTATIONPHOTO">';
      page.appendChild(cv); page.appendChild(annBox);
      centerEl.appendChild(page);
      page.getBoundingClientRect = () => ({ width: 936, height: 540 });
      const rail = document.getElementById('dsRail');
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      cell.getBoundingClientRect = () => ({ width: 200, height: 115.6 });
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      const wrap = cell.querySelector('._dsThumbMirrorWrap');
      if (!wrap) throw new Error('mirror not created');
      if (wrap.textContent.indexOf('mb element text') < 0) throw new Error('mb-element content missing from mirror');
      if (wrap.innerHTML.indexOf('ANNOTATIONPHOTO') < 0) throw new Error('the exact reported bug: annotation image still missing from the mirror');
      centerEl.innerHTML = ''; cell.remove(); modal.classList.remove('active');
    });
    __check('EXACT BUG: the mirror preserves the page background (theme colour AND background photo), instead of wiping it to white', () => {
      editorialContent.layoutPages = [{ id: 'pgBgKeep', type: 'custom', title: 'BgKeep', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const modal = document.getElementById('view-deck'); modal.classList.add('active');
      const centerEl = document.getElementById('dsCenter');
      centerEl.innerHTML = '';
      const page = document.createElement('div');
      // This is how a themed page really looks: the background photo and colour
      // live in the page element's OWN style attribute.
      page.setAttribute('style', 'position:relative; width:936px; height:540px; background:#1a1a1a; background-image:url(data:image/jpeg;base64,SEPIAPHOTO); background-size:120% 100%; background-position:40% 60%;');
      page.innerHTML = '<div id="dsLayoutCanvas"><div>COVER PAGE HEADING</div></div>';
      centerEl.appendChild(page);
      page.getBoundingClientRect = () => ({ width: 936, height: 540 });
      const rail = document.getElementById('dsRail');
      rail.innerHTML = '';
      const cell = document.createElement('div'); cell.setAttribute('data-thumb-key', _dsThumbCacheKey(_dsPages[0]));
      cell.getBoundingClientRect = () => ({ width: 200, height: 115.6 });
      rail.appendChild(cell);
      _dsSyncActiveThumbnailMirror();
      const clone = cell.querySelector('._dsThumbMirrorWrap').firstElementChild;
      const st = clone.getAttribute('style') || '';
      if (st.indexOf('SEPIAPHOTO') < 0) throw new Error('the exact reported bug: background photo was wiped from the mirror, leaving a blank white page');
      if (st.indexOf('background-size') < 0 || st.indexOf('background-position') < 0) throw new Error('background crop (size/position) lost \\u2014 mirror would show the wrong crop');
      if (st.indexOf('#1a1a1a') < 0) throw new Error('dark theme background colour lost from the mirror');
      if (st.indexOf('scale(') < 0) throw new Error('scaling override missing');
      if (st.indexOf('box-shadow:none') < 0) throw new Error('page drop-shadow not suppressed inside the thumbnail');
      centerEl.innerHTML = ''; cell.remove(); modal.classList.remove('active');
    });
    __check('EXACT BUG: the rail rebuild path (which paints cached images directly, bypassing _dsPaintThumb) now re-requests the mirror for the active cell', () => {
      const S = window.__appSrc;
      const i = S.indexOf('thumb.dataset.pageId = _pid;');
      if (i < 0) throw new Error('rail cell setup not found');
      const after = S.slice(i, i + 600);
      if (after.indexOf('_dsRequestThumbnailSync()') < 0) throw new Error('the exact reported bug: rail rebuild does not restore the live mirror, so it is destroyed on every page select/refresh');
      if (after.indexOf('i === _dsIndex') < 0) throw new Error('mirror restore is not scoped to the active cell');
    });
  `;
  try { window.__appSrc = JSON.stringify(src); window.eval('window.__appSrc = ' + window.__appSrc + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
