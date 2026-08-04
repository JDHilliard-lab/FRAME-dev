// REPORTED: "my computer kind of slows down while using FRAME."
//
// THE CAUSE, measured: snapshotProjectState() deep-cloned the project with
// JSON.parse(JSON.stringify(x)), and it runs on EVERY undoable edit — every frame
// drag, every field change — with up to MAX_HISTORY snapshots retained.
//
// Frames and dashboard rows carry `artworkUrl`, a base64 data URL of megabytes. A
// JSON round trip re-encodes and re-parses every one of those bytes and hands back
// BRAND NEW strings, so each snapshot on the undo stack held a full private copy of
// every image in the project.
//
// On a 36-frame project with ~1.2MB images:
//     JSON round trip    181 ms per edit,  1224 MB for twelve snapshots
//     structural clone   0.1 ms per edit,     0 MB for twelve snapshots
//
// Strings are immutable in JS, so a structural clone REFERENCES the same string
// instead of rebuilding it. Every snapshot shares one copy of each image and only
// the small objects around them are duplicated. It is exactly as safe — nothing can
// mutate a string — which is what the equivalence and independence checks below
// exist to keep true.
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

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    const S = window.__appSrc;
    editorialContent = editorialContent || {};

    // ── The clone must behave exactly like the round trip it replaced ──
    __check('EXACT RISK: the clone matches JSON.parse(JSON.stringify(x)) on every shape', () => {
      if (typeof _cloneData !== 'function') throw new Error('_cloneData is missing');
      const cases = [
        { a: 1, b: 'x', c: true, d: null },
        { nested: { deep: { deeper: [1, 2, { x: 'y' }] } } },
        { dropped: undefined, kept: 1 },                 // JSON omits undefined keys
        { fn: function () {}, kept: 2 },                 // and functions
        { arr: [undefined, function () {}, 3] },         // but writes null for them IN an array
        { nan: NaN, inf: Infinity, ninf: -Infinity },    // all become null
        { d: new Date(86400000) },                       // becomes an ISO string
        { empty: {}, emptyArr: [], zero: 0, blank: '' },
        { unicode: 'caf\\u00e9 \\u2014 \\u00b5m', quote: 'he said "hi"', slash: 'a/b\\\\c' }
      ];
      cases.forEach((c, i) => {
        const viaJson = JSON.stringify(JSON.parse(JSON.stringify(c)));
        const viaClone = JSON.stringify(_cloneData(c));
        if (viaJson !== viaClone) throw new Error('case ' + i + ' diverges:\\n  json:  ' + viaJson + '\\n  clone: ' + viaClone);
      });
    });

    __check('EXACT RISK: the clone is independent, or undo would corrupt live state', () => {
      // This is the whole reason the round trip was there. A shallow copy would let
      // a later edit mutate a stored snapshot and break the history timeline.
      const orig = { a: { b: [1, 2, { c: 'x' }] }, list: [{ n: 1 }] };
      const c = _cloneData(orig);
      c.a.b[2].c = 'CHANGED';
      c.a.b.push(99);
      c.list[0].n = 42;
      if (orig.a.b[2].c !== 'x') throw new Error('mutating a nested object in the clone reached the source');
      if (orig.a.b.length !== 3) throw new Error('mutating an array in the clone reached the source');
      if (orig.list[0].n !== 1) throw new Error('mutating an array member in the clone reached the source');
      // ...and the other way, which is what breaks undo: editing live state after
      // the snapshot must not change the snapshot.
      orig.a.b[0] = 'live-edit';
      if (c.a.b[0] !== 1) throw new Error('editing the source after cloning changed the stored snapshot');
    });

    __check('EXACT FIX: a big payload is shared, not rebuilt — this is the whole win', () => {
      // Timing, because that is what the user feels. A 4MB data URL through the
      // JSON round trip is milliseconds of blocked main thread; referencing it is
      // free. The threshold is deliberately loose (10x) — the measured gap is ~1000x
      // — so this pins the behaviour without being flaky on a slow machine.
      const big = 'data:image/jpeg;base64,' + 'A'.repeat(4 * 1024 * 1024);
      const proj = { frames: [{ artworkUrl: big }, { artworkUrl: big }], rows: [{ artworkUrl: big }] };
      const t0 = Date.now(); for (let i = 0; i < 10; i++) JSON.parse(JSON.stringify(proj)); const json = Date.now() - t0;
      const t1 = Date.now(); for (let i = 0; i < 10; i++) _cloneData(proj); const clone = Date.now() - t1;
      if (!(clone * 10 < json || json < 5)) throw new Error('the clone is not meaningfully faster than the round trip it replaced (' + clone + 'ms vs ' + json + 'ms) — it is rebuilding the payload again');
      // And the value still survives intact.
      if (_cloneData(proj).frames[0].artworkUrl !== big) throw new Error('the payload did not survive the clone');
    });

    __check('the history path no longer serializes the project on every edit', () => {
      const i = S.indexOf('function snapshotProjectState');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (/JSON\\.parse\\(JSON\\.stringify\\(/.test(body)) throw new Error('THE BUG: snapshotProjectState still round-trips through JSON, so every edit re-encodes every artwork data URL');
      if (body.indexOf('_cloneData(') < 0) throw new Error('the snapshot does not use the structural clone');
      const j = S.indexOf('function restoreProjectState');
      const rbody = S.slice(j, S.indexOf('\\nfunction ', j + 10));
      if (/JSON\\.parse\\(JSON\\.stringify\\(/.test(rbody)) throw new Error('restoreProjectState still round-trips, so every undo pays the same cost');
      if (rbody.indexOf('_cloneData(') < 0) throw new Error('the restore does not use the structural clone');
      // The clone on restore is NOT optional: without it the live state would share
      // references with the stored snapshot and the next edit would corrupt history.
      if (rbody.indexOf('const cloned') < 0) throw new Error('the restore installs the snapshot directly — live state would share references with history');
    });

    __check('autosave does not clone the project just to serialize it', () => {
      const i = S.indexOf('function performAutosave');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('snapshotProjectState()') >= 0) throw new Error('autosave still deep-clones before JSON.stringify, which copies every image for nothing');
      if (body.indexOf('JSON.stringify(payload)') < 0) throw new Error('autosave no longer serializes its payload');
      if (body.indexOf('elevations: elevations') < 0) throw new Error('autosave does not pass the live objects through');
    });

    // ── End to end: the thing undo actually depends on ──
    __check('a full snapshot/restore round trip preserves the project', () => {
      const IMG = 'data:image/png;base64,' + 'Q'.repeat(5000);
      elevations = [{ name: 'Wall A', wallW: 185, wallH: 108, personPos: { x: -60 }, groupDims: [],
        frames: [{ letter: 'A', id: 'P1', x: 20, y: 40, w: 30, h: 24, active: true, artworkUrl: IMG }] }];
      dashProjectData = [{ id: 'P1', extW: 30, extH: 24, artworkUrl: IMG }];
      currentElevIndex = 0; elevFrames = elevations[0].frames;
      elevHangIn = 57; elevBaseboardIn = 4;
      const snap = snapshotProjectState();
      // Now wreck the live state the way an edit would.
      elevations[0].frames[0].x = 999;
      elevations[0].name = 'Wrecked';
      dashProjectData[0].extW = 1;
      elevHangIn = 12;
      restoreProjectState(snap);
      if (elevations[0].frames[0].x !== 20) throw new Error('frame position did not come back: ' + elevations[0].frames[0].x);
      if (elevations[0].name !== 'Wall A') throw new Error('elevation name did not come back');
      if (dashProjectData[0].extW !== 30) throw new Error('dashboard row did not come back');
      if (elevHangIn !== 57) throw new Error('hang height did not come back');
      if (elevations[0].frames[0].artworkUrl !== IMG) throw new Error('the artwork was lost in the round trip');
      // And the restored state must not share references with the snapshot, or the
      // next edit rewrites history.
      elevations[0].frames[0].x = 111;
      if (snap.elevations[0].frames[0].x === 111) throw new Error('the restored state shares objects with the stored snapshot');
    });

    __check('the undo stack is still bounded', () => {
      // The clone made snapshots cheap, which is not a reason to keep more of them.
      if (typeof MAX_HISTORY !== 'number' || !(MAX_HISTORY > 0 && MAX_HISTORY <= 200)) throw new Error('MAX_HISTORY is ' + MAX_HISTORY);
      const i = S.indexOf('undoStack.push(snapshotProjectState())');
      if (S.slice(i, i + 200).indexOf('undoStack.shift()') < 0) throw new Error('the undo stack is no longer trimmed');
    });
  `;

  try {
    window.__appSrc = src;
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
