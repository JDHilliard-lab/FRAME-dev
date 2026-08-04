// Reported: "when I hit Install guide it jumps to Good Art. Good People and then
// my spec page disappears. Might be because I have not dropped any frame into an
// elevation. The only way to get the spec page back is Project tab -> Art
// development -> Final Spec."
//
// Both halves of that were real, and they compound.
//
// 1. Install-guide mode emits ONE PAGE PER WALL and no per-piece spec pages at
//    all (see _deckPageList: `if (isInstall) { ... installDescs() ... }`), and
//    installDescs() only counts elevations that actually hold an active frame. So
//    with nothing placed on a wall, clicking Install guide deletes every spec page
//    in the deck and adds nothing back. Nothing on screen says so.
// 2. _dsRefresh only CLAMPS _dsIndex. The index the user was on was a pointer into
//    the old, longer list, so after the spec pages vanished it addressed whatever
//    page now sat at that number — Good Art Good People, on a default deck.
//
// Fixes: _elevHasPlacedFrames() gates the mode switch (same test installDescs()
// applies, so "the button worked" and "the mode produced pages" can't disagree),
// and _dsRestoreSel() puts the selection back on the same PAGE, not the same index.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;

    // Two pieces on one level, and one wall elevation with nothing on it — exactly
    // the state described in the report.
    const __seed = (framesOnWall) => {
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = ['ART.001', 'ART.002'].map((id, i) => {
        const r = _cloneData(dashDefaultData);
        r.id = id; r.location = 'LOBBY'; r.level = '1'; r.imageCode = 'IMG.' + i;
        return r;
      });
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, frames: (framesOnWall || []) }];
      currentElevIndex = 0;
      editorialContent.specTemplate = 'classic';
      editorialContent.specTemplateOverrides = {};
      editorialContent.specTplMemory = {};
      editorialContent.hiddenFixed = {};
      _dsPages = _deckPageList();
      _dsIndex = _dsPages.findIndex(d => d && d.kind === 'spec');
      if (_dsIndex < 0) throw new Error('seed produced no spec page at all');
      _dsRenderTools();
    };
    const __specPages = () => _dsPages.filter(d => d && d.kind === 'spec').length;
    const __installBtn = () => Array.from(document.querySelectorAll('#dsToolsPageBody button'))
      .find(b => (b.textContent || '').trim() === 'Install guide');
    const __modalShown = () => (document.getElementById('infoModal') || {}).style &&
      document.getElementById('infoModal').style.display === 'flex';
    const __hideModal = () => { const m = document.getElementById('infoModal'); if (m) m.style.display = 'none'; };

    __check('the helper agrees with installDescs about what counts as a usable wall', () => {
      elevations = [];
      if (_elevHasPlacedFrames()) throw new Error('no elevations at all reported as usable');
      elevations = [{ name: 'Wall A', frames: [] }];
      if (_elevHasPlacedFrames()) throw new Error('an empty wall reported as usable');
      elevations = [{ name: 'Wall A', frames: [{ id: 'ART.001', active: false }] }];
      if (_elevHasPlacedFrames()) throw new Error('a wall holding only INACTIVE frames reported as usable');
      elevations = [{ name: 'Wall A', frames: [{ id: 'ART.001', x: 20, y: 45, w: 24, h: 24 }] }];
      if (!_elevHasPlacedFrames()) throw new Error('a placed frame with no explicit active flag should count');
    });

    // The cause, pinned directly: this is why the pages went away.
    __check('CAUSE: install-guide mode emits no spec page at all when no wall is used', () => {
      __seed([]);
      const before = __specPages();
      if (before < 2) throw new Error('expected the per-piece spec pages up front, got ' + before);
      editorialContent.specTemplate = 'installGuide';
      const after = _deckPageList().filter(d => d && d.kind === 'spec').length;
      if (after !== 0) throw new Error('expected install mode to produce no pages from an empty wall, got ' + after);
      editorialContent.specTemplate = 'classic';
    });

    __check('EXACT BUG: hitting Install guide with an empty wall no longer empties the deck', () => {
      __hideModal(); __seed([]);
      const wasOn = _dsPages[_dsIndex];
      const b = __installBtn();
      if (!b) throw new Error('no Install guide button in the layout panel');
      b.onclick();
      if (editorialContent.specTemplate === 'installGuide') throw new Error('THE BUG: the deck switched into a mode that has nothing to draw');
      if (!__specPages()) throw new Error('THE BUG: every spec page disappeared');
      const now = _dsPages[_dsIndex];
      if (!now || now.kind !== 'spec') throw new Error('THE BUG: the selection left the spec page for ' + (now && now.kind));
      if (_deckPageKey(now) !== _deckPageKey(wasOn)) throw new Error('the selection moved off the page the user was on');
    });

    __check('and it explains itself instead of failing silently', () => {
      __hideModal(); __seed([]);
      __installBtn().onclick();
      if (!__modalShown()) throw new Error('no explanation shown');
      const title = document.getElementById('infoModalTitle').innerText || '';
      const body = document.getElementById('infoModalBody').innerText || '';
      if (!/elevation/i.test(title + body)) throw new Error('the message never mentions elevations: ' + title);
      // It has to point at the fix, not just refuse: the Elevations tab, and the
      // breaker checkbox for people who only wanted the wall drawing in front of
      // their spec pages.
      if (!/Elevations tab/.test(body)) throw new Error('the message does not say where to place the artwork');
      if (!/breaker/i.test(body)) throw new Error('the message does not mention the elevation breaker alternative');
      __hideModal();
    });

    __check('with artwork actually on a wall the mode still switches', () => {
      __hideModal();
      __seed([{ id: 'ART.001', letter: 'A', x: 20, y: 45, w: 24, h: 24, active: true }]);
      __installBtn().onclick();
      if (editorialContent.specTemplate !== 'installGuide') throw new Error('a usable wall was refused: ' + editorialContent.specTemplate);
      if (__modalShown()) throw new Error('the warning fired on a deck that does have a wall');
      if (!_dsPages.some(d => d && d._install)) throw new Error('install mode produced no elevation page');
    });

    __check('and the selection lands on the new spec page, not wherever that index points', () => {
      __hideModal();
      __seed([{ id: 'ART.001', letter: 'A', x: 20, y: 45, w: 24, h: 24, active: true }]);
      // The LAST per-piece spec page, deliberately: two pieces collapse to one
      // wall page, so its index lands past the install page and straight onto the
      // slogan/thank-you tail — which is the reported jump. Picking the first spec
      // page hides the bug, because that index happens to survive the swap.
      const specIdxs = _dsPages.map((d, i) => (d && d.kind === 'spec') ? i : -1).filter(i => i >= 0);
      if (specIdxs.length < 2) throw new Error('seed did not produce two spec pages');
      _dsIndex = specIdxs[specIdxs.length - 1];
      _dsRenderTools();
      __installBtn().onclick();
      const now = _dsPages[_dsIndex];
      if (!now) throw new Error('nothing selected after the switch');
      // The per-piece page it was on is gone (install mode replaced it), so the
      // fallback rule applies: the first page of the same KIND.
      if (now.kind !== 'spec') throw new Error('THE BUG: the selection jumped to ' + now.kind + ' (' + (now.fixed || now.type) + ')');
      if (!now._install) throw new Error('expected the wall page, got ' + _deckPageKey(now));
    });

    __check('_dsRestoreSel prefers the same page, then the same kind, then leaves the clamp alone', () => {
      __seed([]);
      const spec = _dsPages.findIndex(d => d && d.kind === 'spec');
      const other = _dsPages.findIndex(d => d && d.kind === 'fixed');
      if (other < 0) throw new Error('seed has no fixed page to move to');
      _dsIndex = other;
      _dsRestoreSel(_deckPageKey(_dsPages[spec]), 'spec');
      if (_dsIndex !== spec) throw new Error('an exact key match was not honoured');
      _dsIndex = other;
      _dsRestoreSel('spec:__no_such_page__', 'spec');
      if (_dsPages[_dsIndex].kind !== 'spec') throw new Error('the kind fallback did not fire');
      _dsIndex = other;
      _dsRestoreSel('spec:__no_such_page__', 'planDetail');
      if (_dsIndex !== other) throw new Error('an unmatched restore moved the selection anyway');
    });

    __check('the guard sits in switchMode, so every route into install mode passes it', () => {
      const i = S.indexOf('const switchMode = (tpl) =>');
      if (i < 0) throw new Error('switchMode is gone');
      const body = S.slice(i, S.indexOf('const mkMode =', i));
      if (body.indexOf('_elevHasPlacedFrames()') < 0) throw new Error('switchMode does not check for a usable wall');
      if (body.indexOf('_dsRestoreSel') < 0) throw new Error('switchMode does not restore the selection');
      // The check must be keyed on the MODE, not on the literal 'installGuide'
      // string a button happens to pass — _tplModeOf is what decides the mode.
      if (!/_tplModeOf\\(tpl\\) === 'install'/.test(body)) throw new Error('the guard tests a template key instead of the mode');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
