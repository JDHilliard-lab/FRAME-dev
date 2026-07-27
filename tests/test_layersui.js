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
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderCenter=()=>{}; renderMoodboardCanvas=()=>{}; _dsSyncToolbar=()=>{};

    __check('layers panel uses the outline lock/eye icons, not emoji', () => {
      editorialContent.layoutPages = [{ id: 'pgL', type: 'moodboard', title: 'L', elements: [{ type: 'text', text: 'A', z: 1 }] }];
      editorialContent.annotations = { 'layout:pgL': [{ type: 'image', z: 2 }] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => ({ key: 'layout:pgL', list: editorialContent.annotations['layout:pgL'] });
      window._dsCurrentEditablePage = () => _dsPages[0];
      _mbSel = []; _mbSelAnn = []; _mbSelected = -1; _dsSelKey = null; _dsSelIdx = -1;
      _dsToolsTab('layers');
      const p = document.getElementById('dsToolsLayersBody');
      if (!p) throw new Error('panel did not open');
      if ((p.innerHTML || '').indexOf('\\ud83d\\udd12') >= 0 || (p.innerHTML || '').indexOf('\\ud83d\\udd13') >= 0) throw new Error('old lock emoji still present');
      if ((p.innerHTML || '').indexOf('\\u25c9') >= 0 || (p.innerHTML || '').indexOf('\\u2298') >= 0) throw new Error('old eye emoji still present');
      // The new SVG icons should be present (identifiable by their distinctive path data).
      if (p.innerHTML.indexOf('rect x="5" y="11" width="14" height="10"') < 0) throw new Error('lock/unlock svg not rendered');
      if (p.innerHTML.indexOf('circle cx="12" cy="12" r="3"') < 0) throw new Error('eye svg not rendered');
    });

    __check('layers panel rows have NO up/down arrow buttons anymore (drag replaces them)', () => {
      editorialContent.layoutPages = [{ id: 'pgL2', type: 'moodboard', title: 'L2', elements: [{ type: 'text', text: 'A', z: 1 }, { type: 'text', text: 'B', z: 2 }] }];
      editorialContent.annotations = {};
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => null;
      window._dsCurrentEditablePage = () => _dsPages[0];
      _dsToolsTab('layers');
      const p = document.getElementById('dsToolsLayersBody');
      const titles = Array.from(p.querySelectorAll('button')).map(b => b.title);
      if (titles.indexOf('Bring forward') >= 0 || titles.indexOf('Send backward') >= 0) throw new Error('old arrow buttons still present: ' + titles.join(','));
    });

    __check('layer rows are draggable and reorder on drop, reassigning z ranks for everything', () => {
      editorialContent.layoutPages = [{ id: 'pgD', type: 'moodboard', title: 'D', elements: [
        { type: 'text', text: 'Top', z: 3 },
        { type: 'text', text: 'Mid', z: 2 },
        { type: 'text', text: 'Bottom', z: 1 }
      ] }];
      editorialContent.annotations = {};
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => null;
      window._dsCurrentEditablePage = () => _dsPages[0];
      _mbSel = []; _mbSelAnn = []; _mbSelected = -1;
      _dsToolsTab('layers');
      let p = document.getElementById('dsToolsLayersBody');
      let rows = Array.from(p.children).filter(c => c.draggable);
      if (rows.length !== 3) throw new Error('expected 3 draggable rows, got ' + rows.length);
      if (rows[0].textContent.indexOf('Top') < 0 || rows[2].textContent.indexOf('Bottom') < 0) throw new Error('initial order wrong: ' + rows.map(r=>r.textContent).join(' | '));
      // Drag row 0 ("Top") down to position 2 (past "Bottom") — a real multi-step move in one drag.
      rows[0].ondragstart({ dataTransfer: { effectAllowed: '' } });
      rows[2].ondrop({ preventDefault(){} });
      p = document.getElementById('dsToolsLayersBody');   // refresh() rebuilt it
      rows = Array.from(p.children).filter(c => c.draggable);
      if (rows[2].textContent.indexOf('Top') < 0) throw new Error('drag reorder did not move the row: ' + rows.map(r=>r.textContent).join(' | '));
      const els = editorialContent.layoutPages[0].elements;
      const topEl = els.find(e => e.text === 'Top'), botEl = els.find(e => e.text === 'Bottom');
      if (!(botEl.z > topEl.z)) throw new Error('z ranks not reassigned after drag: top=' + topEl.z + ' bottom=' + botEl.z);
    });

    __check('Contacts editor grip uses the shared compass-arrow move icon (svgMove), not braille dots', () => {
      const S = window.__appSrc;
      if (S.indexOf("grip.innerHTML = svgMove;") < 0) throw new Error('contacts grip not using svgMove');
      if (S.indexOf("&#x2807;&#x2807;") >= 0) throw new Error('old braille-dot grip markup still present');
    });

    __check('new icon consts exist with the expected minimalist line-icon shape (source guard)', () => {
      if (typeof svgLock !== 'string' || svgLock.indexOf('svg-icon') < 0) throw new Error('svgLock missing/malformed');
      if (typeof svgUnlock !== 'string' || svgUnlock.indexOf('svg-icon') < 0) throw new Error('svgUnlock missing/malformed');
      if (typeof svgEye !== 'string' || svgEye.indexOf('svg-icon') < 0) throw new Error('svgEye missing/malformed');
      if (typeof svgEyeOff !== 'string' || svgEyeOff.indexOf('svg-icon') < 0) throw new Error('svgEyeOff missing/malformed');
    });

    __check('hide and lock still function correctly through the new icon buttons (regression)', () => {
      editorialContent.layoutPages = [{ id: 'pgH', type: 'moodboard', title: 'H', elements: [{ type: 'text', text: 'X', z: 1 }] }];
      editorialContent.annotations = {};
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => null;
      window._dsCurrentEditablePage = () => _dsPages[0];
      _mbSel = []; _mbSelAnn = []; _mbSelected = -1;
      _dsToolsTab('layers');
      let p = document.getElementById('dsToolsLayersBody');
      const hideBtn = Array.from(p.querySelectorAll('button')).find(b => b.title === 'Hide');
      hideBtn.onclick({ stopPropagation(){} });
      const el = editorialContent.layoutPages[0].elements[0];
      if (!el.hidden) throw new Error('hide toggle did not set hidden');
      p = document.getElementById('dsToolsLayersBody');
      const showBtn = Array.from(p.querySelectorAll('button')).find(b => b.title === 'Show');
      showBtn.onclick({ stopPropagation(){} });
      if (el.hidden) throw new Error('show toggle did not clear hidden');
      p = document.getElementById('dsToolsLayersBody');
      const lockBtn = Array.from(p.querySelectorAll('button')).find(b => b.title === 'Lock');
      lockBtn.onclick({ stopPropagation(){} });
      if (!el.locked) throw new Error('lock toggle did not set locked');
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
