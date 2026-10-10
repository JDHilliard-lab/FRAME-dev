// Page type is set UNKERNED on screen because the PDF is (18.08).
// Reported as "rich text wraps about 1% differently in Deck Studio and the PDF": a
// Druk 91pt heading fit the editor and broke onto a second line in the PDF. The
// notes blamed a different size BASIS; measuring in real Chrome against the vendored
// jsPDF with the same TTF showed the sizes agree exactly and the gap is KERNING:
// the browser kerns by default (0.5-1.1% narrower on ordinary headings, 5% on
// AV/TA pairs) and jsPDF never does. With kerning off the two match to 0.1pt.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.__ctxs = [];
  window.HTMLCanvasElement.prototype.getContext = function () { const c = ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, strokeRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) }); window.__ctxs.push(c); return c; };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.Element.prototype.scrollIntoView = function () {};
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;

    __check('every page-text tile the editor and the thumbnails draw is unkerned', () => {
      const n = S.split('white-space:pre-wrap').length - 1;
      const k = S.split('white-space:pre-wrap;font-kerning:none').length - 1;
      if (n !== k) throw new Error((n - k) + ' of ' + n + ' text tiles still kern, so they wrap differently from the PDF');
    });

    __check('the rich-text measuring canvas is unkerned', () => {
      const x = _richMeasureCtx();
      if (x.fontKerning !== 'none') throw new Error('measuring context kerns: ' + x.fontKerning);
    });

    window.__canvasCheck = (async () => {
      const rec = new CanvasPdfRec(936, 540);
      if (rec._mc.fontKerning !== 'none') throw new Error('the preview measures kerned text: ' + rec._mc.fontKerning);
      const before = window.__ctxs.length;
      rec.setFontSize(40); rec.text('AVATAR', 40, 80);
      await rec.render(1);
      const drawn = window.__ctxs.slice(before);
      if (!drawn.length) throw new Error('render drew on no canvas');
      if (drawn.some(c => c.fontKerning !== 'none')) throw new Error('the preview draws kerned text');
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    try { await window.__canvasCheck; window.__testResults.push({ label: 'the canvas preview renderer measures AND draws unkerned (render)', ok: true }); }
    catch (e) { window.__testResults.push({ label: 'the canvas preview renderer measures AND draws unkerned (render)', ok: false, err: e.message }); }
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
