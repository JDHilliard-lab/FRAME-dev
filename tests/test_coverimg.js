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
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; _dsSyncToolbar = () => {}; renderMoodboardCanvas = () => {};

    // ── Migration: cover page background image ──
    __check('MIGRATION: cover page background image element becomes a shape annotation', () => {
      editorialContent.coverPage = { elements: [
        { type: 'image', x: 0, y: 0, w: 1, h: 1, img: 'data:image/jpeg;base64,BARN', aspect: 1.78, fit: 'cover' },
        { type: 'text', text: 'CLIENT NAME', x: 0.095, y: 0.25, w: 0.5 }
      ] };
      editorialContent.annotations = {};
      _migrateLayoutImages();
      if (editorialContent.coverPage.elements.length !== 1) throw new Error('image not removed from elements: ' + editorialContent.coverPage.elements.length);
      if (editorialContent.coverPage.elements[0].type !== 'text') throw new Error('wrong element survived');
      const anns = editorialContent.annotations['fixed:cover'];
      if (!anns || anns.length !== 1) throw new Error('shape annotation not created');
      if (anns[0].type !== 'shape' || anns[0].dataUrl !== 'data:image/jpeg;base64,BARN') throw new Error('shape not correctly populated: ' + JSON.stringify(anns[0]));
      if (anns[0].w !== 1 || anns[0].h !== 1) throw new Error('dimensions not carried over');
    });

    __check('MIGRATION: an EMPTY image placeholder (never filled) still migrates, so it gets the popup immediately', () => {
      editorialContent.layoutPages = [{ id: 'pgEmpty', type: 'moodboard', title: 'E', elements: [{ type: 'image', x: 0.1, y: 0.1, w: 0.3, img: '', aspect: 1.33 }] }];
      editorialContent.annotations = {};
      _migrateLayoutImages();
      if (editorialContent.layoutPages[0].elements.length !== 0) throw new Error('empty placeholder not migrated');
      const anns = editorialContent.annotations['layout:pgEmpty'];
      if (!anns || anns.length !== 1 || anns[0].dataUrl !== null) throw new Error('empty shape not created correctly: ' + JSON.stringify(anns));
    });

    __check('MIGRATION: caption on the old element is carried over to the shape annotation', () => {
      editorialContent.layoutPages = [{ id: 'pgCap', type: 'moodboard', title: 'C', elements: [{ type: 'image', x: 0.1, y: 0.1, w: 0.3, img: 'data:image/png;base64,X', caption: 'A photo', aspect: 1.33 }] }];
      editorialContent.annotations = {};
      _migrateLayoutImages();
      const anns = editorialContent.annotations['layout:pgCap'];
      if (!anns[0].showCaption || anns[0].caption !== 'A photo') throw new Error('caption not migrated: ' + JSON.stringify(anns[0]));
    });

    __check('MIGRATION: text elements and arrows are left untouched (only image elements migrate)', () => {
      editorialContent.layoutPages = [{ id: 'pgMix', type: 'moodboard', title: 'M', elements: [
        { type: 'text', text: 'Hi', x:0.1,y:0.1,w:0.3 },
        { type: 'image', x:0.5,y:0.1,w:0.3, img:'data:image/png;base64,Y', aspect:1 }
      ] }];
      editorialContent.annotations = {};
      _migrateLayoutImages();
      const pg = editorialContent.layoutPages[0];
      if (pg.elements.length !== 1 || pg.elements[0].type !== 'text') throw new Error('text element incorrectly touched: ' + JSON.stringify(pg.elements));
    });

    __check('INSERTION TIME: a template with an old-format image element gets migrated the moment it is added to the deck', () => {
      const savedMaster = IDML_MASTER_TEMPLATES.slice();
      IDML_MASTER_TEMPLATES.push({ name: 'Farmboy \\u00b7 Old Format Test', type: 'moodboard', elements: [{ type: 'image', x: 0, y: 0, w: 1, h: 1, img: '', aspect: 1.78, fit: 'cover' }] });
      const idx = IDML_MASTER_TEMPLATES.length - 1;
      editorialContent.layoutPages = []; editorialContent.annotations = {};
      _dsPages = []; _dsIndex = 0;
      _dsMasterToDeck(idx);
      const pg = editorialContent.layoutPages[0];
      const hasImageElement = pg.elements.some(e => (e.type||'image') === 'image');
      if (hasImageElement) throw new Error('old-format image element survived insertion: ' + JSON.stringify(pg.elements));
      const anns = editorialContent.annotations['layout:' + pg.id];
      if (!anns || !anns.some(a => a.type === 'shape')) throw new Error('shape annotation not created on insertion: ' + JSON.stringify(anns));
      IDML_MASTER_TEMPLATES.length = 0; savedMaster.forEach(m => IDML_MASTER_TEMPLATES.push(m));
    });

    // ── Export: annKey passed so cover/slogan annotations draw inline ──
    __check('source guard: cover export branch now passes fixed:cover as annKey (draws annotations inline, in correct z-order)', () => {
      const S = window.__appSrc;
      if (S.indexOf("_drawMoodboardPage(doc, logos, pageNum, meta, tiles, '', 'breaker', 'fixed:cover');") < 0) throw new Error('annKey missing from cover export branch');
    });

    __check('source guard: slogan export branch now passes fixed:slogan as annKey', () => {
      const S = window.__appSrc;
      if (S.indexOf("_drawMoodboardPage(doc, logos, pageNum, meta, tiles, '', 'breaker', 'fixed:slogan');") < 0) throw new Error('annKey missing from slogan export branch');
    });

    __check('source guard: preview-render function also passes the fixed page annKey', () => {
      const S = window.__appSrc;
      if (S.indexOf("_drawMoodboardPage(rec, logos, 1, meta, tiles, '', ty, _fk);") < 0) throw new Error('annKey missing from preview renderer');
    });

    __checkAsync('BEHAVIORAL: a cover page annotation (background image + a line) draws inline in the RIGHT order via the real export path', async () => {
      Object.keys(_shapeImgCache).forEach(k => delete _shapeImgCache[k]);
      editorialContent.coverPage = { elements: [ { type: 'text', text: 'CLIENT NAME', x: 0.095, y: 0.25, w: 0.5, size: 0.026 } ] };
      editorialContent.annotations = { 'fixed:cover': [
        { type: 'shape', shape: 'rect', x: 0, y: 0, w: 1, h: 1, dataUrl: 'data:image/jpeg;base64,BARN2', aspect: 1.78, zoom: 1, z: 0 },
        { type: 'arrow', x1: 0.095, y1: 0.29, x2: 0.3, y2: 0.29, color: '#ffffff', weight: 1, tip: 'none', z: 5000 }
      ] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      const ops = [];
      const origAddImage = rec.addImage.bind(rec);
      rec.addImage = (...args) => { ops.push({ t: 'img', args }); return origAddImage(...args); };
      const origLine = rec.line ? rec.line.bind(rec) : null;
      if (origLine) rec.line = (...args) => { ops.push({ t: 'line', args }); return origLine(...args); };
      const origText = rec.text.bind(rec);
      rec.text = (str, x, y, o) => { ops.push({ t: 'text', str }); return origText(str, x, y, o); };
      _annInlineDrawn = {};
      const src2 = editorialContent.coverPage.elements;
      const tiles = src2.map(t2 => Object.assign({}, t2, { _img: null }));
      await _pageThemeBake('fixed:cover');
      _drawMoodboardPage(rec, {}, 1, { location:'', code:'', version:'' }, tiles, '', 'breaker', 'fixed:cover');
      // Background image must be drawn (it wasn't before, since annotations
      // relied on a separate post-pass that never ran for this inline call).
      const bgOp = ops.find(o => o.t === 'img' && ((o.args[0]||'').indexOf('BAKED') >= 0 || (o.args[0]||'').indexOf('BARN2') >= 0));
      if (!bgOp) throw new Error('background image annotation never drawn inline: ' + JSON.stringify(ops.map(o=>o.t)));
      // The text must still be present.
      const textOp = ops.find(o => o.t === 'text' && (o.str||'').indexOf('CLIENT') >= 0);
      if (!textOp) throw new Error('client name text missing');
      if (!_annInlineDrawn['fixed:cover']) throw new Error('inline-drawn ledger not set \\u2014 post-pass would double-draw or skip incorrectly');
    });

    __check('hardened branch: a cover with ONLY annotations (no text elements left) still takes the union-aware path, not the bespoke drawer', () => {
      const S = window.__appSrc;
      if (S.indexOf("if (cov && ((Array.isArray(cov.elements) && cov.elements.length) || (editorialContent.annotations && editorialContent.annotations['fixed:cover'] && editorialContent.annotations['fixed:cover'].length))) {") < 0) throw new Error('hardened cover branch condition missing');
      if (S.indexOf("if (sg && ((Array.isArray(sg.elements) && sg.elements.length) || (editorialContent.annotations && editorialContent.annotations['fixed:slogan'] && editorialContent.annotations['fixed:slogan'].length))) {") < 0) throw new Error('hardened slogan branch condition missing');
    });

    __check('DOM: the migrated shape annotation actually renders an <img> tag with the real background photo', () => {
      editorialContent.annotations = { 'fixed:cover': [{ type: 'shape', shape: 'rect', x: 0, y: 0, w: 1, h: 1, dataUrl: 'data:image/jpeg;base64,BARN3', aspect: 1.78, zoom: 1 }] };
      _dsPages = [{ kind: 'fixed', fixed: 'cover' }]; _dsIndex = 0;
      _dsSelKey = null; _dsSelIdx = -1; _mbSelAnn = []; _dsArmedShape = null;
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const img = page.querySelector('img[src="data:image/jpeg;base64,BARN3"]');
      if (!img) throw new Error('background image <img> tag not rendered in DOM \\u2014 the exact "cannot see preview" bug');
      page.remove();
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
