const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, moveTo(){}, lineTo(){}, arcTo(){}, closePath(){}, drawImage(){}, measureText:()=>({width:6}), scale(){}, fillRect(){}, fill(){}, stroke(){}, arc(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,BAKED';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  window.Image = function () {
    const im = { onload: null, onerror: null, naturalWidth: 400, naturalHeight: 300 };
    Object.defineProperty(im, 'src', { set() { Promise.resolve().then(() => { if (im.onload) im.onload(); }); } });
    return im;
  };
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => { const p2 = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message })); __chain = p2.then(() => {}); window.__asyncChecks.push(p2); };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderCenter = () => {}; _dsRenderRail = () => {}; _dsSyncToolbar = () => {}; renderMoodboardCanvas = () => {};

    // ── Snapping fix ──
    __check('snap fix: dense-grid competing anchors no longer steal the snap from the intended edge', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      const box = { x: (21.90 + 3) / 936, y: 0.3, w: 280 / 936, h: 220 / 540 };
      const sn = _mbSnapBox(box, { width: 936, height: 540 });
      const afterPx = (box.x + sn.dx) * 936;
      if (Math.abs(afterPx - 21.90) > 0.1) throw new Error('did not snap cleanly to the margin: ' + afterPx.toFixed(2));
    });

    __check('snap: grid mode still works with the new priority-order logic (regression)', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'grid', gridSize: 20 };
      const gx = 20 / 936;
      const box = { x: gx * 5 - 3 / 936, y: 0.5, w: 0.1, h: 0.08 };
      const sn = _mbSnapBox(box, { width: 936, height: 540 });
      if (Math.abs((box.x + sn.dx) - gx * 5) > 1e-9) throw new Error('grid snap regressed');
    });

    __check('snap: off mode never snaps (regression)', () => {
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'off' };
      const box = { x: 0.0234 + 1/936, y: 0.3, w: 0.1, h: 0.08 };
      const sn = _mbSnapBox(box, { width: 936, height: 540 });
      if (sn.dx !== 0 || sn.dy !== 0) throw new Error('off mode snapped anyway');
    });

    __check('snap: center-based snapping still works when no edge is near anything', () => {
      editorialContent.guidePref = { setId: 'g_center', show: true, snapMode: 'guides' };   // only a center guide at 0.5/0.5
      const box = { x: 0.5 - 0.1 + 0.002, y: 0.3, w: 0.2, h: 0.1 };   // center is near 0.5, edges are not
      const sn = _mbSnapBox(box, { width: 936, height: 540 });
      const centerAfter = box.x + sn.dx + box.w / 2;
      if (Math.abs(centerAfter - 0.5) > 1e-6) throw new Error('center anchor snap regressed: ' + centerAfter);
    });

    // ── Caption "Code" button extended to shapes ──
    __check('gear popup: Code caption button now appears for SHAPES too, not just plain images', () => {
      editorialContent.annotations = { 'layout:pgS': [{ type: 'shape', shape: 'rect', dataUrl: 'data:image/png;base64,X', showCaption: true, capSource: 'text', fileName: 'barn.jpg' }] };
      _dsOpenGearPopup('layout:pgS', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const codeBtn = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'Code');
      if (!codeBtn) throw new Error('Code button missing for a shape');
      if (codeBtn.disabled) throw new Error('Code button should be enabled (fileName present)');
      codeBtn.onclick();
      if (editorialContent.annotations['layout:pgS'][0].capSource !== 'filename') throw new Error('Code button did not set capSource');
      _dsCloseGearPopup();
    });

    __check('gear popup: Code button disabled without a known file name (regression)', () => {
      editorialContent.annotations = { 'layout:pgS2': [{ type: 'shape', shape: 'rect', dataUrl: 'data:image/png;base64,X', showCaption: true }] };
      _dsOpenGearPopup('layout:pgS2', 0, 10, 10);
      const pop = document.getElementById('dsGearPopup');
      const codeBtn = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'Code');
      if (!codeBtn.disabled) throw new Error('should be disabled without fileName');
      _dsCloseGearPopup();
    });

    // ── Sleeker handles ──
    __check('transform handles shrunk to 8px with a thinner border (source guard)', () => {
      const S = window.__appSrc;
      if (S.indexOf('width:12px; height:12px; background:#6a6aff; border:2px solid #fff') >= 0) throw new Error('old 12px handle style still present somewhere');
      const count8 = (S.match(/width:8px; height:8px; background:#6a6aff; border:1\\.5px solid #fff/g) || []).length;
      if (count8 < 6) throw new Error('expected at least 6 sleeker handle instances, found ' + count8);
    });

    __check('selection outlines thinned to 1.5px, layers-panel drop indicator untouched (regression)', () => {
      const S = window.__appSrc;
      if (S.indexOf("r.style.borderTop = '2px solid #6a6aff';") < 0) throw new Error('layers-panel drop indicator was incorrectly thinned');
      const count = (S.match(/'1\\.5px solid #6a6aff'/g) || []).length;
      if (count < 10) throw new Error('expected many thinned selection outlines, found ' + count);
    });

    __check('handles render correctly at the smaller size (behavioral)', () => {
      editorialContent.layoutPages = [{ id: 'pgH', type: 'moodboard', title: 'H', elements: [{ type: 'text', text: 'X', x:0.1,y:0.1,w:0.2, z:1 }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      const box = document.createElement('div'); document.body.appendChild(box);
      _mbHandles(box, 0, 'image');
      const handles = Array.from(box.children);
      if (!handles.length) throw new Error('no handles rendered');
      handles.forEach(h => { if (h.style.width !== '8px' || h.style.height !== '8px') throw new Error('handle not 8px: ' + h.style.width); });
    });

    // ── Corner radius ──
    __check('DOM: rectangle border-radius now reads a.radius (scaled), defaults to 3pt equivalent (preserves old look)', () => {
      editorialContent.annotations = { 'layout:pgR': [{ type: 'shape', shape: 'rect', x:0.1,y:0.1,w:0.3,h:0.3, fill:'#d8d8de' }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgR', title: 'R' } }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSelAnn = []; _dsArmedShape = null;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const box = page.firstElementChild;
      const expected = (3 * (936/936)) + 'px';
      if (box.style.borderRadius !== expected) throw new Error('default radius wrong: ' + box.style.borderRadius);
      page.remove();
    });

    __check('DOM: custom a.radius is honored and scales with page width', () => {
      editorialContent.annotations = { 'layout:pgR2': [{ type: 'shape', shape: 'rect', x:0.1,y:0.1,w:0.3,h:0.3, fill:'#d8d8de', radius: 20 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgR2', title: 'R2' } }]; _dsIndex = 0;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 468, 270);   // half-scale page
      const box = page.firstElementChild;
      if (box.style.borderRadius !== '10px') throw new Error('scaled radius wrong: ' + box.style.borderRadius);
      page.remove();
    });

    __check('DOM: ellipse still gets 50% regardless of a.radius', () => {
      editorialContent.annotations = { 'layout:pgE': [{ type: 'shape', shape: 'ellipse', x:0.1,y:0.1,w:0.3,h:0.3, fill:'#d8d8de', radius: 20 }] };
      _dsPages = [{ kind: 'layout', page: { id: 'pgE', title: 'E' } }]; _dsIndex = 0;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const box = page.firstElementChild;
      if (box.style.borderRadius !== '50%') throw new Error('ellipse radius broken: ' + box.style.borderRadius);
      page.remove();
    });

    __check('PDF solid-fill: custom radius passed to roundedRect, clamped to half the box', () => {
      const rec = new CanvasPdfRec(936, 540);
      let capturedArgs = null;
      rec.roundedRect = (x,y,w,h,rx,ry,style) => { capturedArgs = [rx,ry]; };
      _drawOneAnnotation(rec, { type: 'shape', shape: 'rect', x:0.1,y:0.1,w:0.1,h:0.1, fill:'#d8d8de', radius: 999 }, 936, 540);
      if (!capturedArgs) throw new Error('roundedRect never called');
      const expectedClamp = Math.min(999, (0.1*936)/2, (0.1*540)/2);
      if (Math.abs(capturedArgs[0] - expectedClamp) > 0.01) throw new Error('radius not clamped: ' + capturedArgs[0] + ' vs ' + expectedClamp);
    });

    __checkAsync('PDF canvas bake: corner radius clips the image (rounded rect path drawn)', async () => {
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      const a = { type: 'shape', shape: 'rect', dataUrl: 'data:image/jpeg;base64,X', radius: 20, zoom: 1, fit: 'cover' };
      let arcToCalls = 0;
      const origCtx = window.HTMLCanvasElement.prototype.getContext;
      window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, moveTo(){}, lineTo(){}, arcTo(){ arcToCalls++; }, closePath(){}, drawImage(){}, fillRect(){}, fill(){}, stroke(){}, arc(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){} });
      await _ensureShapeImage(a, 100, 100);
      window.HTMLCanvasElement.prototype.getContext = origCtx;
      if (arcToCalls !== 4) throw new Error('expected 4 rounded-corner arcs, got ' + arcToCalls);
    });

    __checkAsync('PDF canvas bake: radius 0 draws no rounded path (plain rect, no clip needed)', async () => {
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      const a = { type: 'shape', shape: 'rect', dataUrl: 'data:image/jpeg;base64,Y', radius: 0, zoom: 1, fit: 'cover' };
      let arcToCalls = 0;
      const origCtx = window.HTMLCanvasElement.prototype.getContext;
      window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, moveTo(){}, lineTo(){}, arcTo(){ arcToCalls++; }, closePath(){}, drawImage(){}, fillRect(){}, fill(){}, stroke(){}, arc(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){} });
      await _ensureShapeImage(a, 100, 100);
      window.HTMLCanvasElement.prototype.getContext = origCtx;
      if (arcToCalls !== 0) throw new Error('radius 0 should skip the rounded path, got ' + arcToCalls + ' arcs');
    });

    // ── Popup corner-radius control ──
    __check('gear popup: corner-radius stepper appears for rectangles, not ellipses', () => {
      editorialContent.annotations = {
        'layout:pgCR1': [{ type: 'shape', shape: 'rect', fill: '#d8d8de', radius: 5 }],
        'layout:pgCR2': [{ type: 'shape', shape: 'ellipse', fill: '#d8d8de' }]
      };
      _dsOpenGearPopup('layout:pgCR1', 0, 10, 10);
      let pop = document.getElementById('dsGearPopup');
      if ((pop.textContent||'').indexOf('Corner radius') < 0) throw new Error('radius control missing for rect');
      _dsCloseGearPopup();
      _dsOpenGearPopup('layout:pgCR2', 0, 10, 10);
      pop = document.getElementById('dsGearPopup');
      if ((pop.textContent||'').indexOf('Corner radius') >= 0) throw new Error('radius control should not show for ellipse');
      _dsCloseGearPopup();
    });

    __check('gear popup: radius stepper buttons and typed value both update a.radius', () => {
      editorialContent.annotations = { 'layout:pgCR3': [{ type: 'shape', shape: 'rect', fill: '#d8d8de', radius: 10 }] };
      _dsOpenGearPopup('layout:pgCR3', 0, 10, 10);
      let pop = document.getElementById('dsGearPopup');
      const plus = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === '+' && b.parentElement.textContent.indexOf('pt') >= 0);
      plus.onclick();
      let a = editorialContent.annotations['layout:pgCR3'][0];
      if (a.radius !== 12) throw new Error('plus button wrong: ' + a.radius);
      pop = document.getElementById('dsGearPopup');
      const pill = Array.from(pop.querySelectorAll('button')).find(b => b.textContent === 'Pill');
      pill.onclick();
      a = editorialContent.annotations['layout:pgCR3'][0];
      if (a.radius !== 999) throw new Error('pill button wrong: ' + a.radius);
      _dsCloseGearPopup();
    });

    // ── Yellow drag handle ──
    __check('yellow corner-radius handle renders for rectangles, not ellipses, positioned by current radius', () => {
      editorialContent.layoutPages = [{ id: 'pgY', type: 'moodboard', title: 'Y', elements: [] }];
      const box = document.createElement('div'); document.body.appendChild(box);
      _dsAnnHandles(box, { type: 'shape', shape: 'rect', w: 0.3, h: 0.2, radius: 20 }, 936, 540);
      const yellow = Array.from(box.children).find(c => c.style.background === 'rgb(245, 197, 24)');
      if (!yellow) throw new Error('yellow handle not found');
      const expectedInset = Math.min(20 * (936/936), 0.3*936/2, 0.2*540/2) - 4;
      if (Math.abs(parseFloat(yellow.style.right) - expectedInset) > 0.01) throw new Error('handle not positioned by radius: ' + yellow.style.right);

      const box2 = document.createElement('div'); document.body.appendChild(box2);
      _dsAnnHandles(box2, { type: 'shape', shape: 'ellipse', w: 0.3, h: 0.2, radius: 20 }, 936, 540);
      const yellow2 = Array.from(box2.children).find(c => c.style.background === 'rgb(245, 197, 24)');
      if (yellow2) throw new Error('yellow handle should not render for ellipse');
    });

    __check('dragging the yellow handle updates a.radius live', () => {
      const a = { type: 'shape', shape: 'rect', w: 0.3, h: 0.2, radius: 10 };
      const box = document.createElement('div'); document.body.appendChild(box);
      _dsAnnHandles(box, a, 936, 540);
      const yellow = Array.from(box.children).find(c => c.style.background === 'rgb(245, 197, 24)');
      yellow.onmousedown({ clientX: 500, clientY: 500, preventDefault(){}, stopPropagation(){} });
      // Drag further INTO the box (down-right from the handle's resting spot near top-right)
      // by moving up-left on screen relative to the corner, which the handler
      // interprets as "away from the corner" -> larger radius.
      document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 470, clientY: 530 }));
      if (!(a.radius > 10)) throw new Error('radius did not grow on drag: ' + a.radius);
    });
  `;
  try { window.__appSrc = JSON.stringify(src); window.eval('window.__appSrc = ' + window.__appSrc + ';\n' + src + '\n' + testBlock); }
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
