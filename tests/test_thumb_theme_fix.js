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
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __checkAsync = (label, fn) => { const p2 = __chain.then(fn).then(() => ({ label, ok: true })).catch(e => ({ label, ok: false, err: e.message })); __chain = p2.then(() => {}); window.__asyncChecks.push(p2); };
    editorialContent = editorialContent || {};

    __checkAsync('EXACT BUG: thumbnail builder now correctly applies the page theme (background + dark ink) for a dark-themed Cover page with a title', async () => {
      editorialContent.pageThemes = { 'fixed:cover': { mode: 'dark', bg: '#123456' } };
      editorialContent.coverPage = { elements: [{ type: 'text', text: 'COVER PAGE HEADING', x:0.1,y:0.2,w:0.6, color: '#222222' }] };
      const desc = { kind: 'fixed', fixed: 'cover', page: editorialContent.coverPage };
      let applyThemeCalledWith = null, remapInstallCalled = false;
      const origApply = _applyPageTheme, origInstall = _themeRemapInstall;
      _applyPageTheme = (doc, key, pw, ph, img) => { applyThemeCalledWith = key; return origApply(doc, key, pw, ph, img); };
      _themeRemapInstall = (doc) => { remapInstallCalled = true; return origInstall(doc); };
      try { await renderDeckPageCanvas(desc, null, { scale: 1 }); } catch (e) { throw new Error('renderDeckPageCanvas threw: ' + e.message); }
      if (applyThemeCalledWith !== 'fixed:cover') throw new Error('_applyPageTheme was not called for fixed:cover \\u2014 the exact reported bug (theme never applied to the thumbnail)');
      if (!remapInstallCalled) throw new Error('dark-mode ink flip (_themeRemapInstall) was not engaged for a dark-themed cover');
      _applyPageTheme = origApply; _themeRemapInstall = origInstall;
    });

    __checkAsync('REGRESSION: a LIGHT-themed cover with a title does not incorrectly engage the dark ink flip', async () => {
      editorialContent.pageThemes = { 'fixed:cover': { mode: 'light' } };
      editorialContent.coverPage = { elements: [{ type: 'text', text: 'COVER PAGE HEADING', x:0.1,y:0.2,w:0.6 }] };
      const desc = { kind: 'fixed', fixed: 'cover', page: editorialContent.coverPage };
      let remapInstallCalled = false;
      const origInstall = _themeRemapInstall;
      _themeRemapInstall = (doc) => { remapInstallCalled = true; return origInstall(doc); };
      await renderDeckPageCanvas(desc, null, { scale: 1 });
      if (remapInstallCalled) throw new Error('dark ink flip incorrectly engaged for a light-themed cover');
      _themeRemapInstall = origInstall;
    });

    __checkAsync('same fix applies to the Slogan (Good Art Good People) fixed page', async () => {
      editorialContent.pageThemes = { 'fixed:slogan': { mode: 'dark' } };
      editorialContent.sloganPage = { elements: [{ type: 'text', text: 'GOOD ART. GOOD PEOPLE.', x:0.1,y:0.3,w:0.7 }] };
      const desc = { kind: 'fixed', fixed: 'slogan', page: editorialContent.sloganPage };
      let applyThemeCalledWith = null;
      const origApply = _applyPageTheme;
      _applyPageTheme = (doc, key, pw, ph, img) => { applyThemeCalledWith = key; return origApply(doc, key, pw, ph, img); };
      await renderDeckPageCanvas(desc, null, { scale: 1 });
      if (applyThemeCalledWith !== 'fixed:slogan') throw new Error('_applyPageTheme was not called for fixed:slogan');
      _applyPageTheme = origApply;
    });

    __checkAsync('REGRESSION: a regular "layout" page (not fixed) still gets its theme applied via the existing upfront path, unaffected by this fix', async () => {
      editorialContent.layoutPages = [{ id: 'pgLayoutTheme', type: 'moodboard', title: 'LT', elements: [{ type: 'text', text: 'Hello', x:0.1,y:0.1,w:0.3 }] }];
      editorialContent.pageThemes = { 'layout:pgLayoutTheme': { mode: 'dark' } };
      const desc = { kind: 'layout', page: editorialContent.layoutPages[0] };
      let applyThemeCalledWith = null;
      const origApply = _applyPageTheme;
      _applyPageTheme = (doc, key, pw, ph, img) => { applyThemeCalledWith = key; return origApply(doc, key, pw, ph, img); };
      await renderDeckPageCanvas(desc, null, { scale: 1 });
      if (applyThemeCalledWith !== 'layout:pgLayoutTheme') throw new Error('regular layout page theme application regressed: ' + applyThemeCalledWith);
      _applyPageTheme = origApply;
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
