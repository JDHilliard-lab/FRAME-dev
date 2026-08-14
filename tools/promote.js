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
//   * not a merge, because the two repos' histories diverged long ago and merging them
//     would drag every dev commit into the stable history, where nobody wants to read
//     fifteen "fix the thing I broke an hour ago" messages;
//   * not a force-push, because that would throw away the stable repo's history, and the
//     one thing a stable site owes you is the ability to go back.
// So the stable repo gets one honest commit per release - "Release v16.97" - whose tree is
// exactly what was tested here, and `git revert` on it puts the old site back.
//
// THE TWO SITES RUN BYTE-IDENTICAL FILES. APP_BUILD is derived from the URL (see the top
// of app.js), so there is no line to flip on the way over. That is deliberate: a file that
// must differ between the two repos forever is the file that eventually gets promoted by
// mistake, and then the dev site is wearing a green dot.
//
// EVERY GIT CALL PASSES AN ARGUMENT ARRAY, never a command string. execSync goes through
// cmd.exe on Windows, where `^` is the escape character - so an unquoted HEAD^{tree}
// arrives at git as HEAD{tree} and the script dies on its own revision syntax. Arrays skip
// the shell entirely and the same code runs the same way on both platforms.
const { execFileSync } = require('child_process');
const fs = require('fs');

const REMOTE = 'stable';
const REMOTE_URL = 'https://github.com/JDHilliard-lab/FRAME.git';
const doPush = process.argv.indexOf('--push') >= 0;

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const say = (s) => process.stdout.write(s + '\n');
const die = (s) => { process.stdout.write('\nSTOPPED: ' + s + '\n'); process.exit(1); };

// 1. The working tree must be clean. Promoting is publishing, and publishing something
//    that only exists on this machine is how a site ends up in a state no commit describes.
if (git(['status', '--porcelain'])) die('the working tree has uncommitted changes. Commit them first.');

// 2. Dev must be pushed. If the stable site were built from a commit the dev repo has
//    never seen, there would be no way to get back to it.
git(['fetch', 'origin', 'main']);
const head = git(['rev-parse', 'HEAD']);
if (head !== git(['rev-parse', 'origin/main'])) die('HEAD is not what origin/main points at. Push to FRAME-dev first.');

// 3. The suite must be green. This is the gate that matters: the stable site is what
//    designers open, and "it was green when I wrote it" is not the same as green now.
say('Running the suite...');
let out = '';
try { out = execFileSync(process.execPath, ['tests/run-all.js'], { encoding: 'utf8' }); }
catch (e) { out = String((e.stdout || '') + (e.stderr || '')); }
const tail = out.split('\n').filter(Boolean).slice(-2).join(' | ');
if (out.indexOf('ALL GREEN') < 0) die('the suite is not green.\n' + tail);
say('  ' + tail);

// 4. Version, read from the file rather than passed in, so a release cannot be
//    mislabelled by a typo on the command line.
const version = (fs.readFileSync('app.js', 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1];
if (!version) die('could not read APP_VERSION from app.js.');
// The stylesheet is cache-busted by the version; if the two disagree a browser serves an
// old stylesheet next to a fresh app.js, which is a failure this project already has a
// test for. Checked again here because promoting is the last chance to catch it.
if (fs.readFileSync('index.html', 'utf8').indexOf('style.css?v=' + version) < 0) {
    die('index.html does not link style.css?v=' + version + '.');
}

// Remote check in JS, not a shell `||` fallback: that is bash syntax, and this has to run
// on Windows too.
if (git(['remote']).split(/\s+/).indexOf(REMOTE) < 0) git(['remote', 'add', REMOTE, REMOTE_URL]);
git(['fetch', REMOTE, 'main']);
const stableHead = git(['rev-parse', REMOTE + '/main']);
const tree = git(['rev-parse', 'HEAD^{tree}']);
const stableTree = git(['rev-parse', REMOTE + '/main^{tree}']);

say('');
say('  dev    ' + head.slice(0, 8) + '  v' + version);
say('  stable ' + stableHead.slice(0, 8));
if (tree === stableTree) { say('\nThe stable site already runs this exact tree. Nothing to do.'); process.exit(0); }

const diff = git(['diff', '--stat', REMOTE + '/main', 'HEAD', '--', '.', ':(exclude)tests', ':(exclude)CLAUDE.md']);
say('\nWhat would change on the stable site (tests and CLAUDE.md left out of this summary):');
say(diff.split('\n').slice(-12).join('\n'));

if (!doPush) {
    say('\nDry run - nothing was pushed. To publish:');
    say('  node tools/promote.js --push');
    process.exit(0);
}

// The snapshot commit: dev's tree, stable's history.
const msg = 'Release v' + version + '\n\nPromoted from FRAME-dev ' + head.slice(0, 12) + '.\n'
    + 'The tree is byte-identical to the dev build at that commit; APP_BUILD is\n'
    + 'derived from the URL, so this serves as prod with no file differing.\n';
const commit = git(['commit-tree', tree, '-p', stableHead, '-m', msg]);
git(['push', REMOTE, commit + ':main']);
say('\nPushed ' + commit.slice(0, 8) + ' to ' + REMOTE + '/main.');
say('Live shortly at https://jdhilliard-lab.github.io/FRAME/');
say('Hard-refresh; the pill should read v' + version + ' with a GREEN dot.');
