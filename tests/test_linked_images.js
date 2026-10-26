// 19.74: LINKED IMAGES, as InDesign links a placed file. Asked on the Ford Admin Rouge
// timeline wall: designers work in Illustrator, export the wallcovering, and update it;
// "we need to add in update image function in frame tool ... when you have an image
// linked ... you edit it in photoshop then save it you get a warning to update that
// specific file."
// A picture dropped from a file keeps its file handle (Chrome/Edge); when the file changes
// on disk FRAME says so and Update swaps the picture, keeping size, crop and position.
// Also: a wallcovering keeps more pixels than a framed print, and a transparent PNG
// (a didactic panel) is no longer flattened to black through JPEG.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // Images "load" at whatever size the test asks; the canvas reports alpha on demand.
  window.__imgSize = [4000, 1000]; window.__alpha = false;
  window.Image = class { constructor() { this.naturalWidth = window.__imgSize[0]; this.naturalHeight = window.__imgSize[1]; } set src(v) { this._s = v; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } };
  window.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage() {}, getImageData: (x, y, w, h) => { const d = new Uint8ClampedArray(8).fill(255); if (window.__alpha) d[7] = 0; return { data: d }; } };
  };
  window.HTMLCanvasElement.prototype.toDataURL = function (type) { return 'data:' + (type || 'image/png') + ';base64,W' + this.width + 'H' + this.height + 'V' + (window.__ver || 1); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    const tick = (ms) => new Promise(r => setTimeout(r, ms || 5));
    // A file on "disk": the handle reads whatever is there now.
    const disk = { file: null, perm: 'granted', gone: false };
    const mkFile = (name, mod, size) => { const f = new window.File(['x'.repeat(size || 10)], name, { type: name.endsWith('.png') ? 'image/png' : 'image/jpeg', lastModified: mod }); return f; };
    const handle = { kind: 'file', name: 'WALL.png',
      getFile: async () => { if (disk.gone) throw new Error('NotFoundError'); return disk.file; },
      queryPermission: async () => disk.perm, requestPermission: async () => { disk.perm = 'granted'; window.__asked = (window.__asked || 0) + 1; return 'granted'; } };
    const dropOf = (file) => ({ dataTransfer: { items: [{ kind: 'file', getAsFile: () => file, getAsFileSystemHandle: () => Promise.resolve(handle) }] } });
    const seed = () => {
      const r = _cloneData(dashDefaultData);
      Object.assign(r, { id: 'ART.3', product: 'Wallcovering (EGD)', extW: 272, extH: 96.5 });
      dashProjectData = [r]; dashSelectedRowIndex = 0;
      elevations = [{ id: 'w', name: 'TIMELINE', wallW: 272, wallH: 100.5, frames: [Object.assign(_elevFrameFromRow(r, 1, 0, 4, 'A'), {})] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      disk.file = mkFile('WALL.png', 1000, 10); disk.perm = 'granted'; disk.gone = false;
      window.__ver = 1; window.__imgSize = [5440, 1930]; window.__alpha = false;
    };
    // The real drop path: note the handle during the event, then the real reader + apply.
    const dropFile = async () => {
      _linkNoteDrop(dropOf(disk.file));
      await new Promise(res => processArtworkFile(disk.file, (u, n, w, h) => { applyArtworkToRowIndex(0, u, n, w, h); res(); }, { max: _artMaxFor(dashProjectData[0]) }));
      await tick(20);
    };

    window.__run = (async () => {
      await __check('EXACT ASK: a dropped picture is linked, and a change on disk is noticed with an Update offer', async () => {
        seed(); await dropFile();
        const r = dashProjectData[0];
        if (!r.artLink || r.artLink.name !== 'WALL.png' || r.artLink.mod !== 1000) throw new Error('no link recorded: ' + JSON.stringify(r.artLink));
        let st = await _linksCheck();
        if (st[0].status !== 'ok') throw new Error('fresh link reads ' + st[0].status);
        disk.file = mkFile('WALL.png', 2000, 12); window.__ver = 2;      // re-exported from Illustrator
        const toasts = [];
        const keep = _toast; _toast = (t, b, o) => { toasts.push({ t, o }); return null; };
        try { st = await _linksCheck({ announce: true }); } finally { _toast = keep; }
        if (st[0].status !== 'modified') throw new Error('changed file reads ' + st[0].status);
        if (!toasts.length || !(toasts[0].o.actions || []).some(a => /Update/.test(a.label))) throw new Error('no Update offer');
        const again = []; _toast = (t) => { again.push(t); return null; };
        try { await _linksCheck({ announce: true }); } finally { _toast = keep; }
        if (again.length) throw new Error('nagged a second time for the same change');
      });
      await __check('EXACT ASK: Update swaps the picture and keeps the piece\\'s crop and position', async () => {
        seed(); await dropFile();
        const r = dashProjectData[0]; r.artZoom = 1.3; r.artPanX = 0.1; r.artPanY = -0.05;
        elevFrames[0].x = 0; elevFrames[0].y = 4;
        disk.file = mkFile('WALL.png', 3000, 14); window.__ver = 3;
        const n = await _linkUpdate((await _linksCheck()).filter(t => t.status === 'modified'));
        if (n !== 1) throw new Error('updated ' + n);
        if (r.artworkUrl.indexOf('V3') < 0) throw new Error('the picture was not replaced');
        if (r.artZoom !== 1.3 || r.artPanX !== 0.1 || r.artPanY !== -0.05) throw new Error('crop reset');
        if (elevFrames[0].artworkUrl !== r.artworkUrl) throw new Error('the wall did not get the new picture');
        if (elevFrames[0].y !== 4) throw new Error('the piece moved');
        if ((await _linksCheck())[0].status !== 'ok') throw new Error('still reads modified after the update');
      });
      await __check('a wallcovering keeps up to 3200px; a framed print 1200px', async () => {
        seed(); await dropFile();
        if (dashProjectData[0].artworkW !== 3200) throw new Error('wallcovering kept ' + dashProjectData[0].artworkW + 'px');
        if (_artMaxFor({ product: 'Framed Art' }) !== 1200) throw new Error('framed max changed');
      });
      await __check('a PNG with transparency stays a PNG (a panel was flattened to black)', async () => {
        seed(); window.__alpha = true; await dropFile();
        if (dashProjectData[0].artworkUrl.indexOf('data:image/png') !== 0) throw new Error('re-encoded as ' + dashProjectData[0].artworkUrl.slice(0, 16));
        seed(); window.__alpha = false; await dropFile();
        if (dashProjectData[0].artworkUrl.indexOf('data:image/jpeg') !== 0) throw new Error('an opaque PNG should still go to JPEG');
      });
      await __check('needs access, and missing, are told apart; Allow access asks', async () => {
        seed(); await dropFile();
        disk.perm = 'prompt';
        const st = await _linksCheck();
        if (st[0].status !== 'permission') throw new Error('reads ' + st[0].status);
        await _linksAllowAccess(st);
        if (!window.__asked) throw new Error('permission was not requested');
        disk.gone = true;
        if ((await _linksCheck())[0].status !== 'missing') throw new Error('a deleted file is not Missing');
      });
      await __check('a picture that did not come from a file drops the old link', async () => {
        seed(); await dropFile();
        applyArtworkToRowIndex(0, 'data:image/jpeg;base64,Z', 'other', 10, 10);
        if (dashProjectData[0].artLink) throw new Error('kept a link to a file it no longer shows');
      });
      await __check('the link survives a dashboard edit and the project file', async () => {
        seed(); await dropFile();
        loadDashDataIntoControls(dashProjectData[0]); syncDashAndCalculate();
        if (!dashProjectData[0].artLink) throw new Error('lost on a form edit');
        const back = _projectFromFile(JSON.parse(_projectFileText(_projectPayload())));
        if (!back.dashProjectData[0].artLink || back.dashProjectData[0].artLink.mod !== 1000) throw new Error('not saved');
      });
      await __check('the Links panel lists each picture with its state, and Update all works from it', async () => {
        seed(); await dropFile();
        disk.file = mkFile('WALL.png', 5000, 20); window.__ver = 5;
        const ov = await openLinksPanel();
        const row = ov.querySelector('.links-row[data-link-code="ART.3"]');
        if (!row || row.getAttribute('data-link-status') !== 'modified') throw new Error('row ' + (row && row.getAttribute('data-link-status')));
        const all = ov.querySelector('[data-link-act="update-all"]');
        if (!all) throw new Error('no Update all');
        all.click(); await tick(60);
        if (dashProjectData[0].artworkUrl.indexOf('V5') < 0) throw new Error('Update all did not update');
        ov.remove();
        const items = []; const keepM = _frameMenu; _frameMenu = (b, it) => { items.push(...it); return null; };
        try { openDashMenu(document.body, 'edit'); } finally { _frameMenu = keepM; }
        if (!items.some(i => /^Links/.test(i.label || ''))) throw new Error('no Links item in the Edit menu');
      });
      await __check('a toast can carry action buttons', async () => {
        let hit = 0;
        const el = _toast('T', 'b', { actions: [{ label: 'Go', onClick: () => { hit++; } }] });
        const b = el && el.querySelector('.frame-toast-act');
        if (!b) throw new Error('no button');
        b.click();
        if (hit !== 1) throw new Error('action did not run');
      });
    })();
  `;
  try { window.eval(src + '\n' + testBlock); await window.__run; } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = all.filter(r => !r.ok);
  all.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)));
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
