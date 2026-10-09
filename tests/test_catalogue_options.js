// A CATALOGUE IS A DOCUMENT OF CHOICES, NOT AN ORDER.
//
// A dealership catalogue shows ONE arrangement several times over with different
// artwork in it, and the client picks. The reference decks say the quantity part out
// loud on the page: "each wall will require its own pair of pieces. Consult your
// specific floorplan for full quantity of artwork." So a catalogue does not state
// quantity, and every option piece is a real distinct item in the art library rather
// than a second copy of one piece.
//
// The workflow this pins: mark a wall a CATALOGUE MOCKUP, duplicate it, and get an art
// OPTION - its own item codes, its own dashboard rows, its own images - that still reads
// its geometry and frame spec off the mockup. A free copy would give you the swapping
// and not the fixing, which is the whole reason this lives in FRAME instead of InDesign.
//
// The codes were already supported before any of this existed, which is why the build
// is small: _artGroupKey('ART-1.1A') is 'ART-1.1', _artGroupNum keeps the dotted form,
// and _breakerCodeFor renders 'ART-1.1AB'. Those are pinned here too, because they are
// load-bearing for a feature that does not own them.
//
// NO REGEX IN THIS FILE. Patterns written into a test block here lose their backslashes.
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
  window.confirm = () => true;
  window.alert = () => {};
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    // The app no longer calls window.confirm. Destructive actions ask through its
    // own dialog now (_confirmDestroy, then showConfirmModal), so "assume the
    // designer says yes" means pressing that dialog's real confirm button - which
    // also exercises the button's wiring rather than skipping past it.
    const __realConfirm = showConfirmModal;
    showConfirmModal = function () {
      __realConfirm.apply(this, arguments);
      const __yes = document.querySelector('#infoModalButtons button');
      if (__yes) __yes.click();
    };
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    const quiet = (fn) => { try { fn(); } catch (e) {} };
    const NLFN = String.fromCharCode(10) + 'function ';
    const fnBody = (name) => {
      const at = S.indexOf('function ' + name + '(');
      if (at < 0) throw new Error('missing function ' + name);
      const end = S.indexOf(NLFN, at + 1);
      return S.slice(at, end < 0 ? S.length : end);
    };

    // A two-slot mockup: ART-1A (24x24) and ART-1B (18x24), the ART-8 shape.
    const slot = (id, letter, w, h, x) => ({
      id: id, letter: letter, w: w, h: h, x: x, y: 48,
      fW: 1.25, fType: 'color', fColor: '#1a1a1a', fCode: 'FORD-BLK',
      m1A: true, m1: 2, m1ColorHex: '#ffffff', m2A: false, m2: 0, m2ColorHex: '#ffffff',
      product: 'Framed Art', paperType: 'Fine Art Paper',
      artworkUrl: '', artworkFile: '', imageCode: '',
      active: true, dimTo: [], distToggles: { ceiling: false, floor: false, left: false, right: false }
    });
    const row = (id) => ({ id: id, qty: 0, product: 'Framed Art', extW: 24, extH: 24, level: '0',
      artworkUrl: '', artworkFile: '', imageCode: '', m1A: true, m1: 2 });
    const buildMaster = () => {
      elevations.length = 0;
      dashProjectData.length = 0;
      dashProjectData.push(row('ART-1A'));
      dashProjectData.push(row('ART-1B'));
      elevations.push({
        id: _elevNewId(), name: 'ART-1', wallW: 185, wallH: 108, personPos: { x: -60 },
        catalogueMaster: true,
        frames: [slot('ART-1A', 'A', 24, 24, 60), slot('ART-1B', 'B', 18, 24, 92)]
      });
      currentElevIndex = 0;
      currentView = 'elevation';
      return elevations[0];
    };

    // ── The codes this rides on, which predate it ────────────────────────
    __check('the item-code convention already groups, numbers and titles correctly', () => {
      if (_artGroupKey('ART-1.1A') !== 'ART-1.1') throw new Error('_artGroupKey gave ' + _artGroupKey('ART-1.1A'));
      if (_artGroupKey('ART-1A') !== 'ART-1') throw new Error('_artGroupKey gave ' + _artGroupKey('ART-1A'));
      // Dotted codes keep their form rather than being zero-padded to '01'.
      if (_artGroupNum('ART-1.1A') !== '1.1') throw new Error('_artGroupNum gave ' + _artGroupNum('ART-1.1A'));
      const unit = { key: 'ART-1.1', members: [{ id: 'ART-1.1A' }, { id: 'ART-1.1B' }] };
      if (_breakerCodeFor(unit) !== 'ART-1.1AB') throw new Error('_breakerCodeFor gave ' + _breakerCodeFor(unit));
    });

    // ── Marking a mockup ─────────────────────────────────────────────────
    __check('the mockup switch is PER ELEVATION, not deck-wide', () => {
      buildMaster();
      elevations.push({ id: _elevNewId(), name: 'plain', wallW: 185, wallH: 108, personPos: { x: 0 }, frames: [] });
      if (!_isCatalogueMaster(elevations[0])) throw new Error('the marked wall did not read as a mockup');
      if (_isCatalogueMaster(elevations[1])) throw new Error('the mark leaked onto another wall');
    });

    __check('the base code is DERIVED from the slots, never stored', () => {
      const m = buildMaster();
      if (_catBaseCode(m) !== 'ART-1') throw new Error('_catBaseCode gave ' + _catBaseCode(m));
      // Change the slot code and the base follows, with nothing to keep in step.
      m.frames[0].id = 'EGD-7A';
      if (_catBaseCode(m) !== 'EGD-7') throw new Error('base did not follow the slot: ' + _catBaseCode(m));
    });

    // ── THE WORKFLOW: duplicate mints an option ──────────────────────────
    __check('duplicating a mockup mints an OPTION with its own item codes', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      if (elevations.length !== 2) throw new Error('no option wall was made');
      const opt = elevations[1];
      if (_isCatalogueMaster(opt)) throw new Error('the option is flagged a mockup');
      if (!_isCatalogueOption(opt)) throw new Error('the option does not resolve back to its mockup');
      if (opt.catalogueOption !== '1') throw new Error('option number is ' + opt.catalogueOption);
      if (opt.name !== 'ART-1.1') throw new Error('option wall is named ' + opt.name);
      const ids = opt.frames.map(f => f.id).join(',');
      if (ids !== 'ART-1.1A,ART-1.1B') throw new Error('option frame codes are ' + ids);
    });

    __check('the option mints a dashboard ROW per slot, empty and visible as unfilled', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const a = dashProjectData.filter(r => r.id === 'ART-1.1A')[0];
      const b = dashProjectData.filter(r => r.id === 'ART-1.1B')[0];
      if (!a || !b) throw new Error('option rows were not created');
      // Empty, not absent: an unfilled option has to be checkable in a 200-image catalogue.
      if (a.artworkUrl || a.imageCode) throw new Error('the option row carried artwork over');
      // But it inherits the SPEC from the slot it came from.
      if (a.m1 !== 2) throw new Error('the option row did not inherit the mat spec');
    });

    __check('a second duplicate numbers itself .2, not .1 again', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      const names = elevations.filter(e => e.catalogueOption).map(e => e.name).sort().join(',');
      if (names !== 'ART-1.1,ART-1.2') throw new Error('option names are ' + names);
      if (!dashProjectData.filter(r => r.id === 'ART-1.2B')[0]) throw new Error('ART-1.2B was not minted');
    });

    __check('a NON-mockup wall still duplicates exactly as it always did', () => {
      elevations.length = 0; dashProjectData.length = 0;
      dashProjectData.push(row('ART-9A'));
      elevations.push({ id: _elevNewId(), name: 'plain', wallW: 185, wallH: 108, personPos: { x: 0 },
        frames: [slot('ART-9A', 'A', 24, 24, 60)] });
      currentElevIndex = 0; currentView = 'elevation';
      quiet(() => duplicateCurrentElevation());
      const copy = elevations[1];
      if (!copy) throw new Error('nothing was duplicated');
      if (copy.catalogueOption) throw new Error('a plain wall produced a catalogue option');
      if (copy.isVariation !== true) throw new Error('a plain duplicate stopped being a variation');
      if (copy.frames[0].id !== 'ART-9A') throw new Error('a plain duplicate re-coded its frames');
      if (dashProjectData.length !== 1) throw new Error('a plain duplicate minted rows');
    });

    // ── THE POINT OF ALL OF IT: fix the arrangement once ─────────────────
    __check('MOVING A SLOT ON THE MOCKUP MOVES IT ON EVERY OPTION', () => {
      const m = buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      // Re-hang piece B and change its moulding.
      m.frames[1].x = 140; m.frames[1].w = 30; m.frames[1].fCode = 'MICH 432-29';
      _catSyncAllOptions();
      elevations.filter(e => e.catalogueOption).forEach(o => {
        const b = o.frames.filter(f => f.letter === 'B')[0];
        if (b.x !== 140) throw new Error(o.name + ' did not follow the move (x ' + b.x + ')');
        if (b.w !== 30) throw new Error(o.name + ' did not follow the resize');
        if (b.fCode !== 'MICH 432-29') throw new Error(o.name + ' did not follow the moulding');
      });
    });

    __check('the sync moves geometry and frame spec, and NEVER the artwork', () => {
      const m = buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt = elevations[1];
      opt.frames[0].artworkUrl = 'data:image/png;base64,OPTION';
      opt.frames[0].imageCode = 'FFI.F.AR-2008';
      m.frames[0].artworkUrl = 'data:image/png;base64,MASTER';
      _catSyncOption(opt);
      if (opt.frames[0].artworkUrl !== 'data:image/png;base64,OPTION') throw new Error('the master overwrote the option artwork');
      if (opt.frames[0].imageCode !== 'FFI.F.AR-2008') throw new Error('the master overwrote the option image code');
      if (CAT_SLOT_FIELDS.indexOf('artworkUrl') >= 0) throw new Error('artworkUrl is in the inherited field list');
      if (CAT_SLOT_FIELDS.indexOf('imageCode') >= 0) throw new Error('imageCode is in the inherited field list');
    });

    __check('drawElevAll re-reads the master, so nothing has to push on every drag', () => {
      // A source check, because drawElevAll needs a laid-out DOM. The call has to be in
      // the renderer: the alternative is pushing from every master edit, which happens
      // sixty times a second during a drag.
      const b = fnBody('drawElevAll');
      if (b.indexOf('_catSyncOption') < 0) throw new Error('drawElevAll does not re-read the master');
    });

    // ── Quantity, which this document does not answer ────────────────────
    // BEHAVIOUR CHANGED IN 17.76, DELIBERATELY. This check used to require an option
    // piece to read qty 1. A CATALOGUE DOES NOT STATE QUANTITY: three image options of a
    // two-piece hang are six distinct items, which is why each keeps its own code and its
    // own row, but two pieces get bought and which two is the client's decision. The
    // reference decks say it on the page - "Consult your specific floorplan for full
    // quantity of artwork." Identity and quantity are separate questions and only the
    // second one moved.
    __check('NOTHING in a catalogue bills: a slot is a drawing and an option is a choice', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      recalculateDashboardQuantities();
      const q = (id) => (dashProjectData.filter(r => r.id === id)[0] || {}).qty;
      if (q('ART-1A') !== 0) throw new Error('the mockup slot was counted: qty ' + q('ART-1A'));
      if (q('ART-1B') !== 0) throw new Error('the mockup slot was counted: qty ' + q('ART-1B'));
      ['ART-1.1A', 'ART-1.1B', 'ART-1.2A', 'ART-1.2B'].forEach(id => {
        if (q(id) !== 0) throw new Error(id + ' reads qty ' + q(id) + ', expected 0 - an option is an alternate, not a purchase');
      });
      // But the rows are still THERE and still distinct. Zeroing the quantity must not
      // turn six catalogue items back into two.
      const ids = dashProjectData.map(r => r.id);
      ['ART-1.1A', 'ART-1.1B', 'ART-1.2A', 'ART-1.2B'].forEach(id => {
        if (ids.indexOf(id) < 0) throw new Error(id + ' lost its row');
      });
    });

    __check('an ordinary wall outside a catalogue still bills normally', () => {
      // The skip must be keyed on being an OPTION, not on anything a plain wall shares.
      buildMaster();
      delete elevations[0].catalogueMaster;
      recalculateDashboardQuantities();
      const q = (id) => (dashProjectData.filter(r => r.id === id)[0] || {}).qty;
      if (q('ART-1A') !== 1) throw new Error('a plain wall stopped counting: qty ' + q('ART-1A'));
    });

    __check('an option is STILL not flagged isVariation', () => {
      // The quantity rule is its own clause keyed on _isCatalogueOption. Reaching for
      // isVariation instead would have been one word shorter and would also have driven
      // orphan promotion and the derived variationOf mirror, which mean other things.
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      if (elevations[1].isVariation) throw new Error('the option is flagged isVariation');
      const b = fnBody('recalculateDashboardQuantities');
      if (b.indexOf('_isCatalogueOption(elev)') < 0) throw new Error('the option skip is not its own clause');
    });

    // ── The CSV is a list of what is on offer ────────────────────────────
    __check('a mockup slot never reaches the CSV; its options do', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const slots = _catSlotRowIds();
      if (!slots['ART-1A'] || !slots['ART-1B']) throw new Error('the mockup slots were not identified');
      if (slots['ART-1.1A']) throw new Error('an option row was treated as a mockup slot');
      const b = fnBody('buildDashCSVString');
      if (b.indexOf('_catSlotRowIds()') < 0) throw new Error('the CSV does not ask which rows are mockup slots');
    });

    // ── Deleting the mockup ──────────────────────────────────────────────
    __check('deleting a mockup does not leave its options pointing at a dead wall', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => deleteElevation(0, { stopPropagation: function () {} }));
      const opt = elevations.filter(e => e.name === 'ART-1.1')[0];
      if (!opt) throw new Error('the option vanished with its mockup');
      if (opt.catalogueOption) throw new Error('the orphan still claims to be an art option');
      if (_isCatalogueOption(opt)) throw new Error('the orphan still resolves to a mockup');
      // Its rows are real items and must keep counting.
      recalculateDashboardQuantities();
      const q = (dashProjectData.filter(r => r.id === 'ART-1.1A')[0] || {}).qty;
      if (q !== 1) throw new Error('an orphaned option stopped counting: qty ' + q);
    });

    // ── The control, and what it says ────────────────────────────────────
    // 17.89: the Catalogue mockup BUTTON left the Elevations tab ("I think we removed the
    // Catalogue mockup button since all options take place in deck studio"); + Add option
    // in Deck Studio makes a wall the arrangement. The hint under the wall stays, because
    // it is the only thing on the Elevations side saying what a mockup wall is.
    __check('the mockup hint still says what the wall is (the button moved to Deck Studio)', () => {
      if (document.getElementById('catMasterBtn')) throw new Error('the Catalogue mockup button is back in Elevations');
      if (!document.getElementById('catMasterHint')) throw new Error('no catMasterHint in index.html');
      buildMaster();
      _syncCatalogueBtn();
      const h = document.getElementById('catMasterHint').textContent;
      if (h.toLowerCase().indexOf('duplicate') < 0) throw new Error('the hint does not say how to add an option: ' + h);
      // And it now answers the two questions a designer has before editing a frame.
      if (h.indexOf('Frame set') < 0) throw new Error('the hint does not say which frame set this is: ' + h);
      if (h.indexOf('no other set') < 0) throw new Error('the hint does not bound what a resize reaches: ' + h);
    });

    __check('an OPTION wall says what it is rather than offering a switch that refuses', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 1;
      _syncCatalogueBtn();
      const h = document.getElementById('catMasterHint').textContent;
      if (h.indexOf('Art option') < 0) throw new Error('the hint does not name the wall: ' + h);
    });

    __check('the duplicate control says which of its two jobs it will do', () => {
      // Two gestures behind one button is fine; two behind one unchanged tooltip is how
      // a designer learns the wrong one.
      buildMaster();
      _syncCatalogueBtn();
      const t1 = document.getElementById('dupElevBtn').title;
      if (t1.indexOf('art option') < 0) throw new Error('on a mockup the duplicate title reads: ' + t1);
      elevations.length = 0;
      elevations.push({ id: _elevNewId(), name: 'plain', wallW: 185, wallH: 108, personPos: { x: 0 }, frames: [] });
      currentElevIndex = 0;
      _syncCatalogueBtn();
      const t2 = document.getElementById('dupElevBtn').title;
      if (t2.indexOf('art option') >= 0) throw new Error('a plain wall offers to add an option: ' + t2);
    });

    // ── ONE DECK, TWO ANSWERS TO "IS THIS WIREFRAME" ─────────────────────
    __check('a MOCKUP draws as a placement even with the deck flag off', () => {
      const m = buildMaster();
      editorialContent.wireframe = false;
      if (!_elevIsWireframe(m)) throw new Error('the mockup wall does not draw as a placement');
    });

    __check('an OPTION does NOT, or the artwork pages are grey blocks', () => {
      buildMaster();
      editorialContent.wireframe = false;
      quiet(() => duplicateCurrentElevation());
      const opt = elevations[1];
      if (_elevIsWireframe(opt)) throw new Error('the option wall draws as a placement, so its artwork would never show');
    });

    __check('the deck flag still wins on every ordinary wall', () => {
      elevations.length = 0;
      const plain = { id: _elevNewId(), name: 'plain', wallW: 185, wallH: 108, personPos: { x: 0 }, frames: [] };
      elevations.push(plain);
      editorialContent.wireframe = true;
      if (!_elevIsWireframe(plain)) throw new Error('the deck-wide flag stopped reaching an ordinary wall');
      editorialContent.wireframe = false;
      if (_elevIsWireframe(plain)) throw new Error('an ordinary wall went wireframe on its own');
    });

    __check('_curElevIsWireframe reads the wall the editor is on', () => {
      buildMaster();
      editorialContent.wireframe = false;
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      if (!_curElevIsWireframe()) throw new Error('on the mockup it did not report wireframe');
      currentElevIndex = 1;
      if (_curElevIsWireframe()) throw new Error('on the option it still reported wireframe');
    });

    __check('every elevation raster asks the WALL, never the deck alone', () => {
      // Eight call sites read the flag. The five that draw an ELEVATION have to ask about
      // the wall they are drawing, or a mockup prints its (absent) artwork on one page and
      // its grey blocks on another.
      const parts = S.split('renderElevationToCanvas(');
      if (parts.length - 1 < 5) throw new Error('only ' + (parts.length - 1) + ' renderElevationToCanvas call sites found; the check is looking at the wrong thing');
      parts.slice(1).forEach((p, i) => {
        const call = p.slice(0, 200);
        if (call.indexOf('wireframe: _isWireframe()') >= 0) throw new Error('elevation raster ' + (i + 1) + ' still passes the deck flag straight through');
      });
      // renderFrameToCanvas is deliberately NOT in this rule. It draws ONE PIECE, so it
      // has a row and no wall, and a mockup's slot rows never print anyway - they are a
      // drawing, not stock. Left reading the deck flag on purpose.
      const frameSites = S.split('renderFrameToCanvas(').length - 1;
      if (frameSites < 3) throw new Error('renderFrameToCanvas call sites moved; re-check whether they should follow the wall');
      // And the two that draw the live elevation.
      if (S.indexOf('_curElevIsWireframe()') < 0) throw new Error('the live elevation renderers do not ask about the wall');
    });

    // ── The presentation type ────────────────────────────────────────────
    __check('Catalogue is offered as a presentation type', () => {
      if (!PRES_PRESETS.catalogue) throw new Error('no catalogue preset');
      if (PRES_PRESETS.catalogue.label !== 'Catalogue') throw new Error('label is ' + PRES_PRESETS.catalogue.label);
    });

    __check('the catalogue preset leaves the DECK wireframe flag OFF', () => {
      // A catalogue needs both answers in one deck, and the deck flag can only give one.
      // Turning it on here would grey out the option pages, which are the whole document.
      if (PRES_PRESETS.catalogue.wf) throw new Error('the catalogue preset turns the deck-wide wireframe on');
    });

    __check('the catalogue preset turns breakers ON, since a placement drawing IS its page', () => {
      if (PRES_PRESETS.catalogue.breakers !== true) throw new Error('breakers are not switched on');
      // And it picks the shared-spec group page, which is what an option page is.
      if (PRES_PRESETS.catalogue.tpl !== 'setLegend') throw new Error('tpl is ' + PRES_PRESETS.catalogue.tpl);
      if (!SPEC_TEMPLATES.setLegend || !SPEC_TEMPLATES.setLegend.sharedSpec) throw new Error('setLegend is not the shared-spec layout');
    });

    __check('applying it sets the type and the breakers, and not the wireframe flag', () => {
      editorialContent.wireframe = false;
      editorialContent.elevBreakers = false;
      quiet(() => _dsApplyPresentationType('catalogue'));
      if (editorialContent.presentationType !== 'catalogue') throw new Error('type is ' + editorialContent.presentationType);
      if (editorialContent.elevBreakers !== true) throw new Error('breakers were not turned on');
      if (editorialContent.wireframe !== false) throw new Error('the deck wireframe flag was turned on');
      if (!_isCatalogueDeck()) throw new Error('_isCatalogueDeck does not agree');
    });

    __check('a preset that says nothing about breakers leaves them ALONE', () => {
      // Five presets predate the field. Reading an absent one as false would silently turn
      // breakers off every time a designer clicked between types.
      editorialContent.elevBreakers = true;
      quiet(() => _dsApplyPresentationType('final'));
      if (editorialContent.elevBreakers !== true) throw new Error('an older preset switched breakers off');
      ['concept', 'wireframe', 'artdev', 'final', 'install'].forEach(k => {
        if (typeof PRES_PRESETS[k].breakers !== 'undefined') throw new Error(k + ' gained a breakers field');
      });
    });

    // ── REPORTED, 17.64: three things a real catalogue turned up ─────────
    __check('a DOT-STYLE code does not leave a trailing separator behind', () => {
      // Reported as a page titled "ART.1." and minted codes reading 'ART.1..2A'.
      // Hyphen codes never showed it: the suffix strip already ate '-' and '_'.
      if (_artGroupKey('ART.1.A') !== 'ART.1') throw new Error('_artGroupKey gave ' + _artGroupKey('ART.1.A'));
      if (_artGroupKey('ART.1.1A') !== 'ART.1.1') throw new Error('option key is ' + _artGroupKey('ART.1.1A'));
      // And the forms that already worked must not move.
      if (_artGroupKey('ART-1A') !== 'ART-1') throw new Error('hyphen style moved: ' + _artGroupKey('ART-1A'));
      if (_artGroupKey('ART.006-A') !== 'ART.006') throw new Error('mixed style moved: ' + _artGroupKey('ART.006-A'));
      if (_artGroupKey('ART.001') !== 'ART.001') throw new Error('a code with no piece suffix was trimmed');
      if (_artGroupKey('LOBBY') !== 'LOBBY') throw new Error('a pure-letter code was trimmed');
    });

    __check('the page title drops the separator too, on either code style', () => {
      // _breakerCodeFor slices the base off each member; it stripped '-' and '_' but not
      // '.', which only surfaced once the base stopped carrying the dot itself.
      const dotted = { key: 'ART.1.1', members: [{ id: 'ART.1.1.A' }, { id: 'ART.1.1.B' }] };
      if (_breakerCodeFor(dotted) !== 'ART.1.1AB') throw new Error('dotted title is ' + _breakerCodeFor(dotted));
      const hyphen = { key: 'ART-1.1', members: [{ id: 'ART-1.1A' }, { id: 'ART-1.1B' }] };
      if (_breakerCodeFor(hyphen) !== 'ART-1.1AB') throw new Error('hyphen title is ' + _breakerCodeFor(hyphen));
    });

    __check('a DOT-STYLE mockup mints clean option codes', () => {
      elevations.length = 0; dashProjectData.length = 0;
      dashProjectData.push(row('ART.1.A'));
      dashProjectData.push(row('ART.1.B'));
      elevations.push({ id: _elevNewId(), name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 },
        catalogueMaster: true,
        frames: [slot('ART.1.A', 'A', 24, 24, 60), slot('ART.1.B', 'B', 18, 24, 92)] });
      currentElevIndex = 0; currentView = 'elevation';
      if (_catBaseCode(elevations[0]) !== 'ART.1') throw new Error('base is ' + _catBaseCode(elevations[0]));
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      const ids = elevations.filter(e => e.catalogueOption).map(e => e.frames.map(f => f.id).join('/')).join(' ');
      if (ids !== 'ART.1.1A/ART.1.1B ART.1.2A/ART.1.2B') throw new Error('minted codes are ' + ids);
    });

    __check('a MOCKUP is never picked as the elevation shown beside a piece', () => {
      // Reported as "when I switch back to Final Spec it uses the mockup elevation in the
      // thumbnail". The mockup and its options share letters and sizes, so a first-match
      // search found the mockup, which carries no artwork at all.
      // ONE definition, because there were FIVE hand-written copies of this search and
      // they would all have had to learn the rule at once.
      const fn = fnBody('_elevShowingPiece');
      if (fn.indexOf('_isCatalogueMaster(e)') < 0) throw new Error('the shared search can still land on a mockup wall');
      // And no copy of the old hand-written form survives.
      const copies = S.split('e.frames.some(fr => fr.id === r.id)').length - 1;
      if (copies > 0) throw new Error(copies + ' hand-written copies of the elevation search survive');
      const uses = S.split('_elevShowingPiece(').length - 1;
      if (uses < 5) throw new Error('only ' + uses + ' references to the shared search; expected the definition plus four call sites');
    });

    __check('a mockup SLOT row produces no spec page, in BOTH page builders', () => {
      elevations.length = 0; dashProjectData.length = 0;
      dashProjectData.push(row('ART.1.A'));
      dashProjectData.push(row('ART.1.B'));
      dashProjectData.push(row('ART.9.A'));
      elevations.push({ id: _elevNewId(), name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 },
        catalogueMaster: true,
        frames: [slot('ART.1.A', 'A', 24, 24, 60), slot('ART.1.B', 'B', 18, 24, 92)] });
      const kept = _deckSpecRows().map(r => r.id).join(',');
      if (kept !== 'ART.9.A') throw new Error('rows offered to the page builders: ' + kept);
      // ONE definition, called by both. The studio and the export each carried their own
      // copy of this filter, which is the pair that has drifted more than any other here.
      const studio = fnBody('_deckPageList');
      if (studio.indexOf('_deckSpecRows()') < 0) throw new Error('the studio builder does not use the shared filter');
      const bad = S.split('filter(r => r && (r.id || r.artworkUrl))').length - 1;
      if (bad > 0) throw new Error(bad + ' hand-written copies of the row filter survive');
    });

    __check('PER PIECE lands on the one per-piece layout, not the legacy one', () => {
      // 'classic' predates the four SHOW ON PAGE ticks, so it drew a page whose ticks
      // mostly did nothing and whose title dropped the location.
      const src = S.indexOf("mkMode('Per piece'");
      if (src < 0) throw new Error('the Per piece button moved');
      const line = S.slice(src, src + 200);
      if (line.indexOf("switchMode('frameSpecDetail')") < 0) throw new Error('Per piece does not switch to frameSpecDetail');
      if (line.indexOf("switchMode('classic')") >= 0) throw new Error('the legacy literal is back');
    });

    // ── ONE BREAKER PER PLACEMENT, THEN THE OPTION SETS ──────────────────
    // Asked for in exactly these words: "one breaker page with grey out with letters and
    // dimensions, then following page would show each set". A breaker taken from an
    // option's own wall is the same picture as the option page behind it, and one per
    // option prints the dimensioned drawing three times.
    const __catDeck = () => {
      editorialContent.elevBreakers = true;
      editorialContent.specTemplate = 'setLegend';
      elevations.length = 0; dashProjectData.length = 0;
      dashProjectData.push(row('ART.1.A'));
      dashProjectData.push(row('ART.1.B'));
      elevations.push({ id: _elevNewId(), name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 },
        catalogueMaster: true,
        frames: [slot('ART.1.A', 'A', 24, 24, 60), slot('ART.1.B', 'B', 18, 24, 92)] });
      currentElevIndex = 0; currentView = 'elevation';
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
    };

    __check('three option sets produce ONE breaker, not three', () => {
      __catDeck();
      const opts = elevations.filter(e => e.catalogueOption);
      if (opts.length !== 3) throw new Error('expected 3 option walls, got ' + opts.length);
      const units = _buildSpecUnits(_deckSpecRows(), true);
      const brs = units.map(u => _breakerElevFor(u, units)).filter(Boolean);
      if (brs.length !== 1) throw new Error(brs.length + ' breakers for one placement');
    });

    __check('that ONE breaker is the MOCKUP, so it draws grey with letters', () => {
      __catDeck();
      const units = _buildSpecUnits(_deckSpecRows(), true);
      const br = units.map(u => _breakerElevFor(u, units)).filter(Boolean)[0];
      if (!br.mockup) throw new Error('the breaker was not taken from the mockup');
      if (!_isCatalogueMaster(br.elev)) throw new Error('the breaker wall is not a mockup');
      if (!_elevIsWireframe(br.elev)) throw new Error('the breaker wall would draw its artwork');
    });

    __check('it sits in front of the FIRST option, not a later one', () => {
      __catDeck();
      const units = _buildSpecUnits(_deckSpecRows(), true);
      if (!_breakerElevFor(units[0], units)) throw new Error('the first option carries no breaker');
      units.slice(1).forEach((u, i) => {
        if (_breakerElevFor(u, units)) throw new Error('option ' + (i + 2) + ' carries a second breaker');
      });
    });

    __check('its title is the PLACEMENT code, not the first option', () => {
      __catDeck();
      const units = _buildSpecUnits(_deckSpecRows(), true);
      const u0 = units[0];
      const br = _breakerElevFor(u0, units);
      if (_breakerNameFor(u0, br) !== 'ART.1') throw new Error('breaker title is ' + _breakerNameFor(u0, br));
      // And keyed on the mockup, so per-page settings stay with the placement rather
      // than with whichever option happens to be first.
      const k = _breakerOvKeyFor(u0, br);
      if (k.indexOf('elevgrp:cat:') !== 0) throw new Error('breaker key is ' + k);
    });

    __check('an ORDINARY deck keeps the breaker it always had', () => {
      editorialContent.elevBreakers = true;
      elevations.length = 0; dashProjectData.length = 0;
      dashProjectData.push(row('ART.9.A'));
      dashProjectData.push(row('ART.9.B'));
      elevations.push({ id: _elevNewId(), name: 'Lobby', wallW: 185, wallH: 108, personPos: { x: 0 },
        frames: [slot('ART.9.A', 'A', 24, 24, 60), slot('ART.9.B', 'B', 18, 24, 92)] });
      const units = _buildSpecUnits(_deckSpecRows(), true);
      const br = _breakerElevFor(units[0], units);
      if (!br) throw new Error('a plain wall lost its breaker');
      if (br.mockup) throw new Error('a plain wall was treated as a mockup');
      if (br.elev.name !== 'Lobby') throw new Error('the breaker picked ' + br.elev.name);
      if (_breakerNameFor(units[0], br) !== _breakerCodeFor(units[0])) throw new Error('a plain breaker title changed');
    });

    __check('BOTH page builders call the shared breaker rule', () => {
      // The studio and the export each had their own copy of the same loop. A rule about
      // which pages exist that lives in one and is mirrored by hand in the other is the
      // failure this file has repeated most.
      const studio = fnBody('_deckPageList');
      if (studio.indexOf('_breakerElevFor(') < 0) throw new Error('the studio builder does not call it');
      if (S.split('_breakerElevFor(').length - 1 < 3) throw new Error('the export builder does not call it');
      const copies = S.split('if (c > best) { best = c; ge = e; gi = ei; }').length - 1;
      if (copies > 1) throw new Error(copies + ' hand-written copies of the breaker-wall loop survive');
    });

    // ── THE WHOLE WALL FOLLOWS, NOT JUST THE FRAMES ─────────────────────
    __check('the SCALE CHARACTER follows the mockup', () => {
      // Reported: "the character in the mockup elevation was not positioned in the
      // duplicated elevations". The frames were kept in step and nothing else was, which
      // reads as a half-built link.
      const m = buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt = elevations[1];
      m.personPos = { x: 120, dimOff: -0.5, dimLblOff: 0 };
      _catSyncOption(opt);
      if (!opt.personPos || opt.personPos.x !== 120) throw new Error('the character did not move: ' + JSON.stringify(opt.personPos));
      // A CLONE, not a shared reference - nudging the option must not edit the mockup.
      opt.personPos.x = 5;
      if (m.personPos.x !== 120) throw new Error('the option shares the mockup personPos object');
    });

    __check('the WALL SIZE and mode follow too', () => {
      const m = buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt = elevations[1];
      m.wallW = 240; m.wallH = 120; m.egdWall = true;
      _catSyncOption(opt);
      if (opt.wallW !== 240 || opt.wallH !== 120) throw new Error('the wall did not resize');
      if (opt.egdWall !== true) throw new Error('the wall mode did not follow');
    });

    __check('CONTEXT traced on the mockup follows, so a TV shows on every option', () => {
      const m = buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt = elevations[1];
      m.contextBlocks = [{ id: 'cb1', x: 10, y: 20, w: 60, h: 36, preset: 'tv', label: 'Television' }];
      _catSyncOption(opt);
      if (!opt.contextBlocks || opt.contextBlocks.length !== 1) throw new Error('the context block did not follow');
      if (opt.contextBlocks[0].preset !== 'tv') throw new Error('the block arrived wrong');
      if (opt.contextBlocks === m.contextBlocks) throw new Error('the option shares the mockup array');
    });

    __check('the TRACING GUIDE is not copied per option', () => {
      // It never exports and carries a megabyte data URL, so a copy per option multiplies
      // the project size for something no option page can show.
      const m = buildMaster();
      m.underlay = { src: 'data:image/png;base64,AAAA', x: 0, y: 0, w: 10, h: 10, opacity: 0.4 };
      quiet(() => duplicateCurrentElevation());
      if (elevations[1].underlay) throw new Error('the option carries a copy of the tracing guide');
      if (CAT_WALL_DEEP.indexOf('underlay') >= 0) throw new Error('underlay is in the inherited list');
    });

    // BEHAVIOUR CHANGED IN 17.77, DELIBERATELY. This check used to require an option to
    // carry NO dimension annotations, on the reasoning that the dimensioned drawing
    // belongs to the breaker page and dimension lines over artwork are unwanted. The
    // designer asking for the opposite is the better evidence: the group dimensions, the
    // custom lines and the callout spacers ARE the layout work, and a mockup whose
    // measurements do not reach its own options means doing that work once per option.
    // Asked for as "any layout adjustments in the mockup ... need to mirror the
    // spawned/duplicated elevations".
    __check('an option carries the mockup\u2019s whole drawing, dimensions included', () => {
      const m = buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt = elevations[1];
      // SET AFTER THE OPTION EXISTS. _catAddOption clones the whole wall, so an option
      // minted from an already-dimensioned mockup carries the drawing whatever the sync
      // does - which means setting these first tests the CLONE and not the mirroring,
      // and the check passes with the mirroring deleted. Found by deleting it.
      m.groupDims = [{ a: 1 }]; m.customLines = [{ b: 2 }];
      m.frames[0].dimTo = 'B';
      m.frames[0].distToggles = { left: true };
      _catSyncAllOptions();
      if ((opt.groupDims || []).length !== 1) throw new Error('the option did not take the group dims');
      if ((opt.customLines || []).length !== 1) throw new Error('the option did not take the custom lines');
      if (opt.frames[0].dimTo !== 'B') throw new Error('the option did not take the callout spacer');
      if (!(opt.frames[0].distToggles || {}).left) throw new Error('the option did not take the distance toggles');
      // DEEP, never a shared reference: aliasing two walls through one object would let
      // an edit on the option rewrite the mockup, and both would share it in every undo
      // snapshot.
      if (opt.groupDims === m.groupDims) throw new Error('groupDims is SHARED with the mockup');
      if (opt.frames[0].distToggles === m.frames[0].distToggles) throw new Error('distToggles is SHARED with the mockup');
    });

    // ── THE PLAN PIN BELONGS TO THE PLACEMENT ────────────────────────────
    __check('pinning the MOCKUP slot reaches every option spec page', () => {
      // A dealership hangs ONE piece in that spot and picks which image goes in it, so
      // the pin is pinned once and every option reads it - including options that already
      // existed before the pin was placed.
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      const slotRow = dashProjectData.filter(r => r.id === 'ART-1A')[0];
      slotRow.planPins = [{ lv: 0, x: 0.4, y: 0.6 }];
      slotRow.planX = 0.4; slotRow.planY = 0.6; slotRow.level = '0';
      _catSyncAllOptions();
      ['ART-1.1A', 'ART-1.2A'].forEach(id => {
        const r = dashProjectData.filter(x => x.id === id)[0];
        if (!r) throw new Error(id + ' is missing');
        if (r.planX !== 0.4 || r.planY !== 0.6) throw new Error(id + ' did not inherit the pin');
        if (!r.planPins || r.planPins.length !== 1) throw new Error(id + ' did not inherit planPins');
        if (r.planPins === slotRow.planPins) throw new Error(id + ' shares the pin array');
      });
    });

    __check('an option row keeps its OWN artwork while inheriting the pin', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const slotRow = dashProjectData.filter(r => r.id === 'ART-1A')[0];
      const optRow = dashProjectData.filter(r => r.id === 'ART-1.1A')[0];
      optRow.artworkUrl = 'data:image/png;base64,OPT';
      optRow.imageCode = 'FFI.F.AR-2008';
      slotRow.planX = 0.1;
      _catSyncAllOptions();
      if (optRow.artworkUrl !== 'data:image/png;base64,OPT') throw new Error('the pin sync overwrote the artwork');
      if (optRow.imageCode !== 'FFI.F.AR-2008') throw new Error('the pin sync overwrote the image code');
      ['artworkUrl', 'imageCode', 'artworkFile'].forEach(k => {
        if (CAT_ROW_FIELDS.indexOf(k) >= 0 || CAT_ROW_DEEP.indexOf(k) >= 0) throw new Error(k + ' is in the inherited row list');
      });
    });

    __check('the DECK syncs before it builds, not only the Elevations tab', () => {
      // drawElevAll runs only while the elevation view is drawing, so a deck rebuilt from
      // the Deck tab would render options against a stale mockup.
      const b = fnBody('_deckPageList');
      if (b.indexOf('_catSyncAllOptions()') < 0) throw new Error('the deck builder does not sync options');
    });

    // ── AN OPTION IS AN ALTERNATE, NOT A SECOND PLACE ON THE PLAN ────────
    __check('only the MOCKUP code reaches the floorplan, not .1 / .2 / .3', () => {
      // Regression from 17.66: inheriting the pin so option spec pages could draw their
      // plan crop also put every option in the floorplan legend, four pins on one spot.
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());
      const slotRow = dashProjectData.filter(r => r.id === 'ART-1A')[0];
      slotRow.planPins = [{ lv: 0, x: 0.4, y: 0.6 }];
      slotRow.planX = 0.4; slotRow.planY = 0.6;
      _catSyncAllOptions();
      const keys = _fpGroups().map(g => g.key).sort().join(',');
      if (keys !== 'ART-1') throw new Error('the plan offers: ' + keys);
    });

    __check('the options still HOLD the pin, so their spec pages keep the crop', () => {
      // Filtered out of the plan, not stripped of the data - that is why they are
      // excluded in _fpGroups rather than simply left unpinned.
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const slotRow = dashProjectData.filter(r => r.id === 'ART-1A')[0];
      slotRow.planPins = [{ lv: 0, x: 0.4, y: 0.6 }];
      slotRow.planX = 0.4; slotRow.planY = 0.6;
      _catSyncAllOptions();
      const optRow = dashProjectData.filter(r => r.id === 'ART-1.1A')[0];
      if (optRow.planX !== 0.4) throw new Error('the option lost its inherited pin');
      if (!_catOptionRowIds()['ART-1.1A']) throw new Error('the option row is not identified as an alternate');
      if (_catOptionRowIds()['ART-1A']) throw new Error('a mockup slot was identified as an alternate');
    });

    __check('an ORDINARY project still shows every code on the plan', () => {
      elevations.length = 0; dashProjectData.length = 0;
      dashProjectData.push(row('ART.9.A'));
      dashProjectData.push(row('ART.8.A'));
      elevations.push({ id: _elevNewId(), name: 'Lobby', wallW: 185, wallH: 108, personPos: { x: 0 },
        frames: [slot('ART.9.A', 'A', 24, 24, 60), slot('ART.8.A', 'B', 18, 24, 92)] });
      const keys = _fpGroups().map(g => g.key).sort().join(',');
      if (keys !== 'ART.8,ART.9') throw new Error('a plain project lost codes from the plan: ' + keys);
    });

    // ── THE INSTALLATION NOTE HAS AN INK ─────────────────────────────────
    __check('the note colour is settable, defaulted and validated', () => {
      if (_installNoteInk('#e00000') !== '#e00000') throw new Error('a valid hex was rejected');
      if (_installNoteInk('') !== IG_NOTE_INK_DEFAULT) throw new Error('an empty value did not default');
      if (_installNoteInk('rgb(1,2,3)') !== IG_NOTE_INK_DEFAULT) throw new Error('a non-hex was accepted');
      // A bad stored value must degrade rather than throw out of a page render.
      if (_installNoteInk(undefined) !== IG_NOTE_INK_DEFAULT) throw new Error('undefined did not default');
    });

    __check('the body derives from the heading, so one pick sets the relationship', () => {
      // {r,g,b}, the shape _annHexToRgb returns. Reading it as an ARRAY is exactly how
      // the note ink shipped broken in 17.71: three undefineds into setTextColor.
      const dark = _installNoteBodyRgb({ r: 20, g: 20, b: 20 });
      if (!(dark.r > 20)) throw new Error('the body did not lift off the heading');
      const red = _installNoteBodyRgb({ r: 224, g: 0, b: 0 });
      if (!(red.r >= 224)) throw new Error('a red heading produced a darker body');
      // And it cannot leave the byte range whatever it is handed.
      const white = _installNoteBodyRgb({ r: 255, g: 255, b: 255 });
      if (white.r > 255 || white.r < 0) throw new Error('the lift left the byte range');
      ['r', 'g', 'b'].forEach(k => { if (typeof dark[k] !== 'number' || !isFinite(dark[k])) throw new Error('body.' + k + ' is ' + dark[k]); });
    });

    __check('the ink reaches BOTH breaker and install pages, with a per-page override', () => {
      editorialContent.installGuide = { breakerNoteInk: '#e00000', noteInk: '#9c9c9c', perPage: {} };
      if (_igCfg('elevgrp:x').noteInk !== '#e00000') throw new Error('breaker ink is ' + _igCfg('elevgrp:x').noteInk);
      if (_igCfg('elev:0').noteInk !== '#9c9c9c') throw new Error('install ink is ' + _igCfg('elev:0').noteInk);
      editorialContent.installGuide.perPage['elev:0'] = { noteInk: '#141414' };
      if (_igCfg('elev:0').noteInk !== '#141414') throw new Error('the per-page override did not win');
      // And it is a writable setting rather than one _igSet silently drops.
      const b = fnBody('_igSet');
      if (b.indexOf("'noteInk'") < 0) throw new Error('_igSet does not write noteInk');
    });

    __check('the drawer takes the ink explicitly, so measure and draw cannot disagree', () => {
      const b = fnBody('_drawInstallNoteBox');
      if (b.indexOf('maxH, fsScale, ink)') < 0) throw new Error('the drawer does not take an ink');
      if (b.indexOf('_nk.r') < 0) throw new Error('the heading does not print in the resolved ink');
      if (b.indexOf('_nk[0]') >= 0) throw new Error('the colour is being read as an array again');
    });

    // ── THE RAIL SAYS WHICH WALL THE OTHERS FOLLOW ───────────────────────
    // BEHAVIOUR CHANGED IN 17.77. All three roles used to render as the word MOCKUP, so
    // the single most important relationship on a placement - which wall governs the
    // others - was invisible, and four layouts read as four unrelated walls. Reported as
    // "hard to stay focused knowing what is what".
    __check('the rail shows THREE roles: primary, layout, option', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      quiet(() => duplicateCurrentElevation());
      quiet(() => renderWallRail());
      const rail = document.getElementById('nav-tabs-container');
      if (!rail) throw new Error('no wall rail in the DOM');
      const tabs = rail.querySelectorAll('.wall-tab');
      if (tabs.length !== 2) throw new Error('rail has ' + tabs.length + ' rows');
      if (!tabs[0].classList.contains('cat-primary')) throw new Error('the governing wall is not marked primary');
      if (!tabs[1].classList.contains('cat-option')) throw new Error('the option row is not marked');
      if (tabs[0].textContent.indexOf('PRIMARY') < 0) throw new Error('row 0: ' + tabs[0].textContent);
      // 17.97: options read OPTION n (was IMAGES n), numbered across the placement.
      if (tabs[1].textContent.indexOf('OPTION 1') < 0) throw new Error('row 1: ' + tabs[1].textContent);
      // An option is indented under its layout, or the tree is flat again.
      if (!tabs[1].classList.contains('cat-indent2')) throw new Error('the option is not indented');
      // And ONE header per placement, never one per wall.
      const heads = rail.querySelectorAll('.wall-rail-place');
      if (heads.length !== 1) throw new Error(heads.length + ' placement headers; expected 1');
      if (heads[0].textContent.indexOf('ART-1') < 0) throw new Error('header: ' + heads[0].textContent);
    });

    __check('a SECOND layout reads as following the primary, not governing', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, { label: 'Triptych' }));
      quiet(() => renderWallRail());
      const rail = document.getElementById('nav-tabs-container');
      const tabs = rail.querySelectorAll('.wall-tab');
      const alt = Array.prototype.filter.call(tabs, t => t.classList.contains('cat-layout'))[0];
      if (!alt) throw new Error('no layout row: ' + Array.prototype.map.call(tabs, t => t.className).join(' | '));
      if (alt.classList.contains('cat-primary')) throw new Error('the alternate claims to be primary');
      if (alt.textContent.indexOf('LAYOUT B') < 0) throw new Error('alt row: ' + alt.textContent);
      if (alt.textContent.indexOf('Triptych') < 0) throw new Error('the layout name is not shown: ' + alt.textContent);
      // Still ONE header: two layouts are one placement.
      if (rail.querySelectorAll('.wall-rail-place').length !== 1) throw new Error('two layouts produced more than one placement header');
    });

    __check('an ordinary wall is left unmarked', () => {
      elevations.length = 0;
      elevations.push({ id: _elevNewId(), name: 'Lobby', wallW: 185, wallH: 108, personPos: { x: 0 }, frames: [] });
      currentElevIndex = 0;
      quiet(() => renderWallRail());
      const t = document.getElementById('nav-tabs-container').querySelector('.wall-tab');
      if (t.classList.contains('cat-mockup') || t.classList.contains('cat-option')) throw new Error('a plain wall was marked');
      if (t.querySelector('.wall-tab-cat')) throw new Error('a plain wall grew a tag');
    });

    // ── THE BREAKER PAGE'S LAYOUT ────────────────────────────────────────
    __check('EVERY breaker-global setting has a slot, or its control does nothing', () => {
      // A field missing from BREAKER_SLOT is written to the INSTALL slot while the
      // breaker goes on reading its own, so the control moves a value nothing reads.
      // That is exactly what "the note colour does not work" was.
      const b = fnBody('_igSet');
      const simpleAt = b.indexOf('const simple = [');
      const slotAt = b.indexOf('const BREAKER_SLOT = {');
      if (simpleAt < 0 || slotAt < 0) throw new Error('_igSet changed shape');
      ['noteInk', 'noteSide', 'legendDims', 'legendArt', 'legendCode'].forEach(f => {
        if (b.indexOf("'" + f + "'") < 0) throw new Error(f + ' is not writable at all');
        if (b.indexOf(f + ': ' + "'breaker") < 0) throw new Error(f + ' has no breaker slot, so it writes where nothing reads');
      });
    });

    __check('a breaker note colour written deck-wide lands where the breaker READS it', () => {
      editorialContent.installGuide = {};
      _igSet({ noteInk: '#e00000' }, '', true);
      if (editorialContent.installGuide.breakerNoteInk !== '#e00000') throw new Error('it went to ' + JSON.stringify(editorialContent.installGuide));
      if (_igCfg('elevgrp:x').noteInk !== '#e00000') throw new Error('the breaker does not read it back');
      // And an install page's own write must not reach the breaker.
      _igSet({ noteInk: '#9c9c9c' }, '', false);
      if (_igCfg('elevgrp:x').noteInk !== '#e00000') throw new Error('an install-page write bled onto the breaker');
    });

    __check('notes sit LEFT on a breaker and RIGHT on an install page', () => {
      editorialContent.installGuide = {};
      if (_igCfg('elevgrp:x').noteSide !== 'left') throw new Error('breaker default is ' + _igCfg('elevgrp:x').noteSide);
      if (_igCfg('elev:0').noteSide !== 'right') throw new Error('install default is ' + _igCfg('elev:0').noteSide);
      // Settable both ways, per page.
      editorialContent.installGuide.perPage = { 'elevgrp:x': { noteSide: 'right' } };
      if (_igCfg('elevgrp:x').noteSide !== 'right') throw new Error('the per-page override did not win');
    });

    __check('a RIGHT column takes its own width; a LEFT one shares the legend column', () => {
      // 17.68 gave both sides their own slice, which is what put the notes BESIDE the
      // legend and squeezed the drawing. A right column still takes width off SR.R,
      // because there is nothing on that side to share with. A left one does not touch
      // SR.L at all - it stacks inside the column the legend already reserves.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('_igNoteLeft') < 0) throw new Error('the note column has no side');
      if (b.indexOf('SR.R -= (_igNoteW + IG_NOTE_GUTTER)') < 0) throw new Error('a right column stopped taking width off the right');
      if (b.indexOf('SR.L += ') >= 0) throw new Error('a left column is taking its own slice again, so it sits beside the legend');
    });

    __check('the elevation anchors BOTTOM-RIGHT in both layout branches', () => {
      const b = fnBody('_drawInstallGuidePage');
      const centred = b.split('ex0 + ((SR.R - ex0) - ew) / 2').length - 1;
      if (centred > 0) throw new Error(centred + ' branches still centre the elevation');
      const anchored = b.split('Math.max(ex0, SR.R - ew)').length - 1;
      if (anchored !== 2) throw new Error(anchored + ' branches anchor right; expected 2');
    });

    __check('the letter legend is THREE independent lines', () => {
      editorialContent.installGuide = {};
      const c = _igCfg('elevgrp:x');
      // The two that were always there stay on, so an existing deck is unchanged.
      if (c.legendDims !== true) throw new Error('overall dimensions default off');
      if (c.legendCode !== true) throw new Error('image code defaults off');
      if (c.legendArt !== false) throw new Error('art dimensions default ON, which would change every existing page');
      editorialContent.installGuide.breakerLegendCode = false;
      editorialContent.installGuide.breakerLegendArt = true;
      const c2 = _igCfg('elevgrp:x');
      if (c2.legendCode !== false) throw new Error('image code could not be turned off');
      if (c2.legendArt !== true) throw new Error('art dimensions could not be turned on');
    });

    __check('the legend block grows and shrinks with the lines it prints', () => {
      // Two lines of height for two ticks, one for one. A fixed 2-row block would leave a
      // gap under every letter on a mockup with the image code off.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('_legLines.length') < 0) throw new Error('the block height is not derived from the ticked lines');
      if (b.indexOf('blockH = 2 * rowH2 + 5') >= 0) throw new Error('the block height is still fixed at two rows');
      // THE LETTER IS ITS OWN COLUMN since 17.72, not a prefix on the first label.
      // Inline it pushed line one right and left lines two and three hanging, so the
      // three lines of a block started at three different x positions. What still has to
      // be true is that the letter prints ONCE per block whatever is ticked, and that
      // the label lines all start after the gutter rather than at the block's left edge.
      if (b.indexOf('IG_LEG_LETTER_W') < 0) throw new Error('there is no letter gutter');
      if (b.indexOf("doc.text((f.letter || '?'), lx, by)") < 0) throw new Error('the letter is not drawn in its own column');
      if (b.indexOf("(li === 0 ? ((f.letter || '?') + ': ') : '')") >= 0) throw new Error('the letter is glued to a label again');
      if (b.indexOf('const tx = lx + IG_LEG_LETTER_W') < 0) throw new Error('the label lines do not start after the gutter');
      // And the leading came down, which is what buys the notes their room.
      // 17.96: the metrics moved to module scope, beside the shared legend measure.
      if (S.indexOf('IG_LEG_ROW_H = 8.6') < 0) throw new Error('the legend leading is not tightened');
    });

    __check('art dimensions come from the ONE opening definition', () => {
      // Five other places print this number; a local calculation here is how they drift.
      // 17.96: the values are built once, in _igLegVals, for the measure and the drawer.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('_igLegVals(rr)') < 0) throw new Error('the legend builds its values itself');
      if (fnBody('_igLegVals').indexOf('_rowOpeningAndPrint(rr)') < 0) throw new Error('the legend computes the opening itself');
    });

    // ── THE BREAKER'S LEFT COLUMN: LEGEND, NOTES, PLAN ──────────────────
    __check('a LEFT note column is deferred, not drawn in the up-front block', () => {
      // Reported: "when I have installation notes checked it pushes the letter legend to
      // the right". The up-front block shrank SR.L, so the notes took their OWN column
      // beside the legend instead of stacking under it - and they drew at SR.T, level
      // with the title, because the band height is not known that early.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('SR.L += (_igNoteW + IG_NOTE_GUTTER)') >= 0) throw new Error('a left column still takes its own slice of width');
      if (b.indexOf('if (!_igNoteLeft) {') < 0) throw new Error('the up-front block still draws the left case');
      // And the deferred draw has to be AHEAD of every early return, which is the whole
      // reason the box was drawn up front in the first place.
      const atTop = b.indexOf('const _igTop =');
      const atDraw = b.indexOf('_drawInstallNoteBox(doc, SR.L,');
      const atReturn = b.indexOf('return;');
      if (atDraw < 0) throw new Error('the left notes are never drawn');
      if (!(atDraw > atTop)) throw new Error('the left notes draw before the title band is measured');
      if (atReturn >= 0 && !(atDraw < atReturn)) throw new Error('the left notes draw after an early return');
    });

    __check('the legend and the notes are ONE column, aligned on both edges', () => {
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('_igLeftColW') < 0) throw new Error('there is no shared left column width');
      // ONE shared width since 17.74 - the notes and the legend both read _igLeftColW,
      // which _igColW derives from the single stored number the two width sliders share.
      if (b.indexOf('const nw = _igLeftColW;') < 0) throw new Error('the notes do not take the shared column width');
      if (b.indexOf('_igColW(_igNoteCfg, SR.R - SR.L)') < 0) throw new Error('the column width is not derived from the shared budget');
      if (b.indexOf('const legendColW = _igLeftColW ? (_igLeftColW + legendGutter) : 0;') < 0) throw new Error('the layout still reserves a legend-only column');
    });

    __check('the reserved legend height uses the SAME arithmetic as the drawn one', () => {
      // Two copies of "how tall is a letter block" is how the notes end up overlapping
      // the legend the first time someone unticks a line.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('IG_LEG_ROW_H') < 0) throw new Error('the row height is not shared');
      // 17.96: a line can stack when it does not fit, so the height is MEASURED, through
      // one function both the reservation and the drawer call.
      if (b.indexOf('_igLegendHeight(doc,') < 0) throw new Error('the reservation does not use the shared measure');
      if (b.indexOf('_igLegBlockRows(doc, rr, _legLines, tw)') < 0) throw new Error('the drawer does not use the shared measure');
    });

    __check('the plan steps OVER the notes rather than under them', () => {
      const b = fnBody('_drawInstallGuidePage');
      // Measured from the LEGEND's top since 17.74, not the drawing's: the legend sits on
      // the subheading's clearance and the drawing's top carries an extra 22pt for the
      // wall dimension above it, so stepping from _igTop would leave a gap that grows.
      if (b.indexOf('colTop = Math.max(colTop, _igLegTop + _igLeftUsedH + sectionGap)') < 0) throw new Error('the plan can draw on top of the notes');
      if (b.indexOf('Math.max((SR.R - M) * 0.26, _igLeftColW)') < 0) throw new Error('the plan column is not as wide as the one above it');
    });

    // ── A BREAKER CAN SHOW A PLAN ────────────────────────────────────────
    __check('the breaker variant is no longer FORCED to elevation only', () => {
      editorialContent.installGuide = {};
      if (_igCfg('elevgrp:x').variant !== 'elevOnly') throw new Error('the default changed; an untouched deck must be unaffected');
      editorialContent.installGuide.breakerVariant = 'elevPlan';
      if (_igCfg('elevgrp:x').variant !== 'elevPlan') throw new Error('a breaker still cannot show its plan');
      // Its OWN slot, so an install-guide page cannot drag it along.
      editorialContent.installGuide.variant = 'elevFrames';
      if (_igCfg('elevgrp:x').variant !== 'elevPlan') throw new Error('an install-guide setting bled onto the breaker');
    });

    __check('the plan choice and its scale are breaker-owned too', () => {
      editorialContent.installGuide = { breakerVariant: 'elevPlan', breakerPlan: 'zoom', breakerPlanScale: 0.7 };
      const c = _igCfg('elevgrp:x');
      if (c.plan !== 'zoom') throw new Error('plan is ' + c.plan);
      if (c.planScale !== 0.7) throw new Error('planScale is ' + c.planScale);
      // And all three write to their own slots rather than the install ones.
      editorialContent.installGuide = {};
      _igSet({ variant: 'elevPlan', plan: 'zoom', planScale: 0.8 }, '', true);
      const g = editorialContent.installGuide;
      if (g.breakerVariant !== 'elevPlan' || g.breakerPlan !== 'zoom' || g.breakerPlanScale !== 0.8) {
        throw new Error('written to the wrong slots: ' + JSON.stringify(g));
      }
      if (g.variant || g.plan || g.planScale) throw new Error('it also wrote the install slots');
    });

    __check('a breaker is offered Elev only / Elev + plan, and NOT Elev + frames', () => {
      // A moulding gallery is an install-guide idea; a location page has no use for one.
      const b = fnBody('_dsInstallGuideControls');
      if (b.indexOf("opts.variants === 'breaker'") < 0) throw new Error('the panel has no breaker variant mode');
      const at = b.indexOf("_igVariantMode === 'breaker'");
      if (at < 0) throw new Error('the reduced option set is missing');
      const opts = b.slice(at, at + 260);
      if (opts.indexOf("'elevPlan'") < 0) throw new Error('a breaker cannot pick the plan layout');
      const before = b.slice(at, b.indexOf('segRow(opt,'));
      if (before.indexOf("'elevFrames'") >= 0 && before.indexOf('? [') < before.indexOf("'elevFrames'") && before.indexOf("'elevFrames'") < before.indexOf(': [')) {
        throw new Error('the breaker set offers frame thumbnails');
      }
      if (S.indexOf('{ variants: false }') >= 0) throw new Error('a breaker panel still suppresses the controls entirely');
    });

    // ── REGRESSION: an option's spec page lost its floorplan crop ────────
    __check('an OPTION row still gets its plan crop, in catalogue and Final Spec', () => {
      // _fpGroups deliberately leaves options out - an alternate is not a second place on
      // the plan - and _planCropCanvasForRow looked its group up there, so EVERY option
      // spec page lost its floorplan thumbnail. That is every spec page a catalogue has.
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const slotRow = dashProjectData.filter(r => r.id === 'ART-1A')[0];
      slotRow.planPins = [{ lv: 0, x: 0.4, y: 0.6 }];
      slotRow.planX = 0.4; slotRow.planY = 0.6; slotRow.level = 0;
      _catSyncAllOptions();
      const optRow = dashProjectData.filter(r => r.id === 'ART-1.1A')[0];
      // No group, by design...
      if (_fpGroups().some(g => g.key === 'ART-1.1')) throw new Error('an option came back onto the plan');
      // ...but the row can answer for itself, because it mirrors the mockup's pin.
      const g = _catRowAsPlanGroup(optRow);
      if (!g) throw new Error('the option row cannot resolve a plan group');
      if (g.planX !== 0.4 || g.planY !== 0.6) throw new Error('it resolved the wrong pin');
      // A mockup slot is NOT answered this way - it has a real group.
      if (_catRowAsPlanGroup(slotRow)) throw new Error('a mockup slot took the fallback path');
      const b = fnBody('_planCropCanvasForRow');
      if (b.indexOf('_catRowAsPlanGroup(r)') < 0) throw new Error('the crop never asks the row');
    });

    // ── THE BREAKER PLAN ─────────────────────────────────────────────────
    __check('the plan has a TARGET SIZE, so notes cannot squeeze it away', () => {
      // It used to fill everything between the column above and the page bottom, so each
      // ticked note pushed it smaller - the more explaining the notes did, the less
      // readable the drawing they explained.
      if (typeof IG_PLAN_H_FRAC !== 'number') throw new Error('there is no plan height target');
      if (!(IG_PLAN_H_FRAC > 0.2 && IG_PLAN_H_FRAC < 0.7)) throw new Error('IG_PLAN_H_FRAC is ' + IG_PLAN_H_FRAC);
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('IG_PLAN_H_FRAC') < 0) throw new Error('the renderer does not use the target');
      if (b.indexOf('((yBot - capH) - colTop) * planScale') >= 0) throw new Error('the plan still takes whatever is left over');
    });

    __check('the plan size slider covers BOTH plan modes, not just zoomed', () => {
      const b = fnBody('_dsInstallGuideControls');
      const at = b.indexOf("slider('Plan size'");
      if (at < 0) throw new Error('the plan size slider is gone or renamed');
      const gate = b.slice(Math.max(0, at - 220), at);
      if (gate.indexOf("cfg().plan === 'zoom'") >= 0) throw new Error('the slider is still gated on the zoomed mode');
      if (gate.indexOf("cfg().variant !== 'elevOnly'") < 0) throw new Error('the slider shows with no plan on the page');
    });

    __check('the breaker plan draws the WALL LINE, through the shared pieces', () => {
      // A pin says which room; the line says which wall and how much of it.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('_wallAllSegs(rr)') < 0) throw new Error('the plan draws no wall line');
      if (b.indexOf('FP_WALL_LINE_ALPHA') < 0) throw new Error('it does not use the one shared alpha');
      // Anchored on the DRAWING block, not on the first _wallAllSegs in the file - the
      // zoom crop uses it too and sits earlier, so a naive first-match reads the wrong
      // span and reports a reset that is plainly there.
      // 17.88: the red pin dots are GONE on purpose ("we do not want to include the
      // circle number on the plan detail on spec page or the breaker pages"); a dashed
      // box around the line marks the spot instead (test_plan_detail_box).
      const linesAt = b.indexOf('_fpDocLineAlpha(doc, FP_WALL_LINE_ALPHA)');
      const boxAt = b.indexOf('_drawPlanBoxPdf(doc, pins, mapPin');
      if (linesAt < 0) throw new Error('the line is never drawn translucent');
      if (boxAt < 0) throw new Error('the marking box is gone');
      if (!(linesAt < boxAt)) throw new Error('the box draws before the line');
      // Opacity must be put back between them, or the box inherits it.
      if (b.slice(linesAt, boxAt).indexOf('_fpDocLineAlpha(doc, 1)') < 0) throw new Error('the line alpha is never reset');
    });

    __check('the zoomed crop frames the line ends, not only the pin', () => {
      // A zoom centred on the dot alone cuts a long wall run in half, and the half it
      // loses is the half that says how far the hang extends.
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('xs.push(sg[0], sg[2])') < 0) throw new Error('the crop ignores the wall line');
    });

    __check('the layout guides fold away so Layout stays in view', () => {
      // Eight deck-wide toggles set once pushed the controls that decide what the page IS
      // far enough down to be missed.
      const b = fnBody('_dsElevGuidesInto');
      if (b.indexOf("createElement('details')") < 0) throw new Error('the guides block is not collapsible');
      if (b.indexOf("createElement('summary')") < 0) throw new Error('it has no summary to click');
      if (b.indexOf('open = true') >= 0 || b.indexOf('.open=true') >= 0) throw new Error('it starts expanded, which is the problem it was meant to fix');
    });
    // == ARRANGEMENTS: SEVERAL LAYOUTS, ONE PLACEMENT =====================
    // Build ART.001A (2 slots) and ART.001B (3 slots) as two mockups of one placement.
    const buildTwoArrangements = () => {
      elevations.length = 0;
      dashProjectData.length = 0;
      ['ART.001A-A', 'ART.001A-B'].forEach(id => dashProjectData.push(row(id)));
      ['ART.001B-A', 'ART.001B-B', 'ART.001B-C'].forEach(id => dashProjectData.push(row(id)));
      dashProjectData[0].planX = 0.4; dashProjectData[0].planY = 0.6; dashProjectData[0].level = 0;
      elevations.push({
        id: _elevNewId(), name: 'ART.001A', wallW: 185, wallH: 108, catalogueMaster: true,
        frames: [slot('ART.001A-A', 'A', 24, 24, 60), slot('ART.001A-B', 'B', 18, 24, 92)]
      });
      elevations.push({
        id: _elevNewId(), name: 'ART.001B', wallW: 185, wallH: 108, catalogueMaster: true,
        frames: [slot('ART.001B-A', 'A', 12, 12, 40), slot('ART.001B-B', 'B', 12, 12, 60), slot('ART.001B-C', 'C', 12, 12, 80)]
      });
      currentElevIndex = 0; currentView = 'elevation';
    };

    __check('the placement key is DERIVED by stripping the arrangement letter', () => {
      if (_catPlacementKey('ART.001A') !== 'ART.001') throw new Error(_catPlacementKey('ART.001A'));
      if (_catPlacementKey('ART.001B') !== 'ART.001') throw new Error(_catPlacementKey('ART.001B'));
      if (_catPlacementKey('ART-1A') !== 'ART-1') throw new Error('the hyphen convention broke: ' + _catPlacementKey('ART-1A'));
      if (_catPlacementKey('ART.001AB') !== 'ART.001') throw new Error('past Z: ' + _catPlacementKey('ART.001AB'));
      // A code ending in a DIGIT has no arrangement and is its own placement. This is
      // what makes every project predating arrangements group exactly as it did.
      if (_catPlacementKey('ART.001') !== 'ART.001') throw new Error('an unlettered code moved: ' + _catPlacementKey('ART.001'));
      if (_catPlacementKey('EGD-12') !== 'EGD-12') throw new Error(_catPlacementKey('EGD-12'));
      if (_catPlacementKey('') !== '') throw new Error('empty code');
      if (_catArrLetter('ART.001B') !== 'B') throw new Error(_catArrLetter('ART.001B'));
      if (_catArrLetter('ART.001') !== '') throw new Error('an unlettered code claimed a letter');
    });

    __check('EXACT REQUEST: several elevations are ONE placement on the plan', () => {
      buildTwoArrangements();
      _catSyncAllOptions();
      const keys = _fpGroups().map(g => g.key);
      // Arrangement A holds the pin; B is the same spot and must not put a second one there.
      if (keys.indexOf('ART.001A') < 0) throw new Error('the primary arrangement lost its group: ' + keys.join(','));
      if (keys.indexOf('ART.001B') >= 0) throw new Error('the alternate arrangement put a SECOND pin on the plan: ' + keys.join(','));
      const g = _fpGroups().filter(x => x.key === 'ART.001A')[0];
      if (!g || g.planX !== 0.4) throw new Error('the primary lost its pin');
    });

    __check('an alternate arrangement BORROWS the pin rather than having none', () => {
      // Filtered off the plan, but its own spec pages still have to draw the crop -
      // exactly the trap _catRowAsPlanGroup was added for on options.
      buildTwoArrangements();
      _catSyncAllOptions();
      const r = dashProjectData.filter(x => x.id === 'ART.001B-A')[0];
      if (r.planX !== 0.4 || r.planY !== 0.6) throw new Error('the alternate row did not take the pin: ' + r.planX);
      const g = _catRowAsPlanGroup(r);
      if (!g || g.planX !== 0.4) throw new Error('the alternate row cannot answer for its own crop');
    });

    __check('the PRIMARY is the lowest letter, and an unlettered original wins', () => {
      buildTwoArrangements();
      if (_catPrimaryArr('ART.001') !== elevations[0]) throw new Error('wrong primary');
      // Order in the array must not decide it.
      const tmp = elevations[0]; elevations[0] = elevations[1]; elevations[1] = tmp;
      if (_catBaseCode(_catPrimaryArr('ART.001')) !== 'ART.001A') throw new Error('the primary moved with the array order');
      // Z before AA: shortest letter first, not plain string order.
      if (_catArrCmp('ART.001Z', 'ART.001AA') >= 0) throw new Error('AA sorted before Z');
      if (_catArrCmp('ART.001', 'ART.001A') >= 0) throw new Error('an unlettered original did not sort first');
    });

    __check('one arrangement on its own behaves EXACTLY as before', () => {
      // The whole safety of this change: a project that never makes a second arrangement
      // must see no difference at all.
      buildMaster();
      dashProjectData[0].planX = 0.2; dashProjectData[0].planY = 0.3;
      _catSyncAllOptions();
      const keys = _fpGroups().map(g => g.key);
      if (keys.indexOf('ART-1') < 0) throw new Error('a lone mockup left the plan: ' + keys.join(','));
      if (Object.keys(_catAltArrRowIds()).length) throw new Error('a lone mockup was treated as an alternate');
    });

    __check('ADD LAYOUT mints a sibling mockup and keeps the separator', () => {
      // A placement with ONE arrangement. (Trimming the two-arrangement fixture would
      // leave B's ROWS behind and the collision guard would correctly refuse.)
      elevations.length = 0;
      dashProjectData.length = 0;
      ['ART.001A-A', 'ART.001A-B'].forEach(id => dashProjectData.push(row(id)));
      elevations.push({
        id: _elevNewId(), name: 'ART.001A', wallW: 185, wallH: 108, catalogueMaster: true,
        frames: [slot('ART.001A-A', 'A', 24, 24, 60), slot('ART.001A-B', 'B', 18, 24, 92)]
      });
      currentElevIndex = 0; currentView = 'elevation';
      quiet(() => _catAddArrangement(0));
      const made = elevations.filter(e => _catBaseCode(e) === 'ART.001B')[0];
      if (!made) throw new Error('no arrangement B: ' + elevations.map(e => _catBaseCode(e)).join(','));
      if (!_isCatalogueMaster(made)) throw new Error('the new arrangement is not a mockup');
      if (made.catalogueOption) throw new Error('the new arrangement claims to be an option');
      // The SOURCE's separator, never an assumed one.
      const ids = made.frames.map(f => f.id);
      if (ids.join(',') !== 'ART.001B-A,ART.001B-B') throw new Error('slot ids: ' + ids.join(','));
      ids.forEach(id => { if (!dashProjectData.filter(r => r.id === id)[0]) throw new Error('no row for ' + id); });
      // And it is one placement with A, so the plan still shows one pin.
      if (_catArrangementsOf('ART.001').length !== 2) throw new Error('not two arrangements of one placement');
    });

    __check('ADD LAYOUT from an OPTION carries the images onto an option, not the mockup', () => {
      // "an alternate layout of the salon hang containing the same images". A mockup slot
      // is a drawing and is out of every output, so an image left on one is invisible.
      buildMaster();
      quiet(() => duplicateCurrentElevation());          // ART-1.1
      const opt = elevations.filter(e => e.catalogueOption === '1')[0];
      const optIdx = elevations.indexOf(opt);
      dashProjectData.filter(r => r.id === 'ART-1.1A')[0].artworkUrl = 'data:image/png;base64,AAAA';
      opt.frames[0].artworkUrl = 'data:image/png;base64,AAAA';
      currentElevIndex = optIdx;
      quiet(() => _catAddArrangement(optIdx));
      const madeM = elevations.filter(e => _isCatalogueMaster(e) && _catBaseCode(e) === 'ART-1B')[0];
      if (!madeM) throw new Error('no arrangement B: ' + elevations.map(e => _catBaseCode(e)).join(','));
      // The new MOCKUP is empty.
      madeM.frames.forEach(f => { if (f.artworkUrl) throw new Error('the new mockup kept artwork on ' + f.id); });
      const mRow = dashProjectData.filter(r => r.id === madeM.frames[0].id)[0];
      if (!mRow) throw new Error('no slot row for ' + madeM.frames[0].id);
      if (mRow.artworkUrl) throw new Error('the new mockup SLOT ROW kept artwork');
      // Its first option carries them.
      const madeO = _catOptionsOf(madeM)[0];
      if (!madeO) throw new Error('no option was minted to hold the images');
      const oRow = dashProjectData.filter(r => r.id === madeO.frames[0].id)[0];
      if (!oRow || oRow.artworkUrl !== 'data:image/png;base64,AAAA') throw new Error('the images were not carried onto the option');
    });

    __check('a slot spelling with NO separator gets one, or the letters run together', () => {
      // buildMaster spells its slots ART-1A. ART-1B + A would be ART-1BA, which is also
      // how arrangement BA spells itself, and ART-1B is already slot B of arrangement A.
      buildMaster();
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0));
      const made = elevations.filter(e => _isCatalogueMaster(e) && _catBaseCode(e) === 'ART-1B')[0];
      if (!made) throw new Error('no arrangement B: ' + elevations.map(e => _catBaseCode(e)).join(','));
      const ids = made.frames.map(f => f.id);
      if (ids.join(',') !== 'ART-1B-A,ART-1B-B') throw new Error('slot ids ran together: ' + ids.join(','));
      // And the grouping machinery still reads them the way it should.
      if (_artGroupKey('ART-1B-A') !== 'ART-1B') throw new Error('_artGroupKey gave ' + _artGroupKey('ART-1B-A'));
      if (_catPlacementKey('ART-1B') !== 'ART-1') throw new Error('the new arrangement left the placement');
    });

    __check('TWO ROWS MAY NEVER SHARE AN ID, and the minters refuse rather than clash', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());          // ART-1.1A / ART-1.1B exist
      const before = dashProjectData.length;
      // Force the next option to collide by resetting the counter the way a broken link does.
      const opt = elevations.filter(e => e.catalogueOption === '1')[0];
      delete opt.catalogueOption;
      currentElevIndex = 0;
      quiet(() => duplicateCurrentElevation());          // would mint ART-1.1A again
      const ids = dashProjectData.map(r => r.id);
      const dupes = ids.filter((id, i) => id && ids.indexOf(id) !== i);
      if (dupes.length) throw new Error('duplicate row ids were created: ' + dupes.join(','));
      // 17.89: the option counter now SKIPS any code a row already groups under
      // (_catCodeInUse), so a broken counter mints the next free option instead of
      // refusing. The invariant this check exists for - no two rows share an id - holds
      // either way; the new option simply lands on a free code.
      const added = dashProjectData.slice(before).map(r => r.id);
      if (added.length && added.some(id => id.indexOf('ART-1.1') === 0)) throw new Error('the new option reused ART-1.1: ' + added.join(','));
    });

    // BEHAVIOUR CHANGED IN 17.78: duplicating an IMAGE SET now gives another image set
    // CARRYING the pictures, which is what makes "the same images in a different order"
    // two clicks. The bug this check was written for is unchanged and still guarded, but
    // as the invariant rather than as "the copy is not an option": an option must never
    // point at another option, which is what made the mockup guard miss and minted a
    // duplicate set of row ids.
    __check('duplicating an image set gives a SIBLING option, never a chained one', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt1 = elevations.filter(e => e.catalogueOption === '1')[0];
      opt1.frames[0].artworkUrl = 'data:image/png;base64,AAAA';
      const r1 = dashProjectData.filter(r => r.id === opt1.frames[0].id)[0];
      if (r1) r1.artworkUrl = 'data:image/png;base64,AAAA';
      currentElevIndex = elevations.indexOf(opt1);
      quiet(() => duplicateCurrentElevation());
      const opt2 = elevations.filter(e => e.catalogueOption === '2')[0];
      if (!opt2) throw new Error('duplicating an option did not mint option 2');
      // It hangs off the MOCKUP, not off option 1. An option chained to an option is the
      // shape that let a wall be marked a mockup and mint colliding row ids.
      if (_catMasterOf(opt2) !== elevations[0]) throw new Error('option 2 is not linked to the mockup');
      // …and it carries the pictures, so there is something to rearrange.
      if (opt2.frames[0].artworkUrl !== 'data:image/png;base64,AAAA') throw new Error('the images were not carried');
      const r2 = dashProjectData.filter(r => r.id === opt2.frames[0].id)[0];
      if (!r2 || r2.artworkUrl !== 'data:image/png;base64,AAAA') throw new Error('the option ROW did not get the image');
      // THE INVARIANT: nothing anywhere claims to be an option while pointing at a wall
      // that is not a mockup.
      elevations.forEach(e => {
        if (!e.catalogueOption) return;
        if (!_catMasterOf(e)) throw new Error((e.name || '?') + ' claims to be an option but points at no mockup');
      });
    });

    __check('EXACT REQUEST: dragging a row moves the PICTURE, not the frame', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const opt = elevations.filter(e => e.catalogueOption === '1')[0];
      currentElevIndex = elevations.indexOf(opt);
      const fa = opt.frames[0], fb = opt.frames[1];
      fa.artworkUrl = 'A-PIC'; fb.artworkUrl = 'B-PIC';
      fa.imageCode = 'a.jpg'; fb.imageCode = 'b.jpg';
      const ax = fa.x, bx = fb.x;
      quiet(() => moveElevArtwork('A', 'B'));
      if (fa.artworkUrl !== 'B-PIC' || fb.artworkUrl !== 'A-PIC') throw new Error('the pictures did not move: ' + fa.artworkUrl + '/' + fb.artworkUrl);
      // The whole payload travels, not just the src - a crop or an image code left
      // behind names the wrong file on the spec page.
      if (fa.imageCode !== 'b.jpg' || fb.imageCode !== 'a.jpg') throw new Error('the image code stayed behind');
      // THE FRAMES DID NOT MOVE.
      if (fa.x !== ax || fb.x !== bx) throw new Error('a frame moved: ' + fa.x + ',' + fb.x);
      // And the dashboard rows followed, or the wall and the spec page disagree about
      // which picture is piece B.
      const ra = dashProjectData.filter(r => r.id === fa.id)[0];
      if (!ra || ra.artworkUrl !== 'B-PIC') throw new Error('the dashboard row did not follow');
    });

    // == A MOCKUP SLOT TAKES NO ARTWORK ===================================
    __check('all three artwork write paths refuse a mockup slot', () => {
      buildMaster();
      quiet(() => duplicateCurrentElevation());
      const slotRow = dashProjectData.filter(r => r.id === 'ART-1A')[0];
      const optRow = dashProjectData.filter(r => r.id === 'ART-1.1A')[0];
      if (_catRowTakesArt(slotRow)) throw new Error('a mockup slot claims to take artwork');
      if (!_catRowTakesArt(optRow)) throw new Error('an option row was refused artwork');
      const URL = 'data:image/png;base64,BBBB';
      // Form upload.
      dashSelectedRowIndex = dashProjectData.indexOf(slotRow);
      quiet(() => applyArtworkToCurrentRow(URL, 'pic.jpg', 10, 10));
      if (slotRow.artworkUrl) throw new Error('the form wrote artwork to a mockup slot');
      // Elevation drop.
      quiet(() => applyArtworkToRowIndex(dashProjectData.indexOf(slotRow), URL, 'pic.jpg', 10, 10));
      if (slotRow.artworkUrl) throw new Error('the elevation drop wrote artwork to a mockup slot');
      // Bulk relink.
      quiet(() => _bulkApplyArtwork(dashProjectData.indexOf(slotRow), URL, 10, 10));
      if (slotRow.artworkUrl) throw new Error('bulk replace wrote artwork to a mockup slot');
      // And an option row still takes one, or the guard is just breaking uploads.
      dashSelectedRowIndex = dashProjectData.indexOf(optRow);
      quiet(() => applyArtworkToCurrentRow(URL, 'pic.jpg', 10, 10));
      if (optRow.artworkUrl !== URL) throw new Error('an option row stopped accepting artwork');
    });

    __check('bulk relink does not even OFFER a mockup slot as a match', () => {
      buildMaster();
      dashProjectData.filter(r => r.id === 'ART-1A')[0].imageCode = 'PIC-9';
      if (_bulkMatchPieces('PIC-9').length) throw new Error('a mockup slot was offered as a relink target');
    });

    __check('the PNG pack skips mockup slots, which was the last output still emitting them', () => {
      const S2 = window.__appSrc;
      const at = S2.indexOf('const baseName = buildPngFilename(row).replace');
      if (at < 0) throw new Error('the PNG loop moved');
      const before = S2.slice(Math.max(0, at - 600), at);
      if (before.indexOf('_catRowTakesArt(row)') < 0) throw new Error('the PNG loop still writes a file for every row');
    });

    __check('the dashboard marks catalogue rows with a STRIPE that has a real CSS rule', () => {
      const b = fnBody('renderDashTable');
      if (b.indexOf("classList.add('dash-cat-slot')") < 0) throw new Error('mockup slots are not marked');
      if (b.indexOf("classList.add('dash-cat-option')") < 0) throw new Error('option rows are not marked');
      // Setting a class is not the same as having a style - the .action-btn.active trap.
      const css = window.__cssSrc || '';
      if (css.indexOf('tr.dash-cat-slot > td:first-child') < 0) throw new Error('no CSS paints the mockup stripe');
      if (css.indexOf('tr.dash-cat-option > td:first-child') < 0) throw new Error('no CSS paints the option stripe');
      // A stripe, never a row background, or the selected row stops reading as selected.
      const at = css.indexOf('tr.dash-cat-slot > td:first-child');
      const rule = css.slice(at, css.indexOf('}', at));
      if (rule.indexOf('background') >= 0) throw new Error('the mockup row is tinted rather than striped');
    });

    // == LINKED vs FREE: WHAT A LAYOUT TAKES FROM THE PRIMARY ==============
    const twoLayouts = (opts) => {
      buildMaster();                       // ART-1A/B after the rename below
      elevations[0].name = 'ART-1';
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, opts || {}));
      return elevations.filter(e => _isCatalogueMaster(e) && _catBaseCode(e) === 'ART-1B')[0];
    };

    __check('EXACT REQUEST: a size changed on the primary reaches every linked layout', () => {
      const alt = twoLayouts();
      if (!alt) throw new Error('no second layout');
      // Move the layout's frames: that is the whole point of a second layout.
      alt.frames[0].x = 120; alt.frames[0].y = 70;
      // Now resize on the PRIMARY.
      elevations[0].frames[0].w = 48;
      elevations[0].frames[0].h = 36;
      elevations[0].frames[0].fCode = 'MICH 999';
      _catSyncAllOptions();
      if (alt.frames[0].w !== 48 || alt.frames[0].h !== 36) throw new Error('the layout did not take the new size: ' + alt.frames[0].w + 'x' + alt.frames[0].h);
      if (alt.frames[0].fCode !== 'MICH 999') throw new Error('the layout did not take the moulding');
      // AND ITS POSITION IS UNTOUCHED. Inheriting x/y would make every layout the same
      // layout, which is the one thing that must never happen.
      if (alt.frames[0].x !== 120 || alt.frames[0].y !== 70) throw new Error('the layout lost its own position: ' + alt.frames[0].x + ',' + alt.frames[0].y);
    });

    // BEHAVIOUR CHANGED IN 17.78. catalogueFree is RETIRED: "this layout owns its
    // frames" is what a FRAME SET is, and a level says it better than a flag. Two ways to
    // express one idea was the confusion the level was added to remove.
    __check('a FRAME SET owns its frames and takes nothing from another set', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, { newSet: true, label: 'Single' }));
      // 17.97: a frame set is a LETTER of the placement (ART-1B) with its set number
      // stored on the wall, because options own the dotted numbers now (ART-1.2 is option 2).
      const set2 = elevations.filter(e => _isCatalogueMaster(e) && _catBaseCode(e) === 'ART-1B')[0];
      if (!set2) throw new Error('no second frame set: ' + elevations.map(e => _catBaseCode(e)).join(','));
      if (set2.catalogueSet !== 2) throw new Error('the set number is not stored on the wall');
      if (_catSetNum(_catBaseCode(set2)) !== 2) throw new Error('the set number is wrong');
      if (_catLayoutLabel(set2) !== 'Single') throw new Error('the label did not stick: ' + _catLayoutLabel(set2));
      // Same PLACEMENT, so one pin; different SET, so its frames are its own.
      if (_catPlacementKey(_catBaseCode(set2)) !== 'ART-1') throw new Error('the set left the placement');
      set2.frames[0].w = 90;
      elevations[0].frames[0].w = 48;
      _catSyncAllOptions();
      if (set2.frames[0].w !== 90) throw new Error('set 2 was overwritten by set 1: ' + set2.frames[0].w);
      // …while the WALL still follows, because every set is on the same physical wall.
      elevations[0].wallW = 240;
      _catSyncAllOptions();
      if (set2.wallW !== 240) throw new Error('the frame set did not take the wall width');
    });

    __check('the flag is GONE, not merely unused', () => {
      // A retired flag left readable is a second way to say what a frame set says, which
      // is the thing being removed. A test rather than a comment, because "unused" decays.
      const S2 = window.__appSrc;
      if (S2.indexOf('function _catLayoutIsFree') >= 0) throw new Error('_catLayoutIsFree survives');
      if (S2.indexOf('setCatLayoutFree') >= 0) throw new Error('setCatLayoutFree survives');
      if ((window.__htmlSrc || '').indexOf('catLayoutFree') >= 0) throw new Error('the Own frames checkbox survives in index.html');
    });

    __check('MATCHED BY LETTER, so a salon hang can sit under a smaller primary', () => {
      // The primary has A and B. A five-piece layout's C/D/E have no counterpart, so they
      // are simply its own - which is what lets single / triptych / salon share one spot.
      const alt = twoLayouts();
      alt.frames.push({ id: 'ART-1B-C', letter: 'C', w: 12, h: 12, x: 5, y: 5, active: true });
      elevations[0].frames[0].w = 48;
      _catSyncAllOptions();
      if (alt.frames[0].w !== 48) throw new Error('letter A did not follow');
      if (alt.frames[2].w !== 12) throw new Error('letter C, which the primary does not have, was overwritten');
    });

    __check('the WALL follows the primary; the DIMENSION LINES do not', () => {
      const alt = twoLayouts();
      elevations[0].wallW = 240;
      elevations[0].personPos = { x: -80 };
      elevations[0].groupDims = [{ a: 1 }];
      elevations[0].customLines = [{ b: 2 }];
      _catSyncAllOptions();
      // Four layouts offered for one spot are four drawings of the SAME wall.
      if (alt.wallW !== 240) throw new Error('the layout did not take the wall width');
      if (!alt.personPos || alt.personPos.x !== -80) throw new Error('the layout did not take the character');
      if (alt.personPos === elevations[0].personPos) throw new Error('personPos is SHARED between two walls');
      // But a group dim measures a gap BETWEEN FRAMES, and the frames are somewhere else
      // on every layout - so it would measure the wrong thing. It reaches an OPTION, which
      // is the same arrangement, and stops here.
      if ((alt.groupDims || []).length) throw new Error('a group dimension crossed to another LAYOUT');
      if ((alt.customLines || []).length) throw new Error('a custom line crossed to another LAYOUT');
    });

    __check('TWO buttons, one prompt, and each says what it will make', () => {
      if (fnBody('catArrangementAction').indexOf("_catLayoutChooser(currentElevIndex, 'layout')") < 0) throw new Error('+ LAYOUT does not open the prompt');
      if (fnBody('catFrameSetAction').indexOf("_catLayoutChooser(currentElevIndex, 'set')") < 0) throw new Error('+ SET does not open the prompt');
      const c = fnBody('_catLayoutChooser');
      // The two sentences a designer needs before the wall exists.
      if (c.indexOf('A DIFFERENT SET OF FRAMES') < 0) throw new Error('the prompt does not explain a frame set');
      if (c.indexOf('THE SAME FRAMES, REARRANGED') < 0) throw new Error('the prompt does not explain a layout');
      // The NAME is collected at creation, when it is known.
      if (c.indexOf('nameIn') < 0) throw new Error('the prompt does not collect a name');
      if (c.indexOf('newSet: isSet') < 0) throw new Error('the prompt does not pass the kind through');
    });

    __check('SET 1 IS SPELLED WITHOUT A NUMBER, so older projects parse unchanged', () => {
      // Every code that predates frame sets has no second number group, so it reads as
      // set 1 of its own placement and groups exactly as it did.
      [['ART-1', 'ART-1', 1, ''], ['ART.01A', 'ART.01', 1, 'A'],
       ['ART.01.2', 'ART.01', 2, ''], ['ART.01.2A', 'ART.01', 2, 'A'],
       ['L2.ART-2', 'L2.ART-2', 1, ''], ['L2.ART-2.3A', 'L2.ART-2', 3, 'A']].forEach(t => {
        if (_catPlacementKey(t[0]) !== t[1]) throw new Error(t[0] + ' place=' + _catPlacementKey(t[0]));
        if (_catSetNum(t[0]) !== t[2]) throw new Error(t[0] + ' set=' + _catSetNum(t[0]));
        if (_catArrLetter(t[0]) !== t[3]) throw new Error(t[0] + ' letter=' + _catArrLetter(t[0]));
      });
      // And the SET KEY round-trips: set 1 keeps the short spelling.
      if (_catSetKey('ART.01A') !== 'ART.01') throw new Error(_catSetKey('ART.01A'));
      if (_catSetKey('ART.01.2A') !== 'ART.01.2') throw new Error(_catSetKey('ART.01.2A'));
    });

    __check('ONE PIN PER PLACEMENT, however many frame sets are offered there', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      dashProjectData.filter(r => r.id === 'ART-1A')[0].planX = 0.4;
      dashProjectData.filter(r => r.id === 'ART-1A')[0].planY = 0.6;
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, { newSet: true, label: 'Single' }));
      quiet(() => _catAddArrangement(0, { label: 'Shuffled' }));
      _catSyncAllOptions();
      const keys = _fpGroups().map(g => g.key);
      if (keys.indexOf('ART-1') < 0) throw new Error('the placement lost its pin: ' + keys.join(','));
      // 17.97: frame set 2 is ART-1B and the layout ART-1C (letters across the placement).
      ['ART-1B', 'ART-1C'].forEach(k => {
        if (keys.indexOf(k) >= 0) throw new Error(k + ' put a SECOND pin on the plan');
      });
      // But each still answers for its own spec-page crop.
      const r2 = dashProjectData.filter(r => r.id === 'ART-1B-A')[0];
      if (!r2) throw new Error('no slot row for set 2');
      if (r2.planX !== 0.4) throw new Error('set 2 did not borrow the placement pin');
      // THE SET NUMBER DECIDES BEFORE THE LETTER. Rename set 1's primary to ART-1A and
      // an unlettered ART-1.2 sorts ahead of it on letter alone - so a tiebreak that
      // only compares letters hands the pin to frame set 2. The fixture above cannot
      // see that, because both primaries are unlettered there and array order saves it.
      const s1 = elevations.filter(e => _catBaseCode(e) === 'ART-1')[0];
      s1.frames.forEach(f => { const r = dashProjectData.filter(x => x.id === f.id)[0]; if (r) r.id = r.id.replace('ART-1', 'ART-1A'); f.id = f.id.replace('ART-1', 'ART-1A'); });
      if (_catBaseCode(s1) !== 'ART-1A') throw new Error('rename did not take: ' + _catBaseCode(s1));
      const alt2 = _catAltArrRowIds();
      if (alt2[s1.frames[0].id]) throw new Error('frame set 2 took the pin off set 1');
    });

    __check('the rail stripes have REAL CSS, and a layout is not the primary colour', () => {
      // Setting a class is not the same as having a style - the .action-btn.active trap.
      const css = window.__cssSrc || '';
      ['.wall-tab.cat-primary', '.wall-tab.cat-layout', '.wall-rail-place', '.wall-tab-lbl'].forEach(sel => {
        if (css.indexOf(sel) < 0) throw new Error('no CSS rule for ' + sel);
      });
      const at = css.indexOf('.wall-tab.cat-layout');
      const rule = css.slice(at, css.indexOf('}', at));
      if (rule.indexOf('color-mix') < 0) throw new Error('a layout stripe is not distinguishable from the primary: ' + rule);
      // A stripe and an indent, never a row background: .wall-tab.active owns that.
      const pa = css.indexOf('.wall-tab.cat-primary');
      if (css.slice(pa, css.indexOf('}', pa)).indexOf('background') >= 0) throw new Error('the primary row is tinted rather than striped');
    });

    // == THE LAYOUT NAME REACHES THE PAGE AND THE CSV =====================
    __check('the layout tag is ONE string: letter, then name when there is one', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, { label: 'Triptych' }));
      const alt = elevations.filter(e => _catBaseCode(e) === 'ART-1B')[0];
      if (_catLayoutTag(alt).indexOf('B') !== 0) throw new Error('tag: ' + _catLayoutTag(alt));
      if (_catLayoutTag(alt).indexOf('Triptych') < 0) throw new Error('the name is missing: ' + _catLayoutTag(alt));
      // An unnamed layout is its letter and nothing else - never a dangling separator,
      // which is the trap _artGroupKey was dug out of.
      delete alt.catalogueLabel;
      if (_catLayoutTag(alt) !== 'B') throw new Error('an unnamed layout: ' + _catLayoutTag(alt));
      // A wall outside a catalogue has no tag at all.
      const plain = { id: _elevNewId(), name: 'Lobby', frames: [] };
      if (_catLayoutTag(plain) !== '') throw new Error('an ordinary wall claimed a layout tag');
    });

    __check('a row resolves its layout THROUGH its mockup, never its own code', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, { label: 'Triptych' }));
      const alt = elevations.filter(e => _catBaseCode(e) === 'ART-1B')[0];
      currentElevIndex = elevations.indexOf(alt);
      quiet(() => duplicateCurrentElevation());          // an OPTION under layout B
      const opt = _catOptionsOf(alt)[0];
      if (!opt) throw new Error('no option under the layout');
      const optRowId = opt.frames[0].id;
      const t = _catLayoutTagForRow(optRowId);
      if (t.indexOf('Triptych') < 0) throw new Error('an option row did not inherit its layout name: ' + t);
      // The mockup's own slot answers for itself.
      if (_catLayoutTagForRow(alt.frames[0].id).indexOf('Triptych') < 0) throw new Error('the slot row lost its layout');
      // And anything outside a catalogue is blank rather than guessed at.
      if (_catLayoutTagForRow('NOPE-1A') !== '') throw new Error('an unknown row was given a layout');
    });

    __check('the CSV gains ONE trailing Arrangement column, blank outside a catalogue', () => {
      buildMaster();
      elevations[0].name = 'ART-1';
      currentElevIndex = 0;
      quiet(() => _catAddArrangement(0, { label: 'Triptych' }));
      // A MOCKUP SLOT IS NOT IN THE CSV AT ALL, so the row to look for is an option's.
      const _alt = elevations.filter(e => _catBaseCode(e) === 'ART-1B')[0];
      currentElevIndex = elevations.indexOf(_alt);
      quiet(() => duplicateCurrentElevation());
      const _optId = _catOptionsOf(_alt)[0].frames[0].id;
      const csv = buildDashCSVString();
      const NL = String.fromCharCode(10);   // a bare escape here collapses inside the outer template literal
      const lines = csv.split(NL).filter(Boolean);
      // The file opens with project metadata, so the header is the line carrying the
      // window-film columns rather than line zero.
      const head = lines.filter(l => l.indexOf('Print Panels (in)') >= 0)[0];
      if (!head) throw new Error('no header line');
      const cols = head.split(',');
      if (cols[cols.length - 1].trim() !== 'Arrangement') throw new Error('last header column: ' + cols[cols.length - 1]);
      // And the VALUE lands in that last cell. Counting cells would pass on a row whose
      // tag was blank, which is the failure that matters.
      const q = String.fromCharCode(34);
      const row = lines.filter(l => l.indexOf(q + _optId + q) >= 0)[0];
      if (!row) throw new Error('no CSV row for option piece ' + _optId);
      const cells = row.split(q + ',' + q);
      const last = cells[cells.length - 1].split(q)[0];
      if (last.indexOf('Triptych') < 0) throw new Error('the Arrangement cell reads: ' + last);
      // (Blank outside a catalogue is covered by the _catLayoutTagForRow check above.)
    });

    // CHANGED IN 17.99, deliberately: the subtitle used to read ELEVATION DETAIL · C — name
    // through _catLayoutTag. An alternate arrangement now reads ALTERNATE LAYOUT /
    // ALTERNATE FRAME SET · name, and the bare letter is dropped (the heading already says
    // ART.1C). The layout NAME must still print, through the one breaker-subtitle builder.
    __check('the breaker subtitle prints the layout name, through _catBreakerSub', () => {
      const b = fnBody('_drawInstallGuidePage');
      if (b.indexOf('doc.text(isElev ? _catBreakerSub(arg)') < 0) throw new Error('the subtitle does not go through _catBreakerSub');
      if (fnBody('_catBreakerSub').indexOf('_catLayoutLabel(elev)') < 0) throw new Error('the layout name no longer prints');
    });

    // == THE PANEL BUTTONS FIT THE PANEL ==================================
    __check('EXACT BUG: + LAYOUT and + SET ran off the left panel', () => {
      // '.action-btn' is 'width: 100%'. A flex item with 'flex: 0 0 auto' takes its BASIS
      // from 'width', and 'flex-shrink: 0' then forbids shrinking - so three of them in
      // one row each demanded the full panel and two ended up outside it. The rule is
      // general, so the check is too: no .action-btn in index.html may combine
      // 'flex:0 0 auto' with no width of its own.
      const html = window.__htmlSrc || '';
      if (!html) throw new Error('the harness did not hand over index.html');
      const bad = [];
      html.split('<button').forEach(chunk => {
        const tag = chunk.split('>')[0];
        if (tag.indexOf('action-btn') < 0) return;
        if (tag.indexOf('flex:0 0 auto') < 0 && tag.indexOf('flex: 0 0 auto') < 0) return;
        if (tag.indexOf('width:') >= 0) return;   // an explicit width overrides the 100%
        const id = (tag.split('id="')[1] || '').split('"')[0];
        bad.push(id || '(unnamed)');
      });
      if (bad.length) throw new Error('action-btn sized from a 100% basis and unable to shrink: ' + bad.join(', '));
    });

    // 17.89: the + LAYOUT / + SET row is gone with the mockup button. Its job is the
    // option chooser in Deck Studio, which reaches the SAME minters.
    __check('the Elevations + LAYOUT / + SET row is gone; the Deck Studio chooser reaches the same minters', () => {
      ['catArrBtn', 'catSetBtn', 'catAddRow'].forEach(id => { if (document.getElementById(id)) throw new Error(id + ' is still in Elevations'); });
      const src = window.__appSrc || '';
      const a = src.indexOf('function _catAddOptionOfKind');
      const body = src.slice(a, src.indexOf('function openCatOptionChooser', a));
      ['_catAddOption(mi', '_catAddArrangement(optIdx, o)', 'newSet: true'].forEach(k => {
        if (body.indexOf(k) < 0) throw new Error('the chooser no longer reaches ' + k);
      });
    });

  `;

  try {
    window.__appSrc = src;
    window.__cssSrc = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    window.__htmlSrc = htmlSrc;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
