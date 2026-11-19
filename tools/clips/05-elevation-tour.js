// Clip 5: the Elevation, end to end. Chapters (cuts between scenes are set up off camera):
// 1 a blank wall and + Add frames; 2 spacing tips; 3 every guide; 4 drag the person and a
// dimension clear; 5 a 7-piece salon hang; 6 Wall, Context, Glass tabs; 7 Settings.
// node 05-elevation-tour.js [--upto N]  (stop after chapter N, for checking)
const path = require('path'), fs = require('fs');
const { open, sleep } = require('./rec.js');
const prep4 = require('./prep4.js');
const UPTO = (() => { const i = process.argv.indexOf('--upto'); return i > 0 ? parseInt(process.argv[i + 1], 10) : 99; })();
const art = (n) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'assets', n + '.jpg')).toString('base64');
(async () => {
  const c = await open(1440, 900);
  await prep4(c);
  // off camera: the specced triptych taken OFF its wall, so chapter 1 starts on a blank wall
  await c.s.ev(`(() => { const e = elevations[currentElevIndex]; e.frames.splice(0); e.dimTo = undefined; initElevControls(); drawElevAll(); switchElevTab('art'); })()`);
  await sleep(1800);
  await c.overlay();
  const id = (s) => '#' + s;
  const wallBox = () => c.s.ev(`(() => { const b = document.getElementById('wall').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const zoomWall = async (ms, padTop) => { const wr = await wallBox(); const zh = wr.h + 120, zw = Math.max(wr.w + 160, zh * 1440 / 900); await c.zoom(wr.x + wr.w / 2 - zw / 2, wr.y - (padTop || 60), zw, ms || 700); };
  const btnText = (t) => `(() => Array.from(document.querySelectorAll('button, label')).find(b => b.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(t)} && b.getBoundingClientRect().width > 0))()`;
  const guide = async (gid, cap, hold) => { await c.cap(cap, 100); await c.click(id(gid), { ms: 420, after: hold || 1100 }); };
  await c.start();

  // ── 1 · Blank wall, + Add frames ──
  await c.chapter('The Elevation', 'Lay out a wall, show what prints', 1800);
  await c.cap('<span class="n">1</span>A blank wall: <b>+ Add frames</b>, tick the pieces, <b>Add</b>', 200);
  await c.click(btnText('+ Add frames') + ' || ' + btnText('Add frames'), { ms: 600, after: 700 });
  for (const code of ['ART.1A', 'ART.1B', 'ART.1C']) {
    await c.click(`(() => Array.from(document.querySelectorAll('label')).find(l => l.textContent.indexOf(${JSON.stringify(code)}) >= 0 && l.getBoundingClientRect().width > 0))()`, { ms: 350, after: 120 });
  }
  await c.click(btnText('+ Add') + ' || ' + btnText('Add'), { ms: 450, after: 1400 });
  if (UPTO < 2) return finish();

  // ── 2 · Spacing tips ──
  await c.cap('<span class="n">2</span>Tip: <b>Align &amp; space</b> evens the gaps as you type', 200);
  await c.click('#alignBtn', { ms: 550, after: 600 });
  await c.click('#alignGapValue', { ms: 550, after: 100 });
  await c.s.ev(`document.getElementById('alignGapValue').select()`);
  await c.type('6', 80); await sleep(700);
  await c.cap('<span class="n">2</span>Then <b>Align to Hang Height</b> and <b>Center Group on Wall</b>', 100);
  await c.click('button[onclick="alignToHangHeight()"]', { ms: 550, after: 600 });
  await c.click('button[onclick="centerGroupOnWall()"]', { ms: 450, after: 600 });
  await c.click('button[onclick="closeAlignmentDialog()"]', { ms: 500, after: 400 });
  await c.cap('<span class="n">2</span>Tip: <b>Auto space</b> (the magnet) dimensions every gap', 200);
  await c.click('[data-elevtab="guides"]', { ms: 550, after: 400 });
  await c.click('#autoSpacingToggle', { ms: 500, after: 700 });
  const scopeBtn = `(() => { const p = document.getElementById('spacingScopePopup'); return p && Array.from(p.querySelectorAll('button')).find(b => /this/i.test(b.textContent)); })()`;
  if (await c.s.ev(`!!${scopeBtn}`)) await c.click(scopeBtn, { ms: 450, after: 1100 });
  if (UPTO < 3) return finish();

  // ── 3 · Every guide ──
  await c.chapter('Guides', 'What each one shows on the wall and the install page', 1500);
  await zoomWall(700);
  await guide('odToggle', '<b>Frame</b>: the overall size of each piece');
  await guide('edgeGapToggle', '<b>Edge gap</b>: from the art to the ends of the wall');
  await guide('outlineToggle', '<b>Outlines</b>: a line round every frame, so edges read on a busy wall');
  await c.click(id('outlineToggle'), { ms: 300, after: 200 });
  await guide('labelToggle', '<b>Letters</b>: A, B, C on each piece');
  await guide('imageCodeToggle', '<b>Image code</b>: the artwork code under each frame');
  await guide('spacingEQToggle', '<b>EQ</b>: prints EQ instead of the number on equal gaps');
  await c.click(id('spacingEQToggle'), { ms: 300, after: 200 });
  await guide('wireframeToggle', '<b>Wireframe</b>: grey blocks with letters, for early decks');
  await c.click(id('wireframeToggle'), { ms: 300, after: 200 });
  await guide('guideToggle', '<b>Hang / CL</b>: the hang height and the wall centre line');
  await guide('gridToggle', '<b>Grid</b>: a layout grid (size it in Settings)');
  await c.click(id('gridToggle'), { ms: 300, after: 200 });
  await guide('frameCenterToggle', '<b>Centers</b>: a crosshair on each piece');
  await c.click(id('frameCenterToggle'), { ms: 300, after: 200 });
  await guide('personToggle', '<b>Person</b>: a 6 ft figure for scale', 1400);
  if (UPTO < 4) return finish();

  // ── 4 · Drag things clear ──
  await c.chapter('Keep it clear', 'Drag the figure and the dimensions off the art', 1400);
  await zoomWall(600);
  await c.cap('<span class="n">4</span>Drag the <b>person</b> to an empty part of the wall', 200);
  const pb = await c.at('#person-wrap');
  const wr4 = await wallBox();
  await c.drag({ x: pb.x, y: pb.y + 40 }, { x: wr4.x + wr4.w - 95, y: pb.y + 40 }, { dragMs: 1300, after: 700 });
  await c.cap('<span class="n">4</span>Drag a dimension by its <b>arrows</b> so it clears the labels', 200);
  const arrows = await c.s.ev(`Array.from(document.querySelectorAll('#dim-layer .dim-arrow')).filter(e => getComputedStyle(e).cursor === 'ns-resize').map(e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }).sort((a, b) => a.y - b.y || a.x - b.x)`);
  const tops = arrows.filter((a, i, all) => a.y <= all[0].y + 2).sort((a, b) => a.x - b.x);
  for (const a of tops.slice(0, 2)) await c.drag(a, { x: a.x, y: a.y - 36 }, { ms: 500, dragMs: 800, after: 400 });
  await sleep(700);
  if (UPTO < 5) return finish();

  // ── 5 · A salon hang (set up off camera) ──
  c.pause();
  const arts = ['TIDE-0004', 'TIDE-0005', 'TIDE-0006', 'TIDE-0007', 'TIDE-0008', 'TIDE-0009', 'TIDE-0010'].map(art);   // none on the triptych: reusing one asks 'Image already used'
  await c.s.ev(`(async () => {
    const cat = (_artCats().find(x => _catCodeInfo(x.key).product === 'Framed Art') || {}).key;
    const code = _fpAddCodes(cat, 1, { quiet: true, ctx: { level: 0 } });
    dashProjectData.forEach(r => { if (_artGroupKey(r.id) === code) r.location = 'BAR'; });
    _fpApplyFrameSet(code, 7, 's7-cluster');
    await new Promise(r => setTimeout(r, 1200));
    const rows = dashProjectData.filter(r => _artGroupKey(r.id) === code);
    const a = ${JSON.stringify(arts)};
    for (let i = 0; i < rows.length; i++) await FRAME_API.setArtwork(rows[i].id, a[i % a.length], 'TIDE-' + String(i + 4).padStart(4, '0') + '.jpg');
    const wi = elevations.findIndex(e => (e.frames || []).some(f => _artGroupKey(f.id) === code));
    switchView("elevation"); if (wi >= 0) _elevLoadWall(wi);
    elevations[wi].frames.forEach(f => { f.dimTo = []; f.selected = false; });
    const dl = document.getElementById('dim-layer'); dl.style.display = 'none'; document.getElementById('dimToggle').classList.remove('active');
    document.getElementById('person-wrap').style.display = 'none'; document.getElementById('personToggle').classList.remove('active');
    switchElevTab('guides'); drawElevAll();
    return { code: code, wi: wi, cur: currentElevIndex, walls: elevations.map(e => e.name + ':' + e.frames.map(f => f.id).join('/')) };
  })()`).then(v => console.log('salon', JSON.stringify(v)));
  await sleep(1800);
  c.resume();
  await c.chapter('A salon hang', 'Seven pieces from the frame-set presets', 1500);
  await c.full(10);
  await zoomWall(10);
  await c.cap('<span class="n">5</span><b>Spacing</b> on: every gap is dimensioned, placed clear of the frames', 200);
  await c.click('#dimToggle', { ms: 600, after: 2200 });
  await c.cap('<span class="n">5</span>Frame sizes and gaps for every piece, ready for the install page', 2400);
  if (UPTO < 6) return finish();

  // ── 6 · Wall, Context, Glass ──
  await c.chapter('Wall, Context, Glass', 'The room around the art', 1400);
  await c.full(10);
  await c.cap('<span class="n">6</span><b>Wall</b> tab: wall type, client elevation, finish and <b>paint</b>', 200);
  await c.click('[data-elevtab="wall"]', { ms: 600, after: 600 });
  await c.click('#wallColorSwatches button:nth-of-type(4)', { ms: 650, after: 1300 });
  await c.cap('<span class="n">6</span><b>Context</b> tab: furniture, doors and fixtures, drawn to size', 200);
  await c.click('[data-elevtab="context"]', { ms: 600, after: 500 });
  await c.click(`button[onclick="setContextPaletteCat('Office')"]`, { ms: 500, after: 500 });
  await c.click(`button[onclick="armContextShape('credenza')"]`, { ms: 500, after: 400 });
  const wr6 = await wallBox();
  await c.click({ x: wr6.x + wr6.w * 0.5, y: wr6.y + wr6.h * 0.86 }, { ms: 700, after: 1300 });
  await c.key('Escape', 'Escape', 27);
  await c.cap('<span class="n">6</span><b>Glass</b> tab: window runs and mullions, for window film', 200);
  await c.click('[data-elevtab="glass"]', { ms: 600, after: 600 });
  await c.click('button[onclick="addGlazingRun()"]', { ms: 550, after: 2400 });
  await c.s.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 });
  await c.s.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 4 });
  await sleep(500);
  if (UPTO < 7) return finish();

  // ── 7 · Settings ──
  await c.cap('<span class="n">7</span><b>Elevation settings</b> (the gear): dimension style, hang height, grid and nudge', 200);
  await c.click('button[onclick="openPrecisionModal()"]', { ms: 650, after: 3000 });
  await c.click('#precisionModal button[onclick="closeAnnotationStyleModal()"]', { ms: 600, after: 600 });
  await c.cap('That’s the Elevation. Every guide that is on prints on the wall’s pages.', 2400);

  return finish();
  async function finish() {
    await c.cap(''); await c.full(500); await c.stop();
    const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
    console.log(JSON.stringify(await c.encode(path.join(out, '05-elevation-tour.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-5'))));
    process.exit(0);
  }
})().catch(e => { console.error(e); process.exit(1); });
