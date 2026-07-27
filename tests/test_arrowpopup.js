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
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderCenter=()=>{}; _dsRenderRail=()=>{}; _dsSyncToolbar=()=>{}; renderMoodboardCanvas=()=>{};

    __check('arrow popup opens for an arrow annotation with all sections', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4, color: '#9aa0a6', weight: 1.2, tip: 'arrow', startCap: 'none' }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 100, 100);
      const pop = document.getElementById('dsArrowGearPopup');
      if (!pop) throw new Error('popup did not open');
      if ((pop.textContent||'').indexOf('Arrow settings') < 0) throw new Error('wrong header: ' + pop.textContent.slice(0,60));
      if ((pop.textContent||'').indexOf('End head') < 0) throw new Error('head section missing');
      if ((pop.textContent||'').indexOf('Start cap') < 0) throw new Error('start cap section missing');
      if ((pop.textContent||'').indexOf('Line ends') < 0) throw new Error('line ends section missing');
      _dsCloseArrowGearPopup();
    });

    __check('color swatches include white and black, and clicking one sets a.color', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4, color: '#9aa0a6' }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 100, 100);
      const pop = document.getElementById('dsArrowGearPopup');
      const swatches = Array.from(pop.querySelectorAll('button')).filter(b => b.title === '#000000' || b.title === '#ffffff');
      if (swatches.length !== 2) throw new Error('white/black swatches missing: ' + swatches.length);
      swatches.find(b => b.title === '#000000').onclick();
      const a = editorialContent.annotations['layout:pgA'][0];
      if (a.color !== '#000000') throw new Error('black swatch did not set color: ' + a.color);
      _dsCloseArrowGearPopup();
    });

    __check('header label reflects Line vs Arrow (tip none) and Multi-point for elbow', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', tip: 'none', x1:0,y1:0,x2:1,y2:1 }, { type: 'elbow', tip: 'arrow', pts: [{x:0,y:0},{x:1,y:1}] }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 10, 10);
      let pop = document.getElementById('dsArrowGearPopup');
      if ((pop.textContent||'').indexOf('Line settings') < 0) throw new Error('line label wrong: ' + pop.textContent.slice(0,40));
      _dsCloseArrowGearPopup();
      _dsOpenArrowGearPopup('layout:pgA', 1, 10, 10);
      pop = document.getElementById('dsArrowGearPopup');
      if ((pop.textContent||'').indexOf('Multi-point arrow settings') < 0) throw new Error('multipoint label wrong: ' + pop.textContent.slice(0,50));
      _dsCloseArrowGearPopup();
    });

    __check('weight stepper: buttons and typed value both update a.weight', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', weight: 2, x1:0,y1:0,x2:1,y2:1 }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 10, 10);
      let pop = document.getElementById('dsArrowGearPopup');
      const plus = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === '+');
      plus.onclick();
      let a = editorialContent.annotations['layout:pgA'][0];
      if (a.weight !== 2.5) throw new Error('plus button wrong: ' + a.weight);
      pop = document.getElementById('dsArrowGearPopup');   // refresh() reopened it
      const inp = pop.querySelector('input[type=number]');
      inp.value = '6'; inp.onchange();
      a = editorialContent.annotations['layout:pgA'][0];
      if (a.weight !== 6) throw new Error('typed weight wrong: ' + a.weight);
      _dsCloseArrowGearPopup();
    });

    __check('End head and Start cap toggles set the right fields', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', tip: 'arrow', startCap: 'none', x1:0,y1:0,x2:1,y2:1 }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 10, 10);
      let pop = document.getElementById('dsArrowGearPopup');
      const noneHead = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'None (line)');
      noneHead.onclick();
      let a = editorialContent.annotations['layout:pgA'][0];
      if (a.tip !== 'none') throw new Error('head toggle failed: ' + a.tip);
      pop = document.getElementById('dsArrowGearPopup');
      const dotCap = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'Dot');
      dotCap.onclick();
      a = editorialContent.annotations['layout:pgA'][0];
      if (a.startCap !== 'circle') throw new Error('start cap toggle failed: ' + a.startCap);
      _dsCloseArrowGearPopup();
    });

    __check('Line ends toggle sets a.lineCap (round/sharp)', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', x1:0,y1:0,x2:1,y2:1 }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 10, 10);
      let pop = document.getElementById('dsArrowGearPopup');
      const sharp = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'Sharp');
      sharp.onclick();
      const a = editorialContent.annotations['layout:pgA'][0];
      if (a.lineCap !== 'butt') throw new Error('sharp toggle failed: ' + a.lineCap);
      _dsCloseArrowGearPopup();
    });

    __check('outside click closes the popup; clicking inside does not', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', x1:0,y1:0,x2:1,y2:1 }] };
      _dsOpenArrowGearPopup('layout:pgA', 0, 10, 10);
      const pop = document.getElementById('dsArrowGearPopup');
      _dsArrowGearPopupOutside({ target: pop });
      if (!document.getElementById('dsArrowGearPopup')) throw new Error('closed on inside click');
      const outside = document.createElement('div'); document.body.appendChild(outside);
      _dsArrowGearPopupOutside({ target: outside });
      if (document.getElementById('dsArrowGearPopup')) throw new Error('did not close on outside click');
    });

    __check('DOM redraw applies a.lineCap to the polyline stroke-linecap/linejoin', () => {
      editorialContent.annotations = { 'layout:pgD': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, weight: 2, lineCap: 'butt' }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgD', title: 'D' } }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSelAnn = []; _dsArmedShape = null;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 900, 520);
      const poly = page.querySelector('polyline[stroke-linecap]');
      if (!poly) throw new Error('polyline not found');
      if (poly.getAttribute('stroke-linecap') !== 'butt') throw new Error('linecap not applied: ' + poly.getAttribute('stroke-linecap'));
      if (poly.getAttribute('stroke-linejoin') !== 'miter') throw new Error('linejoin not applied: ' + poly.getAttribute('stroke-linejoin'));
      page.remove();
    });

    __check('DOM redraw defaults to round when lineCap is unset (regression)', () => {
      editorialContent.annotations = { 'layout:pgR': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, weight: 2 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgR', title: 'R' } }]; _dsIndex = 0;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 900, 520);
      const poly = page.querySelector('polyline[stroke-linecap]');
      if (poly.getAttribute('stroke-linecap') !== 'round') throw new Error('default not round: ' + poly.getAttribute('stroke-linecap'));
      page.remove();
    });

    __check('gear button appears on a SELECTED arrow, anchored near the line', () => {
      editorialContent.annotations = { 'layout:pgG': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.1 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgG', title: 'G' } }]; _dsIndex = 0;
      _dsSelKey = 'layout:pgG'; _dsSelIdx = 0; _mbSelAnn = [];
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 900, 520);
      const gbtn = Array.from(page.querySelectorAll('button')).find(b => (b.title||'').indexOf('Line settings') >= 0);
      if (!gbtn) throw new Error('gear button not rendered when selected');
      page.remove();
      _dsSelKey = null; _dsSelIdx = -1;
    });

    __check('gear button absent when NOT selected', () => {
      editorialContent.annotations = { 'layout:pgN': [{ type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.1 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgN', title: 'N' } }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSelAnn = [];
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 900, 520);
      const gbtn = Array.from(page.querySelectorAll('button')).find(b => (b.title||'').indexOf('Line settings') >= 0);
      if (gbtn) throw new Error('gear button rendered while unselected');
      page.remove();
    });

    __check('PDF drawer honors a.lineCap (butt/sharp) and defaults to round', () => {
      const rec = new CanvasPdfRec(936, 540);
      let caps = [];
      const origSLC = rec.setLineCap.bind(rec);
      rec.setLineCap = (c) => { caps.push(c); origSLC(c); };
      _drawOneAnnotation(rec, { type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4, lineCap: 'butt' }, 936, 540);
      _drawOneAnnotation(rec, { type: 'arrow', x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 }, 936, 540);
      if (caps.indexOf('butt') < 0) throw new Error('butt cap not set: ' + caps.join(','));
      if (caps.indexOf('round') < 0) throw new Error('default round cap not set: ' + caps.join(','));
    });

    __check('shape stroke swatches include white and black', () => {
      editorialContent.annotations = { 'layout:pgS': [{ type: 'shape', shape: 'rect', dataUrl: 'data:image/png;base64,X', stroke: '#c0392b', strokeW: 1.5 }] };
      _dsOpenGearPopup('layout:pgS', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const titles = Array.from(pop.querySelectorAll('button')).map(b => b.title);
      if (titles.indexOf('Stroke #000000 (click again to remove)') < 0) throw new Error('black stroke swatch missing');
      if (titles.indexOf('Stroke #ffffff (click again to remove)') < 0) throw new Error('white stroke swatch missing');
      _dsCloseGearPopup();
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
