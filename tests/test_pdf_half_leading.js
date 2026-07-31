// THE REPORTED BUG: the cover heading touched the SUBHEADING in the PDF while Deck
// Studio showed a clear gap. Not a wrap problem (that was test_pdf_wrap_trust.js) —
// a vertical placement problem.
//
// Deck Studio renders a text box as a div with a UNITLESS line-height, so the browser
// applies half-leading: each line's glyphs are centred in its line box, i.e.
//     glyph top = boxTop + (lineHeight - fontSize) / 2
// When the leading is TIGHTER than the font size that term is negative and the text
// sits ABOVE the box top. jsPDF's baseline:'top' anchors the ascender at y and applies
// no half-leading at all, so every box printed lower than Deck Studio by exactly that
// amount.
//
// The cover heading is the worst case in the shipped template: leading 77 against a
// ~92pt font, so it dropped ~7pt and closed a 16pt gap to ~2pt. Numbers below come
// from a real saved project (.claude/references/Ceasars_Palace_2026-07-31.json).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const _ctx2d = { font: '', measureText: (s) => ({ width: ('' + s).length * 6 }) };
  window.HTMLCanvasElement.prototype.getContext = () => _ctx2d;
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    editorialContent = editorialContent || {};
    const S = window.__appSrc;

    // A jsPDF stand-in that records every text draw with its y.
    const __doc = () => {
      const draws = [];
      return {
        draws,
        setFont: () => {}, setFontSize: function (n) { this._fs = n; }, setTextColor: () => {},
        setDrawColor: () => {}, setLineWidth: () => {}, setCharSpace: () => {},
        getTextWidth: function (s2) { return ('' + s2).length * (this._fs || 10) * 0.5; },
        text: function (s2, x, y) { draws.push({ s: '' + s2, x: x, y: y, fs: this._fs }); }
      };
    };
    // The two cover boxes, exactly as stored in the real project.
    const PH = 540;
    const HEAD = { type: 'text', text: 'COVER PAGE HEADING', font: 'display', caps: 'upper',
                   x: 0.06, y: 0.31389534883720926, w: 0.7, size: 0.1699153933038768, leading: 77 };
    const SUB  = { type: 'text', text: 'SUBHEADING', font: 'display', caps: 'upper', outline: true,
                   x: 0.06, y: 0.4401744186046513, w: 0.7, size: 0.16787800778793194 };
    // Where each box's first line is DRAWN, and the half-leading the DOM would apply.
    const drawY = (t) => {
      const d = __doc();
      _drawRichTextPdf(d, t, (t.x || 0) * 960, (t.y || 0) * PH, (t.w || 0.3) * 960, PH);
      if (!d.draws.length) throw new Error('nothing drawn for \"' + t.text + '\"');
      return d.draws[0].y;
    };
    const halfLead = (t) => {
      const fs2 = Math.max(6, t.size * PH);
      const lh = (typeof t.leading === 'number' && t.leading > 0) ? t.leading * (PH / 540) : fs2 * 1.15;
      return (lh - fs2) / 2;
    };

    __check('EXACT BUG: a box with leading TIGHTER than its font draws ABOVE its top edge', () => {
      // This is the cover heading. Deck Studio lifts it by (77 - 91.8)/2 = -7.4pt;
      // the PDF used to ignore that and draw at the box top, 7.4pt lower.
      const hl = halfLead(HEAD);
      if (!(hl < -5)) throw new Error('the test geometry no longer has tight leading: halfLead=' + hl.toFixed(1));
      const y = drawY(HEAD);
      const top = HEAD.y * PH;
      if (Math.abs(y - (top + hl)) > 0.01) throw new Error('THE BUG: drawn at ' + y.toFixed(1) + 'pt, but Deck Studio puts it at ' + (top + hl).toFixed(1) + 'pt (box top ' + top.toFixed(1) + ')');
    });

    __check('a box on DEFAULT leading is shifted the other way, also matching the DOM', () => {
      // line-height 1.15 is LOOSER than the font, so the DOM pushes the first line
      // down by (1.15fs - fs)/2. Correcting only the tight case would leave display
      // type on default leading ~7% of its font size high.
      const hl = halfLead(SUB);
      if (!(hl > 1)) throw new Error('expected a positive half-leading, got ' + hl.toFixed(1));
      const y = drawY(SUB);
      if (Math.abs(y - (SUB.y * PH + hl)) > 0.01) throw new Error('drawn at ' + y.toFixed(1) + ', expected ' + (SUB.y * PH + hl).toFixed(1));
    });

    __check('EXACT BUG: the heading and subheading no longer touch', () => {
      // Visible gap between the capitals: baseline sits ~0.8em below the ascender top,
      // caps are ~0.72em tall. All-caps display type, so descenders don't matter.
      const ASC = 0.8, CAP = 0.72;
      const hFs = HEAD.size * PH, sFs = SUB.size * PH;
      const capBottom = drawY(HEAD) + ASC * hFs;
      const capTop = drawY(SUB) + (ASC - CAP) * sFs;
      const gap = capTop - capBottom;
      // Without the fix this is ~2pt, which is what "touching" looked like.
      if (gap < 8) throw new Error('THE BUG: only ' + gap.toFixed(1) + 'pt between the heading and the subheading');
      // And it should match what Deck Studio shows (~16pt), not merely be positive.
      const domGap = (SUB.y * PH + halfLead(SUB) + (ASC - CAP) * sFs) - (HEAD.y * PH + halfLead(HEAD) + ASC * hFs);
      if (Math.abs(gap - domGap) > 0.5) throw new Error('gap is ' + gap.toFixed(1) + 'pt but Deck Studio shows ' + domGap.toFixed(1) + 'pt');
    });

    __check('the correction is position only — it must not change the line-to-line advance', () => {
      // Half-leading is a constant per line, so multi-line spacing has to come out
      // exactly as the leading says. Getting this wrong would compound down a block.
      const para = { type: 'text', text: 'one two three four five six seven eight nine ten eleven twelve',
                     font: 'sans', x: 0.06, y: 0.2, w: 0.18, size: 0.03, leading: 20 };
      const d = __doc();
      _drawRichTextPdf(d, para, 0.06 * 960, 0.2 * PH, 0.18 * 960, PH);
      const ys = [];
      d.draws.forEach(dr => { if (ys.indexOf(dr.y) < 0) ys.push(dr.y); });
      if (ys.length < 3) throw new Error('expected several lines, got ' + ys.length);
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        const step = ys[i] - ys[i - 1];
        if (Math.abs(step - 20) > 0.01) throw new Error('line advance is ' + step.toFixed(2) + 'pt, expected the 20pt leading');
      }
    });

    __check('a box whose leading equals its font size is left exactly where it was', () => {
      const t = { type: 'text', text: 'EVEN', font: 'display', x: 0.1, y: 0.5, w: 0.4, size: 0.1, leading: 0.1 * PH };
      const y = drawY(t);
      if (Math.abs(y - t.y * PH) > 0.01) throw new Error('shifted to ' + y.toFixed(2) + ' from ' + (t.y * PH).toFixed(2) + ' with nothing to correct');
    });

    __check('the draw uses the per-line half-leading, not a single figure for the block', () => {
      const i = S.indexOf('function _drawRichTextPdf');
      const body = S.slice(i, S.indexOf('\\nfunction ', i + 10));
      if (body.indexOf('const halfLead = (lh - lineFs) / 2') < 0) throw new Error('the half-leading term is gone');
      if (body.indexOf('cy + halfLead') < 0) throw new Error('the draw does not apply it');
      // It must be computed inside the per-line loop: a block can mix font sizes, and
      // lh follows the biggest run on each line.
      const loopAt = body.indexOf('lines.forEach');
      const termAt = body.indexOf('const halfLead =');
      if (!(termAt > loopAt)) throw new Error('half-leading is computed outside the line loop');
      // And cy must still advance by lh alone.
      if (body.indexOf('cy += lh;') < 0) throw new Error('the line advance changed; it must stay the plain leading');
    });
  `;

  try {
    window.eval('window.__appSrc = ' + JSON.stringify(src) + ';\n' + src + '\n' + testBlock);
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const all = window.__testResults || [];
  let failures = [];
  all.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + all.length + ')');
})();
