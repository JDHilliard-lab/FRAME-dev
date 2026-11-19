// Clip 0: start a new project, and where its name, code, location and version show: the footer.
const path = require('path'), fs = require('fs');
const { open, sleep } = require('./rec.js');
(async () => {
  const c = await open(1440, 900);
  // off camera: the start screen, as a designer opening Farmhand sees it. The next-step bar is
  // kept out of the shot (it sits where the captions go).
  await c.s.ev(`(async () => { _syncNextStep = () => {}; const b = document.querySelector('.next-step, #nextStepBar'); if (b) b.remove(); await openStartScreen(); })()`);
  await sleep(1500);
  await c.overlay();
  await c.start();
  await c.cap('<b>Start a new project</b>, and see where its details print', 1800);

  await c.cap('<span class="n">1</span><b>New project</b>: name it, add the client, pick the units', 200);
  await c.click(`(() => Array.from(document.querySelectorAll('.ss-card')).find(b => /New project/i.test(b.textContent)))()`, { after: 700 });
  await c.click('.ss-form input[name="name"]', { ms: 500, after: 150 });
  await c.type('The Tideline Hotel', 45);
  await c.click('.ss-form input[name="client"]', { ms: 450, after: 150 });
  await c.type('Tideline Hospitality', 40);
  await sleep(400);
  await c.click('.ss-form .ss-go', { ms: 600, after: 2200 });

  await c.cap('<span class="n">2</span>Open the <b>Project</b> tab: the name you typed prints in the <b>footer</b>', 200);
  await c.click('#dsTabBtnProject', { after: 1100 });
  const nm = await c.at('#specPdfProjName'), pv = await c.at('#dsProjCoverPrev [data-ds-footer]');
  const x0 = nm.box.x - 20, y0 = nm.box.y - 70, x1 = pv.box.x + pv.box.w + 10;
  await c.zoom(x0, y0, x1 - x0, 900);
  const foot = async () => { const b = (await c.at('#dsProjCoverPrev [data-ds-footer]')).box; return { x: b.x + 4, y: b.y + b.h - 25, w: b.w * 0.3, h: 18 }; };
  await c.callout(await foot(), 2800, 'The footer, every page');

  await c.cap('<span class="n">3</span>Add the <b>code</b> and <b>location</b>: the footer updates as you type', 200);
  await c.click('#specPdfCode', { ms: 600, after: 150 });
  await c.type('TIDE-HFX', 65);
  await c.click('#specPdfLocation', { ms: 600, after: 150 });
  await c.type('Halifax, NS', 55);
  await sleep(500);
  await c.cap('Footer: <b>NAME \u2013 LOCATION | CODE.VERSION</b>', 100);
  await c.callout(await foot(), 3600, 'The footer now');
  await c.cap('');
  await c.full(600);
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '00-new-project.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-0'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
