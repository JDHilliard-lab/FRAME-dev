// Preflight (18.05): mockup slots were reported as missing artwork they cannot
// take, piece problems could only jump to the spec page ABOUT them, and the dialog
// was off the shared shell so Escape did nothing.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, strokeRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.Element.prototype.scrollIntoView = function () {};
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const __row = (id, extra) => Object.assign({}, dashDefaultData || {}, { id: id, product: 'Framed Art', extW: 24, extH: 30 }, extra || {});
    dashProjectData = [__row('ART.1A'), __row('ART.1B'), __row('ART.2', { artworkUrl: 'data:image/png;base64,AAAA' })];
    elevations = [
      { id: 'wMock', name: 'ART.1 MOCKUP', catalogueMaster: true, wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [{ id: 'ART.1A', w: 24, h: 30, x: 10, y: 50, active: true }, { id: 'ART.1B', w: 24, h: 30, x: 60, y: 50, active: true }] },
      { id: 'wBar', name: 'BAR', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }
    ];

    __check('a catalogue mockup slot is not reported as missing artwork (it refuses artwork by design)', () => {
      const iss = _dsRunPreflight();
      const bad = iss.filter(x => x.text.indexOf('ART.1A') === 0 || x.text.indexOf('ART.1B') === 0);
      if (bad.length) throw new Error('mockup slots flagged: ' + bad.map(x => x.text).join(' / '));
    });

    __check('a real piece missing its wall carries a jump to the piece', () => {
      const iss = _dsRunPreflight();
      const it = iss.find(x => x.text.indexOf('ART.2') === 0 && x.text.indexOf('elevation') >= 0);
      if (!it) throw new Error('ART.2 is on no wall and was not reported');
      if (!it.go || it.go.kind !== 'piece' || it.go.rowId !== 'ART.2') throw new Error('no jump to the piece on the issue');
    });

    __check('Preflight is on the shared shell and its Piece button goes to the dashboard row', () => {
      _dsShowPreflight();
      const m = document.getElementById('_dsPreflightModal');
      if (!m.classList.contains('frame-modal')) throw new Error('not on the .frame-modal shell');
      if (m.querySelectorAll('[data-modal-close]').length !== 1) throw new Error('needs exactly one close control');
      const btn = Array.from(m.querySelectorAll('button')).find(b => b.textContent === 'Piece');
      if (!btn) throw new Error('no Piece button rendered');
      Array.from(m.querySelectorAll('button')).forEach(b => {
        if (b.classList.contains('action-btn') && b.style.width !== 'auto' && b.textContent !== 'Close' && b.textContent !== 'Re-run') throw new Error('"' + b.textContent + '" is an .action-btn with no width, so it renders as a full-width slab');
      });
      currentView = 'deck';
      btn.click();
      if (document.getElementById('_dsPreflightModal')) throw new Error('Preflight stayed open');
      if (currentView !== 'dashboard') throw new Error('landed in ' + currentView);
      if (dashProjectData[dashSelectedRowIndex].id !== 'ART.2') throw new Error('selected the wrong row');
    });

    __check('Escape closes Preflight', () => {
      _dsShowPreflight();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      if (document.getElementById('_dsPreflightModal')) throw new Error('Escape left it open');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
