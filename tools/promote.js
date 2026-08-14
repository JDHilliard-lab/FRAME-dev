// Promote the current dev build to the STABLE site.
//
//   node tools/promote.js            # check everything, show what would happen, stop
//   node tools/promote.js --push     # actually publish
//
//   dev    https://jdhilliard-lab.github.io/FRAME-dev/   <- JDHilliard-lab/FRAME-dev
//   stable https://jdhilliard-lab.github.io/FRAME/       <- JDHilliard-lab/FRAME
//
// WHAT IT DOES. It takes the TREE of the current dev commit and writes it as a single
// commit on top of the stable repo's main, then pushes that. It is not a merge and not a
// force-push:
//   • not a merge, because the two repos' histories diverged long ago and merging them
//     would drag every dev commit into the stable history, where nobody wants to read
//     fifteen "fix the thing I broke an hour ago" messages;
//   • not a force-push, because that would throw away the stable repo's history, and the
//     one thing a stable site owes you is the ability to go back.
// So the stable repo gets one honest commit per release - "Release v16.96" - whose tree is
// exactly what was tested here, and `git revert` on it puts the old site back.
//
// THE TWO SITES RUN BYTE-IDENTICAL FILES. APP_BUILD is derived from the URL (see the top
// of app.js), so there is no line to flip on the way over. That is deliberate: a file that
// must differ between the two repos forever is the file that eventually gets promoted by
// mistake, and then the dev site is wearing a green dot.
const { execSync } = require('child_process');

const REMOTE = 'stable';
const URL = 'https://github.com/JDHilliard-lab/FRAME.git';
const doPush = process.argv.indexOf('--push') >= 0;
const sh = (cmd, opts) => execSync(cmd, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || '')).trim();
const say = (s) => process.stdout.write(s + '\n');
const die = (s) => { process.stdout.write('\nSTOPPED: ' + s + '\n'); process.exit(1); };

// 1. The working tree must be clean. Promoting is publishing, and publishing something
//    that only exists on this machine is how a site ends up in a state no commit describes.
if (sh('git status --porcelain')) die('the working tree has uncommitted changes. Commit them first.');

// 2. Dev must be pushed. If the stable site were built from a commit the dev repo has
//    never seen, there would be no way to get back to it.
sh('git fetch origin main');
const head = sh('git rev-parse HEAD');
if (head !== sh('git rev-parse origin/main')) die('HEAD is not what origin/main points at. Push to FRAME-dev first.');

// 3. The suite must be green. This is the gate that matters: the stable site is what
//    designers open, and "it was green when I wrote it" is not the same as green now.
say('Running the suite...');
let out = '';
try { out = sh('node tests/run-all.js', { stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { out = String((e.stdout || '') + (e.stderr || '')); }
const tail = out.split('\n').slice(-3).join('\n');
if (out.indexOf('ALL GREEN') < 0) die('the suite is not green.\n' + tail);
say('  ' + tail.split('\n').filter(Boolean).join(' | '));

// 4. Version, read from the file rather than passed in, so the release can't be
//    mislabelled by a typo on the command line.
const appSrc = require('fs').readFileSync('app.js', 'utf8');
const version = (appSrc.match(/const APP_VERSION = '([^']+)'/) || [])[1];
if (!version) die('could not read APP_VERSION from app.js.');
// The stylesheet is cache-busted by the version; if they disagree a browser serves an old
// stylesheet next to a new app.js, which is the failure this project already has a test
// for. Checked again here because promoting is the last chance to catch it.
const html = require('fs').readFileSync('index.html', 'utf8');
if (html.indexOf('style.css?v=' + version) < 0) die('index.html does not link style.css?v=' + version + '.');

sh('git remote get-url ' + REMOTE + ' 2>/dev/null || git remote add ' + REMOTE + ' ' + URL, { shell: true });
sh('git fetch ' + REMOTE + ' main');
const stableHead = sh('git rev-parse ' + REMOTE + '/main');
const tree = sh('git rev-parse HEAD^{tree}');
const stableTree = sh('git rev-parse ' + REMOTE + '/main^{tree}');

say('');
say('  dev    ' + head.slice(0, 8) + '  v' + version);
say('  stable ' + stableHead.slice(0, 8));
if (tree === stableTree) { say('\nThe stable site is already running this exact tree. Nothing to do.'); process.exit(0); }
const diff = sh('git diff --stat ' + REMOTE + '/main HEAD -- . ":(exclude)tests" ":(exclude)CLAUDE.md"');
say('\nFiles that would change on the stable site (tests and CLAUDE.md excluded from this summary):');
say(diff.split('\n').slice(-12).join('\n'));

if (!doPush) {
    say('\nDry run. Re-run with --push to publish:');
    say('  node tools/promote.js --push');
    process.exit(0);
}

// The snapshot commit: dev's tree, stable's history.
const msg = 'Release v' + version + '\n\nPromoted from FRAME-dev ' + head.slice(0, 12)
    + '.\nTree is byte-identical to the dev build at that commit; APP_BUILD is derived\nfrom the URL, so this serves as prod without any file differing.\n';
const commit = sh('git commit-tree ' + tree + ' -p ' + stableHead + ' -m ' + JSON.stringify(msg));
sh('git push ' + REMOTE + ' ' + commit + ':main');
say('\nPushed ' + commit.slice(0, 8) + ' to ' + REMOTE + '/main.');
say('Live shortly at https://jdhilliard-lab.github.io/FRAME/ (hard-refresh; the pill should read v' + version + ' with a GREEN dot).');
