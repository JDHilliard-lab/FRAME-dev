// 19.13: "When people first open FRAME can the default be empty, and designers set up
// the Thank You page per their team, then save their default people."
//
// Before this, contacts/contacts.json was merged into EVERY deck's Thank You page, so a
// new project opened with the whole company on it. Now the project holds its own list
// (editorialContent.contacts), the json is a directory to pick from, and a designer's
// default team lives in localStorage and seeds new projects. A file from before 19.13
// keeps printing the people it printed (frozen CONTACTS_LEGACY_DIRECTORY).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dirJson = fs.readFileSync(path.join(root, 'contacts', 'contacts.json'), 'utf8');
  const dom = new JSDOM(htmlSrc, { url: 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.fetch = (u) => (String(u).indexOf('contacts/contacts.json') >= 0)
    ? Promise.resolve({ ok: true, text: () => Promise.resolve(dirJson), json: () => Promise.resolve(JSON.parse(dirJson)) })
    : Promise.reject(new Error('no network in test'));
  global.window = window; global.document = window.document;
  global.navigator = window.navigator;

  const testBlock = `
    window.__testResults = [];
    const __check = async (label, fn) => { try { await fn(); window.__testResults.push({ label, ok: true }); } catch (e) { window.__testResults.push({ label, ok: false, err: e.message }); } };
    scheduleAutosave = () => {};
    _autosaveToldUser = true;
    window.__run = (async () => {
      const dir = JSON.parse(window.__dirJson);

      await __check('the directory file parses and holds the updated people', () => {
        const names = dir.map(c => c.name);
        ['Greg Barrett', 'Laura Beshears', 'Issy Grue Lee', 'Bryony Wright', 'Fara Winestock', 'Mariana Rivera'].forEach(n => { if (names.indexOf(n) < 0) throw new Error(n + ' missing from contacts.json'); });
        if (names.indexOf('Ricky Alvarez') >= 0) throw new Error('Ricky Alvarez is not in the directory any more');
      });

      await __check('EXACT BUG: a new project has nobody on its Thank You page', async () => {
        try { localStorage.removeItem(MY_CONTACTS_KEY); } catch (e) {}
        editorialContent = _editorialDefaults();
        _startNewProject({ name: 'Test' });
        const list = await _contactsResolved();
        if (list.length) throw new Error('THE BUG: a new deck already lists ' + list.length + ' people: ' + list.map(c => c.name).join(', '));
      });

      await __check('the directory is a pick list: adding one person puts only that person on the page', async () => {
        editorialContent = _editorialDefaults();
        await openContactsEditor();
        if (!_contactsDirOpen) throw new Error('an empty project should open straight onto the directory');
        await _contactsDirRender();
        const items = document.querySelectorAll('#contactsDirList .contacts-dir-item');
        if (items.length !== dir.length) throw new Error('directory shows ' + items.length + ' of ' + dir.length);
        addContactFromDirectory(dir.find(c => c.name === 'Jordan Hilliard'));
        const list = await _contactsResolved();
        if (list.length !== 1 || list[0].name !== 'Jordan Hilliard') throw new Error('list is ' + JSON.stringify(list));
        if (list[0].role !== 'Senior Designer, 3D & Innovation') throw new Error('a comma in a role split the fields: role came back ' + JSON.stringify(list[0].role));
        await _contactsDirRender();
        const added = Array.from(document.querySelectorAll('#contactsDirList .contacts-dir-item')).filter(b => b.disabled);
        if (added.length !== 1) throw new Error('the added person should show as added (disabled), got ' + added.length);
        closeContactsEditor();
      });

      await __check('Save as my default seeds the NEXT new project', async () => {
        editorialContent = _editorialDefaults();
        await openContactsEditor();
        addContactFromDirectory(dir.find(c => c.name === 'Laurenn Machin'));
        addContactFromDirectory(dir.find(c => c.name === 'Heather Merenda'));
        saveMyDefaultContacts();
        closeContactsEditor();
        editorialContent = _editorialDefaults();
        _startNewProject({ name: 'Next' });
        const names = (await _contactsResolved()).map(c => c.name).join(',');
        if (names !== 'Laurenn Machin,Heather Merenda') throw new Error('new project started with ' + JSON.stringify(names));
        try { localStorage.removeItem(MY_CONTACTS_KEY); } catch (e) {}
      });

      await __check('an old project file keeps the people it printed, in its order, minus its hidden ones', async () => {
        const old = { contacts: 'Jane Client | Owner | jane@x.com | 1', contactsOrder: ['jane client~jane@x.com'], contactsHidden: ['ricky alvarez~ralvarez@farmboyfinearts.com'] };
        editorialContent = _editorialFromFile(old);
        const list = await _contactsResolved();
        const shown = list.filter(c => !c._hidden).map(c => c.name);
        if (shown[0] !== 'Jane Client') throw new Error('custom order lost: ' + shown.join(','));
        if (shown.indexOf('Todd Towers') < 0 || shown.indexOf('Farmboy Fine Arts') < 0) throw new Error('old directory people dropped: ' + shown.join(','));
        if (shown.indexOf('Ricky Alvarez') >= 0) throw new Error('a hidden contact came back');
        if (editorialContent.contactsV !== 2) throw new Error('migration not marked done');
      });

      await __check('a project saved by this build is NOT re-migrated (no old directory sneaks back)', async () => {
        editorialContent = _editorialFromFile({ contacts: '', contactsV: 2 });
        if ((await _contactsResolved()).length) throw new Error('an empty 19.13 project grew contacts on load');
      });

      await __check('the Thank You thumbnail key changes when the list does', () => {
        const d = { kind: 'card', type: 'contacts' };
        editorialContent.contacts = 'A | B | c | d';
        const k1 = _dsThumbCacheKey(d);
        editorialContent.contacts = 'A | B | c | d\\nE | F | g | h';
        if (_dsThumbCacheKey(d) === k1) throw new Error('stale thumbnail: key ignores the contact list');
      });
    })();
  `;

  try {
    window.eval('window.__dirJson = ' + JSON.stringify(dirJson) + ';\n' + src + '\n' + testBlock);
    await window.__run;
  } catch (e) {
    console.error('LOAD/RUN FAILED:', e.message);
    process.exit(1);
  }

  const results = window.__testResults || [];
  let failures = [];
  results.forEach(r => { console.log((r.ok ? 'OK:  ' : 'FAIL:') + ' ' + r.label + (r.ok ? '' : ' -> ' + r.err)); if (!r.ok) failures.push(r.label); });
  console.log('\n--- Summary ---');
  if (failures.length) { console.log(failures.length + ' FAILURES'); process.exit(1); }
  else console.log('ALL PASSED (' + results.length + ')');
  process.exit(0);
})();
