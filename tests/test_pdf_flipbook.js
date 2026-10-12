// The PDF build flip-book (18.18).
//
// Asked for: "a cool little animation behind the pop up window when generating
// the PDF ... the images in the presentation flipping through 0.5 seconds a
// slide ... full bleed". The pictures are the rail's thumbnail cache, in deck
// order, so the book costs no rendering. Checks cover: the stage sits behind the
// card, it fills from the cache in page order, it turns every 500ms, it falls back
// to artwork, it stays hidden with nothing to show, and hiding the overlay stops
// the timer (a leaked interval would keep a 1MB image list alive all session).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  window.__css = css;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };

    // Drive setInterval by hand so the 500ms rhythm is asserted, not waited for.
    const __realSI = window.setInterval, __realCI = window.clearInterval;
    let __iv = null;
    const __fakeTimers = () => {
      window.setInterval = (fn, ms) => { __iv = { fn, ms }; return 4242; };
      window.clearInterval = (id) => { if (id === 4242) __iv = null; };
      setInterval = window.setInterval; clearInterval = window.clearInterval;
    };
    const __restoreTimers = () => { window.setInterval = __realSI; window.clearInterval = __realCI; setInterval = __realSI; clearInterval = __realCI; };
    const __url = n => 'data:image/jpeg;base64,xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/PAGE' + n;

    __check('the stage is inside the overlay, BEHIND the progress card', () => {
      const o = document.getElementById('pdfBuildOverlay');
      const st = document.getElementById('pdfFlipStage');
      if (!st) throw new Error('no #pdfFlipStage');
      if (st.parentNode !== o) throw new Error('stage is not a child of the PDF overlay');
      if (o.firstElementChild !== st) throw new Error('stage is not first, so it would paint over the card');
      const card = st.nextElementSibling;
      const zc = parseInt(card.style.zIndex, 10);
      if (!(zc > 0) || card.style.position !== 'relative') throw new Error('the card is not lifted above the stage');
    });

    __check('the CSS makes the stage full bleed, hides it when empty, and pages cover', () => {
      const c = window.__css;
      if (c.indexOf('.pdf-flip { position: absolute; inset: 0;') < 0) throw new Error('stage is not full bleed');
      if (c.indexOf('.pdf-flip:empty { display: none; }') < 0) throw new Error('an empty stage would paint a black sheet over the app');
      if (c.indexOf('object-fit: cover') < 0) throw new Error('pages are not full bleed');
      if (c.indexOf('@keyframes pdfFlipTurn') < 0) throw new Error('no page-turn animation');
    });

    __check('EXACT REQUEST: the deck pages flip every 0.5s, in deck order, while the PDF builds', () => {
      __fakeTimers();
      try {
        _dsPages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        _dsThumbCacheKey = d => 'k:' + d.id;
        _dsThumbCache = { 'k:a': __url(1), 'k:b': __url(2), 'k:c': __url(3) };
        _pdfShowOverlay();
        const st = document.getElementById('pdfFlipStage');
        if (!__iv) throw new Error('no flip timer started when the overlay opened');
        if (__iv.ms !== 500) throw new Error('flips every ' + __iv.ms + 'ms, asked for 500');
        const top = () => Array.from(st.children).filter(c => !c.classList.contains('turn')).map(c => c.src)[0];
        if (top() !== __url(1)) throw new Error('first page shown is not the first page of the deck');
        __iv.fn();
        if (top() !== __url(2)) throw new Error('second flip did not show page 2');
        const turning = st.querySelector('.turn');
        if (!turning || turning.src !== __url(1)) throw new Error('page 1 is not the one turning away');
        if (st.lastElementChild !== turning) throw new Error('the turning page is not on top of the one it reveals');
        __iv.fn(); __iv.fn();
        if (top() !== __url(1)) throw new Error('the book does not loop back to the start');
        if (st.children.length > 2) throw new Error('old pages pile up in the stage: ' + st.children.length);
        _pdfHideOverlay();
        if (__iv) throw new Error('hiding the overlay left the flip timer running');
        if (st.children.length) throw new Error('hiding the overlay left pages in the stage');
      } finally { __restoreTimers(); }
    });

    __check('a page with no preview yet is skipped, and duplicates are dropped', () => {
      _dsPages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      _dsThumbCacheKey = d => 'k:' + d.id;
      _dsThumbCache = { 'k:a': __url(1), 'k:c': __url(1) };
      for (const k in _dsThumbLast) delete _dsThumbLast[k];
      const imgs = _pdfFlipImages();
      if (imgs.length !== 1 || imgs[0] !== __url(1)) throw new Error('got ' + imgs.length + ' images');
    });

    __check('no previews built yet: falls back to the artwork', () => {
      __fakeTimers();
      try {
        _dsPages = []; _dsThumbCache = {};
        for (const k in _dsThumbLast) delete _dsThumbLast[k];
        dashProjectData.length = 0;
        dashProjectData.push({ id: 'ART.1', artworkUrl: __url(7) }, { id: 'ART.2', artworkUrl: __url(8) }, { id: 'ART.3' });
        const imgs = _pdfFlipImages();
        if (imgs.length !== 2) throw new Error('expected the two artworks, got ' + imgs.length);
        _pdfShowOverlay();
        if (!document.getElementById('pdfFlipStage').children.length) throw new Error('artwork fallback did not reach the stage');
        _pdfHideOverlay();
      } finally { __restoreTimers(); }
    });

    __check('nothing to show: the stage stays empty and no timer runs', () => {
      __fakeTimers();
      try {
        _dsPages = []; _dsThumbCache = {};
        for (const k in _dsThumbLast) delete _dsThumbLast[k];
        dashProjectData.length = 0;
        _pdfShowOverlay();
        if (__iv) throw new Error('a timer is ticking over an empty book');
        if (document.getElementById('pdfFlipStage').children.length) throw new Error('stage is not empty');
        _pdfHideOverlay();
      } finally { __restoreTimers(); }
    });

    __check('a broken thumbnail cache can never stop the overlay opening', () => {
      _dsPages = [{ id: 'a' }];
      _dsThumbCacheKey = () => { throw new Error('boom'); };
      _pdfShowOverlay();
      if (document.getElementById('pdfBuildOverlay').style.display !== 'flex') throw new Error('overlay did not open');
      _pdfHideOverlay();
    });
  `;

  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
})();
