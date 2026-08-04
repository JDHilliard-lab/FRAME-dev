// Reported: "My spec template thumbnails need to look better, currently they are
// all stretched and look more like the page thumbnail previews... they do not need
// an image in them, you can make the frame 24"x24" which is just a placeholder...
// I do not think it is necessary for the template thumbnails to try and render the
// actual thumbnails used in the spec. Same goes with frame corner, frame profiles,
// floorplan thumbnails, floorplan detail thumbnails, elevation thumbnails. Think of
// the wireframe. Also I'm having a hard time reading what each template has."
//
// The cards were rendering the REAL page for whichever piece happened to be
// selected: its photograph, its whole spec list, a crop of its floorplan and a
// capture of its wall. So four cards differed by everything at once and the one
// thing you were choosing — the arrangement — was the hardest thing to see. It also
// cost a page render plus a plan crop plus an elevation capture PER CARD PER PIECE,
// because the cache key carried the row id.
//
// Now: one standard demo piece (the dashboard's own 24" default, carrying no
// artwork, so the opening paints as a grey wireframe block), grey labelled boxes
// where the raster thumbnails go, one cache entry per template, and a ? on each
// card that says what the layout puts on the page.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  // ── Harness: a recording stand-in for the jsPDF doc, and stubs for every
  //    expensive raster so that ASKING for one is visible rather than silent.
  const setup = `
    window.__testResults = [];
    window.__check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__mkDoc = () => {
      const d = { ops: [], _fill: null, _draw: null };
      d.setFont = () => {}; d.setFontSize = () => {}; d.setTextColor = () => {};
      d.setLineWidth = () => {}; d.setLineDashPattern = () => {};
      d.setLineCap = () => {}; d.setLineJoin = () => {}; d.setLineHeightFactor = () => {};
      d.setFillColor = (r, g, b) => { d._fill = [r, g, b]; };
      d.setDrawColor = (r, g, b) => { d._draw = [r, g, b]; };
      d.getTextWidth = (s) => (('' + s).length * 3.4);
      d.splitTextToSize = (s) => ['' + s];
      d.text = (s, x, y) => d.ops.push({ t: 'text', s: '' + s, x: x, y: y });
      d.line = () => {};
      d.rect = (x, y, w, h, st) => d.ops.push({ t: 'rect', x: x, y: y, w: w, h: h, st: st, fill: d._fill && d._fill.slice() });
      d.circle = () => {}; d.roundedRect = () => {}; d.lines = () => {}; d.triangle = () => {};
      d.addImage = (s, f, x, y, w, h) => d.ops.push({ t: 'img', x: x, y: y, w: w, h: h });
      return d;
    };
    window.__calls = null;
    window.__resetCalls = () => { window.__calls = { frame: [], elev: 0, plan: 0, frameImgs: 0 }; };
    window.__resetCalls();
    renderFrameToCanvas = function (d, sw, opts) {
      window.__calls.frame.push(opts || {});
      return { canvas: { width: 400, height: 400, toDataURL: () => 'data:image/jpeg;base64,AA' } };
    };
    renderElevationToCanvas = async function () { window.__calls.elev++; return null; };
    _planCropCanvasForRow = async function () { window.__calls.plan++; return null; };
    _rowFrameImages = async function () { window.__calls.frameImgs++; return {}; };
    _drawPdfFooter = function () {};
    // JSDOM has no 2d canvas, and the artwork branch flattens onto one before encoding.
    document.createElement = ((orig) => function (tag) {
      const el = orig.call(document, tag);
      if ((tag + '').toLowerCase() === 'canvas') { el.getContext = () => ({ fillRect: () => {}, drawImage: () => {}, fillStyle: '' }); el.toDataURL = () => 'data:image/jpeg;base64,AA'; }
      return el;
    })(document.createElement);
    window.__seedProject = () => {
      dashUnit = 'in'; elevUnit = 'in';
      editorialContent.specDualUnit = '';
      editorialContent.wireframe = false;
      editorialContent.specArtOnly = {};
      // elevThumb OFF, which is the real default: the cards have to show the wall
      // thumbnail slot anyway, because they pin their own scale options.
      editorialContent.scaleOpts = { codes: 'frames', elevThumb: false };
      elevations = []; dashProjectData = [];
    };
    window.__greyBoxes = (doc) => doc.ops.filter(o => o.t === 'rect' && o.st === 'F' && o.fill && o.fill[0] === SPEC_SWATCH_FILL);
    window.__texts = (doc) => doc.ops.filter(o => o.t === 'text').map(o => o.s);

    // Three renders, awaited before any check runs. frameSpecDetail is the heaviest
    // single-piece template (spec block + plan crop + wall elevation + frame corner
    // AND profile); the same template with NO ctx.swatch is the control; setScale is
    // the group/as-hung path.
    //
    // Renders AND checks share this one eval on purpose: an indirect eval puts its
    // top-level const/let in a scope of its own, so SPEC_TEMPLATES, dashDefaultData
    // and editorialContent are simply not there in a second window.eval.
    window.__renders = (async () => {
      window.__seedProject(); window.__resetCalls();
      const d = _specTplDemoDesc('frameSpecDetail');
      const doc = window.__mkDoc();
      await _drawSpecPageTemplate(doc, {}, 1, {}, d.row, 'frameSpecDetail', { PW: 936, PH: 540, M: 40, swatch: true });
      window.__swatchRun = { doc: doc, calls: { elev: window.__calls.elev, plan: window.__calls.plan, frameImgs: window.__calls.frameImgs }, frameOpts: window.__calls.frame.slice() };

      window.__resetCalls();
      const doc2 = window.__mkDoc();
      await _drawSpecPageTemplate(doc2, {}, 1, {}, d.row, 'frameSpecDetail', { PW: 936, PH: 540, M: 40 });
      window.__realRun = { doc: doc2, calls: { elev: window.__calls.elev, plan: window.__calls.plan, frameImgs: window.__calls.frameImgs }, frameOpts: window.__calls.frame.slice() };

      window.__resetCalls();
      const g = _specTplDemoDesc('setScale');
      const doc3 = window.__mkDoc();
      await _drawSpecSetPageBody(doc3, {}, 1, {}, { rep: g.row, members: g.members, key: g._ovKey, demoSet: g._demoSet }, 'setScale', { PW: 936, PH: 540, M: 40, swatch: true });
      window.__setRun = { doc: doc3, calls: { elev: window.__calls.elev }, frameOpts: window.__calls.frame.slice() };

      // Shared specs is the card that has to show the frame corner + profile strip
      // and a spec block whose rows carry letters.
      window.__resetCalls();
      const g2 = _specTplDemoDesc('setLegend');
      const doc4 = window.__mkDoc();
      await _drawSpecSetPageBody(doc4, {}, 1, {}, { rep: g2.row, members: g2.members, key: g2._ovKey, demoSet: g2._demoSet }, 'setLegend', { PW: 936, PH: 540, M: 40, swatch: true });
      window.__legendRun = { doc: doc4, calls: { elev: window.__calls.elev }, frameOpts: window.__calls.frame.slice() };

      const S = window.__appSrc;
      const __check = window.__check, __seedProject = window.__seedProject;
      const __greyBoxes = window.__greyBoxes, __texts = window.__texts;

    // ── The demo piece ──────────────────────────────────────────────────────
    __check('the demo piece is the 24-inch square placeholder, not a real row', () => {
      __seedProject();
      const r = _specTplDemoRow(0);
      if (r.extW !== 24 || r.extH !== 24) throw new Error('expected a 24x24 demo, got ' + r.extW + 'x' + r.extH);
      if (r.artworkUrl) throw new Error('the demo carries artwork, so the opening will not read as a placeholder');
      if (r.swatchDataUrl) throw new Error('the demo carries a frame swatch image');
      if (!r.id) throw new Error('the demo has no item code to title the page with');
      // A real project row must not be able to leak in.
      dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.001', extW: 96, extH: 12 })];
      if (_specTplDemoRow(0).extW !== 24) throw new Error('the demo read a real dashboard row');
      dashProjectData = [];
    });

    __check('the demo converts into the project unit, so a cm deck does not print 24 cm', () => {
      __seedProject(); dashUnit = 'cm';
      const r = _specTplDemoRow(0);
      if (Math.abs(r.extW - 60.96) > 0.01) throw new Error('24in should be 60.96cm, got ' + r.extW);
      if (Math.abs(r.m1T - 7.62) > 0.01) throw new Error('a 3in mat should be 7.62cm, got ' + r.m1T);
      dashUnit = 'in';
      if (Math.abs(_specTplDemoRow(0).extW - 24) > 0.001) throw new Error('an inch deck should read 24');
    });

    __check('the salon hang is five pieces across three mouldings, with one float mount', () => {
      if (SPEC_TPL_DEMO_SALON.length !== 5) throw new Error('the salon should be five pieces, got ' + SPEC_TPL_DEMO_SALON.length);
      if (SPEC_TPL_DEMO_FRAMES.length !== 3) throw new Error('three mouldings, got ' + SPEC_TPL_DEMO_FRAMES.length);
      const used = new Set(SPEC_TPL_DEMO_SALON.map(s => s.frame || 0));
      if (used.size !== 3) throw new Error('the salon only uses ' + used.size + ' of the three mouldings, so Shared specs has nothing to split by letter');
      if (new Set(SPEC_TPL_DEMO_FRAMES.map(f => f.fCode)).size !== 3) throw new Error('two mouldings share a frame code');
      if (SPEC_TPL_DEMO_SALON.filter(s => s.float).length !== 1) throw new Error('exactly one float mount, so Mount / Matboard split by letter');
      // Letters run A..E off _setLetters, so the ids have to be in that order.
      SPEC_TPL_DEMO_SALON.forEach((s, i) => {
        const want = SPEC_TPL_DEMO_GROUP_ID + '-' + 'ABCDE'[i];
        if (s.id !== want) throw new Error('piece ' + i + ' is ' + s.id + ', expected ' + want);
      });
    });

    __check('the as-hung geometry matches the demo sizes, or the mockups letterbox in their slots', () => {
      // ONE table now: x/y live beside extW/extH, so they cannot drift apart.
      SPEC_TPL_DEMO_SALON.forEach(s => {
        if (!(s.extW > 0) || !(s.extH > 0)) throw new Error(s.id + ' has no size');
        if (!(s.x >= 0) || !(s.y > 0)) throw new Error(s.id + ' has no wall position');
      });
      // Staggered on purpose: frames on one baseline would make the as-hung cards
      // look exactly like Side by side.
      if (new Set(SPEC_TPL_DEMO_SALON.map(s => s.y)).size < 3) throw new Error('the salon is too flat to read as a salon hang');
      // A real hang: at least two rows, i.e. some piece sits fully below another.
      const rows = SPEC_TPL_DEMO_SALON.some(a => SPEC_TPL_DEMO_SALON.some(b => (a.y + a.extH) <= b.y));
      if (!rows) throw new Error('every piece overlaps every other vertically — this is a row, not a salon hang');
    });

    __check('the demo desc pins its template and stays out of every per-page map', () => {
      __seedProject();
      const d = _specTplDemoDesc('artSpecDetail');
      if (!d._manual || d._specTpl !== 'artSpecDetail') throw new Error('the template is not pinned, so the card re-resolves to the deck default');
      if (!d._tplSwatch) throw new Error('the desc does not declare swatch mode');
      if (d._ovKey !== SPEC_TPL_SWATCH_KEY) throw new Error('the demo uses a real page key: ' + d._ovKey);
      if (d.members.length !== 1) throw new Error('a single-piece template should get one demo piece');
      // The as-hung cards get the whole salon; Side by side only lays out four
      // columns and five stacked rows would be unreadable at card size, so those
      // two take the first three.
      if (_specTplDemoDesc('setScale').members.length !== 5) throw new Error('the as-hung card needs all five salon pieces');
      if (_specTplDemoDesc('setLegend').members.length !== 5) throw new Error('the shared-specs card needs all five salon pieces');
      if (_specTplDemoDesc('setRow').members.length !== 3) throw new Error('Side by side should demo three, got ' + _specTplDemoDesc('setRow').members.length);
      if (_specTplDemoDesc('setRight').members.length !== 3) throw new Error('Stacked should demo three');
      // The geometry has to travel WITH the rows — the demo pieces are on no wall.
      if (!Array.isArray(d._demoSet)) throw new Error('the desc does not carry its demo set');
    });

    __check('the demo rows really do carry three different mouldings', () => {
      __seedProject();
      const rows = _specTplDemoDesc('setLegend').members;
      const codes = new Set(rows.map(r => r.fCode));
      if (codes.size !== 3) throw new Error('the rendered rows only carry ' + codes.size + ' frame codes');
      if (new Set(rows.map(r => r.fW)).size < 2) throw new Error('every moulding is the same width, so Frame Size cannot split by letter');
      if (rows.filter(r => r.useFloatMount).length !== 1) throw new Error('the float mount did not reach the rows');
      if (!rows.every(r => r.fType === 'color' && !r.swatchDataUrl)) throw new Error('a demo row wants a swatch image it does not have');
    });

    // ── EXACT BUG: no real rasters on a card ────────────────────────────────
    __check('EXACT BUG: a card never renders the real elevation, floorplan or frame images', () => {
      const r = window.__swatchRun;
      if (r.calls.elev) throw new Error('THE BUG: the card captured a real wall elevation');
      if (r.calls.plan) throw new Error('THE BUG: the card cropped a real floorplan');
      if (r.calls.frameImgs) throw new Error('THE BUG: the card loaded the real corner/profile images');
    });

    __check('it draws labelled grey placeholders in their place instead of leaving holes', () => {
      const r = window.__swatchRun;
      const boxes = __greyBoxes(r.doc);       // floorplan + elevation + corner + profile
      if (boxes.length < 4) throw new Error('expected four placeholder boxes, got ' + boxes.length);
      if (boxes.some(b => !(b.w > 0) || !(b.h > 0))) throw new Error('a placeholder was drawn with no size');
      const t = __texts(r.doc);
      ['Floorplan', 'Elevation', 'Frame'].forEach(cap => {
        if (t.indexOf(cap) < 0) throw new Error('no "' + cap + '" caption — the card does not say what the box stands for');
      });
      // Same caption helper as the real page, so a card's labels match the page's.
      const i = S.indexOf('function _specSwatchBox');
      if (i < 0) throw new Error('_specSwatchBox is gone');
      if (S.slice(i, S.indexOf('\\nfunction ', i + 10)).indexOf('_specThumbCaption') < 0) throw new Error('the placeholder caption does not go through _specThumbCaption');
    });

    __check('the frame gets the wireframe grey block even though the deck is not a wireframe project', () => {
      if (_isWireframe()) throw new Error('the seed left the deck in wireframe mode, so this proves nothing');
      const r = window.__swatchRun;
      if (!r.frameOpts.length) throw new Error('no frame mockup was rendered at all');
      if (!r.frameOpts.every(o => o.wireframe === true)) throw new Error('THE BUG: the card asked for a photographic frame render');
      // No letter on it either: a letter identifies pieces on a wall, and there is
      // nothing to identify on a demo card.
      if (r.frameOpts.some(o => o.wireframeLetter)) throw new Error('a wireframe letter leaked onto the demo frame');
    });

    __check('the spec block still prints, whatever artwork-only flags a real ART.001 carries', () => {
      if (__texts(window.__swatchRun.doc).indexOf('Overall Dimensions') < 0) throw new Error('the card shows no spec lines, so two templates look the same');
      // The flag is looked up by item code, and the demo borrows a plausible one.
      const j = S.indexOf('async function _drawSpecPageTemplate');
      const body = S.slice(j, S.indexOf('\\nasync function ', j + 10));
      if (j < 0 || body.indexOf('const SWATCH = !!(ctx && ctx.swatch);') < 0) throw new Error('the swatch flag is gone from _drawSpecPageTemplate');
      if (body.indexOf('SWATCH ? false : _specArtOnly(r.id)') < 0) throw new Error('a real page-level artwork-only flag can still blank every card');
      if (/_specArtOnly\\(r\\.id\\)/.test(body.replace('SWATCH ? false : _specArtOnly(r.id)', ''))) throw new Error('a raw _specArtOnly(r.id) call is still left in the renderer');
    });

    __check('NONE of it leaks into the real page render', () => {
      const r = window.__realRun;
      // Without ctx.swatch the renderer must go back to the real thumbnails; the
      // stubs record that it asked for every one of them.
      if (!r.calls.plan) throw new Error('the real page stopped cropping its floorplan');
      if (!r.calls.frameImgs) throw new Error('the real page stopped loading its corner/profile images');
      if (r.frameOpts.some(o => o.wireframe === true)) throw new Error('swatch mode forced wireframe onto a real page');
      if (__greyBoxes(r.doc).length) throw new Error('placeholder boxes reached a real page');
      // ctx.swatch is a PARAMETER, not a module flag — the renderers await inside,
      // so a background thumbnail render interleaving with a card render would
      // otherwise come out full of grey boxes with nothing to say it happened.
      if (/^\\s*let _specTplSwatch\\b/m.test(S)) throw new Error('swatch mode went back to being a module flag');
    });

    // ── Group cards ─────────────────────────────────────────────────────────
    __check('a group card uses the stock as-hung arrangement and no wall capture', () => {
      const r = window.__setRun;
      if (r.calls.elev) throw new Error('THE BUG: the as-hung card captured a real wall');
      if (!r.frameOpts.length) throw new Error('no frames drawn on the as-hung card');
      if (!r.frameOpts.every(o => o.wireframe === true)) throw new Error('the as-hung card rendered photographic frames');
      const imgs = r.doc.ops.filter(o => o.t === 'img');
      if (imgs.length < SPEC_TPL_DEMO_SALON.length) throw new Error('expected one mockup per salon piece, got ' + imgs.length);
      // Placed from SPEC_TPL_DEMO_GEO, so they sit at DIFFERENT heights — the whole
      // point of this card being distinguishable from Side by side.
      if (new Set(imgs.map(o => Math.round(o.y))).size < 2) throw new Error('every frame landed at the same y — the demo geometry was ignored');
      if (!__greyBoxes(r.doc).length) throw new Error('the bottom-band wall thumbnail has no placeholder');
      const t = __texts(r.doc);
      if (t.indexOf('Elevation') < 0) throw new Error('the placeholder wall thumbnail is unlabelled');
      // The unit key is the swatch sentinel by design; it must not become the title.
      if (t.some(s => /TPLSWATCH/i.test(s))) throw new Error('the internal swatch key printed as the page title');
      if (t.indexOf(SPEC_TPL_DEMO_GROUP_ID.toUpperCase()) < 0) throw new Error('the group card is not titled with the demo group code');
    });

    __check('the as-hung cards advertise the wall thumbnail whatever the deck has ticked', () => {
      // scaleOpts.elevThumb is off by default, so without pinning it the two cards
      // that CAN show a wall thumbnail never did — and because the swatch cache key
      // is template + unit, a render that varied with it would also go stale the
      // moment you ticked the box under the cards.
      if (_scaleOpts().elevThumb) throw new Error('the seed left elevThumb on, so this proves nothing');
      if (window.__texts(window.__setRun.doc).indexOf('Elevation') < 0) throw new Error('the To scale card shows no wall thumbnail slot');
      const i = S.indexOf("const opts = SWATCH ?");
      if (i < 0) throw new Error('the card no longer pins its own scale options');
    });

    __check('the Shared specs card shows the frame corner + profile strip, one per moulding', () => {
      const r = window.__legendRun;
      const t = window.__texts(r.doc);
      // One code label per distinct moulding — the strip is this card's whole point.
      SPEC_TPL_DEMO_FRAMES.forEach(f => {
        if (!t.some(s => s.indexOf(f.fCode) === 0)) throw new Error('no strip entry for ' + f.fCode);
      });
      // A grey profile box beside each corner chip, plus the wall thumbnail.
      if (window.__greyBoxes(r.doc).length < SPEC_TPL_DEMO_FRAMES.length + 1) throw new Error('the profile drawings have no placeholder slots');
      // And the spec rows carry letters, which only happens when the set differs.
      if (!t.some(s => /\\b[A-E]\\/[A-E]/.test(s))) throw new Error('no spec row carries sharing letters, so the card cannot show what it is for');
    });

    // ── The cards themselves ────────────────────────────────────────────────
    __check('one swatch render per template, not one per template per page', () => {
      dashUnit = 'in'; editorialContent.specDualUnit = '';
      const a = _dsTplSwatchKey('frameRight');
      if (a !== _dsTplSwatchKey('frameRight')) throw new Error('the same template keyed two ways');
      if (a === _dsTplSwatchKey('artSpecDetail')) throw new Error('two templates share one cache entry');
      if (_dsQueueTplSwatch.length !== 2) throw new Error('_dsQueueTplSwatch still takes a per-page desc (arity ' + _dsQueueTplSwatch.length + ')');
      // The unit IS part of the key: the demo's numbers print in it.
      dashUnit = 'cm';
      if (_dsTplSwatchKey('frameRight') === a) throw new Error('a unit change reuses the old render, so the card prints inches on a cm deck');
      dashUnit = 'in';
    });

    __check('EXACT BUG: a card is a 936:540 box like a page thumbnail, not a square', () => {
      // The height used to be a px figure derived from a NOMINAL 150px card, so in a
      // narrower grid column the box stayed ~87 tall and squeezed the page into a
      // square. Both grids, and the same declaration the rail's page thumbnails use.
      const n = (S.match(/thumb\\.style\\.cssText = 'position:relative; width:100%; aspect-ratio:936\\/540;/g) || []).length;
      if (n !== 2) throw new Error('only ' + n + ' of the two template grids uses the page aspect ratio');
      if (/thumb\\.style\\.cssText = [^\\n]*height:' \\+ chh \\+ 'px/.test(S)) throw new Error('a card still pins its height to a nominal px figure');
      // The instant diagram must be laid out in PERCENT for the same reason — px
      // against a nominal width slides off a card that turned out narrower.
      const i = S.indexOf('function _dsSwatchBox');
      const box = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/left:' \\+ x \\+ 'px/.test(box)) throw new Error('the placeholder diagram still positions boxes in px');
      if (box.indexOf('_pc(') < 0) throw new Error('the placeholder diagram does not use the percent helper');
    });

    __check('the card image is contained, not stretched to the cell', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);       // it no-ops on a detached element
      _dsPaintTplSwatch(host, 'data:image/jpeg;base64,AA');
      const img = host.querySelector('img');
      if (!img) throw new Error('nothing was painted into the card');
      const style = img.getAttribute('style') || '';
      host.remove();
      if (!/object-fit:\\s*contain/.test(style)) throw new Error('the swatch image is still stretched to fill: ' + style);
    });

    __check('every template explains what it includes, and the card offers it two ways', () => {
      Object.keys(SPEC_TEMPLATES).forEach(k => {
        const h = SPEC_TEMPLATES[k].help;
        if (!h || h.length < 40) throw new Error(k + ' has no usable help text');
      });
      const info = _dsTplCardName('frameSpecDetail', ' \\u2713 default', '#6a6aff');
      if (!/corner/i.test(info.tip)) throw new Error('the hover tooltip does not describe the layout');
      if (info.tip.indexOf(SPEC_TEMPLATES.frameSpecDetail.label) !== 0) throw new Error('the tooltip does not lead with the label');
      const q = Array.from(info.row.querySelectorAll('button')).find(b => b.textContent === '?');
      if (!q) throw new Error('no ? button on the card');
      // Reading the blurb must not arm or apply the template behind the modal.
      let stopped = false;
      q.onclick({ stopPropagation: () => { stopped = true; }, preventDefault: () => {} });
      if (!stopped) throw new Error('the ? click bubbles to the card and picks the template');
      if (document.getElementById('infoModalTitle').innerText !== SPEC_TEMPLATES.frameSpecDetail.label) throw new Error('the ? opened the wrong thing');
      if ((document.getElementById('infoModalBody').innerText || '').indexOf('profile') < 0) throw new Error('the ? body is not the help text');
      document.getElementById('infoModal').style.display = 'none';
    });
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + setup);
    await window.__renders;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
