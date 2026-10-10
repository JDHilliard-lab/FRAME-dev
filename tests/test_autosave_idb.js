// THE AUTOSAVE NEVER WORKED ON A REAL PROJECT, AND SAID NOTHING.
//
// performAutosave used to JSON.stringify the whole project into ONE
// localStorage key. A real deck is far past what that holds: a 14-row,
// 4-wall project measured 22.9 MB against a ~5 MB origin budget, because the
// payload carries every artwork data URL. So the write threw on every project
// that mattered, the catch console.warn'd, and a designer had a safety net
// they did not have.
//
// The second half is worse than the first. A failed write leaves the PREVIOUS
// successful payload in the slot, so the next load offers to restore that one:
// a different project, behind a timestamp that reads as if it were this one.
//
// These checks drive the real functions against a fake IndexedDB that actually
// STORES and actually ENFORCES a budget, because a stub that swallows its
// arguments cannot notice it was handed rubbish. The store clones on put, the
// way a real one does, so "the live objects are safe to pass" is tested rather
// than asserted.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });
const LS_BUDGET = 5 * 1024 * 1024;   // what localStorage gave us, and the whole problem
const IDB_BUDGET = 400 * 1024 * 1024;

// ── A fake IndexedDB that behaves like one ──────────────────────────────
// Kept in plain Node rather than inside the eval'd string, so none of it has
// to survive the doubled-backslash rule that governs template-literal blocks.
function makeStore() {
  const state = { dbs: {}, quota: IDB_BUDGET, reads: {}, writes: 0, aborts: 0 };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const later = (fn) => setTimeout(fn, 0);
  // Size is accounted per RECORD, from the serialize that the clone already
  // does, rather than by re-serializing the whole database on every commit.
  // The first version did the latter: with a 6 MB fixture that is 12 MB of
  // JSON per transaction, which made deletes take long enough that checks
  // waiting a few milliseconds for one read as "the record survived".
  const sizeOf = (db) => {
    let n = 0;
    Object.keys(db.bytes).forEach((st) => Object.keys(db.bytes[st]).forEach((k) => { n += db.bytes[st][k]; }));
    return n;
  };

  function makeTx(db, names, mode) {
    const list = Array.isArray(names) ? names : [names];
    const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
    const ops = [];
    tx.objectStore = (n) => {
      if (list.indexOf(n) < 0) throw new Error('store ' + n + ' is not in this transaction');
      if (!db.stores[n]) throw new Error('no such store: ' + n);
      return {
        // A REAL put CLONES SYNCHRONOUSLY. That is the whole reason the writer
        // is allowed to hand over live objects, so the fake has to do it here
        // and not at commit time, or the test proves the opposite of the code.
        put(v) {
          const raw = JSON.stringify(v);
          const c = JSON.parse(raw);
          state.writes++;
          ops.push(() => { db.stores[n][c.id] = c; db.bytes[n][c.id] = raw.length; });
          return {};
        },
        delete(k) { ops.push(() => { delete db.stores[n][k]; delete db.bytes[n][k]; }); return {}; },
        get(k) {
          state.reads[n] = (state.reads[n] || 0) + 1;
          const rq = { onsuccess: null, onerror: null, result: undefined };
          later(() => {
            const hit = db.stores[n][k];
            rq.result = hit ? clone(hit) : undefined;
            if (rq.onsuccess) rq.onsuccess();
          });
          return rq;
        },
      };
    };
    later(() => {
      if (mode === 'readwrite') {
        const snapS = {}, snapB = {};
        list.forEach((n) => { snapS[n] = Object.assign({}, db.stores[n]); snapB[n] = Object.assign({}, db.bytes[n]); });
        const before = sizeOf(db);
        ops.forEach((op) => op());
        const after = sizeOf(db);
        // Only a transaction that GREW the database can be over budget. A real
        // store never refuses a delete for quota, and the first version of this
        // fake did - which made the stale-record cleanup look broken when it was
        // the fake that was wrong.
        if (after > state.quota && after > before) {
          // Rolled back, as a real abort leaves it. Shallow copies of the key
          // maps are enough: nothing mutates a stored record in place.
          list.forEach((n) => { db.stores[n] = snapS[n]; db.bytes[n] = snapB[n]; });
          state.aborts++;
          tx.error = { name: 'QuotaExceededError', message: 'quota' };
          if (tx.onabort) tx.onabort();
          return;
        }
      }
      if (tx.oncomplete) tx.oncomplete();
    });
    return tx;
  }

  const idb = {
    open(name) {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null };
      later(() => {
        let db = state.dbs[name];
        const fresh = !db;
        if (fresh) {
          db = {
            name, stores: {}, bytes: {},
            objectStoreNames: { contains: (n) => Object.prototype.hasOwnProperty.call(db.stores, n) },
            createObjectStore(n) { db.stores[n] = {}; db.bytes[n] = {}; return {}; },
            transaction(names, mode) { return makeTx(db, names, mode); },
          };
          state.dbs[name] = db;
        }
        if (fresh && req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
        req.result = db;
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
  state.idb = idb;
  state.recs = (dbName, store) => ((state.dbs[dbName] || { stores: {} }).stores[store] || {});
  return state;
}

// ── boot ────────────────────────────────────────────────────────────────
const store = makeStore();
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
window.indexedDB = store.idb;
global.window = window; global.document = window.document; global.navigator = window.navigator;

// One eval, so the checks below reach the module-scope let/const through the
// getters rather than through a second eval that would not see them.
const TAIL = [
  'window.__fx = {',
  '  performAutosave: performAutosave,',
  '  checkAutosaveOnLoad: checkAutosaveOnLoad,',
  '  clearAutosave: clearAutosave,',
  '  payload: _autosavePayload,',
  '  aGetMeta: _aGetMeta, aPut: _aPut,',
  '  get session() { return _autosaveSession; },',
  '  get failed() { return _autosaveFailed; },',
  '  get told() { return _autosaveToldUser; },',
  '  reset: function () {',
  '    _autosaveFailed = false; _autosaveToldUser = false;',
  '    if (_autosaveTimer) clearTimeout(_autosaveTimer);',
  '    _autosaveTimer = null; _autosavePending = false; _autosaveInFlight = false;',
  '  },',
  '  frameX: function () { return elevations[0].frames[0].x; },',
  '  setFrameX: function (v) { elevations[0].frames[0].x = v; },',
  '  setState: function (o) {',
  '    if (o.elevations) elevations = o.elevations;',
  '    if (o.dashProjectData) dashProjectData = o.dashProjectData;',
  '  },',
  '  stub: function (o) {',
  '    if (o.showInfoModal) showInfoModal = o.showInfoModal;',
  '    if (o.showConfirmModal) showConfirmModal = o.showConfirmModal;',
  '    if (o.restoreProjectState) restoreProjectState = o.restoreProjectState;',
  '    if (o.refreshAllViews) refreshAllViews = o.refreshAllViews;',
  '    if (o.pushHistory) pushHistory = o.pushHistory;',
  '  },',
  '};',
].join(NL);
window.eval(APP + NL + TAIL);
const fx = window.__fx;
const doc = window.document;

// A single 6 MB artwork is enough to put the payload past what localStorage
// could ever have taken, and keeps the fixture honest: the checks below would
// pass on a toy project whatever the storage did.
const BIG_ART = 'data:image/jpeg;base64,' + 'A'.repeat(6 * 1024 * 1024);
fx.setState({
  elevations: [{ name: 'Wall A', wallW: 185, wallH: 108, frames: [
    { letter: 'A', id: 'ART-1', x: 20, y: 40, w: 30, h: 24, active: true, artworkUrl: BIG_ART },
  ] }],
  dashProjectData: [{ id: 'ART-1', extW: 30, extH: 24, artworkUrl: BIG_ART }],
});

const infos = [];
fx.stub({ showInfoModal: (t, b) => infos.push({ title: t || '', body: b || '' }) });

// clearAutosave fires its delete and does not await it (two sync callers, and
// nothing downstream depends on the delete having landed), so anything checking
// that a record is gone has to let the transaction commit first.
const settle = () => new Promise((r) => setTimeout(r, 50));
// The restore prompt is the app's own dialog now rather than the native confirm,
// so answering it means stubbing that dialog. answerRestore takes the same shape
// the old stubs did - a function returning the designer's answer - and records
// what was ASKED, which the mustChoose check below reads.
let lastAsk = null;
const answerRestore = (fn) => fx.stub({ showConfirmModal: (t, b, y, n, onYes, onNo, opts) => {
  lastAsk = { title: t || '', body: b || '', yes: y || '', no: n || '', opts: opts || {} };
  if (fn()) { if (onYes) onYes(); } else if (onNo) onNo();
} });
const ameta = () => store.recs('frameAutosave', 'ameta');
const adata = () => store.recs('frameAutosave', 'adata');
const wipe = () => { delete store.dbs.frameAutosave; store.reads = {}; };

// ── the bug itself ──────────────────────────────────────────────────────
check('a project too big for localStorage now actually autosaves', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = IDB_BUDGET;

  // The fixture has to be past the old ceiling or this check proves nothing.
  const size = JSON.stringify(fx.payload()).length;
  if (size <= LS_BUDGET) throw new Error('fixture is only ' + size + ' bytes, under the localStorage budget this bug is about');

  await fx.performAutosave();
  if (fx.failed) throw new Error('autosave reported a failure on a project IndexedDB can hold');
  const rec = adata().current;
  if (!rec) throw new Error('nothing was stored');
  const el = rec.payload.data.elevations;
  if (!el || !el[0] || !el[0].frames[0]) throw new Error('the stored payload has no elevations');
  if (el[0].frames[0].artworkUrl !== BIG_ART) throw new Error('the artwork did not survive the round trip');
  if (rec.payload.data.dashProjectData[0].id !== 'ART-1') throw new Error('the dashboard rows did not survive the round trip');
});

check('the meta record is small, so the load path can ask before it reads', async () => {
  const m = ameta().current;
  if (!m) throw new Error('no meta record was written');
  if (JSON.stringify(m).length > 2048) throw new Error('the meta record carries the payload, so asking costs as much as reading');
  if (!m.timestamp || !m.session || !m.projName) throw new Error('the meta record cannot answer the restore prompt on its own');
});

check('the live objects are cloned at put time, so a later edit cannot rewrite the backup', async () => {
  // The writer deliberately hands over live references. That is only safe
  // because the clone is synchronous inside put(), so this drives it.
  const before = adata().current.payload.data.elevations[0].frames[0].x;
  if (fx.frameX() !== before) throw new Error('the fixture and the stored copy already disagree');
  fx.setFrameX(999);
  if (adata().current.payload.data.elevations[0].frames[0].x !== before) {
    throw new Error('the stored backup moved when the live project was edited');
  }
  fx.setFrameX(before);
});

// ── the silence, which is the part a designer pays for ──────────────────
check('a refused write is REPORTED, not swallowed', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = LS_BUDGET;           // back to what localStorage could hold
  await fx.performAutosave();
  if (!fx.failed) throw new Error('a refused write was recorded as a success');
  if (store.aborts < 1) throw new Error('the fake store never actually refused, so this proves nothing');
  if (infos.length !== 1) throw new Error('the user was told ' + infos.length + ' times, expected exactly once');
  const t = (infos[0].title + ' ' + infos[0].body).toLowerCase();
  if (t.indexOf('autosave') < 0) throw new Error('the notice does not say what stopped working');
  if (t.indexOf('save project') < 0) throw new Error('the notice does not say what to do instead');
});

check('and it is a MODAL, because a toast is for what is safe to miss', () => {
  // House rule: a toast carries acknowledgements and nudges, never a failure.
  // "Nothing is backing up your work" is the exact opposite of safe to miss.
  const S = APP;
  const i = S.indexOf('async function _autosaveFail');
  if (i < 0) throw new Error('missing _autosaveFail');
  const body = S.slice(i, S.indexOf('function clearAutosave'));
  if (body.indexOf('showInfoModal(') < 0) throw new Error('the failure no longer reaches a modal');
  if (body.indexOf('_toast(') >= 0) throw new Error('the failure was moved onto a toast, which is safe to miss');
});

check('the notice is once per session, but the indicator stays', async () => {
  const wasInfos = infos.length;
  await fx.performAutosave();
  await fx.performAutosave();
  if (infos.length !== wasInfos) throw new Error('every debounced write raised its own modal');
  if (!fx.failed) throw new Error('the failed state did not stick');
  const dot = doc.getElementById('unsavedIndicator');
  if (!dot) throw new Error('no indicator was created');
  if (dot.style.display === 'none') throw new Error('the indicator is hidden while autosave is broken');
  if (dot.style.background.indexOf('224, 0, 0') < 0 && dot.style.background.toLowerCase().indexOf('e00000') < 0) {
    throw new Error('the indicator is not showing the failed state, it reads as ordinary unsaved changes');
  }
  if ((dot.title || '').toLowerCase().indexOf('autosave') < 0) throw new Error('the indicator does not say what is wrong');
});

check('and it clears itself once a write lands again', async () => {
  store.quota = IDB_BUDGET;
  await fx.performAutosave();
  if (fx.failed) throw new Error('the failed state survived a successful write');
  const dot = doc.getElementById('unsavedIndicator');
  if ((dot.title || '').toLowerCase().indexOf('autosave') >= 0) throw new Error('the indicator still reads as broken');
});

// ── restoring the WRONG project, which is the expensive half ────────────
check('a failed write drops a stale autosave left by an EARLIER session', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = IDB_BUDGET;
  await fx.aPut(() => ({ type: 'master-studio-autosave-v1', timestamp: Date.now(), session: 'some-other-session', projName: 'A Different Job', data: {} }));
  if (!ameta().current) throw new Error('the fixture record was not stored');
  store.quota = 1;                   // now nothing this session writes can land
  await fx.performAutosave();
  await settle();
  if (ameta().current) throw new Error('the stale record survived, so the next load offers to restore a different project');
  if (adata().current) throw new Error('the stale payload survived alongside its cleared meta');
});

check('but a failed write KEEPS one from this session, which is real older work', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = IDB_BUDGET;
  await fx.aPut(() => ({ type: 'master-studio-autosave-v1', timestamp: Date.now(), session: fx.session, projName: 'This Job', data: { marker: 'keep me' } }));
  store.quota = 1;
  await fx.performAutosave();
  await settle();
  if (!ameta().current) throw new Error('a genuine older snapshot of the current work was thrown away');
  if (!adata().current || adata().current.payload.data.marker !== 'keep me') throw new Error('the kept record lost its payload');
});

// ── the load path ───────────────────────────────────────────────────────
check('the prompt is answered from meta alone - cancelling never reads the payload', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = IDB_BUDGET;
  await fx.performAutosave();
  store.reads = {};
  answerRestore(() => false);
  await fx.checkAutosaveOnLoad();
  // clearAutosave's delete is fire-and-forget, so wait for it rather than for a fixed
  // 50ms: under the parallel suite a busy machine missed that window now and then.
  for (let k = 0; k < 30 && ameta().current; k++) await settle();
  if (!store.reads.ameta) throw new Error('the load path did not read the meta record at all');
  if (store.reads.adata) throw new Error('the load path read the whole payload before asking, which is what boot used to pay for');
  if (ameta().current) throw new Error('declining the restore left the record in place');
});

check('accepting it restores the project that was actually stored', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = IDB_BUDGET;
  await fx.performAutosave();
  let got = null;
  fx.stub({
    restoreProjectState: (d) => { got = d; },
    refreshAllViews: () => {},
    pushHistory: () => {},
  });
  answerRestore(() => true);
  await fx.checkAutosaveOnLoad();
  if (!got) throw new Error('nothing was restored');
  if (!got.elevations || got.elevations[0].frames[0].artworkUrl !== BIG_ART) throw new Error('the restored project is not the one that was stored');
  if (!store.reads.adata) throw new Error('the payload was never read, so the restore came from somewhere else');
});

check('the restore prompt cannot be answered by Escape, because Cancel used to mean DISCARD', async () => {
  // It was the native confirm, where Cancel threw the backup away. Once every
  // dialog closes on Escape, a stray keypress at boot would have picked that answer
  // and deleted the only copy of the work. mustChoose takes Escape and the backdrop out.
  wipe(); fx.reset(); infos.length = 0; lastAsk = null;
  store.quota = IDB_BUDGET;
  await fx.performAutosave();
  fx.stub({ restoreProjectState: () => {}, refreshAllViews: () => {}, pushHistory: () => {} });
  answerRestore(() => true);
  await fx.checkAutosaveOnLoad();
  if (!lastAsk) throw new Error('the restore prompt no longer goes through the app dialog');
  if (!lastAsk.opts.mustChoose) throw new Error('THE BAD ONE: Escape or the backdrop can answer the restore prompt, and one of its answers deletes the backup');
  if (lastAsk.yes !== 'Restore' || lastAsk.no !== 'Discard') throw new Error('the buttons do not say what they do: ' + lastAsk.yes + ' / ' + lastAsk.no);
});

check('an autosave written by an older build is still offered, then cleared', async () => {
  wipe(); fx.reset(); infos.length = 0;
  let got = null;
  fx.stub({ restoreProjectState: (d) => { got = d; }, refreshAllViews: () => {}, pushHistory: () => {} });
  window.localStorage.setItem('frame-tool-autosave', JSON.stringify({
    type: 'master-studio-autosave-v1', timestamp: Date.now(), projName: 'Legacy Job',
    data: { elevations: [{ name: 'Old Wall', frames: [] }], dashProjectData: [] },
  }));
  answerRestore(() => true);
  await fx.checkAutosaveOnLoad();
  if (!got || !got.elevations || got.elevations[0].name !== 'Old Wall') throw new Error('a pre-IndexedDB autosave is no longer offered, so it is silently lost on upgrade');
  if (window.localStorage.getItem('frame-tool-autosave')) throw new Error('the legacy slot survived the restore and will be offered again next load');
});

check('a stale record past the age limit is cleared without asking', async () => {
  wipe(); fx.reset(); infos.length = 0;
  store.quota = IDB_BUDGET;
  const old = Date.now() - 9 * 24 * 60 * 60 * 1000;
  await fx.aPut(() => ({ type: 'master-studio-autosave-v1', timestamp: old, session: 'old', projName: 'Ancient', data: {} }));
  let asked = false;
  answerRestore(() => { asked = true; return true; });
  await fx.checkAutosaveOnLoad();
  await settle();
  if (asked) throw new Error('a nine-day-old autosave still prompted');
  if (ameta().current) throw new Error('the expired record was not cleared');
});

check('clearAutosave clears BOTH the live store and the legacy slot', async () => {
  wipe(); fx.reset();
  store.quota = IDB_BUDGET;
  await fx.performAutosave();
  window.localStorage.setItem('frame-tool-autosave', '{"type":"master-studio-autosave-v1"}');
  fx.clearAutosave();
  await settle();
  if (window.localStorage.getItem('frame-tool-autosave')) throw new Error('the legacy slot survived');
  if (ameta().current || adata().current) throw new Error('the IndexedDB record survived');
});

// ── the plumbing that keeps the above true ──────────────────────────────
check('only one write is in flight at a time', async () => {
  wipe(); fx.reset();
  store.quota = IDB_BUDGET;
  store.writes = 0;
  // Three requests overlapping: the first writes, the other two collapse into
  // one re-armed write rather than queueing three copies of a 23 MB project.
  const a = fx.performAutosave();
  const b = fx.performAutosave();
  const c = fx.performAutosave();
  await Promise.all([a, b, c]);
  if (store.writes > 2 * 2) throw new Error('overlapping requests each queued their own write: ' + store.writes + ' puts');
  if (store.writes < 2) throw new Error('no write happened at all');
});

check('autosave never writes localStorage again', () => {
  const i = APP.indexOf('async function performAutosave');
  if (i < 0) throw new Error('missing async function performAutosave');
  const body = APP.slice(i, APP.indexOf('function _autosaveOk'));
  if (body.indexOf('localStorage') >= 0) throw new Error('the writer touches localStorage again, which is the budget this bug came from');
});

check('performAutosave cannot reject, because 246 call sites arm it from a timer', async () => {
  wipe(); fx.reset();
  store.quota = IDB_BUDGET;
  window.indexedDB = { open() { throw new Error('storage is gone'); } };
  let threw = false;
  try { await fx.performAutosave(); } catch (e) { threw = true; }
  window.indexedDB = store.idb;
  if (threw) throw new Error('a storage failure escapes as an unhandled rejection');
});

// ── run ─────────────────────────────────────────────────────────────────
(async () => {
  // APP.JS ARMS ITS OWN checkAutosaveOnLoad AT BOOT (setTimeout 200). Left to
  // fire mid-run it reads whatever record the current check has just seeded,
  // gets a falsy confirm, and clears it - which made the stale-record check
  // pass or fail on timing. Let it run FIRST, against an empty store, where it
  // returns early and is then done for the session.
  answerRestore(() => false);
  await new Promise((r) => setTimeout(r, 400));
  if (Object.keys(store.recs('frameAutosave', 'ameta')).length) {
    throw new Error('the boot check did not run before the fixtures, so this suite is racing it');
  }
  let pass = 0;
  const failed = [];
  for (const r of results) {
    try { await r.fn(); console.log('OK:   ' + r.label); pass++; }
    catch (e) { console.log('FAIL: ' + r.label + ' -> ' + e.message); failed.push(r.label); }
  }
  console.log('');
  console.log('--- Summary ---');
  if (failed.length) { console.log('FAILED (' + failed.length + ' of ' + results.length + ')'); process.exitCode = 1; }
  else console.log('ALL PASSED (' + pass + ')');
})();
