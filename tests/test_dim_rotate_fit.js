// Vertical dimension numbers read along their line (18.07). The outer wall dims,
// the figure dim and the glazing dims were rotated; the spacing and custom-line
// dims beside them were not, so one drawing set vertical numbers two ways. They
// now rotate when the number fits its gap lengthways and stay upright otherwise,
// because only an upright number can be lifted beside the line when it does not.
// jsdom measures nothing, so a label's width is faked from its text length.
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
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() {
    return this.classList && this.classList.contains('arch-label-new') ? (this.textContent || '').length * 7 : 0;
  } });
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    elevScale = 4;
    const layer = document.createElement('div'); document.body.appendChild(layer);
    const lblOf = (dim) => dim.querySelector('.arch-label-new');
    const lastDim = () => layer.querySelectorAll('.arch-dim')[layer.querySelectorAll('.arch-dim').length - 1];

    __check('a vertical spacing number that fits its gap is rotated to read along the line', () => {
      layer.innerHTML = '';
      createElevArchSpacing(50, 10, 50, 40, 'v', layer, '30"', 'tstA', 0, { rotateLabel: 'auto' });
      const l = lblOf(lastDim());
      if (!l.classList.contains('arch-label-rot')) throw new Error('a 3-character number in a 120px gap stayed upright');
      if (l.style.position !== 'absolute') throw new Error('rotated label was dropped back into the flex flow: ' + l.style.position);
      if (layer.querySelector('[style*="-9999px"]')) throw new Error('the measuring probe was left in the layer');
    });

    __check('one that is longer than its gap stays upright, so it can be lifted beside the line', () => {
      layer.innerHTML = '';
      createElevArchSpacing(50, 10, 50, 13, 'v', layer, '3.25"(83mm)', 'tstB', 0, { rotateLabel: 'auto' });
      if (lblOf(lastDim()).classList.contains('arch-label-rot')) throw new Error('rotated a number 77px long into a 12px gap');
    });

    __check('a caller that does not ask is left exactly as before', () => {
      layer.innerHTML = '';
      createElevArchSpacing(50, 10, 50, 40, 'v', layer, '30"', 'tstC', 0, {});
      if (lblOf(lastDim()).classList.contains('arch-label-rot')) throw new Error('rotated without being asked');
      createElevArchSpacing(10, 10, 40, 10, 'h', layer, '30"', 'tstD', 0, { rotateLabel: 'auto' });
      if (lblOf(lastDim()).classList.contains('arch-label-rot')) throw new Error('rotated a HORIZONTAL number');
    });

    __check('the gap, floor and ceiling callers all ask for it', () => {
      const S = window.__appSrc;
      ['_spacingLabel(gapY), vId, vOff, { rotateLabel', '_spacingLabel(ceilingDist), id, o, { rotateLabel', '_spacingLabel(floorDist), id, o, { rotateLabel'].forEach(k => {
        if (S.indexOf(k) < 0) throw new Error('a vertical spacing caller does not request rotation: ' + k.split(',')[0]);
      });
    });

    __check('a vertical custom measure line rotates when it fits, with its controls built for a rotated label', () => {
      layer.innerHTML = '';
      const L = { id: 'cl1', off: 0, lblOff: 0 };
      getElevCustomLines().push(L);
      renderOneCustomLine(layer, 'cl1', 'v', 20, 10, 40, 40);
      const d = layer.querySelector('[data-custom-line="cl1"]');
      const l = lblOf(d);
      if (!l.classList.contains('arch-label-rot')) throw new Error('vertical measure line number stayed upright');
      if (l.style.position !== 'absolute') throw new Error('buildDimControls was not told the label is rotated');
      layer.innerHTML = '';
      renderOneCustomLine(layer, 'cl1', 'v', 20, 10, 2, 2);
      if (lblOf(layer.querySelector('[data-custom-line="cl1"]')).classList.contains('arch-label-rot')) throw new Error('a short measure line rotated a number longer than itself');
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
