// 20.49: the floorplan Items row has a move-or-change menu (arrows) and a remove x that asks
// whether to keep the art on hold or delete it too.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const row = (id, extra) => Object.assign({ id: id, product: 'Framed Art', category: 'framed', extW: 20, extH: 20, qty: 1, level: 0 }, extra || {});
    const fr = (id, letter, x) => ({ id: id, letter: letter, x: x, y: 40, w: 20, h: 20, active: true, dimTo: [] });
    const LEVEL_SECTOR = '{level}.{type}.S{zone}-{nn}';
    const setup = (ids, pat) => {
      editorialContent = _editorialDefaults();
      editorialContent.codePattern = pat == null ? LEVEL_SECTOR : pat;
      floorplanLevels = [{ name: 'Level 03', imageData: '', imageName: '' }, { name: 'Level 04', imageData: '', imageName: '' }];
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = (ids || []).map(x => typeof x === 'string' ? row(x) : row(x[0], x[1]));
      elevations = [];
      currentElevIndex = 0; elevFrames = [];
      dashSelectedRowIndex = 0;
    };
    const ids = () => dashProjectData.map(r => r.id).join(' ');

    const PIC = 'data:image/png;base64,iVBORw0KGgo=';
    const art = (t) => ({ artworkUrl: PIC, artworkFile: t + '.jpg', artworkTitle: t });
    const SECTOR = '{level}.{type}.S{zone}-{nn}';
    const rowFor = (key) => { const g = _fpGroups().find(x => x.key === key); return _fpItemRow(g, { level: 0 }); };
    const menuBtn = (label) => Array.from(document.querySelectorAll('.frame-menu button')).find(b => b.textContent.indexOf(label) >= 0);
    const closeMenus = () => document.querySelectorAll('.frame-menu').forEach(m => m.remove());
    __check('EXACT ASK: every Items row has a move menu after the code and an x at the far right', () => {
      setup([['ART.1', {}], ['ART.2', {}]], '');
      const r = rowFor('ART.1');
      const kids = Array.from(r.children);
      const mv = r.querySelector('[data-fp-move="ART.1"]'), x = r.querySelector('[data-fp-del="ART.1"]');
      if (!mv || !x) throw new Error('buttons missing');
      if (kids.indexOf(mv) !== 2 || kids[kids.length - 1] !== x) throw new Error('order ' + kids.map(k => k.className).join(' | '));
      const head = _fpItemHeader();
      if (head && head.children.length !== kids.length) throw new Error('header ' + head.children.length + ' vs row ' + kids.length);
    });
    __check('x on a piece with art asks: keep the art on hold, or delete everything', () => {
      setup([['ART.1', art('Dune')], ['ART.2', {}]], '');
      rowFor('ART.1').querySelector('[data-fp-del]').onclick({ stopPropagation() {} });
      const btns = Array.from(document.querySelectorAll('#infoModalButtons button')).map(b => b.innerText || b.textContent);
      if (btns.join('|') !== 'Remove, keep the art on hold|Delete everything, art too|Cancel') throw new Error(btns.join('|'));
      Array.from(document.querySelectorAll('#infoModalButtons button')).find(b => (b.innerText || b.textContent).indexOf('keep the art') >= 0).onclick();
      if (ids() !== 'ART.1' || _artBin().length !== 1 || _artBin()[0].art.artworkTitle !== 'Dune') throw new Error(ids() + ' bin ' + _artBin().length);
    });
    __check('Delete everything removes the art too', () => {
      setup([['ART.1', art('Dune')], ['ART.2', {}]], '');
      deletePlacement('ART.1');
      Array.from(document.querySelectorAll('#infoModalButtons button')).find(b => (b.innerText || b.textContent).indexOf('art too') >= 0).onclick();
      if (ids() !== 'ART.1' || _artBin().length) throw new Error(ids() + ' bin ' + _artBin().length);
    });
    __check('the move menu lists rename, swap, levels, sector, art and remove', () => {
      setup([['L3.ART.S16-01', art('Kelp')], ['L3.ART.S16-02', { zone: '16' }]], SECTOR);
      dashProjectData[0].zone = '16';
      closeMenus();
      rowFor('L3.ART.S16-01').querySelector('[data-fp-move]').onclick({ stopPropagation() {} });
      const txt = Array.from(document.querySelectorAll('.frame-menu button')).map(b => b.textContent).join(' / ');
      ['Rename code', 'Swap code with', 'Level 03', 'Level 04', 'Change sector', 'Move Kelp to another piece', 'Put its art on hold', 'Art on hold', 'Remove L3.ART.S16-01'].forEach(w => { if (txt.indexOf(w) < 0) throw new Error('missing ' + w + ': ' + txt); });
      closeMenus();
    });
    __check('Move to level from the menu moves the code', () => {
      setup([['L3.ART.S16-04', { zone: '16', level: 0 }], ['L4.ART.S24-01', { zone: '24', level: 1 }]], SECTOR);
      floorplanLevels[0].zone = '16'; floorplanLevels[1].zone = '24';
      closeMenus();
      rowFor('L3.ART.S16-04').querySelector('[data-fp-move]').onclick({ stopPropagation() {} });
      menuBtn('Level 04').onclick({ stopPropagation() {} });
      if (ids().indexOf('L4.ART.S24-02') < 0) throw new Error(ids());
      closeMenus();
    });
    __check('Swap code with from the menu', () => {
      setup([['ART.1', { location: 'A' }], ['ART.2', { location: 'B' }]], '');
      closeMenus();
      rowFor('ART.1').querySelector('[data-fp-move]').onclick({ stopPropagation() {} });
      menuBtn('Swap code with').onclick({ stopPropagation() {} });
      const sel = document.querySelector('[data-swap="target"]'); sel.value = 'ART.2';
      document.querySelector('[data-swap="go"]').onclick();
      if (dashProjectData.find(r => r.location === 'A').id !== 'ART.2') throw new Error(ids());
    });
    __check('Put its art on hold from the menu keeps the piece, empty', () => {
      setup([['ART.1', art('Moss')], ['ART.2', {}]], '');
      closeMenus();
      rowFor('ART.1').querySelector('[data-fp-move]').onclick({ stopPropagation() {} });
      menuBtn('Put its art on hold').onclick({ stopPropagation() {} });
      if (ids() !== 'ART.1 ART.2' || _rowHasArt(dashProjectData[0]) || _artBin().length !== 1) throw new Error('hold');
      closeMenus();
    });
    __check('Move art from the menu opens on that piece, not the selected one', () => {
      setup([['ART.1', {}], ['ART.2', art('Fog')], ['ART.3', {}]], '');
      dashSelectedRowIndex = 0;
      openMoveArtModal('ART.2');
      if (document.querySelector('#moveArtModal .ask-title').textContent.indexOf('Fog') < 0) throw new Error('wrong piece');
      document.getElementById('moveArtModal').remove();
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
