const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };

    editorialContent = editorialContent || {};
    scheduleAutosave = () => {};

    // Was: "infoModal z-index sits above the deck studio", comparing against
    // #deckStudioModal's inline z-index:10000. Deck Studio is a plain view in
    // .app-content now with NO z-index at all, so that comparison would read
    // parseInt(undefined) -> NaN. Same intent, expressed against what actually
    // stacks: the deck view must not create a stacking context (or its
    // position:fixed satellites would be trapped and clipped), and the info
    // modal must sit above the highest of those satellites.
    __check('infoModal markup z-index sits above everything the deck view can put on screen', () => {
      const im = document.getElementById('infoModal');
      const dv = document.getElementById('view-deck');
      if (!dv) throw new Error('#view-deck missing — Deck Studio is not a view');
      if (dv.style.zIndex) throw new Error('#view-deck has z-index ' + dv.style.zIndex + ' — it must not create a stacking context for its position:fixed children');
      const gen = document.getElementById('dsGenerateModal');
      const zg = parseInt(gen.style.zIndex, 10);
      if (!(zg > 0)) throw new Error('dsGenerateModal has no z-index: ' + gen.style.zIndex);
      const zi = parseInt(im.style.zIndex, 10);
      if (!(zi > zg)) throw new Error('infoModal z ' + zi + ' not above the deck generate modal z ' + zg);
      if (zi < 100010) throw new Error('infoModal z ' + zi + ' below floating panels (100001+)');
    });

    __check('showInfoModal forces topmost z-index at show time', () => {
      const im = document.getElementById('infoModal');
      im.style.zIndex = '9999';   // simulate stale/cached markup
      showInfoModal('T', 'B');
      if (im.style.zIndex !== '100010') throw new Error('zIndex not forced: ' + im.style.zIndex);
      if (im.style.display !== 'flex') throw new Error('modal not shown');
      im.style.display = 'none';
    });

    __check('showConfirmModal forces topmost z-index too', () => {
      const im = document.getElementById('infoModal');
      im.style.zIndex = '9999';
      showConfirmModal('T', 'B', 'Yes', 'No', () => {}, () => {});
      if (im.style.zIndex !== '100010') throw new Error('zIndex not forced: ' + im.style.zIndex);
      im.style.display = 'none';
    });

    __check('precheck: HEIC by mime and by extension', () => {
      let r = _imageFilePrecheck({ name: 'IMG_1234.HEIC', type: 'image/heic', size: 2000000 });
      if (!r || r.title.indexOf('HEIC') < 0) throw new Error('heic mime missed: ' + JSON.stringify(r));
      r = _imageFilePrecheck({ name: 'IMG_1234.heif', type: '', size: 2000000 });
      if (!r || r.title.indexOf('HEIC') < 0) throw new Error('heic extension missed');
      if (r.body.indexOf('JPG') < 0) throw new Error('no conversion guidance');
    });

    __check('precheck: non-image type explains formats; big file explains the limit', () => {
      let r = _imageFilePrecheck({ name: 'doc.pdf', type: 'application/pdf', size: 1000 });
      if (!r || r.title !== 'Not an image file') throw new Error('pdf not caught');
      if (r.body.indexOf('JPG') < 0 || r.body.indexOf('PNG') < 0) throw new Error('formats not listed');
      r = _imageFilePrecheck({ name: 'huge.jpg', type: 'image/jpeg', size: 41 * 1048576 });
      if (!r || r.title !== 'Image too large') throw new Error('oversize not caught');
      if (r.body.indexOf('40 MB') < 0) throw new Error('limit not named');
      if (r.body.indexOf('1100') < 0) throw new Error('downscale guidance missing');
    });

    __check('precheck: normal JPG/PNG pass; empty type attempts decode (passes precheck)', () => {
      if (_imageFilePrecheck({ name: 'a.jpg', type: 'image/jpeg', size: 500000 }) !== null) throw new Error('jpg rejected');
      if (_imageFilePrecheck({ name: 'b.png', type: 'image/png', size: 500000 }) !== null) throw new Error('png rejected');
      if (_imageFilePrecheck({ name: 'c.jpg', type: '', size: 500000 }) !== null) throw new Error('typeless file rejected at precheck');
    });

    __check('decode/read failure messages name the file, format, and size', () => {
      const f = { name: 'scan.tif', type: 'image/tiff', size: 3.2 * 1048576 };
      const d = _imageDecodeFailMsg(f);
      if (d.body.indexOf('scan.tif') < 0 || d.body.indexOf('TIFF') < 0 || d.body.indexOf('3.2 MB') < 0) throw new Error('decode msg incomplete: ' + d.body);
      const rr = _imageReadFailMsg(f);
      if (rr.body.indexOf('scan.tif') < 0) throw new Error('read msg incomplete');
    });

    __check('_dsHandleImageFile with a PDF shows the modal ABOVE the studio (end to end)', () => {
      _dsPages = [{ kind: 'spec', type: 'spec', row: { id: 'ART.001' }, _ovKey: 'ART.001' }]; _dsIndex = 0;
      const im = document.getElementById('infoModal');
      im.style.display = 'none'; im.style.zIndex = '9999';
      _dsHandleImageFile({ name: 'brief.pdf', type: 'application/pdf', size: 90000 });
      if (im.style.display !== 'flex') throw new Error('modal not shown');
      if (im.style.zIndex !== '100010') throw new Error('modal not topmost');
      if (document.getElementById('infoModalTitle').innerText !== 'Not an image file') throw new Error('wrong message: ' + document.getElementById('infoModalTitle').innerText);
      im.style.display = 'none';
    });

    __check('_mbDropImage and _dsShapeDropImage no longer fail silently', () => {
      const im = document.getElementById('infoModal');
      im.style.display = 'none';
      const fakeEvt = (f) => ({ preventDefault(){}, stopPropagation(){}, dataTransfer: { files: [f] } });
      _mbPage = () => ({ elements: [{ type: 'image' }] });
      _mbDropImage(fakeEvt({ name: 'x.heic', type: 'image/heic', size: 1000 }), 0);
      if (im.style.display !== 'flex') throw new Error('_mbDropImage stayed silent');
      im.style.display = 'none';
      editorialContent.annotations = { 'spec:ART.001': [{ type: 'shape' }] };
      _dsRenderCenter = () => {};
      _dsShapeDropImage(fakeEvt({ name: 'y.pdf', type: 'application/pdf', size: 1000 }), 'spec:ART.001', 0);
      if (im.style.display !== 'flex') throw new Error('_dsShapeDropImage stayed silent');
      im.style.display = 'none';
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
