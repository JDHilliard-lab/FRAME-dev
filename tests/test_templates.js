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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsTab = () => {}; _dsSyncToolbar = () => {};

    __check('_mbThumbInner now renders shape-type items (image placeholders) — the actual majority of real content', () => {
      const html = _mbThumbInner({ elements: [{ type: 'shape', shape: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.3, fill: '#d8d8de' }] }, 200, 116);
      if (html.indexOf('#d8d8de') < 0) throw new Error('shape fill not rendered: ' + html);
    });

    __check('_mbThumbInner renders a shape with a real dataUrl image (not just the gray placeholder)', () => {
      const html = _mbThumbInner({ elements: [{ type: 'shape', shape: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.3, dataUrl: 'data:image/png;base64,ABC', aspect: 1.3, zoom: 1 }] }, 200, 116);
      if (html.indexOf('data:image/png;base64,ABC') < 0) throw new Error('shape image not rendered: ' + html);
    });

    __check('_mbThumbInner respects ellipse shape (50% border-radius)', () => {
      const html = _mbThumbInner({ elements: [{ type: 'shape', shape: 'ellipse', x: 0.1, y: 0.1, w: 0.3, h: 0.3, fill: '#d8d8de' }] }, 200, 116);
      if (html.indexOf('border-radius:50%') < 0) throw new Error('ellipse radius not applied: ' + html);
    });

    __check('SAVE: a template now captures BOTH elements and annotations (the actual bug — most content lived in annotations)', () => {
      editorialContent.layoutPages = [{ id: 'pgSave', type: 'moodboard', title: 'Save Me', elements: [{ type: 'text', text: 'Hi', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.annotations = { 'layout:pgSave': [{ type: 'shape', shape: 'rect', x:0.5,y:0.1,w:0.3,h:0.3, fill:'#d8d8de' }, { type: 'arrow', x1:0.1,y1:0.5,x2:0.4,y2:0.5, color:'#9aa0a6', weight: 1.2 }] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window.prompt = () => 'My Template';
      _dsSaveCurrentAsTemplate();
      const t = editorialContent.templates[editorialContent.templates.length - 1];
      if (t.elements.length !== 1) throw new Error('elements not captured: ' + JSON.stringify(t.elements));
      if (!Array.isArray(t.annotations) || t.annotations.length !== 2) throw new Error('annotations not captured: ' + JSON.stringify(t.annotations));
    });

    __check('SAVE: real embedded image data is stripped from annotations (structural template, not a photo dump)', () => {
      editorialContent.layoutPages = [{ id: 'pgSave2', type: 'moodboard', title: 'S2', elements: [] }];
      editorialContent.annotations = { 'layout:pgSave2': [{ type: 'shape', shape: 'rect', dataUrl: 'data:image/jpeg;base64,REALPHOTODATA', x:0.1,y:0.1,w:0.3,h:0.3 }] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window.prompt = () => 'Stripped Template';
      _dsSaveCurrentAsTemplate();
      const t = editorialContent.templates[editorialContent.templates.length - 1];
      if (t.annotations[0].dataUrl) throw new Error('real image data leaked into the saved template: ' + t.annotations[0].dataUrl);
    });

    __check('ADD TO DECK: inserting a user template restores its annotations onto the new page', () => {
      editorialContent.templates = [{ name: 'Restore Test', type: 'moodboard', elements: [{ type: 'text', text: 'Title', x:0.1,y:0.1,w:0.3 }], annotations: [{ type: 'shape', shape: 'rect', x:0.5,y:0.1,w:0.3,h:0.3, fill:'#d8d8de' }] }];
      editorialContent.layoutPages = [];
      editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      window._deckPageKeyOrig = _deckPageKey;
      _dsTemplateToDeck(0);
      const pg = editorialContent.layoutPages[0];
      if (!pg) throw new Error('page not created');
      const restored = editorialContent.annotations['layout:' + pg.id];
      if (!restored || restored.length !== 1 || restored[0].type !== 'shape') throw new Error('annotations not restored: ' + JSON.stringify(restored));
    });

    __check('ADD TO DECK from a MASTER (built-in) template also restores annotations', () => {
      const savedMaster = IDML_MASTER_TEMPLATES.slice();
      IDML_MASTER_TEMPLATES.push({ name: 'Farmboy \\u00b7 Test Master', type: 'moodboard', elements: [{ type: 'text', text: 'M', x:0.1,y:0.1,w:0.3 }], annotations: [{ type: 'arrow', x1:0.1,y1:0.5,x2:0.4,y2:0.5, color:'#9aa0a6' }] });
      editorialContent.layoutPages = [];
      editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      _dsMasterToDeck(IDML_MASTER_TEMPLATES.length - 1);
      const pg = editorialContent.layoutPages[0];
      const restored = editorialContent.annotations['layout:' + pg.id];
      if (!restored || restored.length !== 1 || restored[0].type !== 'arrow') throw new Error('master annotations not restored: ' + JSON.stringify(restored));
      IDML_MASTER_TEMPLATES.length = 0; savedMaster.forEach(m => IDML_MASTER_TEMPLATES.push(m));
    });

    __check('UPDATE FROM PAGE: refreshing a template also re-captures annotations', () => {
      editorialContent.templates = [{ name: 'To Update', type: 'moodboard', elements: [], annotations: [] }];
      editorialContent.layoutPages = [{ id: 'pgUpd', type: 'moodboard', title: 'U', elements: [{ type: 'text', text: 'New', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.annotations = { 'layout:pgUpd': [{ type: 'shape', shape: 'ellipse', x:0.2,y:0.2,w:0.2,h:0.2, fill:'#fff' }] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window.confirm = () => true;
      _dsUpdateTemplateFromPage(0);
      const t = editorialContent.templates[0];
      if (t.elements.length !== 1) throw new Error('elements not updated');
      if (t.annotations.length !== 1 || t.annotations[0].shape !== 'ellipse') throw new Error('annotations not updated: ' + JSON.stringify(t.annotations));
    });

    __check('templates tab thumbnail includes annotation content for user templates (behavioral)', () => {
      editorialContent.templates = [{ name: 'Thumb Test', type: 'moodboard', elements: [{ type: 'text', text: 'T', x:0.1,y:0.1,w:0.3 }], annotations: [{ type: 'shape', shape: 'rect', x:0.5,y:0.1,w:0.3,h:0.3, fill: '#123456' }] }];
      const host = document.getElementById('dsTabTemplates');
      _dsRenderTemplatesTab();
      if (host.innerHTML.indexOf('#123456') < 0) throw new Error('shape annotation missing from rendered thumbnail');
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
