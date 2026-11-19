// Clip 3: spec a piece on the Frame Dashboard: size, frame from the library, mat, artwork.
const path = require('path'), fs = require('fs');
const { open, sleep } = require('./rec.js');
const prep2 = require('./prep2.js');
const ART = path.join(__dirname, 'assets', 'TIDE-0001.jpg');
(async () => {
  const c = await open(1440, 900);
  await prep2(c);   // where the floor plan clip ends: ART.1 as a triptych
  await c.s.ev(`switchView('dashboard')`);
  await sleep(2000);
  await c.overlay();
  const field = async (sel, text) => { await c.click(sel, { ms: 420, after: 100 }); await c.s.ev(`document.querySelector(${JSON.stringify(sel)}).select()`); await c.type(text, 70); };
  await c.start();
  await c.cap('<b>Spec a piece</b> on the Frame Dashboard', 1000);

  await c.cap('<span class="n">1</span>Click the piece, then type its <b>overall size</b>', 200);
  await c.click(`(() => Array.from(document.querySelectorAll('#dashTableBody input, table input')).find(i => i.value === 'ART.1A') || Array.from(document.querySelectorAll('td')).find(t => /ART\\.1A/.test(t.textContent)))()`, { after: 500 });
  await c.zoom(560, 40, 880, 900);
  await field('#extW', '30');
  await field('#extH', '40');
  await c.key('Tab', 'Tab', 9);
  await sleep(700);

  await c.cap('<span class="n">2</span><b>Frame</b>: click it, search the library, pick one', 200);
  await c.full(600);
  await c.click('#swatchSelectedDisplay', { ms: 550, after: 1200 });
  await c.click('#fbSearch', { ms: 600, after: 150 });
  await c.type('walnut', 70);
  await sleep(1000);
  await c.click('#frameBrowser [data-fb-code="FA-BW26031"]', { ms: 750, after: 900 });

  await c.cap('<span class="n">3</span><b>Mat</b>: lock the four sides, then set the width', 200);
  await c.zoom(560, 40, 880, 800);
  await c.click('#m1Lock', { after: 400 });
  await field('#m1T', '4');
  await c.key('Tab', 'Tab', 9);
  await sleep(600);

  await c.cap('<span class="n">4</span><b>Artwork</b>: click the opening and pick the image', 200);
  await c.chooseFiles([ART]);
  await c.click('.art-add-btn', { ms: 550, after: 1100 });
  await c.move(1050, 470, 500);   // off the art, so its Replace / Remove hover does not show
  await c.cap('Done. The <b>image code</b> comes from the file name: <b>TIDE-0001</b>', 2600);
  await c.cap('');
  await c.full(600);
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '03-spec-a-piece.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-3'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
