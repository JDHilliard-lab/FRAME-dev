const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ save(){}, restore(){}, clip(){}, beginPath(){}, ellipse(){}, moveTo(){}, lineTo(){}, arcTo(){}, closePath(){}, drawImage(){}, measureText:()=>({width:6}), scale(){}, fillRect(){}, fill(){}, stroke(){}, arc(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,BG';
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

    __checkAsync('DARK cover with a title element: text colour auto-flips to light (the actual reported bug)', async () => {
      editorialContent.pageThemes = { 'fixed:cover': { mode: 'dark', bg: '#000000' } };
      editorialContent.coverPage = { elements: [ { type: 'text', text: 'PROJECT X', x: 0.1, y: 0.4, w: 0.6, size: 0.06, color: '#111111' } ] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      await _pageThemeBake('fixed:cover');
      const stored0 = _pageThemes()['fixed:cover'] || {};
      // Wrap BEFORE installing the remap, so the remap captures THIS wrapper
      // as its "original" and calls it with the FLIPPED colour \u2014 letting us
      // observe what actually reaches the page, not just our own input.
      let capturedColor = null;
      const rawSTC = rec.setTextColor.bind(rec);
      rec.setTextColor = (r,g,b) => { capturedColor = [r,g,b]; return rawSTC(r,g,b); };
      const ink0 = _applyPageTheme(rec, 'fixed:cover', PW, PH, stored0._bakedImg || null);
      _themeRemapRemove(rec);
      if (ink0 && ink0.dark) _themeRemapInstall(rec);
      // Simulate what _drawMoodboardPage would do: set the text's OWN dark colour.
      rec.setTextColor(17, 17, 17);   // #111111, the near-black text colour on the box
      if (!capturedColor) throw new Error('setTextColor never called');
      const lum = 0.299*capturedColor[0] + 0.587*capturedColor[1] + 0.114*capturedColor[2];
      if (lum < 140) throw new Error('text colour NOT flipped to light against a dark background: ' + JSON.stringify(capturedColor));
    });

    __checkAsync('LIGHT cover with a title element: text colour is NOT flipped (regression) and no remap leaks in', async () => {
      editorialContent.pageThemes = { 'fixed:cover': { mode: 'light' } };
      editorialContent.coverPage = { elements: [ { type: 'text', text: 'PROJECT Y', x: 0.1, y: 0.4, w: 0.6, size: 0.06 } ] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      let capturedColor = null;
      const rawSTC = rec.setTextColor.bind(rec);
      rec.setTextColor = (r,g,b) => { capturedColor = [r,g,b]; return rawSTC(r,g,b); };
      // Simulate a stale remap left over from a PRIOR dark page on the same doc \u2014
      // installed ON TOP of our probe, so removing it must correctly restore
      // the probe (not silently bypass it).
      _themeRemapInstall(rec);
      await _pageThemeBake('fixed:cover');
      const stored0 = _pageThemes()['fixed:cover'] || {};
      const ink0 = _applyPageTheme(rec, 'fixed:cover', PW, PH, stored0._bakedImg || null);
      _themeRemapRemove(rec);
      if (ink0 && ink0.dark) _themeRemapInstall(rec);
      rec.setTextColor(17, 17, 17);
      if (capturedColor[0] !== 17) throw new Error('light-theme text was incorrectly flipped (stale remap leaked in): ' + JSON.stringify(capturedColor));
    });

    __checkAsync('DARK slogan with elements: identical fix applied (regression parity)', async () => {
      editorialContent.pageThemes = { 'fixed:slogan': { mode: 'dark' } };
      editorialContent.sloganPage = { elements: [ { type: 'text', text: 'Good Art', x: 0.1, y: 0.4, w: 0.6, size: 0.05 } ] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      await _pageThemeBake('fixed:slogan');
      const stored0 = _pageThemes()['fixed:slogan'] || {};
      let capturedColor = null;
      const rawSTC = rec.setTextColor.bind(rec);
      rec.setTextColor = (r,g,b) => { capturedColor = [r,g,b]; return rawSTC(r,g,b); };
      const ink0 = _applyPageTheme(rec, 'fixed:slogan', PW, PH, stored0._bakedImg || null);
      _themeRemapRemove(rec);
      if (ink0 && ink0.dark) _themeRemapInstall(rec);
      rec.setTextColor(20, 20, 20);
      const lum = 0.299*capturedColor[0] + 0.587*capturedColor[1] + 0.114*capturedColor[2];
      if (lum < 140) throw new Error('slogan dark text not flipped: ' + JSON.stringify(capturedColor));
    });

    __checkAsync('bare cover (no elements) still works exactly as before \\u2014 unaffected regression', async () => {
      editorialContent.pageThemes = { 'fixed:cover': { mode: 'dark' } };
      editorialContent.coverPage = { elements: [] };
      const PW = 936, PH = 540;
      const rec = new CanvasPdfRec(PW, PH);
      await _pageThemeBake('fixed:cover');
      let capturedColors = [];
      const origSTC = rec.setTextColor.bind(rec);
      rec.setTextColor = (r,g,b) => { capturedColors.push([r,g,b]); return origSTC(r,g,b); };
      _drawCoverPage(rec, {}, 1, { location: '', code: '', version: '' });
      const anyLight = capturedColors.some(c => (0.299*c[0]+0.587*c[1]+0.114*c[2]) > 140);
      if (!anyLight) throw new Error('bare dark cover regressed \\u2014 no light text colour ever set: ' + JSON.stringify(capturedColors));
    });

    __check('source guard: both fixed cover/slogan branches now install/remove the remap correctly', () => {
      const S = window.__appSrc;
      const coverIdx = S.indexOf("_applyPageTheme(doc, 'fixed:cover', PW, PH, stored0._bakedImg || null);");
      const sloganIdx = S.indexOf("_applyPageTheme(doc, 'fixed:slogan', PW, PH, stored0._bakedImg || null);");
      if (coverIdx < 0 || sloganIdx < 0) throw new Error('applyPageTheme calls not found');
      const coverNearby = S.slice(coverIdx, coverIdx + 1200);
      const sloganNearby = S.slice(sloganIdx, sloganIdx + 1200);
      if (coverNearby.indexOf('_themeRemapInstall(doc)') < 0) throw new Error('cover branch missing remap install');
      if (sloganNearby.indexOf('_themeRemapInstall(doc)') < 0) throw new Error('slogan branch missing remap install');
      if (coverNearby.indexOf('_themeRemapRemove(doc)') < 0) throw new Error('cover branch missing remap removal (stale-remap guard)');
      if (sloganNearby.indexOf('_themeRemapRemove(doc)') < 0) throw new Error('slogan branch missing remap removal (stale-remap guard)');
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
