// The layout canvas (cover, narrative, moodboard pages edited live in Deck Studio)
// had the same bug _dsPinChrome fixed for annotations: the page clips at the trim,
// and the resize handles, the text box's "+" settings button and the image pan disc
// hang OFF the element. On a full-bleed image or a text box pushed to the right edge
// they sat outside the page and could not be clicked.
//
// Layout boxes are positioned in PERCENT and text boxes have no height, so the
// annotation arithmetic has nothing to read. _mbPinChrome measures instead. jsdom
// does no layout, so this file gives it a tiny one: enough to place absolutely
// positioned boxes from left/top/right/bottom/width/height in px, %, or
// calc(% - px), plus translate(-50%,-50%).
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

  // ---- the tiny layout engine ----
  const PW = 936, PH = 540;
  const len = (v, base) => {
    if (v === undefined || v === null || v === '' || v === 'auto') return null;
    v = String(v).trim();
    if (v.indexOf('calc(') === 0) {
      const inner = v.slice(5, -1);
      const parts = inner.split(' ');
      let acc = len(parts[0], base);
      for (let k = 1; k + 1 < parts.length; k += 2) { const n = len(parts[k + 1], base); acc = parts[k] === '-' ? acc - n : acc + n; }
      return acc;
    }
    if (v.slice(-1) === '%') return parseFloat(v) / 100 * base;
    if (v.slice(-2) === 'px') return parseFloat(v);
    const n = parseFloat(v); return isNaN(n) ? null : n;
  };
  const rectOf = (el) => {
    if (el.id === 'dsLayoutCanvas') return { left: 0, top: 0, width: PW, height: PH };
    const par = el.parentElement;
    if (!par || par === window.document.body || par === window.document.documentElement) return { left: 0, top: 0, width: 0, height: 0 };
    const pr = rectOf(par);
    const s = el.style;
    const w = len(s.width, pr.width) || 0;
    const h = len(s.height, pr.height) || (el.dataset && el.dataset.idx !== undefined ? 24 : 0);
    let x = len(s.left, pr.width), y = len(s.top, pr.height);
    if (x === null) { const r = len(s.right, pr.width); x = r === null ? 0 : pr.width - r - w; }
    if (y === null) { const b = len(s.bottom, pr.height); y = b === null ? 0 : pr.height - b - h; }
    if ((s.transform || '').indexOf('translate(-50%') >= 0) { x -= w / 2; y -= h / 2; }
    return { left: pr.left + x, top: pr.top + y, width: w, height: h };
  };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const r = rectOf(this);
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  };
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return rectOf(this).width; } });

  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const __mount = (els, sel) => {
      editorialContent.layoutPages = [{ id: 'pgChrome', type: 'moodboard', title: 'Chrome', elements: els }];
      _mbEditTarget = null; _mbPageIndex = 0;
      _dsPages = [{ kind: 'layout', page: editorialContent.layoutPages[0] }]; _dsIndex = 0;
      _mbActiveCanvasId = 'dsLayoutCanvas';
      Array.from(document.querySelectorAll('#dsLayoutCanvas')).forEach(el => el.remove());
      const cv = document.createElement('div'); cv.id = 'dsLayoutCanvas';
      cv.style.cssText = 'position:absolute; left:0; top:0; width:936px; height:540px;';
      document.body.appendChild(cv);
      _mbSelected = sel; _mbSel = [sel];
      renderMoodboardCanvas();
      return cv;
    };
    const __outside = (cv) => {
      const out = [];
      cv.querySelectorAll('[data-mb-pin]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.left < -0.01 || r.top < -0.01 || r.right > 936.01 || r.bottom > 540.01) out.push((el.title || el.style.cursor || el.textContent || 'control') + ' at ' + Math.round(r.left) + ',' + Math.round(r.top));
      });
      return out;
    };

    __check('a full-bleed image keeps all eight resize handles and its pan disc on the page', () => {
      const cv = __mount([{ type: 'image', x: 0, y: 0, w: 1, h: 1, img: 'data:image/png;base64,AAAA', aspect: 1.73 }], 0);
      const pins = cv.querySelectorAll('[data-mb-pin]');
      if (pins.length < 9) throw new Error('expected 8 handles + a pan disc to be marked, found ' + pins.length);
      const bad = __outside(cv);
      if (bad.length) throw new Error('controls still off the page (the reported bug): ' + bad.join('; '));
    });

    __check('a text box pushed to the right edge keeps its settings button on the page', () => {
      const cv = __mount([{ type: 'text', text: 'Heading', x: 0.7, y: 0.4, w: 0.3 }], 0);
      const gear = Array.from(cv.querySelectorAll('button')).find(b => b.textContent === '+');
      if (!gear) throw new Error('no settings button rendered on the selected text box');
      if (!gear.dataset.mbPin) throw new Error('the settings button is not marked for clamping');
      const bad = __outside(cv);
      if (bad.length) throw new Error('controls still off the page: ' + bad.join('; '));
    });

    __check('a box well inside the page keeps its chrome exactly where it was', () => {
      const cv = __mount([{ type: 'text', text: 'Body', x: 0.3, y: 0.4, w: 0.3 }], 0);
      const gear = Array.from(cv.querySelectorAll('button')).find(b => b.textContent === '+');
      if (!gear) throw new Error('no settings button');
      if (gear.style.right !== '-20px') throw new Error('an unclipped control was moved anyway: right=' + gear.style.right + ' left=' + gear.style.left);
    });

    __check('a canvas that measures zero is left alone', () => {
      const cv = document.createElement('div');
      const box = document.createElement('div'); cv.appendChild(box);
      const h = document.createElement('div'); h.dataset.mbPin = 'edge'; h.style.right = '-4px'; box.appendChild(h);
      cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
      _mbPinChrome(cv);
      if (h.style.right !== '-4px') throw new Error('a detached canvas pinned its chrome to nowhere');
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
