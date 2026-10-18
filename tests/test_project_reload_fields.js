// 19.30: TWO THINGS A SAVED PROJECT LOST ON REOPEN (found rebuilding the Ford V7 guide).
// 1. The document code, version and location (printed in every page footer) were never
//    written to the file: a reopened project lost "FEL - V7".
// 2. The deck's include ticks and plan order were seeded from the PREVIOUS project's
//    editorial, a few lines before the file's own was installed: a Final Spec deck
//    reopened with its story pages back on.
// Both are driven through the real save and open paths.
// No regex: patterns written into a test file here lose their backslashes.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const NL = String.fromCharCode(10);
const results = [];
const check = (label, fn) => { try { fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

check('the open path seeds the deck displays AFTER installing the file editorial', () => {
  const at = APP.indexOf('function _readProjectText(');
  const body = APP.slice(at, APP.indexOf(NL + 'function ', at + 10));
  const ed = body.indexOf('editorialContent = _editorialFromFile(data.editorial);');
  const inc = body.indexOf('seedDeckIncludeInputs();');
  const plan = body.indexOf('seedDeckPlanOrderInput();');
  if (ed < 0 || inc < 0 || plan < 0) throw new Error('landmarks missing');
  if (inc < ed || plan < ed) throw new Error('THE BUG: a seed runs before the file editorial is installed');
});

function inApp() {
  window.__reloadDone = (async () => {
    const out = [];
    const ok = async (label, fn) => { try { await fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
    const val = (id, v) => { const el = document.getElementById(id); if (v !== undefined) el.value = v; return el.value; };
    await ok('EXACT BUG: the document code, version and location survive save and reopen', () => {
      val('specPdfCode', 'FEL'); val('specPdfVersion', 'V7'); val('specPdfLocation', 'Dearborn, MI');
      const text = _projectFileText(_projectPayload());
      val('specPdfCode', 'XX'); val('specPdfVersion', 'V1'); val('specPdfLocation', 'Elsewhere');
      window._specPdfMeta = {};
      if (!_readProjectText(text)) throw new Error('did not open');
      const got = [val('specPdfCode'), val('specPdfVersion'), val('specPdfLocation')].join(' | ');
      if (got !== 'FEL | V7 | Dearborn, MI') throw new Error('reopened as ' + got);
      if (_deckFooterMeta().version !== 'V7') throw new Error('footer reads ' + _deckFooterMeta().version);
    });
    await ok('an older file with no document fields leaves them as they are', () => {
      val('specPdfCode', 'KEEP');
      const p = _projectPayload();
      delete p.globalMeta.docCode; delete p.globalMeta.docVersion; delete p.globalMeta.docLocation;
      _readProjectText(_projectFileText(p));
      if (val('specPdfCode') !== 'KEEP') throw new Error('an old file wiped the code');
    });
    await ok("EXACT BUG: a saved deck reopens with ITS include ticks, not the last deck's", () => {
      // The file: story pages off.
      editorialContent.includePages = { cover: true, timeline: false, understanding: false, narrative: false, strategy: false, frameRec: true, floorplanKey: true, spec: true, slogan: true, contacts: true };
      seedDeckIncludeInputs();
      const text = _projectFileText(_projectPayload());
      // The deck open before it: everything on.
      editorialContent.includePages = { cover: true, timeline: true, understanding: true, narrative: true, strategy: true, frameRec: true, floorplanKey: true, spec: true, slogan: true, contacts: true };
      seedDeckIncludeInputs();
      _readProjectText(text);
      const live = _dsInclude();
      ['timeline', 'understanding', 'narrative', 'strategy'].forEach(k => {
        if (live[k]) throw new Error('THE BUG: ' + k + ' came back on after reopening');
      });
      if (!live.spec || !live.cover) throw new Error('pages the file had on came back off');
    });
    return out;
  })();
}

const dom = new JSDOM(HTML, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s || '').length * 4 }) : (k in t ? t[k] : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
global.window = window; global.document = window.document; global.navigator = window.navigator;
const q = console.error, w = console.warn; console.error = () => {}; console.warn = () => {};
(async () => {
  try {
    window.eval(APP + NL + '_autosaveToldUser = true;' + NL + '(' + inApp.toString() + ')();');
    (await window.__reloadDone).forEach(r => results.push(r));
  } catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
  console.error = q; console.warn = w;
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  setTimeout(() => process.exit(fail ? 1 : 0), 50);
})();
