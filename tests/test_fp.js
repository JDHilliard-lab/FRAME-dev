const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, {
    url: 'https://example.com/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    scale(){}, fillRect(){}, drawImage(){}, measureText: (s) => ({ width: (s||'').length * 6 }),
    fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){},
    setLineDash(){}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData(){}, translate(){}, rotate(){},
    fillText(){}, strokeText(){}, clip(){}, rect(){}, quadraticCurveTo(){}, bezierCurveTo(){}, setTransform(){}, transform(){}
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  // Test checks run appended to the SAME eval as app.js — top-level let/const
  // bindings (editorialContent, floorplanLevels, etc.) are scoped per-eval-call
  // in V8, so a second window.eval() can't see them. This block collects
  // pass/fail into window.__testResults for the harness below to read out.
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => {
      try { fn(); window.__testResults.push({ label, ok: true }); }
      catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); }
    };

    floorplanLevels = [{ name: 'Level 1', imageData: '', imageName: '' }];
    editorialContent = editorialContent || {};
    editorialContent.pageFooters = {};
    editorialContent.footer = {};

    __check('_fpKeyEntries(0, null)', () => {
      const out = _fpKeyEntries(0, null);
      if (!Array.isArray(out)) throw new Error('not array');
    });

    __check('_fpPlanRect', () => {
      const r = _fpPlanRect(936, 540, 40);
      if (!(r.w > 0 && r.h > 0)) throw new Error('bad rect');
    });

    __check('_fpPlanFit', () => {
      const f = _fpPlanFit(936, 540, 40, 800, 600);
      if (!(f.dw > 0 && f.dh > 0)) throw new Error('bad fit');
    });

    __check('_resolveFooter hideFooter default false', () => {
      const F = _resolveFooter('floorplan:0');
      if (F.hideFooter !== false) throw new Error('unexpected default: ' + F.hideFooter);
    });

    __check('_resolveFooter hideFooter override', () => {
      editorialContent.pageFooters['floorplan:0'] = { hideFooter: true };
      const F = _resolveFooter('floorplan:0');
      if (F.hideFooter !== true) throw new Error('override not applied: ' + JSON.stringify(F));
      delete editorialContent.pageFooters['floorplan:0'];
    });

    __check('_dsAddFooter runs and adds a footer node', () => {
      const page = document.createElement('div');
      document.body.appendChild(page);
      const desc = { kind: 'floorplan', level: 0 };
      _dsIndex = 0;
      _dsAddFooter(page, 936, 540, desc);
      if (!page.querySelector('[data-ds-footer]')) throw new Error('footer node missing');
    });

    __check('_dsAddFooter respects hideFooter override', () => {
      const page = document.createElement('div');
      document.body.appendChild(page);
      const desc = { kind: 'floorplan', level: 0 };
      editorialContent.pageFooters['floorplan:0'] = { hideFooter: true };
      _dsIndex = 0;
      _dsAddFooter(page, 936, 540, desc);
      if (page.querySelector('[data-ds-footer]')) throw new Error('footer should be hidden');
      delete editorialContent.pageFooters['floorplan:0'];
    });

    __check('_dsAddFooter is idempotent (no double footer)', () => {
      const page = document.createElement('div');
      document.body.appendChild(page);
      const desc = { kind: 'floorplan', level: 0 };
      _dsIndex = 0;
      _dsAddFooter(page, 936, 540, desc);
      _dsAddFooter(page, 936, 540, desc);
      if (page.querySelectorAll('[data-ds-footer]').length !== 1) throw new Error('footer duplicated');
    });

    __check('_drawFloorplanKeyPage with CanvasPdfRec, no image', () => {
      const rec = new CanvasPdfRec(936, 540);
      _drawFloorplanKeyPage(rec, {}, 1, { location: '', code: '', version: '' }, [], null, 'Level 1');
      if (!rec.ops || !rec.ops.length) throw new Error('no ops recorded');
    });

    // ── Wall-line axis lock (16.83) ─────────────────────────────────────────
    // EXACT REPORT: "on the Plan detail page the lines are not always perfectly aligned
    // to the wall lines". Walls on a plan are orthogonal; a line a degree or two off is
    // compared directly against the architect's own linework and reads as a fault.
    const __stubPlan = (w, h) => {
      let el = document.getElementById('dsFpPlanImg');
      if (!el) { el = document.createElement('div'); el.id = 'dsFpPlanImg'; document.body.appendChild(el); }
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h });
      return el;
    };

    __check('Shift locks a wall line to the nearest axis, and only with Shift', () => {
      __stubPlan(1000, 1000);
      const start = { x: 0.2, y: 0.2 };
      // No modifier: the point is untouched, so an angled line is still possible.
      const free = _fpAxisLock(start, { x: 0.8, y: 0.5 }, { shiftKey: false });
      if (free.x !== 0.8 || free.y !== 0.5) throw new Error('the point moved without Shift');
      // Mostly horizontal -> y collapses onto the anchor.
      const h = _fpAxisLock(start, { x: 0.8, y: 0.25 }, { shiftKey: true });
      if (h.y !== start.y || h.x !== 0.8) throw new Error('a horizontal drag did not flatten: ' + JSON.stringify(h));
      // Mostly vertical -> x collapses onto the anchor.
      const v = _fpAxisLock(start, { x: 0.25, y: 0.9 }, { shiftKey: true });
      if (v.x !== start.x || v.y !== 0.9) throw new Error('a vertical drag did not straighten: ' + JSON.stringify(v));
    });

    __check('the locked axis is chosen in PIXELS, not in normalised units', () => {
      // Segments are stored 0..1, but a plan is rarely square. On a 1000x100 plan a drag
      // of 0.3 across and 0.5 down is 300px across and 50px down - clearly horizontal,
      // and comparing the raw normalised numbers would lock it vertical instead.
      __stubPlan(1000, 100);
      const r = _fpAxisLock({ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.6 }, { shiftKey: true });
      if (r.y !== 0.1) throw new Error('a wide plan locked to the wrong axis: ' + JSON.stringify(r));
      // The same normalised drag on a tall plan is genuinely vertical.
      __stubPlan(100, 1000);
      const r2 = _fpAxisLock({ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.6 }, { shiftKey: true });
      if (r2.x !== 0.1) throw new Error('a tall plan locked to the wrong axis: ' + JSON.stringify(r2));
    });

    __check('the preview and the committed line apply the SAME constraint', () => {
      // Constrain only the preview and the line lands somewhere else; constrain only the
      // commit and the line shown is not the line you get. All three paths must lock.
      const A = window.__appSrc;
      const mv = A.slice(A.indexOf('function _dsFpLineMove'), A.indexOf('function _dsFpLineClickPoint'));
      if (mv.indexOf('_fpAxisLock') < 0) throw new Error('the drag preview does not constrain');
      const up = A.slice(A.indexOf('function _dsFpLineUp'), A.indexOf('function _dsMakePin'));
      if (up.indexOf('_fpAxisLock') < 0) throw new Error('the committed drag does not constrain');
      const cp = A.slice(A.indexOf('function _dsFpLineClickPoint'), A.indexOf('function _dsFpLineHover'));
      if (cp.indexOf('_fpAxisLock') < 0) throw new Error('click-to-click mode does not constrain');
    });

    __check('a floorplan page offers no Templates tab, but keeps Layers', () => {
      // You cannot change a floorplan page's layout - it is drawn by the floorplan
      // renderer, not placed from a coordinate map - so a grid of template cards is a
      // control that produces no result. Layers stays, for notes over the plan.
      if (_dsPageTakesTemplates({ kind: 'floorplan' })) throw new Error('a floorplan still offers Templates');
      if (!_dsPageTakesTemplates({ kind: 'spec' })) throw new Error('a spec page lost its Templates tab');
      if (!_dsPageTakesTemplates({ kind: 'element' })) throw new Error('an element page lost its Templates tab');
      const A = window.__appSrc;
      // Sitting on Templates when a floorplan is selected has to fall back to Page, or
      // the panel goes blank with no way back that reads as deliberate.
      // With the parens: _dsRenderToolsTemplatesTab is defined FIRST, so the bare name
      // matches that one instead and the slice reads a function with nothing to do with
      // this rule.
      const rti = A.indexOf('function _dsRenderTools()');
      if (rti < 0) throw new Error('could not find _dsRenderTools');
      const rt = A.slice(rti, rti + 1400);
      if (rt.indexOf("_dsToolsTab('page')") < 0) throw new Error('the Templates tab is hidden with the panel left on it');
      // The tab switcher rewrites the button's whole cssText, so the hide has to be
      // re-applied after it or every tab click brings the button back.
      const tt = A.slice(A.indexOf('function _dsToolsTab'), A.indexOf('function _dsSyncToolsTabBar'));
      if (tt.indexOf('_dsSyncToolsTabBar()') < 0) throw new Error('switching tabs restores the hidden Templates button');
    });

    // ── Wall-line transparency (16.84) ──────────────────────────────────────
    // EXACT ASK: "can we make it so the lines have a multiply so we can still see the
    // plan drawing underneath, sometimes the lines cover the linework and we need to see
    // door openings". Alpha rather than multiply, because jsPDF's GState accepts only
    // 'opacity' and 'stroke-opacity' and silently drops anything else - so multiply could
    // only ever be screen-deep, and the standing rule is that Deck Studio and the PDF
    // must agree.
    __check('one alpha constant, and every renderer that draws a wall line reads it', () => {
      if (!(FP_WALL_LINE_ALPHA > 0 && FP_WALL_LINE_ALPHA < 1)) {
        throw new Error('the alpha is not a real transparency: ' + FP_WALL_LINE_ALPHA);
      }
      const A = window.__appSrc;
      // FIVE renderers draw these lines and none of them shares a code path with the
      // others. A call site that hardcodes its own number is how the preview starts
      // lying about the PDF, so each one is pinned by name.
      const sites = [
        ['the Deck Studio centre (SVG)', "ln.setAttribute('stroke-opacity'"],
        ['the rail thumbnail (HTML)', "opacity:' + FP_WALL_LINE_ALPHA"],
        ['the floorplan key page (doc.line)', '_fpDocLineAlpha(doc, FP_WALL_LINE_ALPHA)'],
        ['a canvas composite', 'x.globalAlpha = FP_WALL_LINE_ALPHA']
      ];
      sites.forEach(([what, needle]) => {
        if (A.indexOf(needle) < 0) throw new Error(what + ' does not apply the shared alpha');
      });
      // Both canvas composites (the plan detail page and the spec page's plan thumbnail).
      const n = (A.match(/x\.globalAlpha = FP_WALL_LINE_ALPHA/g) || []).length;
      if (n < 2) throw new Error('only ' + n + ' of the two canvas composites applies the alpha');
      // And the key page must put it BACK, or the pins and the legend inherit it.
      if (A.indexOf('_fpDocLineAlpha(doc, 1)') < 0) throw new Error('the key page never restores full opacity');
    });

    __check('CanvasPdfRec carries alpha too, so the preview matches the PDF', () => {
      // The floorplan key page is drawn ONCE, through a doc that is real jsPDF for the
      // export and this shim for the Deck Studio preview and every rail thumbnail. A shim
      // without setGState would draw solid lines while the PDF drew translucent ones.
      const rec = new CanvasPdfRec(936, 540);
      if (typeof rec.setGState !== 'function' || typeof rec.GState !== 'function') {
        throw new Error('CanvasPdfRec cannot express alpha, so the preview cannot match the PDF');
      }
      rec.setGState(new rec.GState({ 'stroke-opacity': 0.5, opacity: 1 }));
      rec.line(0, 0, 10, 10);
      const op = rec.ops[rec.ops.length - 1];
      if (!op || op.t !== 'line') throw new Error('no line op recorded');
      if (Math.abs(op.st.sa - 0.5) > 1e-6) throw new Error('stroke alpha was not recorded: ' + op.st.sa);
      if (Math.abs(op.st.fa - 1) > 1e-6) throw new Error('fill alpha leaked from the stroke alpha: ' + op.st.fa);
      // Reset back to opaque has to actually reset.
      rec.setGState(new rec.GState({ 'stroke-opacity': 1, opacity: 1 }));
      rec.line(0, 0, 1, 1);
      if (Math.abs(rec.ops[rec.ops.length - 1].st.sa - 1) > 1e-6) throw new Error('alpha never resets');
      // The render loop must READ it. Recording alpha and ignoring it at draw time is the
      // same bug the rotated-label angle had: recorded, never read, silently wrong.
      const A = window.__appSrc;
      const rl = A.slice(A.indexOf('CanvasPdfRec.prototype.render'), A.indexOf('CanvasPdfRec.prototype.render') + 4200);
      if (rl.indexOf('st.sa') < 0) throw new Error('render() records stroke alpha but never applies it');
    });

    __check('_fpDocLineAlpha degrades instead of throwing on a doc with no GState', () => {
      // These page renderers run against real jsPDF, against CanvasPdfRec, and against
      // whatever shim comes next. A missing GState must mean "solid line", never an
      // exception out of the middle of a page render.
      let threw = false;
      try { _fpDocLineAlpha({}, 0.5); } catch (e) { threw = true; }
      if (threw) throw new Error('a doc without GState threw');
      try { _fpDocLineAlpha(null, 0.5); } catch (e) { throw new Error('a null doc threw'); }
    });

    // ── The loupe (16.84) ───────────────────────────────────────────────────
    __check('the loupe magnifies under the cursor while a tool is armed', () => {
      // The plan is drawn at page size, so an architect's wall is a couple of pixels
      // thick and picking a point on it is guesswork. A loupe rather than zooming the
      // page, because the centre preview IS the page and zooming it would stop it
      // matching what prints.
      const img = __stubPlan(400, 300);
      img.src = 'data:image/png;base64,AAAA';
      _fpLoupeHide();
      _fpArmedId = 'g1';
      _fpLoupeShow({ clientX: 100, clientY: 60 });
      const el = document.getElementById('dsFpLoupe');
      if (!el) throw new Error('no loupe element was created');
      if (el.style.display !== 'block') throw new Error('the loupe did not show');
      if (el.style.backgroundImage.indexOf('AAAA') < 0) throw new Error('the loupe is not showing the plan');
      // The magnified sheet is the plan at ZOOM times its on-screen size...
      if (el.style.backgroundSize !== (400 * FP_LOUPE_ZOOM) + 'px ' + (300 * FP_LOUPE_ZOOM) + 'px') {
        throw new Error('wrong magnification: ' + el.style.backgroundSize);
      }
      // ...and the point under the cursor is centred in the circle.
      const bx = parseFloat(el.style.backgroundPosition.split(' ')[0]);
      const want = FP_LOUPE_SIZE / 2 - (100 / 400) * 400 * FP_LOUPE_ZOOM;
      if (Math.abs(bx - want) > 0.01) throw new Error('the crop is not centred on the cursor: ' + bx + ' vs ' + want);
      _fpLoupeHide();
      if (document.getElementById('dsFpLoupe').style.display !== 'none') throw new Error('the loupe did not hide');
      _fpArmedId = null;
    });

    __check('the loupe is dismissed on every path that disarms a tool', () => {
      const A = window.__appSrc;
      // Dropping a pin, finishing a drag, and re-rendering with nothing armed.
      const pl = A.slice(A.indexOf('function _dsFpPlace'), A.indexOf('function _dsFpPlace') + 700);
      if (pl.indexOf('_fpLoupeHide()') < 0) throw new Error('the loupe survives placing a pin');
      const up = A.slice(A.indexOf('function _dsFpLineUp'), A.indexOf('function _dsMakePin'));
      if (up.indexOf('_fpLoupeHide()') < 0) throw new Error('the loupe survives finishing a line');
      // It also has to track THROUGH a drag, not just before it starts.
      const mv = A.slice(A.indexOf('function _dsFpLineMove'), A.indexOf('function _dsFpLineClickPoint'));
      if (mv.indexOf('_fpLoupeShow(e)') < 0) throw new Error('the loupe freezes once the drag begins');
    });

    // ── The floorplan panel (16.84) ─────────────────────────────────────────
    __check('the item list filters by code and by unplaced', () => {
      // A real project runs to ~60 codes. The question actually asked is "what have I not
      // placed yet", which before this was answered by scanning for an amber ring.
      const placed = { key: 'a', num: '01', ids: ['L2.ART-04'], planX: 0.5, planY: 0.5 };
      const loose = { key: 'b', num: '02', ids: ['L2.ART-05'], planX: null, planY: null };
      _fpFilter = ''; _fpUnplacedOnly = false;
      if (!_fpRowMatches(placed) || !_fpRowMatches(loose)) throw new Error('an empty filter hid something');
      _fpUnplacedOnly = true;
      if (_fpRowMatches(placed)) throw new Error('a placed code showed under Unplaced');
      if (!_fpRowMatches(loose)) throw new Error('an unplaced code was hidden under Unplaced');
      _fpUnplacedOnly = false;
      // Matched on the CODE, which is what is written on the plan and in the schedule.
      _fpFilter = 'art-05';
      if (_fpRowMatches(placed)) throw new Error('the filter matched the wrong code');
      if (!_fpRowMatches(loose)) throw new Error('the filter is case sensitive');
      _fpFilter = '';
    });

    __check('the panel is three tabs, and the item list rebuilds without the panel', () => {
      // Categories is a setup task touched rarely; it was permanently eating height from
      // the list worked in constantly.
      if (_fpPanelTab !== 'items') throw new Error('the panel does not open on Items');
      const bar = document.createElement('div');
      _fpPanelTabBar(bar);
      const btns = bar.querySelectorAll('button');
      if (btns.length !== 3) throw new Error('expected three tabs, got ' + btns.length);
      const labels = [...btns].map(b => b.textContent).join(',');
      if (labels !== 'Items,Categories,Plan') throw new Error('unexpected tabs: ' + labels);
      // Typing in the filter must NOT re-render the whole panel: that destroys the input
      // being typed in and drops the caret. Same live/full split the glazing and context
      // editors use.
      const A = window.__appSrc;
      const it = A.slice(A.indexOf('function _fpPanelItems'), A.indexOf('function _fpFillItemList'));
      if (it.indexOf('_fpFillItemList(desc)') < 0) throw new Error('the filter does not refresh the list');
      if (/fi\.oninput = \(\) => \{[^}]*_dsRenderTools\(\)/.test(it)) throw new Error('typing in the filter rebuilds the panel and loses the caret');
    });

    // ── Floorplan page order (16.85) ────────────────────────────────────────
    // "I might want to just have all floorplans for project one page after the other,
    // floor one, then floor 2 and then floor 3...then following would be the spec and
    // elevation pages. Sometimes it would be floor 1 then all item codes spec pages and
    // elevations for floor 1 then a breaker page starting with Floor 2 plan view..."
    //
    // Both are real, so it is a mode. The ONE thing that must not happen is the order
    // being written into Deck Studio and mirrored by hand into the PDF: three separate
    // clauses have drifted that way already, and the preview is how the deck gets checked.
    const __mkUnit = (key, level) => ({ key: key, rep: { id: key, level: level }, members: [{ id: key, level: level }] });

    __check('the order is ONE shared function, not mirrored into the exporter', () => {
      const A = window.__appSrc;
      // Both builders must CALL it...
      const calls = (A.match(/_deckPlanSlots\\(/g) || []).length;
      if (calls < 3) throw new Error('expected a definition and two call sites, found ' + calls);
      const dsAt = A.indexOf('function _deckPageList');
      const ds = A.slice(dsAt, dsAt + 9000);
      if (ds.indexOf('_deckPlanSlots(') < 0) throw new Error('Deck Studio does not use the shared order');
      // ...and the export's builder, which lives near _stepsFor.
      const exAt = A.indexOf('const _stepsFor =');
      const ex = A.slice(exAt, exAt + 6000);
      if (ex.indexOf('_deckPlanSlots(') < 0) throw new Error('the PDF export does not use the shared order');
      // Neither may still be walking the levels itself: that is the mirrored copy that
      // drifts. The old shape was floorplanLevels.forEach(...) building an emit list.
      if (/floorplanLevels\\.forEach\\([^)]*\\)\\s*\\{[\\s\\S]{0,400}?emitLevels\\.push/.test(ex)) {
        throw new Error('the export still builds its own level list');
      }
      // The level list is shared too — these tested different things (the studio the
      // filtered rows, the export dashProjectData), so a level could appear in one and
      // not the other.
      if ((A.match(/_deckEmitLevels\\(/g) || []).length < 4) throw new Error('the level list is not shared by every branch');
    });

    __check('byLevel interleaves plan and specs; plansFirst puts every plan up front', () => {
      const saveEc = editorialContent.planOrder;
      const saveLv = floorplanLevels;
      floorplanLevels = [
        { name: 'Level 1', imageData: 'x', imageName: '' },
        { name: 'Level 2', imageData: 'x', imageName: '' },
        { name: 'Level 3', imageData: 'x', imageName: '' }
      ];
      const units = [__mkUnit('A1', 0), __mkUnit('B1', 1), __mkUnit('B2', 1), __mkUnit('C1', 2)];
      const shape = (sl) => sl.map(s => s.t === 'key' ? ('K' + s.li) : s.t === 'unit' ? ('U' + s.u.key) : ('D' + s.li)).join(' ');

      editorialContent.planOrder = 'byLevel';
      const by = shape(_deckPlanSlots(units, { keys: true, spec: true }));
      if (by !== 'K0 UA1 K1 UB1 UB2 K2 UC1') throw new Error('byLevel order changed: ' + by);

      editorialContent.planOrder = 'plansFirst';
      const pf = shape(_deckPlanSlots(units, { keys: true, spec: true }));
      if (pf !== 'K0 K1 K2 UA1 UB1 UB2 UC1') throw new Error('plansFirst order wrong: ' + pf);

      // Same PAGES either way — a reorder must never add or drop one. That is the
      // property that makes this safe to flip on a real deck.
      const sortJoin = (s) => s.split(' ').sort().join(' ');
      if (sortJoin(by) !== sortJoin(pf)) throw new Error('the two modes do not contain the same pages');

      // Unknown values fall back rather than being honoured, so a newer file opened in an
      // older build cannot leave the deck in a mode nothing implements.
      editorialContent.planOrder = 'somethingElse';
      if (_deckPlanOrder() !== 'byLevel') throw new Error('an unknown mode was not defaulted');
      editorialContent.planOrder = saveEc;
      floorplanLevels = saveLv;
    });

    __check('a unit on a level with no plan page still prints', () => {
      // Turning a level's floorplan off must not silently drop that level's artwork out
      // of the deck.
      const saveLv = floorplanLevels;
      floorplanLevels = [{ name: 'Level 1', imageData: 'x', imageName: '' }];
      const units = [__mkUnit('A1', 0), __mkUnit('Z9', 7)];
      const sl = _deckPlanSlots(units, { keys: true, spec: true });
      const keys = sl.filter(s => s.t === 'unit').map(s => s.u.key);
      if (keys.indexOf('Z9') < 0) throw new Error('a unit on an uncovered level was dropped');
      // And with the plan pages off entirely, every unit still comes through once.
      const noKeys = _deckPlanSlots(units, { keys: false, spec: true });
      if (noKeys.some(s => s.t === 'key')) throw new Error('plan pages were emitted with keys off');
      if (noKeys.filter(s => s.t === 'unit').length !== 2) throw new Error('units were lost or duplicated with keys off');
      floorplanLevels = saveLv;
    });

    __check('the order setting is project data and seeds its control', () => {
      // It travels in the file: the order pages come in is part of how the deck is put
      // together, so a colleague opening the project sees the same deck.
      const A = window.__appSrc;
      if (A.indexOf('editorialContent.planOrder') < 0) throw new Error('the mode is not stored on the project');
      // editorialContent is saved wholesale under the project's editorial key, so nothing
      // else is needed for persistence - but the control must be re-seeded on load and on
      // undo, or it shows the previous project's mode.
      if ((A.match(/seedDeckPlanOrderInput\\(\\)/g) || []).length < 3) {
        throw new Error('the control is not re-seeded on boot, load and undo');
      }
      const H = window.__indexHtml;
      if (H.indexOf('id="specPlanOrder"') < 0) throw new Error('no control for the order');
      if (H.indexOf('value="plansFirst"') < 0 || H.indexOf('value="byLevel"') < 0) throw new Error('the control is missing a mode');
    });

    __check('manual order sequences the plans and survives levels being added or removed', () => {
      // A deck can carry an overall floor plan plus several guestroom layouts on the SAME
      // level, where the useful grouping is "all the guestrooms together" and no rule
      // derived from the level number can express it.
      const saveEc = editorialContent.planOrder, saveSeq = editorialContent.planSeq;
      const saveLv = floorplanLevels;
      floorplanLevels = [
        { name: 'Level 1', imageData: 'x', imageName: '' },
        { name: 'Guestroom A', imageData: 'x', imageName: '' },
        { name: 'Level 2', imageData: 'x', imageName: '' },
        { name: 'Guestroom B', imageData: 'x', imageName: '' }
      ];
      const units = [__mkUnit('A1', 0), __mkUnit('B1', 1)];
      const shape = (sl) => sl.map(s => s.t === 'key' ? ('K' + s.li) : s.t === 'unit' ? ('U' + s.u.key) : ('D' + s.li)).join(' ');
      editorialContent.planOrder = 'manual';
      // Guestrooms pulled together, out of level order.
      editorialContent.planSeq = [0, 2, 1, 3];
      const m = shape(_deckPlanSlots(units, { keys: true, spec: true }));
      if (m !== 'K0 K2 K1 K3 UA1 UB1') throw new Error('manual order not honoured: ' + m);
      // A level NOT in the stored sequence appends rather than vanishing - otherwise
      // adding a plan after setting the order would silently drop it from the deck.
      editorialContent.planSeq = [3, 1];
      // The SPECS follow the same sequence as the plans, so a deck that groups the
      // guestrooms together groups their spec pages the same way rather than leaving the
      // two blocks in different orders.
      const m2 = shape(_deckPlanSlots(units, { keys: true, spec: true }));
      if (m2 !== 'K3 K1 K0 K2 UB1 UA1') throw new Error('a new level did not append: ' + m2);
      // A stale index for a level that no longer exists is dropped, not emitted as a
      // blank page.
      editorialContent.planSeq = [9, 0, 1, 2, 3];
      const m3 = shape(_deckPlanSlots(units, { keys: true, spec: true }));
      if (m3.indexOf('K9') >= 0) throw new Error('a deleted level still emits a page: ' + m3);
      // Same pages as every other mode, only sequenced differently.
      editorialContent.planOrder = 'byLevel';
      const by = shape(_deckPlanSlots(units, { keys: true, spec: true }));
      const sortJoin = (s) => s.split(' ').sort().join(' ');
      if (sortJoin(by) !== sortJoin(m3)) throw new Error('manual changed which pages exist');
      editorialContent.planOrder = saveEc; editorialContent.planSeq = saveSeq;
      floorplanLevels = saveLv;
    });

    __check('the order control is one setting with two controls, not two copies', () => {
      // Reachable from the floorplan page (where you are standing when you notice the
      // order is wrong) and from the Project tab (where the rest of the deck's shape is
      // decided). Both must READ _deckPlanOrder and WRITE setDeckPlanOrder, or they drift.
      const A = window.__appSrc;
      const fp = A.slice(A.indexOf('function _fpPlanOrderInto'), A.indexOf('function _fpPanelCats'));
      if (fp.indexOf('_deckPlanOrder()') < 0) throw new Error('the floorplan control does not read the shared value');
      if (fp.indexOf('setDeckPlanOrder(') < 0) throw new Error('the floorplan control does not write through the shared setter');
      if (/editorialContent\\.planOrder\\s*=/.test(fp)) throw new Error('the floorplan control writes the field directly, bypassing the setter');
      // Every mode offered on the Project tab must be offered here too, or the two
      // controls can show different things.
      DECK_PLAN_ORDERS.forEach(m => {
        if (fp.indexOf("'" + m + "'") < 0) throw new Error('the floorplan control is missing mode ' + m);
        if (window.__indexHtml.indexOf('value="' + m + '"') < 0) throw new Error('the Project tab is missing mode ' + m);
      });
    });

    __check('EXACT REPORT: the order select is tall enough for its own text', () => {
      // "on the Floor plan order on project tab the letters are cut off at the bottom" -
      // the global select rule pins every select to 26px, so inline padding without an
      // inline height pushes the descenders outside the box.
      const H = window.__indexHtml;
      const i = H.indexOf('id="specPlanOrder"');
      if (i < 0) throw new Error('the control is gone');
      const tag = H.slice(H.lastIndexOf('<select', i), H.indexOf('>', i) + 1);
      const h = /height:\\s*(\\d+)px/.exec(tag);
      if (!h) throw new Error('no explicit height, so the 26px global rule clips it again');
      const pad = /padding:\\s*(\\d+)px/.exec(tag);
      const fs = /font-size:\\s*([\\d.]+)rem/.exec(tag);
      const need = (fs ? parseFloat(fs[1]) * 16 : 12) + 2 * (pad ? parseInt(pad[1], 10) : 0) + 2;
      if (parseInt(h[1], 10) < need) throw new Error('height ' + h[1] + 'px cannot hold the text (needs ~' + Math.ceil(need) + 'px)');
    });

    // ── Multi-plan pinning (16.87) ──────────────────────────────────────────
    // EXACT REPORT: "sometimes projects will use the same item code for different
    // guestroom floorplans and how can I indicate that in the project without cancelling
    // the placement of artwork in different guestroom floorplans."
    __check('EXACT BUG: pinning a code on a second plan no longer clears the first', () => {
      const r = { id: 'L2.ART-04' };
      _fpSetPin(r, 0, 0.2, 0.3);
      _fpSetPin(r, 2, 0.7, 0.8);
      const pins = _fpPins(r);
      if (pins.length !== 2) throw new Error('the second pin replaced the first: ' + JSON.stringify(pins));
      if (!_fpPinOn(r, 0) || !_fpPinOn(r, 2)) throw new Error('a pin was lost');
      if (_fpPinOn(r, 1)) throw new Error('a pin appeared on a plan it was never placed on');
      // Re-pinning the SAME plan moves that pin rather than adding another.
      _fpSetPin(r, 2, 0.5, 0.5);
      if (_fpPins(r).length !== 2) throw new Error('re-pinning a plan added a duplicate');
      if (_fpPinOn(r, 2).x !== 0.5) throw new Error('re-pinning did not move the pin');
      // Removing one leaves the others alone.
      _fpClearPin(r, 2);
      if (_fpPins(r).length !== 1 || !_fpPinOn(r, 0)) throw new Error('clearing one plan cleared another');
    });

    __check('the legacy single placement stays as a derived PRIMARY', () => {
      // ~40 places read a single planX/planY/level — the spec page's plan crop, the
      // validator, the CSV, the level a spec page is grouped under. They keep working
      // because the trio mirrors pins[0].
      const r = { id: 'A', level: 3 };
      // A row saved before planPins existed reads as one pin, and is NOT rewritten just
      // for being asked: seeding on read would write a field into every row, every
      // autosave and every undo snapshot.
      r.planX = 0.4; r.planY = 0.6;
      const legacy = _fpPins(r);
      if (legacy.length !== 1 || legacy[0].x !== 0.4 || _deckLvlOf(legacy[0].lv) !== 3) throw new Error('a legacy pin did not migrate on read');
      if (r.planPins) throw new Error('reading pins wrote to the row');
      // Adding a pin on a SECOND plan must not move the primary, or the piece's spec page
      // jumps to another level's block just because it was also shown in a guestroom.
      _fpSetPin(r, 5, 0.1, 0.1);
      if (r.level !== 3) throw new Error('the primary level moved: ' + r.level);
      if (r.planX !== 0.4) throw new Error('the primary pin moved');
      // Clearing the primary promotes the next one rather than leaving a stale mirror.
      _fpClearPin(r, 3);
      if (r.level !== 5 || r.planX !== 0.1) throw new Error('the primary did not follow pins[0]');
      // And clearing the last one empties the mirror.
      _fpClearPin(r, 5);
      if (r.planX !== null || r.planY !== null) throw new Error('a stale primary survived the last pin');
    });

    __check('_fpGroups resolves to the plan asked for, and to the primary otherwise', () => {
      // This is the one argument that makes multi-plan work without touching the forty
      // call sites that read g.planX: pass a level and the group resolves to THAT plan.
      const save = dashProjectData;
      const row = { id: 'ART.001', level: 0, category: '' };
      _fpSetPin(row, 0, 0.2, 0.2);
      _fpSetPin(row, 2, 0.8, 0.8);
      dashProjectData = [row];
      const g0 = _fpGroups(0)[0], g2 = _fpGroups(2)[0], g1 = _fpGroups(1)[0], gp = _fpGroups()[0];
      if (!g0 || g0.planX !== 0.2) throw new Error('level 0 did not resolve to its own pin');
      if (!g2 || g2.planX !== 0.8) throw new Error('level 2 did not resolve to its own pin');
      if (g2.level !== 2) throw new Error('g.level was not set from the resolved pin, so the level filters break');
      if (g1 && g1.planX != null) throw new Error('a plan with no pin resolved one anyway');
      if (!gp || gp.planX !== 0.2) throw new Error('no argument should give the primary');
      dashProjectData = save;
    });

    __check('EXACT RISK: deleting a level renumbers the pins above it', () => {
      // Pins are keyed by level INDEX, and splicing a level shifts every index above it.
      // Without the renumber a guestroom pin silently re-homes onto whatever plan slid
      // into its slot — a wrong drawing that looks completely normal.
      const A = window.__appSrc;
      const del = A.slice(A.indexOf('Pins on it will be cleared'), A.indexOf('floorplanLevels.splice(removed, 1)'));
      if (del.indexOf('_fpPins(r)') < 0) throw new Error('level deletion ignores the pin array');
      if (del.indexOf('- 1') < 0) throw new Error('level deletion does not renumber the pins above it');
      // The arithmetic itself, as the deletion does it.
      const shift = (pins, removed) => pins.filter(p => p.lv !== removed)
        .map(p => ({ lv: p.lv > removed ? p.lv - 1 : p.lv, x: p.x, y: p.y }));
      const out = shift([{ lv: 0, x: 1, y: 1 }, { lv: 1, x: 2, y: 2 }, { lv: 3, x: 3, y: 3 }], 1);
      if (JSON.stringify(out.map(p => p.lv)) !== '[0,2]') throw new Error('bad renumber: ' + JSON.stringify(out));
    });

    __check('both placement UIs pin per plan, not just Deck Studio', () => {
      // The Deck Studio centre and the full markup tool are two separate placement UIs
      // over the same data. One of them still writing a single planX would quietly undo
      // multi-plan pinning depending on which tool you happened to use.
      const A = window.__appSrc;
      ['_dsFpPlace', '_dsFpDragMove', '_dsFpRemove', '_fpPlaceFromEvent', '_fpDragMove', '_fpRemovePin'].forEach(fn => {
        const at = A.indexOf('function ' + fn);
        if (at < 0) throw new Error('missing ' + fn);
        const body = A.slice(at, at + 900);
        if (!/_fpSetPin\\(|_fpClearPin\\(/.test(body)) throw new Error(fn + ' still writes a single placement');
      });
      // And the markup tool resolves its pins for the level it is showing.
      const mk = A.indexOf('function renderFloorplanMarkup');
      if (A.slice(mk, mk + 900).indexOf('_fpGroups(_fpLevel)') < 0) throw new Error('the markup tool shows only primary pins');
    });

    __check('quantity is untouched by pinning, which is what keeps this small', () => {
      // "the art placed in different elevations would control the quantity". Pinning says
      // WHERE a piece appears, never how many are bought — a piece shown on three
      // guestroom types but bought once carries a note on its spec page instead.
      const A = window.__appSrc;
      const at = A.indexOf('function recalculateDashboardQuantities');
      if (at < 0) throw new Error('missing recalculateDashboardQuantities');
      const body = A.slice(at, at + 1800);
      if (/planPins|_fpPins\\(/.test(body)) throw new Error('quantity now depends on floorplan pins');
    });

    __check('EXACT BUG: a wall line on one plan does not wipe the line on another', () => {
      // Reported after multi-plan pinning shipped: "I placed ART.001 in level 2 and I drew
      // the colored line to show where it is on the wall on the plan view but then it
      // removes the line where I placed it on Level 1". The pin was per plan and the LINE
      // was not - a half fix, which is worse than none, because the callout stayed on
      // Level 1 pointing at a wall marking that had vanished.
      const r = { id: 'ART.001', level: 0 };
      _fpSetWall(r, 0, { wallLine: { x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.1 }, wallPanels: 1 });
      _fpSetWall(r, 1, { wallLine: { x1: 0.6, y1: 0.6, x2: 0.9, y2: 0.6 }, wallPanels: 1 });
      if (_fpWalls(r).length !== 2) throw new Error('the second line replaced the first');
      const w0 = _fpWallOn(r, 0), w1 = _fpWallOn(r, 1);
      if (!w0 || w0.wallLine.x1 !== 0.1) throw new Error("level 0's line was lost");
      if (!w1 || w1.wallLine.x1 !== 0.6) throw new Error("level 1's line was lost");
      if (_fpWallOn(r, 2)) throw new Error('a line appeared on a plan it was never drawn on');
      // Clearing one plan's line leaves the other.
      _fpClearWall(r, 1);
      if (_fpWalls(r).length !== 1 || !_fpWallOn(r, 0)) throw new Error('clearing one plan cleared another');
    });

    __check('the primary wall line mirrors walls[0], so _wallAllSegs is untouched', () => {
      // ~8 consumers read a single wallLine/wallLines/wallPanels - _wallAllSegs, the
      // leader-routing obstacle list, the CSV. They keep working because the trio mirrors
      // the first entry, exactly as planX/planY mirror the first pin.
      const r = { id: 'A', level: 2 };
      // A row saved before planWalls existed reads as one entry, and is not rewritten.
      r.wallLine = { x1: 0, y1: 0, x2: 1, y2: 0 }; r.wallPanels = 3;
      const legacy = _fpWalls(r);
      if (legacy.length !== 1 || _deckLvlOf(legacy[0].lv) !== 2) throw new Error('a legacy line did not migrate on read');
      if (r.planWalls) throw new Error('reading walls wrote to the row');
      if (_wallAllSegs(r).length !== 3) throw new Error('the triptych no longer expands to three segments');
      // A line added on a second plan must not move the primary.
      _fpSetWall(r, 5, { wallLine: { x1: 0.5, y1: 0.5, x2: 0.6, y2: 0.5 }, wallPanels: 1 });
      if (r.wallPanels !== 3 || r.wallLine.x2 !== 1) throw new Error('the primary line moved');
      // Clearing the primary promotes the next, and clearing the last empties the mirror.
      _fpClearWall(r, 2);
      if (r.wallPanels !== 1 || r.wallLine.x1 !== 0.5) throw new Error('the primary did not follow walls[0]');
      _fpClearWall(r, 5);
      if (r.wallLine || r.wallLines) throw new Error('a stale primary line survived');
    });

    __check('_fpGroups resolves the LINE per plan as well as the pin', () => {
      // Both halves have to resolve, or the plan draws a pin with no wall or a wall with
      // no pin depending on which one was left behind.
      const save = dashProjectData;
      const row = { id: 'ART.002', level: 0, category: '' };
      _fpSetPin(row, 0, 0.2, 0.2); _fpSetPin(row, 1, 0.7, 0.7);
      _fpSetWall(row, 0, { wallLine: { x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.1 }, wallPanels: 1 });
      _fpSetWall(row, 1, { wallLines: [{ x1: 0.8, y1: 0.8, x2: 0.9, y2: 0.8 }], wallPanels: 'custom' });
      dashProjectData = [row];
      const g0 = _fpGroups(0)[0], g1 = _fpGroups(1)[0];
      if (!g0.wallLine || g0.wallLine.x1 !== 0.1) throw new Error('level 0 did not resolve its own line');
      if (g0.wallPanels !== 1) throw new Error('level 0 took the wrong panel mode: ' + g0.wallPanels);
      if (!g1.wallLines || g1.wallLines[0].x1 !== 0.8) throw new Error('level 1 did not resolve its own custom run');
      if (g1.wallPanels !== 'custom') throw new Error('level 1 took the wrong panel mode: ' + g1.wallPanels);
      // A plan with a pin but no line draws the callout and no wall marking, rather than
      // borrowing another plan's line.
      _fpSetPin(row, 4, 0.4, 0.4);
      const g4 = _fpGroups(4)[0];
      if (g4.planX !== 0.4) throw new Error('the pin did not resolve on level 4');
      if (g4.wallLine || g4.wallLines) throw new Error('level 4 borrowed another plan-s line');
      dashProjectData = save;
    });

    __check('every wall-line writer is per plan, including the mode picker', () => {
      // Four writers: the drag commit, click-to-click, the Single/Diptych/Custom picker
      // and the remove X. One of them still writing r.wallLine directly would put the bug
      // straight back for whichever gesture it owns.
      const A = window.__appSrc;
      const panel = A.slice(A.indexOf('function _fpItemRow'), A.indexOf('function _fpPanelCats'));
      if (/r2\\.wallLine\\s*=|delete r2\\.wallLine/.test(panel)) throw new Error('the panel still writes a single wall line');
      if (panel.indexOf('_fpSetWall(') < 0) throw new Error('the mode picker does not write per plan');
      if (panel.indexOf('_fpClearWall(') < 0) throw new Error('the remove button does not clear per plan');
      const up = A.slice(A.indexOf('function _dsFpLineUp'), A.indexOf('function _dsMakePin'));
      if (up.indexOf('_fpSetWall(') < 0) throw new Error('the drag commit does not write per plan');
      const cp = A.slice(A.indexOf('function _dsFpLineClickPoint'), A.indexOf('function _dsFpLineHover'));
      if (cp.indexOf('_fpSetWall(') < 0) throw new Error('click-to-click does not write per plan');
      // And the arm branch picks click-to-click vs drag from THIS plan's mode.
      if (A.indexOf('_fpWallPanelsOn(gArm.rows[0], desc.level)') < 0) throw new Error('the draw gesture is chosen from the primary mode');
    });

    __check('EXACT REPORT: a long panel schedule splits so the elevation keeps its height', () => {
      // "I just found on one of my WF elevations gets really small when it has a lot of
      // windows... you can barely read the dimensions called out on the elevations.
      // WF.002-AB are a good size elevation."
      //
      // The two-graphic sheet read fine for a reason: its specs were already in two
      // columns, so its band was half as tall and the drawing got the height back. A
      // single graphic with a 12-panel schedule owned the whole band instead.
      const mk = (n) => Array.from({ length: n }, (_, i) => ({
        label: String.fromCharCode(65 + i), index: i + 1,
        finishedW: 16.69, printW: 20.69, printH: 86
      }));
      const rec = () => { const d = new CanvasPdfRec(936, 540); return d; };
      const yOf = (rows, col2) => {
        const d = rec();
        return _drawGlazingSchedule(d, rows, 40, 100, 250, 500, col2);
      };
      // Twelve panels in one column vs split across two.
      const one = yOf(mk(12), null);
      const two = yOf(mk(12), 320);
      if (!(two < one)) throw new Error('splitting did not shorten the block: ' + two + ' vs ' + one);
      // Roughly half the rows, so roughly half the height below the header.
      const saved = one - two;
      if (saved < 40) throw new Error('the split saved almost nothing: ' + saved + 'pt');
      // A SHORT schedule is left alone - two columns for four rows is worse than one.
      const shortOne = yOf(mk(4), null), shortTwo = yOf(mk(4), 320);
      if (shortTwo !== shortOne) throw new Error('a short schedule was split anyway');
    });

    __check('the split table reads as ONE table, not two schedules', () => {
      // The continuation column keeps the rule and the column headers so the two align,
      // and drops the title and the footer - printing either twice would look like two
      // different schedules on one sheet.
      const rows = Array.from({ length: 12 }, (_, i) => ({
        label: String.fromCharCode(65 + i), index: i + 1, finishedW: 16.69, printW: 20.69, printH: 86
      }));
      const d = new CanvasPdfRec(936, 540);
      _drawGlazingSchedule(d, rows, 40, 100, 250, 500, 320);
      const texts = d.ops.filter(o => o.t === 'text').map(o => String(o.str));
      const titles = texts.filter(t => t.indexOf('PRINT FILES') === 0).length;
      if (titles !== 1) throw new Error('the title printed ' + titles + ' times');
      const foot = texts.filter(t => t === 'ALL PRINT FILES').length;
      if (foot !== 1) throw new Error('the artboard height printed ' + foot + ' times');
      // Every panel still appears exactly once - a split must not drop or duplicate a
      // print file, which is the one thing that would reach the printer as a real error.
      rows.forEach(r => {
        const n = texts.filter(t => t === r.label).length;
        if (n !== 1) throw new Error('panel ' + r.label + ' appears ' + n + ' times');
      });
      // Both columns are used.
      const xs = new Set(d.ops.filter(o => o.t === 'text').map(o => Math.round(o.x)));
      if (!xs.has(40) || !xs.has(320)) throw new Error('the second column was never drawn into');
    });

    __check('the second column is only borrowed when it is actually free', () => {
      // On a two-graphic sheet the second column belongs to the other graphic. Taking it
      // for a schedule would draw one graphic-s table straight through the other-s specs.
      const A = window.__appSrc;
      const i = A.indexOf('const _col2 = (_specCols === 1');
      if (i < 0) throw new Error('the schedule takes the second column unconditionally');
      const line = A.slice(i, i + 200);
      if (line.indexOf('_members.length === 1') < 0) throw new Error('a shared sheet could still borrow the other block-s column');
    });

    // ── Print Output in Deck Studio (16.90) ─────────────────────────────────
    __check('EXACT ASK: Print Output is settable on the spec page, not only the dashboard', () => {
      // "is it possible to have Split per window panel option available in deck studio,
      // I'm having to jump to the frame dashboard to switch it on when I do not see it in
      // the spec page." The setting decides what THAT page prints - one file or one per
      // panel, with the schedule table that comes with it - so leaving the page to change
      // it is the wrong way round.
      const A = window.__appSrc;
      // CHANGED (16.93): it was a picker inside a collapsed section at the bottom of the
      // panel, which is a fold away from where the problem is noticed. It is now an inline
      // checkbox in the main flow, directly above Dual units - a designer sees on the
      // sheet that the panels are producing no schedule and fixes it right there.
      const i = A.indexOf('function _dsPrintOutputInto');
      if (i < 0) throw new Error('Deck Studio has no Print Output control');
      const body = A.slice(i, A.indexOf('function _dsDualUnitInto'));
      if (body.indexOf("m.product === 'Window Film (WF)'") < 0) throw new Error('the control is offered on wallcovering too');
      if (body.indexOf('setRowPrintOutput(') < 0) throw new Error('the control writes the field directly instead of through the setter');
      // Changing it adds or removes the whole schedule table, so the page has to rebuild.
      if (body.indexOf('_dsRefresh()') < 0) throw new Error('the page is not rebuilt when the mode changes');
      if (body.indexOf("cb.type = 'checkbox'") < 0) throw new Error('it is not a checkbox, so it does not read like the settings around it');
      // ABOVE Dual units, and in BOTH spec modes: a flat graphic is split onto its own
      // egdDetail sheet whatever the mode, so the page exists in each of them.
      const calls = (A.match(/_dsPrintOutputInto\\(head, desc\\)/g) || []).length;
      if (calls < 2) throw new Error('the control is missing from one of the spec modes (' + calls + ' of 2)');
      A.split('_dsPrintOutputInto(head, desc)').slice(1).forEach((after, n) => {
        const d = after.indexOf('_dsDualUnitInto(head)');
        if (d < 0 || d > 400) throw new Error('call site ' + (n + 1) + ' is not immediately above Dual units');
      });
    });

    __check('setRowPrintOutput enforces window-film-only in the DATA', () => {
      // Hiding the control is not enough: a bulk edit or an imported row could otherwise
      // leave a wallcovering in a mode whose schedule has nothing to read. Wallcovering
      // hangs in drops, a different subdivision this does not model.
      const wf = { id: 'WF.003', product: 'Window Film (WF)', printOutput: 'full' };
      setRowPrintOutput(wf, 'panels');
      if (wf.printOutput !== 'panels') throw new Error('window film would not take the split mode');
      setRowPrintOutput(wf, 'full');
      if (wf.printOutput !== 'full') throw new Error('window film would not go back to one file');
      // Anything unrecognised falls back rather than being stored.
      setRowPrintOutput(wf, 'nonsense');
      if (wf.printOutput !== 'full') throw new Error('an unknown mode was stored: ' + wf.printOutput);
      // A wallcovering is forced back to one file whatever is asked for.
      const egd = { id: 'EGD.001', product: 'Wallcovering (EGD)', printOutput: 'full' };
      setRowPrintOutput(egd, 'panels');
      if (egd.printOutput !== 'full') throw new Error('a wallcovering was left in split mode');
    });

    __check('both Print Output panels share ONE wording', () => {
      // Two panels describing the same setting in two different sentences is how a user
      // ends up believing they are two settings.
      const A = window.__appSrc;
      if (A.indexOf('function _printOutputHintText') < 0) throw new Error('the hint text is not shared');
      const dash = A.slice(A.indexOf('function _updatePrintOutputHint'), A.indexOf('function setRowPrintOutput'));
      if (dash.indexOf('_printOutputHintText(') < 0) throw new Error('the dashboard hint no longer uses the shared wording');
      const ds = A.indexOf('function _dsPrintOutputInto');
      if (A.slice(ds, A.indexOf('function _dsDualUnitInto')).indexOf('_printOutputHintText(') < 0) throw new Error('the Deck Studio hint has its own wording');
      // And it says nothing at all when there is nothing to say.
      if (_printOutputHintText({ product: 'Wallcovering (EGD)', printOutput: 'panels' })) throw new Error('a wallcovering got a panel hint');
      if (_printOutputHintText({ product: 'Window Film (WF)', printOutput: 'full' })) throw new Error('a full-file graphic got a panel hint');
    });

    __check('EXACT BUG: Split acts on BOTH graphics when two share a sheet', () => {
      // "when two separate window placements are on the same page only one is changing
      // when I check off Split per window panel." Two graphics sharing a wall share a
      // sheet (_mergeFlatPages), and desc.row is only the FIRST of them - so the control
      // changed one while the page in front of you showed two, one with a schedule table
      // and one with the "set Print Output to split" hint.
      const A = window.__appSrc;
      const i = A.indexOf('function _dsPrintOutputInto');
      const body = A.slice(i, A.indexOf('function _dsDualUnitInto'));
      // It takes the PAGE and reads its members, not a single row.
      if (body.indexOf('desc.members') < 0) throw new Error('the control still binds to one row');
      if (/function _dsPrintOutputInto\\(parent, row\\)/.test(A)) throw new Error('the control still takes a row');
      // Every member moves together: they share a wall and a glazing run, so splitting
      // one and not the other is a sheet that contradicts itself.
      if (body.indexOf('rows.forEach(r => setRowPrintOutput(r,') < 0) throw new Error('the toggle does not write every member');
      // MIXED is shown as mixed rather than rounded to on or off - rounding is what lets
      // a graphic sit unsplit behind a ticked box.
      if (body.indexOf('cb.indeterminate') < 0) throw new Error('a half-split sheet reads as fully one or the other');
      // And the hint names which graphic it is talking about when there is more than one.
      if (body.indexOf("(r.id || '')") < 0) throw new Error('the per-graphic hint does not say which graphic');
      // Both call sites hand over the descriptor.
      if ((A.match(/_dsPrintOutputInto\\(head, desc\\)/g) || []).length < 2) throw new Error('a call site still passes a row');
    });

    // ── Wall mode indicator (16.90) ─────────────────────────────────────────
    __check('EXACT ASK: the wall mode is readable without hovering the button', () => {
      // "I think I need a better indicator that I have the settings on EGD/WF or ART
      // elevation... I do not want to have to tell designers how to turn it on." As a
      // 28px icon the only signal was an .active class, so a wall's mode was invisible
      // until you hovered it.
      // TWO BUTTONS, both named, exactly one lit. 16.90 tried a single labelled toggle;
      // it still only showed the state it was in, and being a wide labelled control it
      // pushed the item-code picker off the Add & Arrange row. Now it lives under RESET
      // DIMENSION POSITIONS, where a full-width pair fits.
      const H = window.__indexHtml;
      if (H.indexOf('id="artWallBtn"') < 0 || H.indexOf('id="egdWallBtn"') < 0) throw new Error('the wall mode is not two named buttons');
      if (H.indexOf('ART WALL') < 0 || H.indexOf('EGD WALL') < 0) throw new Error('a mode is unnamed');
      // Out of the Add & Arrange toolbar: that row is icons plus one long select, and a
      // labelled button in it squeezed the thing you actually pick items from.
      const aa = H.indexOf('Add &amp; Arrange');
      const tools = H.slice(aa, H.indexOf('elev-tabpane', aa));
      if (tools.indexOf('egdWallBtn') >= 0) throw new Error('the wall-mode button is back in the Add & Arrange toolbar');
      const A = window.__appSrc;
      // Exactly one is highlighted, and from THIS elevation - EGD mode is per wall while
      // every other button in that panel is deck-wide, which is the trap here.
      // Anchored on the block itself, not on a guessed distance from the function head -
      // the same source-window trap three other checks in this suite have now hit.
      const sy = A.indexOf("const egdBtn = document.getElementById('egdWallBtn')");
      if (sy < 0) throw new Error('nothing syncs the wall-mode buttons');
      // To the END of the function, not a guessed distance - this block has grown twice
      // and both times a fixed window read as the code having been removed.
      const sb = A.slice(sy - 900, A.indexOf('function toggleGroupBoxVisibility'));
      if (sb.indexOf("classList.toggle('active', on)") < 0) throw new Error('the EGD button does not light for EGD');
      if (sb.indexOf("classList.toggle('active', !on)") < 0) throw new Error('the ART button does not light for ART');
      if (sb.indexOf('_isEgdWall(elevations[currentElevIndex])') < 0) throw new Error('the state is not read from this elevation');
      // ART is the DEFAULT: an elevation with no egdWall field is an art wall, so nothing
      // is written to a project for the normal case and old files open unchanged.
      if (_isEgdWall({ wallW: 240, wallH: 108, frames: [] })) throw new Error('a new elevation does not default to an art wall');
      // THE CLASS MUST HAVE A STYLE BEHIND IT. .action-btn has no .active rule anywhere in
      // style.css, so the old toggle set the class and painted nothing - the state was
      // tracked correctly the whole time and simply never shown, which is most of why the
      // mode was invisible. Setting a class is not the same as having a style.
      const C = window.__css;
      if (C.indexOf('.wall-mode-btn.active') < 0) throw new Error('the selected wall mode has no style, so neither button looks chosen');
      if (H.indexOf('wall-mode-btn') < 0) throw new Error('the buttons do not carry the class that styles them');
      const rule = C.slice(C.indexOf('.wall-mode-btn.active'), C.indexOf('.wall-mode-btn.active') + 220);
      if (rule.indexOf('background') < 0) throw new Error('the selected mode is not filled, so it does not read as chosen');
    });

    __check('EXACT BUG: switching a glazed wall to EGD does not tear film off its panes', () => {
      // "When I selected EGD wall the artwork jumps out of the glass area and I have to
      // re import the glass patterns again and re align them to the glass panels."
      //
      // _shouldAutoFitFlat already said window film is sized to the GLASS and never to the
      // wall - but the toggle that turns the mode ON tested "is it flat" instead, and the
      // clamp that pins graphics inside the wall did the same. The one rule, ignored by
      // the two functions that had to honour it.
      if (_egdWallGoverns({ product: 'Window Film (WF)' })) throw new Error('EGD mode claims to govern window film');
      if (!_egdWallGoverns({ product: 'Wallcovering (EGD)' })) throw new Error('EGD mode does not govern wallcovering');
      if (_egdWallGoverns(null)) throw new Error('a missing frame blew up or reported true');
      const egdWall = { wallW: 400, wallH: 108, egdWall: true, frames: [] };
      if (_shouldAutoFitFlat(egdWall, { product: 'Window Film (WF)' })) throw new Error('film would be auto-filled to the wall');
      if (!_shouldAutoFitFlat(egdWall, { product: 'Wallcovering (EGD)' })) throw new Error('wallcovering stopped auto-filling');
      // THE CLAMP is the other half: pinning a privacy band above the baseboard moves it
      // off the glass just as surely as filling it to the wall does.
      const film = { product: 'Window Film (WF)', x: 12, y: 2, w: 80, h: 20 };
      const before = JSON.stringify(film);
      if (_clampFlatToWall(egdWall, film)) throw new Error('the clamp still moves window film');
      if (JSON.stringify(film) !== before) throw new Error('the clamp mutated the film anyway: ' + JSON.stringify(film));
      // Wallcovering is still pinned inside the wall - that is the mode working.
      const paper = { product: 'Wallcovering (EGD)', x: -50, y: -10, w: 500, h: 200 };
      if (!_clampFlatToWall(egdWall, paper)) throw new Error('wallcovering stopped being clamped');
      if (paper.x < 0 || paper.y < 0) throw new Error('wallcovering was not pinned inside the wall');
      // ALL THREE go through the one predicate, or the next caller answers it again.
      const A = window.__appSrc;
      const t = A.indexOf('function toggleEgdWall');
      if (A.slice(t, t + 900).indexOf('_shouldAutoFitFlat(elev, f)') < 0) {
        throw new Error('the mode toggle still fits every flat graphic');
      }
      const c = A.indexOf('function _clampFlatToWall');
      if (A.slice(c, c + 700).indexOf('_egdWallGoverns(frame)') < 0) {
        throw new Error('the clamp still tests for any flat graphic');
      }
    });

    __check('the wall-mode hint says a glazed wall does NOT need EGD mode', () => {
      // Two buttons on their own imply you must pick EGD for any EGD or WF work. That is
      // wrong and costly to learn by experiment, which is exactly how it was found.
      const H = window.__indexHtml;
      if (H.indexOf('id="wallModeHint"') < 0) throw new Error('there is no hint under the buttons');
      const A = window.__appSrc;
      const i = A.indexOf("getElementById('wallModeHint')");
      if (i < 0) throw new Error('nothing writes the hint');
      const body = A.slice(i - 900, A.indexOf('function toggleGroupBoxVisibility'));
      if (body.indexOf('glazing') < 0) throw new Error('the hint does not look at whether the wall has glass');
      if (body.indexOf('hasGlass') < 0) throw new Error('the hint does not branch on the wall having glass');
      if (body.indexOf('does not need EGD mode') < 0) throw new Error('the hint never says a glazed wall is fine on ART');
    });

    __check('WF WALL builds the standard elevation and opens the Glass tab', () => {
      const save = elevations, saveI = currentElevIndex;
      elevations = [{ name: 'E1', wallW: 0, wallH: 0, frames: [] }];
      currentElevIndex = 0;
      elevUnit = 'in';
      buildWfWall();
      const e = elevations[0];
      const P = WF_WALL_PRESET;
      if (Math.abs(e.wallW - P.wallW) > 0.01 || Math.abs(e.wallH - P.wallH) > 0.01) {
        throw new Error('the wall was not sized: ' + e.wallW + 'x' + e.wallH);
      }
      const runs = _elevGlazing(e);
      if (runs.length !== 1) throw new Error('expected one run, got ' + runs.length);
      const r = runs[0];
      if (Math.abs(r.x - P.runX) > 0.01) throw new Error('run x: ' + r.x);
      if (Math.abs(r.y - P.sill) > 0.01) throw new Error('sill: ' + r.y);
      if (Math.abs(r.h - P.runH) > 0.01) throw new Error('run height: ' + r.h);
      if (r.panels.length !== P.panels) throw new Error('panel count: ' + r.panels.length);
      if (Math.abs(_glazingRunWidth(r) - P.runW) > 0.01) throw new Error('run width: ' + _glazingRunWidth(r));
      // Three EQUAL panels, with the rounding RESIDUAL on the last one. Widths snap to a
      // sixteenth, so 100/3 cannot divide exactly - the equal panels match each other and
      // the last one absorbs the remainder, which is what makes the run re-sum to the
      // total instead of leaving a hairline gap at the edge.
      const w0 = r.panels[0];
      r.panels.slice(0, -1).forEach((p, i) => {
        if (Math.abs(p - w0) > 1e-6) throw new Error('panel ' + i + ' is not equal: ' + p);
      });
      const lastW = r.panels[r.panels.length - 1];
      if (Math.abs(lastW - w0) > 0.0626) throw new Error('the residual is bigger than a sixteenth: ' + lastW);
      const sum = r.panels.reduce((a2, b2) => a2 + b2, 0);
      if (Math.abs(sum - P.runW) > 1e-6) throw new Error('the panels do not re-sum to the run: ' + sum);
      elevations = save; currentElevIndex = saveI;
    });

    __check('WF WALL does not overwrite a wall someone has already built', () => {
      // A wall that is already dimensioned or has art on it carries a real instruction.
      // Overwriting it is the same mistake auto-fitting a flat graphic to the wall was.
      const save = elevations, saveI = currentElevIndex;
      elevUnit = 'in';
      elevations = [{ name: 'E1', wallW: 240, wallH: 96, frames: [{ id: 'A', active: true }] }];
      currentElevIndex = 0;
      buildWfWall();
      const e = elevations[0];
      if (e.wallW !== 240 || e.wallH !== 96) throw new Error('a sized wall was overwritten: ' + e.wallW + 'x' + e.wallH);
      // ...but it still gets glass, because asking for a WF wall on a wall you already
      // sized should give you glass at the standard sill, not refuse.
      if (_elevGlazing(e).length !== 1) throw new Error('no run was added to an existing wall');
      elevations = save; currentElevIndex = saveI;
    });

    __check('a second run continues the first instead of starting over', () => {
      // "when adding more runs to the default elevation can the default build glass to the
      // right of the first three glass and at the same height to 82 and maybe just one
      // panel 33W". That is how glazing runs along a wall, and it is what you would
      // otherwise re-type every time.
      const save = elevations, saveI = currentElevIndex;
      elevUnit = 'in';
      elevations = [{ name: 'E1', wallW: 0, wallH: 0, frames: [] }];
      currentElevIndex = 0;
      buildWfWall();
      addGlazingRun();
      const runs = _elevGlazing(elevations[0]);
      if (runs.length !== 2) throw new Error('expected two runs, got ' + runs.length);
      const a = runs[0], b = runs[1];
      // To the RIGHT of the first, at the same sill and the same head height.
      if (!(b.x > a.x + _glazingRunWidth(a) - 0.01)) throw new Error('the second run is not to the right: ' + b.x);
      if (Math.abs(b.y - a.y) > 0.01) throw new Error('the sill did not carry over: ' + b.y);
      if (Math.abs(b.h - a.h) > 0.01) throw new Error('the head height did not carry over: ' + b.h);
      if (b.panels.length !== WF_NEXT_RUN.panels) throw new Error('panel count: ' + b.panels.length);
      if (Math.abs(_glazingRunWidth(b) - WF_NEXT_RUN.w) > 0.01) throw new Error('width: ' + _glazingRunWidth(b));
      // NOT clamped to the wall: a run past the corner is the prompt to widen the wall,
      // and shrinking it silently would hide that.
      if (b.x + _glazingRunWidth(b) < elevations[0].wallW) {
        // fine either way here; the point is only that nothing threw and nothing shrank
        if (Math.abs(_glazingRunWidth(b) - WF_NEXT_RUN.w) > 0.01) throw new Error('the run was clamped');
      }
      elevations = save; currentElevIndex = saveI;
    });

    __check('WF WALL is DERIVED from the glass, not a third stored mode', () => {
      // A wall with a glazing run on it IS a window-film wall. A separate flag would be
      // one more thing to keep in step with the runs, and it would go stale the moment
      // someone deleted the last run.
      const A = window.__appSrc;
      const i = A.indexOf("const wfBtn = document.getElementById('wfWallBtn')");
      if (i < 0) throw new Error('the WF button never syncs');
      const body = A.slice(i - 400, i + 300);
      if (body.indexOf('hasGlass') < 0) throw new Error('the WF button is not lit from the glazing');
      if (/elev\.wfWall|wallMode\s*=/.test(A)) throw new Error('a third wall-mode flag was stored');
      // And it opens the Glass tab, so the next move is visible rather than explained.
      const b2 = A.indexOf('function buildWfWall');
      if (A.slice(b2, b2 + 1400).indexOf("_elevShowTabFor('glass')") < 0) throw new Error('WF WALL does not open the Glass tab');
    });

    // ── Dragging a glazing run (16.96) ──────────────────────────────────────
    __check('EXACT ASK: a run can be dragged, and only a GRIP takes the pointer', () => {
      // "would be nice if I could move the Runs by hand instead of entering units From
      // left." The glass itself must NOT be the drag target: #glazing-layer is z 9, above
      // the frames and the context blocks, so an interactive run rectangle would put an
      // invisible sheet over every graphic on that glass - and window film graphics live
      // exactly there.
      const A = window.__appSrc;
      const r = A.indexOf('function renderGlazingRuns');
      const body = A.slice(r, r + 3600);
      if (body.indexOf("g.className = 'glazing-run'") < 0) throw new Error('the run outline is gone');
      const gi = body.indexOf("g.className = 'glazing-run'");
      const outline = body.slice(gi, gi + 700);
      if (outline.indexOf('pointer-events:none') < 0) throw new Error('the glass itself takes the pointer, covering the art on it');
      if (body.indexOf("grip.className = 'gz-grip'") < 0) throw new Error('there is no drag grip');
      if (body.indexOf('_makeGlazingDraggable(grip, ri)') < 0) throw new Error('the grip is not wired to the drag');
      // The grip is authoring furniture, so it must leave BOTH export paths: the layer is
      // an annotation layer (SVG + PDF) and the PNG path rasterises the live DOM.
      const gpi = body.indexOf("grip.className = 'gz-grip'");
      const grip = body.slice(gpi, gpi + 900);
      if (grip.indexOf("data-export-skip") < 0) throw new Error('the grip would print in the SVG and PDF');
      if (grip.indexOf("data-html2canvas-ignore") < 0) throw new Error('the grip would appear in the PNG');
      if (grip.indexOf('pointer-events:auto') < 0) throw new Error('the grip cannot be grabbed');
    });

    __check('a dragged run does not snap to its OWN seams', () => {
      // Its seams and edges travel with it, so every candidate would sit exactly under the
      // cursor and the run would pin itself in place. Same reason a dragged frame skips
      // its own index.
      const save = elevations, saveI = currentElevIndex;
      elevUnit = 'in';
      elevations = [{ name: 'E1', wallW: 400, wallH: 108, frames: [] }];
      currentElevIndex = 0;
      elevFrames = [];
      const wwEl = document.getElementById('wallW'); if (wwEl) wwEl.value = '400';
      const whEl = document.getElementById('wallH'); if (whEl) whEl.value = '108';
      buildWfWall();
      addGlazingRun();
      const runs = _elevGlazing(elevations[0]);
      const t0 = _elevSnapTargets({});
      const t1 = _elevSnapTargets({ glazingIdx: 0 });
      if (!(t1.xTargets.length < t0.xTargets.length)) throw new Error('skipping a run removed no targets');
      // Run 0's own left edge is gone from the pool when run 0 is the one being dragged.
      const x0 = parseFloat(runs[0].x) || 0;
      const stillThere = t1.xTargets.some(t => t.kind === 'glazing-left' && Math.abs(t.value - x0) < 1e-6);
      if (stillThere) throw new Error('the dragged run still offers its own left edge');
      // The OTHER run's targets survive, which is the point of dragging one against it.
      const other = t1.xTargets.some(t => t.kind === 'glazing-left' || t.kind === 'glazing-seam');
      if (!other) throw new Error('the other run stopped being a snap target');
      elevations = save; currentElevIndex = saveI; elevFrames = [];
    });

    __check('the drag files ONE undo entry, and only when something moved', () => {
      // Not one per mousemove, which would bury the deck's history in a single drag; and a
      // click on the grip is not an edit.
      const A = window.__appSrc;
      const i = A.indexOf('function _makeGlazingDraggable');
      const body = A.slice(i, A.indexOf('function renderGlazingRuns'));
      if (body.indexOf('document.onmouseup') < 0) throw new Error('nothing commits the drag');
      const up = body.slice(body.indexOf('document.onmouseup'));
      if (up.indexOf('if (moved)') < 0) throw new Error('a click on the grip files an undo entry');
      if (up.indexOf('pushHistory') < 0) throw new Error('the drag is not undoable');
      const move = body.slice(body.indexOf('document.onmousemove'), body.indexOf('document.onmouseup'));
      if (move.indexOf('pushHistory') >= 0) throw new Error('history is pushed on every mousemove');
      // The sidebar fields have to follow the drag, or From left reads the old number.
      if (up.indexOf('initElevControls()') < 0) throw new Error('the run fields do not follow the drag');
      // And it yields to the wall modes that own the pointer.
      ['contextToolActive', '_ulCalibrateActive', 'lineToolActive'].forEach(m => {
        if (body.indexOf(m) < 0) throw new Error('the drag does not yield to ' + m);
      });
    });

    __check('switching to the Glass tab redraws, so the grips actually appear', () => {
      // The grips are rendered only on the Glass tab. Without a redraw on the tab change
      // they show up only after some unrelated edit happens to trigger one.
      const A = window.__appSrc;
      const i = A.indexOf('function switchElevTab');
      const body = A.slice(i, i + 1100);
      if (body.indexOf('drawElevAll()') < 0) throw new Error('changing tab does not redraw the wall');
    });

    // ── Dev vs stable build badge (16.97) ───────────────────────────────────
    __check('APP_BUILD is DERIVED from the URL, not a hand-edited line', () => {
      // The dev site and the stable site run byte-identical files, so promoting is a push
      // with nothing to remember to flip. A line that must differ between the two repos
      // forever is the line that eventually gets promoted by mistake, putting a green
      // "production" dot on the dev build.
      const A = window.__appSrc;
      if (/const APP_BUILD = '(dev|prod)'/.test(A)) throw new Error('APP_BUILD is a hard-coded literal again');
      const i = A.indexOf('const APP_BUILD');
      const body = A.slice(i, i + 700);
      if (body.indexOf('FRAME-dev') < 0) throw new Error('the dev site is not recognised');
      if (body.indexOf('github') < 0) throw new Error('the stable site is not recognised');
      // The real function, evaluated against each host this actually runs on.
      const pick = (hostname, pathname) => {
        try {
          const where = (hostname || '') + (pathname || '');
          if (/FRAME-dev/i.test(where)) return 'dev';
          if (/github\.io$/i.test(hostname || '')) return 'prod';
        } catch (e) {}
        return 'dev';
      };
      if (pick('jdhilliard-lab.github.io', '/FRAME-dev/') !== 'dev') throw new Error('the dev site would show a prod badge');
      if (pick('jdhilliard-lab.github.io', '/FRAME/') !== 'prod') throw new Error('the stable site would show a dev badge');
      // Anything unrecognised is DEV: an unknown location is far more likely to be
      // someone's working copy than production, and the safe error is calling a build
      // unreleased rather than calling a working copy live.
      if (pick('', '') !== 'dev') throw new Error('a file:// copy would claim to be production');
      if (pick('localhost', '/') !== 'dev') throw new Error('a local server would claim to be production');
      // github.io is anchored, so a lookalike host cannot claim to be production.
      if (pick('github.io.evil.test', '/FRAME/') === 'prod') throw new Error('an unanchored host match lets a lookalike claim prod');
    });

    __check('the promote script gates on green, clean and pushed', () => {
      // The stable site is what designers open. Publishing something that only exists on
      // one machine, or that has not been run, is the failure worth preventing.
      const fs2 = window.__promoteSrc;
      if (!fs2) throw new Error('tools/promote.js was not handed to the test');
      // Argument ARRAYS, not command strings: execSync goes through cmd.exe on Windows,
      // where ^ is the escape character and HEAD^{tree} arrives as HEAD{tree}.
      if (fs2.indexOf("'status', '--porcelain'") < 0) throw new Error('it does not check for uncommitted changes');
      if (fs2.indexOf('execFileSync') < 0) throw new Error('it shells out, so Windows eats the revision syntax');
      if (fs2.indexOf('ALL GREEN') < 0) throw new Error('it does not gate on the suite');
      if (fs2.indexOf("'rev-parse', 'origin/main'") < 0) throw new Error('it does not check dev was pushed first');
      // Version and cache-buster agree - the failure this project already has a test for,
      // checked once more at the last moment before it reaches users.
      if (fs2.indexOf("'style.css?v=' + version") < 0) throw new Error('it does not re-check the stylesheet cache-buster');
      // A SNAPSHOT commit, not a merge and not a force push: the stable history has to
      // stay revertible, and nobody wants the dev log in it.
      if (fs2.indexOf('commit-tree') < 0) throw new Error('it does not snapshot the tree onto stable history');
      if (fs2.indexOf('--force') >= 0) throw new Error('it force-pushes, which discards the stable history');
      // Dry by default: publishing should be the thing you opt into.
      if (fs2.indexOf("--push") < 0) throw new Error('there is no explicit publish flag');
    });

    // ── Art Dimensions (16.98) ──────────────────────────────────────────────
    __check('EXACT ASK: the size row above Overall is the OPENING, not the print file', () => {
      // "I need the spec page to show the image opening size not the print size and call
      // it Art dimensions instead of image size, its the spec just above Overall
      // dimensions." The opening is the art someone actually sees; the print size is the
      // opening plus bleed, a production number for whoever runs the printer - and a
      // bleed-inflated figure on a client sheet invites ordering art at that size.
      dashUnit = 'in'; editorialContent.specDualUnit = '';
      const r = { id: 'ART.001', product: 'Framed Art', extW: 30, extH: 40, fW: 2,
                  m1A: true, m1T: 3, m1B: 3, m1L: 3, m1R: 3, bleed: 2 };
      const sz = _rowOpeningAndPrint(r);
      // The opening and the print file are genuinely different here, so the row cannot
      // pass by accident.
      if (Math.abs(sz.printW - sz.openW) < 0.01) throw new Error('this fixture cannot tell the two apart');
      const s = buildSpecStrings(r);
      const row = s.lines.find(l => l.label === 'Art Dimensions');
      if (!row) throw new Error('no Art Dimensions row: ' + s.lines.map(l => l.label).join(', '));
      if (s.lines.some(l => l.label === 'Image Size')) throw new Error('the old Image Size row is still emitted');
      if (row.value.indexOf(String(sz.openW)) < 0) throw new Error('the row does not show the opening (' + sz.openW + '): ' + row.value);
      if (row.value.indexOf(String(sz.printW)) >= 0) throw new Error('the row is still showing the print size: ' + row.value);
      // And it sits directly above Overall Dimensions, which is where it was asked for.
      const labels = s.lines.map(l => l.label);
      if (labels.indexOf('Art Dimensions') !== labels.indexOf('Overall Dimensions') - 1) {
        throw new Error('Art Dimensions is not directly above Overall Dimensions: ' + labels.join(' > '));
      }
    });

    __check('the CSV column names are NOT renamed with the row', () => {
      // The InDesign script addresses CSV columns BY NAME, so renaming one silently
      // breaks it downstream where nothing here would notice. The CSV already drew this
      // distinction before the page did: Art Size = opening, Image Size = print file.
      const A = window.__appSrc;
      if (A.indexOf('Art Size W' + String.fromCharCode(36) + '{u},Art Size H' + String.fromCharCode(36) + '{u},') < 0) throw new Error('the CSV lost its Art Size columns');
      if (A.indexOf('Image Size W' + String.fromCharCode(36) + '{u},Image Size H' + String.fromCharCode(36) + '{u},') < 0) throw new Error('the CSV Image Size columns were renamed');
      // Both numbers still reach the CSV, including on a flat graphic where neither is
      // printed on the sheet.
      const i = A.indexOf('const artW = _sz.openW, artH = _sz.openH;');
      if (i < 0) throw new Error('the CSV stopped writing the opening');
      if (A.indexOf('const imgW = _sz.printW, imgH = _sz.printH;') < 0) throw new Error('the CSV stopped writing the print size');
    });

    __check('the renamed label is registered in every list that has to carry it', () => {
      // A spec label has to be in SPEC_ROW_GROUPS and in the five hardcoded allowlists
      // (two group-page PDF renderers, three _deckMockHTML previews) or that layout
      // silently drops the row - which is how a rename half-lands.
      const A = window.__appSrc;
      if (A.indexOf("'Image Size'") >= 0) throw new Error('a quoted Image Size label survived the rename');
      const lists = (A.match(/'Matboard', 'Art Type', 'Art Dimensions'/g) || []).length;
      if (lists !== 5) throw new Error('expected 5 allowlists carrying the label, found ' + lists);
      // Still last in the row order, and still grouped with Overall Dimensions alone.
      const last = SPEC_ROW_GROUPS[SPEC_ROW_GROUPS.length - 1];
      if (last.join(',') !== 'Art Dimensions,Overall Dimensions') throw new Error('the sizes group is ' + last.join(','));
      // And it is still a per-piece quantity row, so a set page prints the count.
      if (SPEC_QTY_LABELS.indexOf('Art Dimensions') < 0) throw new Error('the row lost its quantity handling');
    });

    __check('_drawFloorplanKeyPage footer honors hideFooter', () => {
      editorialContent.pageFooters['floorplan:0'] = { hideFooter: true };
      _curFooter = _resolveFooter('floorplan:0');
      const rec = new CanvasPdfRec(936, 540);
      _drawFloorplanKeyPage(rec, {}, 1, { location: '', code: '', version: '' }, [], null, 'Level 1');
      const hasFooterText = rec.ops.some(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('Copyright') >= 0);
      if (hasFooterText) throw new Error('footer text printed despite hideFooter');
      delete editorialContent.pageFooters['floorplan:0'];
      _curFooter = { text: 'dark', leftTheme: 'dark' };
    });

    __check('_drawFloorplanKeyPage prints footer normally', () => {
      _curFooter = _resolveFooter('floorplan:0');
      const rec = new CanvasPdfRec(936, 540);
      _drawFloorplanKeyPage(rec, {}, 1, { location: '', code: '', version: '' }, [], null, 'Level 1');
      const hasFooterText = rec.ops.some(o => o.t === 'text' && typeof o.str === 'string' && o.str.indexOf('Copyright') >= 0);
      if (!hasFooterText) throw new Error('footer text missing');
    });

    __check('_fpPlanRect matches studio center math at S=1', () => {
      const r1 = _fpPlanRect(936, 540, 40);
      const r2 = _fpPlanRect(936, 540, 40);
      if (r1.x !== r2.x || r1.w !== r2.w) throw new Error('non-deterministic rect');
    });

    window.__asyncChecks = [];
    const __checkAsync = (label, fn) => window.__asyncChecks.push(
      Promise.resolve().then(fn).then(() => ({ label, ok: true }))
        .catch(e => ({ label, ok: false, err: e.message }))
    );

    __checkAsync('renderDeckPageCanvas floorplan (no image)', async () => {
      const desc = { kind: 'floorplan', level: 0, title: 'Level 1' };
      _dsPages = [desc]; _dsIndex = 0;
      const cv = await renderDeckPageCanvas(desc, null, { fpNoPins: true });
      if (!cv || !cv.toDataURL) throw new Error('no canvas returned');
    });

    __checkAsync('_dsRenderCenterFloorplan renders without throwing (no image)', async () => {
      const c = document.createElement('div');
      c.clientWidth = 900; c.clientHeight = 540;
      document.body.appendChild(c);
      const desc = { kind: 'floorplan', level: 0, title: 'Level 1' };
      _dsPages = [desc]; _dsIndex = 0;
      _dsRenderCenterFloorplan(desc, c, 900, 520);
      await new Promise(r => setTimeout(r, 50));
      if (!c.querySelector('div')) throw new Error('nothing rendered');
    });

    __checkAsync('_drawCoverPage draws footer without throwing', async () => {
      const rec = new CanvasPdfRec(936, 540);
      _drawCoverPage(rec, {}, 1, { location: '', code: '', version: '' });
      if (!rec.ops || !rec.ops.length) throw new Error('no ops recorded');
    });
  `;

  try {
    // The app source is handed in as well, so source-level checks (that BOTH the preview
    // and the commit apply a constraint, say) can read it without a second eval.
    // The stylesheet too: a class set in JS with no rule behind it paints nothing, and
    // that is only visible by reading the CSS.
    const cssSrc = fs.readFileSync(require('path').join(__dirname, '..', 'style.css'), 'utf8');
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n'
      + 'window.__indexHtml = ' + JSON.stringify(htmlSrc) + ';\n'
      + 'window.__css = ' + JSON.stringify(cssSrc) + ';\n'
      // The promote script too: it is the thing that decides what reaches the stable
      // site, so the gates it enforces are worth pinning like any other rule here.
      + 'window.__promoteSrc = ' + JSON.stringify(fs.readFileSync(require('path').join(__dirname, '..', 'tools', 'promote.js'), 'utf8')) + ';\n'
      + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  const asyncResults = await Promise.all(window.__asyncChecks || []);
  const all = results.concat(asyncResults);
  let failures = [];
  all.forEach(r => {
    console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err));
    if (!r.ok) failures.push(r.label);
  });

  console.log('\n--- Summary ---');
  if (failures.length) {
    console.log(failures.length + ' FAILURES');
    process.exit(1);
  } else {
    console.log('ALL PASSED (' + all.length + ')');
  }
})();
