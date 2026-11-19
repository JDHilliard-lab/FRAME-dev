// Clip 1: floor plan. Upload the plan, pin ART.1, draw its wall line, make it a triptych.
const path = require('path');
const { open, sleep } = require('./rec.js');
const PLAN = path.join(__dirname, 'assets', 'PLAN.TIDE.L1_A-101.png');
(async () => {
  const c = await open(1440, 900);
  // off camera: a new project, ART.1 as Framed Art, the next-step bar put away
  await c.s.ev(`(() => { _startNewProject({ name: 'The Tideline Hotel', client: 'Tideline Hospitality', unit: 'in' });
    _dsFpSetCategory('ART.1', 'framed'); dashProjectData.forEach(r => { r.location = 'LOBBY'; });
    _nextStepDismissed = true; try { _syncNextStep(); } catch (e) {} _dsRenderTools(); _dsRenderCenter(); })()`);
  await sleep(4000);
  await c.overlay();
  await c.start();
  await c.cap('<b>Build a floor plan</b>: plan image, a pin, its wall line, a triptych', 2600);

  await c.cap('<span class="n">1</span>Click <b>Upload floor plan</b> and pick the client’s plan', 300);
  await c.chooseFiles([PLAN]);
  await c.click('#dsCenter .fp-upload-slot', { after: 1800 });
  await c.zoom(560, 230, 880, 1100);

  await c.cap('<span class="n">2</span>Click <b>ART.1</b> in the list, then click the plan where it hangs', 300);
  await c.click(`(() => Array.from(document.querySelectorAll('#dsToolsPageBody .fp-item-row, #dsToolsPageBody [data-fp-row]')).find(r => /ART\\.1/.test(r.textContent)) || Array.from(document.querySelectorAll('#dsToolsPageBody *')).find(e => e.children.length === 0 && e.textContent.trim() === 'ART.1'))()`, { after: 700 });
  const pin = await c.imgPt('#dsCenter #dsFpPlanImg', 940, 222, 2000, 1300);
  await c.click(pin, { ms: 900, after: 1400 });

  await c.cap('<span class="n">3</span>Pen ▸ <b>Single</b>, then drag along the wall it hangs on', 300);
  await c.click('#dsToolsPageBody .fp-line-btn', { after: 700 });
  await c.click(`(() => Array.from(document.querySelectorAll('.frame-menu button')).find(e => /Single/.test(e.textContent)))()`, { after: 600 });
  const a = await c.imgPt('#dsCenter #dsFpPlanImg', 790, 192, 2000, 1300), b = await c.imgPt('#dsCenter #dsFpPlanImg', 1090, 192, 2000, 1300);
  await c.drag(a, b, { dragMs: 1300, after: 1600 });

  await c.full(800);
  await c.cap('<span class="n">4</span><b>Frames</b>, then pick <b>Triptych</b>: three pieces, A B C', 300);
  await c.click('#dsToolsPageBody .fp-frames-btn', { after: 1300 });
  await c.click('#frameSetPicker [data-set="n3"]', { ms: 900, after: 2200 });
  await c.zoom(300, 250, 860, 1100);
  await c.cap('Done: the pin, the wall line, and <b>ART.1 A / B / C</b> on the legend', 3400);
  await c.full(900);
  await c.cap('');
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); require('fs').mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '01-floor-plan.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-1'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
