const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ _f:'', set font(v){ this._f=v; }, get font(){ return this._f; }, measureText(s){ return { width: s.length * 6 }; }, scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => { const p2 = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message })); __chain = p2.then(() => {}); window.__asyncChecks.push(p2); };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{};

    __checkAsync('PDF: element with higher z paints ABOVE an annotation (interleaved order)', async () => {
      editorialContent.annotations = { 'layout:pgZ': [{ type: 'text', text: 'ANN-LOW', x: 0.1, y: 0.1, w: 0.3, z: 2 }] };
      const tiles = [{ type: 'text', text: 'EL-HIGH', x: 0.1, y: 0.2, w: 0.3, size: 0.03, z: 7 }];
      _annInlineDrawn = {};
      const rec = new CanvasPdfRec(936, 540);
      _curFooter = { text: 'dark' };
      await _drawMoodboardPage(rec, {}, 1, { location: '', code: '', version: '' }, tiles, '', 'moodboard', 'layout:pgZ');
      const texts = rec.ops.filter(o => o.t === 'text' && /ANN-LOW|EL-HIGH/.test(String(o.str)));
      if (texts.length !== 2) throw new Error('both not drawn: ' + JSON.stringify(texts.map(o=>o.str)));
      if (!(/ANN-LOW/.test(String(texts[0].str)) && /EL-HIGH/.test(String(texts[1].str)))) throw new Error('paint order wrong: ' + texts.map(o=>String(o.str)).join(','));
      if (!_annInlineDrawn['layout:pgZ']) throw new Error('inline ledger not set');
    });

    __checkAsync('PDF: annotation without z defaults to the FRONT (historical stacking)', async () => {
      editorialContent.annotations = { 'layout:pgF': [{ type: 'text', text: 'ANN-FRONT', x: 0.1, y: 0.1, w: 0.3 }] };
      const tiles = [{ type: 'text', text: 'EL-BASE', x: 0.1, y: 0.2, w: 0.3, size: 0.03, z: 7 }];
      _annInlineDrawn = {};
      const rec = new CanvasPdfRec(936, 540);
      await _drawMoodboardPage(rec, {}, 1, { location: '', code: '', version: '' }, tiles, '', 'moodboard', 'layout:pgF');
      const texts = rec.ops.filter(o => o.t === 'text' && /ANN-FRONT|EL-BASE/.test(String(o.str)));
      if (!(/EL-BASE/.test(String(texts[0].str)) && /ANN-FRONT/.test(String(texts[1].str)))) throw new Error('default front broken: ' + texts.map(o=>String(o.str)).join(','));
    });

    __check('post-pass skips inline-drawn keys but still draws other pages', () => {
      _annInlineDrawn = { 'layout:pgZ': 1 };
      editorialContent.annotations = { 'layout:pgZ': [{ type: 'text', text: 'X', x: 0.1, y: 0.1, w: 0.2 }], 'spec:S': [{ type: 'text', text: 'SPEC-ANN', x: 0.1, y: 0.1, w: 0.2 }] };
      const rec = new CanvasPdfRec(936, 540);
      _drawAnnotations(rec, 'layout:pgZ', 936, 540);
      if (rec.ops.some(o => o.t === 'text' && /(^|,)X(,|$)/.test(String(o.str)))) throw new Error('inline key redrawn');
      _drawAnnotations(rec, 'spec:S', 936, 540);
      if (!rec.ops.some(o => o.t === 'text' && /SPEC-ANN/.test(String(o.str)))) throw new Error('non-inline key not drawn');
      _annInlineDrawn = {};
    });

    __check('DOM: annotation nodes carry the shared z-index scale (default front)', () => {
      editorialContent.annotations = { 'layout:pgD': [{ type: 'text', text: 'A1', x: 0.1, y: 0.1, w: 0.2 }, { type: 'text', text: 'A2', x: 0.2, y: 0.2, w: 0.2, z: 3 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgD', title: 'D' } }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSelAnn = []; _dsArmedShape = null;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 900, 520);
      const nodes = Array.from(page.querySelectorAll('[data-ds-tgt]'));
      if (nodes.length !== 2) throw new Error('annotation nodes missing: ' + nodes.length);
      const zs = nodes.map(n => parseInt(n.style.zIndex, 10));
      if (zs.indexOf(5100) < 0) throw new Error('default-front z missing: ' + zs.join(','));
      if (zs.indexOf(103) < 0) throw new Error('explicit z missing: ' + zs.join(','));
      page.remove();
    });

    __check('unified layers panel: one list, front-first, drag moves element above annotation', () => {
      editorialContent.layoutPages = [{ id: 'pgU', type: 'moodboard', title: 'U', elements: [{ type: 'text', text: 'EL', x: 0.1, y: 0.1, w: 0.2, z: 1 }] }];
      editorialContent.annotations = { 'layout:pgU': [{ type: 'image', x: 0.3, y: 0.3, w: 0.2, z: 2 }] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => ({ key: 'layout:pgU', list: editorialContent.annotations['layout:pgU'] });
      window._dsCurrentEditablePage = () => _dsPages[0];
      window._dsRenderCenter = () => {}; window.renderMoodboardCanvas = () => {}; window._dsSyncToolbar = () => {};
      _mbSel = []; _mbSelAnn = []; _mbSelected = -1; _dsSelKey = null; _dsSelIdx = -1;
      _dsToolsTab('layers');
      let p = document.getElementById('dsToolsLayersBody');
      if ((p.textContent || '').indexOf('Layers') < 0) throw new Error('unified group header missing');
      if ((p.textContent || '').indexOf('Annotations (front)') >= 0) throw new Error('old split groups still present');
      // rows front-first: annotation (z2) first, element (z1) second
      const rows = Array.from(p.querySelectorAll('[draggable="true"]'));
      if (rows.length !== 2) throw new Error('row count wrong: ' + rows.length);
      // Drag the element row (position 1, back) up to position 0 (front),
      // above the annotation — replaces the old \u25b4 button interaction.
      rows[1].ondragstart({ dataTransfer: { effectAllowed: '' } });
      rows[0].ondrop({ preventDefault() {} });
      const el = editorialContent.layoutPages[0].elements[0];
      const an = editorialContent.annotations['layout:pgU'][0];
      if (!(el.z > an.z)) throw new Error('element not brought above annotation: ' + el.z + ' vs ' + an.z);
    });

    __check('Ctrl+] lifts a selected element above a default-front annotation', () => {
      editorialContent.layoutPages = [{ id: 'pgK', type: 'moodboard', title: 'K', elements: [{ type: 'text', text: 'EL', z: 1 }] }];
      editorialContent.annotations = { 'layout:pgK': [{ type: 'image', x: 0.3, y: 0.3, w: 0.2 }] };   // no z → front (5000)
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => ({ key: 'layout:pgK', list: editorialContent.annotations['layout:pgK'] });
      window.renderMoodboardCanvas = () => {}; window._dsRenderCenter = () => {};
      _mbActiveCanvasId = 'dsLayoutCanvas'; _mbSelected = 0; _mbSel = []; _mbSelAnn = []; _dsSelKey = null; _dsSelIdx = -1;
      _dsAnnotKeydown({ key: ']', ctrlKey: true, metaKey: false, preventDefault() {} });
      const el = editorialContent.layoutPages[0].elements[0];
      if (!(el.z > 5000)) throw new Error('element not lifted above front annotations: z=' + el.z);
      // and the reverse: select the annotation, send it behind the element
      _mbSelected = -1; _mbSelAnn = [0]; _mbActiveCanvasId = 'moodboardCanvas';
      _dsAnnotKeydown({ key: '[', ctrlKey: true, metaKey: false, preventDefault() {} });
      const an = editorialContent.annotations['layout:pgK'][0];
      if (!(an.z < el.z)) throw new Error('annotation not sent behind: ' + an.z + ' vs ' + el.z);
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
