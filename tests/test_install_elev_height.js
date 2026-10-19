// 19.36: AN INSTALL PAGE'S ELEVATION IS AS TALL AS THE PAGE ALLOWS, WHATEVER THE HEADING.
//
// Reported on the Ford SLC install guide: ART.16 | CORRIDOR filled the page height, but
// ART.17 | WELLNESS ROOM 143 and ART.18 | BOOTHS / TOUCHDOWN 140, both just as narrow,
// sat under the title at about two thirds of the size. The rise-beside-the-title test
// asked whether the LEFT EDGE OF THE ROOM cleared the heading; a short heading cleared,
// a long one did not, and the drawing (anchored bottom-right, far from the heading)
// never came into it. Now the drawing's own left edge decides.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ scale(){}, fillRect(){}, drawImage(){}, measureText:(s)=>({width:(s||'').length*6}), fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, setTransform(){}, resetTransform(){} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const block = `
    _autosaveToldUser = true;
    window.__render = async (name, capW, capH, floorFrac) => {
      elevations = [{ id: 'w1', name: name, wallW: 60, wallH: 108, frames: [{ id: 'ART.16', letter: 'A', x: 15, y: 35, w: 30, h: 40, active: true, dimTo: [] }] }];
      dashProjectData = [{ id: 'ART.16', location: 'Corridor', level: 0, planPins: [{ lv: 0, x: 0.5, y: 0.5 }], planX: 0.5, planY: 0.5 }];
      // A plan, so the page takes the Elev + plan branch the Ford pages use: the left
      // column is what put the room's edge past a SHORT heading and not a long one.
      floorplanLevels = [{ name: 'Level 17', imageData: 'data:image/png;base64,AAAA' }];
      _loadImg = async () => ({ naturalWidth: 1600, naturalHeight: 1000, width: 1600, height: 1000, src: 'data:image/png;base64,AAAA' });
      editorialContent.installGuide = {}; editorialContent.pageFooters = {};
      _igNoCapture = false; for (const k in _igCapCache) delete _igCapCache[k];
      _captureElevWithGuides = async () => ({ dataUrl: 'data:image/jpeg;base64,AAAA', w: capW, h: capH, vec: [], floorFrac: floorFrac });
      const rec = new CanvasPdfRec(936, 540);
      const imgs = [], texts = [];
      const oImg = rec.addImage, oText = rec.text;
      rec.addImage = function (d, f, x, y, w, h) { if (w > 50 && h > 50) imgs.push({ x, y, w, h }); return oImg.apply(this, arguments); };
      rec.text = function (s, x, y) { const str = Array.isArray(s) ? s.join(' ') : String(s); texts.push({ s: str, x, y, w: this.getTextWidth(str) }); return oText.apply(this, arguments); };
      _curFooter = _resolveFooter('spec:elev:0');
      await _drawInstallGuidePage(rec, {}, 1, { location: '', code: '', version: '' }, Object.assign({}, elevations[0], { _idx: 0 }), { PW: 936, PH: 540, M: 40 });
      return { imgs, texts };
    };
  `;
  window.eval(src + '\n' + block);
  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };
  const elev = (r) => { if (!r.imgs.length) throw new Error('no elevation image was placed'); return r.imgs[r.imgs.length - 1]; };

  // A tall narrow wall, like the corridor / wellness / booth pages.
  await check('EXACT BUG: a narrow drawing is the same height under a long heading as a short one', async () => {
    const shortT = elev(await window.__render('ART.16 | Corridor', 300, 800));
    const longT = elev(await window.__render('ART.18 | Booths / Touchdown 140 and a long room name', 300, 800));
    if (Math.abs(shortT.h - longT.h) > 0.5) throw new Error('short heading ' + shortT.h.toFixed(1) + 'pt tall, long heading ' + longT.h.toFixed(1) + 'pt');
  });

  await check('the narrow drawing really did rise beside the title (else the check above proves nothing)', async () => {
    const r = elev(await window.__render('ART.18 | Booths / Touchdown 140 and a long room name', 300, 800));
    const heading = (await window.__render('ART.18 | Booths / Touchdown 140 and a long room name', 300, 800)).texts.find(t => t.s.indexOf('BOOTHS') >= 0 || t.s.indexOf('Booths') >= 0);
    if (!heading) throw new Error('no heading drawn');
    if (!(r.y < heading.y)) throw new Error('drawing top ' + r.y.toFixed(1) + ' is not above the heading baseline ' + heading.y.toFixed(1));
  });

  // A wide wall under a long heading: it must stay clear of every word of the title.
  await check('a WIDE drawing under a long heading never prints through the title', async () => {
    const r = await window.__render('ART.10A / 10B / 11 | Circulation C-101 with a very long name', 1600, 600);
    const im = elev(r);
    const hit = r.texts.filter(t => t.y < 140 && t.s.trim()).find(t => t.x < im.x + im.w && t.x + t.w > im.x && t.y > im.y && t.y - 30 < im.y + im.h);
    if (hit) throw new Error('"' + hit.s + '" overlaps the drawing');
  });

  await check('a medium drawing gets as tall as it can while still clearing the title', async () => {
    // Too wide to stand at full height beside a long heading, narrow enough to rise part way.
    const longR = elev(await window.__render('ART.17 | Wellness Room 143 plus more words', 700, 600));
    const veryLong = elev(await window.__render('ART.17 | Wellness Room 143 plus a great many more words here', 700, 600));
    if (!(longR.h >= veryLong.h - 0.5)) throw new Error('a shorter heading gave a SMALLER drawing');
    const r = await window.__render('ART.17 | Wellness Room 143 plus more words', 700, 600);
    const im = elev(r);
    const hit = r.texts.filter(t => t.y < 140 && t.s.trim()).find(t => t.x < im.x + im.w && t.x + t.w > im.x && t.y > im.y && t.y - 30 < im.y + im.h);
    if (hit) throw new Error('"' + hit.s + '" overlaps the drawing');
  });

  // 19.40: the drawing runs a little past the floor (ticks, leaders); its FLOOR, not its
  // bottom edge, sits on the floor plan's bottom line.
  await check('EXACT REQUEST: the wall\'s floor lines up with the bottom of the floor plan', async () => {
    const r = await window.__render('ART.16 | Corridor', 300, 800, 0.97);
    if (r.imgs.length < 2) throw new Error('expected the plan and the elevation, got ' + r.imgs.length + ' images');
    const plan = r.imgs[0], el = r.imgs[r.imgs.length - 1];
    const planBottom = plan.y + plan.h, floor = el.y + el.h * 0.97;
    if (Math.abs(floor - planBottom) > 0.5) throw new Error('floor at ' + floor.toFixed(2) + ', plan bottom at ' + planBottom.toFixed(2));
  });

  await check('a capture that does not report its floor is placed as before (bottom on the line)', async () => {
    const r = await window.__render('ART.16 | Corridor', 300, 800);
    const plan = r.imgs[0], el = r.imgs[r.imgs.length - 1];
    if (Math.abs((el.y + el.h) - (plan.y + plan.h)) > 0.5) throw new Error('moved without a floor to go by');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
