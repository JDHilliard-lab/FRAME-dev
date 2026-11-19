// Clip 2: client elevation. Add the sheet, crop it, scale it off a printed dimension, fit the art
// wall, then measure the art on the wall.
const path = require('path'), fs = require('fs');
const { open, sleep } = require('./rec.js');
const prep2 = require('./prep2.js');
const SHEET = path.join(__dirname, 'assets', 'ELEV.TIDE.L1_A-401.png');
const ONLY_SHEET = process.argv.includes('--sheet');
(async () => {
  const c = await open(1440, 900);
  await prep2(c);
  await sleep(2500);
  await c.overlay();
  // sheet px -> screen, read live (the window pans and zooms itself between steps)
  const sp = async (px, py) => c.s.ev(`(() => { const v = document.querySelector('#ulSheetModal [data-uls-view]').getBoundingClientRect(); return { x: v.left + _ulSh.tx + ${px} * _ulSh.z, y: v.top + _ulSh.ty + ${py} * _ulSh.z }; })()`);
  await c.start();
  await c.cap('<b>Client elevation</b>: crop it, scale it, fit the wall, measure the art', 2600);

  await c.cap('<span class="n">1</span><b>Wall</b> tab ▸ <b>+ Add client sheet</b>, then pick the client’s elevation sheet', 300);
  await c.click('[data-elevtab="wall"]', { after: 900 });
  await c.chooseFiles([SHEET]);
  await c.click('[data-ul-sheet]', { after: 2200 });

  await c.cap('<span class="n">2</span><b>Crop</b>: drag a box round the elevation. The box is <b>exactly what prints</b>', 300);
  await c.drag(await sp(105, 300), await sp(935, 935), { dragMs: 1600, after: 1500 });
  await c.click('#ulSheetModal [data-uls-next]', { after: 1600 });

  await c.cap('<span class="n">3</span><b>Scale</b>: click both ends of a printed dimension, then type it', 300);
  const a = await sp(220, 820), b = await sp(860, 820);
  await c.zoom(Math.min(a.x, b.x) - 160, a.y - 300, (b.x - a.x) + 320, 1000);
  await c.click(a, { ms: 900, after: 700 });
  await c.click(b, { ms: 1100, after: 700 });
  await c.type('16\'-0"', 110);
  await sleep(900);
  await c.full(800);
  await c.click('#ulSheetModal [data-uls-next]', { after: 1500 });

  await c.cap('<span class="n">4</span><b>The art wall</b>: drag the green box onto the wall, floor on the floor', 300);
  const wb = await c.s.ev('_ulSh.wb');
  const mid = await sp(wb.x + wb.w / 2, wb.y + wb.h / 2);
  const tgt = await sp(220 + wb.w / 2, 760 - wb.h / 2);
  await c.drag(mid, tgt, { dragMs: 1300, after: 900 });
  await c.cap('<span class="n">4</span>Drag its corner to the top of the wall: <b>16\'-0" × 10\'-0"</b>', 300);
  const wb2 = await c.s.ev('_ulSh.wb');
  await c.drag(await sp(wb2.x + wb2.w, wb2.y), await sp(860, 360), { dragMs: 1300, after: 1400 });
  await c.cap('<span class="n">4</span>Or type the size the drawing gives: <b>16\'-0"</b>', 300);
  await c.click('#ulSheetModal [data-uls-ww]', { after: 200 });
  await c.s.ev(`document.querySelector('#ulSheetModal [data-uls-ww]').select()`);
  await c.type('16\'-0"', 110);
  await c.key('Enter', 'Enter', 13);
  await sleep(1300);
  await c.click('#ulSheetModal [data-uls-next]', { after: 2600 });
  console.log('after finish', JSON.stringify(await c.s.ev(`(() => { const e = elevations[currentElevIndex]; return { w: e.wallW, h: e.wallH, ul: !!e.underlay, uncal: e.underlay && e.underlay.uncal }; })()`)));
  if (ONLY_SHEET) { const r = await c.s.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(require('os').tmpdir(), 'clip2-sheet.png'), Buffer.from(r.result.data, 'base64')); process.exit(0); }

  // measure: wall edge to the art, floor to the art
  await c.cap('<span class="n">5</span><b>Measure</b> (M): click two points; it snaps to the wall, floor and frame edges', 300);
  await c.click('#lineToolBtn', { after: 700 });
  const fr = await c.s.ev(`(() => Array.from(document.querySelectorAll('#wall .frame-vis')).map(e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }).filter(b => b.w > 20).sort((p, q) => p.x - q.x))()`);
  const wall = await c.s.ev(`(() => { const b = document.getElementById('wall').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  console.log('frames', JSON.stringify(fr), 'wall', JSON.stringify(wall));
  const A = fr[0], C = fr[fr.length - 1];
  const yMid = A.y + A.h / 2;
  await c.zoom(wall.x - 60, wall.y + wall.h * 0.15, wall.w * 0.75, 900);
  await c.click({ x: wall.x + 1, y: yMid }, { ms: 900, after: 500 });
  await c.click({ x: A.x, y: yMid }, { ms: 900, after: 1200 });
  const fx = A.x + A.w / 2;
  await c.click({ x: fx, y: A.y + A.h }, { ms: 900, after: 500 });
  await c.click({ x: fx, y: wall.y + wall.h - 1 }, { ms: 900, after: 1400 });
  await c.key('Escape', 'Escape', 27);
  await c.full(900);
  await c.cap('Done: the client’s wall behind the art, to scale, with your dimensions', 3400);
  await c.cap('');
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '02-client-elevation.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-2'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
