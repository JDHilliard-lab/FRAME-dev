const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsSyncApprovedBtn = () => {}; renderMoodboardCanvas = () => {}; _dsRenderRail = () => {};

    await __check('EXACT BUG: switching from a clean template-editor session back to Pages correctly shows normal page tools, not a blank panel', async () => {
      editorialContent.layoutPages = [{ id: 'pgReal', type: 'moodboard', title: 'Real', elements: [{ type: 'text', text: 'x', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.templates = [{ name: 'Some Template', type: 'moodboard', elements: [], annotations: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Some Template', source: 'user', idx: 0, catKey: 'moodboard' });
      if (!_dsTemplateEditSession) throw new Error('fixture setup failed \\u2014 no session started');
      window.confirm = () => true;
      _dsTab('pages'); await __tick(); await __tick();
      if (_dsInTemplateLibraryMode) throw new Error('mode flag not correctly reset after returning to Pages');
      const body = document.getElementById('dsToolsPageBody');
      if (body.style.display !== 'block') throw new Error('page tools panel not shown: ' + body.style.display);
      if (!body.textContent || body.textContent.trim().length === 0) throw new Error('the exact reported bug: right panel is blank after returning from Templates to Pages');
    });

    await __check('an error inside cleanup no longer prevents the rest of _dsTab from correctly resetting mode state', async () => {
      editorialContent.layoutPages = [{ id: 'pgReal2', type: 'moodboard', title: 'Real2', elements: [{ type: 'text', text: 'y', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.templates = [{ name: 'Another', type: 'moodboard', elements: [], annotations: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _dsTemplateEditSession = null;
      _dsTab('templateEditor'); await __tick(); await __tick();
      await _dsEditTemplate({ selKey: 'u:0', name: 'Another', source: 'user', idx: 0, catKey: 'moodboard' });
      const pg = editorialContent.layoutPages.find(p => p.id === _dsTemplateEditSession.tempPageId);
      pg.elements.push({ type: 'text', text: 'unsaved edit', x:0.1,y:0.1,w:0.3 });   // make it dirty
      window.confirm = () => true;   // confirm leaving without saving
      const origCleanup = _dsCleanupTemplateEditSession;
      _dsCleanupTemplateEditSession = () => { throw new Error('simulated failure'); };
      _dsTab('pages'); await __tick(); await __tick();   // should not throw out to the caller, and should still correctly finish
      _dsCleanupTemplateEditSession = origCleanup;
      if (_dsInTemplateLibraryMode) throw new Error('mode flag stuck true after a cleanup error \\u2014 the exact fragility this fix addresses');
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
