// 19.69: a long value on the wallcovering / window film sheet stays right of its label.
//
// Found rebuilding Ford Admin Rouge V3: a timeline wall carries a wallcovering and nine
// acrylic text panels, all on one sheet in two columns. Their image codes are file names
// of 50-60 characters, and _specRow right-aligned every value without measuring it, so
// each one ran left over its own "Image Code" label and into the neighbouring column.
// Now it shrinks to FLAT_VAL_FS_MIN and then wraps; it is never shortened.
//
// Behavioural: the real sheet drawn with real jsPDF, every doc.text recorded.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;
  window.jspdf = { jsPDF: require(path.join(root, 'lib-jspdf.min.js')).jsPDF };

  const testBlock = `
    window.__testResults = [];
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    scheduleAutosave = () => {}; pushHistory = () => {}; _autosaveToldUser = true;
    _igNoCapture = true;   // no wall capture in jsdom; the spec block is what is under test
    const LONG = 'FFI.F.ADMIN ROUGE_TIMELINE WALL_TEXT_PANELS.001_2014-2017-P8.png';
    const row = (o) => Object.assign(_cloneData(dashDefaultData), { level: 0, location: 'TIMELINE WALL', m1A: false }, o);
    const wc = row({ id: 'ART.3', product: 'Wallcovering (EGD)', extW: 272, extH: 96.5, imageCode: 'FFI.F.ADMIN ROUGE_TIMELINE WALL.003.jpg' });
    const panel = row({ id: 'ART.3A', product: 'Window Film (WF)', material: 'Printed Text on Acrylic', extW: 25, extH: 13, bleed: 0, imageCode: LONG });
    dashProjectData = [wc, panel];

    const draw = async (members) => {
      const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: PAGE_FORMAT });
      const rec = [];
      const t0 = doc.text.bind(doc);
      doc.text = function (t, x, y, o) { rec.push({ t: String(t), x: x, y: y, fs: doc.getFontSize(), w: doc.getTextWidth(String(t)) }); return t0(t, x, y, o); };
      await _drawFlatGraphicSpecPage(doc, null, 1, {}, members[0], { PW: PAGE_FORMAT[0], PH: PAGE_FORMAT[1], members: members });
      return { doc, rec };
    };
    const labelW = (doc) => { doc.setFont(_font('spec'), 'bold'); doc.setFontSize(8.5); return doc.getTextWidth('Image Code'); };

    window.__run = (async () => {
      await __check('EXACT ASK: a long image code stays right of its label and inside its column', async () => {
        const { doc, rec } = await draw([wc, panel]);
        const labels = rec.filter(r => r.t === 'Image Code');
        if (labels.length !== 2) throw new Error('expected two Image Code rows, found ' + labels.length);
        const lab = labels.slice().sort((a, b) => b.x - a.x)[0];          // the panel's: the right-hand column
        const lw = labelW(doc);
        const parts = rec.filter(r => r.y >= lab.y - 0.01 && r.y < lab.y + 40 && LONG.indexOf(r.t) >= 0 && r.t.length >= 2 && r.x > lab.x - 400);
        if (!parts.length) throw new Error('the image code was not drawn');
        parts.forEach(p => { if (p.x < lab.x + lw) throw new Error('"' + p.t + '" starts at ' + p.x.toFixed(1) + ', over its label (ends ' + (lab.x + lw).toFixed(1) + ')'); });
        const leftLab = labels.slice().sort((a, b) => a.x - b.x)[0];
        const leftVals = rec.filter(r => Math.abs(r.y - leftLab.y) < 0.01 && r.x > leftLab.x && r.x < lab.x - 1);
        leftVals.forEach(v => { if (v.x + v.w > lab.x + 0.5) throw new Error('the left column runs into the right one: ' + v.t); });
      });
      await __check('the code is printed WHOLE (shrunk or wrapped, never cut short)', async () => {
        const { rec } = await draw([wc, panel]);
        const lab = rec.filter(r => r.t === 'Image Code').sort((a, b) => b.x - a.x)[0];
        const parts = rec.filter(r => r.y >= lab.y - 0.01 && r.y < lab.y + 40 && r.x > lab.x && LONG.indexOf(r.t) >= 0 && r.t.length >= 2).sort((a, b) => a.y - b.y);
        const joined = parts.map(p => p.t).join('');
        if (joined.replace(/ /g, '') !== LONG.replace(/ /g, '')) throw new Error('printed "' + parts.map(p => p.t).join(' | ') + '"');
        if (parts.some(p => p.fs < FLAT_VAL_FS_MIN - 0.01)) throw new Error('shrunk below the floor');
      });
      await __check('a value that fits is untouched: full size, one line', async () => {
        const { rec } = await draw([wc, panel]);
        const v = rec.find(r => r.t === 'Printed Text on Acrylic');
        if (!v) throw new Error('application not drawn');
        if (Math.abs(v.fs - 8.5) > 0.01) throw new Error('a short value was resized to ' + v.fs);
      });
      await __check('rows below a wrapped value move down, never overprint it', async () => {
        const { rec } = await draw([wc, panel]);
        const lab = rec.filter(r => r.t === 'Image Code').sort((a, b) => b.x - a.x)[0];
        const parts = rec.filter(r => r.x > lab.x && r.y >= lab.y - 0.01 && LONG.indexOf(r.t) >= 0 && r.t.length >= 2);
        const lastY = Math.max.apply(null, parts.map(p => p.y));
        const next = rec.filter(r => Math.abs(r.x - lab.x) < 0.01 && r.y > lab.y + 0.01).sort((a, b) => a.y - b.y)[0];
        if (!next) throw new Error('no row after the image code');
        if (next.y < lastY + 6) throw new Error('"' + next.t + '" at ' + next.y.toFixed(1) + ' overprints the wrapped code ending at ' + lastY.toFixed(1));
      });
    })();
  `;
  try {
    window.eval(src + '\n' + testBlock);
    await window.__run;
  } catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
