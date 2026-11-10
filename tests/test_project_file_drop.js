// DROPPING A PROJECT .JSON ON FRAME NAVIGATED THE TAB TO THE RAW FILE (20.39).
//
// Nothing listened for a file dropped outside the image drop zones, so the browser did
// its default: open the .json as a page, and the project on screen went with it. Now a
// window-level CAPTURE listener takes a drag that carries a .json, asks before throwing
// away unsaved work, and opens it through the same reader as Open Project, binding the
// dropped file's handle where the browser gives one so Save writes back to it.
// Every other drag (images on a drop zone, a folder on the library zone) must go by.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });
const settle = () => new Promise((r) => setTimeout(r, 30));

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;

const TAIL = [
    'window.__fx = {',
    '  get handle() { return _projectFileHandle; },',
    '  get fileName() { return _projectFileName; },',
    '  setFile: _setProjectFile, markDirty: markDirty, markClean: markClean,',
    '  stub: function (o) {',
    '    if (o.showConfirmModal) showConfirmModal = o.showConfirmModal;',
    '    if (o.showInfoModal) showInfoModal = o.showInfoModal;',
    '    if (o.readText) _readProjectText = o.readText;',
    '  },',
    '};',
].join(NL);
window.eval(APP + NL + TAIL);
const fx = window.__fx;
const doc = window.document;

const read = [];
const confirms = [];
let confirmAnswer = true;
let readOk = true;
fx.stub({
    readText: (t) => { read.push(t); return readOk; },
    showInfoModal: () => {},
    showConfirmModal: (t, b, y, n, onYes, onNo) => { confirms.push(t); if (confirmAnswer) onYes && onYes(); else onNo && onNo(); },
});
const reset = () => { read.length = 0; confirms.length = 0; confirmAnswer = true; readOk = true; fx.setFile(null, ''); fx.markClean(); };

// A file as a drag carries it: an item (kind, MIME type, getAsFile, maybe a handle).
function fakeFile(name, type, text) { return { name, type, text: () => Promise.resolve(text) }; }
function fakeDT(files, opts) {
    opts = opts || {};
    return {
        types: ['Files'],
        files,
        dropEffect: 'none',
        items: files.map(f => ({
            kind: 'file', type: f.type,
            getAsFile: () => f,
            getAsFileSystemHandle: opts.handles ? () => Promise.resolve({ kind: 'file', name: f.name }) : undefined,
        })),
    };
}
function fire(target, type, dt) {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    let reachedTarget = false;
    const spy = () => { reachedTarget = true; };
    target.addEventListener(type, spy);
    target.dispatchEvent(ev);
    target.removeEventListener(type, spy);
    return { prevented: ev.defaultPrevented, reachedTarget };
}

// ── THE BUG ─────────────────────────────────────────────────────────────
check('a .json dropped on the app is opened, not left to the browser', async () => {
    reset();
    const f = fakeFile('caesars.json', 'application/json', '{"type":"frame-project-v7"}');
    const r = fire(doc.body, 'drop', fakeDT([f]));
    if (!r.prevented) throw new Error('the drop was left to the browser, which navigates to the raw file');
    await settle();
    if (read.length !== 1 || read[0] !== '{"type":"frame-project-v7"}') throw new Error('the dropped file was not read as a project');
    if (fx.fileName !== 'caesars.json') throw new Error('the dropped file name was not recorded: ' + fx.fileName);
});

check('dragging a .json over the window is accepted (so the drop can happen)', async () => {
    const f = fakeFile('caesars.json', 'application/json', '{}');
    const r = fire(doc.body, 'dragover', fakeDT([f]));
    if (!r.prevented) throw new Error('dragover was not accepted, so the browser would refuse the drop');
    if (r.reachedTarget) throw new Error('the .json drag still reached the element underneath (an image zone would claim it)');
    if (!doc.getElementById('projectDropHint')) throw new Error('no drop hint was shown');
    await new Promise(r2 => setTimeout(r2, 250));
    if (doc.getElementById('projectDropHint')) throw new Error('the drop hint stayed up after the drag stopped');
});

check('in Chrome the dropped file is BOUND, so Save writes back to it', async () => {
    reset();
    const f = fakeFile('ford.json', 'application/json', '{}');
    fire(doc.body, 'drop', fakeDT([f], { handles: true }));
    await settle();
    if (!fx.handle || fx.handle.name !== 'ford.json') throw new Error('the drop did not bind the file handle');
});

check('unsaved work: it asks first, and Cancel leaves the project alone', async () => {
    reset();
    fx.markDirty();
    confirmAnswer = false;
    fire(doc.body, 'drop', fakeDT([fakeFile('other.json', 'application/json', '{}')]));
    await settle();
    if (confirms.length !== 1) throw new Error('no confirm before discarding unsaved changes');
    if (read.length) throw new Error('the file was opened even though the designer cancelled');
});

check('a file that is not a project leaves the binding as it was', async () => {
    reset();
    fx.setFile({ kind: 'file', name: 'keep.json' }, 'keep.json');
    readOk = false;
    fire(doc.body, 'drop', fakeDT([fakeFile('junk.json', 'application/json', 'nope')], { handles: true }));
    await settle();
    if (fx.fileName !== 'keep.json') throw new Error('a failed open rebound the project to ' + fx.fileName);
});

// ── and everything else goes by ─────────────────────────────────────────
check('an image drag is not touched (the image drop zones keep it)', async () => {
    reset();
    const img = fakeFile('art.png', 'image/png', '');
    const o = fire(doc.body, 'dragover', fakeDT([img]));
    if (o.prevented || !o.reachedTarget) throw new Error('the window listener took an image dragover');
    const d = fire(doc.body, 'drop', fakeDT([img]));
    if (d.prevented || !d.reachedTarget) throw new Error('the window listener took an image drop');
    await settle();
    if (read.length) throw new Error('an image was read as a project');
});

check('a folder drag (blank type) is not taken for a project', async () => {
    reset();
    const dir = fakeFile('Framerica', '', '');
    const o = fire(doc.body, 'dragover', fakeDT([dir]));
    if (o.prevented || !o.reachedTarget) throw new Error('a folder drag was intercepted; the library drop zone would never see it');
});

// ── run ─────────────────────────────────────────────────────────────────
(async () => {
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
