// 20.28, from studying twenty more studio projects (start to finish):
//  1. HEIGHTS NAME THEIR DATUM: a corridor guide labelled "46 from chair rail" as 46" AFF,
//     which hangs the art about three feet low. A wall datum makes the dim run from it.
//  2. Install sequence and typical gap print as this wall's notes.
//  3. Weight per piece prints in the install legend where any piece has one.
//  4. A NEW PICTURE IS A NEW ARTWORK: swapping to a different image code cleared nothing,
//     so one artist's piece was credited to another.
//  5. Preflight: another job's file stamp in typed text, template words FRAME missed,
//     "Elevation Pending" and N/A credits in an IFS.
//  6. Version box takes a scope prefix; the PDF is named date.project.version.pdf.
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

    const fr = (id, letter, x, y, w, h) => ({ id: id, letter: letter, x: x, y: y, w: w, h: h, active: true, dimTo: [] });
    const setup = () => {
      editorialContent = _editorialDefaults();
      editorialContent.installNotes = { keys: { aff: true, verify: true } };
      editorialContent.specDualUnit = '';
      elevUnit = 'in'; dashUnit = 'in'; elevHangIn = 57;
      dashProjectData = [{ id: 'ART.25', product: 'Framed Art', extW: 25, extH: 32 }];
      elevations = [{ id: 'w25', name: 'Corridor L2', wallW: 160, wallH: 108, frames: [fr('ART.25', 'A', 60, 45, 25, 32)] }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
    };
    const guides = () => { drawElevGuides(160, 108); return document.getElementById('guide-layer'); };

    // ── 1. datum ──
    __check('EXACT BUG: a chair-rail height is dimensioned from the chair rail and never labelled AFF', () => {
      setup();
      let g = guides();
      const plain = g.querySelector('.floor-hang-dim');
      if (!plain || plain.textContent.indexOf('57" AFF') < 0) throw new Error('fixture: floor label is ' + (plain && plain.textContent));
      if (plain.style.bottom !== '0px') throw new Error('fixture: floor dim not on the floor');
      setElevDatum('Chair rail', 36);
      g = guides();
      const d = g.querySelector('.floor-hang-dim');
      const lbl = d.querySelector('.hang-dim-num').textContent;
      if (lbl.indexOf('AFF') >= 0) throw new Error('still labelled AFF: ' + lbl);
      if (lbl !== '21" ABOVE CHAIR RAIL') throw new Error('label: ' + lbl);
      if (Math.abs(parseFloat(d.style.bottom) - 36 * elevScale) > 0.01) throw new Error('dim does not start at the datum: ' + d.style.bottom);
      if (Math.abs(parseFloat(d.style.height) - 21 * elevScale) > 0.01) throw new Error('dim span: ' + d.style.height);
      const dl = g.querySelector('.datum-guide');
      if (!dl) throw new Error('the datum line is not drawn');
      if (dl.textContent !== 'CHAIR RAIL 36" AFF') throw new Error('datum label: ' + dl.textContent);
      if (dl.getAttribute('data-svg-dash') !== '1') throw new Error('datum not exported as a dashed stroke');
      if (Math.abs(elevations[0].datum.hIn - 36) > 1e-9) throw new Error('not stored in inches');
    });
    __check('the datum follows the unit: typed in cm, stored in inches', () => {
      setup(); elevUnit = 'cm';
      setElevDatum('Counter', 86.36);
      if (Math.abs(elevations[0].datum.hIn - 34) > 1e-6) throw new Error('stored ' + elevations[0].datum.hIn);
    });
    __check('blank, Floor or no height = the floor, as before', () => {
      setup();
      setElevDatum('Floor', 36);
      if (_elevDatum(elevations[0])) throw new Error('Floor read as a datum');
      setElevDatum('Chair rail', '');
      if (_elevDatum(elevations[0])) throw new Error('a datum with no height counted');
      setElevDatum('', 36);
      if ('datum' in elevations[0]) throw new Error('a blank name should leave nothing stored');
      if (guides().querySelector('.hang-dim-num').textContent.indexOf('AFF') < 0) throw new Error('floor label lost');
      if (guides().querySelector('.datum-guide')) throw new Error('a datum line with no datum');
    });
    __check('the install note says the datum and drops the AFF sentence', () => {
      setup();
      setElevDatum('Chair rail', 36);
      const t = _installNoteLines(elevations[0]).join(' | ');
      if (t.indexOf('57" AFF') >= 0) throw new Error('still tells the installer 57" AFF: ' + t);
      if (t.indexOf('measured from the chair rail (36" AFF), not the floor') < 0) throw new Error('no datum sentence: ' + t);
      if (t.indexOf('Align the centre of all artwork 21" above the chair rail') < 0) throw new Error('no height from the datum: ' + t);
      if (t.indexOf('Confirm all wall dimensions on site') < 0) throw new Error('an unrelated note was lost');
      // other walls keep the floor
      elevations.push({ id: 'w2', name: 'Other', wallW: 120, wallH: 108, frames: [] });
      if (_installNoteLines(elevations[1]).join(' | ').indexOf('57" AFF') < 0) throw new Error('another wall lost its AFF note');
    });
    __check('the Guides tab has a Heights from row that writes the datum', () => {
      setup();
      const box = document.getElementById('elevWallGuides');
      if (!box) throw new Error('fixture: no elevWallGuides box');
      _elevWallGuidesSync();
      const nm = box.querySelector('[data-ewg="datum-name"]'), h = box.querySelector('[data-ewg="datum-h"]');
      if (!nm || !h) throw new Error('no datum inputs');
      nm.value = 'Panel'; h.value = '30';
      nm.onchange ? nm.onchange() : window.eval('setElevDatum("Panel", 30)');
      if (!elevations[0].datum || elevations[0].datum.name !== 'Panel' || Math.abs(elevations[0].datum.hIn - 30) > 1e-9) throw new Error('not written: ' + JSON.stringify(elevations[0].datum));
    });

    // ── 2. sequence and gap ──
    __check('install sequence and typical gap print as this wall\\'s notes', () => {
      setup();
      elevations[0].installSeq = 'b c, a > d';
      elevations[0].typGapIn = 3;
      const t = _installNoteLines(elevations[0]).join(' | ');
      if (t.indexOf('Install sequence: B, C, A, D.') < 0) throw new Error('sequence: ' + t);
      if (t.indexOf('Typical spacing between frames is 3" unless dimensioned otherwise.') < 0) throw new Error('gap: ' + t);
      if (_installNoteLines().join(' | ').indexOf('Install sequence') >= 0) throw new Error('leaked into the deck-wide list');
    });
    __check('sequence and gap are not drawing inputs (no recapture)', () => {
      setup();
      const a = _elevCaptureSignature();
      elevations[0].installSeq = 'A'; elevations[0].typGapIn = 3;
      if (_elevCaptureSignature() !== a) throw new Error('signature changed');
      elevations[0].datum = { name: 'Chair rail', hIn: 36 };
      if (_elevCaptureSignature() === a) throw new Error('the datum IS drawn and must change the signature');
    });

    // ── 3. weight ──
    __check('weight prints in the legend only where a piece has one', () => {
      setup();
      if (_igLegVals({ weightLbs: 14 }).weight !== '14 lb') throw new Error('value: ' + _igLegVals({ weightLbs: 14 }).weight);
      if (_igLegVals({}).weight.indexOf('lb') >= 0) throw new Error('blank weight printed a number');
      const look = (id) => dashProjectData.find(r => r.id === id);
      if (_igLegHasWeight(elevations[0].frames, look)) throw new Error('weight line on a wall with no weights');
      dashProjectData[0].weightLbs = 14;
      if (!_igLegHasWeight(elevations[0].frames, look)) throw new Error('no weight line on a wall that has one');
      if (IG_LEG_LABELS.weight !== 'Weight') throw new Error('label');
    });
    __check('the dashboard has a Weight field that carries into the row', () => {
      setup();
      if (!document.getElementById('m_weight')) throw new Error('no m_weight input');
      if (BULK_FIELD_ELEMENTS.weightLbs[0] !== 'm_weight') throw new Error('not bulk-editable');
    });

    // ── 4. artist follows the picture ──
    __check('EXACT BUG: a different picture clears the old artist and title; the same code keeps them', () => {
      setup();
      const row = { id: 'ART.3', imageCode: 'ZPK.010.00056', artist: 'Jade Z', artworkTitle: 'Tide', artYear: '2021', artMedium: 'Oil', artistAffil: 'Studio' };
      if (_artIdentityResetOnSwap(row, 'ZPK.010.00056.jpg')) throw new Error('same code (with extension) cleared');
      if (row.artist !== 'Jade Z') throw new Error('same code lost the artist');
      if (!_artIdentityResetOnSwap(row, 'NKL.010.00012.png')) throw new Error('different code did not clear');
      ['artist', 'artworkTitle', 'artYear', 'artMedium', 'artistAffil'].forEach(k => { if (row[k]) throw new Error(k + ' kept: ' + row[k]); });
      const fresh = { id: 'ART.4', imageCode: '', artist: 'Typed first' };
      if (_artIdentityResetOnSwap(fresh, 'NKL.010.00012')) throw new Error('a piece with no picture yet lost its typed artist');
    });
    __check('dropping a different picture on a wall frame clears the artist', () => {
      setup();
      dashProjectData = [{ id: 'ART.25', product: 'Framed Art', extW: 25, extH: 32, imageCode: 'ZPK.010.00056', artist: 'Jade Z', artworkTitle: 'Tide' }];
      dashSelectedRowIndex = -1;
      applyArtworkToRowIndex(0, 'data:image/png;base64,AAAA', 'NKL.010.00012', 10, 10);
      if (dashProjectData[0].artist || dashProjectData[0].artworkTitle) throw new Error('kept: ' + dashProjectData[0].artist + ' / ' + dashProjectData[0].artworkTitle);
      if (dashProjectData[0].imageCode !== 'NKL.010.00012') throw new Error('code not set');
    });

    // ── 5. preflight ──
    const page = (id, txt) => ({ kind: 'layout', page: { id: id, title: id, elements: [{ type: 'text', text: txt }] } });
    const proj = (code, name) => { document.getElementById('specPdfCode').value = code; document.getElementById('g_projName').value = name; };
    __check('EXACT BUG: another project\\'s file stamp in a typed footer is flagged; this project\\'s is not', () => {
      setup(); proj('QUAD-ELMW', 'Elmwood Court Suites');
      const out = _leftoverPreflight([page('pA', 'HARBOURVIEW \\u2013 SEAPORT, ME | PICK.HARBOURVIEW-SEAPORT-ME.V2'), page('pB', 'QUAD-ELMW.SUITES.V3'), page('pC', 'ELMWOOD-COURT-SUITES.V2'), page('pD', 'Scope LL-L7.V5')]);
      if (out.length !== 1) throw new Error('expected 1 issue, got ' + out.length + ': ' + out.map(o => o.text).join(' || '));
      if (out[0].text.indexOf('PICK.HARBOURVIEW-SEAPORT-ME.V2') < 0) throw new Error('wrong stamp: ' + out[0].text);
      if (out[0].sev !== 'warn') throw new Error('a concept deck should warn, not error');
      editorialContent.presentationType = 'final';
      if (_leftoverPreflight([page('pA', 'PICK.HARBOURVIEW-SEAPORT-ME.V2')])[0].sev !== 'err') throw new Error('an IFS should error');
      proj('', '');
      if (_leftoverPreflight([page('pA', 'PICK.HARBOURVIEW-SEAPORT-ME.V2')]).length) throw new Error('with no code or name there is nothing to compare');
    });
    __check('Pending drawings and N/A credits are flagged in an IFS only', () => {
      setup(); proj('QUAD-ELMW', 'Elmwood');
      const pgs = [page('p1', 'Elevation Pending'), page('p2', 'Title N/A / Artist Farmboy')];
      if (_leftoverPreflight(pgs).length) throw new Error('flagged in a concept deck');
      editorialContent.presentationType = 'final';
      const t = _leftoverPreflight(pgs).map(o => o.text).join(' || ');
      if (t.indexOf('Pending') < 0) throw new Error('Pending not flagged: ' + t);
      if (t.indexOf('N/A') < 0) throw new Error('N/A not flagged: ' + t);
    });
    __check('template words FRAME missed are now caught, real specs are not', () => {
      ['Frame Code, Colour', 'CITY, COUNTRY', 'PROJECT | CODE-XXXX-XXXX-0000.VX', '0"W x 0"H'].forEach(s => { if (!PAGE_PLACEHOLDER_RE.test(s)) throw new Error('missed: ' + s); });
      ['Frame code MICH 513-49, Black', 'Vancouver, BC', '30"W x 40"H'].forEach(s => { if (PAGE_PLACEHOLDER_RE.test(s)) throw new Error('false alarm: ' + s); });
    });

    // ── 6. version and file name ──
    __check('the version box takes a scope prefix and the PDF is named date.project.version', () => {
      setup();
      if (document.getElementById('specPdfVersion').maxLength < 12) throw new Error('maxlength ' + document.getElementById('specPdfVersion').maxLength);
      proj('TIDE-CRS', 'Tideline');
      document.getElementById('specPdfVersion').value = 'GR.V4';
      const f = _deckPdfFileName();
      if (f.slice(-19) !== '.TIDE-CRS.GR.V4.pdf' || f.split('.')[0].length !== 6) throw new Error('name: ' + f);
      proj('', ''); document.getElementById('specPdfVersion').value = '';
      window._specPdfMeta = {};
      if (_deckPdfFileName() !== 'FRAME_Presentation.pdf') throw new Error('fallback: ' + _deckPdfFileName());
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
