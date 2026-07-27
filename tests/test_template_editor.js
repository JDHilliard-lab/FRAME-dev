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
    window.__realDsRenderTools = _dsRenderTools;

    __check('EDIT SESSION (user template): creates a real temp page with the template content and navigates to it', () => {
      editorialContent.templates = [{ name: 'My Layout', type: 'moodboard', elements: [{ type: 'text', text: 'Hello', x:0.1,y:0.1,w:0.3 }], annotations: [{ type: 'shape', shape: 'rect', x:0.5,y:0.1,w:0.3,h:0.3, fill:'#ccc' }] }];
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'u:0', name: 'My Layout', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempPages = editorialContent.layoutPages.filter(p => p.title.indexOf('My Layout') >= 0);
      if (tempPages.length !== 1) throw new Error('temp editing page not created');
      if (tempPages[0].elements[0].text !== 'Hello') throw new Error('template elements not copied into temp page');
      const anns = editorialContent.annotations['layout:' + tempPages[0].id];
      if (!anns || anns[0].fill !== '#ccc') throw new Error('template annotations not copied into temp page');
      if (!_dsTemplateEditSession || _dsTemplateEditSession.source !== 'user' || _dsTemplateEditSession.idx !== 0) throw new Error('edit session state not set correctly');
    });

    __check('SAVE: writes the edited temp page content back into the source USER template, then cleans up', () => {
      editorialContent.templates = [{ name: 'Editable', type: 'moodboard', elements: [], annotations: [] }];
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'u:0', name: 'Editable', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements.push({ type: 'text', text: 'Edited in place', x:0.2,y:0.2,w:0.3 });
      editorialContent.annotations['layout:' + tempId] = [{ type: 'arrow', x1:0,y1:0,x2:1,y2:1 }];
      _dsSaveTemplateEditSession();
      const t = editorialContent.templates[0];
      if (t.elements[0].text !== 'Edited in place') throw new Error('edits not saved back to the template: ' + JSON.stringify(t.elements));
      if (!t.annotations || t.annotations[0].type !== 'arrow') throw new Error('annotation edits not saved back: ' + JSON.stringify(t.annotations));
      if (editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page not cleaned up after saving');
      if (_dsTemplateEditSession !== null) throw new Error('edit session not cleared after saving');
    });

    __check('SAVE: writes back correctly for a MASTER (built-in) template too', () => {
      const savedMaster = IDML_MASTER_TEMPLATES.slice();
      IDML_MASTER_TEMPLATES.push({ name: 'Farmboy \\u00b7 Editable Master', type: 'moodboard', elements: [], annotations: [] });
      const mi = IDML_MASTER_TEMPLATES.length - 1;
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'm:' + mi, name: 'Editable Master', source: 'master', mi: mi, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements.push({ type: 'text', text: 'Master edited', x:0.1,y:0.1,w:0.3 });
      _dsSaveTemplateEditSession();
      if (IDML_MASTER_TEMPLATES[mi].elements[0].text !== 'Master edited') throw new Error('master template not updated');
      IDML_MASTER_TEMPLATES.length = 0; savedMaster.forEach(m => IDML_MASTER_TEMPLATES.push(m));
    });

    __check('DISCARD: with confirm accepted, cleans up the temp page WITHOUT saving edits', () => {
      editorialContent.templates = [{ name: 'Keep As Is', type: 'moodboard', elements: [{ type: 'text', text: 'original', x:0.1,y:0.1,w:0.3 }], annotations: [] }];
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'u:0', name: 'Keep As Is', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements[0].text = 'MODIFIED';
      window.confirm = () => true;
      _dsDiscardTemplateEditSession();
      if (editorialContent.templates[0].elements[0].text !== 'original') throw new Error('discard incorrectly saved edits: ' + editorialContent.templates[0].elements[0].text);
      if (editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page not removed on discard');
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared on discard');
    });

    __check('DISCARD: declining the confirm keeps the edit session active', () => {
      editorialContent.templates = [{ name: 'Confirm Test', type: 'moodboard', elements: [], annotations: [] }];
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'u:0', name: 'Confirm Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const pg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pg.elements.push({ type: 'text', text: 'a real edit', x:0.1,y:0.1,w:0.3 });   // must be dirty for the confirm to even appear
      window.confirm = () => false;
      _dsDiscardTemplateEditSession();
      if (_dsTemplateEditSession === null) throw new Error('session cleared despite declining the confirm');
    });

    __check('TEMPLATE MANAGEMENT PANEL: the right panel shows the template name, category, and Save/Discard while a session is active', () => {
      editorialContent.templates = [{ name: 'Banner Test', type: 'moodboard', elements: [], annotations: [] }];
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'u:0', name: 'Banner Test', source: 'user', idx: 0, catKey: 'moodboard' });
      window.__realDsRenderTools();
      const host = document.getElementById('dsToolsPageBody');
      if (!host.textContent.includes('Banner Test')) throw new Error('template name not shown');
      if (!host.textContent.includes('Your template')) throw new Error('source tag not shown');
      if (!host.querySelector('select')) throw new Error('category dropdown missing');
      const labels = Array.from(host.querySelectorAll('button')).map(b => b.textContent);
      if (labels.indexOf('Save to template') < 0 || labels.indexOf('Discard') < 0) throw new Error('Save/Discard buttons missing');
      if (labels.indexOf('Rename') < 0 || labels.indexOf('Delete') < 0) throw new Error('Rename/Delete management buttons missing for a user template');
    });

    __check('SAFETY NET: deleting the temp page directly via the normal page-delete control clears the stale session', () => {
      editorialContent.templates = [{ name: 'Direct Delete Test', type: 'moodboard', elements: [], annotations: [] }];
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._dsRenderCenter = () => {}; window._dsRenderTools = () => {};
      _dsTemplateEditSession = null;   // ensure clean isolation from any prior test
      _dsEditTemplate({ selKey: 'u:0', name: 'Direct Delete Test', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      _dsDeleteLayoutPage({ kind: 'layout', page: pg });
      if (_dsTemplateEditSession !== null) throw new Error('stale session not cleared after direct deletion of the temp page');
    });

    __check('Edit-this-template is not offered for builtin (non-master, non-user) starter items', () => {
      editorialContent.layoutPages = [{ id: 'pgX', type: 'moodboard', title: 'X', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsPreviewTemplateInCenter({ selKey: 'b:narrative:0', name: 'Some Starter', els: [], source: 'builtin', catForBuiltin: 'narrative', els0: [] });
      const center = document.getElementById('dsCenter');
      const labels = Array.from(center.querySelectorAll('button')).map(b => b.textContent);
      if (labels.indexOf('Edit this template') >= 0) throw new Error('Edit button incorrectly shown for a builtin starter');
    });

    __check('CATEGORY ASSIGNMENT: the preview banner for a user template includes a category dropdown wired to _dsRecategorize', () => {
      editorialContent.templates = [{ name: 'Cat Test', type: 'narrative', elements: [], annotations: [] }];
      editorialContent.layoutPages = [{ id: 'pgY', type: 'moodboard', title: 'Y', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      _dsPreviewTemplateInCenter({ selKey: 'u:0', name: 'Cat Test', els: [], source: 'user', idx: 0, catKey: 'narrative' });
      const center = document.getElementById('dsCenter');
      const sel = center.querySelector('select');
      if (!sel) throw new Error('category dropdown missing from preview banner');
      sel.value = 'moodboard';
      sel.onchange();
      if (editorialContent.templates[0].type !== 'moodboard') throw new Error('category change did not call _dsRecategorize correctly');
    });

    __check('DRAG REORDER: dragging one user template onto another within the SAME category reorders them', () => {
      editorialContent.templates = [
        { name: 'First', type: 'catalogue', elements: [], annotations: [] },
        { name: 'Second', type: 'catalogue', elements: [], annotations: [] },
        { name: 'Third', type: 'catalogue', elements: [], annotations: [] }
      ];
      _dsReorderTemplateItem('user', 0, 2);   // drag "First" (idx 0) onto "Third" (idx 2)
      const names = editorialContent.templates.map(t => t.name);
      if (names.join(',') !== 'Second,First,Third') throw new Error('reorder produced unexpected order: ' + names.join(','));
    });

    __check('DRAG REORDER: reordering guard checks source+category match before touching arrays (structural)', () => {
      const S = window.__appSrc;
      if (S.indexOf("if (!_dsTplDragFrom || _dsTplDragFrom.source !== item.source || _dsTplDragFrom.catKey !== item.catKey) return;") < 0) throw new Error('cross-category/source drag guard missing');
    });
  `;
  try { window.__appSrc = JSON.stringify(src); window.eval('window.__appSrc = ' + window.__appSrc + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
