// The instant spec-page preview sets its rows the way the page prints them (18.14).
// _deckMockHTML is what a designer looks at while the real page builds, and it set the
// spec list at ~14pt on a 1.6 line height: a third taller than the PDF's 8.5pt on 13pt,
// so on a ten-row page the last two rows ran under the frame and profile boxes. Found
// by screenshotting a real project in Chrome; the PDF render beside it was correct.
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
    const S = window.__appSrc;
    const row = Object.assign(JSON.parse(JSON.stringify(dashDefaultData)), { id: 'ART.2A', location: 'LOBBY', extW: 24, extH: 24 });
    dashProjectData = [row];
    const d = _deckPageList().find(x => x.kind === 'spec');
    const H = 865, W = 1500;
    const host = document.createElement('div'); host.innerHTML = _deckMockHTML(d, W, H);

    __check('every spec row is drawn, not the first twelve and not a run-on paragraph', () => {
      const want = buildSpecStrings(row).lines.length;
      const labels = Array.from(host.querySelectorAll('span[style*="font-weight:700"]')).map(s => s.textContent);
      if (labels.length !== want) throw new Error('drew ' + labels.length + ' of ' + want + ' rows: ' + labels.join(', '));
      if (labels[labels.length - 1] !== 'Overall Dimensions') throw new Error('the last row is ' + labels[labels.length - 1]);
    });

    __check('the rows use the PDF rhythm: 8.5pt type on 13pt, scaled to the preview', () => {
      const block = Array.from(host.querySelectorAll('div')).find(x => x.style.fontKerning === 'none' && x.style.fontSize && x.querySelector('span[style*="font-weight:700"]'));
      if (!block) throw new Error('no spec block');
      const fsz = parseFloat(block.style.fontSize), want = 8.5 / 540 * H;
      if (Math.abs(fsz - want) > 0.05) throw new Error('font ' + fsz + ' vs ' + want);
      const rows = block.children; const step = parseFloat(rows[1].style.top) - parseFloat(rows[0].style.top);
      if (Math.abs(step - 13 / 540 * H) > 0.1) throw new Error('row step ' + step);
    });

    __check('each row carries a dotted leader, like the printed one', () => {
      if (!host.querySelector('span[style*="dotted"]')) throw new Error('no leader');
      const pdf = S.slice(S.indexOf('// — Spec block (dotted leaders) —'), S.indexOf('// — Elevation (wall thumbnail) —'));
      if (pdf.indexOf('doc.setFontSize(8.5)') < 0 || pdf.indexOf('let _lead = 13') < 0) throw new Error('the PDF spec numbers moved; update the mock to match them');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
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
