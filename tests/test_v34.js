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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderCenter = () => {}; _dsRenderRail = () => {}; _dsSyncToolbar = () => {};

    __check('default new arrow/line weight is now 0.5pt', () => {
      editorialContent.annotationDefaults = {};
      const d = _dsArrowDefaults();
      if (d.weight !== 0.5) throw new Error('default weight wrong: ' + d.weight);
    });

    __check('_dsShapeDefaultsFor uses the 0.5pt default for arrow, elbow, line, curve', () => {
      editorialContent.annotationDefaults = {};
      ['arrow', 'elbow', 'elbowRev', 'elbowPath', 'curve'].forEach(kind => {
        const d = _dsShapeDefaultsFor(kind);
        if (d.weight !== 0.5) throw new Error(kind + ' did not get the 0.5pt default: ' + d.weight);
      });
    });

    __check('an explicitly-set custom default weight still overrides 0.5pt (regression)', () => {
      editorialContent.annotationDefaults = { arrow: { weight: 3 } };
      const d = _dsArrowDefaults();
      if (d.weight !== 3) throw new Error('custom default not respected: ' + d.weight);
    });

    __check('creating a brand-new line via the armed-draw flow gets weight 0.5 by default', () => {
      editorialContent.annotationDefaults = {};
      editorialContent.annotations = { 'layout:pgA': [] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgA', title: 'A' } }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSelAnn = []; _dsArmedShape = 'arrow';
      const page = document.createElement('div'); document.body.appendChild(page);
      Object.defineProperty(page, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 936, height: 540 }) });
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const ov = page.querySelector('div[style*="crosshair"]');
      if (!ov) throw new Error('armed overlay not found');
      ov.onmousedown({ preventDefault(){}, clientX: 100, clientY: 100 });
      document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 200, clientY: 150 }));
      const arr = editorialContent.annotations['layout:pgA'];
      if (!arr.length) throw new Error('no arrow created');
      if (arr[0].weight !== 0.5) throw new Error('created arrow has wrong weight: ' + arr[0].weight);
      page.remove();
    });

    __check('gear button anchors at the START point of a simple 2-point arrow, offset left of it', () => {
      editorialContent.annotations = { 'layout:pgG': [{ type: 'arrow', x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.5, weight: 0.5 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgG', title: 'G' } }]; _dsIndex = 0;
      _dsSelKey = 'layout:pgG'; _dsSelIdx = 0; _mbSelAnn = [];
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const gbtn = Array.from(page.querySelectorAll('button')).find(b => (b.title||'').indexOf('Line settings') >= 0);
      if (!gbtn) throw new Error('gear button not found');
      const X1 = 0.2 * 936, Y1 = 0.3 * 540;
      const gLeft = parseFloat(gbtn.style.left), gTop = parseFloat(gbtn.style.top);
      if (Math.abs(gLeft - (X1 - 20)) > 0.5) throw new Error('gear not offset left of the start point: left=' + gLeft + ' expected=' + (X1-20));
      if (Math.abs(gTop - (Y1 - 16)) > 0.5) throw new Error('gear vertical offset wrong: top=' + gTop + ' expected=' + (Y1-16));
      // must NOT be at the midpoint or the end point
      const midX = (X1 + 0.6*936) / 2, endX = 0.6*936;
      if (Math.abs(gLeft - (midX - 20)) < 2) throw new Error('gear appears to still be at the midpoint');
      if (Math.abs(gLeft - (endX - 20)) < 2) throw new Error('gear appears to be at the end point instead of start');
      page.remove();
      _dsSelKey = null; _dsSelIdx = -1;
    });

    __check('gear button anchors at the FIRST waypoint for a multi-point line too', () => {
      editorialContent.annotations = { 'layout:pgM': [{ type: 'elbow', x1: 0.15, y1: 0.2, x2: 0.4, y2: 0.5, weight: 0.5, waypoints: [[0.4, 0.2]] }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgM', title: 'M' } }]; _dsIndex = 0;
      _dsSelKey = 'layout:pgM'; _dsSelIdx = 0; _mbSelAnn = [];
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const gbtn = Array.from(page.querySelectorAll('button')).find(b => (b.title||'').indexOf('Line settings') >= 0);
      if (!gbtn) throw new Error('gear button not found for multi-point line');
      const startX = 0.15 * 936;
      const gLeft = parseFloat(gbtn.style.left);
      if (Math.abs(gLeft - (startX - 20)) > 1.5) throw new Error('multi-point gear not at first waypoint: left=' + gLeft + ' expected near ' + (startX-20));
      page.remove();
      _dsSelKey = null; _dsSelIdx = -1;
    });

    __check('gear button repositions correctly after dragging the start endpoint (source guard: uses pts[0], not a cached value)', () => {
      const S = window.__appSrc;
      if (S.indexOf('gbtn.style.left = (pts[0][0] - 20)') < 0) throw new Error('start-point anchoring code missing');
      if (S.indexOf('const midI = Math.floor((pts.length - 1) / 2)') >= 0) throw new Error('old midpoint anchoring code still present');
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
