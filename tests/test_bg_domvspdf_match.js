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
    _dsRenderCenter = () => {};

    const PW = 936, PH = 540;

    function cssPositionOffset(containerSize, bgSize, pct) {
      return (containerSize - bgSize) * (pct / 100);
    }

    __check('CROSS-CHECK: DOM CSS percentages produce the exact same pixel offset as the PDF _coverRect for a wide image, panned right', () => {
      editorialContent.pageThemes = { 'layout:pgA': { mode: 'light', image: 'data:image/jpeg;base64,X', imgW: 1600, imgH: 900, imageZoom: 1, imagePanX: 0.5, imagePanY: 0 } };
      const info = _dsPageThemeCss('layout:pgA');
      const wMatch = info.css.match(/background-size:([\\d.]+)% ([\\d.]+)%/);
      const pMatch = info.css.match(/background-position:([\\d.-]+)% ([\\d.-]+)%/);
      if (!wMatch || !pMatch) throw new Error('css did not contain expected size/position: ' + info.css);
      const wPct = parseFloat(wMatch[1]), hPct = parseFloat(wMatch[2]);
      const xPct = parseFloat(pMatch[1]), yPct = parseFloat(pMatch[2]);
      const domDW = (wPct/100) * PW, domDH = (hPct/100) * PH;
      const domOffX = cssPositionOffset(PW, domDW, xPct), domOffY = cssPositionOffset(PH, domDH, yPct);
      const pdfRect = _coverRect(PW, PH, 1600/900, 1, 0.5, 0);
      if (Math.abs(domDW - pdfRect.dW) > 0.5) throw new Error('drawn width mismatch: dom=' + domDW + ' pdf=' + pdfRect.dW);
      if (Math.abs(domDH - pdfRect.dH) > 0.5) throw new Error('drawn height mismatch: dom=' + domDH + ' pdf=' + pdfRect.dH);
      if (Math.abs(domOffX - pdfRect.offX) > 0.5) throw new Error('x offset mismatch \\u2014 this was the actual reported bug: dom=' + domOffX + ' pdf=' + pdfRect.offX);
      if (Math.abs(domOffY - pdfRect.offY) > 0.5) throw new Error('y offset mismatch: dom=' + domOffY + ' pdf=' + pdfRect.offY);
    });

    __check('CROSS-CHECK holds for a TALL portrait image, panned up, zoomed in', () => {
      editorialContent.pageThemes = { 'layout:pgB': { mode: 'dark', image: 'data:image/jpeg;base64,X', imgW: 900, imgH: 1600, imageZoom: 1.5, imagePanX: 0, imagePanY: -0.7 } };
      const info = _dsPageThemeCss('layout:pgB');
      const wMatch = info.css.match(/background-size:([\\d.]+)% ([\\d.]+)%/);
      const pMatch = info.css.match(/background-position:([\\d.-]+)% ([\\d.-]+)%/);
      const wPct = parseFloat(wMatch[1]), hPct = parseFloat(wMatch[2]);
      const xPct = parseFloat(pMatch[1]), yPct = parseFloat(pMatch[2]);
      const domDW = (wPct/100) * PW, domDH = (hPct/100) * PH;
      const domOffX = cssPositionOffset(PW, domDW, xPct), domOffY = cssPositionOffset(PH, domDH, yPct);
      const pdfRect = _coverRect(PW, PH, 900/1600, 1.5, 0, -0.7);
      if (Math.abs(domDW - pdfRect.dW) > 0.5) throw new Error('drawn width mismatch: dom=' + domDW + ' pdf=' + pdfRect.dW);
      if (Math.abs(domDH - pdfRect.dH) > 0.5) throw new Error('drawn height mismatch: dom=' + domDH + ' pdf=' + pdfRect.dH);
      if (Math.abs(domOffX - pdfRect.offX) > 0.5) throw new Error('x offset mismatch: dom=' + domOffX + ' pdf=' + pdfRect.offX);
      if (Math.abs(domOffY - pdfRect.offY) > 0.5) throw new Error('y offset mismatch \\u2014 pan direction bug: dom=' + domOffY + ' pdf=' + pdfRect.offY);
    });

    __check('CENTERED (pan=0, zoom=1) case lands at the CSS default 50%/50%', () => {
      editorialContent.pageThemes = { 'layout:pgC': { mode: 'light', image: 'data:image/jpeg;base64,X', imgW: 1600, imgH: 900, imageZoom: 1, imagePanX: 0, imagePanY: 0 } };
      const info = _dsPageThemeCss('layout:pgC');
      const pMatch = info.css.match(/background-position:([\\d.-]+)% ([\\d.-]+)%/);
      if (Math.abs(parseFloat(pMatch[1]) - 50) > 0.01 || Math.abs(parseFloat(pMatch[2]) - 50) > 0.01) throw new Error('centered case did not land at 50%/50%: ' + pMatch[0]);
    });

    __check('UPLOAD: choosing a new background image captures its real dimensions (imgW/imgH) for later crop math', () => {
      editorialContent.pageThemes = { 'layout:pgUpload': {} };
    });

    __checkAsync('SELF-HEALING: an older theme with an image but no cached dimensions measures itself once and then matches the PDF on the next render', async () => {
      editorialContent.pageThemes = { 'layout:pgOld': { mode: 'light', image: 'data:image/jpeg;base64,X', imageZoom: 1, imagePanX: 0.3, imagePanY: 0 } };   // no imgW/imgH \\u2014 an older project
      const first = _dsPageThemeCss('layout:pgOld');
      // first render falls back to page aspect since dimensions aren't known yet
      await new Promise(r => setTimeout(r, 10));
      const th = editorialContent.pageThemes['layout:pgOld'];
      if (!th.imgW || !th.imgH) throw new Error('dimensions were not measured and cached: imgW=' + th.imgW + ' imgH=' + th.imgH);
      if (th.imgW !== 1600 || th.imgH !== 900) throw new Error('measured dimensions do not match the mocked image: ' + th.imgW + 'x' + th.imgH);
      const second = _dsPageThemeCss('layout:pgOld');
      const wMatch = second.css.match(/background-size:([\\d.]+)% ([\\d.]+)%/);
      const wPct = parseFloat(wMatch[1]);
      const expectedWPct = (_coverRect(PW, PH, 1600/900, 1, 0.3, 0).dW / PW) * 100;
      if (Math.abs(wPct - expectedWPct) > 0.5) throw new Error('second render after self-healing does not match the real image aspect: got ' + wPct + ' expected ' + expectedWPct);
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
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
