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

    // Reproduce the EXACT bug: a stale mb-element selection (size ~19pt) sits
    // around while a DIFFERENT box (10pt) is being edited via the popup.
    __check('BUG REPRODUCTION: without the fix, the legacy toolbar would show a stale/different size than the popup', () => {
      _mbEls = () => [{ type: 'text', text: 'Stale mb element', size: 19/540 }];   // ~19pt, matches the report
      _mbSelected = 0;   // stale selection left over from earlier
      _mbUpdateToolbar();
      const sv = document.getElementById('mbSizeVal');
      // Confirms the underlying data WOULD show 19pt if nothing suppressed it —
      // i.e. this really is the root cause, not a coincidence.
      if (sv.textContent !== '19pt') throw new Error('fixture did not reproduce the stale 19pt readout: ' + sv.textContent);
    });

    __check('FIX: legacy toolbar row hides itself while the text-settings popup is open, even with a stale mb selection', () => {
      _mbEls = () => [{ type: 'text', text: 'Stale mb element', size: 19/540 }];
      _mbSelected = 0;
      const pop = document.createElement('div'); pop.id = 'dsTextGearPopup'; document.body.appendChild(pop);
      _mbUpdateToolbar();
      const tctl = document.getElementById('mbTextCtl');
      if (tctl.style.display !== 'none') throw new Error('toolbar row still visible with the popup open: ' + tctl.style.display);
      pop.remove();
    });

    __check('toolbar row still shows normally when NO popup is open (regression)', () => {
      _mbEls = () => [{ type: 'text', text: 'A real selection', size: 24/540 }];
      _mbSelected = 0;
      _mbUpdateToolbar();
      const tctl = document.getElementById('mbTextCtl');
      if (tctl.style.display !== 'flex') throw new Error('toolbar row incorrectly hidden with no popup open: ' + tctl.style.display);
      const sv = document.getElementById('mbSizeVal');
      if (sv.textContent !== '24pt') throw new Error('normal readout broken: ' + sv.textContent);
    });

    __check('arrow and image toolbar rows ALSO suppress while any settings popup is open', () => {
      _mbEls = () => [{ type: 'arrow', color: '#9aa0a6', weight: 2 }];
      _mbSelected = 0;
      const pop = document.createElement('div'); pop.id = 'dsGearPopup'; document.body.appendChild(pop);
      _mbUpdateToolbar();
      const actl = document.getElementById('mbArrowCtl');
      if (actl.style.display !== 'none') throw new Error('arrow row still visible with a popup open: ' + actl.style.display);
      pop.remove();
    });

    __check('arrow gear popup (dsArrowGearPopup) also triggers suppression', () => {
      _mbEls = () => [{ type: 'image' }];
      _mbSelected = 0;
      const pop = document.createElement('div'); pop.id = 'dsArrowGearPopup'; document.body.appendChild(pop);
      _mbUpdateToolbar();
      const ictl = document.getElementById('mbImgCtl');
      if (ictl.style.display !== 'none') throw new Error('image row still visible with arrow popup open: ' + ictl.style.display);
      pop.remove();
    });

    __check('no selection at all: toolbar rows stay hidden regardless of popup state (regression)', () => {
      _mbEls = () => [];
      _mbSelected = -1;
      _mbUpdateToolbar();
      const tctl = document.getElementById('mbTextCtl');
      if (tctl.style.display !== 'none') throw new Error('should be hidden with nothing selected: ' + tctl.style.display);
    });

    __check('default new-line weight is still 0.5pt (Jordan re-confirmed this) \\u2014 unchanged, still correct', () => {
      editorialContent.annotationDefaults = {};
      const d = _dsArrowDefaults();
      if (d.weight !== 0.5) throw new Error('default weight regressed: ' + d.weight);
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
