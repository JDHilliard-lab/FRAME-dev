// NOTHING FLOATS (18.28). Reported: "+ Add Wall ... just becomes Elevation 9" with no
// code, and "the dashboard add item also needs an item code or assigned to a grouping,
// for example a 5 set salon hang and I get requested to add two more frames".
//  - + Add Wall asks which placement: a code not on a wall yet, or a new typed code.
//  - + Add Item asks the same: grow an existing code, or a new code of a category.
//  - growing a hung set adds the frames beside it without moving the arranged ones.
//  - duplicating EGD.1 gave ART.n.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const pending = [];
const check = (label, fn) => pending.push({ label, fn });

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + [
  '_autosaveToldUser = true;',
  'window.__fx = {',
  '  get rows() { return dashProjectData; }, set rows(v) { dashProjectData = v; },',
  '  get elevs() { return elevations; }, set elevs(v) { elevations = v; },',
  '  get ed() { return editorialContent; }, set ed(v) { editorialContent = v; },',
  '  get sel() { return dashSelectedRowIndex; }, set sel(v) { dashSelectedRowIndex = v; },',
  '  get cur() { return currentElevIndex; },',
  '  defaults: _editorialDefaults, add: _fpAddCodes, addWall: addNewElevationTab, addItem: addDashRow, dup: duplicateDashRow,',
  '  list: _placementList, place: _csvPlaceRows, csv: buildDashCSVString, imp: importDashCSV,',
  '};',
  'window.__hist = 0; var __ph = pushHistory; pushHistory = function () { window.__hist++; return __ph.apply(this, arguments); };',
].join(NL));
console.error = quiet;
const fx = window.__fx;
const doc = window.document;
window._toast = () => null;

const fresh = () => {
  fx.rows = []; fx.ed = fx.defaults();
  fx.elevs = [{ id: 'w1', name: 'Elevation 1', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [] }];
};
const dlg = () => doc.querySelector('.ask-placement');
const q = (k) => dlg().querySelector('[data-ask="' + k + '"]');
const pick = (k, v) => { const s = q(k); s.value = v; if (s.onchange) s.onchange(); if (s.oninput) s.oninput(); };
const tick = () => new Promise(r => setTimeout(r, 0));
const frameOf = (id) => { for (const e of fx.elevs) for (const f of (e.frames || [])) if (f.id === id) return { e, f }; return null; };

check('+ Add Wall makes NO wall until it is answered, and Cancel makes none', async () => {
  fresh(); fx.add('framed', 1);
  const n0 = fx.elevs.length;
  const p = fx.addWall();
  if (!dlg()) throw new Error('no placement dialog opened');
  if (fx.elevs.length !== n0) throw new Error('a wall was made before any answer');
  dlg().querySelector('[data-modal-close]').click();
  await p;
  if (fx.elevs.length !== n0) throw new Error('Cancel still made a wall');
  if (dlg()) throw new Error('dialog left open');
});

check('+ Add Wall offers ONLY codes that are not on a wall yet, and hangs the chosen one on a wall named after it', async () => {
  fresh(); fx.add('framed', 1); fx.add('framed', 3);
  fx.elevs.push({ id: 'w2', name: 'ART.1', wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [{ id: 'ART.1', x: 10, y: 50, w: 24, h: 30, active: true }] });
  const p = fx.addWall();
  const opts = Array.from(q('existing').options).map(o => o.value);
  if (opts.join() !== 'ART.2') throw new Error('offered ' + opts.join());
  q('go-existing').click();
  const wall = await p;
  if (!wall || wall.name.indexOf('ART.2') !== 0) throw new Error('wall not named after the code: ' + (wall && wall.name));
  const ids = wall.frames.map(f => f.id).sort().join();
  if (ids !== 'ART.2A,ART.2B,ART.2C') throw new Error('frames ' + ids);
  if (wall.id !== 'w1' || fx.elevs.length !== 2) throw new Error('the untouched Elevation 1 was not adopted');
  if (fx.cur !== fx.elevs.indexOf(wall)) throw new Error('did not open the new wall');
});

check('+ Add Wall with a NEW code mints it in the chosen category, with its set, on its own wall, as ONE undo step', async () => {
  fresh();
  fx.elevs[0].frames = [{ id: 'X', x: 0, y: 0, w: 1, h: 1, active: true }];   // not pristine
  window.__hist = 0;
  const p = fx.addWall();
  if (q('existing')) throw new Error('offered existing codes on an empty project');
  pick('cat', 'egd'); pick('set', 'n1');
  if (q('go-new').textContent.indexOf('EGD.1') < 0) throw new Error('button does not name the code: ' + q('go-new').textContent);
  q('go-new').click();
  const wall = await p;
  const r = fx.rows.find(x => x.id === 'EGD.1');
  if (!r || r.category !== 'egd' || r.product !== 'Wallcovering (EGD)') throw new Error('row not typed: ' + JSON.stringify(r && { c: r.category, p: r.product }));
  if (!wall || !wall.frames.some(f => f.id === 'EGD.1')) throw new Error('not hung');
  if (fx.elevs.length !== 2) throw new Error('walls: ' + fx.elevs.length);
  if (window.__hist !== 1) throw new Error('history entries: ' + window.__hist);
  // That wall is now on screen holding a wallcovering with no artwork: drawElevAll threw
  // "Cannot access unitSuffix before initialization" on exactly this.
  window.drawElevAll();
});

check('+ Add Wall with a salon preset sizes and lays out every piece', async () => {
  fresh();
  const p = fx.addWall();
  pick('cat', 'framed'); pick('set', 's5-anchor');
  q('go-new').click();
  const wall = await p;
  if (wall.frames.length !== 5) throw new Error('frames ' + wall.frames.length);
  if (!fx.rows.every(r => r.salonPreset === 's5-anchor')) throw new Error('preset not recorded');
});

check('EXACT ASK: + Add Item adds two frames to a hung 5 set, as ART.1F and ART.1G, beside it, moving nothing', async () => {
  fresh(); fx.add('framed', 5);
  const wall = { id: 'w2', name: 'ART.1 LOBBY', wallW: 300, wallH: 108, personPos: { x: -60 }, frames: [] };
  fx.rows.forEach((r, i) => wall.frames.push({ id: r.id, letter: 'ABCDE'[i], x: 20 + i * 30, y: 40 + i, w: 24, h: 30, active: true }));
  fx.elevs.push(wall);
  const before = JSON.stringify(wall.frames.map(f => [f.id, f.x, f.y]));
  fx.sel = 2;
  window.__hist = 0;
  const p = fx.addItem();
  if (q('existing').value !== 'ART.1') throw new Error('did not default to the selected row\'s code');
  pick('count', '2');
  if (q('go-existing').textContent !== 'Add 2 to ART.1') throw new Error('label ' + q('go-existing').textContent);
  q('go-existing').click();
  await p;
  const ids = fx.rows.map(r => r.id).join();
  if (ids !== 'ART.1A,ART.1B,ART.1C,ART.1D,ART.1E,ART.1F,ART.1G') throw new Error('rows ' + ids);
  if (JSON.stringify(wall.frames.slice(0, 5).map(f => [f.id, f.x, f.y])) !== before) throw new Error('arranged frames moved');
  const F = frameOf('ART.1F'), G = frameOf('ART.1G');
  if (!F || F.e !== wall || !G || G.e !== wall) throw new Error('new pieces not on the set\'s wall');
  if (!(F.f.x >= 20 + 4 * 30 + 24) || !(G.f.x > F.f.x)) throw new Error('not placed to the right: ' + F.f.x + ', ' + G.f.x);
  if (fx.rows[fx.sel].id !== 'ART.1F') throw new Error('selection not on the first new piece');
  if (window.__hist !== 1) throw new Error('history entries: ' + window.__hist);
});

check('growing a SINGLE makes it a set: ART.2 becomes ART.2A and the new piece is ART.2B', async () => {
  fresh(); fx.add('framed', 1); fx.add('framed', 1);
  fx.sel = 1;
  const p = fx.addItem();
  pick('existing', 'ART.2');
  q('go-existing').click();
  await p;
  const ids = fx.rows.map(r => r.id).join();
  if (ids !== 'ART.1,ART.2A,ART.2B') throw new Error('rows ' + ids);
});

check('+ Add Item with a new code takes the CATEGORY and its prefix (it used to be ART with no category)', async () => {
  fresh(); fx.add('framed', 1); fx.sel = 0;
  const p = fx.addItem();
  pick('cat', 'wf'); pick('set', 'n2');
  q('go-new').click();
  await p;
  const wf = fx.rows.filter(r => r.id.indexOf('WF.1') === 0);
  if (wf.length !== 2 || !wf.every(r => r.category === 'wf')) throw new Error('rows ' + fx.rows.map(r => r.id + ':' + r.category).join());
  if (fx.elevs.some(e => (e.frames || []).some(f => /^WF/.test(f.id)))) throw new Error('+ Add Item hung it on a wall; only + Add Wall should');
});

check('catalogue slots and options are never offered as a code to grow or hang', async () => {
  fresh(); fx.add('framed', 1);
  fx.rows.push({ id: 'ART.9A', category: 'framed' });
  fx.elevs.push({ id: 'm', name: 'ART.9', catalogueMaster: true, wallW: 185, wallH: 108, personPos: { x: -60 }, frames: [{ id: 'ART.9A', x: 0, y: 0, w: 1, h: 1, active: true }] });
  if (fx.list().some(g => g.key === 'ART.9')) throw new Error('catalogue placement listed');
});

check('duplicating EGD.1 gives EGD.2, not ART', () => {
  fresh(); fx.add('egd', 1); fx.sel = 0;
  fx.dup();
  if (!fx.rows.some(r => r.id === 'EGD.2')) throw new Error('rows ' + fx.rows.map(r => r.id).join());
});

check('IMPORT: a code with no PREFIX.number gets the next code of its type; a set stays one placement; real codes are untouched', () => {
  fresh();
  const rows = [
    { id: 'ART.1', product: 'Framed Art' },
    { id: 'Lobby-A', product: 'Framed Art' }, { id: 'Lobby-B', product: 'Framed Art' },
    { id: 'Feature wall', product: 'Wallcovering (EGD)' },
    { id: 'EGD.1', product: 'Wallcovering (EGD)' },
    { id: 'ART.7.2A', product: 'Framed Art' },   // a catalogue code: reserves ART.7, so the next is ART.8
  ];
  const res = fx.place(rows, []);
  const ids = rows.map(r => r.id + ':' + r.category).join();
  if (ids !== 'ART.1:framed,ART.8A:framed,ART.8B:framed,EGD.2:egd,EGD.1:egd,ART.7.2A:framed') throw new Error(ids);
  if (res.renamed.map(x => x.from + '>' + x.to).join() !== 'Lobby-A>ART.8A,Lobby-B>ART.8B,Feature wall>EGD.2') throw new Error(JSON.stringify(res.renamed));
});

check('IMPORT: the Category column wins over the product, by label or key', () => {
  fresh();
  const rows = [{ id: 'ART.1', product: 'Framed Art' }, { id: 'ART.2', product: 'Framed Art' }];
  fx.place(rows, ['Canvas', 'framed']);
  if (rows[0].category !== 'canvas' || rows[1].category !== 'framed') throw new Error(rows.map(r => r.category).join());
});

check('CSV ROUND TRIP: export writes Category as the LAST column, and an import puts each row back in it', async () => {
  fresh(); fx.add('canvas', 1); fx.add('egd', 1);
  const text = fx.csv();
  const header = text.split(String.fromCharCode(10)).find(l => l.indexOf('ITEM CODE') >= 0);
  if (header.slice(-',Arrangement,Category'.length) !== ',Arrangement,Category') throw new Error('header ends ' + header.slice(-40));
  fx.rows.forEach(r => { r.category = ''; });
  let said = null; window.showInfoModal = (t) => { said = t; };
  fx.imp({ target: { files: [new window.File([text], 'x.csv')], value: '' } });
  for (let i = 0; i < 50 && fx.rows.some(r => !r.category); i++) await new Promise(r => setTimeout(r, 10));
  const got = fx.rows.map(r => r.id + ':' + r.category).join();
  if (got !== 'ART.1:canvas,EGD.1:egd') throw new Error(got);
  if (said) throw new Error('a clean import raised a modal: ' + said);
});

check('IMPORT: renamed codes are SAID in a modal, since nobody asked for them', async () => {
  fresh(); fx.add('framed', 1);
  const text = fx.csv().replace('"ART.1"', '"Lobby piece"');
  let said = null; window.showInfoModal = (t) => { said = t; };
  fx.imp({ target: { files: [new window.File([text], 'x.csv')], value: '' } });
  for (let i = 0; i < 50 && !said; i++) await new Promise(r => setTimeout(r, 10));
  if (said !== 'Imported with new item codes') throw new Error('said ' + said);
  if (fx.rows[0].id !== 'ART.1') throw new Error('row ' + fx.rows[0].id);
});

check('no row creator mints a bare ART code any more: generateNextItemCode has no callers', () => {
  const n = APP.split('generateNextItemCode(').length - 1;
  if (n !== 1) throw new Error(n - 1 + ' caller(s) left');
});

check('the empty-wall hint and Help no longer promise a generic-frame button', () => {
  if (APP.indexOf('place a generic frame') >= 0) throw new Error('empty state still mentions it');
  if (APP.indexOf('drops a generic placeholder frame') >= 0) throw new Error('Help still mentions it');
});

(async () => {
  for (const c of pending) {
    try { await c.fn(); results.push({ label: c.label, ok: true }); }
    catch (e) { results.push({ label: c.label, ok: false, err: e.message }); }
    document.querySelectorAll('.ask-placement').forEach(n => n.remove());
  }
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : '  -> ' + r.err)); if (!r.ok) fail++; });
  console.log(fail ? fail + ' FAILURES' : 'ALL PASSED (' + results.length + ')');
  process.exit(fail ? 1 : 0);
})();
