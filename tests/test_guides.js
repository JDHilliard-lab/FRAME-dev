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
    _dsPages = [{ kind: 'layout', page: { id: 'p1', title: 'Test' } }];
    _dsIndex = 0;

    __check('builtin guide sets refresh from seed (stale saved sets pick up title hlines)', () => {
      // Simulate a project saved before the seed update: builtin 12-col with no hlines,
      // plus one user set that must be preserved untouched.
      editorialContent.guideSets = [
        { id: 'g_idml12', name: 'Farmboy \\u00b7 12-Column', builtin: true, margin: { t: 0.05, b: 0.10, l: 0.0234, r: 0.0234 }, cols: 12, gutter: 0.009375, rows: 0, rowGutter: 0, vlines: [], hlines: [] },
        { id: 'g_mine', name: 'My set', builtin: false, margin: null, cols: 0, gutter: 0, rows: 0, rowGutter: 0, vlines: [0.25], hlines: [0.4] }
      ];
      const sets = _guideSets();
      const twelve = sets.find(s => s.id === 'g_idml12');
      if (!twelve || !twelve.hlines || twelve.hlines.length !== 2) throw new Error('builtin not refreshed: ' + JSON.stringify(twelve && twelve.hlines));
      const mine = sets.find(s => s.id === 'g_mine');
      if (!mine || mine.hlines[0] !== 0.4 || mine.vlines[0] !== 0.25) throw new Error('user set was altered');
      if (!sets.find(s => s.id === 'g_thirds')) throw new Error('missing builtin not appended');
    });

    __check('_pageGuide back-compat: legacy snap boolean maps to snapMode', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snap: false };
      editorialContent.pageGuides = {};
      let G = _pageGuide();
      if (G.snapMode !== 'off') throw new Error('snap:false should map to off, got ' + G.snapMode);
      editorialContent.guidePref.snap = true;
      G = _pageGuide();
      if (G.snapMode !== 'guides') throw new Error('snap:true should map to guides, got ' + G.snapMode);
      editorialContent.guidePref.snapMode = 'grid'; editorialContent.guidePref.gridSize = 30;
      G = _pageGuide();
      if (G.snapMode !== 'grid' || G.gridSize !== 30) throw new Error('explicit deck snapMode/gridSize not honored: ' + G.snapMode + '/' + G.gridSize);
      if (G.snap !== false) throw new Error('legacy .snap should be false in grid mode');
    });

    __check('_pageGuide gridSize validates and defaults', () => {
      editorialContent.guidePref.gridSize = 'garbage';
      let G = _pageGuide();
      if (G.gridSize !== 20) throw new Error('bad gridSize did not fall back: ' + G.gridSize);
      editorialContent.guidePref.gridSize = 2;   // below minimum
      G = _pageGuide();
      if (G.gridSize !== 20) throw new Error('tiny gridSize not rejected: ' + G.gridSize);
      delete editorialContent.guidePref.gridSize;
    });

    __check('_mbSnapBox grid mode snaps to pt-true cells; off mode never snaps', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'grid', gridSize: 20 };
      const r = { width: 936, height: 540 };
      // 20pt grid → gx = 20/936. Put the box's left edge 3px shy of the 5th line.
      const gx = 20 / 936;
      const box = { x: gx * 5 - 3 / 936, y: 0.5, w: 0.2, h: 0.1 };
      let sn = _mbSnapBox(box, r);
      if (Math.abs((box.x + sn.dx) - gx * 5) > 1e-9) throw new Error('did not snap to grid line: dx=' + sn.dx);
      editorialContent.guidePref.snapMode = 'off';
      sn = _mbSnapBox(box, r);
      if (sn.dx !== 0 || sn.dy !== 0) throw new Error('off mode snapped anyway');
    });

    __check('_mbSnapBox guides mode still snaps to the safety frame', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      const r = { width: 936, height: 540 };
      const box = { x: 0.0234 + 4 / 936, y: 0.3, w: 0.2, h: 0.1 };   // 4px right of the left margin
      const sn = _mbSnapBox(box, r);
      if (Math.abs((box.x + sn.dx) - 0.0234) > 1e-9) throw new Error('did not snap to margin: dx=' + sn.dx);
    });

    __check('_paintGuideSet: purple safety frame, purple columns, cyan hlines, grid layer', () => {
      const c = document.createElement('div');
      document.body.appendChild(c);
      const set = _guideSetById('g_idml12');
      _paintGuideSet(c, { show: true, set: set, grid: true, gridSize: 20 });
      const nodes = Array.from(c.querySelectorAll('._mbGuideLine'));
      const frame = nodes.find(n => n.style.border && n.style.border.indexOf('171, 54, 255') >= 0);
      if (!frame) throw new Error('purple safety frame missing');
      // 12 columns → 11 gutters × 2 edges = 22 inner purple column lines.
      const colLines = nodes.filter(n => n.style.width === '1px' && n.style.background.indexOf('171, 54, 255') >= 0);
      if (colLines.length !== 22) throw new Error('expected 22 inner column lines, got ' + colLines.length);
      const cyan = nodes.filter(n => n.style.height === '1px' && n.style.background.indexOf('0, 190, 235') >= 0);
      if (cyan.length !== 2) throw new Error('expected 2 cyan title guides, got ' + cyan.length);
      const grid = nodes.find(n => n.style.backgroundImage && n.style.backgroundImage.indexOf('linear-gradient') >= 0);
      if (!grid) throw new Error('grid layer missing');
      // Grid must be pt-true squares: width% uses /936, height% uses /540.
      if (grid.style.backgroundSize.indexOf((20/936*100) + '%') < 0) throw new Error('grid X size wrong: ' + grid.style.backgroundSize);
    });

    __check('columns are clipped to the safety frame band, not full bleed', () => {
      const c = document.createElement('div');
      document.body.appendChild(c);
      const set = _guideSetById('g_idml12');
      _paintGuideSet(c, { show: true, set: set, grid: false, gridSize: 20 });
      const colLines = Array.from(c.querySelectorAll('._mbGuideLine')).filter(n => n.style.width === '1px' && n.style.background.indexOf('171, 54, 255') >= 0);
      const bad = colLines.filter(n => n.style.top === '0px' || n.style.top === '0%' || n.style.top === '');
      if (bad.length) throw new Error(bad.length + ' column lines run full bleed (top not clipped to margin)');
    });

    __check('_dsAddGuides paints the set on preview pages and skips the editable canvas', () => {
      _dsShowGuides = true;
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      const page = document.createElement('div');
      document.body.appendChild(page);
      _dsAddGuides(page, 936, 540);
      if (!page.querySelector('._mbGuideLine')) throw new Error('preview overlay did not paint the guide set');
      const page2 = document.createElement('div');
      const lc = document.createElement('div'); lc.id = 'dsLayoutCanvas'; page2.appendChild(lc);
      document.body.appendChild(page2);
      _dsAddGuides(page2, 936, 540);
      if (page2.querySelector('._mbGuideLine')) throw new Error('double-painted over the editable canvas');
      lc.remove();
      _dsShowGuides = false;
    });

    __check('_guideLines still feeds snapping identically (regression)', () => {
      const set = _guideSetById('g_idml12');
      const ln = _guideLines(set);
      // margins l/r + 12 cols × 2 edges (deduped where col edges meet margins) 
      if (ln.vs.indexOf(0.0234) < 0 || ln.vs.indexOf(1 - 0.0234) < 0) throw new Error('margin lines missing from snap set');
      if (ln.hs.indexOf(0.145) < 0 || ln.hs.indexOf(0.205) < 0) throw new Error('title hlines missing from snap set');
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
