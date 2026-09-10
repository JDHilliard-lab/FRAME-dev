// The modal shell. 22 overlays were hand-written into index.html as the same
// eight declarations, and they had drifted: five scrim darknesses (0.55 to 0.8)
// and two blur radii, so opening two modals in sequence flickered the page
// behind them. This pins the consolidation AND the two exceptions to it, both of
// which are load-bearing and neither of which is obvious from the markup.
//
// Deliberately plain Node with no jsdom: these are questions about the SOURCE,
// so reading the files directly avoids the window.eval template literal where
// every backslash has to be doubled.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const C = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

const results = [];
const check = (label, fn) => {
  try { fn(); results.push({ label, ok: true }); }
  catch (e) { results.push({ label, ok: false, err: e.message }); }
};

// Every <div id="…Modal"> in the file, with its opening tag.
const tags = H.match(/<div id="[a-zA-Z]*Modal"[^>]*>/g) || [];

check('the shell class exists and carries every part of the old inline string', () => {
  const m = /\.frame-modal \{([^}]*)\}/.exec(C);
  if (!m) throw new Error('.frame-modal rule not found in style.css');
  const body = m[1];
  ['position: fixed', 'inset: 0', 'var(--modal-scrim)', 'var(--z-modal)',
   'align-items: center', 'justify-content: center', 'backdrop-filter'].forEach(p => {
    if (body.indexOf(p) < 0) throw new Error('.frame-modal is missing ' + p);
  });
});

check('scrim and blur are each ONE token, not a value per modal', () => {
  ['--modal-scrim:', '--modal-blur:'].forEach(t => {
    if (C.indexOf(t) < 0) throw new Error('missing token ' + t);
  });
  // No modal may hand-write its own scrim again. That is how five darknesses
  // got here in the first place.
  const offenders = tags.filter(t => /background:\s*rgba/.test(t))
                        .map(t => (/id="([a-zA-Z]*)"/.exec(t) || [])[1]);
  if (offenders.length) throw new Error('modals still declaring their own scrim: ' + offenders.join(', '));
});

check('the five layers are named and strictly ordered', () => {
  // indexOf rather than a built regex: a backslash in a string that becomes a
  // RegExp has to survive both the JS string literal AND whatever wrote the file,
  // and it did not. Reading up to the semicolon needs no escapes at all.
  const z = n => {
    const key = '--z-modal' + n + ':';
    const at = C.indexOf(key);
    if (at < 0) throw new Error('missing token ' + key);
    const v = parseInt(C.slice(at + key.length, C.indexOf(';', at)).trim(), 10);
    if (!(v > 0)) throw new Error(key + ' is not a number');
    return v;
  };
  const base = z(''), over = z('-over'), nested = z('-nested');
  const prog = z('-progress'), alert = z('-alert');
  // Each step is a real decision about what may cover what. Alert is last
  // because it is how the app reports failure and must never be buried.
  if (!(base < over && over < nested && nested < prog && prog < alert)) {
    throw new Error('layer order broken: ' + [base, over, nested, prog, alert].join(' < '));
  }
});

check('no modal hand-writes the full overlay box any more', () => {
  const offenders = tags
    .filter(t => /position:\s*fixed/.test(t) && /id="([a-zA-Z]*)"/.test(t))
    // #alignModal is a guide layer wearing a modal's shape: pointer-events:none
    // and no scrim, so it is correctly NOT part of the shell.
    .filter(t => !/pointer-events:\s*none/.test(t))
    .map(t => (/id="([a-zA-Z]*)"/.exec(t) || [])[1]);
  if (offenders.length) throw new Error('still inline-positioned: ' + offenders.join(', '));
});

check('#alignModal is excluded, and still has no scrim', () => {
  const t = tags.find(x => x.indexOf('id="alignModal"') >= 0);
  if (!t) throw new Error('#alignModal not found');
  if (/frame-modal/.test(t)) throw new Error('#alignModal must not use the shell: it has no scrim and must not take clicks');
  if (!/pointer-events:\s*none/.test(t)) throw new Error('#alignModal lost pointer-events:none — it would now swallow clicks meant for the wall');
});

check('every shell modal keeps its own inline display, which is how JS opens it', () => {
  const bad = tags.filter(t => /frame-modal/.test(t) && !/display:\s*none/.test(t))
                  .map(t => (/id="([a-zA-Z]*)"/.exec(t) || [])[1]);
  if (bad.length) throw new Error('no inline display:none on ' + bad.join(', '));
});

check('#infoModal and #dsGenerateModal keep an INLINE z-index', () => {
  // Not decoration. showInfoModal() rewrites .style.zIndex at show time, and
  // test_img_intake reads .style.zIndex off both elements. Moving these two into
  // the class alone would leave .style.zIndex empty and break that file with an
  // error that points at the wrong place.
  ['infoModal', 'dsGenerateModal'].forEach(id => {
    const t = tags.find(x => x.indexOf('id="' + id + '"') >= 0);
    if (!t) throw new Error(id + ' not found');
    if (!/z-index:\s*\d+/.test(t)) throw new Error(id + ' lost its inline z-index');
  });
});

check('the alert layer really is above the progress layer in the markup too', () => {
  const zOf = id => {
    const t = tags.find(x => x.indexOf('id="' + id + '"') >= 0) || '';
    const m = /z-index:\s*(\d+)/.exec(t);
    return m ? parseInt(m[1], 10) : NaN;
  };
  const info = zOf('infoModal'), gen = zOf('dsGenerateModal');
  if (!(info > gen)) throw new Error('infoModal z ' + info + ' not above dsGenerateModal z ' + gen);
});

check('consolidation actually happened (not just a class bolted on)', () => {
  const shelled = tags.filter(t => /frame-modal/.test(t)).length;
  if (shelled < 20) throw new Error('only ' + shelled + ' modals use the shell; expected the full set');
});

const failed = results.filter(r => !r.ok);
results.forEach(r => { if (!r.ok) console.log('FAIL: ' + r.label + ' — ' + r.err); });
console.log('\n--- Summary ---');
if (failed.length) console.log(failed.length + ' FAILURES');
else console.log('ALL PASSED (' + results.length + ')');
