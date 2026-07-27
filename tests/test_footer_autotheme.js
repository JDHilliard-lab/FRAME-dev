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

    __check('EXACT BUG: a new page set to dark theme, footer left at Auto, resolves to a LIGHT (white) logo + copyright', () => {
      editorialContent.layoutPages = [{ id: 'pgDark', type: 'moodboard', title: 'Dark Page', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgDark': { mode: 'dark' } };
      editorialContent.footer = {};        // deck default untouched
      editorialContent.pageFooters = {};   // no per-page override \\u2014 this is the reported "Auto" state
      const F = _resolveFooter('layout:pgDark');
      if (F.text !== 'light') throw new Error('footer text/logo did not auto-resolve to light on a dark page: ' + F.text);
      if (F.leftTheme !== 'light') throw new Error('left-zone theme did not auto-resolve to light on a dark page: ' + F.leftTheme);
    });

    __check('a LIGHT-themed page with Auto footer correctly stays dark/gray (no regression for the common case)', () => {
      editorialContent.layoutPages = [{ id: 'pgLight', type: 'moodboard', title: 'Light Page', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgLight': { mode: 'light' } };
      editorialContent.footer = {};
      editorialContent.pageFooters = {};
      const F = _resolveFooter('layout:pgLight');
      if (F.text !== 'dark') throw new Error('light page incorrectly got a light footer: ' + F.text);
    });

    __check('a page with NO theme set at all (default) still resolves footer to dark (matches the original default behaviour)', () => {
      editorialContent.layoutPages = [{ id: 'pgNoTheme', type: 'moodboard', title: 'No Theme', elements: [] }];
      editorialContent.pageThemes = {};
      editorialContent.footer = {};
      editorialContent.pageFooters = {};
      const F = _resolveFooter('layout:pgNoTheme');
      if (F.text !== 'dark') throw new Error('default (no theme set) should still be dark: ' + F.text);
    });

    __check('EXPLICIT per-page override still wins regardless of page theme (manual control preserved)', () => {
      editorialContent.layoutPages = [{ id: 'pgOverride', type: 'moodboard', title: 'Override', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgOverride': { mode: 'dark' } };
      editorialContent.footer = {};
      editorialContent.pageFooters = { 'layout:pgOverride': { text: 'dark', leftTheme: 'dark' } };   // explicit manual choice, even though page is dark
      const F = _resolveFooter('layout:pgOverride');
      if (F.text !== 'dark') throw new Error('explicit manual override was incorrectly overridden by auto-theme logic: ' + F.text);
    });

    __check('an explicit per-page "auto" override ALSO follows the page theme (not just an unset override)', () => {
      editorialContent.layoutPages = [{ id: 'pgExplicitAuto', type: 'moodboard', title: 'Explicit Auto', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgExplicitAuto': { mode: 'dark' } };
      editorialContent.footer = {};
      editorialContent.pageFooters = { 'layout:pgExplicitAuto': { text: 'auto', leftTheme: 'auto' } };
      const F = _resolveFooter('layout:pgExplicitAuto');
      if (F.text !== 'light') throw new Error('explicit "auto" choice did not follow the dark page theme: ' + F.text);
    });

    __check('independent zones still work: leftTheme can be manually forced dark while text (right) auto-follows a dark page', () => {
      editorialContent.layoutPages = [{ id: 'pgMixed', type: 'moodboard', title: 'Mixed', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgMixed': { mode: 'dark' } };
      editorialContent.footer = {};
      editorialContent.pageFooters = { 'layout:pgMixed': { leftTheme: 'dark' } };   // only override the left zone
      const F = _resolveFooter('layout:pgMixed');
      if (F.text !== 'light') throw new Error('right zone (logo/copyright) should still auto-follow the dark page: ' + F.text);
      if (F.leftTheme !== 'dark') throw new Error('left zone explicit override was not respected: ' + F.leftTheme);
    });

    __check('hide flags still pass through correctly alongside the theme fix', () => {
      editorialContent.layoutPages = [{ id: 'pgHide', type: 'moodboard', title: 'Hide', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgHide': { mode: 'dark' } };
      editorialContent.footer = {};
      editorialContent.pageFooters = { 'layout:pgHide': { hideLogo: true } };
      const F = _resolveFooter('layout:pgHide');
      if (F.hideLogo !== true) throw new Error('hideLogo flag not preserved');
      if (F.text !== 'light') throw new Error('theme auto-resolution regressed alongside a hide flag');
    });

    __check('deck-wide default explicitly set to a concrete value still overrides auto for pages with no per-page override', () => {
      editorialContent.layoutPages = [{ id: 'pgDeckDefault', type: 'moodboard', title: 'Deck Default', elements: [] }];
      editorialContent.pageThemes = { 'layout:pgDeckDefault': { mode: 'dark' } };
      editorialContent.footer = { text: 'dark' };   // deck-wide EXPLICIT choice, not auto
      editorialContent.pageFooters = {};
      const F = _resolveFooter('layout:pgDeckDefault');
      if (F.text !== 'dark') throw new Error('explicit deck-wide default was overridden by page-theme auto-logic: ' + F.text);
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
