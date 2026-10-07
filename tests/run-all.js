// FRAME regression runner. Usage:  node tests/run-all.js
// Runs every test_*.js in this folder and reports a combined total.
// Files run IN PARALLEL (one per CPU core, override with FRAME_TEST_JOBS=n): each is
// its own node process with its own jsdom, so they cannot see each other, and run
// one at a time the suite took over ten minutes. Output is still printed in
// alphabetical order, so a run reads exactly as it did.
const fs = require('fs'), path = require('path'), os = require('os'), { execFile } = require('child_process');
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f)).sort();
const jobs = Math.max(1, parseInt(process.env.FRAME_TEST_JOBS, 10) || Math.min(8, (os.cpus() || []).length || 4));

function runOne(f) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(dir, f)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => resolve((stdout || '') + (err ? (stderr || '') : '')));
  });
}

(async () => {
  const outs = new Array(files.length);
  let next = 0;
  const worker = async () => { while (next < files.length) { const i = next++; outs[i] = await runOne(files[i]); } };
  await Promise.all(Array.from({ length: jobs }, worker));

  let total = 0; const failedFiles = [];
  files.forEach((f, i) => {
    const out = outs[i] || '';
    const pass = /^ALL PASSED \((\d+)\)/m.exec(out);
    const fail = /^(\d+) FAILURES?/m.exec(out);
    if (pass) { total += parseInt(pass[1], 10); console.log('PASS  ' + f + '  (' + pass[1] + ')'); }
    else {
      failedFiles.push(f);
      console.log('FAIL  ' + f + (fail ? '  (' + fail[1] + ' failing)' : '  (could not run)'));
      out.split('\n').filter(l => l.startsWith('FAIL:')).forEach(l => console.log('        ' + l));
    }
  });
  console.log('\n' + '-'.repeat(50));
  console.log('Files: ' + files.length + '   Checks passed: ' + total);
  if (failedFiles.length) { console.log('FAILING FILES: ' + failedFiles.join(', ')); process.exit(1); }
  console.log('ALL GREEN');
})();
