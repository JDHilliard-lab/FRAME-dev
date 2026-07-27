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
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave = () => {}; pushHistory = () => {}; _dsRenderRail = () => {}; _dsRenderCenter = () => {}; renderMoodboardCanvas = () => {};

    __check('EXACT BUG: gear button sitting as a direct child of the editable box no longer leaks its "+" into the text', () => {
      const box = document.createElement('div');
      const span = document.createElement('span'); span.setAttribute('data-rs', '{}'); span.appendChild(document.createTextNode('Hello world'));
      box.appendChild(span);
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      box.appendChild(gbtn);   // exactly how _dsTextGearButton attaches it
      const runs = _runsFromEditedDom(box);
      const plain = _runsPlainText(runs);
      if (plain.indexOf('+') >= 0) throw new Error('the gear button\\'s + leaked into the text: ' + JSON.stringify(plain));
      if (plain !== 'Hello world') throw new Error('text corrupted: ' + JSON.stringify(plain));
    });

    __check('EDGE CASE: gear button wrapped in a browser-inserted <div> still does not leak a "+" OR a spurious blank line', () => {
      const box = document.createElement('div');
      const span = document.createElement('span'); span.setAttribute('data-rs', '{}'); span.appendChild(document.createTextNode('Hello world'));
      box.appendChild(span);
      const wrapperDiv = document.createElement('div');
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      wrapperDiv.appendChild(gbtn);
      box.appendChild(wrapperDiv);
      const runs = _runsFromEditedDom(box);
      const plain = _runsPlainText(runs);
      if (plain.indexOf('+') >= 0) throw new Error('+ leaked through the wrapper div: ' + JSON.stringify(plain));
      if (plain !== 'Hello world') throw new Error('spurious blank line or other corruption: ' + JSON.stringify(plain));
    });

    __check('REGRESSION: two real paragraph blocks (DIVs) still correctly get a newline between them', () => {
      const box = document.createElement('div');
      const d1 = document.createElement('div'); d1.appendChild(document.createTextNode('Line one'));
      const d2 = document.createElement('div'); d2.appendChild(document.createTextNode('Line two'));
      box.appendChild(d1); box.appendChild(d2);
      const runs = _runsFromEditedDom(box);
      const plain = _runsPlainText(runs);
      if (plain !== 'Line one\\nLine two') throw new Error('multi-paragraph newline regressed: ' + JSON.stringify(plain));
    });

    __check('REGRESSION: a <br> still produces a newline', () => {
      const box = document.createElement('div');
      box.appendChild(document.createTextNode('Line one'));
      box.appendChild(document.createElement('br'));
      box.appendChild(document.createTextNode('Line two'));
      const runs = _runsFromEditedDom(box);
      const plain = _runsPlainText(runs);
      if (plain !== 'Line one\\nLine two') throw new Error('br newline regressed: ' + JSON.stringify(plain));
    });

    __check('REGRESSION: an EMPTY block between two real ones does not add extra blank lines', () => {
      const box = document.createElement('div');
      const d1 = document.createElement('div'); d1.appendChild(document.createTextNode('Line one'));
      const dEmpty = document.createElement('div');   // genuinely empty, e.g. a stray browser artifact
      const d2 = document.createElement('div'); d2.appendChild(document.createTextNode('Line two'));
      box.appendChild(d1); box.appendChild(dEmpty); box.appendChild(d2);
      const runs = _runsFromEditedDom(box);
      const plain = _runsPlainText(runs);
      if (plain !== 'Line one\\nLine two') throw new Error('empty block introduced extra blank line: ' + JSON.stringify(plain));
    });

    __check('REGRESSION: styled runs (color/font/size via data-rs) still carry through correctly', () => {
      const box = document.createElement('div');
      const span = document.createElement('span'); span.setAttribute('data-rs', JSON.stringify({ color: '#c0392b', bold: true }));
      span.appendChild(document.createTextNode('Red bold text'));
      box.appendChild(span);
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      box.appendChild(gbtn);
      const runs = _runsFromEditedDom(box);
      if (runs.length !== 1 || runs[0].color !== '#c0392b' || runs[0].bold !== true) throw new Error('styled run corrupted: ' + JSON.stringify(runs));
    });

    __check('END TO END (mb element): editing a text box with the gear button present does not corrupt t.text on blur', () => {
      editorialContent.layoutPages = [{ id: 'pgG', type: 'moodboard', title: 'G', elements: [{ type: 'text', text: 'Hello world', x:0.1,y:0.1,w:0.3, runs: [{ text: 'Hello world' }] }] }];
      window._mbEls = () => editorialContent.layoutPages[0].elements;
      _mbTextEditing = false;
      const box = document.createElement('div'); document.body.appendChild(box);
      const span = document.createElement('span'); span.setAttribute('data-rs', '{}'); span.appendChild(document.createTextNode('Hello world'));
      box.appendChild(span);
      _mbBeginTextEdit(box, 0);
      // Simulate the gear button being present throughout editing, exactly as it is in the real DOM.
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      box.appendChild(gbtn);
      box.oninput();
      box.onblur({});
      const t = editorialContent.layoutPages[0].elements[0];
      if (t.text.indexOf('+') >= 0) throw new Error('mb element text corrupted with a stray +: ' + JSON.stringify(t.text));
      box.remove();
    });

    __check('END TO END (annotation): editing an annotation text box with the gear button present does not corrupt a.text on blur', () => {
      editorialContent.annotations = { 'layout:pgA': [{ type: 'text', text: 'Hello there', x:0.1,y:0.1,w:0.3, runs: [{ text: 'Hello there' }] }] };
      const el = document.createElement('div'); document.body.appendChild(el);
      const span = document.createElement('span'); span.setAttribute('data-rs', '{}'); span.appendChild(document.createTextNode('Hello there'));
      el.appendChild(span);
      const a = editorialContent.annotations['layout:pgA'][0];
      el.oninput = () => { if (el.querySelector('[data-rs]')) { a.runs = _runsFromEditedDom(el); a.text = _runsPlainText(a.runs); } else a.text = _listStripText(el.textContent, a.listStyle); };
      el.onblur = (ev) => { const rt = ev && ev.relatedTarget; if (rt && rt.closest && (rt.closest('#dsTextGearPopup') || rt.closest('[title*="settings"]'))) return; if (el.querySelector('[data-rs]')) { a.runs = _runsFromEditedDom(el); a.text = _runsPlainText(a.runs); } else a.text = _listStripText(el.textContent, a.listStyle); el.contentEditable = 'false'; };
      const gbtn = document.createElement('button'); gbtn.textContent = '+';
      el.appendChild(gbtn);
      el.oninput();
      el.onblur({});
      if (a.text.indexOf('+') >= 0) throw new Error('annotation text corrupted with a stray +: ' + JSON.stringify(a.text));
      el.remove();
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
