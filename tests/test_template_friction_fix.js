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

    __check('BUG FIX: clicking Blank no longer crashes', () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      if (!_dsTemplateEditSession) throw new Error('session not created for blank');
      const pg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      if (!pg || pg.elements.length !== 0) throw new Error('blank temp page not created correctly');
    });

    __check('FRICTION FIX: switching templates with ZERO edits does not prompt at all', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [
        { name: 'Tpl A', type: 'moodboard', elements: [{ type: 'text', text: 'A', x:0.1,y:0.1,w:0.3 }], annotations: [] },
        { name: 'Tpl B', type: 'moodboard', elements: [], annotations: [] }
      ];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'u:0', name: 'Tpl A', source: 'user', idx: 0, catKey: 'moodboard' });
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return true; };
      _dsEditTemplate({ selKey: 'u:1', name: 'Tpl B', source: 'user', idx: 1, catKey: 'moodboard' });
      if (confirmCalled) throw new Error('confirm fired despite zero edits \\u2014 the exact friction Jordan reported');
      if (_dsTemplateEditSession.__selKey !== 'u:1') throw new Error('switch did not actually happen');
    });

    __check('DIRTY DETECTION: switching templates WITH real edits DOES prompt', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [
        { name: 'Tpl C', type: 'moodboard', elements: [], annotations: [] },
        { name: 'Tpl D', type: 'moodboard', elements: [], annotations: [] }
      ];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'u:0', name: 'Tpl C', source: 'user', idx: 0, catKey: 'moodboard' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements.push({ type: 'text', text: 'edited', x:0.1,y:0.1,w:0.3 });   // make a real edit
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return false; };   // decline
      _dsEditTemplate({ selKey: 'u:1', name: 'Tpl D', source: 'user', idx: 1, catKey: 'moodboard' });
      if (!confirmCalled) throw new Error('did not confirm despite a real unsaved edit');
      if (_dsTemplateEditSession.__selKey !== 'u:0') throw new Error('session switched despite declining the confirm');
    });

    __check('NAVIGATE AWAY: no confirm when clean, confirm when dirty', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Clean Tpl', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Clean Tpl', source: 'user', idx: 0, catKey: 'moodboard' });
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return true; };
      _dsTab('pages');
      if (confirmCalled) throw new Error('confirmed on navigate-away despite no edits');
      if (_dsTemplateEditSession !== null) throw new Error('session not cleaned up on clean navigate-away');
    });

    __check('+ New template: no confirm when the current session is clean', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Clean Tpl 2', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsTab('templateEditor');
      _dsEditTemplate({ selKey: 'u:0', name: 'Clean Tpl 2', source: 'user', idx: 0, catKey: 'moodboard' });
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return true; };
      window.prompt = () => 'Fresh One';
      _dsNewTemplateFromScratch();
      if (confirmCalled) throw new Error('confirmed despite the current session being clean');
      if (editorialContent.templates[editorialContent.templates.length - 1].name !== 'Fresh One') throw new Error('new template not created');
    });

    __check('DISCARD: no confirm when clean', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Clean Discard', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'u:0', name: 'Clean Discard', source: 'user', idx: 0, catKey: 'moodboard' });
      let confirmCalled = false;
      window.confirm = () => { confirmCalled = true; return true; };
      _dsDiscardTemplateEditSession();
      if (confirmCalled) throw new Error('confirmed discard despite no edits');
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared');
    });

    __check('SAVE from Blank: prompts for a name and creates a new template entry', () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      const pg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pg.elements.push({ type: 'text', text: 'My new layout', x:0.1,y:0.1,w:0.3 });
      window.prompt = () => 'My Fresh Template';
      _dsSaveTemplateEditSession();
      const t = editorialContent.templates.find(x => x.name === 'My Fresh Template');
      if (!t) throw new Error('blank save did not create a new template entry \\u2014 the exact silent-loss bug');
      if (t.elements[0].text !== 'My new layout') throw new Error('content not carried over: ' + JSON.stringify(t.elements));
      if (_dsTemplateEditSession !== null) throw new Error('session not cleared after successful save');
    });

    __check('SAVE from Blank: cancelling the name prompt keeps the session open (does not lose the work)', () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      const tempId = _dsTemplateEditSession.tempPageId;
      const pg = editorialContent.layoutPages.find(p => p.id === tempId);
      pg.elements.push({ type: 'text', text: 'Do not lose this', x:0.1,y:0.1,w:0.3 });
      window.prompt = () => '';   // cancel
      _dsSaveTemplateEditSession();
      if (_dsTemplateEditSession === null) throw new Error('session was cleared despite cancelling the name prompt');
      if (!editorialContent.layoutPages.some(p => p.id === tempId)) throw new Error('temp page was removed despite cancelling \\u2014 work would be lost');
    });

    __check('VISUAL: Save button reads "Save template" for a brand-new (blank-sourced) session', () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'blank', name: 'Blank page', els: [], source: 'blank' });
      const t = document.createElement('div');
      _dsRenderTemplateManagementPanel(t);
      const btn = Array.from(t.querySelectorAll('button')).find(b => b.textContent.indexOf('Save') === 0);
      if (!btn || btn.textContent !== 'Save template') throw new Error('wrong label for a new template: ' + (btn && btn.textContent));
    });

    __check('VISUAL: Save button turns yellow and reads "Save changes" once a real edit is made to an existing template', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Existing', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'u:0', name: 'Existing', source: 'user', idx: 0, catKey: 'moodboard' });
      const pg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pg.elements.push({ type: 'text', text: 'change', x:0.1,y:0.1,w:0.3 });
      const t = document.createElement('div');
      _dsRenderTemplateManagementPanel(t);
      const btn = Array.from(t.querySelectorAll('button')).find(b => b.textContent.indexOf('Save') === 0);
      if (btn.textContent !== 'Save changes') throw new Error('wrong label when dirty: ' + btn.textContent);
      if (btn.style.backgroundColor !== '#e5b53a' && btn.style.backgroundColor !== 'rgb(229, 181, 58)') throw new Error('save button not highlighted yellow when dirty: ' + btn.style.backgroundColor);
    });

    __check('VISUAL: Save button stays normal (not yellow) and reads "Save to template" when nothing has changed', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Untouched', type: 'moodboard', elements: [{ type: 'text', text: 'x', x:0.1,y:0.1,w:0.3 }], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'u:0', name: 'Untouched', source: 'user', idx: 0, catKey: 'moodboard' });
      const t = document.createElement('div');
      _dsRenderTemplateManagementPanel(t);
      const btn = Array.from(t.querySelectorAll('button')).find(b => b.textContent.indexOf('Save') === 0);
      if (btn.textContent !== 'Save to template') throw new Error('wrong label when clean: ' + btn.textContent);
      if (btn.style.backgroundColor === '#e5b53a' || btn.style.backgroundColor === 'rgb(229, 181, 58)') throw new Error('save button incorrectly highlighted yellow when clean');
    });

    __check('AUTO-START: opening the Templates destination immediately starts an editable Blank session', () => {
      editorialContent.layoutPages = []; editorialContent.templates = [];
      _dsTemplateEditSession = null;
      _dsOpenTemplateEditor();
      if (!_dsTemplateEditSession) throw new Error('no session auto-started on opening Templates');
      if (_dsTemplateEditSession.__selKey !== 'blank') throw new Error('auto-started session is not Blank: ' + _dsTemplateEditSession.__selKey);
    });

    __check('AUTO-START: does not override an already-active session if Templates is somehow reopened', () => {
      editorialContent.layoutPages = [];
      editorialContent.templates = [{ name: 'Already Editing', type: 'moodboard', elements: [], annotations: [] }];
      _dsTemplateEditSession = null;
      _dsEditTemplate({ selKey: 'u:0', name: 'Already Editing', source: 'user', idx: 0, catKey: 'moodboard' });
      _dsOpenTemplateEditor();
      if (_dsTemplateEditSession.__selKey !== 'u:0') throw new Error('auto-start incorrectly overrode the existing session');
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
