// Deck copy (the Project tab's prose textareas) must persist as you type.
//
// These fields had no input wiring at all: typing in them wrote nowhere.
// editorialContent only picked the text up on Generate PDF, or via the
// copy-editor popup. Meanwhile _specPdfPrefill hard-overwrites every one of
// them from editorialContent each time the Project tab is prepared.
//
// So the text survived only until the next prefill. That used to mean Done then
// Spec PDF; once Deck Studio became a tab it meant a single
// Deck -> Elevation -> Deck hop, which is a normal thing to do mid-sentence.
const { JSDOM } = require('jsdom');
const fs = require('fs');

(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.fetch = () => Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = (label, fn) => { try { fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };

    editorialContent = editorialContent || {};
    const __type = (id, v) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('#' + id + ' not in the markup');
      el.value = v;
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      return el;
    };
    // The fields are wired at load, plus a retry 800ms later for lazily-built
    // markup. Everything here exists up front, so the first pass covers it.
    const FIELDS = {
      specPdfUnderstanding: 'understanding',
      specPdfNarrative: 'narrative',
      specPdfContacts: 'contacts',
      specPdfTimeline: 'timeline'
    };

    __check('EXACT BUG: typing into the narrative persists immediately, and survives a prefill', () => {
      editorialContent.narrative = '';
      __type('specPdfNarrative', 'The art program for the east lobby.');
      if (editorialContent.narrative !== 'The art program for the east lobby.') {
        throw new Error('the exact reported bug: typing wrote nowhere (editorialContent.narrative is ' + JSON.stringify(editorialContent.narrative) + '), so the next prefill would wipe it');
      }
      // The prefill is what used to destroy it — it overwrites the field from
      // editorialContent with no "only if empty" guard.
      _specPdfPrefill();
      if (document.getElementById('specPdfNarrative').value !== 'The art program for the east lobby.') {
        throw new Error('prefill wiped the typed text: ' + document.getElementById('specPdfNarrative').value);
      }
    });

    __check('every prose field persists on input, including contacts and timeline', () => {
      Object.keys(FIELDS).forEach(id => {
        const key = FIELDS[id];
        editorialContent[key] = '';
        __type(id, 'value for ' + key);
        if (editorialContent[key] !== 'value for ' + key) {
          throw new Error('#' + id + ' did not persist to editorialContent.' + key + ' (got ' + JSON.stringify(editorialContent[key]) + ')');
        }
      });
    });

    __check('the three strategy tiers persist to their own slots', () => {
      editorialContent.strategy = { primary: '', secondary: '', tertiary: '' };
      __type('specPdfStrategyPrimary', 'Fine art originals');
      __type('specPdfStrategySecondary', 'Limited editions');
      __type('specPdfStrategyTertiary', 'Open editions');
      const s = editorialContent.strategy || {};
      if (s.primary !== 'Fine art originals') throw new Error('primary: ' + s.primary);
      if (s.secondary !== 'Limited editions') throw new Error('secondary: ' + s.secondary);
      if (s.tertiary !== 'Open editions') throw new Error('tertiary: ' + s.tertiary);
    });

    __check('_syncCopyField covers contacts and timeline, not just the original five', () => {
      // It handled understanding, narrative and the three strategy tiers; the
      // other two textareas sat in the same broken state and were easy to miss.
      editorialContent.contacts = ''; editorialContent.timeline = '';
      _syncCopyField('specPdfContacts', 'hello@example.com');
      _syncCopyField('specPdfTimeline', 'Install week 12');
      if (editorialContent.contacts !== 'hello@example.com') throw new Error('contacts not handled by _syncCopyField');
      if (editorialContent.timeline !== 'Install week 12') throw new Error('timeline not handled by _syncCopyField');
    });

    __check('typing schedules a save, so the text reaches the project file too', () => {
      let saves = 0;
      const real = scheduleAutosave;
      scheduleAutosave = () => { saves++; };
      __type('specPdfNarrative', 'another edit');
      scheduleAutosave = real;
      if (saves === 0) throw new Error('no autosave scheduled — the text would be lost on reload even though editorialContent had it');
    });

    __check('each field is wired once, so re-running the attach pass cannot double-count', () => {
      const el = document.getElementById('specPdfNarrative');
      if (!el._dsCopyWired) throw new Error('the wired flag is missing, so the 800ms retry would attach a second listener');
      let hits = 0;
      const real = _syncCopyField;
      _syncCopyField = (id, v) => { hits++; return real(id, v); };
      __type('specPdfNarrative', 'x');
      _syncCopyField = real;
      if (hits !== 1) throw new Error('input fired ' + hits + ' handlers, expected 1');
    });
  `;

  try {
    window.__appSrc = src;
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
