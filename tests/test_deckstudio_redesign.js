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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsSyncToolbar = () => {}; _dsSyncApprovedBtn = () => {}; renderMoodboardCanvas = () => {};

    __check('right panel structure: Page/Templates sub-tabs and their body containers exist', () => {
      if (!document.getElementById('dsToolsBtnPage')) throw new Error('Page tab button missing');
      if (!document.getElementById('dsToolsBtnTemplates')) throw new Error('Templates tab button missing');
      if (!document.getElementById('dsToolsPageBody')) throw new Error('Page body missing');
      if (!document.getElementById('dsToolsTemplatesBody')) throw new Error('Templates body missing');
    });

    __check('top-level Templates nav button is visible again, now as its own dedicated template-editor destination', () => {
      const btn = document.getElementById('dsTabBtnTemplates');
      if (btn.style.display === 'none') throw new Error('Templates button should be visible \u2014 it is now a dedicated editing destination');
      if (btn.getAttribute('onclick').indexOf('_dsOpenTemplateEditor()') < 0) throw new Error('Templates button does not open the dedicated template-editor mode');
    });

    __check('THE + BUTTON: quick-add creates a blank, footer-only page with no menu', () => {
      editorialContent.layoutPages = [];
      _dsPages = []; _dsIndex = 0;
      window._dsCurrentEditablePage = () => null;
      _dsQuickAddBlankPage('__start__');
      const pg = editorialContent.layoutPages[0];
      if (!pg) throw new Error('no page created');
      if (pg.elements.length !== 0) throw new Error('page not blank: ' + JSON.stringify(pg.elements));
    });

    __check('_dsToolsTab switches visibility and highlight correctly', () => {
      _dsToolsTab('templates');
      if (document.getElementById('dsToolsTemplatesBody').style.display !== 'flex') throw new Error('templates body not shown');
      if (document.getElementById('dsToolsPageBody').style.display !== 'none') throw new Error('page body not hidden');
      _dsToolsTab('page');
      if (document.getElementById('dsToolsPageBody').style.display !== 'block') throw new Error('page body not restored');
      if (document.getElementById('dsToolsTemplatesBody').style.display !== 'none') throw new Error('templates body not hidden after switch');
    });

    __check('the compact Templates browser lists a Blank category first, then real categories with items', () => {
      _dsToolsTab('templates');
      const host = document.getElementById('dsToolsTemplatesBody');
      const secs = Array.from(host.querySelectorAll('.tpl-sec'));
      if (secs[0].dataset.seckey !== '__blank__') throw new Error('Blank category is not first: ' + secs[0].dataset.seckey);
      const catalogueSec = host.querySelector('[data-seckey="catalogue"]');
      if (!catalogueSec) throw new Error('Catalogue category missing');
      if (!catalogueSec.querySelectorAll('.tpl-card').length) throw new Error('Catalogue has no template cards');
    });

    __check('clicking a compact thumbnail previews it in the CENTER canvas, not a side panel', () => {
      editorialContent.layoutPages = [{ id: 'pgReal', type: 'moodboard', title: 'Real page', elements: [{ type: 'text', text: 'Existing content', x:0.1,y:0.1,w:0.3 }] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsToolsTab('templates');
      const host = document.getElementById('dsToolsTemplatesBody');
      const catalogueCard = host.querySelector('[data-seckey="catalogue"] .tpl-card');
      catalogueCard.onclick();
      const center = document.getElementById('dsCenter');
      if (!center.textContent.includes('Previewing')) throw new Error('center canvas does not show the preview banner');
      // real page data must be UNCHANGED while just previewing
      if (editorialContent.layoutPages[0].elements[0].text !== 'Existing content') throw new Error('real page data was mutated just by previewing');
    });

    __check('preview banner has Apply and Cancel actions', () => {
      const center = document.getElementById('dsCenter');
      const labels = Array.from(center.querySelectorAll('button')).map(b => b.textContent);
      if (labels.indexOf('Apply to this page') < 0) throw new Error('Apply button missing');
      if (labels.indexOf('Cancel') < 0) throw new Error('Cancel button missing');
    });

    __check('APPLY: confirms before overwriting a page that already has content', () => {
      editorialContent.layoutPages = [{ id: 'pgReal2', type: 'moodboard', title: 'Real page 2', elements: [{ type: 'text', text: 'Do not lose me', x:0.1,y:0.1,w:0.3 }] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return false; };   // decline
      _dsApplyTemplateToCurrentPage({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      if (!confirmCalled) throw new Error('did not confirm before overwriting existing content');
      if (editorialContent.layoutPages[0].elements[0].text !== 'Do not lose me') throw new Error('content was overwritten despite declining the confirm');
    });

    __check('APPLY: accepting the confirm applies a MASTER template correctly (elements AND annotations, images preserved)', () => {
      const savedMaster = IDML_MASTER_TEMPLATES.slice();
      IDML_MASTER_TEMPLATES.push({ name: 'Farmboy \\u00b7 Test Apply', type: 'moodboard', elements: [{ type: 'text', text: 'Template title', x:0.1,y:0.1,w:0.3 }], annotations: [{ type: 'shape', shape: 'rect', x:0.5,y:0.1,w:0.3,h:0.3, dataUrl: 'data:image/jpeg;base64,REALPHOTO' }] });
      const mi = IDML_MASTER_TEMPLATES.length - 1;
      editorialContent.layoutPages = [{ id: 'pgReal3', type: 'moodboard', title: 'Real page 3', elements: [] }];
      editorialContent.annotations = {};
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      window.confirm = () => true;
      _dsApplyTemplateToCurrentPage({ selKey: 'm:' + mi, name: 'Test Apply', els: [], source: 'master', mi: mi });
      const pg = editorialContent.layoutPages[0];
      if (pg.elements[0].text !== 'Template title') throw new Error('elements not applied: ' + JSON.stringify(pg.elements));
      const anns = editorialContent.annotations['layout:pgReal3'];
      if (!anns || anns[0].dataUrl !== 'data:image/jpeg;base64,REALPHOTO') throw new Error('annotation image data was stripped or missing on apply: ' + JSON.stringify(anns));
      if (_dsCenterPreviewItem !== null) throw new Error('preview mode did not exit after applying');
      IDML_MASTER_TEMPLATES.length = 0; savedMaster.forEach(m => IDML_MASTER_TEMPLATES.push(m));
    });

    __check('APPLY: the "blank" option clears both elements and annotations for the current page', () => {
      editorialContent.layoutPages = [{ id: 'pgReal4', type: 'moodboard', title: 'Real page 4', elements: [{ type: 'text', text: 'x', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.annotations = { 'layout:pgReal4': [{ type: 'arrow', x1:0,y1:0,x2:1,y2:1 }] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      window.confirm = () => true;
      _dsApplyTemplateToCurrentPage({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      const pg = editorialContent.layoutPages[0];
      if (pg.elements.length !== 0) throw new Error('elements not cleared: ' + JSON.stringify(pg.elements));
      if (editorialContent.annotations['layout:pgReal4']) throw new Error('annotations not cleared');
    });

    __check('APPLY guards against a non-editable page (e.g. spec) with a message, does not throw', () => {
      _dsPages = [{ kind: 'spec', row: { id: 'ART.001' } }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => null;
      let modalShown = false;
      window.showInfoModal = () => { modalShown = true; };
      _dsApplyTemplateToCurrentPage({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      if (!modalShown) throw new Error('no guard message shown for a non-editable page');
    });

    __check('CANCEL: exits preview mode and clears the flag without touching real page data', () => {
      editorialContent.layoutPages = [{ id: 'pgReal5', type: 'moodboard', title: 'Real page 5', elements: [{ type: 'text', text: 'Keep me', x:0.1,y:0.1,w:0.3 }] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      window._dsRenderCenterCalled = 0;
      const origRenderCenter = _dsRenderCenter;
      window._dsRenderCenter = () => { window._dsRenderCenterCalled++; };
      _dsPreviewTemplateInCenter({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      if (_dsCenterPreviewItem === null) throw new Error('preview flag not set');
      _dsCancelTemplatePreview();
      if (_dsCenterPreviewItem !== null) throw new Error('preview flag not cleared on cancel');
      if (editorialContent.layoutPages[0].elements[0].text !== 'Keep me') throw new Error('real page data touched by cancel');
    });

    __check('switching away from the Templates sub-tab while previewing cancels the preview', () => {
      editorialContent.layoutPages = [{ id: 'pgReal6', type: 'moodboard', title: 'Real page 6', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsToolsTab('templates');
      _dsPreviewTemplateInCenter({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      if (_dsCenterPreviewItem === null) throw new Error('fixture setup failed');
      _dsToolsTab('page');
      if (_dsCenterPreviewItem !== null) throw new Error('preview not cancelled when switching to Page tab');
    });

    __check('selecting a different page clears any in-progress preview', () => {
      editorialContent.layoutPages = [{ id: 'pgA', type: 'moodboard', title: 'A', elements: [] }, { id: 'pgB', type: 'moodboard', title: 'B', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }, { kind: 'layout', page: editorialContent.layoutPages[1] }];
      _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsCenterPreviewItem = { selKey: 'blank', name: 'x', els: [] };
      _dsSelectPage(1);
      if (_dsCenterPreviewItem !== null) throw new Error('preview state leaked across a page switch');
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
