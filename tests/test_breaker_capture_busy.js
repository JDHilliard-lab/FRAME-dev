// 20.77: a breaker page whose wall capture loses the race to one already running waits for
// it instead of printing "Elevation capture failed". Nothing had failed: the one elevation
// view was busy (the rail drawing its thumbnails when the breaker was ticked on).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  window.eval(src + `
    _autosaveToldUser = true; scheduleAutosave = () => {};
    window.__t = (async () => {
      const out = [];
      elevations = [{ name: 'LOBBY', frames: [] }];
      _elevPrimeActive = false; _igNoCapture = false;
      let calls = 0;
      _captureElevZoomed = async () => { calls++; return _elevCapInFlight ? null : { dataUrl: 'data:image/jpeg;base64,AAAA', vec: { w: 1, h: 1 } }; };
      // Another capture holds the wall for 400 ms.
      Object.keys(_igCapCache).forEach(k => delete _igCapCache[k]); _elevCapInFlight = true; setTimeout(() => { _elevCapInFlight = false; }, 400);
      const r1 = await _igElevCapture(0, 1);
      out.push({ id: 'waits for the capture in flight and gets the wall', ok: !!(r1.cap && r1.cap.dataUrl) && !r1.failed, d: JSON.stringify({ failed: r1.failed, cap: !!r1.cap, calls: calls }) });
      // Busy the whole time: not a failure, the page says Updating and draws again.
      Object.keys(_igCapCache).forEach(k => delete _igCapCache[k]); _elevCapInFlight = true;
      const r2 = await _igElevCapture(0, 2);
      _elevCapInFlight = false;
      out.push({ id: 'still busy is not reported as a failed capture', ok: !r2.failed, d: JSON.stringify({ failed: r2.failed }) });
      // A real failure (free wall, capture returns nothing) still says so.
      Object.keys(_igCapCache).forEach(k => delete _igCapCache[k]); _captureElevZoomed = async () => null;
      const r3 = await _igElevCapture(0, 3);
      out.push({ id: 'a real failure is still reported', ok: !!r3.failed });
      return out;
    })();`);
  const res = await window.__t;
  res.forEach(r => console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.id + (r.ok ? '' : ' ' + (r.d || ''))));
  const bad = res.filter(r => !r.ok);
  console.log('\n--- Summary ---');
  console.log(bad.length ? bad.length + ' FAILURES' : 'ALL PASSED (' + res.length + ')');
  process.exit(bad.length ? 1 : 0);
})();
