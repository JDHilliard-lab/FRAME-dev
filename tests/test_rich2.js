const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ _f:'', set font(v){ this._f=v; }, get font(){ return this._f; }, measureText(s){ const m=/(\d+(?:\.\d+)?)px/.exec(this._f); const fs=m?parseFloat(m[1]):12; return { width: s.length * fs * 0.5 }; }, scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true });
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{};

    __check('stashed selection styles the range even after the live selection collapsed (real-browser blur case)', () => {
      const box = document.createElement('div'); box.dataset.dsTgt = 'mb:0'; document.body.appendChild(box);
      box.contentEditable = 'true';
      const a = { text: 'Hello World', size: 12/540 };
      _richSpansInto(box, a, true);
      // Simulate the real browser: the selection existed at mousedown (stashed)
      // but is GONE by click time.
      _ceSavedSel = { tgt: 'mb:0', start: 0, end: 5 };
      window.getSelection().removeAllRanges();
      const ranged = _popupApplyTextStyle(a, { bold: true }, 'mb:0');
      if (!ranged) throw new Error('stash fallback not used');
      if (!a.runs || !a.runs[0].bold || a.runs[0].text !== 'Hello') throw new Error('range apply wrong: ' + JSON.stringify(a.runs));
      box.remove(); _ceSavedSel = null;
    });

    __check('B/I toggle flips the RANGE state — un-bolding a bolded range works', () => {
      const a = { text: 'Hello World', runs: [{ text: 'Hello', bold: true }, { text: ' World' }] };
      // effective state at the range start is bold=true → toggle target false
      if (_runsStyleAt(a, 0, 'bold') !== true) throw new Error('effective read wrong');
      const box = document.createElement('div'); box.dataset.dsTgt = 'mb:1'; document.body.appendChild(box);
      box.contentEditable = 'true'; _richSpansInto(box, a, true);
      _ceSavedSel = { tgt: 'mb:1', start: 0, end: 5 };
      window.getSelection().removeAllRanges();
      _popupApplyTextStyle(a, { bold: !_runsStyleAt(a, 0, 'bold') }, 'mb:1');
      if (a.runs.length !== 1 && a.runs[0].bold) throw new Error('un-bold failed: ' + JSON.stringify(a.runs));
      box.remove(); _ceSavedSel = null;
    });

    __check('popup preserves selection: mousedown stashes and buttons preventDefault (source guards)', () => {
      const S = window.__appSrc;
      if (S.indexOf("pop.addEventListener('mousedown'") < 0) throw new Error('stash listener missing');
      if (S.indexOf("e2.preventDefault()") < 0) throw new Error('button preventDefault missing');
      if (S.indexOf('const editing = !!(tgtB && (tgtB.isContentEditable') < 0) throw new Error('edit-safe refresh missing');
      if (S.indexOf('stay in edit mode') < 0) throw new Error('blur guard missing');
    });

    __check('refresh skips canvas rebuild while editing (behavioral)', () => {
      // Build a live popup against an editing box; the mb canvas render must NOT run.
      editorialContent.layoutPages = [{ id:'pgR', type:'moodboard', title:'R', elements:[{ type:'text', text:'Hi', x:0.1,y:0.1,w:0.3, size:0.03 }] }];
      _dsPages = [{ kind:'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => null;
      _mbSel = []; _mbSelAnn = []; _mbSelected = 0;
      window._dsTextGearGetEl = () => editorialContent.layoutPages[0].elements[0];
      let canvasRenders = 0; window.renderMoodboardCanvas = () => { canvasRenders++; };
      window._dsSyncToolbar = () => {}; window._dsRenderRail = () => {}; window._dsRenderCenter = () => {};
      const box = document.createElement('div'); box.dataset.dsTgt = 'mb:0'; box.contentEditable = 'true'; document.body.appendChild(box);
      _dsOpenTextGearPopup({ kind: 'mb', i: 0 }, 100, 100);
      const pop = document.getElementById('dsTextGearPopup');
      // find the bold button and click it — editing box present → no canvas rebuild
      const bBtn = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'B');
      canvasRenders = 0;
      bBtn.onclick();
      if (canvasRenders !== 0) throw new Error('canvas rebuilt mid-edit (' + canvasRenders + ')');
      // exit edit mode → refresh does full rebuild again
      box.contentEditable = 'false';
      const pop2 = document.getElementById('dsTextGearPopup');
      const bBtn2 = Array.from(pop2.querySelectorAll('button')).find(b => b.textContent === 'B');
      canvasRenders = 0;
      bBtn2.onclick();
      if (canvasRenders < 1) throw new Error('canvas not rebuilt after edit ended');
      _dsCloseTextGearPopup(); box.remove();
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
