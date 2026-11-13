// 20.48: Art on hold. Art from deleted pieces is kept to place again; Delete placement,
// Move art, and a Level change that moves a placement and its code.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // A recording no-op context: every call is logged, every read returns something callable.
  window.__calls = [];
  const mkCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 5 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      return (...a) => { window.__calls.push([k, a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = mkCtx()); };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    window.__asyncChecks = [];
    let __chain = Promise.resolve();
    const __check = (label, fn) => {
      __chain = __chain.then(() => Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message })));
      window.__asyncChecks.push(__chain);
    };
    _autosaveToldUser = true;
    scheduleAutosave = () => {}; pushHistory = () => {};
    _loadImg = () => Promise.reject(new Error('no images in test'));

    const row = (id, extra) => Object.assign({ id: id, product: 'Framed Art', category: 'framed', extW: 20, extH: 20, qty: 1, level: 0 }, extra || {});
    const fr = (id, letter, x) => ({ id: id, letter: letter, x: x, y: 40, w: 20, h: 20, active: true, dimTo: [] });
    const LEVEL_SECTOR = '{level}.{type}.S{zone}-{nn}';
    const setup = (ids, pat) => {
      editorialContent = _editorialDefaults();
      editorialContent.codePattern = pat == null ? LEVEL_SECTOR : pat;
      floorplanLevels = [{ name: 'Level 03', imageData: '', imageName: '' }, { name: 'Level 04', imageData: '', imageName: '' }];
      elevUnit = 'in'; dashUnit = 'in';
      dashProjectData = (ids || []).map(x => typeof x === 'string' ? row(x) : row(x[0], x[1]));
      elevations = [];
      currentElevIndex = 0; elevFrames = [];
      dashSelectedRowIndex = 0;
    };
    const ids = () => dashProjectData.map(r => r.id).join(' ');

    const PIC = 'data:image/png;base64,iVBORw0KGgo=';
    const art = (t) => ({ artworkUrl: PIC, artworkFile: t + '.jpg', artworkTitle: t, artist: 'Ana Ruiz', imageCode: 'IMG-' + t, artworkW: 800, artworkH: 600 });
    const SECTOR = '{level}.{type}.S{zone}-{nn}';
    __check('EXACT BUG: deleting a piece threw its artwork away; now it waits in Art on hold', () => {
      setup([['ART.1', art('Dunes')], ['ART.2', {}]], '');
      dashSelectedRowIndex = 0;
      deleteDashRow();
      const bin = editorialContent.artBin || [];
      if (bin.length !== 1) throw new Error('bin ' + bin.length);
      const e = bin[0];
      if (e.art.artworkUrl !== PIC || e.art.artworkTitle !== 'Dunes' || e.art.artist !== 'Ana Ruiz' || e.from !== 'ART.1') throw new Error(JSON.stringify(e));
      if (dashProjectData.length !== 1) throw new Error('row not deleted');
      if (!_projectPayload().editorial.artBin || _projectPayload().editorial.artBin.length !== 1) throw new Error('not in the saved file');
    });
    __check('Remove on the artwork keeps it in the list and blanks the piece', () => {
      setup([['ART.1', art('Kelp')]], '');
      dashSelectedRowIndex = 0; loadDashDataIntoControls(dashProjectData[0]);
      clearDashArtwork();
      if (_artBin().length !== 1 || _rowHasArt(dashProjectData[0]) || dashProjectData[0].artworkTitle) throw new Error('bin ' + _artBin().length);
    });
    __check('Delete placement: every piece and wall frame goes, art kept, house codes close up', () => {
      setup([['ART.1', {}], ['ART.2A', art('A')], ['ART.2B', art('B')], ['ART.2C', {}], ['ART.3', art('C')]], '');
      elevations = [{ id: 'w1', name: 'ART.2 LOBBY', wallW: 120, wallH: 108, personPos: { x: -60 }, frames: [fr('ART.2A', 'A', 10), fr('ART.2B', 'B', 40), fr('ART.2C', 'C', 70)] }];
      const res = deletePlacementNow('ART.2');
      if (!res || res.kept !== 2 || res.pieces !== 3) throw new Error(JSON.stringify(res));
      if (ids() !== 'ART.1 ART.2') throw new Error(ids());
      if (dashProjectData[1].artworkTitle !== 'C') throw new Error('wrong piece renumbered');
      if (elevations[0].frames.length) throw new Error('frames left on the wall');
      if (_artBin().map(e => e.art.artworkTitle).join() !== 'A,B') throw new Error('bin');
    });
    __check('Delete placement in a sector project keeps the gap and refuses the last placement', () => {
      setup([['L3.ART.S16-01', { zone: '16' }], ['L3.ART.S16-02', { zone: '16' }], ['L3.ART.S16-03', { zone: '16' }]], SECTOR);
      deletePlacementNow('L3.ART.S16-02');
      if (ids() !== 'L3.ART.S16-01 L3.ART.S16-03') throw new Error(ids());
      setup([['ART.1', {}]], '');
      if (deletePlacementNow('ART.1')) throw new Error('deleted the last one');
    });
    __check('a wall deleted with its pieces keeps their art', () => {
      setup([['ART.1', art('Wave')], ['ART.2', {}]], '');
      elevations = [{ id: 'w1', name: 'ART.1', wallW: 120, wallH: 108, personPos: { x: -60 }, frames: [fr('ART.1', '', 10)] }, { id: 'w2', name: 'ART.2', wallW: 120, wallH: 108, personPos: { x: -60 }, frames: [fr('ART.2', '', 10)] }];
      currentElevIndex = 1;
      _deleteElevationNow(0, { withPieces: true });
      if (_artBin().length !== 1 || _artBin()[0].art.artworkTitle !== 'Wave') throw new Error('bin ' + _artBin().length);
    });
    __check('a set made smaller keeps the art of the pieces it drops', () => {
      setup([['ART.1A', art('X')], ['ART.1B', art('Y')], ['ART.1C', art('Z')]], '');
      _fpApplyFrameSetNow('ART.1', dashProjectData.slice(), 1, '');
      if (_artBin().map(e => e.art.artworkTitle).join() !== 'Y,Z') throw new Error(_artBin().map(e => e.art.artworkTitle).join());
    });
    __check('placing from the list: an empty piece takes it; a piece with art trades into the list', () => {
      setup([['ART.1', {}], ['ART.2', art('Old')]], '');
      editorialContent.artBin = [{ id: 'e1', art: art('Moon'), from: 'ART.9', location: 'HALL', level: 0, zone: '', category: 'framed', at: '2026-11-12', why: 'deleted' }];
      if (!artBinPlace('e1', 'ART.1', true) || dashProjectData[0].artworkTitle !== 'Moon' || _artBin().length) throw new Error('empty piece');
      editorialContent.artBin = [{ id: 'e2', art: art('Sun'), from: 'ART.9', level: 0, why: 'deleted' }];
      artBinPlace('e2', 'ART.2', true);
      if (dashProjectData[1].artworkTitle !== 'Sun' || _artBin().length !== 1 || _artBin()[0].art.artworkTitle !== 'Old') throw new Error('trade ' + JSON.stringify(_artBin()));
    });
    __check('a new placement for unplaced art: its sector, its location, the art on it', () => {
      setup([['L3.ART.S16-01', { zone: '16' }]], SECTOR);
      editorialContent.artBin = [{ id: 'e1', art: art('Fern'), from: 'L3.ART.S16-02', location: 'CAFE', level: 0, zone: '16', category: 'framed', why: 'deleted' }];
      const id = artBinNewPlacement('e1', null, true);
      if (id !== 'L3.ART.S16-02') throw new Error('id ' + id + ' ' + ids());
      const r = dashProjectData.find(x => x.id === id);
      if (r.artworkTitle !== 'Fern' || r.location !== 'CAFE' || r.zone !== '16' || _artBin().length) throw new Error(JSON.stringify([r.artworkTitle, r.location, r.zone]));
    });
    __check('moving art: to an empty piece, swapping, and bumping theirs to the list; walls follow', () => {
      setup([['ART.1', art('A')], ['ART.2', {}], ['ART.3', art('C')]], '');
      elevations = [{ id: 'w1', name: 'ART.2', wallW: 120, wallH: 108, personPos: { x: -60 }, frames: [Object.assign(fr('ART.2', '', 10), { artworkUrl: '' })] }];
      moveArtBetween('ART.1', 'ART.2', 'swap', true);
      if (dashProjectData[1].artworkTitle !== 'A' || _rowHasArt(dashProjectData[0])) throw new Error('move');
      if (elevations[0].frames[0].artworkUrl !== PIC) throw new Error('wall frame did not get the art');
      moveArtBetween('ART.2', 'ART.3', 'swap', true);
      if (dashProjectData[2].artworkTitle !== 'A' || dashProjectData[1].artworkTitle !== 'C') throw new Error('swap');
      moveArtBetween('ART.2', 'ART.3', 'bump', true);
      if (dashProjectData[2].artworkTitle !== 'C' || _rowHasArt(dashProjectData[1]) || _artBin()[0].art.artworkTitle !== 'A') throw new Error('bump');
    });
    __check("changing an item's Level moves its placement, sector and code", () => {
      setup([['L3.ART.S16-04A', { zone: '16', level: 0 }], ['L3.ART.S16-04B', { zone: '16', level: 0 }], ['L4.ART.S24-01', { zone: '24', level: 1 }]], SECTOR);
      floorplanLevels[0].zone = '16'; floorplanLevels[1].zone = '24';
      dashSelectedRowIndex = 0; loadDashDataIntoControls(dashProjectData[0]);
      const sel = document.getElementById('m_level'); sel.value = '1';
      _codesLevelEdited();
      const got = ids();
      if (got.indexOf('L4.ART.S24-02A') < 0 || got.indexOf('L4.ART.S24-02B') < 0) throw new Error(got);
      if (dashProjectData.some(r => r.level !== 1 || r.zone !== '24')) throw new Error(JSON.stringify(dashProjectData.map(r => [r.id, r.level, r.zone])));
    });
    __check('the Art on hold list: shows each entry and places one from its menu', () => {
      setup([['ART.1', {}]], '');
      editorialContent.artBin = [{ id: 'e1', art: art('Reed'), from: 'ART.4', location: 'BAR', level: 0, why: 'deleted', at: '2026-11-12' }];
      openArtBin();
      const row = document.querySelector('[data-ab-entry="e1"]');
      if (!row || row.textContent.indexOf('Reed') < 0 || row.textContent.indexOf('ART.4') < 0) throw new Error('row');
      const sel = row.querySelector('[data-ab="target"]'); sel.value = 'ART.1'; sel.onchange();
      row.querySelector('[data-ab="place"]').onclick();
      if (dashProjectData[0].artworkTitle !== 'Reed') throw new Error('not placed');
      if (!document.querySelector('[data-ab="empty"]')) throw new Error('list did not empty');
      document.getElementById('artBinModal').remove();
    });
    __check('the Move dialog swaps two pieces’ art', () => {
      setup([['ART.1', art('P')], ['ART.2', art('Q')]], '');
      dashSelectedRowIndex = 0;
      openMoveArtModal();
      const go = document.querySelector('[data-move-art="go"]');
      if (go.textContent !== 'Swap the two') throw new Error(go.textContent);
      go.onclick();
      if (dashProjectData[0].artworkTitle !== 'Q' || dashProjectData[1].artworkTitle !== 'P') throw new Error('swap');
    });
    __check('Images lists unplaced art; the API deletes a placement and keeps its art', () => {
      setup([['ART.1', art('K')], ['ART.2', {}]], '');
      const r = FRAME_API.deletePlacement('ART.1');
      if (!r.ok || r.artKept !== 1) throw new Error(JSON.stringify(r));
      const imgs = _projectImages().filter(e => e.uses.some(u => u.indexOf('Art on hold') === 0));
      if (imgs.length !== 1 || imgs[0].kind !== 'artwork' || imgs[0].code !== 'IMG-K') throw new Error(JSON.stringify(imgs.map(e => [e.kind, e.code, e.uses])));
      if (FRAME_API.unplacedArt()[0].title !== 'K') throw new Error('api list');
    });
  `;

  try {
    window.eval(src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  const all = await Promise.all(window.__asyncChecks || []);
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
