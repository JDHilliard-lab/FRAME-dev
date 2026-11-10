// 20.37: IMAGES IN THIS PROJECT, AND PACKAGE. Designers asked to see the names of the client
// elevations they drop in, and for "a list of all the images in the FRAME document and if
// you can export them or not, like InDesign's package". _projectImages reads the saved
// project; packageProject zips the project file and every image, and lists what it left out.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const any = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 0 : any, apply: () => any });
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: (s) => ({ width: (s || '').length * 6 }) }, { get: (o, k) => (k in o ? o[k] : any), set: (o, k, v) => { o[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  // data: URLs decode the way the browser's fetch does; anything else is unreachable.
  window.fetch = async (u) => { if (String(u).indexOf('data:') === 0) return await fetch(u); throw new Error('no network in test'); };
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  // As the other zip tests do: Node's JSZip (the page's own scheduler never runs under jsdom).
  window.JSZip = require(path.join(root, 'lib-jszip.min.js'));

  const PNG = 'data:image/png;base64,' + Buffer.from('fake-png-bytes-'.repeat(200)).toString('base64');
  const JPG = 'data:image/jpeg;base64,' + Buffer.from('fake-jpg-bytes-'.repeat(200)).toString('base64');
  const PLAN = 'data:image/png;base64,' + Buffer.from('fake-plan-bytes-'.repeat(200)).toString('base64');
  const MOOD = 'data:image/webp;base64,' + Buffer.from('fake-mood-bytes-'.repeat(200)).toString('base64');
  window.__IMG = { PNG, JPG, PLAN, MOOD };

  const block = `
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _toast = () => {}; showInfoModal = () => {};
    window.__seed = () => {
      const I = window.__IMG;
      document.getElementById('g_projName').value = 'Hub Phase B';
      dashProjectData = [
        { id: 'L3.ART.S16-02A', imageCode: 'FHB-0012', artworkFile: 'FHB-0012.png', artworkUrl: I.PNG, fCode: 'MICH-432-29', swatchDataUrl: I.JPG },
        { id: 'L3.ART.S16-02B', imageCode: 'TBD', artworkFile: 'FHB-0013.jpg' },
        { id: 'L3.ART.S16-03', imageCode: 'FHB-0014', artworkUrl: 'blob:https://example.com/abc' }
      ];
      elevations = [{ id: 'w1', name: 'L3.ART.S16-02 FLEX', wallW: 144, wallH: 108,
        frames: [{ id: 'L3.ART.S16-02A', artworkUrl: I.PNG, swatchDataUrl: I.JPG, fCode: 'MICH-432-29' }],
        underlay: { src: I.PNG.replace('fake-png', 'fake-elv'), name: 'A-501 Elevation 3', x: 0, y: 0, w: 144, h: 108 } }];
      elevations[0].underlay.src = 'data:image/png;base64,' + btoa('client-elevation-'.repeat(200));
      floorplanLevels = [{ name: 'Level 03', imageData: I.PLAN, imageName: 'L03-floor.png' }];
      floorplanImageData = I.PLAN; floorplanImageName = 'L03-floor.png';
      editorialContent.annotations = { 'spec:L3.ART.S16-02': [{ type: 'image', dataUrl: I.MOOD, fileName: 'mood-reference.webp' }] };
      currentElevIndex = 0;
    };
    window.__api = { _projectImages, packageProject, setUnderlayName, renderUnderlayControls, _imgPageLabel, get elevs() { return elevations; } };
  `;
  const quiet = console.error; console.error = () => {};
  window.eval(src + '\n' + block);
  console.error = quiet;
  const A = window.__api;
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const by = (l, kind) => l.filter(e => e.kind === kind);

  await check('EXACT ASK: the client elevation is listed by its name, with the wall it is on', async () => {
    window.__seed();
    const ce = by(A._projectImages(), 'clientElev');
    if (ce.length !== 1 || ce[0].name !== 'A-501 Elevation 3' || ce[0].uses[0] !== 'Wall L3.ART.S16-02 FLEX') throw new Error(JSON.stringify(ce.map(e => [e.name, e.uses])));
  });
  await check('one picture in several places is one entry with every use (artwork on its row and its wall)', async () => {
    window.__seed();
    const art = by(A._projectImages(), 'artwork').filter(e => e.code === 'FHB-0012');
    if (art.length !== 1) throw new Error(art.length + ' entries');
    if (art[0].uses.join('|') !== 'Item L3.ART.S16-02A|Wall L3.ART.S16-02 FLEX') throw new Error(art[0].uses.join('|'));
    const sw = by(A._projectImages(), 'swatch');
    if (sw.length !== 1 || sw[0].name !== 'MICH-432-29') throw new Error(JSON.stringify(sw.map(e => e.name)));
  });
  await check('floorplans, Deck Studio images and their names are listed, the plan once', async () => {
    window.__seed();
    const l = A._projectImages();
    const pl = by(l, 'plan'); if (pl.length !== 1 || pl[0].name !== 'L03-floor.png') throw new Error(JSON.stringify(pl.map(e => [e.name, e.uses])));
    const pg = by(l, 'page'); if (pg.length !== 1 || pg[0].name !== 'mood-reference.webp' || pg[0].uses[0] !== 'Spec page L3.ART.S16-02' || pg[0].ext !== 'webp') throw new Error(JSON.stringify(pg));
  });
  await check('EXACT ASK: whether each can be exported: in the file, not saved (blob), missing (a file name with no picture)', async () => {
    window.__seed();
    const l = A._projectImages();
    const st = (pred) => (l.find(pred) || {}).status || {};
    if (st(e => e.code === 'FHB-0012').key !== 'in') throw new Error('data image not in the file');
    if (st(e => e.code === 'FHB-0014').key !== 'blob') throw new Error('blob image not flagged: ' + JSON.stringify(st(e => e.code === 'FHB-0014')));
    if (st(e => e.name === 'FHB-0013.jpg').key !== 'missing') throw new Error('missing artwork not listed');
  });
  await check('EXACT ASK: Package zips the project file, every image in a folder per kind, and a contents list', async () => {
    window.__seed();
    const r = await A.packageProject({ noDownload: true });
    if (!r) throw new Error('no package');
    const z = await window.JSZip.loadAsync(Buffer.from(await r.blob.arrayBuffer()));
    const names = Object.keys(z.files).filter(n => !z.files[n].dir).sort();
    const base = r.fileName.replace(/ Package\.zip$/, '');
    const want = [
      base + '/01 Client elevations/A-501 Elevation 3.png',
      base + '/02 Artwork/FHB-0012.png',
      base + '/03 Floorplans/L03-floor.png',
      base + '/04 Deck Studio images/mood-reference.webp',
      base + '/07 Frame swatches/MICH-432-29.jpg',
      base + '/Package contents.txt',
      base + '/' + base + '.json'
    ].sort();
    if (JSON.stringify(names) !== JSON.stringify(want)) throw new Error(JSON.stringify(names));
    const proj = JSON.parse(await z.file(base + '/' + base + '.json').async('string'));
    if (proj.type !== 'frame-project-v7') throw new Error('project file is not a FRAME project');
    const img = await z.file(base + '/02 Artwork/FHB-0012.png').async('nodebuffer');
    if (img.toString() !== 'fake-png-bytes-'.repeat(200)) throw new Error('artwork bytes changed');
    const txt = await z.file(base + '/Package contents.txt').async('string');
    if (!/NOT INCLUDED \(2\)/.test(txt) || !/FHB-0013\.jpg: Missing/.test(txt) || !/FHB-0014: Not saved/.test(txt)) throw new Error('contents list: ' + txt);
  });
  await check('the Context panel shows and edits the drawing\'s name; clearing it deletes the key', async () => {
    window.__seed();
    A.renderUnderlayControls();
    const inp = document.querySelector('#underlayControls [data-ul-name]');
    if (!inp || inp.value !== 'A-501 Elevation 3') throw new Error('field ' + (inp && inp.value));
    A.setUnderlayName('  A-502 Elevation 1 ');
    if (A.elevs[0].underlay.name !== 'A-502 Elevation 1') throw new Error(A.elevs[0].underlay.name);
    A.setUnderlayName('');
    if ('name' in A.elevs[0].underlay) throw new Error('key kept');
  });
  await check('a dropped client elevation keeps its file name, less the extension', async () => {
    if (!/name: String\(\(file && file\.name\) \|\| ''\)\.replace\(\/\\\.\[A-Za-z0-9\]\{1,5\}\$\/, ''\)/.test(src)) throw new Error('importElevUnderlay does not record the file name');
  });
  await check('the Save menu offers Images and Package', async () => {
    const i = src.indexOf('function openSaveMenu()'), j = src.indexOf('\nfunction ', i + 10);
    const b = src.slice(i, j);
    if (b.indexOf("run: () => openImagesModal()") < 0 || b.indexOf("run: () => packageProject()") < 0) throw new Error('missing from the Save menu');
  });
  await check('page keys read as pages', async () => {
    const got = ['spec:elevgrp:L3.ART.S16-01', 'spec:L3.ART.S16-02', 'ig:LOBBY', 'fixed:cover'].map(A._imgPageLabel);
    if (got.join('|') !== 'Wall page L3.ART.S16-01|Spec page L3.ART.S16-02|Install page LOBBY|Page Cover') throw new Error(got.join('|'));
  });

  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL: ') + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
