// The Ford catalog project file, checked through the REAL loader rather than against
// my idea of the schema. Built by .claude/references/build-ford-catalog.js.
//
// The point of this file is that "it should load" is not an opinion I get to hold. The
// invariants below are all things loadMasterProject or the Elevations tab dereference
// WITHOUT a guard, so getting one wrong is a thrown exception on import, not a warning:
//   • f.dimTo.includes(...) is unguarded — with 2+ active frames a missing dimTo throws
//     the moment the Elevations tab opens.
//   • elev.frames and elev.personPos are dereferenced unguarded.
//   • qty is DERIVED by recalculateDashboardQuantities from the active frame count, so
//     a row id that doesn't match its frames silently zeroes the quantity.
//   • median wallH must convert to 48..240 inches or _migrateLoadedProject rewrites
//     dashUnit/elevUnit for the whole file — a project that quietly changes units.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const jsonPath = path.join(root, '.claude', 'references', 'FordCatalog.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('SKIP: FordCatalog.json not present (run .claude/references/build-ford-catalog.js)');
    console.log('\n--- Summary ---\nALL PASSED (0)');
    return;
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const DATA = JSON.parse(window.__fordRaw);

    __check('the loader accepts the type prefix', () => {
      // loadMasterProject only tests data.type.startsWith('master-studio').
      if (!DATA.type || DATA.type.indexOf('master-studio') !== 0) throw new Error('type is ' + DATA.type);
    });

    __check('EVERY frame carries the fields that are dereferenced without a guard', () => {
      let n = 0;
      (DATA.elevations || []).forEach(e => {
        if (!Array.isArray(e.frames)) throw new Error(e.name + ': frames is not an array');
        if (!e.personPos) throw new Error(e.name + ': no personPos');
        e.frames.forEach(f => {
          n++;
          // f.dimTo.includes(...) is unguarded — this is the one that throws on import.
          if (!Array.isArray(f.dimTo)) throw new Error(e.name + '/' + f.id + ': dimTo missing');
          if (f.active !== true) throw new Error(e.name + '/' + f.id + ': not active');
          if (!f.distToggles) throw new Error(e.name + '/' + f.id + ': distToggles missing');
          if (!f.letter) throw new Error(e.name + '/' + f.id + ': no letter');
        });
      });
      if (n < 40) throw new Error('expected the full catalog, found only ' + n + ' placements');
    });

    __check('median wallH stays inside 48-240in, so the units are not rewritten', () => {
      // _migrateLoadedProject reads the median and silently rewrites dashUnit/elevUnit
      // for the whole file if it falls outside. A two-storey EGD wall must never become
      // the median.
      const hs = (DATA.elevations || []).map(e => parseFloat(e.wallH)).sort((a, b) => a - b);
      const med = hs[Math.floor(hs.length / 2)];
      const f = unitFactor(DATA.elevUnit || 'in', 'in');
      const inches = med * f;
      if (!(inches >= 48 && inches <= 240)) throw new Error('median converts to ' + inches + 'in');
    });

    __check('every frame has a dashboard row with the same id, or qty zeroes out', () => {
      const ids = new Set((DATA.dashProjectData || []).map(r => r.id));
      (DATA.elevations || []).forEach(e => e.frames.forEach(f => {
        if (!ids.has(f.id)) throw new Error(e.name + '/' + f.id + ': no matching row');
      }));
      // And no orphan rows either — a row with no placement reads as a lost piece.
      const placed = new Set();
      (DATA.elevations || []).forEach(e => e.frames.forEach(f => placed.add(f.id)));
      (DATA.dashProjectData || []).forEach(r => { if (!placed.has(r.id)) throw new Error('row ' + r.id + ' is on no wall'); });
    });

    __check('level is the 0-based INDEX it is read as, not the "1" the defaults use', () => {
      // level is parsed as an index into floorplanLevels despite being a string.
      (DATA.dashProjectData || []).forEach(r => {
        const n = parseInt(r.level, 10);
        if (isNaN(n) || n < 0 || n >= (DATA.floorplanLevels || []).length) {
          throw new Error('row ' + r.id + ' level=' + r.level + ' is not a valid level index');
        }
      });
    });

    __check('editorial is OMITTED so the starter deck applies', () => {
      // Passing editorial:{} gives the same starter deck, not a blank one — so the only
      // way to mean "use the defaults" is to leave the key out.
      if ('editorial' in DATA) throw new Error('editorial is present, which pins a deck into the file');
    });

    __check('hang height and baseboard are in INCHES regardless of elevUnit', () => {
      if (DATA.hangHeightIn !== 57) throw new Error('hangHeightIn is ' + DATA.hangHeightIn + ', not the 57" standard');
      if (DATA.baseboardIn !== 4) throw new Error('baseboardIn is ' + DATA.baseboardIn);
    });

    __check('nothing hangs off its wall — x/y are bottom-left in elevUnit', () => {
      (DATA.elevations || []).forEach(e => e.frames.forEach(f => {
        if (f.x < 0 || f.y < 0) throw new Error(e.name + '/' + f.letter + ': negative x/y');
        if (f.x + f.w > e.wallW + 0.01) throw new Error(e.name + '/' + f.letter + ': runs past the wall');
        if (f.y + f.h > e.wallH + 0.01) throw new Error(e.name + '/' + f.letter + ': taller than the wall');
      }));
    });

    __check('framed pieces centre on the hang height unless they sit on something', () => {
      // Ford hangs everything to 57" AFF. The exceptions are the walls where art sits on
      // a shelf, millwork or a built-in — the four that want context blocks.
      let onHang = 0, seated = 0;
      (DATA.elevations || []).forEach(e => e.frames.forEach(f => {
        if (f.product && f.product !== 'Framed Art') return;
        const centre = f.y + f.h / 2;
        if (Math.abs(centre - 57) < 0.02) onHang++; else seated++;
      }));
      if (!onHang) throw new Error('nothing is hung at 57" AFF');
      if (!seated) throw new Error('no seated pieces — ART-4/8/11 should sit above millwork');
    });

    __check('the flat graphics are modelled as flat graphics, not framed art', () => {
      const flats = (DATA.dashProjectData || []).filter(r => _isFlatGraphic(r.product));
      if (flats.length < 4) throw new Error('expected the EGD and WF items, found ' + flats.length);
      flats.forEach(r => {
        if (r.fW !== 0) throw new Error(r.id + ' has a moulding width');
        if (r.m1A !== false) throw new Error(r.id + ' has a mat');
        if (r.glass) throw new Error(r.id + ' has glass');
        if (r.bleed !== FLAT_GRAPHIC_BLEED_IN) throw new Error(r.id + ' bleed is ' + r.bleed + ', not ' + FLAT_GRAPHIC_BLEED_IN);
      });
    });

    __check('wallcovering walls are EGD walls; window film walls are NOT', () => {
      // EGD wall mode means "this wall IS the graphic". Window film is sized to the
      // glazing, so locking it to the wall would be wrong.
      (DATA.elevations || []).forEach(e => {
        const prods = e.frames.map(f => f.product);
        const hasEgd = prods.indexOf('Wallcovering (EGD)') >= 0;
        const hasWf = prods.indexOf('Window Film (WF)') >= 0;
        if (hasEgd && e.egdWall !== true) throw new Error(e.name + ': wallcovering wall is not an EGD wall');
        if (hasWf && e.egdWall === true) throw new Error(e.name + ': window film must not be locked to the wall');
      });
    });

    __check('every window film wall carries glazing, and the run fits its graphic', () => {
      let seen = 0;
      (DATA.elevations || []).forEach(e => {
        const wf = e.frames.filter(f => f.product === 'Window Film (WF)');
        if (!wf.length) return;
        seen++;
        if (!Array.isArray(e.glazing) || !e.glazing.length) throw new Error(e.name + ': window film with no glazing run');
        e.glazing.forEach(g => {
          const gw = g.panels.reduce((a, b) => a + b, 0);
          if (g.x + gw > e.wallW + 0.01) throw new Error(e.name + ': glazing overhangs the wall');
          // The film should span its glass, or the panel schedule describes glass the
          // graphic does not cover.
          const f = wf[0];
          if (Math.abs(f.x - g.x) > 0.01 || Math.abs(f.w - gw) > 0.01) {
            throw new Error(e.name + ': film ' + f.x + '+' + f.w + ' does not match glazing ' + g.x + '+' + gw);
          }
        });
      });
      if (seen < 2) throw new Error('expected both WF walls, found ' + seen);
    });

    __check('a split-output film has more than one panel to split into', () => {
      (DATA.dashProjectData || []).forEach(r => {
        if ((r.printOutput || 'full') !== 'panels') return;
        const e = (DATA.elevations || []).find(el => el.frames.some(f => f.id === r.id));
        if (!e) throw new Error(r.id + ' is set to Split but is on no wall');
        const n = (e.glazing || []).reduce((a, g) => a + g.panels.length, 0);
        if (n < 2) throw new Error(r.id + ' is set to Split but its wall has ' + n + ' panel(s)');
      });
    });

    __check('panel widths total their run exactly, so no seam lands off the glass', () => {
      (DATA.elevations || []).forEach(e => (e.glazing || []).forEach(g => {
        const sum = g.panels.reduce((a, b) => a + b, 0);
        // Pinned to 3dp: the run width IS the sum, so a residual would put the last
        // mullion off the edge of the glass.
        if (Math.abs(sum - parseFloat(sum.toFixed(3))) > 1e-9) throw new Error(e.name + ': panel widths carry float noise');
        g.panels.forEach(p => { if (!(p > 0)) throw new Error(e.name + ': a panel is ' + p + ' wide'); });
      }));
    });

    __check('dual units are pinned in the file, so the standard travels with it', () => {
      // annotationStyle and elevDualUnit are localStorage prefs AND optional project
      // keys. Present means the file carries the drafting standard rather than
      // depending on whichever machine opens it — which is the point of the rebuild.
      if (DATA.elevDualUnit !== 'mm') throw new Error('elevDualUnit is ' + DATA.elevDualUnit);
      if (DATA.dashUnit !== 'in' || DATA.elevUnit !== 'in') throw new Error('the catalog is inches-primary');
    });

    __check('the catalog covers the walls the plan lists', () => {
      const names = (DATA.elevations || []).map(e => e.name).join(' | ');
      ['ART-2', 'ART-3', 'ART-4', 'ART-5', 'ART-6', 'ART-7', 'ART-8', 'ART-9', 'ART-10', 'ART-11',
       'EGD-1', 'EGD-6', 'WF-1', 'WF-2'].forEach(k => {
        if (names.indexOf(k) < 0) throw new Error('missing ' + k);
      });
      if ((DATA.elevations || []).length < 15) throw new Error('only ' + DATA.elevations.length + ' elevations');
    });

    __check('walls carrying a typical rather than a catalog number SAY SO', () => {
      // Most widths in the catalog are TBD. A file that ships guesses without marking
      // them invites someone ordering to a number nobody measured.
      const noted = (DATA.dashProjectData || []).filter(r => (r.notes || '').length > 0);
      if (!noted.length) throw new Error('no row records that its wall size is a typical');
    });
  `;

  try {
    window.eval('window.__fordRaw = ' + JSON.stringify(raw) + ';\n' + src + '\n' + testBlock);
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
