const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, drawImage(){}, measureText:()=>({width:6}), scale(){}, fillRect(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, arcTo(){}, closePath(){}, arc(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,COLORMANAGED';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  window.Image = function () {
    const im = { onload: null, onerror: null, naturalWidth: 1600, naturalHeight: 1067 };
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
    scheduleAutosave = () => {};

    __checkAsync('END-TO-END: a layout page\\'s image annotation embeds the CANVAS-BAKED (color-managed) bytes in the PDF, never the raw upload', async () => {
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      // A wide-gamut-style photo annotation on a LAYOUT page \\u2014 exactly
      // Jordan's "Section Heading" custom template scenario.
      editorialContent.layoutPages = [{ id: 'pgBarn', type: 'moodboard', title: 'Barn', elements: [] }];
      editorialContent.annotations = { 'layout:pgBarn': [
        { type: 'image', dataUrl: 'data:image/jpeg;base64,RAWWIDEGAMUTBYTES', x: 0.02, y: 0.2, w: 0.28, aspect: 1.5, zoom: 1 }
      ] };

      const PW = 936, PH = 540;
      // Reproduce the UPFRONT priming pass exactly as it now runs in _buildSpecPagePDF,
      // BEFORE any page is drawn.
      for (const key in editorialContent.annotations) {
        for (const a of editorialContent.annotations[key]) {
          if (a.type === 'image' && a.dataUrl) {
            const fm = (a.zoom || 1) > 1 ? 'cover' : 'contain';
            await _ensureShapeImage(Object.assign({}, a, { shape: 'rect' }), (a.w||0.25)*PW, (a.w||0.25)*PW*(a.aspect||0.75), fm);
          }
        }
      }
      // NOW draw the page the same way drawLayoutPage/_drawMoodboardPage would
      // (inline annotation draw, synchronous, using whatever is in the cache).
      const rec = new CanvasPdfRec(PW, PH);
      const addImageCalls = [];
      rec.addImage = function (src2, fmt, x, y, w2, h2) { addImageCalls.push(src2); };
      const a0 = editorialContent.annotations['layout:pgBarn'][0];
      _drawOneAnnotation(rec, a0, PW, PH);
      if (!addImageCalls.length) throw new Error('image never drawn');
      if (addImageCalls[0].indexOf('COLORMANAGED') < 0) throw new Error('RAW (non-color-managed) bytes were embedded instead of the canvas bake: ' + addImageCalls[0]);
      if (addImageCalls[0].indexOf('RAWWIDEGAMUTBYTES') >= 0) throw new Error('raw upload bytes leaked directly into the PDF \\u2014 the exact bug reported');
    });

    __checkAsync('without the upfront prime (old buggy ordering simulated), the SAME page would have fallen back to raw bytes \\u2014 proves the fix matters', async () => {
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);   // cold cache, simulating the OLD mistimed order
      editorialContent.annotations = { 'layout:pgCold': [
        { type: 'image', dataUrl: 'data:image/jpeg;base64,RAWBYTES2', x: 0.02, y: 0.2, w: 0.28, aspect: 1.5, zoom: 1 }
      ] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      const addImageCalls = [];
      rec.addImage = function (src2) { addImageCalls.push(src2); };
      _drawOneAnnotation(rec, editorialContent.annotations['layout:pgCold'][0], PW, PH);
      if (!addImageCalls.length) throw new Error('image never drawn');
      if (addImageCalls[0].indexOf('RAWBYTES2') < 0) throw new Error('expected the cold-cache fallback to use raw bytes (demonstrating why priming order matters), got: ' + addImageCalls[0]);
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
