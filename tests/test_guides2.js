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
    _dsPages = [{ kind: 'spec', type: 'spec', title: 'ART.001', row: { id: 'ART.001' }, _ovKey: 'ART.001' }];
    _dsIndex = 0;
    _mbPage = () => ({ type: 'narrative', title: 'PROJECT UNDERSTANDING' });

    const frameOf = (c) => Array.from(c.children).filter(n => n.style.border && n.style.border.indexOf('dashed') >= 0);
    const footerLineOf = (c) => Array.from(c.children).filter(n => n.style.borderTopWidth && !n.style.borderBottomWidth && !n.style.borderLeftWidth);

    __check('footer band artifact line is gone from layout chrome', () => {
      const c = document.createElement('div'); document.body.appendChild(c);
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      _mbDrawGuides(c);
      if (footerLineOf(c).length) throw new Error('footer band line still drawn');
    });

    __check('guides hidden: dashed safety hint sits AT the guide-set margins (no 4.3/7.4 offset)', () => {
      const c = document.createElement('div'); document.body.appendChild(c);
      editorialContent.guidePref = { setId: 'g_idml12', show: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      _mbDrawGuides(c);
      const fr = frameOf(c);
      if (fr.length !== 1) throw new Error('expected exactly one dashed frame, got ' + fr.length);
      const s = fr[0].style;
      if (s.left !== '2.34%' || s.top !== '5%' || s.bottom !== '10%') throw new Error('frame not at set margins: ' + s.left + '/' + s.top + '/' + s.bottom);
    });

    __check('guides shown: NO duplicate dashed frame (purple frame is the safety area)', () => {
      const c = document.createElement('div'); document.body.appendChild(c);
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      _mbDrawGuides(c);
      if (frameOf(c).length) throw new Error('duplicate dashed safety frame still drawn alongside the purple one');
    });

    __check('no guide set with margins: falls back to the 40pt frame', () => {
      const c = document.createElement('div'); document.body.appendChild(c);
      editorialContent.guidePref = { setId: 'g_thirds', show: false, snapMode: 'guides' };   // thirds has margin:null
      editorialContent.pageGuides = {};
      _mbDrawGuides(c);
      const fr = frameOf(c);
      if (fr.length !== 1 || fr[0].style.left !== '4.3%') throw new Error('fallback frame wrong: ' + (fr[0] && fr[0].style.left));
    });

    __check('breaker chrome unchanged (full-bleed badge, no footer line)', () => {
      const c = document.createElement('div'); document.body.appendChild(c);
      _mbPage = () => ({ type: 'breaker' });
      _mbDrawGuides(c);
      if ((c.textContent || '').indexOf('FULL BLEED') < 0) throw new Error('full bleed badge missing');
      if (footerLineOf(c).length) throw new Error('footer line drawn on breaker');
      _mbPage = () => ({ type: 'narrative', title: 'PROJECT UNDERSTANDING' });
    });

    __check('spec page overlay lights up from the Guides-menu deck show flag alone', () => {
      _dsShowGuides = false;
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsAddGuides(page, 936, 540);
      if (!page.querySelector('._mbGuideLine')) throw new Error('spec page overlay did not paint from deck show flag');
    });

    __check('grid-only lights the overlay on any page kind', () => {
      _dsShowGuides = false;
      editorialContent.guidePref = { setId: 'g_idml12', show: false, grid: true, gridSize: 20, snapMode: 'off' };
      editorialContent.pageGuides = {};
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsAddGuides(page, 936, 540);
      const grid = Array.from(page.querySelectorAll('._mbGuideLine')).find(n => n.style.backgroundImage.indexOf('linear-gradient') >= 0);
      if (!grid) throw new Error('grid did not paint');
      // With show flags all off, the purple/cyan set lines should NOT paint.
      const setLines = Array.from(page.querySelectorAll('._mbGuideLine')).filter(n => n.style.background.indexOf('171, 54, 255') >= 0 || n.style.background.indexOf('0, 190, 235') >= 0);
      if (setLines.length) throw new Error('set lines painted despite show being off');
    });

    __check('both switches off, no grid: overlay paints nothing', () => {
      _dsShowGuides = false;
      editorialContent.guidePref = { setId: 'g_idml12', show: false, grid: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsAddGuides(page, 936, 540);
      if (page.children.length) throw new Error('painted with everything off');
    });

    __check('settings toggle still works on its own (regression)', () => {
      _dsShowGuides = true;
      editorialContent.guidePref = { setId: 'g_idml12', show: false, grid: false, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsAddGuides(page, 936, 540);
      if (!page.querySelector('._mbGuideLine')) throw new Error('settings toggle no longer paints');
      _dsShowGuides = false;
    });

    __check('floorplan page key resolves guides too (kind floorplan)', () => {
      _dsShowGuides = false;
      _dsPages = [{ kind: 'floorplan', level: 0 }];
      _dsIndex = 0;
      floorplanLevels = [{ name: 'Level 1', imageData: '' }];
      editorialContent.guidePref = { setId: 'g_idml12', show: true, snapMode: 'guides' };
      editorialContent.pageGuides = {};
      const page = document.createElement('div'); document.body.appendChild(page);
      _dsAddGuides(page, 936, 540);
      if (!page.querySelector('._mbGuideLine')) throw new Error('floorplan overlay did not paint');
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
