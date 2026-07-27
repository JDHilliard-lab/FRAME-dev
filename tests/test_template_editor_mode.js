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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsSyncApprovedBtn = () => {}; renderMoodboardCanvas = () => {};
    _dsInclude = _dsInclude || (() => ({}));

    __check('_dsTab("templateEditor") shows the Pages DOM but highlights the Templates nav button', () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      const pagesDiv = document.getElementById('dsTabPages');
      if (pagesDiv.style.display !== 'flex') throw new Error('Pages DOM not shown for templateEditor mode');
      const bt = document.getElementById('dsTabBtnTemplates'), bg = document.getElementById('dsTabBtnPages');
      if (bt.style.backgroundColor === bg.style.backgroundColor) throw new Error('Templates button not distinctly highlighted from Pages button');
      if (!_dsInTemplateLibraryMode) throw new Error('library mode flag not set');
    });

    __check('with no template selected yet, the center canvas shows a placeholder \\u2014 never a real page', () => {
      editorialContent.layoutPages = [{ id: 'realPg', type: 'moodboard', title: 'Real Page', elements: [{ type: 'text', text: 'Do not show me', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsRenderCenter();
      const center = document.getElementById('dsCenter');
      if (center.textContent.indexOf('Do not show me') >= 0) throw new Error('a real page leaked into the center canvas before any template was selected');
      if (center.textContent.indexOf('Select a template') < 0) throw new Error('placeholder message not shown');
      if (_dsIndex !== -1) throw new Error('_dsIndex should be neutralized (-1) so nothing can target the real page: got ' + _dsIndex);
    });

    __check('the left rail shows the Template Library (Blank + categories), not the real page list', () => {
      editorialContent.layoutPages = [{ id: 'realPg2', type: 'moodboard', title: 'Real Page 2', elements: [] }];
      editorialContent.templates = [{ name: 'My Tpl', type: 'catalogue', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      const rail = document.getElementById('dsRail');
      if (rail.textContent.indexOf('Template Library') < 0) throw new Error('rail does not show the template library header');
      if (rail.textContent.indexOf('Real Page 2') >= 0) throw new Error('a real page title leaked into the template rail');
      const blankSec = rail.querySelector('[data-seckey="__blank__"]');
      if (!blankSec) throw new Error('Blank section missing from the rail');
    });

    __check('clicking a template thumbnail in the rail opens it for editing immediately (no separate preview-then-edit step)', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Click Me', type: 'catalogue', elements: [{ type: 'text', text: 'Content', x:0.1,y:0.1,w:0.3 }], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      const rail = document.getElementById('dsRail');
      const card = Array.from(rail.querySelectorAll('.tpl-card')).find(c => c.dataset.tname === 'click me');
      if (!card) throw new Error('template card not found in rail');
      card.onclick();
      if (!_dsTemplateEditSession) throw new Error('clicking did not start an edit session');
      const tempPg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      if (!tempPg || tempPg.elements[0].text !== 'Content') throw new Error('temp page not correctly populated on click');
    });

    __check('the right panel shows template management (name, category, Save/Discard), not normal page tools, while in this mode', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Mgmt Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Mgmt Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const subBar = document.getElementById('dsToolsSubTabBar');
      if (subBar.style.display !== 'none') throw new Error('the old Page/Templates sub-tab bar should be hidden in this dedicated mode');
      const body = document.getElementById('dsToolsPageBody');
      if (body.textContent.indexOf('Mgmt Test') < 0) throw new Error('template name not shown in management panel');
    });

    __check('SWITCHING TEMPLATES: clicking a different template while one is being edited (unsaved) confirms first', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [
        { name: 'Tpl A', type: 'moodboard', elements: [], annotations: [] },
        { name: 'Tpl B', type: 'moodboard', elements: [], annotations: [] }
      ];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Tpl A', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempIdA = _dsTemplateEditSession.tempPageId;
      const pgA = editorialContent.layoutPages.find(p => p.id === tempIdA);
      pgA.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });   // must be dirty for the confirm to appear
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return false; };   // decline
      _dsEditTemplate({ selKey: 'u:1', name: 'Tpl B', source: 'user', idx: 1, catKey: 'moodboard' });
      if (!confirmCalled) throw new Error('did not confirm before switching away from unsaved edits');
      if (_dsTemplateEditSession.tempPageId !== tempIdA) throw new Error('session was switched despite declining the confirm');
    });

    __check('NAVIGATE AWAY: clicking Pages while editing a template (unsaved) confirms, and on accept cleans up the temp page entirely', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Nav Away Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Nav Away Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      window.confirm = () => true;   // accept leaving
      _dsTab('pages');
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared after navigating away');
      if (editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page leaked into the real Pages list after navigating away \\u2014 the exact scenario Jordan wanted to avoid');
      if (_dsInTemplateLibraryMode) throw new Error('library mode flag not cleared');
    });

    __check('NAVIGATE AWAY: declining the confirm keeps you in template-editor mode with the session intact', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Stay Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Stay Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const pgStay = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pgStay.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });
      window.confirm = () => false;   // decline leaving
      _dsTab('pages');
      if (_dsTemplateEditSession === null) throw new Error('session incorrectly cleared despite declining the confirm');
      if (!_dsInTemplateLibraryMode) throw new Error('should still be in template-editor mode after declining to leave');
    });

    __check('+ New template creates a blank template and immediately opens it for editing', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      window.prompt = () => 'Fresh Template';
      _dsNewTemplateFromScratch();
      if (editorialContent.templates.length !== 1 || editorialContent.templates[0].name !== 'Fresh Template') throw new Error('new template not created');
      if (!_dsTemplateEditSession) throw new Error('did not immediately open the new template for editing');
    });

    __check('+ New template while editing unsaved work confirms first, and declining leaves no orphaned blank template', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Existing Work', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Existing Work', source: 'user', idx: 0, catKey: 'moodboard' });
      const pgExisting = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pgExisting.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });
      window.confirm = () => false;   // decline switching away
      window.prompt = () => 'Should Not Exist';
      _dsNewTemplateFromScratch();
      if (editorialContent.templates.some(t => t.name === 'Should Not Exist')) throw new Error('orphaned blank template was created despite declining the confirm');
      if (_dsTemplateEditSession.name !== 'Existing Work') throw new Error('original session was disturbed');
    });

    __check('SAVE from within template-editor mode correctly refreshes the rail and shows the updated content', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Save Flow Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Save Flow Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements.push({ type: 'text', text: 'New content', x:0.1,y:0.1,w:0.3 });
      _dsSaveTemplateEditSession();
      if (editorialContent.templates[0].elements[0].text !== 'New content') throw new Error('save did not persist changes');
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared after save');
      if (editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page not cleaned up after save');
      // still in library mode, ready to pick another template
      if (!_dsInTemplateLibraryMode) throw new Error('should remain in template-editor mode after saving');
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
