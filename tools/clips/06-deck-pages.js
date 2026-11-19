// Clip 6: Deck Studio pages: retype the cover, move a page, a set on one page, presentation
// type and Include pages.
const path = require('path'), fs = require('fs');
const { open, sleep } = require('./rec.js');
const prep6 = require('./prep6.js');
(async () => {
  const c = await open(1440, 900);
  await prep6(c);
  await sleep(2500);
  await c.overlay();
  const byText = (sel, re) => `(() => Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find(e => ${re}.test(e.textContent.replace(/\\s+/g, ' ').trim()) && e.getBoundingClientRect().width > 0))()`;
  const rail = (t) => `(() => Array.from(document.querySelectorAll('[data-railcell]')).find(e => (e.getAttribute('data-railtext') || '').indexOf(${JSON.stringify(t)}) >= 0))()`;
  await c.start();
  await c.cap('<b>Deck Studio</b>: the pages of the presentation', 1200);

  await c.cap('<span class="n">1</span>Double-click text on a page to edit it (triple-click selects the line)', 200);
  await c.click('#dsCenter [data-ds-tgt="mb:1"]', { ms: 650, count: 2, after: 350 });
  await c.click('#dsCenter [data-ds-tgt="mb:1"]', { ms: 60, count: 3, after: 300 });   // triple-click: the whole line
  await c.type('THE TIDELINE HOTEL', 55);
  await c.click({ x: 1100, y: 830 }, { ms: 500, after: 700 });

  await c.cap('<span class="n">2</span>Drag a page in the rail to move it', 200);
  const from = await c.at(rail('art narrative')), to = await c.at(rail('process / timeline'));
  await c.dragNative(from, { x: to.x, y: to.box.y + 12 }, { dragMs: 1100, after: 900 });

  await c.cap('<span class="n">3</span>A set’s spec pages: one page per piece, or the whole set on <b>One page</b>', 200);
  await c.click(rail('art.1a'), { ms: 700, after: 1000 });
  await c.click(byText('#dsToolsPageBody button', /^One page$/), { ms: 700, after: 1800 });

  await c.cap('<span class="n">4</span><b>Project</b> tab: the presentation type sets which pages are in the deck', 200);
  await c.click('#dsTabBtnProject', { ms: 600, after: 900 });
  await c.click(byText('button', /^Wireframe$/), { ms: 650, after: 1400 });
  await c.click(byText('button', /^Art Development$/), { ms: 450, after: 1100 });
  await c.cap('<span class="n">4</span><b>Include pages</b>: tick a page on or off for this deck', 200);
  await c.click('#specInc_frameRec', { ms: 650, after: 1600 });
  await c.cap('');
  await c.full(500);
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '06-deck-pages.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-6'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
