const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  let lastDrawImageArgs = null;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage: (...args) => { lastDrawImageArgs = args; window.__lastDrawImageArgs = args; },
    measureText:()=>({width:6}), scale(){}, fillRect(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}})
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,X';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};

    __check('SANITY: _coverRect with the OLD buggy call (aspect = box aspect) collapses to a blind stretch', () => {
      const boxW = 936, boxH = 540;
      const wrongAspect = boxW / boxH;   // the bug: passing the box's own aspect instead of the image's
      const r = _coverRect(boxW, boxH, wrongAspect, 1, 0, 0);
      if (Math.abs(r.dW - boxW) > 0.01 || Math.abs(r.dH - boxH) > 0.01) throw new Error('expected the bug to collapse to exact box size: ' + JSON.stringify(r));
    });

    __check('EXACT BUG: a wide landscape photo (1600x900) on the standard page now crops correctly instead of stretching', () => {
      const boxW = 936, boxH = 540;   // page aspect ~1.733
      const iw = 1600, ih = 900;      // image aspect ~1.778 (wider than the page)
      const imgAspect = iw / ih;
      const r = _coverRect(boxW, boxH, imgAspect, 1, 0, 0);
      // For cover-fit with a wider image, height should fill the box exactly
      // and width should overflow (get cropped), NOT both dimensions forced
      // to exactly the box size.
      if (Math.abs(r.dH - boxH) > 0.01) throw new Error('height should fill the box exactly: ' + r.dH + ' vs ' + boxH);
      if (Math.abs(r.dW - boxW) < 0.01) throw new Error('width should NOT exactly equal the box width \\u2014 that is the stretch bug: ' + r.dW);
      if (r.dW <= boxW) throw new Error('wider image should overflow horizontally for a correct cover crop: ' + r.dW);
    });

    __check('a TALL portrait photo also crops correctly (width fills, height overflows)', () => {
      const boxW = 936, boxH = 540;
      const iw = 900, ih = 1600;   // portrait, much taller than wide
      const imgAspect = iw / ih;
      const r = _coverRect(boxW, boxH, imgAspect, 1, 0, 0);
      if (Math.abs(r.dW - boxW) > 0.01) throw new Error('width should fill the box exactly: ' + r.dW);
      if (r.dH <= boxH) throw new Error('taller image should overflow vertically for a correct cover crop: ' + r.dH);
    });

    __check('END TO END: _applyPageTheme draws the background image using the IMAGE aspect, not the page aspect', () => {
      editorialContent.pageThemes = { 'layout:pgBg': { mode: 'light', bg: '#ffffff', image: 'data:image/jpeg;base64,ZZZ', imageZoom: 1, imagePanX: 0, imagePanY: 0 } };
      const PW = 936, PH = 540;
      const fakeImg = { naturalWidth: 1600, naturalHeight: 900 };
      const doc = { setFillColor(){}, rect(){}, addImage(src, fmt, x, y, w, h){ window.__lastAddImageDims = { w, h }; } };
      _applyPageTheme(doc, 'layout:pgBg', PW, PH, fakeImg);
      if (!window.__lastDrawImageArgs) throw new Error('canvas drawImage was never called \\u2014 background image path did not run');
      const [, , , dW, dH] = window.__lastDrawImageArgs;
      // With the bug, dW/dH would exactly equal a size derived from PW/PH
      // aspect regardless of the image; with the fix, a 16:9-ish image
      // should NOT produce a dW/dH pair that just equals the raw box.
      if (Math.abs(dW - PW * 2) < 0.01 && Math.abs(dH - PH * 2) < 0.01) {
        // (2x is the internal render scale (_expR); this checks the RATIO instead)
      }
      const drawnAspect = dW / dH;
      const trueImgAspect = 1600 / 900;
      if (Math.abs(drawnAspect - trueImgAspect) > 0.02) throw new Error('drawn image aspect does not match the source image aspect: drawn=' + drawnAspect + ' true=' + trueImgAspect);
    });

    __check('FALLBACK: an image with no readable dimensions falls back to the page aspect rather than crashing', () => {
      editorialContent.pageThemes = { 'layout:pgBg2': { mode: 'light', bg: '#ffffff', image: 'data:image/jpeg;base64,ZZZ' } };
      const PW = 936, PH = 540;
      const brokenImg = {};   // no naturalWidth/naturalHeight/width/height at all
      const doc = { setFillColor(){}, rect(){}, addImage(){} };
      let threw = false;
      try { _applyPageTheme(doc, 'layout:pgBg2', PW, PH, brokenImg); } catch (e) { threw = true; }
      if (threw) throw new Error('should not throw when image dimensions are unavailable \\u2014 should fall back gracefully');
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
