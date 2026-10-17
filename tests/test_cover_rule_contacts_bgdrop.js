// 19.14, four requests in one pass:
//  1. "the cover page has no line under the Client Name ... 1.5 line weight ... needs to
//     change from black to white when switching dark themes". The starter cover carries a
//     1.5pt rule; the PDF flips it through the dark setDrawColor remap, and the on-screen
//     page and rail thumbnail now flip lines the same way (they did not: a black rule
//     vanished on a dark cover on screen while the PDF showed it).
//  2. Thank You: move the contacts as a group up or down, and size the names.
//  3. Drop an image on a page in Deck Studio to make it the background.
//  (The starter Moodboard removal is pinned in test_starter_deck_defaults.)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;
  const quiet = console.error; console.error = () => {};

  const testBlock = `
    window.__testResults = [];
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    scheduleAutosave = () => {};
    _autosaveToldUser = true;

    // A doc that records every text call with the font size in force.
    const recDoc = () => {
      const texts = []; let fs = 10;
      const d = new Proxy({}, { get: (o, k) => {
        if (k === 'internal') return { pageSize: { getWidth: () => 936, getHeight: () => 540 } };
        if (k === 'setFontSize') return (v) => { fs = v; };
        if (k === 'text') return (t, x, y) => { texts.push({ t: Array.isArray(t) ? t.join(' ') : String(t), x, y, fs }); };
        if (k === 'getTextWidth') return (s) => String(s).length * 5;
        if (k === 'splitTextToSize') return (s) => [String(s)];
        if (k === 'getFontSize') return () => fs;
        if (k === '__texts') return texts;
        return o[k] || (() => d);
      } });
      return d;
    };
    const renderTY = async () => {
      const d = recDoc();
      _drawThankYouPage(d, {}, 11, {}, await _contactsResolved());
      return d.__texts;
    };

    window.__run = (async () => {
      await __check('EXACT REQUEST: the starter cover has a 1.5pt rule between the client name and the heading', () => {
        const els = _editorialDefaults().coverPage.elements;
        const rule = els.find(e => e.type === 'arrow');
        const client = els.find(e => e.text === 'CLIENT NAME'), head = els.find(e => e.text === 'COVER PAGE HEADING');
        if (!rule) throw new Error('no rule on the cover');
        if (rule.weight !== 1.5) throw new Error('weight ' + rule.weight);
        if (!(rule.y1 > client.y && rule.y1 < head.y)) throw new Error('the rule is not between client name (' + client.y + ') and heading (' + head.y + '): ' + rule.y1);
        if (Math.abs(rule.y1 - rule.y2) > 1e-9) throw new Error('the rule is not level');
      });

      await __check('EXACT BUG: on a dark cover the rule draws light on screen, as the PDF already does', () => {
        editorialContent = _editorialDefaults();
        _pageThemes()['fixed:cover'] = { mode: 'dark' };
        const html = _mbThumbInner(editorialContent.coverPage, 400, 230, 'fixed:cover');
        const m = /<line[^>]*stroke="([^"]+)"/.exec(html);
        if (!m) throw new Error('no line drawn in the thumbnail');
        if (m[1] === '#000000') throw new Error('THE BUG: the rule stays black on a dark page and disappears');
        const n = (m[1].match(/[0-9]+/g) || []).map(Number);
        if (!(n.length === 3 && n[0] > 200)) throw new Error('rule ink on dark is ' + m[1]);
        _pageThemes()['fixed:cover'] = { mode: 'light' };
        const m2 = /<line[^>]*stroke="([^"]+)"/.exec(_mbThumbInner(editorialContent.coverPage, 400, 230, 'fixed:cover'));
        if (!m2 || m2[1] !== '#000000') throw new Error('on a light page the rule should stay black, got ' + (m2 && m2[1]));
      });

      await __check('Thank You: Name size sets the size the names print at', async () => {
        editorialContent = _editorialDefaults();
        editorialContent.contacts = 'Ann Able | Art Director | a@x.com | 1\\nBob Bee | PM | b@x.com | 2';
        let t = await renderTY();
        const n0 = t.find(x => x.t === 'ANN ABLE');
        if (!n0 || n0.fs !== 12) throw new Error('default name size should be 12, got ' + (n0 && n0.fs));
        editorialContent.contactNameSize = 18;
        t = await renderTY();
        const n1 = t.find(x => x.t === 'ANN ABLE'), role = t.find(x => x.t === 'Art Director');
        if (n1.fs !== 18) throw new Error('THE REQUEST: names still print at ' + n1.fs);
        if (!(role.y - n1.y >= 18)) throw new Error('a bigger name ran into its role: gap ' + (role.y - n1.y));
      });

      await __check('Thank You: Move contacts shifts the people as one group and leaves the studio block', async () => {
        editorialContent = _editorialDefaults();
        editorialContent.contacts = 'Ann Able | Art Director | a@x.com | 1\\nBob Bee | PM | b@x.com | 2\\nCal Cee | PM | c@x.com | 3';
        const at = (t, s) => (t.find(x => x.t === s) || {}).y;
        const t0 = await renderTY();
        editorialContent.contactShiftY = 40;
        const t1 = await renderTY();
        ['ANN ABLE', 'BOB BEE', 'CAL CEE'].forEach(s => { if (Math.abs((at(t1, s) - at(t0, s)) - 40) > 0.01) throw new Error(s + ' moved ' + (at(t1, s) - at(t0, s))); });
        const studio = 'FARMBOY FINE ARTS\\u00AE';
        if (at(t1, studio) !== at(t0, studio)) throw new Error('the studio block moved with the contacts');
      });

      await __check('both new controls are on the Thank You panel', () => {
        const S = window.__appSrc;
        if (S.indexOf("slider('Move contacts up / down', 'contactShiftY'") < 0) throw new Error('no Move contacts slider');
        if (S.indexOf("slider('Name size', 'contactNameSize'") < 0) throw new Error('no Name size slider');
      });

      // ── Background drop ──
      const dropOn = (target, file, pre) => {
        const ev = new window.Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
        if (pre) ev.preventDefault();
        target.dispatchEvent(ev);
      };
      const img = () => new window.File([new Uint8Array([1, 2, 3])], 'hero.jpg', { type: 'image/jpeg' });
      _boundImageDataUrl = (u, max, q, cb) => cb('data:image/jpeg;base64,BG', 800, 500);
      _dsRenderTools = () => {}; _dsRenderCenter = () => {}; _dsPriorityRerender = () => {};
      const settle = () => new Promise(r => setTimeout(r, 30));
      const c = document.getElementById('dsCenter');
      _dsWireBgDrop(c);

      await __check('EXACT REQUEST: an image dropped on the cover becomes its background', async () => {
        editorialContent = _editorialDefaults();
        _dsPages = [{ kind: 'fixed', fixed: 'cover' }]; _dsIndex = 0;
        dropOn(c, img());
        await settle();
        const th = _pageThemes()['fixed:cover'] || {};
        if (th.image !== 'data:image/jpeg;base64,BG') throw new Error('THE REQUEST: no background after the drop');
        if (th.bgMode !== 'image') throw new Error('bgMode is ' + th.bgMode);
      });

      await __check('it works on other pages too (a layout page)', async () => {
        editorialContent = _editorialDefaults();
        const pg = { id: 'pgX', type: 'custom', title: 'Mine', elements: [] };
        editorialContent.layoutPages.push(pg);
        _dsPages = [{ kind: 'layout', page: pg }]; _dsIndex = 0;
        dropOn(c, img());
        await settle();
        if ((_pageThemes()[_deckPageKey(_dsPages[0])] || {}).image !== 'data:image/jpeg;base64,BG') throw new Error('no background on a layout page');
      });

      await __check('a drop something inside already took (an image box) is NOT a background', async () => {
        editorialContent = _editorialDefaults();
        _dsPages = [{ kind: 'fixed', fixed: 'cover' }]; _dsIndex = 0;
        dropOn(c, img(), true);
        await settle();
        if ((_pageThemes()['fixed:cover'] || {}).image) throw new Error('an image box drop also set the background');
      });

      await __check('spec and floorplan pages are left alone (a file there is artwork / a plan)', async () => {
        editorialContent = _editorialDefaults();
        _dsPages = [{ kind: 'spec', row: { id: 'ART.1' } }]; _dsIndex = 0;
        dropOn(c, img());
        _dsPages = [{ kind: 'floorplan', level: 0 }]; _dsIndex = 0;
        dropOn(c, img());
        await settle();
        const any = Object.keys(_pageThemes()).filter(k => (_pageThemes()[k] || {}).image);
        if (any.length) throw new Error('a background was set on ' + any.join(', '));
      });
    })();
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error = quiet;
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }
  console.error = quiet;

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
})();
