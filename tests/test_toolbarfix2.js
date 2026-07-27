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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderCenter = () => {}; _dsRenderRail = () => {}; _dsSyncToolbar = () => {}; renderMoodboardCanvas = () => {};

    __check('EXACT BUG REPRODUCTION: opening the text popup fresh (no edits yet) immediately hides the stale toolbar row', () => {
      // A stale mb element (45pt) sits selected \\u2014 exactly like Jordan's
      // screenshot showing 45 in the toolbar the instant the popup opened.
      editorialContent.layoutPages = [{ id: 'pgN', type: 'moodboard', title: 'N', elements: [{ type: 'text', text: 'New note', size: 45/540 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbSelected = 0;
      editorialContent.annotations = { 'layout:pgN': [{ type: 'text', text: 'New note', size: 24/540, leading: 28 }] };
      // Before opening: toolbar shows the stale mb element's size (this alone isn't the bug).
      _mbUpdateToolbar();
      let sv = document.getElementById('mbSizeVal');
      if (sv.textContent !== '45pt') throw new Error('fixture setup wrong: ' + sv.textContent);
      // Open the popup for a DIFFERENT target (the annotation) \\u2014 no edits made yet.
      _dsOpenTextGearPopup({ kind: 'ann', key: 'layout:pgN', i: 0 }, 100, 100);
      const tctl = document.getElementById('mbTextCtl');
      if (tctl.style.display !== 'none') throw new Error('toolbar still visible immediately after opening the popup (the exact reported bug): ' + tctl.style.display);
      _dsCloseTextGearPopup();
    });

    __check('closing the text popup immediately re-shows the toolbar for a real mb selection', () => {
      editorialContent.layoutPages = [{ id: 'pgN2', type: 'moodboard', title: 'N2', elements: [{ type: 'text', text: 'Hi', size: 30/540 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbSelected = 0;
      _dsOpenTextGearPopup({ kind: 'mb', i: 0 }, 100, 100);
      let tctl = document.getElementById('mbTextCtl');
      if (tctl.style.display !== 'none') throw new Error('popup did not suppress the toolbar on open');
      _dsCloseTextGearPopup();
      tctl = document.getElementById('mbTextCtl');
      if (tctl.style.display !== 'flex') throw new Error('toolbar did not reappear immediately after closing: ' + tctl.style.display);
    });

    __check('image/shape popup: same immediate suppress-on-open and restore-on-close', () => {
      editorialContent.annotations = { 'layout:pgI': [{ type: 'image', dataUrl: 'data:image/png;base64,X' }] };
      editorialContent.layoutPages = [{ id: 'pgI', type: 'moodboard', title: 'I', elements: [{ type: 'image' }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbSelected = 0;
      _dsOpenGearPopup('layout:pgI', 0, 100, 100);
      let ictl = document.getElementById('mbImgCtl');
      if (ictl.style.display !== 'none') throw new Error('image popup did not suppress toolbar on open');
      _dsCloseGearPopup();
      ictl = document.getElementById('mbImgCtl');
      if (ictl.style.display !== 'flex') throw new Error('image toolbar did not reappear after close: ' + ictl.style.display);
    });

    __check('arrow popup: same immediate suppress-on-open and restore-on-close', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'arrow', x1:0,y1:0,x2:1,y2:1 }] };
      editorialContent.layoutPages = [{ id: 'pgA', type: 'moodboard', title: 'A', elements: [{ type: 'arrow', color: '#9aa0a6', weight: 2 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbSelected = 0;
      _dsOpenArrowGearPopup('layout:pgA', 0, 100, 100);
      let actl = document.getElementById('mbArrowCtl');
      if (actl.style.display !== 'none') throw new Error('arrow popup did not suppress toolbar on open');
      _dsCloseArrowGearPopup();
      actl = document.getElementById('mbArrowCtl');
      if (actl.style.display !== 'flex') throw new Error('arrow toolbar did not reappear after close: ' + actl.style.display);
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
