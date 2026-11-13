// THE STUDIO'S CODING CHEAT SHEET WAS A PDF ON A SHARED DRIVE.
//
// Designers (and the deck agent) name crops, plans and elevations and code
// artwork by the Coding Cheat Sheet (V13), the Spec Sheet example and CRE-104.
// None of it was inside Farmhand. 20.53 puts it in Help > Reference as its own
// section. These checks keep the parts people look up most from going missing.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const NL = String.fromCharCode(10);

const results = [];
const check = (label, fn) => results.push({ label, fn });

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => ({});
window.fetch = () => Promise.reject(new Error('no network in test'));
global.window = window; global.document = window.document; global.navigator = window.navigator;
const quiet = console.error; console.error = () => {};
window.eval(APP + NL + 'window.__fx = { help: HELP_REFERENCE_DATA, populate: populateHelpReference, section: renderHelpRefSection, version: APP_VERSION };');
const fx = window.__fx;
const doc = window.document;

const sec = () => fx.help.find((s) => s.id === 'coding');
const text = () => { const s = sec(); return (s.intro || '') + ' ' + s.entries.map((e) => e.title + ' ' + e.body).join(' '); };

check('EXACT GAP: Help has a Coding cheat sheet section', async () => {
    const s = sec();
    if (!s) throw new Error('no coding section in HELP_REFERENCE_DATA');
    if (s.title !== 'Coding cheat sheet') throw new Error('section title is ' + s.title);
});

check('it says how to name supporting files', async () => {
    const t = text();
    ['PLAN</strong>.YYMMDD', 'ELEV</strong>.YYMMDD', 'REND</strong>.YYMMDD', 'MOCK</strong>.YYMMDD', 'FINISH</strong>.(GR / PA / COR)', 'FRAME</strong>.FRAME CODE', 'REF.SUB', 'REF.FRAME'].forEach((w) => {
        if (t.indexOf(w) < 0) throw new Error('missing ' + w);
    });
    if (t.indexOf('never sits next to artwork being proposed') < 0) throw new Error('the REF rule is missing');
});

check('every art type and every public domain source is listed', async () => {
    const t = text();
    ['Fine Art Original', 'Fine Art Commission', 'Single Use License', 'Stock Asset', 'Sourced Object', 'Farmboy Licensed Artwork',
        'Environmental Graphic Design', 'Farmboy Fabricated Art Object', 'Design for Hire'].forEach((w) => {
        if (t.indexOf(w) < 0) throw new Error('art type missing: ' + w);
    });
    ['FCH', 'FJP', 'FLI', 'FMA', 'FNA', 'FNY', 'FPX', 'FWI', 'FUN'].forEach((c) => {
        if (t.indexOf('<td>' + c + '</td>') < 0) throw new Error('PD source missing: ' + c);
    });
    if (t.indexOf('must be modified') < 0) throw new Error('the modify-public-domain rule is missing');
});

check('it renders: nav button, tables, no em dashes, no template breakers', async () => {
    fx.populate();
    const btn = Array.from(doc.querySelectorAll('#helpRefNav button')).find((b) => b.dataset.section === 'coding');
    if (!btn) throw new Error('no nav button for the section');
    fx.section('coding');
    const c = doc.getElementById('helpRefContent');
    if (c.querySelectorAll('table.help-table').length < 5) throw new Error('tables did not render');
    if (c.querySelectorAll('table.help-table tr').length < 40) throw new Error('table rows missing');
    if (text().indexOf('—') >= 0) throw new Error('em dash in the copy');
    if (CSS.indexOf('.help-ref-content .help-table') < 0) throw new Error('no style for help tables');
    // th, td are nowrap app-wide (dashboard grid); the art types table ran off the panel until its cells wrapped.
    const rule = CSS.slice(CSS.indexOf('.help-ref-content .help-table th, .help-ref-content .help-table td'));
    if (rule.slice(0, rule.indexOf('}')).indexOf('white-space: normal') < 0) throw new Error('help table cells inherit nowrap and overflow the panel');
});

check('What’s New mentions it', async () => {
    const v = fx.help.find((s) => s.id === 'version');
    const wn = v.entries.find((e) => /what.s new/i.test(e.title));
    if (wn.body.indexOf('Coding cheat sheet') < 0) throw new Error('What’s New does not mention the section');
});

(async () => {
    let fail = 0;
    for (const r of results) {
        try { await r.fn(); console.log('  PASS  ' + r.label); }
        catch (e) { fail++; console.log('  FAIL  ' + r.label + '\n        ' + e.message); }
    }
    console.error = quiet;
    console.log(fail ? 'FAILED ' + fail : 'ALL PASSED (' + results.length + ')');
    process.exit(fail ? 1 : 0);
})();
