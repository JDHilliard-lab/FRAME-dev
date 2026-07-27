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
    editorialContent = editorialContent || {};

    __check('_dsDisplayInk itself correctly flips a dark color to light on a dark-themed page (sanity)', () => {
      editorialContent.pageThemes = { 'layout:pgOutline': { mode: 'dark' } };
      const resolved = _dsDisplayInk('#222222', 'layout:pgOutline');
      if (resolved === '#222222') throw new Error('ink was not flipped at all: ' + resolved);
    });

    __check('EXACT BUG: _textExtraCss without a resolved ink falls back to the raw dark color (old behavior, for reference)', () => {
      const css = _textExtraCss({ outline: true, color: '#222222' });
      if (css.indexOf('-webkit-text-stroke:1.4px #222222') < 0) throw new Error('expected the raw dark color when no resolved ink is passed: ' + css);
    });

    __check('FIX: _textExtraCss with a resolved (light) ink uses it for the outline stroke instead of the raw dark color', () => {
      const resolved = _dsDisplayInk('#222222', 'irrelevant-since-passed-directly');
      const css = _textExtraCss({ outline: true, color: '#222222' }, 'rgb(235,235,235)');
      if (css.indexOf('#222222') >= 0) throw new Error('raw dark color leaked into the outline stroke despite a resolved ink being passed: ' + css);
      if (css.indexOf('-webkit-text-stroke:1.4px rgb(235,235,235)') < 0) throw new Error('resolved light ink not used for the outline stroke: ' + css);
    });

    __check('END TO END (mb element / layout page): outline text on a dark-themed page renders with a LIGHT stroke, matching regular fill text', () => {
      editorialContent.layoutPages = [{ id: 'pgHub', type: 'moodboard', title: 'Hub', elements: [
        { type: 'text', text: 'HUB', x:0.1,y:0.2,w:0.5, color: '#222222' },
        { type: 'text', text: 'MEETING ROOMS', x:0.1,y:0.4,w:0.5, color: '#222222', outline: true, bold: true }
      ] }];
      editorialContent.pageThemes = { 'layout:pgHub': { mode: 'dark' } };
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      _mbActiveCanvasId = 'dsLayoutCanvas';
      const page = document.createElement('div'); page.id = 'dsLayoutCanvas'; document.body.appendChild(page);
      renderMoodboardCanvas();
      const boxes = Array.from(page.querySelectorAll('div')).filter(d => d.textContent === 'HUB' || d.textContent === 'MEETING ROOMS');
      const fillBox = boxes.find(b => b.textContent === 'HUB');
      const outlineBox = boxes.find(b => b.textContent === 'MEETING ROOMS');
      if (!fillBox || !outlineBox) throw new Error('boxes not rendered: found ' + boxes.length);
      if (fillBox.style.color.indexOf('222') >= 0) throw new Error('regular fill text did not flip to light on the dark page (unexpected, this already worked before): ' + fillBox.style.color);
      const strokeCss = outlineBox.style.cssText;
      if (strokeCss.indexOf('222, 222, 222') >= 0 || strokeCss.indexOf('#222222') >= 0) throw new Error('the exact reported bug: outline text stroke still uses the raw dark color on a dark page: ' + strokeCss);
      if (strokeCss.indexOf('-webkit-text-stroke') < 0) throw new Error('outline stroke CSS missing entirely: ' + strokeCss);
    });

    __check('REGRESSION: outline text on a LIGHT-themed page still correctly uses its own chosen dark color (no incorrect flip)', () => {
      editorialContent.layoutPages = [{ id: 'pgLight', type: 'moodboard', title: 'Light', elements: [
        { type: 'text', text: 'OUTLINE LIGHT', x:0.1,y:0.2,w:0.5, color: '#222222', outline: true }
      ] }];
      editorialContent.pageThemes = { 'layout:pgLight': { mode: 'light' } };
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      Array.from(document.querySelectorAll('#dsLayoutCanvas')).forEach(el => el.remove());
      const page = document.createElement('div'); page.id = 'dsLayoutCanvas'; document.body.appendChild(page);
      renderMoodboardCanvas();
      const box = Array.from(page.querySelectorAll('div')).find(d => d.textContent === 'OUTLINE LIGHT');
      if (!box) throw new Error('box not rendered');
      if (box.style.cssText.indexOf('222, 34, 34') >= 0) throw new Error('unrelated corruption check');
      if (box.style.cssText.toLowerCase().indexOf('222222') < 0 && box.style.cssText.indexOf('34, 34, 34') < 0) throw new Error('light-theme outline text incorrectly changed from its own chosen dark color: ' + box.style.cssText);
    });

    __check('REGRESSION: outline text ANNOTATION (not mb element) on a dark page also correctly flips now', () => {
      editorialContent.annotations = { 'layout:pgAnnOutline': [{ type: 'text', text: 'ANNOTATION OUTLINE', x:0.1,y:0.2,w:0.5, color: '#222222', outline: true }] };
      editorialContent.pageThemes = { 'layout:pgAnnOutline': { mode: 'dark' } };
      editorialContent.layoutPages = [{ id: 'pgAnnOutline', type: 'moodboard', title: 'AO', elements: [] }];
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      window._mbEls = () => [];
      window._dsCurrentEditablePage = () => ({ page: editorialContent.layoutPages[0], type: 'moodboard' });
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsRenderAnnots(page, _dsPages[0], 936, 540);
      const box = Array.from(page.querySelectorAll('div')).find(d => d.textContent === 'ANNOTATION OUTLINE');
      if (!box) throw new Error('annotation outline box not rendered');
      if (box.style.cssText.indexOf('#222222') >= 0) throw new Error('annotation outline text still stuck at the raw dark color on a dark page: ' + box.style.cssText);
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
