// Clip 7: Preflight and Generate PDF. Preflight's list, Page jumps to the problem, fix it, run
// again; then Generate PDF (pages, quality), the preview, the file name, Download.
const path = require('path'), fs = require('fs'), os = require('os');
const { open, sleep } = require('./rec.js');
const prep6 = require('./prep6.js');
(async () => {
  const c = await open(1440, 900);
  await prep6(c);   // the Tideline deck as video 6 starts it: cover still says COVER PAGE HEADING
  await sleep(2500);
  await c.overlay();
  const dl = path.join(os.tmpdir(), 'frame-clip-dl'); fs.mkdirSync(dl, { recursive: true });
  await c.s.cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl }).catch(() => {});
  const byText = (sel, re) => `(() => Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find(e => ${re}.test(e.textContent.replace(/\\s+/g, ' ').trim()) && e.getBoundingClientRect().width > 0))()`;
  // the button `label` on the Preflight row that starts with `start`
  const rowBtn = (start, label) => `(() => Array.from(document.querySelectorAll('#_dsPreflightModal button')).find(b => { if (b.textContent.trim() !== ${JSON.stringify(label)}) return false; let n = b.parentElement; while (n && n.textContent.length < 40) n = n.parentElement; return n && n.textContent.trim().indexOf(${JSON.stringify(start)}) === 0 && n.textContent.length < 400; }))()`;
  const wheel = async (x, y, dy, n) => { for (let i = 0; i < n; i++) { await c.s.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x, y: y, deltaX: 0, deltaY: dy }); await sleep(120); } };

  await c.start();
  await c.cap('<b>Preflight</b>, then <b>Generate PDF</b>: check the deck before it goes out', 1300);

  // 1. Preflight
  await c.cap('<span class="n">1</span>The badge counts what <b>Preflight</b> found. Click it for the list', 200);
  await c.zoom(160, 250, 560, 700);
  await sleep(500);
  await c.click('#dsPreflightBtn', { ms: 600, after: 300 });
  await c.zoom(400, 140, 760, 700);
  await sleep(2200);

  // 2. Jump to it and fix it
  await c.cap('<span class="n">2</span><b>Page</b> (or <b>Piece</b>) takes you to the problem', 200);
  await c.click(rowBtn('Cover', 'Page'), { ms: 700, after: 900 });
  await c.full(600);
  await c.cap('<span class="n">2</span>Fix it: here the cover still has the template words', 200);
  await c.click('#dsCenter [data-ds-tgt="mb:1"]', { ms: 550, count: 2, after: 250 });
  await c.click('#dsCenter [data-ds-tgt="mb:1"]', { ms: 60, count: 3, after: 250 });
  await c.type('THE TIDELINE HOTEL', 40);
  await c.click({ x: 1100, y: 830 }, { ms: 400, after: 400 });
  const sub = '#dsCenter [data-ds-tgt="mb:2"]';
  await c.click(sub, { ms: 500, count: 2, after: 250 });
  await c.click(sub, { ms: 60, count: 3, after: 250 });
  await c.type('LOBBY ART PROGRAM', 40);
  await c.click({ x: 1100, y: 830 }, { ms: 400, after: 700 });

  // 3. Run it again
  await c.cap('<span class="n">3</span>Run it again: the cover is off the list', 200);
  await c.click('#dsPreflightBtn', { ms: 600, after: 300 });
  await c.zoom(400, 140, 760, 700);
  await sleep(2000);
  await c.click(byText('#_dsPreflightModal button', /^Close$/), { ms: 600, after: 400 });
  await c.full(600);

  // 4. Generate PDF
  await c.cap('<span class="n">4</span><b>Generate PDF</b>: all pages or some, and the quality', 200);
  await c.click('#dsGenerateBtn', { ms: 700, after: 600 });
  const modal = await c.at('#dsGenerateModal > div');
  await c.zoom(modal.box.x - 120, modal.box.y - 60, Math.max(620, modal.box.w + 240), 700);
  await sleep(1600);
  await c.click(byText('#dsGenerateModal button', /^Generate$/), { ms: 650, after: 100 });
  c.pause(); await sleep(3500); c.resume();   // the deck builds and the viewer loads: cut the wait
  await c.full(700);
  await sleep(600);

  // 5. The preview, its file name, Download
  await c.cap('<span class="n">5</span>The <b>preview</b>: scroll through every page before you send it', 200);
  await c.move(900, 560, 500);
  await wheel(900, 560, 260, 14);
  await sleep(500);
  await wheel(900, 560, 400, 12);
  await sleep(900);
  await c.cap('<span class="n">5</span>The file name: <b>date</b>, <b>project</b>, <b>version</b>', 200);
  await c.callout({ x: 120, y: 112, w: 420, h: 30 }, 2600, 'File name', 4);
  await c.cap('<span class="n">5</span><b>Download</b> saves the PDF', 200);
  await c.click(byText('button', /^Download$/), { ms: 700, after: 1600 });
  await c.cap('');
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '07-preflight-pdf.webm'), path.join(os.tmpdir(), 'frame-clip-frames-7'))));
  console.log('downloaded', fs.readdirSync(dl));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
