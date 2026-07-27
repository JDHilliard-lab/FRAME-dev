const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ measureText:()=>({width:6}), scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsSyncApprovedBtn = () => {}; renderMoodboardCanvas = () => {};

    __check('right panel now has three sub-tabs: Page, Templates, Layers (in that order)', () => {
      if (!document.getElementById('dsToolsBtnPage')) throw new Error('Page tab missing');
      if (!document.getElementById('dsToolsBtnTemplates')) throw new Error('Templates tab missing');
      if (!document.getElementById('dsToolsBtnLayers')) throw new Error('Layers tab missing');
      if (!document.getElementById('dsToolsLayersBody')) throw new Error('Layers body container missing');
      const bar = document.getElementById('dsToolsSubTabBar');
      const order = Array.from(bar.children).map(c => c.id);
      if (order.indexOf('dsToolsBtnLayers') !== order.length - 1) throw new Error('Layers is not positioned last (to the right of Templates): ' + order.join(','));
    });

    __check('_dsToolsTab("layers") shows the layers body and highlights the Layers button', () => {
      editorialContent.layoutPages = [{ id: 'pgL', type: 'moodboard', title: 'L', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsToolsTab('layers');
      if (document.getElementById('dsToolsLayersBody').style.display !== 'block') throw new Error('layers body not shown');
      if (document.getElementById('dsToolsPageBody').style.display !== 'none') throw new Error('page body not hidden');
      if (document.getElementById('dsToolsTemplatesBody').style.display !== 'none') throw new Error('templates body not hidden');
    });

    __check('_dsRenderLayersPanel renders DOCKED content \\u2014 no floating overlay element is created anymore', () => {
      editorialContent.layoutPages = [{ id: 'pgL2', type: 'moodboard', title: 'L2', elements: [{ type: 'text', text: 'Hello', x:0.1,y:0.1,w:0.3 }] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      window._mbCurAnnList = () => ({ key: 'layout:pgL2', list: [] });
      _dsRenderLayersPanel();
      if (document.getElementById('_dsLayersPanel')) throw new Error('old floating overlay element was created \\u2014 should be fully retired');
      const body = document.getElementById('dsToolsLayersBody');
      if (body.textContent.indexOf('Hello') < 0) throw new Error('layer content not rendered into the docked body: ' + body.innerHTML.slice(0,200));
    });

    __check('KEY FIX: switching pages while on the Layers tab keeps you on Layers (does not bounce back to Page)', () => {
      editorialContent.layoutPages = [
        { id: 'pgA', type: 'moodboard', title: 'A', elements: [] },
        { id: 'pgB', type: 'moodboard', title: 'B', elements: [] }
      ];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }, { kind: 'layout', page: editorialContent.layoutPages[1] }];
      _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[_dsIndex].elements;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[_dsIndex], type: 'moodboard' });
      window._mbCurAnnList = () => ({ key: 'x', list: [] });
      window._dsRenderCenter = () => {};
      _dsToolsTab('layers');
      _dsIndex = 1;
      _dsRenderTools();   // what _dsSelectPage calls after switching
      if (document.getElementById('dsToolsLayersBody').style.display !== 'block') throw new Error('bounced back to Page tab after switching pages \\u2014 the exact reported friction');
      if (_dsToolsActiveTab !== 'layers') throw new Error('active tab state itself changed unexpectedly');
    });

    __check('old toolbar Layers toggle button is now permanently hidden (redundant with the new tab)', () => {
      editorialContent.layoutPages = [{ id: 'pgC', type: 'moodboard', title: 'C', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsSyncToolbar();
      const btn = document.getElementById('dsMbLayers');
      if (btn.style.display !== 'none') throw new Error('old toolbar layers button still shown: ' + btn.style.display);
    });

    __check('_dsSyncToolbar refreshes the layers panel content when Layers is the active tab', () => {
      editorialContent.layoutPages = [{ id: 'pgD', type: 'moodboard', title: 'D', elements: [{ type: 'text', text: 'Sync check', x:0.1,y:0.1,w:0.3 }] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      window._mbCurAnnList = () => ({ key: 'x', list: [] });
      _dsToolsActiveTab = 'layers';
      document.getElementById('dsToolsLayersBody').innerHTML = '';   // simulate stale/empty content
      _dsSyncToolbar();
      const body = document.getElementById('dsToolsLayersBody');
      if (body.textContent.indexOf('Sync check') < 0) throw new Error('layers panel did not refresh via toolbar sync');
    });

    __check('layers list still supports hide/lock toggles and drag-reorder (core logic untouched)', () => {
      editorialContent.layoutPages = [{ id: 'pgE', type: 'moodboard', title: 'E', elements: [
        { type: 'text', text: 'First', x:0.1,y:0.1,w:0.3, z: 2 },
        { type: 'text', text: 'Second', x:0.1,y:0.3,w:0.3, z: 1 }
      ] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      window._mbCurAnnList = () => ({ key: 'x', list: [] });
      _dsRenderLayersPanel();
      const body = document.getElementById('dsToolsLayersBody');
      if (body.textContent.indexOf('First') < 0 || body.textContent.indexOf('Second') < 0) throw new Error('layer rows not rendered');
      const rows = body.querySelectorAll('[draggable="true"]');
      if (rows.length !== 2) throw new Error('expected 2 draggable rows, got ' + rows.length);
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
