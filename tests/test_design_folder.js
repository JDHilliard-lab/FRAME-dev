// DESIGN FOLDERS WERE MADE BY HAND, SO NO TWO PROJECTS MATCHED (20.81).
// Reworked before release: folders are made in the designer's LOCAL work folder, filed like
// Dropbox (00 ACTIVE PROJECTS / CLIENT / PROJECT), and Farmhand refuses to write into Dropbox.
//
// Dropbox has more than twenty different 01. Design layouts (02. POSTER, 06. SPECIFICATION,
// 01.PDF without the space, folders missing). Create design folder builds the house one
// from the job or client folder, saves the project into 06. FARMHAND and sends deck PDFs to
// 01. PDF. The risk it brings is writing over somebody's work in a shared Dropbox, so
// most of these checks are about what must NOT be touched.
//
// The fake directory handles below really store folders and files, so a check can see
// exactly what landed where.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });

// ── a fake folder tree ──────────────────────────────────────────────────
function makeDir(name) {
    const d = { kind: 'directory', name: name, dirs: {}, files: {}, perm: 'granted' };
    d.getDirectoryHandle = (n, o) => {
        if (d.perm !== 'granted') { const e = new Error('not allowed'); e.name = 'NotAllowedError'; return Promise.reject(e); }
        if (d.dirs[n]) return Promise.resolve(d.dirs[n]);
        if (!(o && o.create)) { const e = new Error('not found'); e.name = 'NotFoundError'; return Promise.reject(e); }
        d.dirs[n] = makeDir(n);
        return Promise.resolve(d.dirs[n]);
    };
    d.values = function () {
        const list = d.perm === 'granted' ? Object.keys(d.dirs).map(k => d.dirs[k]) : [];
        let i = 0;
        return { [Symbol.asyncIterator]() { return this; }, next() { return Promise.resolve(i < list.length ? { value: list[i++], done: false } : { value: undefined, done: true }); } };
    };
    d.getFileHandle = (n, o) => {
        if (!(n in d.files) && !(o && o.create)) { const e = new Error('not found'); e.name = 'NotFoundError'; return Promise.reject(e); }
        if (!(n in d.files)) d.files[n] = '';
        return Promise.resolve({
            kind: 'file', name: n,
            createWritable: () => {
                let buf = null;
                return Promise.resolve({
                    write: (t) => { buf = t; return Promise.resolve(); },
                    close: () => { d.files[n] = buf; return Promise.resolve(); },
                });
            },
        });
    };
    d.queryPermission = () => Promise.resolve(d.perm);
    d.requestPermission = () => { d.perm = 'granted'; return Promise.resolve('granted'); };
    return d;
}
const mk = (parent, ...names) => { let d = parent; names.forEach(n => { d = d.dirs[n] || (d.dirs[n] = makeDir(n)); }); return d; };
const count = (d) => Object.keys(d.dirs).reduce((t, k) => t + 1 + count(d.dirs[k]), 0);
const tree = (d, pre) => {
    let out = [];
    Object.keys(d.dirs).sort().forEach(k => { out.push((pre || '') + k + '/'); out = out.concat(tree(d.dirs[k], (pre || '') + k + '/')); });
    Object.keys(d.files).sort().forEach(k => out.push((pre || '') + k));
    return out;
};

let nextPick = null;   // the folder the "designer" picks; null = they cancel
let picks = 0;
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
window.showSaveFilePicker = () => Promise.reject(Object.assign(new Error('no'), { name: 'AbortError' }));
window.showOpenFilePicker = () => Promise.reject(Object.assign(new Error('no'), { name: 'AbortError' }));
window.showDirectoryPicker = () => {
    picks++;
    if (!nextPick) { const e = new Error('user cancelled'); e.name = 'AbortError'; return Promise.reject(e); }
    return Promise.resolve(nextPick);
};
const downloads = [];
window.URL.createObjectURL = () => 'blob:fake';
window.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
global.window = window; global.document = window.document; global.navigator = window.navigator;
window.JSZip = require(path.join(root, 'lib-jszip.min.js'));

const TAIL = [
    '_autosaveToldUser = true;',
    'window.__fx = {',
    '  setup: setupWorkFolder, create: createProjectFolder, dialog: openProjectFolderDialog, legacy: createDesignFolder,',
    '  deliver: _deliverPdf, looks: _jobCodeLooksRight, subs: DESIGN_SUBFOLDERS, top: PJF_TEMPLATE_TOP,',
    '  safe: _pjfSafeName, levels: _pjfParseLevels, isDropbox: _pjfLooksLikeDropbox, newForm: _startScreenNewForm,',
    '  get root() { return _pjfRoot; }, clearRoot: function () { _pjfRoot = null; _linkMemStore.clear(); },',
    '  get folder() { return _designFolder; }, clearFolder: function () { _designFolder = null; },',
    '  get fileName() { return _projectFileName; }, get handle() { return _projectFileHandle; },',
    '  setFile: _setProjectFile,',
    '  stub: function (o) {',
    '    if (o.showInfoModal) showInfoModal = o.showInfoModal;',
    '    if (o.toast) _toast = o.toast;',
    '    if (o.askYesNo) _askYesNo = o.askYesNo;',
    '  },',
    '};',
].join(NL);
window.eval(APP + NL + TAIL);
const fx = window.__fx;
const doc = window.document;

const infos = [], toasts = [], asked = [];
let answer = false;
fx.stub({
    showInfoModal: (t, b) => infos.push({ title: t || '', body: b || '' }),
    toast: (t, b) => { toasts.push({ title: t || '', body: b || '' }); return null; },
    askYesNo: (t, b) => { asked.push(t); return Promise.resolve(answer); },
});
const reset = () => { infos.length = 0; toasts.length = 0; asked.length = 0; downloads.length = 0; picks = 0; answer = false; nextPick = null; fx.clearFolder(); fx.clearRoot(); fx.setFile(null, ''); doc.querySelectorAll('.pjf-modal').forEach(m => m.remove()); };
const SUBS = ['00. ARCHIVE', '01. PDF', '02. INDESIGN', '03. LINKS', '04. SOURCE', '05. PRINT FILES', '06. FARMHAND'];
const TOP = ['00. BDQ', '01. Design', '02. Project Management', '03. Production & Procurement', '04. References', '05. Transfer Out'];
const readSaved = (text) => { const d = JSON.parse(text); return (d && d.type === 'frame-project-v7') ? d.project : d; };
const stamp = (() => { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); })();
const wait = async (fn, n) => { for (let i = 0; i < (n || 80) && !fn(); i++) await new Promise(r => setTimeout(r, 10)); };
// The studio Dropbox's 00 ACTIVE PROJECTS, as it looks from a browser.
const dropboxActive = () => { const d = makeDir('00 ACTIVE PROJECTS'); mk(d, '00. FILE TEMPLATE 2026 (DUPLICATE ONLY)'); mk(d, 'FORD MOTOR COMPANY (FORD)'); return d; };

// ── the template ────────────────────────────────────────────────────────
check('the folder lists are the house ones (Dropbox template + Post Haste + 06. FARMHAND)', async () => {
    if (JSON.stringify(Array.from(fx.subs)) !== JSON.stringify(SUBS)) throw new Error('DESIGN_SUBFOLDERS changed: ' + JSON.stringify(Array.from(fx.subs)) + '. Update the Dropbox and Post Haste templates too, then this list.');
    const top = Array.from(fx.top).map(n => n.name);
    if (JSON.stringify(top) !== JSON.stringify(TOP)) throw new Error('project template top level is ' + JSON.stringify(top));
});

check('levels: 01-04, single numbers and names', async () => {
    const t = (s, want) => { const got = JSON.stringify(Array.from(fx.levels(s))); if (got !== JSON.stringify(want)) throw new Error(JSON.stringify(s) + ' gave ' + got); };
    t('01-04', ['01', '02', '03', '04']); t('1 2 3', ['01', '02', '03']); t('01, 03, p1', ['01', '03', 'P1']); t('', []); t('2-1', ['01', '02']);
});

check('names Windows refuses are made safe (a colon, a slash, a trailing dot)', async () => {
    const t = (s, want) => { if (fx.safe(s) !== want) throw new Error(JSON.stringify(s) + ' -> ' + JSON.stringify(fx.safe(s))); };
    t('level 01:02', 'level 01-02'); t('A/B  Hotel.', 'A-B Hotel'); t('CON', 'CON_'); t('FORD - HUB PHASE 1B', 'FORD - HUB PHASE 1B');
});

// ── set up my work folder ───────────────────────────────────────────────
check('Set up: picking Documents with no 00 ACTIVE PROJECTS asks, then makes it and remembers it', async () => {
    reset();
    const docs = makeDir('Documents'); mk(docs, 'Old stuff');
    nextPick = docs; answer = true;
    const r = await fx.setup();
    if (r !== 'ok') throw new Error('got ' + r + ' ' + JSON.stringify(infos));
    if (!asked.length) throw new Error('it made the folder without asking');
    if (!docs.dirs['00 ACTIVE PROJECTS'] || fx.root !== docs.dirs['00 ACTIVE PROJECTS']) throw new Error('00 ACTIVE PROJECTS was not made and remembered');
});

check('Set up: a folder already holding "00. Active Projects" uses it; no second one is made', async () => {
    reset();
    const docs = makeDir('Documents'); const mine = mk(docs, '00. Active Projects');
    nextPick = docs;
    await fx.setup();
    if (Object.keys(docs.dirs).length !== 1) throw new Error('made a duplicate: ' + JSON.stringify(Object.keys(docs.dirs)));
    if (fx.root !== mine) throw new Error('did not use the existing folder');
    if (asked.length) throw new Error('asked when nothing needed making');
});

check('Set up: picking 00 ACTIVE PROJECTS itself uses it as is', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    nextPick = root;
    await fx.setup();
    if (fx.root !== root || Object.keys(root.dirs).length) throw new Error('did not take the picked folder as the work folder');
});

check('THE BIG ONE: the studio Dropbox is refused, picked at any level', async () => {
    for (const make of [
        () => dropboxActive(),
        () => { const t = makeDir('Dropbox-FarmboyDropbox'); mk(t, '00 ACTIVE PROJECTS'); return t; },
        () => { const t = makeDir('Team'); mk(t, '00 ACTIVE PROJECTS'); mk(t, '01 CREATIVE TEAM'); mk(t, '03 SALES'); return t; },
        () => { const t = makeDir('Team'); t.dirs['00 ACTIVE PROJECTS'] = dropboxActive(); return t; },
    ]) {
        reset();
        const picked = make(); const before = JSON.stringify(tree(picked));
        nextPick = picked; answer = true;
        const r = await fx.setup();
        if (r !== 'dropbox') throw new Error(picked.name + ': expected dropbox, got ' + r);
        if (JSON.stringify(tree(picked)) !== before) throw new Error(picked.name + ': something was made in Dropbox');
        if (fx.root) throw new Error(picked.name + ': Dropbox was remembered as the work folder');
    }
});

check('cancelling the picker makes nothing and remembers nothing', async () => {
    reset();
    const r = await fx.setup();
    if (r !== 'cancelled' || fx.root || infos.length) throw new Error('got ' + r);
});

// ── new project folder ──────────────────────────────────────────────────
check('New project: an existing client folder is reused and the project gets the whole template', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS'); const ford = mk(root, 'FORD MOTOR COMPANY (FORD)'); mk(ford, 'FORD - OLD JOB');
    const r = await fx.create({ root: root }, { client: 'Ford Motor Company (FORD)', project: 'FORD - HUB PHASE 1B', levels: '', split: false });
    if (r.result !== 'ok') throw new Error('got ' + r.result);
    if (Object.keys(root.dirs).length !== 1) throw new Error('made a second client folder: ' + JSON.stringify(Object.keys(root.dirs)));
    const p = ford.dirs['FORD - HUB PHASE 1B'];
    if (!p) throw new Error('no project folder');
    if (JSON.stringify(Object.keys(p.dirs).sort()) !== JSON.stringify(TOP)) throw new Error('top level is ' + JSON.stringify(Object.keys(p.dirs)));
    if (JSON.stringify(Object.keys(p.dirs['01. Design'].dirs).sort()) !== JSON.stringify(SUBS)) throw new Error('01. Design holds ' + JSON.stringify(Object.keys(p.dirs['01. Design'].dirs)));
    if (!p.dirs['02. Project Management'].dirs['01. Financials'].dirs['00. Quoting & Estimates'].dirs['Vendor Quotes']) throw new Error('nested template folders missing');
    if (!ford.dirs['FORD - OLD JOB']) throw new Error('another project was touched');
});

check('levels with ARTWORK and EGD: LEVEL 01..04, split folders, 06. FARMHAND left whole', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    await fx.create({ root: root }, { client: 'FORD MOTOR COMPANY (FORD)', project: 'FORD - HUB PHASE 1B', levels: '01-04', split: true });
    const d = root.dirs['FORD MOTOR COMPANY (FORD)'].dirs['FORD - HUB PHASE 1B'].dirs['01. Design'];
    if (JSON.stringify(Object.keys(d.dirs)) !== JSON.stringify(['LEVEL 01', 'LEVEL 02', 'LEVEL 03', 'LEVEL 04'])) throw new Error('01. Design holds ' + JSON.stringify(Object.keys(d.dirs)));
    const l3 = d.dirs['LEVEL 03'];
    if (JSON.stringify(Object.keys(l3.dirs['02. INDESIGN'].dirs)) !== '["ARTWORK","EGD"]') throw new Error('no ARTWORK/EGD in 02. INDESIGN');
    if (Object.keys(l3.dirs['06. FARMHAND'].dirs).length || Object.keys(l3.dirs['00. ARCHIVE'].dirs).length) throw new Error('06. FARMHAND or 00. ARCHIVE was split');
});

check('THE OTHER BIG ONE: an existing project keeps its files and oddly named folders; only what is missing is added', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    const proj = mk(root, 'FORD MOTOR COMPANY (FORD)', 'FORD - HUB PHASE 1B');
    const pdf = mk(proj, '01.Design', 'LEVEL 01', '01.PDF', 'ARTWORK');
    pdf.files['261118.FORD.V3.pdf'] = 'SENT';
    mk(proj, '01.Design', 'LEVEL 01', '02. POSTER');
    const before = count(proj);
    const r = await fx.create({ root: root }, { client: 'FORD MOTOR COMPANY (FORD)', project: 'FORD-HUB PHASE 1B', levels: '01, 02', split: true });
    if (Object.keys(root.dirs['FORD MOTOR COMPANY (FORD)'].dirs).length !== 1) throw new Error('made a near-duplicate project folder');
    if (proj.dirs['01. Design']) throw new Error('made "01. Design" beside the existing "01.Design"');
    const l1 = proj.dirs['01.Design'].dirs['LEVEL 01'];
    if (l1.dirs['01. PDF']) throw new Error('made "01. PDF" beside "01.PDF"');
    if (pdf.files['261118.FORD.V3.pdf'] !== 'SENT') throw new Error('a sent PDF was changed');
    if (!l1.dirs['02. POSTER']) throw new Error('an existing folder was removed');
    if (!proj.dirs['01.Design'].dirs['LEVEL 02'] || !l1.dirs['06. FARMHAND']) throw new Error('missing folders were not added');
    const there = r.rows.filter(x => x.status === 'there').length;
    if (there < 6) throw new Error('expected the existing folders reported as already there, got ' + there);
    if (count(proj) - before !== r.made) throw new Error('reported ' + r.made + ' new, made ' + (count(proj) - before));
});

check('a dry run (the preview) makes nothing', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    nextPick = null;
    const ov = fx.dialog({ project: 'Test Job' });
    await wait(() => doc.querySelector('.pjf-modal'));
    const m = doc.querySelector('.pjf-modal');
    m.querySelector('[name=client]').value = 'ACME (ACME)';
    m.querySelector('[name=client]').dispatchEvent(new window.Event('input'));
    await new Promise(r => setTimeout(r, 250));
    if (count(root)) throw new Error('the preview made folders');
    m.querySelector('.pjf-cancel').click();
    const res = await ov;
    if (res !== 'cancelled') throw new Error('cancel gave ' + res);
});

check('picked a CLIENT folder: the project goes inside it, no client folder nested in it', async () => {
    reset();
    const client = makeDir('MARRIOTT (MARR)');
    await fx.create({ client: client }, { client: '', project: 'MARR-DOWN-TORO-2026', levels: '', split: false });
    if (!client.dirs['MARR-DOWN-TORO-2026'] || Object.keys(client.dirs).length !== 1) throw new Error(JSON.stringify(tree(client)));
});

check('picked a PROJECT folder: only missing folders, nothing nested', async () => {
    reset();
    const proj = makeDir('FORD - HUB PHASE 1B'); mk(proj, '01. Design', 'LEVEL 03');
    await fx.create({ project: proj }, { levels: '04', split: false });
    if (proj.dirs['FORD - HUB PHASE 1B']) throw new Error('nested the project in itself');
    if (!proj.dirs['01. Design'].dirs['LEVEL 04'] || !proj.dirs['01. Design'].dirs['LEVEL 03']) throw new Error(JSON.stringify(tree(proj)));
    if (!proj.dirs['00. BDQ']) throw new Error('template top level not filled in');
});

check('new names are Windows-safe on disk', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    await fx.create({ root: root }, { client: 'A/B DESIGN (ABDE)', project: 'Hotel: Phase 2.', levels: '', split: false });
    if (!root.dirs['A-B DESIGN (ABDE)'] || !root.dirs['A-B DESIGN (ABDE)'].dirs['Hotel- Phase 2']) throw new Error(JSON.stringify(Object.keys(root.dirs)) + ' ' + JSON.stringify(tree(root)));
});

// ── saving into it ──────────────────────────────────────────────────────
check('save into LEVEL 01 · ARTWORK: project in LEVEL 01/06. FARMHAND, PDFs to LEVEL 01/01. PDF/ARTWORK', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    doc.getElementById('specPdfCode').value = 'FORD-OFFI-HUB-1492';
    await fx.create({ root: root }, { client: 'FORD MOTOR COMPANY (FORD)', project: 'FORD - HUB PHASE 1B', levels: '01-02', split: true, saveTo: { level: '01', kind: 'ARTWORK' } });
    const l1 = root.dirs['FORD MOTOR COMPANY (FORD)'].dirs['FORD - HUB PHASE 1B'].dirs['01. Design'].dirs['LEVEL 01'];
    const want = stamp + '.FORD-OFFI-HUB-1492.V1.json';
    const f = l1.dirs['06. FARMHAND'].files;
    if (!(want in f)) throw new Error('06. FARMHAND holds ' + JSON.stringify(Object.keys(f)));
    const data = readSaved(f[want]);
    if (data.type !== 'master-studio-v6' || !data.globalMeta) throw new Error('what was written is not a project');
    if (fx.fileName !== want || !fx.handle) throw new Error('Save is not bound to the new file');
    const d = { saved: [], output: () => 'PDFBYTES', save: (n) => d.saved.push(n) };
    const res = await fx.deliver(d, 'x.pdf');
    if (res !== 'folder' || l1.dirs['01. PDF'].dirs['ARTWORK'].files['x.pdf'] !== 'PDFBYTES') throw new Error('PDF did not go to LEVEL 01/01. PDF/ARTWORK');
});

check('a project file already there is kept when the designer says Keep it', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS');
    doc.getElementById('specPdfCode').value = 'BEYE-HILT-WAIL-2024';
    const name = stamp + '.BEYE-HILT-WAIL-2024.V1.json';
    const fh = mk(root, 'BEYER BROWN (BEYE)', 'GRAND WAILEA', '01. Design', '06. FARMHAND');
    fh.files[name] = 'SOMEONE ELSES WORK';
    answer = false;
    await fx.create({ root: root }, { client: 'BEYER BROWN (BEYE)', project: 'GRAND WAILEA', levels: '', split: false, saveTo: { level: null, kind: null } });
    if (!asked.length) throw new Error('it never asked before writing over the file');
    if (fh.files[name] !== 'SOMEONE ELSES WORK') throw new Error('THE BAD ONE: the existing project file was overwritten');
    if (fx.handle) throw new Error('Save was bound to a file the designer chose to keep');
});

check('a PDF already in 01. PDF is not replaced without asking', async () => {
    asked.length = 0; answer = false;
    const pdf = fx.folder.pdf;
    pdf.files['y.pdf'] = 'SENT TO CLIENT';
    const d = { saved: [], output: () => 'NEW', save: (n) => d.saved.push(n) };
    const res = await fx.deliver(d, 'y.pdf');
    if (!asked.length) throw new Error('never asked');
    if (pdf.files['y.pdf'] !== 'SENT TO CLIENT') throw new Error('the sent PDF was overwritten');
    if (res !== 'download' || d.saved.length !== 1) throw new Error('declining did not fall back to a download');
});

check('without a project folder, PDFs download exactly as before', async () => {
    reset();
    const d = { saved: [], output: () => 'P', save: (n) => d.saved.push(n) };
    const res = await fx.deliver(d, 'x.pdf');
    if (res !== 'download' || d.saved[0] !== 'x.pdf') throw new Error('expected the old download');
});

check('every deck PDF save goes through _deliverPdf', async () => {
    const i = APP.indexOf('async function _buildSpecPagePDF');
    const body = APP.slice(i, APP.indexOf('async function exportDashNativePNG'));
    if (body.indexOf('await _deliverPdf(doc, fname)') < 0) throw new Error('_buildSpecPagePDF saves around it');
    if (APP.indexOf('else await _deliverPdf(built.doc, built.fname)') < 0) throw new Error('exportSpecPagePDF saves around it');
    const p = APP.slice(APP.indexOf('function downloadSpecPdfPreview'), APP.indexOf('// ── Moodboard image manager'));
    if (p.indexOf('_deliverPdf(') < 0) throw new Error('the preview Download saves around it');
});

// ── the dialog ──────────────────────────────────────────────────────────
check('the dialog: remembered work folder, client prefilled from "Ford", preview, Create makes it', async () => {
    reset();
    const docs = makeDir('Documents'); nextPick = docs; answer = true;
    await fx.setup();
    const root = fx.root; mk(root, 'FORD MOTOR COMPANY (FORD)'); mk(root, 'MARRIOTT (MARR)');
    asked.length = 0;
    const p = fx.dialog({ project: 'FORD - HUB PHASE 1B', client: 'Ford' });
    await wait(() => { const m = doc.querySelector('.pjf-modal'); return m && m.querySelector('[name=client]').value; });
    const m = doc.querySelector('.pjf-modal');
    if (m.querySelector('[name=client]').value !== 'FORD MOTOR COMPANY (FORD)') throw new Error('client prefill is ' + JSON.stringify(m.querySelector('[name=client]').value));
    m.querySelector('[name=levels]').value = '01-04';
    m.querySelector('[name=levels]').dispatchEvent(new window.Event('input'));
    if (!m.querySelector('[name=split]').checked) throw new Error('typing levels should tick ARTWORK and EGD');
    await wait(() => m.querySelectorAll('.pjf-row').length > 20);
    const head = m.querySelector('.pjf-preview-head').textContent;
    if (!/already there/.test(head) || !/new folder/.test(head)) throw new Error('preview head: ' + head);
    if (count(root.dirs['FORD MOTOR COMPANY (FORD)'])) throw new Error('made folders before Create');
    const sel = m.querySelector('[name=saveTo]');
    if (sel.options[sel.selectedIndex].textContent !== 'LEVEL 01 \u00b7 ARTWORK') throw new Error('save choice defaults to ' + JSON.stringify(sel.options[sel.selectedIndex].textContent) + ', not the first level');
    m.querySelector('[name=saveTo]').value = '';
    m.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    const res = await p;
    if (res !== 'ok') throw new Error('Create gave ' + res + ' ' + JSON.stringify(infos));
    if (!root.dirs['FORD MOTOR COMPANY (FORD)'].dirs['FORD - HUB PHASE 1B'].dirs['01. Design'].dirs['LEVEL 04']) throw new Error('not made');
});

check('the dialog: a remembered folder needing a fresh OK shows Allow access and previews nothing until then', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS'); mk(root, 'FORD MOTOR COMPANY (FORD)');
    nextPick = root; await fx.setup();
    root.perm = 'prompt';
    const p = fx.dialog({ project: 'X', client: 'FORD MOTOR COMPANY (FORD)' });
    await wait(() => doc.querySelector('.pjf-allow'));
    const m = doc.querySelector('.pjf-modal');
    if (!m.querySelector('.pjf-allow')) throw new Error('no Allow access');
    if (!m.querySelector('.pjf-go').disabled) throw new Error('Create is live before access');
    m.querySelector('[name=client]').value = 'FORD MOTOR COMPANY (FORD)';
    m.querySelector('.pjf-allow').click();
    await wait(() => !m.querySelector('.pjf-go').disabled);
    if (m.querySelector('.pjf-go').disabled) throw new Error('Create still off after Allow access');
    m.querySelector('.pjf-cancel').click(); await p;
});

check('the old entry point opens the dialog and never writes straight away', async () => {
    reset();
    const root = makeDir('00 ACTIVE PROJECTS'); nextPick = root;
    const p = fx.legacy({});
    await wait(() => doc.querySelector('.pjf-modal'));
    if (!doc.querySelector('.pjf-modal')) throw new Error('no dialog');
    if (picks || count(root)) throw new Error('it picked or wrote without the dialog');
    doc.querySelector('.pjf-modal .pjf-cancel').click(); await p;
});

// ── no folder access (Safari, Firefox) ──────────────────────────────────
check('a browser without folder access gets a zip of the client/project template', async () => {
    reset();
    const keep = window.showDirectoryPicker;
    delete window.showDirectoryPicker;
    try {
        const p = fx.dialog({ project: 'FORD - HUB PHASE 1B' });
        await wait(() => doc.querySelector('.pjf-modal'));
        const m = doc.querySelector('.pjf-modal');
        m.querySelector('[name=client]').value = 'FORD MOTOR COMPANY (FORD)';
        m.querySelector('[name=client]').dispatchEvent(new window.Event('input'));
        await wait(() => !m.querySelector('.pjf-go').disabled);
        m.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        const res = await p;
        if (res !== 'zip') throw new Error('expected zip, got ' + res);
        if (downloads[0] !== 'FORD - HUB PHASE 1B folders.zip') throw new Error('downloaded ' + JSON.stringify(downloads));
    } finally { window.showDirectoryPicker = keep; }
});

// ── the start screen ────────────────────────────────────────────────────
check('New project: the job code fills the Project code and the tick opens the dialog, not the picker', async () => {
    reset();
    doc.getElementById('specPdfCode').value = '';
    const body = doc.createElement('div'), cards = doc.createElement('div');
    body.appendChild(cards); doc.body.appendChild(body);
    const form = fx.newForm(body, cards, null);
    form.elements.name.value = 'FORD - HUB PHASE 1B';
    form.elements.code.value = 'ford-offi-hub-1492';
    if (!form.elements.folder.checked) throw new Error('the folder box should start ticked');
    if (/dropbox/i.test(form.textContent) && !/not Dropbox/i.test(form.textContent)) throw new Error('the start screen still offers Dropbox');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await wait(() => doc.querySelector('.pjf-modal'));
    if (doc.getElementById('specPdfCode').value !== 'FORD-OFFI-HUB-1492') throw new Error('Project code is ' + JSON.stringify(doc.getElementById('specPdfCode').value));
    const m = doc.querySelector('.pjf-modal');
    if (!m) throw new Error('no dialog');
    if (picks) throw new Error('it opened the picker straight away');
    if (m.querySelector('[name=project]').value !== 'FORD - HUB PHASE 1B') throw new Error('project not prefilled');
    m.querySelector('.pjf-cancel').click();
});

check('unticking the box starts the project without the dialog', async () => {
    reset();
    const body = doc.createElement('div'), cards = doc.createElement('div');
    body.appendChild(cards); doc.body.appendChild(body);
    const form = fx.newForm(body, cards, null);
    form.elements.name.value = 'Keg Brandon';
    form.elements.folder.checked = false;
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 40));
    if (picks || doc.querySelector('.pjf-modal')) throw new Error('it asked for a folder anyway');
});

check('the job code hint accepts real codes and flags names', async () => {
    ['BEYE-HILT-WAIL-2024', 'ALGR-DELT-NORM-001', 'C+TC-INDE-BOST-2027', 'REDR-REDR-BRAN-XXXX', 'beye-hilt-wail-2024'].forEach(c => { if (!fx.looks(c)) throw new Error(c + ' was flagged'); });
    ['Keg Ajax', 'BEYE', 'BEYE-HILT-2024', ''].forEach(c => { if (fx.looks(c)) throw new Error(JSON.stringify(c) + ' passed'); });
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
