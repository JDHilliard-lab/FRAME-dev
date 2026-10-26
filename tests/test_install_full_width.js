// 19.72: per-page install and breaker layouts. Asked on the Ford Admin Rouge timeline wall:
// "I need to be able to customize individual pages for install guide ... I would like to
// only show the timeline wall on the page under the title, I would like the graphic to
// fill in the entire page from left to right within the safety area."
// (1) A Full width layout. (2) The panel's This page only choice stays put: it reset to
// All install pages on every rebuild, so a second per-page change went to every page.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, setTransform(){}, resetTransform(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const block = `
    _autosaveToldUser = true;
    scheduleAutosave = () => {};
    window.__SR = () => _safeFrameRect(936, 540);
    window.__render = async (opts) => {
      opts = opts || {};
      elevations = [{ id: 'w1', name: opts.name || 'TIMELINE WALL', wallW: 272, wallH: 100.5, frames: [{ id: 'ART.2A', letter: 'A', x: 15, y: 35, w: 30, h: 40, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.2A', location: 'Timeline', level: 0, extW: 30, extH: 40 }];
      floorplanLevels = [];
      editorialContent.installGuide = { noteSide: 'left', legend: true, perPage: opts.perPage || {} };
      editorialContent.installNotes = { keys: { verify: true }, list: [], edits: {} };
      editorialContent.pageFooters = {};
      _igNoCapture = false; for (const k in _igCapCache) delete _igCapCache[k];
      _captureElevWithGuides = async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', w: 2800, h: 1000, vec: [], floorFrac: 0.97, wallRightFrac: 0.995 });
      const rec = new CanvasPdfRec(936, 540);
      const imgs = [], texts = [];
      const oImg = rec.addImage, oText = rec.text;
      rec.addImage = function (d, f, x, y, w, h) { if (w > 50 && h > 50) imgs.push({ x, y, w, h }); return oImg.apply(this, arguments); };
      rec.text = function (s, x, y) { const str = Array.isArray(s) ? s.join(' ') : String(s); texts.push({ s: str, x, y, w: this.getTextWidth(str) }); return oText.apply(this, arguments); };
      _curFooter = _resolveFooter('spec:elev:0');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, Object.assign({}, elevations[0], { _idx: 0, _ovKey: 'ig:TIMELINE WALL' }), { PW: 936, PH: 540, M: 40 });
      return { imgs, texts };
    };
    // The panel, with the deck around it stubbed out.
    _dsRenderTools = () => {}; _dsRenderCenter = () => {}; _dsPriorityRerender = () => {}; _dsElevGuidesInto = () => {}; _dsPageElevIdx = () => -1;
    window.__ig = () => editorialContent.installGuide;
    window.__setIG = (o) => { editorialContent.installGuide = o; };
    window.__cfg = (k) => _igCfg(k);
    window.__panel = () => {
      const body = document.createElement('div'); document.body.appendChild(body);
      _dsInstallGuideControls(body, { _ovKey: 'ig:TIMELINE WALL', title: 'TIMELINE WALL' });
      return body;
    };
  `;
  window.eval(src + '\n' + block);
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const elev = (r) => { if (!r.imgs.length) throw new Error('no elevation image was placed'); return r.imgs[r.imgs.length - 1]; };
  const WIDE = { 'ig:TIMELINE WALL': { variant: 'elevWide' } };

  await check('EXACT ASK: Full width runs the wall from the left safety edge to the right one, under the title', async () => {
    const SR = window.__SR();
    const r = await window.__render({ perPage: WIDE });
    const im = elev(r);
    if (im.x > SR.L + 0.5) throw new Error('drawing starts at ' + im.x.toFixed(1) + ', safety edge ' + SR.L.toFixed(1));
    const wallR = im.x + im.w * 0.995;
    if (Math.abs(wallR - SR.R) > 0.5) throw new Error('wall ends at ' + wallR.toFixed(1) + ', safety edge ' + SR.R.toFixed(1));
    const heading = r.texts.find(t => t.s.indexOf('TIMELINE') >= 0);
    if (!heading || !(im.y > heading.y)) throw new Error('the drawing is not under the title');
  });
  await check('it is bigger than the same page with the notes column beside it', async () => {
    const wide = elev(await window.__render({ perPage: WIDE }));
    const plain = elev(await window.__render({}));
    if (!(wide.w > plain.w + 50)) throw new Error('full width ' + wide.w.toFixed(0) + 'pt vs ' + plain.w.toFixed(0) + 'pt');
  });
  await check('the notes go beside the title, clear of the heading and above the drawing; no legend', async () => {
    const r = await window.__render({ perPage: WIDE });
    const im = elev(r);
    const head = r.texts.find(t => t.s.indexOf('TIMELINE') >= 0);
    const note = r.texts.find(t => t.s === 'INSTALLATION NOTE');
    if (!note) throw new Error('the notes did not print');
    if (!(note.x > head.x + head.w)) throw new Error('notes start at ' + note.x.toFixed(1) + ', inside the heading (ends ' + (head.x + head.w).toFixed(1) + ')');
    const below = r.texts.filter(t => Math.abs(t.x - note.x) < 0.5 && t.y >= note.y).map(t => t.y);
    if (Math.max.apply(null, below) > im.y) throw new Error('a note line runs into the drawing');
    if (r.texts.some(t => t.s === 'A' && t.x < im.x + 1 && t.y < im.y)) throw new Error('a letter legend printed');
  });
  await check('only THIS page: another install page keeps its own layout', async () => {
    const SR = window.__SR();
    const r = await window.__render({ perPage: { 'ig:OTHER WALL': { variant: 'elevWide' } } });
    if (elev(r).x <= SR.L + 0.5) throw new Error('a page with no override went full width');
  });
  await check('EXACT ASK: the panel keeps "This page only" after a change, so the next change stays on this page', async () => {
    await window.__render({});
    let p = window.__panel();
    const btn = (root, txt) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === txt);
    btn(p, 'This page only').click();
    btn(p, 'Full width').click();                       // commit: the panel rebuilds
    const g = window.__ig();
    if (!(g.perPage['ig:TIMELINE WALL'] && g.perPage['ig:TIMELINE WALL'].variant === 'elevWide')) throw new Error('not stored for the page');
    if (g.variant) throw new Error('written deck-wide');
    p.remove(); p = window.__panel();
    const on = btn(p, 'This page only');
    if ((on.getAttribute('style') || '').indexOf('var(--ui-active)') < 0) throw new Error('the rebuilt panel is back on All install pages');
    btn(p, 'Elev only').click();
    if (window.__ig().variant) throw new Error('the SECOND change went to every page');
    if (window.__ig().perPage['ig:TIMELINE WALL'].variant !== 'elevOnly') throw new Error('second change not on the page');
    p.remove();
  });
  await check('a page with its own settings says so, and Reset puts it back on the deck settings', async () => {
    await window.__render({ perPage: WIDE });
    const p = window.__panel();
    const rb = p.querySelector('[data-ig-reset]');
    if (!rb) throw new Error('no reset');
    rb.click();
    if (window.__ig().perPage['ig:TIMELINE WALL']) throw new Error('override kept');
    p.remove();
  });
  await check('a breaker page can be Full width too', async () => {
    window.__setIG({ breakerVariant: 'elevWide' });
    if (window.__cfg('elevgrp:ART.2').variant !== 'elevWide') throw new Error('breaker variant clamped to elevOnly');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
