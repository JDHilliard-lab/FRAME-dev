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
    window.__done = (async () => {
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    // 18.11 replaced window.confirm / window.prompt with styled async dialogs
    // (_askYesNo, _askFields). These checks were written against the native ones, so
    // the helpers are bridged back to whatever window.confirm / window.prompt the
    // check installs: accept, decline and typed names mean exactly what they did.
    _askYesNo = (t, b) => Promise.resolve(!!(typeof window.confirm === 'function' ? window.confirm(b) : true));
    _askFields = (o) => Promise.resolve((() => {
      const out = {};
      for (const f of (o.fields || [])) {
        const v = (typeof window.prompt === 'function') ? window.prompt(f.label, f.value) : f.value;
        if (v == null) return null;
        out[f.key] = String(v).trim();
      }
      return out;
    })());
    const __tick = () => new Promise(r => setTimeout(r, 0));

    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsSyncApprovedBtn = () => {}; renderMoodboardCanvas = () => {};
    _dsInclude = _dsInclude || (() => ({}));

    await __check('_dsTab("templateEditor") shows the Pages DOM but highlights the Templates nav button', async () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      const pagesDiv = document.getElementById('dsTabPages');
      if (pagesDiv.style.display !== 'flex') throw new Error('Pages DOM not shown for templateEditor mode');
      const bt = document.getElementById('dsTabBtnTemplates'), bg = document.getElementById('dsTabBtnPages');
      // Ask what a USER would see, not how it is spelled. This has now been an
      // inline backgroundColor, an inline var() the shorthand parser dropped, and
      // a class; the question 'is the Templates button lit and the Pages one not'
      // never changed. .frame-tab.active is the one marker every tab strip uses.
      const lit = (el) => el.classList.contains('active');
      if (!lit(bt)) throw new Error('Templates button is not lit: class="' + bt.className + '"');
      if (lit(bg)) throw new Error('Pages button is lit too, so they are not distinct: class="' + bg.className + '"');
      if (!_dsInTemplateLibraryMode) throw new Error('library mode flag not set');
    });

    await __check('with no template selected yet, the center canvas shows a placeholder \\u2014 never a real page', async () => {
      editorialContent.layoutPages = [{ id: 'realPg', type: 'moodboard', title: 'Real Page', elements: [{ type: 'text', text: 'Do not show me', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      _dsRenderCenter();
      const center = document.getElementById('dsCenter');
      if (center.textContent.indexOf('Do not show me') >= 0) throw new Error('a real page leaked into the center canvas before any template was selected');
      if (center.textContent.indexOf('Select a template') < 0) throw new Error('placeholder message not shown');
      if (_dsIndex !== -1) throw new Error('_dsIndex should be neutralized (-1) so nothing can target the real page: got ' + _dsIndex);
    });

    await __check('the left rail shows the Template Library (Blank + categories), not the real page list', async () => {
      editorialContent.layoutPages = [{ id: 'realPg2', type: 'moodboard', title: 'Real Page 2', elements: [] }];
      editorialContent.templates = [{ name: 'My Tpl', type: 'catalogue', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      const rail = document.getElementById('dsRail');
      if (rail.textContent.indexOf('Template Library') < 0) throw new Error('rail does not show the template library header');
      if (rail.textContent.indexOf('Real Page 2') >= 0) throw new Error('a real page title leaked into the template rail');
      const blankSec = rail.querySelector('[data-seckey="__blank__"]');
      if (!blankSec) throw new Error('Blank section missing from the rail');
    });

    await __check('clicking a template thumbnail in the rail opens it for editing immediately (no separate preview-then-edit step)', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Click Me', type: 'catalogue', elements: [{ type: 'text', text: 'Content', x:0.1,y:0.1,w:0.3 }], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      const rail = document.getElementById('dsRail');
      const card = Array.from(rail.querySelectorAll('.tpl-card')).find(c => c.dataset.tname === 'click me');
      if (!card) throw new Error('template card not found in rail');
      card.onclick();
      if (!_dsTemplateEditSession) throw new Error('clicking did not start an edit session');
      const tempPg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      if (!tempPg || tempPg.elements[0].text !== 'Content') throw new Error('temp page not correctly populated on click');
    });

    await __check('the right panel shows template management (name, category, Save/Discard), not normal page tools, while in this mode', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Mgmt Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Mgmt Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const subBar = document.getElementById('dsToolsSubTabBar');
      if (subBar.style.display !== 'none') throw new Error('the old Page/Templates sub-tab bar should be hidden in this dedicated mode');
      const body = document.getElementById('dsToolsPageBody');
      if (body.textContent.indexOf('Mgmt Test') < 0) throw new Error('template name not shown in management panel');
    });

    await __check('SWITCHING TEMPLATES: clicking a different template while one is being edited (unsaved) confirms first', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [
        { name: 'Tpl A', type: 'moodboard', elements: [], annotations: [] },
        { name: 'Tpl B', type: 'moodboard', elements: [], annotations: [] }
      ];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Tpl A', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempIdA = _dsTemplateEditSession.tempPageId;
      const pgA = editorialContent.layoutPages.find(p => p.id === tempIdA);
      pgA.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });   // must be dirty for the confirm to appear
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return false; };   // decline
      await _dsEditTemplate({ selKey: 'u:1', name: 'Tpl B', source: 'user', idx: 1, catKey: 'moodboard' });
      if (!confirmCalled) throw new Error('did not confirm before switching away from unsaved edits');
      if (_dsTemplateEditSession.tempPageId !== tempIdA) throw new Error('session was switched despite declining the confirm');
    });

    await __check('NAVIGATE AWAY: clicking Pages while editing a template (unsaved) confirms, and on accept cleans up the temp page entirely', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Nav Away Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Nav Away Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      window.confirm = () => true;   // accept leaving
      _dsTab('pages'); await __tick(); await __tick();
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared after navigating away');
      if (editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page leaked into the real Pages list after navigating away \\u2014 the exact scenario Jordan wanted to avoid');
      if (_dsInTemplateLibraryMode) throw new Error('library mode flag not cleared');
    });

    await __check('NAVIGATE AWAY: declining the confirm keeps you in template-editor mode with the session intact', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Stay Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Stay Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const pgStay = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pgStay.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });
      window.confirm = () => false;   // decline leaving
      _dsTab('pages'); await __tick(); await __tick();
      if (_dsTemplateEditSession === null) throw new Error('session incorrectly cleared despite declining the confirm');
      if (!_dsInTemplateLibraryMode) throw new Error('should still be in template-editor mode after declining to leave');
    });

    await __check('+ New template creates a blank template and immediately opens it for editing', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      window.prompt = () => 'Fresh Template';
      await _dsNewTemplateFromScratch();
      if (editorialContent.templates.length !== 1 || editorialContent.templates[0].name !== 'Fresh Template') throw new Error('new template not created');
      if (!_dsTemplateEditSession) throw new Error('did not immediately open the new template for editing');
    });

    await __check('+ New template while editing unsaved work confirms first, and declining leaves no orphaned blank template', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Existing Work', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Existing Work', source: 'user', idx: 0, catKey: 'moodboard' });
      const pgExisting = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pgExisting.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });
      window.confirm = () => false;   // decline switching away
      window.prompt = () => 'Should Not Exist';
      await _dsNewTemplateFromScratch();
      if (editorialContent.templates.some(t => t.name === 'Should Not Exist')) throw new Error('orphaned blank template was created despite declining the confirm');
      if (_dsTemplateEditSession.name !== 'Existing Work') throw new Error('original session was disturbed');
    });

    await __check('SAVE from within template-editor mode correctly refreshes the rail and shows the updated content', async () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Save Flow Test', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Save Flow Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements.push({ type: 'text', text: 'New content', x:0.1,y:0.1,w:0.3 });
      await _dsSaveTemplateEditSession();
      if (editorialContent.templates[0].elements[0].text !== 'New content') throw new Error('save did not persist changes');
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared after save');
      if (editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page not cleaned up after save');
      // still in library mode, ready to pick another template
      if (!_dsInTemplateLibraryMode) throw new Error('should remain in template-editor mode after saving');
    });
    })();
  `;
  try { window.eval(src + '\n' + testBlock); await window.__done; }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
