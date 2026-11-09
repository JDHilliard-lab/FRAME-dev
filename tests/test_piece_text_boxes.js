// 20.27: an item's Notes and its title / artist are page text boxes, not spec lines.
//
// Reported: "they sometimes have too much information and break the look of the spec,
// instead of adding it to the spec can there be an option from the right panel to add
// item note and it can be a separate text box designers can layout beside the piece".
// And title / artist, which used to be in the spec and came out because they are often
// unknown, should be addable the same way when they ARE known.
//
// Checks: buildSpecStrings never emits a Notes line; the spec page's right panel has a
// TEXT BOXES section in Per-piece and in Group A/B/C; each button drops a movable note
// annotation on that page's key with the row's words (or placeholder wording that
// PAGE_PLACEHOLDER_RE flags when the field is blank).
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
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    _autosaveToldUser = true;
    const mk = (id, o) => Object.assign({}, dashDefaultData, {
      id: id, product: 'Framed Art', extW: 30, extH: 40,
      fCode: 'MICH 432-22', fColorName: 'White', fW: 0.875, fHeight: 1.25, rabbetDepth: 1,
      mount: 'Standard Mount', hardware: 'None', glass: '2mm Standard'
    }, o || {});
    const LONG = 'Client to confirm final placement with the GC. Print float-mounted over mat with 0.25in spacers; frame shop to verify rabbet before cutting.';

    __check('EXACT BUG: a typed note no longer prints in the spec block', () => {
      const s = buildSpecStrings(mk('ART-01', { notes: LONG }));
      const hit = (s.lines || []).filter(l => l.label === 'Notes' || String(l.value || '').indexOf('spacers') >= 0);
      if (hit.length) throw new Error('spec block still carries the note: ' + JSON.stringify(hit));
      if (!(s.lines || []).some(l => l.label === 'Application')) throw new Error('spec block lost its normal lines too');
    });

    __check('nor in a set block', () => {
      const set = [mk('ART-04A', { notes: LONG }), mk('ART-04B')];
      const rows = _specSetRows(set, _setLetters(2));
      if (rows.some(r => r.base === 'Notes')) throw new Error('set block still prints Notes');
    });

    __check('item note box: the row\\'s words, with a Note: lead unless it has one', () => {
      if (_pieceNoteText([mk('A', { notes: LONG })]) !== 'Note:\\n' + LONG) throw new Error(_pieceNoteText([mk('A', { notes: LONG })]));
      if (_pieceNoteText([mk('A', { notes: 'Note: hang low' })]) !== 'Note: hang low') throw new Error('doubled the Note: lead');
    });

    __check('a blank note or credit comes in as wording preflight flags', () => {
      const n = _pieceNoteText([mk('A')]), c = _pieceCreditText([mk('A')]);
      if (!PAGE_PLACEHOLDER_RE.test(n)) throw new Error('blank note placeholder not flagged: ' + n);
      if (!PAGE_PLACEHOLDER_RE.test(c)) throw new Error('blank credit placeholder not flagged: ' + c);
    });

    __check('artist + title box: title, artist (affiliation), then medium and year', () => {
      const c = _pieceCreditText([mk('A', { artworkTitle: 'Low Tide', artist: 'Mara Quill', artistAffil: 'NS', artMedium: 'Oil on linen', artYear: '2024' })]);
      if (c !== 'Low Tide\\nMara Quill (NS)\\nOil on linen, 2024') throw new Error(JSON.stringify(c));
      if (PAGE_PLACEHOLDER_RE.test(c)) throw new Error('a filled credit reads as a placeholder');
    });

    __check('on a set page each line starts with the piece code', () => {
      const rows = [mk('ART-02A', { notes: 'Left of the window' }), mk('ART-02B'), mk('ART-02C', { notes: 'Over the bench' })];
      const n = _pieceNoteText(rows);
      if (n !== 'Notes:\\nART-02A  Left of the window\\nART-02C  Over the bench') throw new Error(JSON.stringify(n));
      const c = _pieceCreditText([mk('ART-02A', { artworkTitle: 'One', artist: 'X' }), mk('ART-02B')]);
      if (c !== 'ART-02A  One, X\\nART-02B  Artwork title, Artist name') throw new Error(JSON.stringify(c));
    });

    __check('each button adds a movable note annotation on that spec page', () => {
      const row = mk('ART-07', { notes: LONG, artworkTitle: 'Shoal', artist: 'R. Penn' });
      const desc = { kind: 'spec', type: 'spec', title: 'ART-07', row: row, members: [row], _ovKey: 'ART-07' };
      editorialContent.annotations = {};
      _dsSelectAnnot = function () {}; _dsRenderRail = function () {};
      const host = document.createElement('div');
      _dsPieceTextInto(host, desc);
      const btns = host.querySelectorAll('button[data-piece-text]');
      if (btns.length !== 2) throw new Error('expected 2 buttons, got ' + btns.length);
      btns[0].onclick(); btns[1].onclick();
      const list = editorialContent.annotations['spec:ART-07'] || [];
      if (list.length !== 2) throw new Error('expected 2 annotations, got ' + list.length);
      if (list.some(a => a.type !== 'note' || !(a.w > 0) || !isFinite(a.x) || !isFinite(a.y))) throw new Error('not a placeable note: ' + JSON.stringify(list));
      if (list[0].text.indexOf('spacers') < 0) throw new Error('note box lost the note');
      if (list[1].text !== 'Shoal\\nR. Penn') throw new Error('credit box: ' + list[1].text);
      if (list[0].x === list[1].x && list[0].y === list[1].y) throw new Error('the two boxes landed on top of each other');
    });

    __check('boxes start under the spec block, in its column, stacked, not on the artwork', () => {
      const row = mk('ART-09', { notes: LONG, artworkTitle: 'Drift', artist: 'K. Moss' });
      const desc = { kind: 'spec', type: 'spec', title: 'ART-09', row: row, members: [row], _ovKey: 'ART-09' };
      editorialContent.annotations = {};
      // What a drawn page records (the drawers call _noteSpecEnd with points).
      _noteSpecEnd({ internal: { pageSize: { getWidth: () => 960, getHeight: () => 540 } } }, 'ART-09', 22.5, 230, 300);
      const end = _specBlockEnd['ART-09'];
      if (!end || Math.abs(end.y - 230 / 540) > 1e-9 || Math.abs(end.x - 22.5 / 960) > 1e-9) throw new Error('spec end not recorded as fractions: ' + JSON.stringify(end));
      _dsAddPieceText(desc, 'credit'); _dsAddPieceText(desc, 'note');
      const [c, n] = editorialContent.annotations['spec:ART-09'];
      if (Math.abs(c.x - end.x) > 1e-9 || c.y <= end.y) throw new Error('credit not under the spec block: ' + JSON.stringify(c));
      if (Math.abs(n.x - end.x) > 1e-9 || n.y < _pieceTextBottom(c, end.aspect)) throw new Error('note not stacked below the credit: ' + JSON.stringify([c, n]));
      if (c.w > end.w + 1e-9) throw new Error('box wider than the spec column');
    });

    __check('both spec drawers record where their rows end', () => {
      const S = window.__appSrc;
      const shared = S.slice(S.indexOf('function _drawSharedSpecColumn('), S.indexOf('function _drawGroupElevOutline('));
      if (shared.indexOf('_noteSpecEnd(doc, members[0]') < 0) throw new Error('shared set column does not record its end');
      if (S.indexOf('_noteSpecEnd(doc, r && r.id, sx, sy - _lead + 3, sw)') < 0) throw new Error('per-piece spec block does not record its end');
    });

    __check('the panel offers it in Per-piece AND Group A/B/C', () => {
      const S = window.__appSrc;
      const n = S.split('_dsPieceTextInto(t, desc);').length - 1;
      if (n !== 2) throw new Error('expected 2 call sites, found ' + n);
      const g = S.indexOf('THE GROUP CARDS ARE GONE'), p = S.indexOf('THE PICTURE CARDS ARE GONE FROM THE PER-PIECE PANEL');
      const before = (i) => S.lastIndexOf('_dsPieceTextInto(t, desc);', i) > S.lastIndexOf('t.appendChild(head);', i) - 200;
      if (!before(g) || !before(p)) throw new Error('a call site moved away from its branch');
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
