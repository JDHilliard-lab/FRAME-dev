// Clip 4: lay out the wall: select the set, even gaps, hang height, centre it, then the
// dimensions that print.
const path = require('path'), fs = require('fs');
const { open, sleep } = require('./rec.js');
const prep4 = require('./prep4.js');
(async () => {
  const c = await open(1440, 900);
  await prep4(c);
  await c.s.ev(`switchElevTab('art')`);
  await sleep(2200);
  await c.overlay();
  const guide = (label) => `(() => Array.from(document.querySelectorAll('.layout-guide-btn')).find(b => b.textContent.trim() === ${JSON.stringify(label)} && b.getBoundingClientRect().width > 0))()`;
  const fr = await c.s.ev(`Array.from(document.querySelectorAll('#wall .frame-vis')).map(e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }).sort((a, b) => a.x - b.x)`);
  await c.start();
  await c.cap('<b>Lay out the wall</b>: spacing, hang height, the dimensions that print', 1000);

  await c.cap('<span class="n">1</span><b>Align &amp; space</b>: type the gap; it applies to every frame', 200);
  await c.click('#alignBtn', { ms: 600, after: 650 });
  await c.click('#alignGapValue', { ms: 600, after: 120 });
  await c.s.ev(`document.getElementById('alignGapValue').select()`);
  await c.type('6', 80);
  await sleep(800);

  await c.cap('<span class="n">2</span><b>Align to Hang Height</b>, then <b>Center Group on Wall</b>', 200);
  await c.click('button[onclick="alignToHangHeight()"]', { ms: 600, after: 700 });
  await c.click('button[onclick="centerGroupOnWall()"]', { ms: 450, after: 700 });
  await c.click('button[onclick="closeAlignmentDialog()"]', { ms: 550, after: 500 });
  const wb = await c.s.ev(`(() => { const b = document.getElementById('wall').getBoundingClientRect(); return { x: b.left + b.width * 0.5, y: b.top + b.height * 0.85 }; })()`);
  await c.click(wb, { ms: 500, after: 400 });   // empty wall: deselect, so the guides read clean

  await c.cap('<span class="n">3</span>Dimension the gaps: on <b>A</b> pick <b>B</b>, on <b>B</b> pick <b>C</b>', 200);
  await c.click(`button[onclick="toggleElevDimTarget(0, 'B', event)"]`, { ms: 600, after: 450 });
  await c.click(`button[onclick="toggleElevDimTarget(1, 'C', event)"]`, { ms: 500, after: 600 });

  await c.cap('<span class="n">4</span><b>Guides</b>: frame sizes, <b>spacing</b> and the <b>hang line</b>', 200);
  await c.click('[data-elevtab="guides"]', { ms: 550, after: 450 });
  await c.click(guide('Frame'), { ms: 550, after: 350 });
  await c.click(guide('Spacing'), { ms: 400, after: 350 });
  await c.click(guide('Hang / CL'), { ms: 550, after: 500 });
  await c.move(1240, 130, 500);
  const wr = await c.s.ev(`(() => { const b = document.getElementById('wall').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const zh = wr.h + 110, zw = Math.max(wr.w + 140, zh * 1440 / 900);
  await c.zoom(wr.x + wr.w / 2 - zw / 2, wr.y - 55, zw, 800);
  await c.cap('Even <b>6" gaps</b>, centred, hung at <b>57" to centre</b>', 2600);
  await c.cap('');
  await c.full(600);
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '04-lay-out-the-wall.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-4'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
