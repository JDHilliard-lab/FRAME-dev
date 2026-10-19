// 19.37: THE FIGURE PRINTS IN FRONT OF THE CONTEXT, AND A MEASURE LINE TO A BLOCK GETS
// ITS LEADER.
//
// Reported on the Ford SLC install guide:
//   1. On screen the scale figure (#person-wrap, z 10) stands in front of the context
//      blocks (#context-layer, z 8), but in the PDF a whiteboard and the base cabinets
//      covered it: exportElevSVG pushed the figure into the back layer BEFORE the
//      context blocks were appended after the frames.
//   2. ART.17: a measure line from the frame to the counter's corner drew no dashed
//      connector down to the counter. Leaders were drawn for frame anchors only.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};

  window.eval(src + `
    _autosaveToldUser = true; scheduleAutosave = () => {}; pushHistory = () => {};
    window.__setup = () => {
      elevUnit = 'in'; dashUnit = 'in';
      elevations = [{ id: 'w17', name: 'ART.17 | Wellness Room 143', wallW: 139, wallH: 120, personPos: { x: 86.5, placed: true },
        frames: [{ id: 'ART.17', letter: 'A', x: 58.5, y: 43, w: 22, h: 30, active: true, dimTo: [], fType: 'color', fColor: '#111111', fW: 0.875, m1A: false,
          distToggles: { ceiling: false, floor: false, left: false, right: false } }],
        contextBlocks: [{ id: 'cxCounter', shape: 'rect', fill: 'plain', x: 110, y: 0, w: 29, h: 37, label: 'COUNTER', view: 'front' }],
        customLines: [] }];
      dashProjectData = [Object.assign(_cloneData(dashDefaultData), { id: 'ART.17', extW: 22, extH: 30 })];
      currentElevIndex = 0; elevFrames = elevations[0].frames; elevPersonPos = elevations[0].personPos; elevScale = 4;
      dimVisibility.customLines = true;
    };
    window.__exportOrder = async () => {
      window.__setup();
      // jsdom has no layout, and the exporter skips anything zero-sized. A fixed box per
      // element is enough: this check is about the ORDER the layers are emitted in.
      const _gbcr = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 }; };
      try { _elevLoadWall(0); } catch (e) {}
      try { drawElevAll(); } catch (e) {}
      const pw = document.getElementById('person-wrap'); if (pw) pw.style.display = 'block';
      _getPersonSvgDataUrl = async () => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 13"><path d="M0 0h7v13H0z"/></svg>');
      let out; try { out = await exportElevSVG({ returnBlob: true }); } finally { Element.prototype.getBoundingClientRect = _gbcr; }
      const svg = (out && (out.picSvg || out.svg)) || '';
      return { person: svg.indexOf('viewBox="0 0 7 13"'), ctx: svg.indexOf('COUNTER') >= 0 ? svg.indexOf('COUNTER') : svg.indexOf('fill="' + CONTEXT_FILL + '"'), len: svg.length, keys: out ? Object.keys(out) : [] };
    };
    window.__leaders = () => {
      window.__setup();
      // Frame top-right corner to the counter's top-left corner: the line sits at the
      // frame's top (73"), well above the counter (0..37"), so the counter end needs a leader.
      elevations[0].customLines = [{ id: 'L1', type: 'h', a: { ref: 'frame', letter: 'A', xc: 'x1', yc: 'y1' }, b: { ref: 'context', cid: 'cxCounter', xc: 'x0', yc: 'y1' } }];
      renderCustomLines();
      const layer = document.getElementById('custom-lines-layer');
      const leaders = [...layer.querySelectorAll('.dim-leader')].map(el => ({ left: parseFloat(el.style.left), bottom: parseFloat(el.style.bottom), height: parseFloat(el.style.height) }));
      return { leaders, scale: elevScale };
    };
  `);
  console.error = quiet;

  const results = [];
  const check = async (label, fn) => { try { await fn(); results.push({ label, ok: true }); } catch (e) { results.push({ label, ok: false, err: e.message }); } };

  await check('EXACT BUG: in the exported drawing the figure comes AFTER (in front of) the context blocks', async () => {
    const r = await window.__exportOrder();
    if (r.person < 0) throw new Error('the figure was not exported at all (' + r.len + ' chars, keys ' + r.keys + ')');
    if (r.ctx < 0) throw new Error('the context block was not exported');
    if (!(r.person > r.ctx)) throw new Error('figure at ' + r.person + ' paints before the block at ' + r.ctx + ', so the block covers it');
  });

  await check('EXACT BUG: a measure line to a counter corner gets a leader down to the counter', async () => {
    const r = window.__leaders();
    // The counter's top edge is 37"; its left edge 110". A vertical leader at x=110 from the line down to 37".
    const toCounter = r.leaders.find(l => Math.abs(l.left - 110 * r.scale) < 0.6 && Math.abs(l.bottom - 37 * r.scale) < 0.6);
    if (!toCounter) throw new Error('no leader at the counter corner: ' + JSON.stringify(r.leaders));
  });

  await check('a line still alongside the block gets no leader (same rule as frames)', async () => {
    window.__setup();
    window.eval('1');
    const r = await (async () => {
      const res = window.__leaders();
      return res;
    })();
    // The frame end: the line sits ON the frame's top edge, so no leader there.
    const atFrame = r.leaders.find(l => Math.abs(l.left - 80.5 * r.scale) < 0.6);
    if (atFrame) throw new Error('a leader was drawn where the line already touches the frame');
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : ' :: ' + r.err)));
  console.log(failed.length ? (failed.length + ' FAILED') : 'ALL PASSED (' + results.length + ')');
  process.exit(failed.length ? 1 : 0);
})();
