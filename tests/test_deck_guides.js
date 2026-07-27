const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };

    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};
    _dsRenderCenter = () => {};
    renderMoodboardCanvas = () => {};

    __check('_setDeckGuide writes the deck pref; per-page-era data is migrated away', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = {
        'spec:ART.001': { show: false, snapMode: 'off' },
        'layout:p1': { show: false, gridSize: 40 }
      };
      _setDeckGuide({ show: true });
      if (editorialContent.guidePref.show !== true) throw new Error('deck pref not written');
      if (editorialContent.pageGuides !== undefined) throw new Error('per-page-era data survived migration');
    });

    __check('turning guides on lights EVERY page (spec, floorplan, layout)', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = { 'spec:ART.002': { show: false } };   // stale off from the per-page era (migration discards it)
      _setDeckGuide({ show: true });
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      const kinds = [
        { kind: 'spec', type: 'spec', row: { id: 'ART.002' }, _ovKey: 'ART.002' },
        { kind: 'floorplan', level: 0 },
        { kind: 'layout', page: { id: 'p1', title: 'T' } }
      ];
      kinds.forEach((desc, i) => {
        _dsPages = [desc]; _dsIndex = 0;
        const G = _pageGuide();
        if (!G.show) throw new Error('page kind ' + desc.kind + ' still off after deck-wide on');
      });
    });

    __check('per-page-era container is removed entirely by migration', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true };
      editorialContent.pageGuides = { 'spec:ART.003': { show: false } };
      _setDeckGuide({ show: true });
      if (editorialContent.pageGuides !== undefined) throw new Error('pageGuides container left behind');
    });

    __check('guides menu has no Apply-to-whole-deck button and says it applies to every page', () => {
      _dsPages = [{ kind: 'layout', page: { id: 'p1', title: 'T' } }]; _dsIndex = 0;
      const btn = document.createElement('button'); btn.id = 'dsMbGuides'; document.body.appendChild(btn);
      _mbOpenGuidesMenu();
      const menu = document.getElementById('_mbGuidesMenu');
      if (!menu) throw new Error('menu did not open');
      const btns = Array.from(menu.querySelectorAll('button')).map(b => b.textContent);
      if (btns.indexOf('Apply to whole deck') >= 0) throw new Error('redundant deck button still present');
      if ((menu.textContent || '').indexOf('Applies to every page in the deck.') < 0) throw new Error('deck-wide note missing');
      _mbCloseGuidesMenu();
    });

    __check('menu Show guides toggle drives the deck pref', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
      editorialContent.pageGuides = {};
      _dsPages = [{ kind: 'layout', page: { id: 'p1', title: 'T' } }]; _dsIndex = 0;
      _mbOpenGuidesMenu();
      const menu = document.getElementById('_mbGuidesMenu');
      const rowLbl = Array.from(menu.querySelectorAll('label')).find(l => (l.textContent || '').indexOf('Show guides') >= 0);
      if (!rowLbl) throw new Error('show guides row not found');
      const cb = rowLbl.querySelector('input[type=checkbox]');
      cb.checked = true; cb.dispatchEvent(new window.Event('change'));
      if (editorialContent.guidePref.show !== true) throw new Error('toggle did not write deck pref');
      _mbCloseGuidesMenu();
    });

    __check('guides button stays visible on a spec page after toolbar sync; old layers toggle button is now permanently retired', () => {
      const gb = document.getElementById('dsMbGuides') || (() => { const b = document.createElement('button'); b.id = 'dsMbGuides'; document.body.appendChild(b); return b; })();
      const lb = document.getElementById('dsMbLayers') || (() => { const b = document.createElement('button'); b.id = 'dsMbLayers'; document.body.appendChild(b); return b; })();
      gb.style.display = 'none'; lb.style.display = 'inline-flex';   // simulate a stale prior state
      _dsPages = [{ kind: 'spec', type: 'spec', row: { id: 'ART.004' }, _ovKey: 'ART.004' }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSel = []; _mbSelAnn = []; _mbSelected = -1;
      _dsSyncToolbar();
      if (gb.style.display !== 'inline-flex') throw new Error('guides button hidden on spec page: ' + gb.style.display);
      if (lb.style.display !== 'none') throw new Error('old layers toggle button should stay permanently hidden now that Layers is a dedicated tab: ' + lb.style.display);
    });

    __check('layers TAB shows correctly on a spec page, lists annotations, skips Elements group', () => {
      _dsPages = [{ kind: 'spec', type: 'spec', row: { id: 'ART.005' }, _ovKey: 'ART.005' }]; _dsIndex = 0;
      const key = _deckPageKey(_dsPages[0]);
      editorialContent.annotations = editorialContent.annotations || {};
      editorialContent.annotations[key] = [{ type: 'text', x: 0.3, y: 0.3, w: 0.2, text: 'Note A' }];
      _mbActiveCanvasId = 'moodboardCanvas';   // NOT the layout canvas — the spec-page case
      _dsToolsTab('layers');
      const p = document.getElementById('dsToolsLayersBody');
      if ((p.textContent || '').indexOf('Layers') < 0) throw new Error('unified layers group missing');
      if ((p.textContent || '').indexOf('Note A') < 0) throw new Error('annotation row missing from unified list');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
