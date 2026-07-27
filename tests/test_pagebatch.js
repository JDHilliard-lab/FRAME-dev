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
    window._dsRenderRail_REAL = _dsRenderRail;
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderRail=()=>{}; _dsRenderCenter=()=>{}; _dsRenderTools=()=>{}; _dsRefresh=()=>{};
    dashProjectData = []; elevations = []; floorplanLevels = [];

    __check('duplicate page also clones the source page\\'s annotations (the actual bug)', () => {
      editorialContent.layoutPages = [{ id: 'pgSrc', type: 'moodboard', title: 'Src', place: 'afterSpec', elements: [] }];
      editorialContent.annotations = { 'layout:pgSrc': [
        { type: 'text', text: 'Heading', x: 0.1, y: 0.1, w: 0.3 },
        { type: 'image', dataUrl: 'data:image/png;base64,AAA', x: 0.5, y: 0.1, w: 0.3, aspect: 1.3 }
      ] };
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      _dsPages = [desc]; _dsIndex = 0;
      _dsDuplicateLayoutPage(desc);
      const clone = editorialContent.layoutPages[1];
      if (!clone) throw new Error('no clone created');
      const cloneAnn = editorialContent.annotations['layout:' + clone.id];
      if (!cloneAnn || cloneAnn.length !== 2) throw new Error('annotations not cloned: ' + JSON.stringify(cloneAnn));
      if (cloneAnn[0].text !== 'Heading') throw new Error('text annotation lost: ' + JSON.stringify(cloneAnn[0]));
      if (cloneAnn[1].dataUrl !== 'data:image/png;base64,AAA') throw new Error('image annotation lost');
      // must be a deep clone, not the same array/objects
      if (cloneAnn === editorialContent.annotations['layout:pgSrc']) throw new Error('same array reference (not cloned)');
      cloneAnn[0].text = 'Changed';
      if (editorialContent.annotations['layout:pgSrc'][0].text === 'Changed') throw new Error('mutation leaked back to source (shallow clone)');
    });

    __check('duplicate page with no annotations does not create an empty entry', () => {
      editorialContent.layoutPages = [{ id: 'pgEmpty', type: 'moodboard', title: 'Empty', elements: [] }];
      editorialContent.annotations = {};
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      _dsPages = [desc]; _dsIndex = 0;
      _dsDuplicateLayoutPage(desc);
      const clone = editorialContent.layoutPages[1];
      if (editorialContent.annotations['layout:' + clone.id] !== undefined) throw new Error('unexpected empty annotation entry created');
    });

    __check('deleting a layout page also removes its annotation entry (hygiene)', () => {
      editorialContent.layoutPages = [{ id: 'pgDel', type: 'moodboard', title: 'Del', elements: [] }];
      editorialContent.annotations = { 'layout:pgDel': [{ type: 'text', text: 'X' }] };
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      _dsIndex = 0;
      _dsDeleteLayoutPage(desc);
      if (editorialContent.layoutPages.length !== 0) throw new Error('page not removed');
      if (editorialContent.annotations['layout:pgDel'] !== undefined) throw new Error('annotation entry orphaned');
    });

    __check('rail: layout pages render exactly ONE delete control, not two (source + behavioral)', () => {
      const S = window.__appSrc;
      // The redundant label-row X call must be gone.
      if (S.indexOf("lab.appendChild(ctlBtn('\\\\u2715', 'Delete page'") >= 0) throw new Error('redundant label-row delete control still present');
      // The floating quick-action remove must now be a minus sign.
      if (S.indexOf("_qaBtn('\\\\u2212', 'top:2px;', 'Remove this page'") < 0) throw new Error('quick-action remove is not a minus sign');
    });

    __check('rail actually renders one remove control per layout-page thumbnail (behavioral)', () => {
      editorialContent.layoutPages = [{ id: 'pgR', type: 'moodboard', title: 'R', elements: [] }];
      editorialContent.annotations = {};
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0], title: 'R' }];
      _dsIndex = 0;
      Object.keys(_dsThumbCache).forEach(k => delete _dsThumbCache[k]);
      Object.keys(_dsThumbLast).forEach(k => delete _dsThumbLast[k]);
      _dsBuildError = null;
      if (!document.getElementById('dsRail')) { const r = document.createElement('div'); r.id = 'dsRail'; document.body.appendChild(r); }
      _dsRenderRail_REAL();
      const rail = document.getElementById('dsRail');
      const removeButtons = Array.from(rail.querySelectorAll('button')).filter(b => (b.title || '').toLowerCase().indexOf('remove this page') >= 0 || (b.title || '').toLowerCase() === 'delete page');
      if (removeButtons.length !== 1) throw new Error('expected exactly 1 remove control, found ' + removeButtons.length + ': ' + removeButtons.map(b=>b.title).join(' | '));
      if (removeButtons[0].textContent !== '\\u2212') throw new Error('remove control is not a minus sign: ' + removeButtons[0].textContent);
    });

    __check('_dsResolveCaptionText: filename source strips extension; falls back to custom text', () => {
      let a = { capSource: 'filename', fileName: 'WIKI.Black_Pirate_Gates_3.jpg', caption: 'Custom' };
      if (_dsResolveCaptionText(a) !== 'WIKI.Black_Pirate_Gates_3') throw new Error('extension not stripped: ' + _dsResolveCaptionText(a));
      a = { capSource: 'filename', fileName: '', caption: 'Fallback text' };
      if (_dsResolveCaptionText(a) !== 'Fallback text') throw new Error('no-filename fallback broken: ' + _dsResolveCaptionText(a));
      a = { capSource: 'text', fileName: 'photo.png', caption: 'My caption' };
      if (_dsResolveCaptionText(a) !== 'My caption') throw new Error('text source broken: ' + _dsResolveCaptionText(a));
    });

    __check('fresh image upload stores fileName on the annotation (source guard)', () => {
      const S = window.__appSrc;
      if (S.indexOf("list.push({ type: 'image', dataUrl: durl, x: 0.12, y: 0.14, w: 0.28, aspect: aspect, fileName: file.name || '' });") < 0) throw new Error('fileName not captured on upload');
      if (S.indexOf("a.dataUrl = durl; a.aspect = (im.naturalWidth || 1) / (im.naturalHeight || 1); a.zoom = 1; a.panX = 0; a.panY = 0; a.fileName = file.name || '';") < 0) throw new Error('fileName not captured on replace');
    });

    __check('DOM caption renders resolved (filename) text and disables edit-in-place', () => {
      editorialContent.annotations = { 'layout:pgC': [{ type: 'image', dataUrl: 'data:image/png;base64,X', x: 0.1, y: 0.1, w: 0.2, aspect: 1, showCaption: true, capSource: 'filename', fileName: 'ART.009-photo.jpg' }] };
      const page = document.createElement('div'); document.body.appendChild(page);
      const box = document.createElement('div');
      _dsAnnCaptionInto(page, box, editorialContent.annotations['layout:pgC'][0], 'layout:pgC', 0, 900, 520);
      const cap = page.querySelector('[data-cap-for], div');
      const found = Array.from(page.children).find(c => c.textContent === 'ART.009-photo');
      if (!found) throw new Error('resolved filename caption not rendered: ' + page.innerHTML.slice(0,200));
      if (found.style.cursor !== 'default') throw new Error('filename caption should not be directly editable');
      page.remove();
    });

    __check('PDF caption draws the resolved (filename) text', () => {
      const rec = new CanvasPdfRec(936, 540);
      let drawnTexts = [];
      const origText = rec.text.bind(rec);
      rec.text = (str, x, y, opts) => { drawnTexts.push(str); origText(str, x, y, opts); };
      rec.splitTextToSize = (s) => [s];
      _drawAnnCaption(rec, { showCaption: true, capSource: 'filename', fileName: 'ART.010.png' }, 0, 0, 100, 50);
      if (!drawnTexts.some(t => (Array.isArray(t) ? t.join('') : t).indexOf('ART.010') >= 0)) throw new Error('resolved filename not drawn: ' + JSON.stringify(drawnTexts));
    });

    __check('gear popup: caption-source toggle appears for images, disabled without a fileName', () => {
      editorialContent.annotations = { 'layout:pgP': [{ type: 'image', dataUrl: 'data:image/png;base64,X', showCaption: true, capSource: 'text', caption: 'Hi' }] };
      _dsOpenGearPopup('layout:pgP', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const fileBtn = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'Code');
      if (!fileBtn) throw new Error('Code toggle missing');
      if (!fileBtn.disabled) throw new Error('should be disabled with no fileName on record');
      _dsCloseGearPopup();
      editorialContent.annotations['layout:pgP'][0].fileName = 'shot.jpg';
      _dsOpenGearPopup('layout:pgP', 0, 10, 10);
      const pop2 = document.getElementById('dsGearPopup');
      const fileBtn2 = Array.from(pop2.querySelectorAll('button')).find(b => b.textContent === 'Code');
      if (fileBtn2.disabled) throw new Error('should be enabled once a fileName exists');
      fileBtn2.onclick();
      if (editorialContent.annotations['layout:pgP'][0].capSource !== 'filename') throw new Error('toggle did not set capSource');
      _dsCloseGearPopup();
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
