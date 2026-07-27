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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderCenter = () => {}; _dsRenderRail = () => {}; renderMoodboardCanvas = () => {};

    __check('EXACT BUG: dsMbSizeLbl now shows TRUE pt (was ×1000, causing 16pt to show as 30)', () => {
      editorialContent.layoutPages = [{ id: 'pgS', type: 'moodboard', title: 'S', elements: [{ type: 'text', text: 'Hi', size: 16/540 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ kind: 'layout' });
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbSelected = 0; _mbSel = []; _mbSelAnn = [];
      _dsSyncToolbar();
      const sl = document.getElementById('dsMbSizeLbl');
      if (sl.textContent !== '16pt') throw new Error('still wrong: ' + sl.textContent + ' (Jordan saw 30 here for a true 16pt box)');
    });

    __check('the old ×1000 formula would have produced exactly 30 for a 16pt box (confirms root cause)', () => {
      const wrong = Math.round((16/540) * 1000);
      if (wrong !== 30) throw new Error('sanity check failed: ' + wrong);
    });

    __check('a stale mb-element selection no longer shows through dsMbGroup while a settings popup is open', () => {
      editorialContent.layoutPages = [{ id: 'pgT', type: 'moodboard', title: 'T', elements: [{ type: 'text', text: 'Stale', size: 24/540 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ kind: 'layout' });
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbSelected = 0; _mbSel = []; _mbSelAnn = [];
      const pop = document.createElement('div'); pop.id = 'dsTextGearPopup'; document.body.appendChild(pop);
      _dsSyncToolbar();
      const mbGrp = document.getElementById('dsMbGroup');
      if (mbGrp.style.display !== 'none') throw new Error('dsMbGroup still visible with a popup open: ' + mbGrp.style.display);
      pop.remove();
    });

    __check('dsMbGroup reappears correctly once the popup closes, for a real mb selection', () => {
      editorialContent.layoutPages = [{ id: 'pgU', type: 'moodboard', title: 'U', elements: [{ type: 'text', text: 'Real', size: 30/540 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ kind: 'layout' });
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbSelected = 0; _mbSel = []; _mbSelAnn = [];
      _dsSyncToolbar();
      const mbGrp = document.getElementById('dsMbGroup');
      if (mbGrp.style.display !== 'inline-flex') throw new Error('regressed: should show with no popup open: ' + mbGrp.style.display);
      const sl = document.getElementById('dsMbSizeLbl');
      if (sl.textContent !== '30pt') throw new Error('value wrong on normal display: ' + sl.textContent);
    });

    __check('opening the text popup immediately hides dsMbGroup (no waiting for an edit) \\u2014 the exact scenario reported', () => {
      editorialContent.layoutPages = [{ id: 'pgV', type: 'moodboard', title: 'V', elements: [{ type: 'text', text: 'Stale2', size: 45/540 }] }];
      editorialContent.annotations = { 'layout:pgV': [{ type: 'text', text: 'Real target', size: 16/540, leading: 19 }] };
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._dsCurrentEditablePage = () => ({ kind: 'layout' });
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbSelected = 0; _mbSel = []; _mbSelAnn = [];
      _dsOpenTextGearPopup({ kind: 'ann', key: 'layout:pgV', i: 0 }, 100, 100);
      const mbGrp = document.getElementById('dsMbGroup');
      if (mbGrp.style.display !== 'none') throw new Error('dsMbGroup still showing immediately after popup opened: ' + mbGrp.style.display);
      const pop = document.getElementById('dsTextGearPopup');
      const sizeInput = pop.querySelector('input[type=number]');
      if (!sizeInput || sizeInput.value !== '16') throw new Error('popup does not show the expected 16pt, got: ' + (sizeInput && sizeInput.value));
      _dsCloseTextGearPopup();
      if (document.getElementById('dsMbGroup').style.display !== 'inline-flex') throw new Error('did not restore after close');
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
