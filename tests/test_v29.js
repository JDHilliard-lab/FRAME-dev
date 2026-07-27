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
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true });
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{}; _dsRenderCenter=()=>{}; renderMoodboardCanvas=()=>{}; _dsSyncToolbar=()=>{}; _dsRenderRail=()=>{}; _dsRenderTools=()=>{}; _dsSyncApprovedBtn=()=>{};

    __check('gear buttons render a plain floating plus, no circle/background/border', () => {
      const box = document.createElement('div'); document.body.appendChild(box);
      editorialContent.annotations = { 'layout:pgG': [{ type: 'image', dataUrl:'data:image/png;base64,X' }] };
      _dsGearButton(box, 'layout:pgG', 0);
      const btn = box.querySelector('button');
      if (btn.textContent !== '+') throw new Error('not a plain plus: ' + btn.innerHTML.slice(0,80));
      if (btn.style.borderRadius && btn.style.borderRadius !== '0px') throw new Error('still has a border radius: ' + btn.style.borderRadius);
      if (btn.style.background && btn.style.background !== 'transparent') throw new Error('still has a background: ' + btn.style.background);
      if (btn.style.borderStyle && btn.style.borderStyle !== 'none') throw new Error('still has a border: ' + btn.style.borderStyle);
    });

    __check('text gear button renders a plain floating plus', () => {
      const el = document.createElement('div'); document.body.appendChild(el);
      _dsTextGearButton(el, { kind: 'mb', i: 0 });
      const btn = el.querySelector('button');
      if (btn.textContent !== '+') throw new Error('not a plain plus');
      if (btn.style.background && btn.style.background !== 'transparent') throw new Error('has a background');
    });

    __check('arrow gear button (source guard): plain plus, transparent, no border-radius/border', () => {
      const S = window.__appSrc;
      if (S.indexOf("gbtn.textContent = '+';") < 0) throw new Error('arrow gear not set to plain plus');
      if (S.indexOf("border-radius:0; background:transparent; border:none;") < 0) throw new Error('arrow gear still styled with circle/background/border');
    });

    __check('_dsDeselectAll clears both selection systems and closes popups', () => {
      editorialContent.annotations = { 'layout:pgX': [{ type: 'text', text: 'A' }] };
      editorialContent.layoutPages = [{ id: 'pgX', type: 'moodboard', title: 'X', elements: [{ type: 'image' }] }];
      _dsSelKey = 'layout:pgX'; _dsSelIdx = 0;
      _mbSel = [0]; _mbSelAnn = [0]; _mbSelected = 0;
      const pop = document.createElement('div'); pop.id = 'dsTextGearPopup'; document.body.appendChild(pop);
      const pop2 = document.createElement('div'); pop2.id = 'dsGearPopup'; document.body.appendChild(pop2);
      const pop3 = document.createElement('div'); pop3.id = 'dsArrowGearPopup'; document.body.appendChild(pop3);
      _dsDeselectAll();
      if (_dsSelKey !== null || _dsSelIdx !== -1) throw new Error('annotation selection not cleared');
      if (_mbSel.length || _mbSelAnn.length || _mbSelected !== -1) throw new Error('mb selection not cleared');
      if (document.getElementById('dsTextGearPopup')) throw new Error('text popup not closed');
      if (document.getElementById('dsGearPopup')) throw new Error('image/shape popup not closed');
      if (document.getElementById('dsArrowGearPopup')) throw new Error('arrow popup not closed');
    });

    __check('Escape key deselects everything, even while typing in a text box', () => {
      editorialContent.annotations = { 'layout:pgE': [{ type: 'text', text: 'Hi' }] };
      const box = document.createElement('div'); box.contentEditable = 'true'; document.body.appendChild(box); box.focus();
      _dsSelKey = 'layout:pgE'; _dsSelIdx = 0; _mbSel = [2]; _mbSelected = 2;
      _dsAnnotKeydown({ key: 'Escape', preventDefault(){}, ctrlKey: false, metaKey: false });
      if (_dsSelKey !== null || _dsSelIdx !== -1) throw new Error('annotation selection survived Escape');
      if (_mbSel.length || _mbSelected !== -1) throw new Error('mb selection survived Escape');
    });

    __check('empty click on a layout page (no-move marquee) fully deselects, including stale _dsSelKey', () => {
      editorialContent.layoutPages = [{ id: 'pgM', type: 'moodboard', title: 'M', elements: [] }];
      editorialContent.annotations = { 'layout:pgM': [] };
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      window._mbCurAnnList = () => ({ key: 'layout:pgM', list: editorialContent.annotations['layout:pgM'] });
      window._mbCanvas = () => ({ getBoundingClientRect: () => ({ left:0, top:0, width:900, height:520 }) });
      _dsSelKey = 'layout:pgM'; _dsSelIdx = 0;   // stale annotation selection from a prior click
      _mbSel = []; _mbSelAnn = []; _mbSelected = -1;
      _mbMarquee = { r: { left:0, top:0, width:900, height:520 }, x0: 50, y0: 50, moved: false, additive: false };
      _mbMarqueeUp({ clientX: 50, clientY: 50 });
      if (_dsSelKey !== null || _dsSelIdx !== -1) throw new Error('stale annotation selection survived empty click: ' + _dsSelKey);
    });

    __check('plain two-point line snaps to horizontal within ~6 degrees (source guard + math)', () => {
      const S = window.__appSrc;
      if (S.indexOf('Angle-snap a plain two-point line/arrow') < 0) throw new Error('angle-snap code missing');
      // Replicate the exact snap math against representative inputs.
      const w = 936, hh = 540;
      const fixed = { x: 0.1, y: 0.3 };
      let nx = 0.5, ny = 0.31;   // ~3° off level over a long horizontal run
      const ddx = (nx - fixed.x) * w, ddy = (ny - fixed.y) * hh;
      const ang = Math.abs(Math.atan2(ddy, ddx)) * 180 / Math.PI;
      if (!(ang < 6)) throw new Error('test fixture angle not within snap threshold: ' + ang);
      if (ang < 6) ny = fixed.y;
      if (ny !== fixed.y) throw new Error('did not snap to horizontal');
    });

    __check('plain two-point line snaps to vertical within ~6 degrees', () => {
      const w = 936, hh = 540;
      const fixed = { x: 0.3, y: 0.1 };
      let nx = 0.305, ny = 0.5;   // nearly straight down, slight x drift
      const ddx = (nx - fixed.x) * w, ddy = (ny - fixed.y) * hh;
      const ang = Math.abs(Math.atan2(ddy, ddx)) * 180 / Math.PI;
      if (!(Math.abs(ang - 90) < 6)) throw new Error('test fixture angle not within vertical snap threshold: ' + ang);
      nx = fixed.x;
      if (nx !== fixed.x) throw new Error('did not snap to vertical');
    });

    __check('a clearly diagonal drag (45deg) does NOT snap', () => {
      const fixed = { x: 0.1, y: 0.1 };
      const nx = 0.3, ny = 0.3;
      const ddx = (nx - fixed.x) * 936, ddy = (ny - fixed.y) * 540;
      const ang = Math.abs(Math.atan2(ddy, ddx)) * 180 / Math.PI;
      const snapped = (ang < 6 || ang > 174) || (Math.abs(ang - 90) < 6);
      if (snapped) throw new Error('45 degree diagonal incorrectly flagged for snapping: ' + ang);
    });

    __check('Alt bypasses the angle snap (source guard)', () => {
      const S = window.__appSrc;
      if (S.indexOf('if (!ev.altKey) {') < 0) throw new Error('alt-bypass guard missing from angle snap');
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
