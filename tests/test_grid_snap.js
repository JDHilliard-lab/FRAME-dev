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

    __check('MIGRATION: per-page-era grid on layout pages promotes to deck-wide grid', () => {
      // Jordan's exact situation: grid true only on the three layout page
      // keys from the old per-page menu, deck pref grid false/absent.
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      editorialContent.pageGuides = {
        'fixed:understanding': { grid: true, gridSize: 20 },
        'layout:p_narr': { grid: true },
        'fixed:cover': { grid: true }
      };
      const g = _guidePref();   // triggers migration
      if (g.grid !== true) throw new Error('grid not promoted to deck');
      if (g.gridSize !== 20) throw new Error('gridSize not carried: ' + g.gridSize);
      if (editorialContent.pageGuides !== undefined) throw new Error('per-page overrides not retired');
      // And every page kind resolves grid on now:
      floorplanLevels = [{ name: 'L1', imageData: '' }];
      [{ kind: 'spec', type: 'spec', row: { id: 'A' }, _ovKey: 'A' }, { kind: 'floorplan', level: 0 }].forEach(desc => {
        _dsPages = [desc]; _dsIndex = 0;
        if (!_pageGuide().grid) throw new Error('grid off on ' + desc.kind + ' after migration');
      });
    });

    __check('MIGRATION: show and snapMode promote too, deck values win when set', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
      editorialContent.pageGuides = { 'layout:p1': { show: true, snapMode: 'grid' } };
      const g = _guidePref();
      if (g.show !== true) throw new Error('show not promoted');
      if (g.snapMode !== 'grid') throw new Error('snapMode not promoted: ' + g.snapMode);
      // Deck value already set -> per-page never downgrades it
      editorialContent.guidePref = { setId: 'g_idml12', show: true, grid: true, gridSize: 30, snapMode: 'off' };
      editorialContent.pageGuides = { 'layout:p1': { show: false, grid: false, gridSize: 99, snapMode: 'guides' } };
      const g2 = _guidePref();
      if (g2.show !== true || g2.grid !== true || g2.gridSize !== 30 || g2.snapMode !== 'off') throw new Error('deck values were downgraded: ' + JSON.stringify(g2));
    });

    __check('_pageGuide is deck-only now (same result on every page)', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, grid: true, gridSize: 24, snapMode: 'grid' };
      delete editorialContent.pageGuides;
      floorplanLevels = [{ name: 'L1', imageData: '' }];
      const kinds = [{ kind: 'spec', type: 'spec', row: { id: 'B' }, _ovKey: 'B' }, { kind: 'floorplan', level: 0 }, { kind: 'layout', page: { id: 'p2', title: 'T' } }];
      const got = kinds.map(desc => { _dsPages = [desc]; _dsIndex = 0; const G = _pageGuide(); return [G.show, G.grid, G.gridSize, G.snapMode].join('|'); });
      if (new Set(got).size !== 1) throw new Error('pages disagree: ' + JSON.stringify(got));
    });

    __check('_layoutSafeFrame resolves deck set (template alignment regression)', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
      const SF = _layoutSafeFrame();
      if (!SF || Math.abs(SF.l - 0.0234) > 1e-9 || Math.abs(SF.b - 0.10) > 1e-9) throw new Error('wrong frame: ' + JSON.stringify(SF));
      editorialContent.guidePref = { setId: 'g_center', show: false };
      if (_layoutSafeFrame() !== null) throw new Error('marginless set should yield null');
      editorialContent.guidePref = { setId: 'g_idml12', show: false };
    });

    __check('_dsAnnSnap: guides mode pulls a text box edge onto the safety left line', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      const w = 936, hh = 540;
      // box left edge 4px right of the left margin (0.0234) — should snap onto it
      const out = _dsAnnSnap(0.0234 + 4 / w, 0.4, 0.2, 0.1, w, hh, { altKey: false });
      if (Math.abs(out.x - 0.0234) > 1e-9) throw new Error('did not snap: ' + out.x);
    });

    __check('_dsAnnSnap: grid mode snaps to pt-true cells; alt bypasses; off mode never snaps', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'grid', grid: true, gridSize: 20 };
      const w = 936, hh = 540, gx = 20 / 936;
      let out = _dsAnnSnap(gx * 7 - 3 / w, 0.4, 0.1, 0.1, w, hh, { altKey: false });
      if (Math.abs(out.x - gx * 7) > 1e-9) throw new Error('grid snap missed: ' + out.x);
      out = _dsAnnSnap(gx * 7 - 3 / w, 0.4, 0.1, 0.1, w, hh, { altKey: true });
      if (Math.abs(out.x - (gx * 7 - 3 / w)) > 1e-12) throw new Error('alt did not bypass');
      editorialContent.guidePref.snapMode = 'off';
      out = _dsAnnSnap(gx * 7 - 3 / w, 0.4, 0.1, 0.1, w, hh, { altKey: false });
      if (Math.abs(out.x - (gx * 7 - 3 / w)) > 1e-12) throw new Error('off mode snapped');
    });

    __check('annotation drag closures actually route through _dsAnnSnap (source guard)', () => {
      const src2 = window.__appSrc;
      const count = src2.split('_dsAnnSnap(').length - 1;
      // helper definition + 5 drag sites = at least 6 mentions
      if (count < 6) throw new Error('expected >=6 _dsAnnSnap references, found ' + count);
      // and each box drag captures its size fractions for edge snapping
      if (src2.split('_bwF').length - 1 < 8) throw new Error('box size capture missing at some drag sites');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
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
