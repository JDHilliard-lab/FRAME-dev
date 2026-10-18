// 19.27: FA-BW74-2003. Its corner photo carried the vendor's PRODUCT HOLDER sticker (mirrored
// by the importer) and its swatch was a 31px slice cut to dodge the sticker, which tiled
// down the rail every 31px and read as a dotted pattern. The sticker is painted out and the
// swatch is a 220px seamless cut. Because picking a frame COPIES its swatch into the project,
// LIB_SWATCH_REV re-copies a corrected swatch into projects that already use the frame.
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

// Width and height from a JPEG's SOF marker.
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
const DIR = path.join(root, 'library', 'framerica', 'american-walnut');

check('EXACT BUG: the swatch is a tall seamless cut, not a 31px sliver that tiles as dots', () => {
  const s = jpegSize(path.join(DIR, 'FA-BW74-2003_2_d0.75_r0.5.jpg'));
  if (!s) throw new Error('swatch unreadable');
  if (s.w !== 150) throw new Error('swatch width ' + s.w + ' (outer edge left, 150 like the corner)');
  if (s.h < 150) throw new Error('swatch is only ' + s.h + 'px tall');
});
check('the corner photo keeps its 150px shape (the sticker was painted out, not cropped off)', () => {
  const c = jpegSize(path.join(DIR, 'corners', 'FA-BW74-2003.jpg'));
  if (!c || c.w !== 150 || c.h !== 319) throw new Error('corner is ' + JSON.stringify(c));
});
check('the upgrade runs whichever comes second: the library loading or a project opening', () => {
  const close = APP.slice(APP.indexOf('function _startScreenClose()'), APP.indexOf('async function openStartScreen()'));
  if (close.indexOf('_libSwatchUpgrade()') < 0) throw new Error('opening a project does not upgrade');
  if (APP.indexOf('_defaultFrameLoad();' + NL + '        _libSwatchUpgrade();') < 0) throw new Error('the library load does not upgrade');
});
check('a fresh pick records the revision; an uploaded swatch is marked as the designer’s', () => {
  if (APP.indexOf('if (LIB_SWATCH_REV[item.code]) row.swatchRev = LIB_SWATCH_REV[item.code]; else delete row.swatchRev;') < 0) throw new Error('applySwatchToRow does not record the revision');
  if (APP.indexOf('dashProjectData[dashSelectedRowIndex].swatchCustom = true;') < 0) throw new Error('an upload is not protected');
});

function inApp() {
  window.__libDone = (async () => {
    const out = [];
    const ok = async (label, fn) => { try { await fn(); out.push({ label, ok: true }); } catch (e) { out.push({ label, ok: false, err: e.message }); } };
    await ok('EXACT ASK: pieces already in the frame get the corrected swatch, walls included; others are left alone', async () => {
      const code = 'FA-BW74-2003';
      const mk = (id, extra) => Object.assign({ id, fType: 'image', fCode: code, swatchName: code, swatchDataUrl: 'data:old' }, extra || {});
      const stale = mk('ART.71');
      const custom = mk('ART.72', { swatchCustom: true });
      const fresh = mk('ART.73', { swatchRev: LIB_SWATCH_REV[code], swatchDataUrl: 'data:current' });
      const other = mk('ART.74', { fCode: 'MICH-1', swatchName: 'MICH-1' });
      const saved = dashProjectData.slice();
      dashProjectData.length = 0; [stale, custom, fresh, other].forEach(r => dashProjectData.push(r));
      const wall = { id: 'wX', frames: [{ id: 'ART.71', fCode: code, swatchDataUrl: 'data:old' }] };
      elevations.push(wall);
      const realBy = _fbByCode, realLoad = _libEntryToDataUrl;
      const byCode = {}; byCode[_fbNorm(code)] = { item: { code, file: 'x.jpg' } };
      let loads = 0;
      _fbByCode = () => byCode;
      _libEntryToDataUrl = () => { loads++; return Promise.resolve('data:new'); };
      try {
        _libSwatchUpgrade();
        await new Promise(r => setTimeout(r, 20));
        if (stale.swatchDataUrl !== 'data:new' || stale.swatchRev !== LIB_SWATCH_REV[code]) throw new Error('the stale piece was not upgraded');
        if (wall.frames[0].swatchDataUrl !== 'data:new') throw new Error('its wall copy kept the old swatch');
        if (custom.swatchDataUrl !== 'data:old') throw new Error('an uploaded swatch was replaced');
        if (fresh.swatchDataUrl !== 'data:current') throw new Error('an up-to-date piece was touched');
        if (other.swatchDataUrl !== 'data:old') throw new Error('a different frame was touched');
        _libSwatchUpgrade();
        await new Promise(r => setTimeout(r, 20));
        if (loads !== 1) throw new Error('upgraded again (' + loads + ' loads): it must happen once');
      } finally {
        _fbByCode = realBy; _libEntryToDataUrl = realLoad;
        elevations.pop();
        dashProjectData.length = 0; saved.forEach(r => dashProjectData.push(r));
      }
    });
    await ok('with the library not loaded yet, nothing breaks and nothing changes', async () => {
      const r = { id: 'ART.75', fType: 'image', fCode: 'FA-BW74-2003', swatchName: 'FA-BW74-2003', swatchDataUrl: 'data:old' };
      const saved = dashProjectData.slice(); dashProjectData.length = 0; dashProjectData.push(r);
      const realBy = _fbByCode; _fbByCode = () => ({});
      try { _libSwatchUpgrade(); await new Promise(res => setTimeout(res, 10)); }
      finally { _fbByCode = realBy; dashProjectData.length = 0; saved.forEach(x => dashProjectData.push(x)); }
      if (r.swatchDataUrl !== 'data:old' || r.swatchRev) throw new Error('changed without a library');
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
    (await window.__libDone).forEach(r => results.push(r));
  } catch (e) { results.push({ label: 'eval', ok: false, err: e.message }); }
  console.error = q; console.warn = w;
  let fail = 0;
  results.forEach(r => { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ': ' + r.err)); if (!r.ok) fail++; });
  console.log(NL + '--- Summary ---');
  console.log(fail ? fail + ' FAILED of ' + results.length : 'ALL PASSED (' + results.length + ')');
  setTimeout(() => process.exit(fail ? 1 : 0), 50);
})();
