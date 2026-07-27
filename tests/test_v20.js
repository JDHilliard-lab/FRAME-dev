const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:()=>({width:6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  // jsdom lacks innerText entirely — shim it to textContent for the harness.
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true });
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderRail=()=>{}; _dsRenderCenter=()=>{}; _dsRenderTools=()=>{}; _dsSyncToolbar=()=>{};
    renderMoodboardCanvas = () => {}; showInfoModal = () => {};

    __check('_listStripText strips bullets/numbers and heals doubled prefixes', () => {
      if (_listStripText('\\u2022 a\\n\\u2022 b', 'bullet') !== 'a\\nb') throw new Error('bullet strip failed');
      if (_listStripText('1. a\\n2. b', 'number') !== 'a\\nb') throw new Error('number strip failed');
      if (_listStripText('\\u2022 \\u2022 doubled', 'bullet') !== 'doubled') throw new Error('doubled not healed');
      if (_listStripText('plain', 'none') !== 'plain') throw new Error('none should passthrough');
    });

    __check('mb text edit round-trip never doubles list marks', () => {
      editorialContent.layoutPages = [{ id:'pgE', type:'moodboard', title:'E', elements:[{ type:'text', text:'a\\nb', listStyle:'bullet', x:0.1,y:0.1,w:0.3, size:0.03 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbTextEditing = false;
      const box = document.createElement('div'); document.body.appendChild(box);
      box.textContent = _listPrefixText('a\\nb', 'bullet');   // what the render shows
      _mbBeginTextEdit(box, 0);
      if (box.textContent !== 'a\\nb') throw new Error('edit did not switch to raw text: ' + JSON.stringify(box.textContent));
      box.textContent = 'a\\nb edited';
      box.oninput();
      if (_mbEls()[0].text !== 'a\\nb edited') throw new Error('save wrong: ' + _mbEls()[0].text);
      box.onblur();
      if (_mbEls()[0].text.indexOf('\\u2022') >= 0) throw new Error('bullet leaked into storage');
      // simulate a SECOND edit cycle on already-rendered content (the doubling repro)
      const box2 = document.createElement('div'); document.body.appendChild(box2);
      box2.textContent = _listPrefixText(_mbEls()[0].text, 'bullet');
      _mbTextEditing = false;
      _mbBeginTextEdit(box2, 0); box2.onblur();
      if (_mbEls()[0].text.indexOf('\\u2022') >= 0) throw new Error('doubling on second cycle');
    });

    __check('tabs are safe for the PDF: both drawers route through the rich-text engine, which never draws a raw tab', () => {
      const S = window.__appSrc;
      if (S.indexOf('ALWAYS through the rich-text engine, rich runs or plain') < 0) throw new Error('layout text drawer no longer unified — tab safety guarantee may be lost');
      if (S.indexOf('ALWAYS through the rich-text engine') < 0) throw new Error('annotation text drawer no longer unified — tab safety guarantee may be lost');
      // The actual behavioral guarantee (no raw tab ever reaches doc.text) is
      // exercised directly in test_wrapfix.js.
    });

    __check('mb PDF arrow honors tip none; addMoodboardArrow stores armed tip', () => {
      const S = window.__appSrc;
      if (S.indexOf("if (t.tip !== 'none') {   // Line tool: plain rule, no head") < 0) throw new Error('PDF head not gated');
      if (S.indexOf("_mbSegEl(Ax, Ay, Bx, By, col, wt, t.tip !== 'none', sel)") < 0) throw new Error('DOM head not gated');
      // behavioral: creation respects the armed default
      editorialContent.layoutPages = [{ id:'pgL', type:'moodboard', title:'L', elements:[] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCommit = () => {};
      _dsSetArrowDefault('tip', 'none');
      addMoodboardArrow();
      if (editorialContent.layoutPages[0].elements[0].tip !== 'none') throw new Error('line tip not stored: ' + JSON.stringify(editorialContent.layoutPages[0].elements[0]));
      _dsSetArrowDefault('tip', 'arrow');
      addMoodboardArrow();
      if (editorialContent.layoutPages[0].elements[1].tip !== 'arrow') throw new Error('arrow tip not restored');
    });

    __check('multi-annotation Delete removes all selected', () => {
      editorialContent.annotations = { 'layout:pgD': [{type:'text',text:'1'},{type:'text',text:'2'},{type:'image'},{type:'text',text:'3'}] };
      window._mbCurAnnList = () => ({ key:'layout:pgD', list: editorialContent.annotations['layout:pgD'] });
      _mbSelAnn = [0, 2]; _mbSel = []; _mbSelected = -1; _dsSelKey = null; _dsSelIdx = -1;
      _mbActiveCanvasId = 'moodboardCanvas';
      _dsAnnotKeydown({ key:'Delete', preventDefault(){}, ctrlKey:false, metaKey:false });
      const l = editorialContent.annotations['layout:pgD'];
      if (l.length !== 2 || l[0].text !== '2' || l[1].text !== '3') throw new Error('wrong survivors: ' + JSON.stringify(l));
      if (_mbSelAnn.length) throw new Error('selection not cleared');
    });

    __check('mixed copy captures both groups; one paste restores both', () => {
      editorialContent.layoutPages = [
        { id:'pgX', type:'moodboard', title:'X', elements:[{type:'image',x:0.1,y:0.1,w:0.2,h:0.2},{type:'text',text:'T',x:0.4,y:0.1,w:0.2,size:0.03}] },
        { id:'pgY', type:'moodboard', title:'Y', elements:[] }
      ];
      editorialContent.annotations = { 'layout:pgX': [{type:'text',text:'ANN',x:0.6,y:0.6,w:0.2}], 'layout:pgY': [] };
      const dX = { kind:'layout', page: editorialContent.layoutPages[0] };
      const dY = { kind:'layout', page: editorialContent.layoutPages[1] };
      _dsPages = [dX, dY]; _dsIndex = 0; _mbActiveCanvasId = 'dsLayoutCanvas';
      window._mbEls = () => (_dsPages[_dsIndex].kind === 'layout' ? _dsPages[_dsIndex].page.elements : []);
      window._mbCurAnnList = () => ({ key: _deckPageKey(_dsPages[_dsIndex]), list: editorialContent.annotations[_deckPageKey(_dsPages[_dsIndex])] });
      window._dsCurrentEditablePage = () => (_dsPages[_dsIndex].kind === 'layout' ? _dsPages[_dsIndex] : null);
      _mbSel = [0,1]; _mbSelAnn = [0]; _mbSelected = 1; _dsSelKey = null; _dsSelIdx = -1;
      if (!_dsCopySelection()) throw new Error('mixed copy failed');
      if (_dsClipboard.kind !== 'mixed' || _dsClipboard.mb.length !== 2 || _dsClipboard.ann.length !== 1) throw new Error('clipboard wrong: ' + JSON.stringify({k:_dsClipboard.kind, mb:(_dsClipboard.mb||[]).length, ann:(_dsClipboard.ann||[]).length}));
      _dsIndex = 1; _mbSel = []; _mbSelAnn = [];
      if (!_dsPasteClipboard()) throw new Error('mixed paste failed');
      if (editorialContent.layoutPages[1].elements.length !== 2) throw new Error('elements not pasted');
      if (editorialContent.annotations['layout:pgY'].length !== 1) throw new Error('annotations not pasted');
      // cross-page paste-in-place: exact coords
      if (Math.abs(editorialContent.layoutPages[1].elements[0].x - 0.1) > 1e-9) throw new Error('position not preserved');
    });

    __check('layers z normalization makes reorder work with tied z values', () => {
      const els = [{ type:'text', z:6 }, { type:'image', z:6 }, { type:'image', z:6 }];
      const sorted = [0,1,2];
      _dsNormalizeElZ(els, sorted);
      if (els[0].z !== 1 || els[1].z !== 2 || els[2].z !== 3) throw new Error('ranks wrong: ' + JSON.stringify(els.map(e2=>e2.z)));
      // simulate the panel's swap after normalize: move text (rank 1) above image (rank 2)
      const t = els[0], j = els[1]; const z2 = j.z; j.z = t.z; t.z = z2;
      if (!(els[0].z > els[1].z)) throw new Error('swap did not change order');
    });

    __check('shift-45 endpoint snap exists for horizontal/vertical lines (source guard)', () => {
      if (window.__appSrc.indexOf('snap to nearest 45') < 0) throw new Error('shift snap missing');
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
