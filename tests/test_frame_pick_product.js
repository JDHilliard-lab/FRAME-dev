// 19.03: the frame picks the product, both ways. Reported: "when I had a floater frame
// selected the product switches to Framed Canvas (Floater) but when I select a regular
// frame it does not switch the product back to framed art ... designers might miss this".
// applySwatchToRow only ever switched TO the floater; nothing switched back, so the item
// stayed a floater canvas (inset, no mats) under an ordinary moulding.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'measureText' ? () => ({ width: 0 }) : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } }); };
  window.fetch = () => Promise.reject(new Error('no network in test'));
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const FLOAT = { code: 'MICH-301-22', width: 1.5, faceWidth: 0.5, depth: 1.875, rabbet: 1.625 };
    const PLAIN = { code: 'MICH-32-22', width: 0.875, depth: 1.25, rabbet: 1 };
    const fresh = (product) => { dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.1', product: product || 'Framed Art' })]; dashSelectedRowIndex = 0; return dashProjectData[0]; };
    __check('a floater makes the item a floater canvas (as before)', () => {
      const r = fresh();
      applySwatchToRow(0, 'floaters', FLOAT, 'data:x');
      if (r.product !== 'Framed Canvas (Floater)') throw new Error(r.product);
      if (parseFloat(r.floaterInset) !== 0.75) throw new Error('inset ' + r.floaterInset);
    });
    __check('EXACT BUG: a regular frame picked on a floater item makes it Framed Art again', () => {
      const r = fresh();
      applySwatchToRow(0, 'floaters', FLOAT, 'data:x');
      applySwatchToRow(0, 'avant-garde', PLAIN, 'data:x');
      if (r.product !== 'Framed Art') throw new Error('still ' + r.product);
      if (r._faceWidth) throw new Error('kept the floater face width ' + r._faceWidth);
    });
    __check('a floater filed under any collection name counts (it has a lip width)', () => {
      const r = fresh();
      applySwatchToRow(0, 'cranbrook', FLOAT, 'data:x');
      if (r.product !== 'Framed Canvas (Floater)') throw new Error(r.product);
    });
    __check('a regular frame leaves every other product alone', () => {
      ['Framed Art (Shadow Box)', 'Frameless Canvas (Wrapped)', 'Sourced Object', 'Framed Art'].forEach(p => {
        const r = fresh(p);
        applySwatchToRow(0, 'avant-garde', PLAIN, 'data:x');
        if (r.product !== p) throw new Error(p + ' became ' + r.product);
      });
    });
    window.__p = (async () => {
      // The form path: the Product dropdown follows the row both ways.
      fresh();
      dashLocalLibrary = { mich: { floaters: [FLOAT], 'avant-garde': [PLAIN] } };
      _libEntryToDataUrl = () => Promise.resolve('data:image/png;base64,AAAA');
      const pick = async (c) => {
        const v = document.getElementById('libVendor'), cs = document.getElementById('libCollection');
        v.innerHTML = '<option value="mich">m</option>'; v.value = 'mich';
        cs.innerHTML = '<option value="' + c + '">' + c + '</option>'; cs.value = c;
        loadDashFromCustomLibrary(0);
        await new Promise(r => setTimeout(r, 20));
      };
      await pick('floaters');
      const a = document.getElementById('m_product').value;
      await pick('avant-garde');
      const b = document.getElementById('m_product').value;
      window.__testResults.push((a === 'Framed Canvas (Floater)' && b === 'Framed Art')
        ? { label: 'the Product dropdown follows the frame pick both ways', ok: true }
        : { label: 'the Product dropdown follows the frame pick both ways', ok: false, err: a + ' then ' + b });
    })().catch(e => window.__testResults.push({ label: 'form path ran', ok: false, err: e.message }));
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  await window.__p;
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
