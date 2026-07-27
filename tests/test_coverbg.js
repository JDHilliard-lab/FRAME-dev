const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, moveTo(){}, lineTo(){}, arcTo(){}, closePath(){}, drawImage(){}, measureText:()=>({width:6}), scale(){}, fillRect(){}, fill(){}, stroke(){}, arc(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,COVERBG';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  window.Image = function () {
    const im = { onload: null, onerror: null, naturalWidth: 1600, naturalHeight: 900 };
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

    __check('source guard: cover-page export branch now paints the theme background before drawing elements', () => {
      const S = window.__appSrc;
      const idx = S.indexOf("if (cov && ((Array.isArray(cov.elements) && cov.elements.length) || (editorialContent.annotations && editorialContent.annotations['fixed:cover'] && editorialContent.annotations['fixed:cover'].length))) {");
      if (idx < 0) throw new Error('cover branch not found');
      const nearby = S.slice(idx, idx + 2000);
      if (nearby.indexOf('_applyPageTheme(doc,') < 0) throw new Error('background paint call missing from the elements-present cover branch');
      if (nearby.indexOf('_drawMoodboardPage(') < 0) throw new Error('expected _drawMoodboardPage call not found nearby');
      // background paint must come BEFORE the moodboard draw call
      const paintIdx = nearby.indexOf('_applyPageTheme(doc,');
      const drawIdx = nearby.indexOf('_drawMoodboardPage(');
      if (!(paintIdx < drawIdx)) throw new Error('background paint does not precede the element draw');
    });

    __check('source guard: slogan-page export branch has the identical fix', () => {
      const S = window.__appSrc;
      const idx = S.indexOf("if (sg && ((Array.isArray(sg.elements) && sg.elements.length) || (editorialContent.annotations && editorialContent.annotations['fixed:slogan'] && editorialContent.annotations['fixed:slogan'].length))) {");
      if (idx < 0) throw new Error('slogan branch not found');
      const nearby = S.slice(idx, idx + 2000);
      if (nearby.indexOf('_applyPageTheme(doc,') < 0) throw new Error('background paint call missing from the elements-present slogan branch');
      const paintIdx = nearby.indexOf('_applyPageTheme(doc,');
      const drawIdx = nearby.indexOf('_drawMoodboardPage(');
      if (!(paintIdx < drawIdx)) throw new Error('background paint does not precede the element draw');
    });

    __checkAsync('BEHAVIORAL: reproduces the exact bug scenario \\u2014 a cover WITH a title element AND a background image now paints the background before the title', async () => {
      // Exactly Jordan's setup: a cover page with elements (a title box) AND
      // a page-theme background image assigned.
      editorialContent.pageThemes = { 'fixed:cover': { image: 'data:image/jpeg;base64,RAWCOVERPHOTO' } };
      editorialContent.coverPage = { elements: [ { type: 'text', text: 'PROJECT X', x: 0.1, y: 0.4, w: 0.6, size: 0.06 } ] };

      const PW = 936, PH = 540, pageNum = 1, logos = {}, meta = { location: '', code: '', version: '' };
      const rec = new CanvasPdfRec(PW, PH);
      const ops = [];
      const origAddImage = rec.addImage.bind(rec);
      rec.addImage = (...args) => { ops.push({ t: 'addImage', args }); return origAddImage(...args); };
      const origRect = rec.rect.bind(rec);
      rec.rect = (...args) => { ops.push({ t: 'rect', args }); return origRect(...args); };
      const origText = rec.text.bind(rec);
      rec.text = (str, x, y, o) => { ops.push({ t: 'text', str }); return origText(str, x, y, o); };

      // Reproduce the EXACT sequence the fixed export code now runs.
      await _pageThemeBake('fixed:cover');
      const cov = editorialContent.coverPage;
      const stored0 = _pageThemes()['fixed:cover'] || {};
      _applyPageTheme(rec, 'fixed:cover', PW, PH, stored0._bakedImg || null);
      const src = cov.elements;
      const tiles = src.map(t => Object.assign({}, t, { _img: null }));
      _drawMoodboardPage(rec, logos, pageNum, meta, tiles, '', 'breaker');

      const bgOpIdx = ops.findIndex(o => o.t === 'addImage' && (o.args[0] || '').indexOf('COVERBG') >= 0);
      if (bgOpIdx < 0) throw new Error('background image was never drawn \\u2014 the exact bug reported: ' + JSON.stringify(ops.map(o=>o.t)));
      const titleOpIdx = ops.findIndex(o => o.t === 'text' && (o.str||'').indexOf('PROJECT X') >= 0);
      if (titleOpIdx < 0) throw new Error('title text never drawn');
      if (!(bgOpIdx < titleOpIdx)) throw new Error('background painted AFTER the title (would cover it): bg=' + bgOpIdx + ' title=' + titleOpIdx);
    });

    __checkAsync('BEHAVIORAL: an EMPTY cover (no elements) still paints the background exactly as before (regression)', async () => {
      editorialContent.pageThemes = { 'fixed:cover': { image: 'data:image/jpeg;base64,RAWCOVERPHOTO2' } };
      editorialContent.coverPage = { elements: [] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      const g = (id) => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
      const ops = [];
      const origAddImage = rec.addImage.bind(rec);
      rec.addImage = (...args) => { ops.push(args); return origAddImage(...args); };
      await _pageThemeBake('fixed:cover');
      _drawCoverPage(rec, {}, 1, { location: '', code: '', version: '' });
      const bgOp = ops.find(a => (a[0] || '').indexOf('COVERBG') >= 0);
      if (!bgOp) throw new Error('empty-cover background regressed: ' + JSON.stringify(ops.map(a => (a[0]||'').slice(0,30))));
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
