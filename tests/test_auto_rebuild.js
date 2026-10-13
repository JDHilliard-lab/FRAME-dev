// 18.39: Deck Studio previews rebuild by themselves after a change, elevations included,
// with a progress line in the rail, and the Build all previews button is gone.
// Asked: "Do you think we need the refresh button, or should we change it to autorefresh
// when a page gets an update, and just have a loading bar". Before, breaker thumbnails
// sat on their placeholder until someone pressed Build all, because only that button
// rendered elevations, behind a full-screen modal.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const testBlock = `
    window.__testResults = [];
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    window.__run = (async () => {
      _autosaveToldUser = true;
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      dashUnit = 'in'; elevUnit = 'in';
      dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.1A' }), Object.assign(_cloneData(dashDefaultData), { id: 'ART.1B' })];
      elevations = [{ id: 'e1', name: 'ART.1', w: 200, h: 108, frames: [{ id: 'ART.1A', letter: 'A', x: 20, y: 50, w: 24, h: 30, active: true }, { id: 'ART.1B', letter: 'B', x: 80, y: 50, w: 24, h: 30, active: true }] }];
      editorialContent.elevBreakers = true;
      switchView('deck'); try { _dsTab('pages'); } catch (e) {}
      await __check('EXACT ASK: there is no Build all previews button; a small rebuild icon stays for the rare reset', () => {
        if (document.getElementById('dsBuildAllBtn')) throw new Error('the button is still in the rail');
        if (!document.getElementById('dsRebuildAllBtn')) throw new Error('no rebuild icon');
      });
      // Count captures and watch for the modal while an edit settles.
      let captured = 0, modal = false;
      _captureElevWithGuides = async () => { captured++; const o = document.getElementById('elevPrimeOverlay'); if (o && o.style.display === 'flex') modal = true; return { dataUrl: 'data:image/jpeg;base64,AA', w: 10, h: 10 }; };
      const steps = [];
      const realProg = _dsPrimeProgress; _dsPrimeProgress = (n, t) => { steps.push(n + '/' + t); realProg(n, t); };
      for (const k in _igCapCache) delete _igCapCache[k];
      _dsRefresh();                         // what every deck edit ends with
      for (let i = 0; i < 60 && !(captured && !_elevPrimeActive); i++) await wait(50);
      await __check('an edit rebuilds by itself, elevations included, without being asked', () => {
        if (!captured) throw new Error('no elevation was rendered after the edit, so breaker previews stay placeholders');
      });
      await __check('...silently: no full-screen dialog appears by itself', () => {
        if (modal) throw new Error('the render modal opened on an automatic rebuild');
      });
      await __check('...and the rail says what it is doing', () => {
        if (!steps.length || steps[0] !== '0/1') throw new Error('no progress was reported: ' + steps.join(','));
      });
      await __check('a second sweep with nothing changed renders no elevation again', async () => {
        const before = captured;
        _dsBuildAllThumbs();
        await wait(100);
        if (captured !== before) throw new Error('an up-to-date wall was rendered again');
      });
      await __check('the progress line has a Stop that cancels', () => {
        _dsPrimeStep = { n: 0, total: 3 }; _dsUpdateThumbProgress();
        const s = document.querySelector('#dsThumbProgress [data-thumb-stop]');
        if (!s) throw new Error('no Stop link');
        let stopped = false; const real = _dsCancelBuildAll; _dsCancelBuildAll = () => { stopped = true; };
        s.onclick({ preventDefault: () => {} }); _dsCancelBuildAll = real; _dsPrimeStep = null;
        if (!stopped) throw new Error('Stop does not cancel');
      });
    })();
  `;
  try { window.eval(src + '\n' + testBlock); await window.__run; }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const all = window.__testResults || [];
  const failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  console.log('ALL PASSED (' + all.length + ')');
  process.exit(0);
})();
