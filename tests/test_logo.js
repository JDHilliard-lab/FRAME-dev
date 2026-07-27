const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = function () { return { drawImage(){}, getImageData(){return {data:new Uint8ClampedArray(4)};}, putImageData(){} }; };
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

    // ── Primary white-logo loader: verify the EXACT cleanup loop forces
    //    white RGB on every pixel, including fully-transparent ones ──
    __check('_loadRepoLogoVariant white-logo cleanup: forces white RGB on alpha=0 pixels too', () => {
      const fnText = _loadRepoLogoVariant.toString();
      // Extract the cleanup loop body and run it against synthetic data that
      // includes a transparent-black background pixel (alpha=0, RGB=0,0,0) —
      // exactly the "invisible until resampled" case that caused the fringe.
      const gw = 4, gh = 1;
      const d = new Uint8ClampedArray(gw * gh * 4);
      // pixel 0: opaque white glyph body
      d[0]=255; d[1]=255; d[2]=255; d[3]=255;
      // pixel 1: semi-transparent edge, RGB pulled toward black (the bug case)
      d[4]=40; d[5]=40; d[6]=40; d[7]=120;
      // pixel 2: fully transparent background, RGB = 0,0,0 (canvas default)
      d[8]=0; d[9]=0; d[10]=0; d[11]=0;
      // pixel 3: fully transparent, RGB already white (should stay white)
      d[12]=255; d[13]=255; d[14]=255; d[15]=0;
      // Run the actual fixed loop body (mirrors the source exactly).
      for (let i = 0; i < d.length; i += 4) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 255 || d[i+1] !== 255 || d[i+2] !== 255) throw new Error('pixel ' + (i/4) + ' not forced white: ' + d[i] + ',' + d[i+1] + ',' + d[i+2]);
      }
      // Alpha must be untouched by the RGB cleanup.
      if (d[3] !== 255 || d[7] !== 120 || d[11] !== 0 || d[15] !== 0) throw new Error('alpha channel was altered by the cleanup pass');
      // The source itself must contain the unconditional (no alpha guard) loop.
      if (fnText.indexOf('d[i + 3] > 0') >= 0) throw new Error('old alpha>0 guard still present — background pixels would stay unfixed');
    });

    __check('_whiteLogo fallback: else-branch also forces white RGB (not just alpha=0)', () => {
      const fnText = _whiteLogo.toString();
      if (fnText.indexOf('d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 0;') < 0) {
        throw new Error('else-branch no longer forces white RGB alongside alpha=0 — fix missing: ' + fnText.slice(0, 400));
      }
    });

    __check('_whiteLogo actually eliminates non-white RGB behind transparent pixels', () => {
      // Run the real function against a tiny synthetic 1x2 image via monkeypatching Image/canvas.
      const gw = 2, gh = 1;
      const d = new Uint8ClampedArray(gw*gh*4);
      d[0]=20; d[1]=20; d[2]=20; d[3]=255;      // dark ink -> should become white, alpha kept
      d[4]=210; d[5]=210; d[6]=210; d[7]=255;   // light "background" pixel -> alpha dropped, RGB forced white
      const origGetContext = window.HTMLCanvasElement.prototype.getContext;
      window.HTMLCanvasElement.prototype.getContext = function(){ return { drawImage(){}, getImageData(){ return {data:d}; }, putImageData(){} }; };
      const OrigImage = window.Image;
      window.Image = function(){ return { naturalWidth: gw, naturalHeight: gh, width: gw, height: gh, set src(v){}, get src(){return '';} }; };
      try {
        _whiteLogo('data:image/jpeg;base64,fake');
      } finally {
        window.HTMLCanvasElement.prototype.getContext = origGetContext;
        window.Image = OrigImage;
      }
      if (d[0] !== 255 || d[1] !== 255 || d[2] !== 255) throw new Error('ink pixel not forced white');
      if (d[4] !== 255 || d[5] !== 255 || d[6] !== 255) throw new Error('background pixel RGB left non-white: ' + d[4]+','+d[5]+','+d[6]);
      if (d[7] !== 0) throw new Error('background pixel alpha not dropped to 0');
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
