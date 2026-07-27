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
    editorialContent.pageFooters = {};
    editorialContent.footer = {};

    let renderCenterCalls = 0;
    _dsRenderCenter = () => { renderCenterCalls++; };
    _dsRenderTools = () => {};   // avoid rebuilding the whole panel tree in this harness
    _dsRenderRail = () => {};
    scheduleAutosave = () => {};
    showInfoModal = () => {};
    _dsPages = [{ kind: 'layout', page: { id: 'p1', title: 'Test Page' } }];
    _dsIndex = 0;

    __check('toggling dark/light text (segRow) triggers an immediate center re-render', () => {
      renderCenterCalls = 0;
      const t = document.createElement('div');
      document.body.appendChild(t);
      _dsPageChromeControls(t, _dsPages[0]);
      // Find the "Light text" button in the right-side (copyright/logo) segment.
      const btns = Array.from(t.querySelectorAll('button')).filter(b => b.textContent === 'Light text');
      if (!btns.length) throw new Error('Light text button not found');
      const before = renderCenterCalls;
      btns[0].click();
      if (renderCenterCalls <= before) throw new Error('center did not re-render after toggling dark/light text');
    });

    __check('hide-copyright checkbox triggers an immediate center re-render', () => {
      renderCenterCalls = 0;
      const t = document.createElement('div');
      document.body.appendChild(t);
      _dsPageChromeControls(t, _dsPages[0]);
      const labels = Array.from(t.querySelectorAll('label'));
      const row = labels.find(l => l.textContent.indexOf('Hide copyright line') >= 0);
      if (!row) throw new Error('Hide copyright checkbox not found');
      const cb = row.querySelector('input[type=checkbox]');
      const before = renderCenterCalls;
      cb.checked = true;
      cb.dispatchEvent(new window.Event('change'));
      if (renderCenterCalls <= before) throw new Error('center did not re-render after toggling hide-copyright');
    });

    __check('hide-footer checkbox triggers an immediate center re-render', () => {
      renderCenterCalls = 0;
      const t = document.createElement('div');
      document.body.appendChild(t);
      _dsPageChromeControls(t, _dsPages[0]);
      const labels = Array.from(t.querySelectorAll('label'));
      const row = labels.find(l => l.textContent.indexOf('Hide entire footer on this page') >= 0);
      if (!row) throw new Error('Hide-footer checkbox not found');
      const cb = row.querySelector('input[type=checkbox]');
      const before = renderCenterCalls;
      cb.checked = true;
      cb.dispatchEvent(new window.Event('change'));
      if (renderCenterCalls <= before) throw new Error('center did not re-render after toggling hide-footer');
    });

    __check('"Apply footer to whole deck" triggers an immediate center re-render', () => {
      renderCenterCalls = 0;
      const t = document.createElement('div');
      document.body.appendChild(t);
      _dsPageChromeControls(t, _dsPages[0]);
      const btns = Array.from(t.querySelectorAll('button')).filter(b => b.textContent === 'Apply footer to whole deck');
      if (!btns.length) throw new Error('Apply-to-deck button not found');
      const before = renderCenterCalls;
      btns[0].click();
      if (renderCenterCalls <= before) throw new Error('center did not re-render after applying footer to whole deck');
    });

    __check('the actual footer state is still updated correctly (regression guard)', () => {
      const t = document.createElement('div');
      document.body.appendChild(t);
      const key = _deckPageKey(_dsPages[0]);
      _dsPageChromeControls(t, _dsPages[0]);
      const btns = Array.from(t.querySelectorAll('button')).filter(b => b.textContent === 'Light text');
      btns[0].click();
      const F = _resolveFooter(key);
      if (F.text !== 'light') throw new Error('footer state not actually applied: ' + JSON.stringify(F));
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
