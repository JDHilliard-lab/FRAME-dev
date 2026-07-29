// Deck Studio as a top-level view (#view-deck) instead of a floating modal.
//
// The UI change: the top nav gained a "Deck" tab beside Frame Dashboard and
// Elevation (replacing the Spec PDF button), and Deck Studio moved out of its
// full-screen overlay into a .view-container sibling of the other two views.
//
// The risky part is how "is Deck Studio open?" is answered. It used to be six
// separate reads of the overlay's inline style.display, using three different
// predicates — and two of those treated display:'' as OPEN, which is exactly
// what an .active-driven view has. Left alone they'd have been permanently
// true. They all go through _dsIsOpen() now, which is class-based.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => {
      const p = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message }));
      __chain = p.then(() => {});
      window.__asyncChecks.push(p);
    };

    editorialContent = editorialContent || {};
    const __seedElevs = () => {
      elevations = [
        { name: 'Wall A', frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } },
        { name: 'Wall B', frames: [], wallW: 200, wallH: 96,  personPos: { x: -60 } }
      ];
      currentElevIndex = 0;
    };
    const __cls = (id) => { const e = document.getElementById(id); return e ? e.classList.contains('active') : null; };

    // ── The view itself ──
    __check('all three views exist as .view-container siblings inside .app-content', () => {
      const ac = document.querySelector('.app-content');
      ['view-dashboard', 'view-elevation', 'view-deck'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) throw new Error('missing #' + id);
        if (!el.classList.contains('view-container')) throw new Error('#' + id + ' is not a .view-container');
        if (el.parentElement !== ac) throw new Error('#' + id + ' is not a direct child of .app-content');
      });
    });

    __check('switchView("deck") activates only the deck view and sets currentView', () => {
      __seedElevs();
      switchView('deck');
      if (currentView !== 'deck') throw new Error('currentView is ' + currentView);
      if (!__cls('view-deck')) throw new Error('#view-deck did not become active');
      if (__cls('view-dashboard')) throw new Error('#view-dashboard stayed active');
      if (__cls('view-elevation')) throw new Error('#view-elevation stayed active');
    });

    __check('leaving the deck for the elevation view deactivates it', () => {
      __seedElevs();
      switchView('deck');
      switchView('elevation', 1);
      if (currentView !== 'elevation') throw new Error('currentView is ' + currentView);
      if (__cls('view-deck')) throw new Error('#view-deck stayed active after switching away');
      if (!__cls('view-elevation')) throw new Error('#view-elevation did not become active');
      if (currentElevIndex !== 1) throw new Error('landed on wall ' + currentElevIndex + ', expected 1');
    });

    __check('switching to the deck still flushes the wall dimension inputs into the model', () => {
      __seedElevs();
      switchView('elevation', 0);
      document.getElementById('wallW').value = '250';
      document.getElementById('wallH').value = '120';
      switchView('deck');
      if (elevations[0].wallW !== 250) throw new Error('wallW not flushed: ' + elevations[0].wallW);
      if (elevations[0].wallH !== 120) throw new Error('wallH not flushed: ' + elevations[0].wallH);
    });

    // ── _dsIsOpen: the exact predicate bug the port could have introduced ──
    __check('EXACT BUG: a #view-deck with NO inline display at all reports CLOSED', () => {
      const v = document.getElementById('view-deck');
      v.classList.remove('active');
      // This is the state a .view-container sits in: no inline display, hidden
      // purely by CSS. The old checks were 'display !== "none"' and would have
      // called this open, firing ambient rerenders forever.
      if (v.style.display) throw new Error('test precondition: #view-deck should carry no inline display, got ' + v.style.display);
      if (_dsIsOpen()) throw new Error('the exact bug: _dsIsOpen() is true for a hidden view with display:\\'\\'');
      v.classList.add('active');
      if (!_dsIsOpen()) throw new Error('_dsIsOpen() false while .active');
      v.classList.remove('active');
    });

    __check('_dsIsOpen tracks switchView, not inline styles', () => {
      __seedElevs();
      switchView('dashboard');
      if (_dsIsOpen()) throw new Error('open while on the dashboard');
      switchView('deck');
      if (!_dsIsOpen()) throw new Error('not open after switching to the deck');
      switchView('elevation', 0);
      if (_dsIsOpen()) throw new Error('still open after switching to the elevation view');
    });

    __check('nothing reads the retired overlay any more', () => {
      const S = window.__appSrc;
      if (document.getElementById('deckStudioModal')) throw new Error('#deckStudioModal still in the markup');
      // A comment may mention the old name; no live code may reference it.
      const code = S.split(/\\r?\\n/).map(l => l.replace(/(^|[^:'"\\\\])\\/\\/.*$/, '$1')).join('\\n');
      if (code.indexOf('deckStudioModal') >= 0) throw new Error('live code still references deckStudioModal');
      if (code.indexOf('closeDeckStudio') >= 0) throw new Error('closeDeckStudio still referenced — the Done button is gone, so it should be too');
      if (typeof closeDeckStudio !== 'undefined') throw new Error('closeDeckStudio is still defined');
    });

    // ── Containing-block constraint. The generate modal, type/settings menus,
    //    mockup picker and style palette are all position:fixed; a transform,
    //    filter or z-index on the view would make it their containing block and
    //    .app-content's overflow:hidden would then clip them. ──
    __check('#view-deck creates no stacking or containing-block context', () => {
      const v = document.getElementById('view-deck');
      const st = (v.getAttribute('style') || '');
      ['transform', 'filter', 'backdrop-filter', 'will-change', 'perspective', 'z-index'].forEach(p => {
        if (st.indexOf(p) >= 0) throw new Error('#view-deck sets ' + p + ' — that traps its position:fixed descendants: ' + st);
      });
    });

    __check('the deck view fills its slot rather than keeping the old modal panel sizing', () => {
      const v = document.getElementById('view-deck');
      const st = v.getAttribute('style') || '';
      if (st.indexOf('96vw') >= 0 || st.indexOf('92vh') >= 0) throw new Error('still sized like a floating panel: ' + st);
      if (st.indexOf('flex-direction:column') < 0) throw new Error('needs flex-direction:column inline (.view-container does not set it): ' + st);
    });

    // ── Top nav ──
    __check('the top nav holds exactly three view tabs, and no Spec PDF button', () => {
      __seedElevs();
      renderNavTabs();
      const tabs = document.querySelectorAll('#nav-tabs-fixed .nav-tab');
      if (tabs.length !== 3) throw new Error('expected 3 fixed tabs, got ' + tabs.length);
      const labels = Array.prototype.map.call(tabs, t => t.textContent.trim());
      if (labels.join('|') !== 'Frame Dashboard|Elevation|Deck') throw new Error('unexpected tabs: ' + labels.join('|'));
      // DOM-based, not a source-string search: comments explaining where the
      // button used to live are fine, a real control is not.
      const nav = document.querySelector('.app-top-nav');
      if (nav.textContent.indexOf('Spec PDF') >= 0) throw new Error('the Spec PDF button is still in the top nav — the Deck tab replaces it');
      const stray = Array.prototype.filter.call(nav.querySelectorAll('button'), b => (b.getAttribute('onclick') || '').indexOf('openSpecPdfModal') >= 0);
      if (stray.length) throw new Error(stray.length + ' nav button(s) still call openSpecPdfModal');
    });

    __check('the active nav tab tracks currentView across all three views', () => {
      __seedElevs();
      const activeLabel = () => {
        const a = document.querySelector('#nav-tabs-fixed .nav-tab.active');
        return a ? a.textContent.trim() : null;
      };
      switchView('dashboard'); if (activeLabel() !== 'Frame Dashboard') throw new Error('dashboard: ' + activeLabel());
      switchView('elevation', 0); if (activeLabel() !== 'Elevation') throw new Error('elevation: ' + activeLabel());
      switchView('deck'); if (activeLabel() !== 'Deck') throw new Error('deck: ' + activeLabel());
    });

    __check('the Elevation tab reopens the wall you were last on, not always the first', () => {
      __seedElevs();
      switchView('elevation', 1);
      switchView('deck');
      const elevTab = document.querySelectorAll('#nav-tabs-fixed .nav-tab')[1];
      if (elevTab.getAttribute('onclick').indexOf('currentElevIndex') < 0) {
        throw new Error('Elevation tab hardcodes an index instead of using currentElevIndex: ' + elevTab.getAttribute('onclick'));
      }
    });

    __check('an unknown view name changes nothing (the old catch-all else showed the elevation view)', () => {
      __seedElevs();
      switchView('dashboard');
      switchView('totally-not-a-view');
      if (currentView !== 'dashboard') throw new Error('currentView drifted to ' + currentView);
      if (!__cls('view-dashboard')) throw new Error('dashboard lost .active');
      if (__cls('view-elevation')) throw new Error('the elevation view was shown for an unknown name');
    });

    __check('switchView clamps a stale wall index instead of throwing on undefined', () => {
      __seedElevs();
      switchView('elevation', 99);          // used to walk into elev.name on undefined
      if (currentElevIndex !== 1) throw new Error('expected clamp to 1, got ' + currentElevIndex);
      switchView('elevation', -5);
      if (currentElevIndex !== 0) throw new Error('expected clamp to 0, got ' + currentElevIndex);
    });

    // ── The reported-bug shape: build a PDF from the Deck tab, stay on it ──
    __checkAsync('EXACT BUG: capturing an elevation mid-PDF-build returns you to the Deck view, not the Dashboard', async () => {
      __seedElevs();
      dimVisibility = {}; annotationStyle = {};
      switchView('deck');
      if (!_dsIsOpen()) throw new Error('precondition: not on the deck');
      // Stub the expensive innards; we only care about where the view lands.
      exportElevSVG = async () => null;
      _exportSettle = async () => {};
      lineToolActive = false;
      await _captureElevWithGuides(1);
      if (currentView !== 'deck') throw new Error('the exact reported bug: landed on ' + currentView + ' after a capture, so generating a PDF from the Deck tab throws you out of it');
      if (!_dsIsOpen()) throw new Error('#view-deck lost .active after the capture');
    });

    __checkAsync('the same capture still restores the elevation view when that is where you started', async () => {
      __seedElevs();
      switchView('elevation', 1);
      exportElevSVG = async () => null;
      _exportSettle = async () => {};
      lineToolActive = false;
      await _captureElevWithGuides(0);
      if (currentView !== 'elevation') throw new Error('landed on ' + currentView);
      if (currentElevIndex !== 1) throw new Error('returned to wall ' + currentElevIndex + ', expected 1');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\nwindow.__appHtml = ' + JSON.stringify(htmlSrc) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
