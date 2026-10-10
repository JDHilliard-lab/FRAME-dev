// A row's level is a 0-based plan index (18.13). The dashboard's Level box was free
// text defaulting to the STRING "1" (meaning "the first level" to a person) while the
// pin code wrote the index (0 = first plan). Every new, unpinned piece was therefore
// filed under the SECOND plan, so in a multi-plan deck its spec page printed in the
// wrong plan's block. Measured before the fix: [PLAN Level 1] ART.1 [PLAN Guest A]
// ART.2 ART.3, with ART.2 unpinned.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, strokeRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.Element.prototype.scrollIntoView = function () {};
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const mk = (id, lv) => Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: id }, lv === undefined ? {} : { level: lv });
    const plans = () => { floorplanLevels = [{ name: 'Level 1', imageData: 'data:a', imageName: 'a' }, { name: 'Guest A', imageData: 'data:b', imageName: 'b' }]; };
    const order = () => _deckPageList().map(d => d.kind === 'floorplan' ? ('[' + d.title + ']') : (d.kind === 'spec' ? d.row.id : null)).filter(Boolean).join(' ');

    __check('EXACT BUG: a new unpinned piece is filed under the FIRST plan, not the second', () => {
      plans();
      dashProjectData = [mk('ART.1'), mk('ART.2'), mk('ART.3')];
      _fpSetPin(dashProjectData[0], 0, 0.5, 0.5);
      _fpSetPin(dashProjectData[2], 1, 0.5, 0.5);
      const o = order();
      if (o !== '[Level 1] ART.1 ART.2 [Guest A] ART.3') throw new Error(o);
    });

    __check('a new row starts on the first plan, as a number', () => {
      if (dashDefaultData.level !== 0) throw new Error('default level is ' + JSON.stringify(dashDefaultData.level));
    });

    __check('old files: an unpinned TYPED level is read as 1-based; a pinned row and numbers are left alone', () => {
      plans();
      dashProjectData = [mk('ART.1', '1'), mk('ART.2', '2'), mk('ART.3', 'x'), mk('ART.4', 1)];
      const pinned = mk('ART.5', '1'); pinned.planX = 0.4; pinned.planY = 0.4;   // a legacy pin derives its level FROM r.level
      dashProjectData.push(pinned);
      _fpMigrate();
      const got = dashProjectData.map(r => r.id + '=' + JSON.stringify(r.level)).join(' ');
      if (got !== 'ART.1=0 ART.2=1 ART.3=0 ART.4=1 ART.5="1"') throw new Error(got);
      _fpMigrate();
      if (dashProjectData.map(r => JSON.stringify(r.level)).join() !== '0,1,0,1,"1"') throw new Error('a second pass changed something');
    });

    __check('the dashboard Level is a list of the plans by name, disabled while the piece is pinned', () => {
      plans();
      const sel = document.getElementById('m_level');
      if (!sel || sel.tagName !== 'SELECT') throw new Error('the Level field is still a free text box');
      const free = mk('ART.9'); _fillLevelSelect(free);
      const names = Array.from(sel.options).map(o => o.textContent).join();
      if (names !== 'Level 1,Guest A') throw new Error('options: ' + names);
      if (sel.value !== '0' || sel.disabled) throw new Error('an unpinned new piece should show Level 1, editable');
      const pin = mk('ART.8'); _fpSetPin(pin, 1, 0.5, 0.5); _fillLevelSelect(pin);
      if (sel.value !== '1' || !sel.disabled) throw new Error('a piece pinned on Guest A should show it, locked');
    });

    __check('choosing a plan stores a number', () => {
      plans();
      dashProjectData = [mk('ART.1')]; dashSelectedRowIndex = 0;
      loadDashDataIntoControls(dashProjectData[0]);
      const sel = document.getElementById('m_level'); sel.value = '1';
      syncDashAndCalculate();
      if (dashProjectData[0].level !== 1) throw new Error('stored ' + JSON.stringify(dashProjectData[0].level));
      dashHtIn(0, 'level', '0');
      if (dashProjectData[0].level !== 0) throw new Error('a table edit stored ' + JSON.stringify(dashProjectData[0].level));
    });

    __check('the first set adopts the untouched default wall instead of leaving it empty in the rail', () => {
      elevations = [{ id: 'w0', name: 'Elevation 1', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];
      dashProjectData = []; editorialContent = _editorialDefaults();
      _fpAddCodes('framed', 1); _fpAddCodes('framed', 1);
      const ks = Array.from(new Set(dashProjectData.map(r => _artGroupKey(r.id))));
      _fpApplyFrameSet(ks[0], 1, ''); _fpApplyFrameSet(ks[1], 3, '');
      const names = elevations.map(e => e.name + ':' + e.frames.length).join(',');
      if (elevations.some(e => !e.frames.length)) throw new Error('an empty wall is left: ' + names);
      if (elevations.length !== 2) throw new Error(names);
      if (!elevations.some(e => e.id === 'w0')) throw new Error('the default wall lost its id');
    });

    __check('a wall someone has used is never taken over', () => {
      ['Lobby north', null].forEach(nm => {
        const w = { id: 'w9', name: nm || 'Elevation 2', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] };
        if (nm) { if (_elevPristine(w)) throw new Error('a renamed wall counts as untouched'); }
        w.contextBlocks = [{ id: 'c', x: 0, y: 0, w: 10, h: 10 }];
        if (_elevPristine(w)) throw new Error('a wall with traced context counts as untouched');
      });
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
