const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname,'..','app.js'), 'utf8');
  const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'), { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  // measureText: 6px per char per 12px font → width scales with font size.
  window.HTMLCanvasElement.prototype.getContext = () => ({ _f:'', set font(v){ this._f=v; }, get font(){ return this._f; }, measureText(s){ const m=/(\d+(?:\.\d+)?)px/.exec(this._f); const fs=m?parseFloat(m[1]):12; return { width: s.length * fs * 0.5 }; }, scale(){}, fillRect(){}, drawImage(){}, fill(){}, stroke(){}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, closePath(){}, save(){}, restore(){}, setLineDash(){}, getImageData:()=>({data:new Uint8ClampedArray(4)}), putImageData(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, clip(){}, rect(){}, createLinearGradient:()=>({addColorStop(){}}) });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'x';
  window.fetch = () => Promise.reject(new Error('none'));
  global.window = window; global.document = window.document;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true });
  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    scheduleAutosave=()=>{}; pushHistory=()=>{};

    __check('runs: apply style to a range splits and merges correctly', () => {
      let runs = _runsFromPlain('Hello World');
      runs = _runsApplyStyle(runs, 0, 5, { bold: true, size: 15/540 });
      if (runs.length !== 2) throw new Error('split wrong: ' + JSON.stringify(runs));
      if (runs[0].text !== 'Hello' || !runs[0].bold) throw new Error('range style missing');
      if (runs[1].text !== ' World' || runs[1].bold) throw new Error('rest polluted');
      if (_runsPlainText(runs) !== 'Hello World') throw new Error('plain text broken');
      // undo the style on the same range → merges back to one run
      runs = _runsApplyStyle(runs, 0, 5, { bold: undefined, size: undefined });
      if (runs.length !== 1) throw new Error('merge-back failed: ' + JSON.stringify(runs));
    });

    __check('layout engine: identical line breaks for plain and single-run text; wraps at width', () => {
      const t = { text: 'aaaa bbbb cccc', size: 12/540, w: 0.1 };
      const lines = _layoutRichLines(t, 30, 540);   // 12px font, 0.5*12=6px/char → 'aaaa'=24, +' '=6 → wraps
      if (lines.length < 3) throw new Error('did not wrap: ' + lines.length);
      const joined = lines.map(l => l.tokens.map(k => k.text).join('')).join('|');
      if (joined.replace(/\\|/g, '').replace(/\\s+/g, ' ').trim() !== 'aaaa bbbb cccc') throw new Error('content lost: ' + joined);
    });

    __check('layout engine: per-run size changes measured width and line height', () => {
      const t = { size: 12/540, runs: [{ text: 'big ', size: 24/540 }, { text: 'small' }] };
      const lines = _layoutRichLines(t, 999, 540);
      const l = lines[0];
      if (Math.round(l.tokens[0].fs) !== 24) throw new Error('run size not honored: ' + l.tokens[0].fs);
      if (Math.round(l.fs) !== 24) throw new Error('line height not from max run: ' + l.fs);
      if (l.tokens[1].x <= l.tokens[0].x) throw new Error('positions not advancing');
    });

    __check('PDF drawer: tokens draw with their own font/size at measured positions', () => {
      const t = { x: 0.1, y: 0.1, w: 0.5, size: 12/540, font: 'serif', color: '#222222',
                  runs: [{ text: 'Bold ', bold: true, size: 15/540 }, { text: 'Italic', italic: true, size: 14/540 }] };
      const rec = new CanvasPdfRec(936, 540);
      const fonts = []; const sizes = [];
      rec.setFont = (fam, style) => fonts.push(fam + '/' + style);
      const origSetFontSize = rec.setFontSize ? rec.setFontSize.bind(rec) : null;
      rec.setFontSize = (v) => sizes.push(Math.round(v));
      _drawRichTextPdf(rec, t, 93.6, 54, 468, 540);
      const texts = rec.ops.filter(o => o.t === 'text');
      if (texts.length < 2) throw new Error('tokens not drawn: ' + texts.length);
      if (fonts.filter(f => f.indexOf('/bold') >= 0).length < 1) throw new Error('bold token font missing: ' + fonts.join(','));
      if (fonts.filter(f => f.indexOf('/italic') >= 0).length < 1) throw new Error('italic token font missing');
      if (sizes.indexOf(15) < 0 || sizes.indexOf(14) < 0) throw new Error('per-run sizes missing: ' + sizes.join(','));
      if (!(texts[1].x > texts[0].x)) throw new Error('second token not offset');
    });

    __check('DOM spans render runs with data-rs and list prefixes; raw mode skips prefixes', () => {
      const el = document.createElement('div'); document.body.appendChild(el);
      const t = { text: 'a\\nb', listStyle: 'bullet', runs: [{ text: 'a\\nb', bold: true }] };
      _richSpansInto(el, t, false);
      if ((el.textContent || '').indexOf('\\u2022 a') < 0) throw new Error('prefix missing: ' + el.textContent);
      if (!el.querySelector('[data-rs]')) throw new Error('spans missing');
      _richSpansInto(el, t, true);
      if ((el.textContent || '').indexOf('\\u2022') >= 0) throw new Error('raw mode leaked prefixes');
      if (el.textContent !== 'a\\nb') throw new Error('raw text wrong: ' + JSON.stringify(el.textContent));
    });

    __check('edited DOM rebuilds runs preserving styles', () => {
      const box = document.createElement('div'); document.body.appendChild(box);
      const t = { text: 'Hello World', runs: [{ text: 'Hello', bold: true }, { text: ' World' }] };
      _richSpansInto(box, t, true);
      // simulate typing inside the bold span
      const boldSpan = box.querySelector('[data-rs]');
      boldSpan.textContent = 'Hello!!';
      const runs = _runsFromEditedDom(box);
      if (runs[0].text !== 'Hello!!' || !runs[0].bold) throw new Error('style lost on edit: ' + JSON.stringify(runs));
      if (_runsPlainText(runs) !== 'Hello!! World') throw new Error('plain wrong');
    });

    __check('selection offsets round-trip in a contenteditable', () => {
      const box = document.createElement('div'); document.body.appendChild(box);
      const t = { text: 'Hello World', runs: [{ text: 'Hello', bold: true }, { text: ' World' }] };
      _richSpansInto(box, t, true);
      _ceSetSelOffsets(box, 3, 8);
      const off = _ceSelOffsets(box);
      if (!off || off.start !== 3 || off.end !== 8) throw new Error('offsets wrong: ' + JSON.stringify(off));
    });

    __check('_popupApplyTextStyle: live selection styles just the range; no selection styles whole box', () => {
      const box = document.createElement('div'); box.dataset.dsTgt = 'mb:0'; document.body.appendChild(box);
      box.contentEditable = 'true';
      const a = { text: 'Hello World', size: 12/540 };
      _richSpansInto(box, a, true);
      _ceSetSelOffsets(box, 0, 5);
      const wasRange = _popupApplyTextStyle(a, { bold: true }, 'mb:0');
      if (!wasRange) throw new Error('selection path not taken');
      if (!a.runs || a.runs.length !== 2 || !a.runs[0].bold || a.runs[1].bold) throw new Error('range apply wrong: ' + JSON.stringify(a.runs));
      // restore check: selection survived
      const off = _ceSelOffsets(box);
      if (!off || off.start !== 0 || off.end !== 5) throw new Error('selection not restored');
      // whole-box path: no editable target
      box.contentEditable = 'false';
      _popupApplyTextStyle(a, { font: 'display' }, 'mb:0');
      if (a.font !== 'display') throw new Error('whole-box base not set');
      if (a.runs.some(r => r.font)) throw new Error('runs should have font cleared so base wins');
      box.remove();
    });

    __check('plain-text boxes still work correctly (PDF now unconditionally uses the engine; its own _runsFromPlain fallback handles no-runs text)', () => {
      const S = window.__appSrc;
      if (S.indexOf('function _runsFromPlain(text)') < 0) throw new Error('_runsFromPlain fallback missing');
      if (S.indexOf("_drawRichTextPdf(doc, t, (t.x || 0) * PW, (t.y || 0) * PH, (t.w || 0.4) * PW, PH);") < 0) throw new Error('mb PDF no longer routes through the engine');
      if (S.indexOf("_drawRichTextPdf(doc, a, (a.x || 0) * PW, (a.y || 0) * PH, (a.w || 0.3) * PW, PH);") < 0) throw new Error('ann PDF no longer routes through the engine');
      if (S.indexOf("else box.textContent = _listPrefixText(t.text || 'Text', t.listStyle);") < 0) throw new Error('mb DOM fallback missing');
    });
  `;
  try { window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock); }
  catch (e) { console.error('LOAD/RUN FAILED:', e.message); process.exit(1); }
  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
})();
