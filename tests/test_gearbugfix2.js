const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({ measureText:()=>({width:6}), scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  // jsdom does not implement innerText layout — provide a reasonable text-based fallback for the test
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; },
    set(v) { this.textContent = v; },
    configurable: true
  });
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; renderMoodboardCanvas = () => {};

    __check('_elTextExcludingChrome strips a button child from textContent mode', () => {
      const box = document.createElement('div');
      box.appendChild(document.createTextNode('Plain text'));
      const btn = document.createElement('button'); btn.textContent = '+';
      box.appendChild(btn);
      const txt = _elTextExcludingChrome(box, false);
      if (txt.indexOf('+') >= 0) throw new Error('button text leaked in textContent mode: ' + JSON.stringify(txt));
      if (txt !== 'Plain text') throw new Error('text corrupted: ' + JSON.stringify(txt));
      // button must be restored afterward (not permanently removed)
      if (!box.contains(btn)) throw new Error('button was not restored to the DOM after the read');
    });

    __check('_elTextExcludingChrome strips a button child from innerText mode too', () => {
      const box = document.createElement('div');
      box.appendChild(document.createTextNode('List item text'));
      const btn = document.createElement('button'); btn.textContent = '+';
      box.appendChild(btn);
      const txt = _elTextExcludingChrome(box, true);
      if (txt.indexOf('+') >= 0) throw new Error('button text leaked in innerText mode: ' + JSON.stringify(txt));
      if (!box.contains(btn)) throw new Error('button was not restored to the DOM after the read');
    });

    __check('EXACT BUG (annotation, PLAIN/list-style text, no data-rs yet): oninput no longer picks up the gear button +', () => {
      editorialContent.annotations = { 'layout:pgP': [{ type: 'text', text: 'Hello', x:0.1,y:0.1,w:0.3, listStyle: 'none' }] };
      const el = document.createElement('div'); document.body.appendChild(el);
      const a = editorialContent.annotations['layout:pgP'][0];
      el.textContent = a.text;
      el.oninput = () => { if (el.querySelector('[data-rs]')) { a.runs = _runsFromEditedDom(el); a.text = _runsPlainText(a.runs); } else a.text = _listStripText(_elTextExcludingChrome(el, false), a.listStyle); };
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      el.appendChild(gbtn);   // exactly how _dsTextGearButton attaches it, and this box has NO data-rs spans
      el.oninput();
      if (a.text.indexOf('+') >= 0) throw new Error('annotation plain-text path still corrupted with a stray +: ' + JSON.stringify(a.text));
      el.remove();
    });

    __check('EXACT BUG (annotation, PLAIN text): onblur also no longer picks up the gear button +', () => {
      editorialContent.annotations = { 'layout:pgQ': [{ type: 'text', text: 'World', x:0.1,y:0.1,w:0.3, listStyle: 'none' }] };
      const el = document.createElement('div'); document.body.appendChild(el);
      const a = editorialContent.annotations['layout:pgQ'][0];
      el.textContent = a.text;
      el.onblur = (ev) => { const rt = ev && ev.relatedTarget; if (rt && rt.closest && (rt.closest('#dsTextGearPopup') || rt.closest('[title*="settings"]'))) return; if (el.querySelector('[data-rs]')) { a.runs = _runsFromEditedDom(el); a.text = _runsPlainText(a.runs); } else a.text = _listStripText(_elTextExcludingChrome(el, false), a.listStyle); el.contentEditable = 'false'; };
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      el.appendChild(gbtn);
      el.onblur({});
      if (a.text.indexOf('+') >= 0) throw new Error('annotation onblur plain-text path still corrupted: ' + JSON.stringify(a.text));
      el.remove();
    });

    __check('EXACT BUG (mb element, PLAIN/list-style text): oninput no longer picks up the gear button +', () => {
      editorialContent.layoutPages = [{ id: 'pgR', type: 'moodboard', title: 'R', elements: [{ type: 'text', text: 'Bulleted', x:0.1,y:0.1,w:0.3, listStyle: 'bullets' }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      const box = document.createElement('div'); document.body.appendChild(box);
      box.textContent = 'Bulleted';
      const i = 0;
      box.oninput = () => { const t = _mbEls()[i]; if (!t) return; if (box.querySelector('[data-rs]')) { t.runs = _runsFromEditedDom(box); t.text = _runsPlainText(t.runs); } else t.text = _listStripText(_elTextExcludingChrome(box, true), t.listStyle); };
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      box.appendChild(gbtn);
      box.oninput();
      const t = editorialContent.layoutPages[0].elements[0];
      if (t.text.indexOf('+') >= 0) throw new Error('mb-element plain-text path still corrupted with a stray +: ' + JSON.stringify(t.text));
      box.remove();
    });

    __check('EXACT BUG (mb element, PLAIN text): onblur also no longer picks up the gear button + (this is the reported bug)', () => {
      editorialContent.layoutPages = [{ id: 'pgS', type: 'moodboard', title: 'S', elements: [{ type: 'text', text: 'Numbered', x:0.1,y:0.1,w:0.3, listStyle: 'numbers' }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      const box = document.createElement('div'); document.body.appendChild(box);
      box.textContent = 'Numbered';
      const i = 0;
      box.onblur = (ev) => {
        const t = _mbEls()[i]; if (t) { if (box.querySelector('[data-rs]')) { t.runs = _runsFromEditedDom(box); if (t.runs.length && /\\n$/.test(t.runs[t.runs.length-1].text || '')) t.runs[t.runs.length-1].text = t.runs[t.runs.length-1].text.replace(/\\n$/, ''); t.text = _runsPlainText(t.runs); } else t.text = _listStripText(_elTextExcludingChrome(box, true).replace(/\\n$/, ''), t.listStyle); }
      };
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      box.appendChild(gbtn);
      box.onblur({});
      const t = editorialContent.layoutPages[0].elements[0];
      if (t.text.indexOf('+') >= 0) throw new Error('mb-element onblur plain-text path still corrupted \\u2014 this was the exact bug still reproducing: ' + JSON.stringify(t.text));
      box.remove();
    });

    __check('REGRESSION: rich-text (data-rs present) path is untouched and still works correctly', () => {
      const box = document.createElement('div');
      const span = document.createElement('span'); span.setAttribute('data-rs', '{}'); span.appendChild(document.createTextNode('Styled text'));
      box.appendChild(span);
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      box.appendChild(gbtn);
      const runs = _runsFromEditedDom(box);
      const plain = _runsPlainText(runs);
      if (plain.indexOf('+') >= 0) throw new Error('rich-text path regressed: ' + JSON.stringify(plain));
      if (plain !== 'Styled text') throw new Error('rich-text content corrupted: ' + JSON.stringify(plain));
    });

    __check('REGRESSION: multiple buttons (e.g. gear + any other chrome) are all excluded correctly', () => {
      const box = document.createElement('div');
      box.appendChild(document.createTextNode('Text with two buttons'));
      const b1 = document.createElement('button'); b1.textContent = '+';
      const b2 = document.createElement('button'); b2.textContent = 'X';
      box.appendChild(b1); box.appendChild(b2);
      const txt = _elTextExcludingChrome(box, false);
      if (txt.indexOf('+') >= 0 || txt.indexOf('X') >= 0) throw new Error('not all buttons excluded: ' + JSON.stringify(txt));
      if (!box.contains(b1) || !box.contains(b2)) throw new Error('buttons not restored');
    });
  `;
  try { window.eval(src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
