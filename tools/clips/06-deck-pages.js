// Clip 6: Deck Studio pages. The four buttons (Project, Pages, Templates, Plans); retype the
// cover; move a page; add a page with + and make it Keywords; a dark page; Group A/B/C for a
// set; an elevation breaker; your own template category and template; then the Project tab:
// Include pages in a split screen with the page preview, and a presentation type.
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
  const inView = async (expr) => { await c.s.ev(`(() => { const e = ${expr}; if (e) e.scrollIntoView({ block: 'center' }); })()`); await sleep(350); };
  const plusAfter = (t) => `(() => { let n = ${rail(t)}; while (n && !(n.nextElementSibling && n.nextElementSibling.matches && n.nextElementSibling.matches('[data-insstrip]'))) n = n.parentElement; return n ? n.nextElementSibling.querySelector('button') : null; })()`;
  const ask = async (text) => {   // the name dialog: replace its text, then press its button
    await sleep(350);
    await c.s.ev(`(() => { const i = document.querySelector('.ask-fields input'); i.focus(); i.select(); })()`);
    await c.type(text, 45);
    await sleep(150);
    await c.click('.ask-fields .ask-actions button[type="submit"]', { ms: 400, after: 600 });
  };
  await c.start();
  const T0 = c.now(), mark = (n) => console.log('t', n, ((c.now() - T0) / 1000).toFixed(1));
  await c.cap('<b>Deck Studio</b>: build the pages of the presentation', 1000);

  mark(1);
  // 1. The four buttons
  await c.zoom(0, 40, 980, 500);
  await c.cap('<span class="n">1</span><b>Project</b>: the deck’s details and which pages are in it', 150);
  await c.click('#dsTabBtnProject', { ms: 500, after: 900 });
  await c.cap('<span class="n">1</span><b>Templates</b>: your library of page layouts', 150);
  await c.click('#dsTabBtnTemplates', { ms: 350, after: 900 });
  await c.cap('<span class="n">1</span><b>Plans</b>: jump to a floor plan’s page', 150);
  await c.click('#dsTabBtnPlans', { ms: 350, after: 500 });
  await c.click(byText('button, div, a', /^Level 1\s*1 placement$/), { ms: 350, after: 900 });
  await c.cap('<span class="n">1</span><b>Pages</b>: every page of the deck, in order', 150);
  await c.click('#dsTabBtnPages', { ms: 350, after: 500 });
  await c.full(500);

  mark(2);
  // 2. Edit text
  await inView(rail('cover'));
  await c.click(rail('cover'), { ms: 450, after: 400 });
  await c.cap('<span class="n">2</span>Double-click text to edit it (triple-click selects the line)', 200);
  await c.click('#dsCenter [data-ds-tgt="mb:1"]', { ms: 500, count: 2, after: 250 });
  await c.click('#dsCenter [data-ds-tgt="mb:1"]', { ms: 60, count: 3, after: 250 });
  await c.type('THE TIDELINE HOTEL', 32);
  await c.click({ x: 1100, y: 830 }, { ms: 400, after: 300 });

  mark(3);
  // 3. Move a page
  await c.cap('<span class="n">3</span>Drag a page in the rail to move it', 200);
  const from = await c.at(rail('art narrative')), to = await c.at(rail('process / timeline'));
  await c.dragNative(from, { x: to.x, y: to.box.y + 12 }, { dragMs: 850, after: 500 });

  mark(4);
  // 4. Add a page, make it Keywords
  await c.cap('<span class="n">4</span><b>+</b> between pages adds a page; <b>Templates</b> gives it a layout', 200);
  await c.click(plusAfter('art narrative'), { ms: 550, after: 500 });
  await c.click('#dsToolsBtnTemplates', { ms: 450, after: 300 });
  await c.click('#dsToolsTplSearch', { ms: 400, after: 100 });
  await c.type('keyw', 60);
  await sleep(350);
  await c.click(byText('#dsTools div', /^Keywords$/), { ms: 450, after: 700 });
  await c.click(byText('#dsCenter button', /^Apply to this page$/), { ms: 450, after: 800 });

  mark(5);
  // 5. Dark or light
  await c.cap('<span class="n">5</span><b>Page appearance</b>: a light or dark page', 200);
  await c.click('#dsToolsBtnPage', { ms: 400, after: 250 });
  await c.click(byText('#dsTools summary', /^page appearance/i), { ms: 400, after: 300 });
  await c.click(byText('#dsToolsPageBody button', /^Dark$/), { ms: 400, after: 1300 });
  await c.click(byText('#dsTools summary', /^page appearance/i), { ms: 300, after: 100 });   // fold it away again

  mark(6);
  // 6. A set on one page
  await inView(rail('art.1a'));
  await c.click(rail('art.1a'), { ms: 450, after: 600 });
  await c.cap('<span class="n">6</span><b>Group A/B/C</b>: each set on one page, for the whole deck', 200);
  await c.click(byText('#dsToolsPageBody button', /^Group A\/B\/C$/), { ms: 500, after: 1500 });

  mark(7);
  // 7. Elevation breaker
  await c.cap('<span class="n">7</span>Tick <b>Elevation breaker</b>: the wall gets a page before its set', 200);
  await c.click('#dsUnitBreaker', { ms: 450, after: 700 });
  await inView(rail('art.1abc'));
  await c.click(rail('art.1abc'), { ms: 450, after: 150 });
  c.pause(); await sleep(2600); c.resume();   // the wall capture renders: cut the wait
  await sleep(1300);

  mark(8);
  // 8. Your own templates
  await c.cap('<span class="n">8</span><b>Templates</b>: make a category for your own layouts', 200);
  await c.click('#dsTabBtnTemplates', { ms: 450, after: 600 });
  await c.click(byText('button', /^\+ Category$/), { ms: 450, after: 100 });
  await ask('Tideline');
  await c.cap('<span class="n">8</span><b>+ New template</b>, then file it in your category and save', 200);
  await c.click(byText('button', /^\+ New template$/), { ms: 450, after: 100 });
  await ask('Tideline Quote');
  const catSel = `(() => Array.from(document.querySelectorAll('#dsTools select')).find(s => Array.from(s.options).some(o => /Category: Tideline/.test(o.textContent)) && s.getBoundingClientRect().width > 0))()`;
  const cs = await c.at(catSel);
  await c.move(cs.x, cs.y, 400);
  await c.s.ev(`(() => { const s = ${catSel}; const o = Array.from(s.options).find(o => /Category: Tideline/.test(o.textContent)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(600);
  await c.click(byText('#dsTools button', /^Save (template|changes|to template)$/), { ms: 400, after: 500 });
  const tCat = `(() => Array.from(document.querySelectorAll('#dsRail *')).find(e => /^Tideline/.test((e.textContent || '').trim()) && e.children.length <= 3 && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 40))()`;
  console.log('library', await c.s.ev(`(() => { const t = (editorialContent.templates || []).find(t => t.name === 'Tideline Quote'); const cat = (editorialContent.templateCategories || []).find(k => k.label === 'Tideline'); return JSON.stringify({ t: t && t.type, cat: cat && cat.key, shown: !!${tCat} }); })()`));
  await c.s.ev(`(() => { const e = ${tCat}; if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); })()`);
  await sleep(700);
  const tc = await c.at(tCat);
  await c.zoom(0, tc.box.y - 200, 620, 600);   // the new category and its template, close up
  await sleep(1300);
  await c.full(500);

  mark(9);
  // 9. Project tab: Include pages, split with the page preview, then a presentation type
  await c.cap('<span class="n">9</span><b>Project</b>: untick a page and it leaves the deck', 200);
  await c.click('#dsTabBtnProject', { ms: 450, after: 700 });
  await c.split({ x: 272, y: 335, w: 420, h: 382 }, { x: 698, y: 118, w: 732, h: 520 }, 'Include pages', 'Page preview: the pages in the deck', 700);
  for (const id of ['specInc_timeline', 'specInc_understanding', 'specInc_strategy']) await c.click('#' + id, { ms: 500, after: 900 });
  await c.unsplit(500);
  await c.cap('<span class="n">9</span>A <b>presentation type</b> sets the pages for you', 200);
  await c.zoom(10, 110, 640, 700);
  await c.click(byText('button', /^Wireframe$/), { ms: 500, after: 700 });
  await c.full(1000);
  await sleep(1300);
  await c.cap('');
  mark('end');
  await c.stop();
  const out = path.join(__dirname, '..', '..', 'help', 'clips'); fs.mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(await c.encode(path.join(out, '06-deck-pages.webm'), path.join(require('os').tmpdir(), 'frame-clip-frames-6'))));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
