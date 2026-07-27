// FRAME regression runner. Usage:  node tests/run-all.js
// Runs every test_*.js in this folder and reports a combined total.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f)).sort();
let total = 0, failedFiles = [];
for (const f of files) {
  let out = '';
  try { out = execFileSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const pass = /^ALL PASSED \((\d+)\)/m.exec(out);
  const fail = /^(\d+) FAILURES?/m.exec(out);
  if (pass) { total += parseInt(pass[1], 10); console.log('PASS  ' + f + '  (' + pass[1] + ')'); }
  else {
    failedFiles.push(f);
    console.log('FAIL  ' + f + (fail ? '  (' + fail[1] + ' failing)' : '  (could not run)'));
    out.split('\n').filter(l => l.startsWith('FAIL:')).forEach(l => console.log('        ' + l));
  }
}
console.log('\n' + '-'.repeat(50));
console.log('Files: ' + files.length + '   Checks passed: ' + total);
if (failedFiles.length) { console.log('FAILING FILES: ' + failedFiles.join(', ')); process.exit(1); }
console.log('ALL GREEN');
