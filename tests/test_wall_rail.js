// The wall rail: per-elevation tabs moved from a horizontal strip in the top
// nav to a vertical, scrollable list on the right of the elevation drawing,
// with + Add Wall pinned at its bottom.
//
// Beyond the move itself, three things had to change and are easy to get wrong:
// the drag-to-reorder midpoint maths flips from X to Y, the scroll position it
// preserves across rebuilds flips from scrollLeft to scrollTop, and wall names
// now land in a title attribute (rows truncate) so they have to be escaped.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  window.confirm = () => true;
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};

    const __seed = (names) => {
      elevations = names.map(n => ({ name: n, frames: [], wallW: 185, wallH: 108, personPos: { x: -60 } }));
      currentElevIndex = 0;
    };
    const __rows = () => document.querySelectorAll('#nav-tabs-container .wall-tab');

    // ── Where it lives ──
    __check('the rail sits inside the elevation view, beside the drawing (not inside the scrolling workspace)', () => {
      const rail = document.getElementById('elev-wall-rail');
      if (!rail) throw new Error('#elev-wall-rail missing');
      const elev = document.getElementById('view-elevation');
      if (!elev.contains(rail)) throw new Error('rail is not inside #view-elevation');
      const ws = document.querySelector('#view-elevation .workspace');
      if (ws.contains(rail)) throw new Error('rail is inside .workspace — it would scroll away with the drawing');
      if (rail.parentElement !== elev) throw new Error('rail should be a direct flex sibling of .workspace');
      const list = document.getElementById('nav-tabs-container');
      if (!rail.contains(list)) throw new Error('#nav-tabs-container is not in the rail');
      // + Add Wall pinned at the bottom = last element child of the rail.
      const last = rail.lastElementChild;
      if (last.tagName !== 'BUTTON' || last.textContent.indexOf('Add Wall') < 0) throw new Error('+ Add Wall is not the rail\\'s last child, got ' + last.tagName + ' "' + last.textContent.trim() + '"');
    });

    __check('the walls are gone from the top nav, which now only holds the fixed view tabs', () => {
      const nav = document.querySelector('.app-top-nav');
      if (nav.querySelector('#nav-tabs-container')) throw new Error('#nav-tabs-container is still in the top nav');
      if (nav.querySelector('.nav-add-tab')) throw new Error('+ Add Wall is still in the top nav');
      // The old horizontal strip class should be gone entirely.
      if (document.querySelector('.nav-tabs')) throw new Error('.nav-tabs strip still exists');
    });

    // ── Rendering ──
    __check('one row per wall, in order, each carrying its index and full name', () => {
      __seed(['Wall A', 'Wall B', 'Wall C']);
      currentView = 'elevation';
      renderNavTabs();
      const rows = __rows();
      if (rows.length !== 3) throw new Error('expected 3 rows, got ' + rows.length);
      ['Wall A', 'Wall B', 'Wall C'].forEach((n, i) => {
        if (rows[i].getAttribute('data-tab-idx') !== String(i)) throw new Error('row ' + i + ' has data-tab-idx ' + rows[i].getAttribute('data-tab-idx'));
        if (rows[i].getAttribute('title') !== n) throw new Error('row ' + i + ' title is "' + rows[i].getAttribute('title') + '", expected "' + n + '" (rows truncate, so hover is how you read a long name)');
        if (rows[i].textContent.indexOf(n) < 0) throw new Error('row ' + i + ' does not show its name');
        if (!rows[i].querySelector('.wall-tab-name')) throw new Error('row ' + i + ' has no .wall-tab-name span to truncate');
        if (!rows[i].querySelector('.tab-close')) throw new Error('row ' + i + ' has no delete control');
      });
    });

    __check('a wall name containing quotes and angle brackets cannot break the row or inject markup', () => {
      __seed(['Wall "A" <b>bold</b>']);
      currentView = 'elevation';
      renderNavTabs();
      const rows = __rows();
      if (rows.length !== 1) throw new Error('expected 1 row, got ' + rows.length);
      if (rows[0].getAttribute('title') !== 'Wall "A" <b>bold</b>') throw new Error('title mangled: ' + rows[0].getAttribute('title'));
      if (rows[0].querySelector('b')) throw new Error('markup was injected from the wall name');
      if (rows[0].querySelector('.wall-tab-name').textContent !== 'Wall "A" <b>bold</b>') throw new Error('name text mangled: ' + rows[0].querySelector('.wall-tab-name').textContent);
    });

    __check('the active row tracks currentElevIndex, and only while the elevation view is showing', () => {
      __seed(['A', 'B', 'C']);
      currentView = 'elevation'; currentElevIndex = 1;
      renderNavTabs();
      let act = document.querySelectorAll('#nav-tabs-container .wall-tab.active');
      if (act.length !== 1) throw new Error('expected exactly 1 active row, got ' + act.length);
      if (act[0].getAttribute('data-tab-idx') !== '1') throw new Error('wrong row active: ' + act[0].getAttribute('data-tab-idx'));
      // On another view no wall is "current", so nothing should look selected.
      currentView = 'deck';
      renderNavTabs();
      act = document.querySelectorAll('#nav-tabs-container .wall-tab.active');
      if (act.length !== 0) throw new Error('a wall still looks active while on the Deck view');
    });

    __check('renderWallRail is a no-op when the rail is absent instead of throwing', () => {
      __seed(['A']);
      const list = document.getElementById('nav-tabs-container');
      const parent = list.parentElement;
      list.remove();
      try { renderWallRail(); }
      catch (e) { throw new Error('threw with the rail missing (the old code read .scrollLeft off null): ' + e.message); }
      parent.insertBefore(list, parent.firstChild);
    });

    __check('rebuilding preserves the vertical scroll position, not a horizontal one', () => {
      const S = window.__appSrc;
      const i = S.indexOf('function renderWallRail');
      if (i < 0) throw new Error('renderWallRail not found');
      const body = S.slice(i, i + 2600);
      if (body.indexOf('scrollTop') < 0) throw new Error('does not preserve scrollTop — the rail would jump to the top after deleting or renaming a wall far down the list');
      if (body.indexOf('scrollLeft') >= 0) throw new Error('still touching scrollLeft, which means nothing for a vertical list');
      if (body.indexOf('_wheelWired') >= 0) throw new Error('the wheel->horizontal-scroll handler survived; overflow-y:auto scrolls a column natively');
    });

    // ── Drag to reorder, now on the Y axis ──
    __check('EXACT AXIS FLIP: the drop indicator is chosen from clientY against the row midpoint', () => {
      __seed(['A', 'B', 'C']);
      currentView = 'elevation';
      renderNavTabs();
      const rows = __rows();
      // Rows are 30px tall in a stack; mock row B at y 30..60 (midpoint 45).
      rows[1].getBoundingClientRect = () => ({ top: 30, bottom: 60, height: 30, left: 0, right: 120, width: 120 });
      const fakeStart = { currentTarget: rows[0], dataTransfer: { effectAllowed: '', setData() {} } };
      handleTabDragStart(fakeStart);
      const over = (clientY) => {
        rows[1].classList.remove('drop-before', 'drop-after');
        handleTabDragOver({ preventDefault() {}, dataTransfer: {}, currentTarget: rows[1], clientY: clientY, clientX: 9999 });
        return rows[1].className;
      };
      if (over(35).indexOf('drop-before') < 0) throw new Error('above the midpoint should mark drop-before, got: ' + over(35));
      if (over(55).indexOf('drop-after') < 0) throw new Error('below the midpoint should mark drop-after, got: ' + over(55));
      // clientX is deliberately absurd — if the maths still used X this would flip.
    });

    __check('dropping below a row moves the wall after it', () => {
      __seed(['A', 'B', 'C']);
      currentView = 'elevation'; currentElevIndex = 0;
      renderNavTabs();
      const rows = __rows();
      rows[2].getBoundingClientRect = () => ({ top: 60, bottom: 90, height: 30, left: 0, right: 120, width: 120 });
      handleTabDragStart({ currentTarget: rows[0], dataTransfer: { effectAllowed: '', setData() {} } });
      handleTabDrop({ preventDefault() {}, currentTarget: rows[2], clientY: 85, clientX: 9999 });
      const order = elevations.map(e => e.name).join('');
      if (order !== 'BCA') throw new Error('expected BCA after dragging A below C, got ' + order);
    });

    __check('dropping above a row moves the wall before it', () => {
      __seed(['A', 'B', 'C']);
      currentView = 'elevation'; currentElevIndex = 0;
      renderNavTabs();
      const rows = __rows();
      rows[2].getBoundingClientRect = () => ({ top: 60, bottom: 90, height: 30, left: 0, right: 120, width: 120 });
      handleTabDragStart({ currentTarget: rows[0], dataTransfer: { effectAllowed: '', setData() {} } });
      handleTabDrop({ preventDefault() {}, currentTarget: rows[2], clientY: 65, clientX: 9999 });
      const order = elevations.map(e => e.name).join('');
      if (order !== 'BAC') throw new Error('expected BAC after dragging A above C, got ' + order);
    });

    __check('the drag classes are cleared off .wall-tab rows, not the old .nav-tab selector', () => {
      const S = window.__appSrc;
      ['handleTabDragOver', 'handleTabDragEnd'].forEach(fn => {
        const i = S.indexOf('function ' + fn);
        const body = S.slice(i, i + 700);
        if (body.indexOf('.nav-tab.drop-before') >= 0) throw new Error(fn + ' still clears .nav-tab.drop-* — indicators would stick on the rail');
      });
    });

    // ── Deleting the wall you're on ──
    __check('EXACT BUG: deleting the active wall keeps you in the elevation view, not out on the Dashboard', () => {
      __seed(['A', 'B', 'C']);
      currentView = 'elevation'; currentElevIndex = 1;
      switchView('elevation', 1);
      deleteElevation(1, { stopPropagation() {} });
      if (currentView !== 'elevation') throw new Error('the exact bug: landed on ' + currentView + ' — the wall list lives in the elevation view now, so leaving it hides the list you were working in');
      if (elevations.length !== 2) throw new Error('expected 2 walls left, got ' + elevations.length);
    });

    __check('the delete control on a non-active wall does not also select it', () => {
      const S = window.__appSrc;
      const i = S.indexOf('function deleteElevation');
      const body = S.slice(i, i + 300);
      if (body.indexOf('stopPropagation') < 0) throw new Error('deleteElevation no longer stops propagation, so the row click behind the x would fire too');
    });
  `;

  try {
    window.__appSrc = src;
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
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
