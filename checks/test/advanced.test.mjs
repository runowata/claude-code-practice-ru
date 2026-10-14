// The Advanced checks, run the way a Learner runs them: against their own
// repository with --dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { claudeArgWords, parseYaml, readWorkflow as readActions } from '../actions.mjs';
import { parseClaudeArgs, ruleList, scriptCalls } from '../claude-args.mjs';
import { callHints, RESULT, SCRIPT, savedRun, scriptBehavior, scriptCall } from '../lessons/a-4.mjs';
import { chosenWorkflow, dispatchedRun, pinnedWorkflow, RUNS, WORKFLOW, workflowLimits } from '../lessons/a-5.mjs';
import { movedComponent, personalFiles, sharedSettings, strictValidation, teamMarketplace, VALIDATE } from '../lessons/a-6.mjs';
import { boundedScript, CAPPED, cappedRun, narrowRules, runLimits, SCRIPT as RUNNER, SLICE, sliceRun, stops, strictSandbox, wideReason } from '../lessons/a-7.mjs';
import { CI, items as capstoneItems, noCommittedKey, REVIEW as REVIEW_WORKFLOW, RUN as CAPSTONE_RUN, SNAPSHOT as CAPSTONE_LISTING } from '../lessons/a-capstone.mjs';
import { nameProblem } from '../marketplace.mjs';
import { openRepo } from '../repo.mjs';
import { notRun, runStubbed, scratchPath, STUB_SESSION } from '../stub-claude.mjs';
import { readWorkflow } from '../workflow-script.mjs';
import { parseWorktrees } from '../worktrees.mjs';
import { check, commit, repo, withRepo, write } from './helpers.mjs';

const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const IGNORE = '.practice/\n.claude/worktrees/\n';
const LISTING = '.practice/a-1-worktrees.txt';

// A repository after lesson a-1: worktrees made where `claude --worktree`
// makes them, one commit in each, the listing saved while all of them
// existed, the first two branches merged, and the worktrees removed. The
// options change one step: `gitignore` is committed and `pending` written
// over it afterwards; `exclude` replaces .git/info/exclude; `globalIgnore`
// becomes the repository's excludes file, standing in for a global one;
// `listing` rewrites the saved listing, or drops it by returning null.
function parallelRepo({
  gitignore = IGNORE, pending, exclude, globalIgnore, files = {}, under = '.claude/worktrees',
  names = ['docs-pass', 'test-pass'], saveBefore = false, merge = 'each', keep = [], lock = [], prune = [],
  listing = (text) => text,
} = {}) {
  return () => {
    const dir = repo({ ...(gitignore === null ? {} : { '.gitignore': gitignore }), 'README.md': '# demo\n', ...files });
    if (exclude) write(dir, { '.git/info/exclude': exclude });
    if (globalIgnore) {
      write(dir, { '.git/global-ignore': globalIgnore });
      git(dir, 'config', 'core.excludesFile', join(dir, '.git', 'global-ignore'));
    }
    commit(dir, 'Start');
    if (pending) write(dir, { '.gitignore': pending });
    const branch = (name) => `worktree-${name.replace(/\s+/g, '-')}`;
    const path = (name) => join(dir, under, name);
    for (const name of names) git(dir, 'worktree', 'add', '-q', '-b', branch(name), `${under}/${name}`);
    const save = () => {
      const text = listing(`${git(dir, 'worktree', 'list', '--porcelain')}\n`, dir);
      if (text !== null) write(dir, { [LISTING]: text });
    };
    if (saveBefore) save();
    for (const name of names) {
      write(path(name), { [`work/${branch(name)}.txt`]: `${name}\n` });
      commit(path(name), `Work in ${name}`);
    }
    if (!saveBefore) save();
    const [first, second] = names.map(branch);
    if (merge === 'each') {
      git(dir, 'merge', '-q', '--ff-only', first);
      git(dir, 'merge', '-q', '--no-ff', '--no-edit', second);
    } else if (merge === 'octopus') {
      git(dir, 'merge', '-q', '--no-edit', first, second);
    } else if (merge === 'one') {
      git(dir, 'merge', '-q', '--ff-only', first);
    } else if (merge === 'squash') {
      for (const b of [first, second]) {
        git(dir, 'merge', '-q', '--squash', b);
        git(dir, 'commit', '-q', '-m', `Squash ${b}`);
      }
    }
    for (const name of lock) git(dir, 'worktree', 'lock', `${under}/${name}`);
    for (const name of prune) rmSync(path(name), { recursive: true, force: true });
    for (const name of names) if (![...keep, ...lock, ...prune].includes(name)) git(dir, 'worktree', 'remove', `${under}/${name}`);
    return dir;
  };
}

const a1 = (dir) => check(['a-1', '--dir', dir]);

test('a-1 passes for two worktree branches that split, merged one fast-forward and one with a merge commit, and removed', () => {
  withRepo(parallelRepo(), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
});

test('a-1 passes for both branches merged at once', () => {
  withRepo(parallelRepo({ merge: 'octopus' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
});

test('a-1 accepts the rule written with or without its slashes, or in .claude/.gitignore', () => {
  for (const options of [
    { gitignore: '.practice/\n/.claude/worktrees/\n' },
    { gitignore: '.practice/\n.claude/worktrees\n' },
    { gitignore: '.practice/\n', files: { '.claude/.gitignore': 'worktrees/\n' } },
  ]) {
    withRepo(parallelRepo(options), (dir) => {
      const { code, out } = a1(dir);
      assert.equal(code, 0, `${JSON.stringify(options)}: ${out}`);
    });
  }
});

test('a-1 is not fooled by a global excludes file that ignores .claude/', () => {
  withRepo(parallelRepo({ globalIgnore: '.claude/\n' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
  withRepo(parallelRepo({ gitignore: '.practice/\n', globalIgnore: '.claude/\n' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  FAIL  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n        Ни один закоммиченный `\.gitignore` не игнорирует `\.claude\/worktrees\/`\./);
    assert.match(out, /Правило в вашем глобальном файле исключений git не считается/);
  });
});

test('a-1 fails when only .git/info/exclude ignores the folder', () => {
  withRepo(parallelRepo({ gitignore: '.practice/\n', exclude: '.practice/\n.claude/worktrees/\n' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  FAIL  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n        `\.claude\/worktrees\/` игнорирует только `\.git\/info\/exclude`, а git никогда не коммитит этот файл, поэтому у коллег этого правила не будет\./);
  });
});

test('a-1 reads the committed .gitignore when a rule in .git/info/exclude shadows it', () => {
  withRepo(parallelRepo({ exclude: '.practice/\n.claude/\n' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
  withRepo(parallelRepo({ gitignore: '.practice/\n.claude/\n', exclude: '.practice/\n.claude/\n' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  FAIL  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n        Строка 2 файла `\.gitignore`, `\.claude\/`, игнорирует и `\.claude\/settings\.json`, а значит, скроет настройки, которые вы делите с командой\./);
  });
});

test('a-1 fails while the rule is not committed, and says how to commit it', () => {
  withRepo(parallelRepo({ gitignore: '.practice/\n', pending: IGNORE }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Выполните `git add \.gitignore` и закоммитьте\./);
  });
});

test('a-1 still passes when the committed rule is there and .gitignore has another change pending', () => {
  withRepo(parallelRepo({ pending: `${IGNORE}dist/\n` }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
});

test('a-1 fails for a rule that also ignores the rest of .claude/, quoting it', () => {
  for (const [gitignore, pattern] of [
    ['.practice/\n.claude/\n', '.claude/'],
    ['.practice/\n.claude/*\n', '.claude/*'],
    ['.practice/\n.claude/\n!.claude/settings.json\n', '.claude/'],
    ['.practice/\n.claude/worktrees/\n.claude/*.json\n', '.claude/*.json'],
  ]) {
    withRepo(parallelRepo({ gitignore }), (dir) => {
      const { code, out } = a1(dir);
      assert.equal(code, 1, `${gitignore}: ${out}`);
      assert.ok(out.includes(`\`${pattern}\`, игнорирует и \`.claude/settings.json\``), out);
      assert.match(out, /Игнорируйте только `\.claude\/worktrees\/`/);
    });
  }
});

test('a-1 says how to save the listing when there is none, and does not pass the cleanup without it', () => {
  withRepo(parallelRepo({ listing: () => null }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /выполните `git worktree list --porcelain > \.practice\/a-1-worktrees\.txt` в основной рабочей папке/);
    assert.match(out, /FAIL {2}ни одной из этих worktrees больше нет/);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  FAIL  в `\.practice\/a-1-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n        Пока обе сессии с worktree существуют и после того, как в каждой сделан коммит, выполните `git worktree list --porcelain > \.practice\/a-1-worktrees\.txt` в основной рабочей папке\./);
  });
});

test('a-1 fails for a listing with only the main checkout in it', () => {
  withRepo(parallelRepo({ listing: (text) => `${text.split('\n\n')[0]}\n` }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  FAIL  в `\.practice\/a-1-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n        В `\.practice\/a-1-worktrees\.txt` нет ни одной worktree в `\.claude\/worktrees\/`\./);
    assert.match(out, /claude --worktree <name>/);
  });
});

test('a-1 counts only the worktrees under .claude/worktrees/, and says why', () => {
  withRepo(parallelRepo({ gitignore: `${IGNORE}wt/\n`, under: 'wt' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Там есть также `[^`]*\/wt\/docs-pass`/);
    assert.match(out, /проверка считает только worktrees, которые создаёт `claude --worktree <name>`/);
  });
});

test('a-1 fails for a listing saved before both sessions committed', () => {
  const oneCommitted = (text, dir) => text.replace(git(dir, 'rev-parse', 'worktree-test-pass'), git(dir, 'rev-parse', 'HEAD'));
  for (const options of [{ saveBefore: true }, { listing: oneCommitted }]) {
    withRepo(parallelRepo(options), (dir) => {
      const { code, out } = a1(dir);
      assert.equal(code, 1, out);
      assert.match(out, /список сохранён до того, как обе сессии сделали коммиты/);
    });
  }
});

test('a-1 fails for a listing that names a commit this repository does not have', () => {
  const elsewhere = (text, dir) => text.replace(git(dir, 'rev-parse', 'worktree-docs-pass'), 'f'.repeat(40));
  withRepo(parallelRepo({ listing: elsewhere }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /указан коммит fffffff, которого нет в этом репозитории/);
  });
});

test('a-1 fails while one branch is not merged, naming it', () => {
  withRepo(parallelRepo({ merge: 'one' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  FAIL  в `\.practice\/a-1-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n        `worktree-test-pass` не влита в вашу текущую ветку\./);
    assert.match(out, /В основной рабочей папке выполните `git merge worktree-test-pass`\./);
  });
});

test('a-1 fails for squash merges, which copy the commits', () => {
  withRepo(parallelRepo({ merge: 'squash' }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  FAIL  в `\.practice\/a-1-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n        `worktree-docs-pass` и `worktree-test-pass` не влиты в вашу текущую ветку\./);
    assert.match(out, /Squash-слияние/);
  });
});

test('a-1 passes when any two of the listed worktrees split and are merged, and leaves a third one alone', () => {
  withRepo(parallelRepo({ names: ['docs-pass', 'test-pass', 'spare'], keep: ['spare'] }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
});

test('a-1 fails while a worktree still exists, with the command that removes it', () => {
  withRepo(parallelRepo({ keep: ['test-pass'] }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Пройдено 2 из 3/);
    assert.match(out, /\/\.claude\/worktrees\/test-pass` ещё существует: когда её ветка влита, выполните `git worktree remove [^`]*\/\.claude\/worktrees\/test-pass`/);
  });
});

test('a-1 says to unlock a locked worktree first, and to prune one whose folder is gone', () => {
  withRepo(parallelRepo({ lock: ['test-pass'] }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /ещё существует и заблокирована: выполните `git worktree unlock [^`]*test-pass`, затем `git worktree remove [^`]*test-pass`/);
  });
  withRepo(parallelRepo({ prune: ['test-pass'] }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-1  Параллельные сессии с worktrees\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  PASS  в `\.practice\/a-1-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n  FAIL  ни одной из этих worktrees больше нет\n        git всё ещё показывает `[^`\s]*`, хотя её папки уже нет: выполните `git worktree prune`\./);
  });
});

test('a-1 reads a path with spaces, and quotes it in the command it gives', () => {
  withRepo(parallelRepo({ names: ['docs pass', 'test-pass'], keep: ['docs pass'] }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Пройдено 2 из 3/);
    assert.match(out, /выполните `git worktree remove "[^`"]*\/\.claude\/worktrees\/docs pass"`/);
  });
});

// The listing as Windows PowerShell 5.1 saves it: UTF-16 with a byte-order
// mark and CRLF line ends, with Windows paths, plus records for a detached,
// locked worktree outside .claude/worktrees/ and a bare repository.
function fromWindows(text, dir) {
  const head = git(dir, 'rev-parse', 'HEAD');
  const records = text.replaceAll(realpathSync(dir), 'C:/Users/Jo Doe/repo').trimEnd().split('\n')
    .map((line) => (line.startsWith('worktree ') ? line.replace(/\//g, '\\') : line));
  records.push('', 'worktree C:\\Users\\Jo Doe\\review', `HEAD ${head}`, 'detached', 'locked "kept by\\na review tool"', '', 'worktree C:\\Users\\Jo Doe\\mirror.git', 'bare', '');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(records.join('\r\n'), 'utf16le')]);
}

test('a-1 reads a listing saved by Windows PowerShell, with Windows paths and extra records', () => {
  withRepo(parallelRepo({ listing: fromWindows }), (dir) => {
    const { code, out } = a1(dir);
    assert.equal(code, 0, out);
  });
});

test('the worktree parser keeps each record\'s flags and drops refs/heads/', () => {
  const sha = 'a'.repeat(40);
  const text = [
    `worktree /repo`, `HEAD ${sha}`, 'branch refs/heads/main', '',
    `worktree /repo/.claude/worktrees/x y`, `HEAD ${sha}`, 'detached', 'locked', '',
    `worktree /repo/.claude/worktrees/z`, `HEAD ${sha.toUpperCase()}`, 'branch refs/heads/worktree-z', 'prunable gitdir file points to non-existent location', '',
    'worktree /bare.git', 'bare', '',
  ].join('\r\n');
  const [main, xy, z, bare] = parseWorktrees(text);
  assert.deepEqual(main, { path: '/repo', head: sha, branch: 'main', bare: false, detached: false, locked: false, prunable: false });
  assert.deepEqual(xy, { path: '/repo/.claude/worktrees/x y', head: sha, branch: null, bare: false, detached: true, locked: true, prunable: false });
  assert.equal(z.head, sha);
  assert.equal(z.branch, 'worktree-z');
  assert.equal(z.prunable, true);
  assert.deepEqual([bare.bare, bare.head], [true, null]);
});

test('a-1 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(() => {
    const dir = repo({ '.gitignore': '.practice/\nnode_modules/\n', 'README.md': '# demo\n' });
    commit(dir, 'Start');
    return dir;
  }, (dir) => {
    const { code, out } = check(['a-1', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  withRepo(parallelRepo(), (dir) => {
    const { code, out } = check(['a-1', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// A repository after lesson a-2: the four choices written down, and the log
// the lesson's SubagentStart hook wrote while job 1 ran as parallel
// subagents, one `agent_id<TAB>agent_type` line per start. The options
// replace a file, or leave it out when null.
const CHOSEN = [
  '1: subagents because three files, one reviewer each, checked once, and only a short list comes back',
  '2: workflow because it covers every file, verifies each finding and reruns before every release',
  '3: main conversation because a typo fix is a quick, targeted change',
  '4: agent team because the investigators must challenge each other until they agree',
  '',
].join('\n');
const STARTS = 'agent-a1\tgeneral-purpose\nagent-a2\tgeneral-purpose\nagent-a3\tExplore\n';
const LOG_HOOK = `jq -r '[.agent_id, .agent_type] | @tsv' >> "$CLAUDE_PROJECT_DIR/.practice/a-2-agents.txt"`;
const HOOK_FILE = JSON.stringify({ hooks: { SubagentStart: [{ hooks: [{ type: 'command', command: LOG_HOOK }] }] } }, null, 2);

function patternRepo({ choices = CHOSEN, log = STARTS, hook = HOOK_FILE } = {}) {
  return () => {
    const dir = repo({ 'README.md': '# demo\n' });
    commit(dir, 'Start');
    for (const [path, text] of [['.practice/a-2-choices.md', choices], ['.practice/a-2-agents.txt', log], ['.practice/a-2-hook.json', hook]]) {
      if (text !== null) write(dir, { [path]: text });
    }
    return dir;
  };
}

const a2 = (dir) => check(['a-2', '--dir', dir]);
const choicesOf = (picks) => picks.map((p, i) => `${i + 1}: ${p} because it fits`).join('\n');

test('a-2 passes for the four patterns that fit and a log with three subagents', () => {
  withRepo(patternRepo(), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 0, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  PASS  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n  PASS  `\.practice\/a-2-agents\.txt` показывает запуск как минимум двух субагентов для задания 1\n\nПройдено 2 из 2/);
  });
});

test('a-2 reads the log the lesson\'s hook writes, counting a resumed subagent once', () => {
  withRepo(patternRepo({ log: null }), (dir) => {
    const hook = (id, type) => execFileSync('sh', ['-c', LOG_HOOK], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({ session_id: 'abc123', cwd: dir, hook_event_name: 'SubagentStart', agent_id: id, agent_type: type }),
    });
    hook('agent-abc123', 'Explore');
    hook('agent-abc123', 'Explore');
    let { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /В нём один субагент, `agent-abc123`, запущенный 2 раз: возобновлённый Claude субагент снова пишет свой id, поэтому он считается один раз\./);
    hook('agent-def456', 'fork');
    ({ code, out } = a2(dir));
    assert.equal(code, 0, out);
  });
});

test('a-2 accepts the choices written as list items, with job labels, bold and other separators', () => {
  const choices = [
    '# My choices',
    '',
    'Job 1 - Subagents, one per file',
    '- **2:** dynamic workflow, since it reruns',
    '3. main session because it is one line',
    '4) Agent teams: they argue it out',
  ].join('\n');
  withRepo(patternRepo({ choices }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 0, out);
  });
});

test('a-2 accepts a table, task boxes, articles and quoted pattern names', () => {
  for (const choices of [
    '| Job | Pattern | Why |\n|---|---|---|\n| 1 | subagents | few files |\n| 2 | workflow | rerun |\n| 3 | main conversation | quick |\n| 4 | agent team | debate |\n',
    '- [x] 1: `subagents` because few\n- [x] 2: a dynamic workflow because rerun\n- [x] 3: the main conversation because quick\n- [x] 4: an agent team because debate\n',
    '(1) "sub-agents" because few\n(2) Workflow because rerun\n(3) one conversation because quick\n(4) agent-team because debate\n',
  ]) {
    withRepo(patternRepo({ choices }), (dir) => {
      const { code, out } = a2(dir);
      assert.equal(code, 0, `${choices}\n${out}`);
    });
  }
});

test('a-2 skips other lines for a job once one of its lines names a pattern', () => {
  const jobs = '1. Check the three largest source files\n2. Run the same check on every source file\n3. Fix a typo in one error message\n4. Three investigators each test a different theory\n\n';
  withRepo(patternRepo({ choices: `${jobs}${CHOSEN}` }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 0, out);
  });
});

test('a-2 reads files saved with CRLF line ends, a UTF-8 byte-order mark, or as UTF-16 by Windows PowerShell', () => {
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
  for (const options of [
    { choices: CHOSEN.replace(/\n/g, '\r\n'), log: STARTS.replace(/\n/g, '\r\n') },
    { choices: `﻿${CHOSEN}`, log: `﻿${STARTS}` },
    { choices: utf16(CHOSEN), log: utf16(STARTS) },
  ]) {
    withRepo(patternRepo(options), (dir) => {
      const { code, out } = a2(dir);
      assert.equal(code, 0, out);
    });
  }
});

test('a-2 says where to save the choices and in what form when there are none', () => {
  withRepo(patternRepo({ choices: null }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  FAIL  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n        Нет файла `\.practice\/a-2-choices\.md`\./);
    assert.match(out, /PASS {2}`\.practice\/a-2-agents\.txt`/);
  });
  withRepo(patternRepo({ choices: 'subagents, then a workflow, then the main conversation, then a team\n' }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /нет ни одной строки, которая начинается с номера задания/);
  });
});

test('a-2 names each job that has no line', () => {
  const lines = CHOSEN.split('\n');
  withRepo(patternRepo({ choices: [lines[0], lines[1], lines[3]].join('\n') }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  FAIL  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n        В `\.practice\/a-2-choices\.md` нет строки для задания 3\./);
  });
  withRepo(patternRepo({ choices: [lines[0], lines[2]].join('\n') }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  FAIL  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n        В `\.practice\/a-2-choices\.md` нет строки для заданий 2 и 4\./);
  });
});

test('a-2 names the chart question that settles each job picked wrongly', () => {
  const Q1 = 'Справится ли один разговор, не переполнившись?';
  const Q2 = 'Должны ли исполнители общаться друг с другом?';
  const Q3 = 'Нужны ли много агентов, перекрёстная проверка находок или повторный запуск?';
  for (const [picks, expected] of [
    [['main conversation', 'main conversation', 'subagents', 'main conversation'], [
      `Заданию 1 не подходит схема: основной разговор (main conversation). ${Q1} Нет: чтение файлов в вашем разговоре его переполнит, а нужны только находки.`,
      `Заданию 2 не подходит схема: основной разговор (main conversation). ${Q1} Нет: проверяется каждый исходный файл.`,
      `Заданию 3 не подходит схема: субагенты (subagents). ${Q1} Да: исправить опечатку — быстрая точечная правка`,
      `Заданию 4 не подходит схема: основной разговор (main conversation). ${Q1} Нет: три исследователя работают одновременно`,
    ]],
    [['agent team', 'agent team', 'workflow', 'subagents'], [
      `Заданию 1 не подходит схема: agent team. ${Q2} Нет: каждый рецензент проверяет свой файл`,
      `Заданию 2 не подходит схема: agent team. ${Q2} Нет: каждая находка сверяется с кодом`,
      `Заданию 3 не подходит схема: workflow. ${Q1} Да:`,
      `Заданию 4 не подходит схема: субагенты (subagents). ${Q2} Да: исследователи пишут друг другу по ходу работы, чтобы оспаривать находки друг друга`,
    ]],
    [['workflow', 'subagents', 'agent team', 'workflow'], [
      `Заданию 1 не подходит схема: workflow. ${Q3} Нет: три файла, одна проверка`,
      `Заданию 2 не подходит схема: субагенты (subagents). ${Q3} Да: проверяется каждый исходный файл, каждая находка перепроверяется, и всё запускается заново перед каждым релизом`,
      `Заданию 3 не подходит схема: agent team. ${Q1} Да:`,
      `Заданию 4 не подходит схема: workflow. ${Q2} Да:`,
    ]],
  ]) {
    withRepo(patternRepo({ choices: choicesOf(picks) }), (dir) => {
      const { code, out } = a2(dir);
      assert.equal(code, 1, out);
      for (const text of expected) assert.ok(out.includes(text), `${picks}: missing "${text}" in ${out}`);
      assert.match(out, /Подходит: субагенты \(subagents\)\./);
      assert.match(out, /Подходит: workflow\./);
      assert.match(out, /Подходит: основной разговор \(main conversation\)\./);
      assert.match(out, /Подходит: agent team\./);
    });
  }
});

test('a-2 fails for a pattern that is not one of the four, or no pattern, and lists the four', () => {
  withRepo(patternRepo({ choices: CHOSEN.replace('1: subagents', '1: delegate to helpers').replace(/^2: .*$/m, '2:') }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  FAIL  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n        Строка задания 1 начинается с «delegate to helpers», а это не одна из четырёх схем\. Сразу после номера задания напишите `main conversation`, `subagents`, `workflow` или `agent team`\./);
    assert.match(out, /a-2  Выберите схему оркестрации\n  FAIL  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n        Строка задания 1 начинается с «delegate to helpers», а это не одна из четырёх схем\./);
  });
});

test('a-2 fails for a job with lines that pick different patterns', () => {
  withRepo(patternRepo({ choices: `${CHOSEN}1: workflow because it may grow\n` }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  FAIL  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n        У задания 1 строки выбирают разные схемы: субагенты \(subagents\) и workflow\./);
  });
});

test('a-2 says how to start the logging session when there is no log, and to save the hook file first', () => {
  withRepo(patternRepo({ log: null }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-2  Выберите схему оркестрации\n  PASS  `\.practice\/a-2-choices\.md` выбирает для каждого задания самую дешёвую подходящую схему\n  FAIL  `\.practice\/a-2-agents\.txt` показывает запуск как минимум двух субагентов для задания 1\n        Нет файла `\.practice\/a-2-agents\.txt`\. Запустите сессию с `claude --settings \.practice\/a-2-hook\.json`, затем выполните задание 1\./);
  });
  withRepo(patternRepo({ log: null, hook: null }), (dir) => {
    const { code, out } = a2(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Сохраните файл хука из раздела «Ваша очередь» урока как `\.practice\/a-2-hook\.json`, запустите сессию с `claude --settings \.practice\/a-2-hook\.json`, затем выполните задание 1\./);
  });
});

test('a-2 points at jq for an empty log, ignoring blank lines', () => {
  for (const log of ['', '\n\n  \n']) {
    withRepo(patternRepo({ log }), (dir) => {
      const { code, out } = a2(dir);
      assert.equal(code, 1, out);
      assert.match(out, /Команда хука создаёт файл до запуска `jq`, поэтому проверьте, что `jq --version` работает, и снова выполните задание 1 в сессии, запущенной с `claude --settings \.practice\/a-2-hook\.json`\./);
    });
  }
});

test('a-2 fails for a log with one subagent, and asks for one subagent per file, in parallel', () => {
  for (const log of ['agent-a1\tgeneral-purpose\n', 'general-purpose\n\n', '\n\nagent-a1\tExplore\n\n']) {
    withRepo(patternRepo({ log }), (dir) => {
      const { code, out } = a2(dir);
      assert.equal(code, 1, out);
      assert.match(out, /В сессии, запущенной с `claude --settings \.practice\/a-2-hook\.json`, попросите по одному субагенту на файл, параллельно\./);
    });
  }
});

test('a-2 counts any agent type, a fork included, and lines from a hook that logs only the type', () => {
  for (const log of ['agent-a1\tfork\n\nagent-a2\tfork\n', 'agent-a1\tExplore\nagent-a2\tmy-reviewer\n', 'general-purpose\ngeneral-purpose\n', '\tgeneral-purpose\n\tExplore\n']) {
    withRepo(patternRepo({ log }), (dir) => {
      const { code, out } = a2(dir);
      assert.equal(code, 0, `${JSON.stringify(log)}: ${out}`);
    });
  }
});

test('a-2 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(patternRepo({ choices: null, log: null, hook: null }), (dir) => {
    const { code, out } = check(['a-2', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  withRepo(patternRepo(), (dir) => {
    const { code, out } = check(['a-2', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// A repository after lesson a-3: TODO and FIXME comments in two folders, the
// saved workflow committed in .claude/workflows/, and a report from each run
// by name. The options replace a step: `script` (null for none) is saved at
// `path` and committed unless `commitScript` is false; `globalIgnore`
// becomes the repository's excludes file, standing in for a global one;
// each report is text, a Buffer, a function of the folder, or null for none;
// `after` changes the working tree last.
const TODO_CHECK = [
  '// Run with: /todo-check on <folder>',
  'export const meta = {',
  "  name: 'todo-check',",
  "  description: 'Report the TODO and FIXME comments in a folder that still apply to the current code',",
  '  phases: [',
  "    { title: 'Find', detail: 'list every TODO and FIXME comment in the folder' },",
  "    { title: 'Verify', detail: 'one agent per comment checks it against the code' },",
  '  ],',
  '}',
  '',
  'const folder = Array.isArray(args) ? args[0] : args',
  "if (!folder) throw new Error('Name a folder: Run /todo-check on <folder>')",
  '',
  "phase('Find')",
  'const found = await agent(`List every TODO and FIXME comment under ${folder}/, each as a path from the repository root, a line number and the comment.`, {',
  "  schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object' } } } },",
  '})',
  '',
  "phase('Verify')",
  'const checked = await pipeline(found.items, (item) =>',
  '  agent(`Does the comment at ${item.path}:${item.line} still apply to the current code? ${item.text}`, {',
  '    label: `${item.path}:${item.line}`,',
  "    schema: { type: 'object', required: ['applies', 'why'], properties: { applies: { type: 'boolean' }, why: { type: 'string' } } },",
  '  }).then((verdict) => verdict && { ...item, ...verdict }),',
  ')',
  '',
  "return checked.filter((c) => c?.applies).map((c) => `${c.path}:${c.line}: ${c.why}`).join('\\n')",
  '',
].join('\n');
const TOTAL = 'export function total(items) {\n  // TODO: round to cents before summing\n  return items.reduce((sum, i) => sum + i.price, 0);\n}\n';
const TOTAL_TEST = "import { test } from 'node:test';\n\n// FIXME: cover an empty list\ntest('total', () => {});\n";
const RUN1 = 'src\n\n- `src/total.js:2`: still applies, the sum is not rounded yet.\n';
const RUN2 = 'test\n\n- test/total.test.js:3: still applies, no test covers an empty list.\n';
const WORKFLOW_PATH = '.claude/workflows/todo-check.js';

function workflowRepo({ script = TODO_CHECK, path = WORKFLOW_PATH, commitScript = true, globalIgnore, reports = [RUN1, RUN2], after } = {}) {
  return () => {
    const dir = repo({ 'README.md': '# demo\n', 'src/total.js': TOTAL, 'test/total.test.js': TOTAL_TEST });
    if (globalIgnore) {
      write(dir, { '.git/global-ignore': globalIgnore });
      git(dir, 'config', 'core.excludesFile', join(dir, '.git', 'global-ignore'));
    }
    commit(dir, 'Start');
    for (const [i, text] of (Array.isArray(script) ? script : [script]).entries()) {
      if (text === null) continue;
      const at = Array.isArray(path) ? path[i] : path;
      write(dir, { [at]: text });
      if (commitScript) commit(dir, `Add ${at}`, [at]);
    }
    for (const [i, report] of reports.entries()) {
      if (report !== null) write(dir, { [`.practice/a-3-run${i + 1}.md`]: typeof report === 'function' ? report(dir) : report });
    }
    after?.(dir);
    return dir;
  };
}

const a3 = (dir) => check(['a-3', '--dir', dir]);
const withMeta = (meta) => TODO_CHECK.replace(/export const meta = \{[\s\S]*?\n\}\n/, `export const meta = ${meta}\n`);

test('a-3 passes for a committed workflow that reads args and two reports on two folders', () => {
  withRepo(workflowRepo(), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 0, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  PASS  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n  PASS  каждый указанный `path:line` существует и содержит `TODO` или `FIXME`\n\nПройдено 3 из 3/);
  });
});

test('a-3 accepts a workflow in a package\'s own .claude/workflows/, and comments before meta', () => {
  const commented = `/*\n * Finds TODO and FIXME comments.\n */\n\n// Run with: /todo-check on src\n${TODO_CHECK}`;
  withRepo(workflowRepo({ script: commented, path: 'packages/web/.claude/workflows/todo-check.js' }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 0, out);
  });
});

test('a-3 says how to save a workflow when there is none', () => {
  withRepo(workflowRepo({ script: null }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        В `\.claude\/workflows\/` нет скрипта workflow\. Когда запуск workflow закончится, выполните `\/workflows`, выберите запуск, нажмите `s`, оставьте расположение проекта `\.claude\/workflows\/` и нажмите `Enter`\./);
  });
});

test('a-3 says to commit a workflow that is only in the working tree, naming the rule that ignores it', () => {
  withRepo(workflowRepo({ commitScript: false }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` не закоммичен\. Выполните `git add \.claude\/workflows\/todo-check\.js` и закоммитьте его\./);
  });
  withRepo(workflowRepo({ commitScript: false, globalIgnore: '.claude/\n' }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` не закоммичен, а строка 1 файла `[^`\s]*`, `\.claude\/`, его игнорирует\./);
  });
});

test('a-3 reads only .js files directly in .claude/workflows/, and says where to move another', () => {
  for (const path of ['.claude/workflows/todo-check.mjs', '.claude/workflows/team/todo-check.js']) {
    withRepo(workflowRepo({ path }), (dir) => {
      const { code, out } = a3(dir);
      assert.equal(code, 1, `${path}: ${out}`);
      assert.ok(out.includes(`\`${path}\` лежит в \`.claude/workflows/\`, но проверка читает только \`.js\`-файлы прямо в этой папке`), out);
      assert.match(out, /Переместите его в `\.claude\/workflows\/todo-check\.js` и закоммитьте\./);
    });
  }
});

test('a-3 fails when meta is not the script\'s first statement', () => {
  withRepo(workflowRepo({ script: `const folder = args\n${TODO_CHECK}` }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` не начинается с `export const meta`: код начинается с `const folder = args`\./);
  });
});

test('a-3 fails for a meta with anything but literal values, naming it and the line', () => {
  for (const [meta, what] of [
    ["{\n  ...base,\n  name: 'todo-check',\n  description: 'Report TODOs',\n}", 'Строка 3 файла `.claude/workflows/todo-check.js`: `meta` содержит spread, `...`.'],
    ["{\n  name: 'todo-check',\n  description: describe('todo'),\n}", '`meta` содержит вызов функции, `describe(...)`.'],
    ["{\n  name: NAME,\n  description: 'Report TODOs',\n}", '`meta` содержит переменную, `NAME`.'],
    ["{\n  name,\n  description: 'Report TODOs',\n}", '`meta` содержит переменную, `name`.'],
    ["{\n  name: 'todo-check',\n  description: `Report ${KIND}`,\n}", '`meta` содержит шаблонную строку с `${...}`.'],
    ["{\n  name: 'todo-' + 'check',\n  description: 'Report TODOs',\n}", '`meta` содержит выражение, `+`.'],
    ["{\n  name: 'todo-check',\n  description: () => 'Report TODOs',\n}", 'Строка 4 файла `.claude/workflows/todo-check.js`: `meta` содержит функцию.'],
    ["makeMeta('todo-check')", '`meta` содержит не литерал объекта.'],
  ]) {
    withRepo(workflowRepo({ script: withMeta(meta) }), (dir) => {
      const { code, out } = a3(dir);
      assert.equal(code, 1, `${meta}: ${out}`);
      assert.ok(out.includes(what), `${meta}: missing "${what}" in ${out}`);
      assert.match(out, /Claude Code убирает `\/<name>` из автодополнения `\/`/);
    });
  }
});

test('a-3 fails for a meta without a name or a description', () => {
  withRepo(workflowRepo({ script: withMeta("{ name: 'todo-check' }") }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        В `meta` файла `\.claude\/workflows\/todo-check\.js` нужна непустая строка `description`\./);
  });
  withRepo(workflowRepo({ script: withMeta("{ name: '', description: 42 }") }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        В `meta` файла `\.claude\/workflows\/todo-check\.js` нужны непустая строка `name` и непустая строка `description`\./);
  });
});

test('a-3 prints a compile error with its line, and never runs the script', () => {
  const broken = `${TODO_CHECK}const late = await agent(\nlet x = 1\n`;
  const lines = broken.split('\n').length - 1;
  withRepo(workflowRepo({ script: broken }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.ok(out.includes(`не компилируется (строка ${lines}): missing ) after argument list`), out);
  });
  const touches = "export const meta = { name: 'x', description: 'Touches a file' }\nrequire('node:fs').writeFileSync('ran.txt', 'ran')\nreturn args\n";
  withRepo(workflowRepo({ script: touches }), (dir) => {
    a3(dir);
    assert.equal(execFileSync('ls', [dir], { encoding: 'utf8' }).includes('ran.txt'), false);
  });
});

test('a-3 fails when the script never reads the args global, saying why', () => {
  const noArgs = TODO_CHECK.replace('const folder = Array.isArray(args) ? args[0] : args', "const folder = 'src'");
  for (const [script, why] of [
    [noArgs, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` нигде не читает `args`, поэтому не может принять папку на вход\./],
    [noArgs.replace("const folder = 'src'", "// TODO: read the folder from args\nconst folder = 'args'"), /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` упоминает `args` только в комментарии, строке или имени свойства, поэтому входные данные не читает\./],
    [noArgs.replace("const folder = 'src'", "const folder = options.args\nconst options = { args: 'src' }"), /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` упоминает `args` только в комментарии, строке или имени свойства, поэтому входные данные не читает\./],
    [noArgs.replace("const folder = 'src'", "const args = 'src'\nconst folder = args"), /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        В строке 11 файла `\.claude\/workflows\/todo-check\.js` объявлен собственный `args`, который скрывает входные данные, передаваемые workflow\./],
  ]) {
    withRepo(workflowRepo({ script }), (dir) => {
      const { code, out } = a3(dir);
      assert.equal(code, 1, out);
      assert.match(out, why);
      assert.match(out, /Выполните `\/workflow-authoring`, попросите Claude изменить скрипт так, чтобы он читал папку из `args`, выполните `\/reload-skills` и закоммитьте\./);
    });
  }
});

test('a-3 counts args read in a template, a ternary, a call or an object shorthand', () => {
  for (const read of ['const folder = `${args}`', 'const folder = args ? args : "src"', 'const folder = String(args)', 'const { folder } = { folder: args }', 'const input = { args }; const folder = input.args']) {
    withRepo(workflowRepo({ script: TODO_CHECK.replace('const folder = Array.isArray(args) ? args[0] : args', read) }), (dir) => {
      const { code, out } = a3(dir);
      assert.equal(code, 0, `${read}: ${out}`);
    });
  }
});

test('a-3 points out uncommitted changes to a committed script that fails', () => {
  const noArgs = TODO_CHECK.replace('const folder = Array.isArray(args) ? args[0] : args', "const folder = 'src'");
  withRepo(workflowRepo({ script: noArgs, after: (dir) => write(dir, { [WORKFLOW_PATH]: TODO_CHECK }) }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` нигде не читает `args`, поэтому не может принять папку на вход\./);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` нигде не читает `args`, поэтому не может принять папку на вход\./);
  });
});

test('a-3 passes when any committed script meets the item, and otherwise speaks of the one that got furthest', () => {
  const noArgs = TODO_CHECK.replace('const folder = Array.isArray(args) ? args[0] : args', "const folder = 'src'");
  const paths = ['.claude/workflows/a-first.js', '.claude/workflows/b-second.js'];
  withRepo(workflowRepo({ script: [`const x = 1\n${TODO_CHECK}`, TODO_CHECK], path: paths }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 0, out);
  });
  withRepo(workflowRepo({ script: [`const x = 1\n${TODO_CHECK}`, noArgs], path: paths }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/b-second\.js` нигде не читает `args`, поэтому не может принять папку на вход\./);
    assert.doesNotMatch(out, /a-first/);
  });
  withRepo(workflowRepo({ script: noArgs, after: (dir) => write(dir, { '.claude/workflows/fixed.js': TODO_CHECK }) }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  FAIL  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n        `\.claude\/workflows\/todo-check\.js` нигде не читает `args`, поэтому не может принять папку на вход\./);
  });
});

test('a-3 says where to save the reports when there are none, and which one is missing', () => {
  withRepo(workflowRepo({ reports: [null, null] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        Отчётов пока нет\./);
    assert.match(out, /Отчётов для чтения пока нет/);
  });
  withRepo(workflowRepo({ reports: [RUN1, null] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        Нет файла `\.practice\/a-3-run2\.md`\./);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        Нет файла `\.practice\/a-3-run2\.md`\./);
  });
  withRepo(workflowRepo({ reports: [RUN1, '\n  \n'] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        `\.practice\/a-3-run2\.md` пуст\./);
  });
});

test('a-3 finds the folder on a heading, in backticks, with ./ or a trailing slash, or after a label', () => {
  for (const first of ['# src', '## `src/`', './src', 'src\\', '**Folder:** `src/`', 'TODO and FIXME report for src.']) {
    withRepo(workflowRepo({ reports: [RUN1.replace(/^src/, first), RUN2] }), (dir) => {
      const { code, out } = a3(dir);
      assert.equal(code, 0, `${first}: ${out}`);
    });
  }
  withRepo(workflowRepo({ reports: [(dir) => RUN1.replace(/^src/, `${dir}/src`), RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 0, out);
  });
});

test('a-3 fails when both reports name the same folder, however it is written', () => {
  withRepo(workflowRepo({ reports: [RUN1, RUN1.replace(/^src/, './src/')] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        Оба отчёта называют `src`\./);
  });
});

test('a-3 fails for a first line that names no folder, or the repository\'s root', () => {
  withRepo(workflowRepo({ reports: [RUN1.replace(/^src/, '# TODO report'), RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        Первая строка `\.practice\/a-3-run1\.md`, «# TODO report», не называет ни одной папки этого репозитория\./);
  });
  withRepo(workflowRepo({ reports: [RUN1.replace(/^src/, '.'), RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        В первой строке `\.practice\/a-3-run1\.md` указан корень репозитория\./);
  });
});

test('a-3 reads citations in backticks, with ./, with backslashes, as a full path, with a column and as a link, and skips URLs and times', () => {
  const forms = (dir) => [
    '# src',
    '',
    '- `src/total.js:2`',
    '- ./src/total.js:2: rounds',
    '- src\\total.js:2',
    `- ${dir}/src/total.js:2`,
    '- **src/total.js:2:5**',
    '- [total.js](src/total.js#L2)',
    '- at:src/total.js:2',
    '',
    'Served at http://localhost:8080 and localhost:3000 at 10:30, see https://example.com/src/a.js#L40.',
  ].join('\n');
  withRepo(workflowRepo({ reports: [forms, RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 0, out);
  });
});

test('a-3 fails for a cited file outside the report\'s folder', () => {
  withRepo(workflowRepo({ reports: [`${RUN1}- test/total.test.js:3: also applies\n`, RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        `\.practice\/a-3-run1\.md` ссылается на `test\/total\.test\.js:3` — за пределами `src\/`, папки из первой строки\./);
  });
});

test('a-3 fails for a report with no citation, and for paths written from inside the folder', () => {
  withRepo(workflowRepo({ reports: ['src\n\nNothing in this folder still applies.\n', RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        В `\.practice\/a-3-run1\.md` нет ссылок `path:line`\./);
  });
  withRepo(workflowRepo({ reports: ['src\n\n- total.js:2: still applies\n', RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        `\.practice\/a-3-run1\.md` ссылается на `total\.js:2` — путь изнутри `src\/`\./);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  FAIL  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n        `\.practice\/a-3-run1\.md` ссылается на `total\.js:2` — путь изнутри `src\/`\./);
  });
});

test('a-3 fails when a cited line moved after an edit, and says to run the workflow again', () => {
  withRepo(workflowRepo({ after: (dir) => write(dir, { 'src/total.js': `// Sums prices.\n${TOTAL}` }) }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  PASS  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n  FAIL  каждый указанный `path:line` существует и содержит `TODO` или `FIXME`\n        В `src\/total\.js:2` нет `TODO` или `FIXME`\./);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  PASS  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n  FAIL  каждый указанный `path:line` существует и содержит `TODO` или `FIXME`\n        В `src\/total\.js:2` нет `TODO` или `FIXME`\./);
  });
});

test('a-3 names up to three cited lines that fail, a missing file and a line past the end among them', () => {
  const bad = 'src\n\n- src/total.js:2\n- src/gone.js:4\n- src/total.js:40\n- src/total.js:1\n- src/total.js:3\n- src/total.js:0\n';
  withRepo(workflowRepo({ reports: [bad, RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  PASS  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n  FAIL  каждый указанный `path:line` существует и содержит `TODO` или `FIXME`\n        Нет `src\/gone\.js` для `src\/gone\.js:4`; `src\/total\.js:40` за концом файла `src\/total\.js`, в котором строк: 4; в `src\/total\.js:1` нет `TODO` или `FIXME`; и ещё 2\./);
  });
  withRepo(workflowRepo({ reports: [`${RUN1}- src/total.js:0\n`, RUN2] }), (dir) => {
    const { code, out } = a3(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-3  Запустите и сохраните dynamic workflow\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и читает входные данные из `args`\n  PASS  `\.practice\/a-3-run1\.md` и `\.practice\/a-3-run2\.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки\n  FAIL  каждый указанный `path:line` существует и содержит `TODO` или `FIXME`\n        `src\/total\.js:0` указывает на строку 0, а строки считаются с 1\./);
  });
});

test('a-3 reads reports saved with CRLF line ends, a UTF-8 byte-order mark, or as UTF-16 by Windows PowerShell', () => {
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
  for (const reports of [[RUN1.replace(/\n/g, '\r\n'), RUN2.replace(/\n/g, '\r\n')], [`\uFEFF${RUN1}`, `\uFEFF${RUN2}`], [utf16(RUN1), utf16(RUN2)]]) {
    withRepo(workflowRepo({ reports }), (dir) => {
      const { code, out } = a3(dir);
      assert.equal(code, 0, out);
    });
  }
});

test('the workflow reader can require an agent() call, as the Advanced capstone does', () => {
  const noArgs = TODO_CHECK.replace('const folder = Array.isArray(args) ? args[0] : args', "const folder = 'src'");
  assert.equal(readWorkflow(noArgs, { needAgentCall: true }).ok, true);
  assert.equal(readWorkflow(noArgs, { needArgs: true }).problem, 'args');
  const meta = "export const meta = { name: 'review', description: 'Review each file' }\n";
  for (const body of ['return args', "return tools.agent('x')", 'function agent() {}\nreturn 1', "// agent('x')\nconst s = \"agent('y')\""]) {
    assert.equal(readWorkflow(`${meta}${body}\n`, { needAgentCall: true }).problem, 'agent', body);
  }
  assert.equal(readWorkflow(`${meta}return parallel([() => agent('a'), () => agent('b')])\n`, { needAgentCall: true }).ok, true);
  assert.deepEqual(readWorkflow(`${meta}return 1\n`).meta, { name: 'review', description: 'Review each file' });
});

test('a-3 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(workflowRepo({ script: null, reports: [null, null] }), (dir) => {
    const { code, out } = check(['a-3', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  withRepo(workflowRepo(), (dir) => {
    const { code, out } = check(['a-3', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// A repository after lesson a-4: the review script committed and executable,
// and the JSON of one real run saved. The options replace a step: `script`
// (null for none) is saved with `mode` and committed unless `commitScript`
// is false; `result` (null for none) is the saved run, as an object, text or
// a Buffer; `after` changes the working tree last. The items run the script
// with a stand-in for `claude`, never Claude Code itself.
const PROMPT = 'Review this staged diff for bugs and missing tests. List each problem as file:line and one sentence, or say there are none.';
const FLAGS = '--output-format json --permission-mode dontAsk --allowedTools "Read,Grep,Glob" --max-turns 5';
const CALL = `claude -p "${PROMPT}" \\\n  ${FLAGS}`;
const REVIEW = [
  '#!/usr/bin/env bash',
  '# Review the staged diff with Claude Code and save the JSON result.',
  'set -uo pipefail',
  'out="${1:-.practice/a-4-result.json}"',
  'if git diff --cached --quiet; then echo "Nothing is staged." >&2; exit 2; fi',
  'mkdir -p "$(dirname "$out")"',
  `git diff --cached | ${CALL} > "$out"`,
  'status=$?',
  'jq -r \'.result // empty\' "$out"',
  'if [ "$status" -ne 0 ] || [ "$(jq -r \'.is_error\' "$out")" != "false" ]; then',
  '  echo "The review failed: $(jq -r \'.subtype\' "$out")" >&2; exit 1',
  'fi',
  '',
].join('\n');
const REAL_RUN = {
  type: 'result', subtype: 'success', is_error: false, num_turns: 3,
  result: 'src/total.js:2: the sum is not rounded to cents, and no test covers it.',
  session_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', total_cost_usd: 0.01, permission_denials: [],
};

// The review script with each `[from, to]` replaced.
function edited(...pairs) {
  return pairs.reduce((text, [from, to]) => {
    assert.ok(text.includes(from), `the review script has no ${JSON.stringify(from)}`);
    return text.replace(from, () => to);
  }, REVIEW);
}
const withFlags = (flags) => edited([FLAGS, flags]);
const withCall = (call) => edited([CALL, call]);

function reviewRepo({ script = REVIEW, mode = 0o755, commitScript = true, result = REAL_RUN, after } = {}) {
  return () => {
    const dir = repo({ 'README.md': '# demo\n', 'src/total.js': TOTAL });
    commit(dir, 'Start');
    if (script !== null) {
      write(dir, { [SCRIPT]: script });
      chmodSync(join(dir, SCRIPT), mode);
      if (commitScript) commit(dir, 'Add the review script', [SCRIPT]);
    }
    if (result !== null) write(dir, { [RESULT]: typeof result === 'string' || Buffer.isBuffer(result) ? result : JSON.stringify(result, null, 2) });
    after?.(dir);
    return dir;
  };
}

const a4 = (dir) => check(['a-4', '--dir', dir]);
// One item on its own, which runs only what that item needs.
const callHint = (dir) => scriptCall(SCRIPT).check(openRepo(dir));
const behaviorHint = (dir) => scriptBehavior(SCRIPT).check(openRepo(dir));
const runHint = (dir) => savedRun(RESULT, SCRIPT).check(openRepo(dir));

test('a-4 passes for the lesson\'s script, committed and executable, and a real run saved', () => {
  withRepo(reviewRepo(), (dir) => {
    const { code, out } = a4(dir);
    assert.equal(code, 0, out);
    assert.match(out, /a-4  Скрипт для Claude Code с `claude -p`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  PASS  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n  PASS  он подаёт проиндексированный дифф через конвейер, сохраняет JSON по пути из аргумента, выводит результат, завершается с ненулевым кодом при сбое запуска и не вызывает Claude, когда ничего не проиндексировано\n  PASS  `\.practice\/a-4-result\.json` содержит успешный запуск в пределах вашего лимита\n\nПройдено 4 из 4/);
  });
});

test('a-4 says to write the script, commit it or make it executable', () => {
  withRepo(reviewRepo({ script: null }), (dir) => {
    const { code, out } = a4(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-4  Скрипт для Claude Code с `claude -p`\n  FAIL  `scripts\/review-staged\.sh` закоммичен и исполняемый\n        Нет файла `scripts\/review-staged\.sh`\./);
    assert.match(out, /a-4  Скрипт для Claude Code с `claude -p`\n  FAIL  `scripts\/review-staged\.sh` закоммичен и исполняемый\n        Нет файла `scripts\/review-staged\.sh`\./);
  });
  withRepo(reviewRepo({ commitScript: false }), (dir) => {
    const { code, out } = a4(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-4  Скрипт для Claude Code с `claude -p`\n  FAIL  `scripts\/review-staged\.sh` закоммичен и исполняемый\n        `scripts\/review-staged\.sh` не закоммичен\. Выполните `git add scripts\/review-staged\.sh` и закоммитьте его\./);
  });
  withRepo(reviewRepo({ mode: 0o644 }), (dir) => {
    const { code, out } = a4(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Выполните `chmod \+x scripts\/review-staged\.sh`, затем `git add scripts\/review-staged\.sh` и закоммитьте\./);
    assert.match(out, /PASS  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n  PASS  он подаёт проиндексированный дифф через конвейер, сохраняет JSON по пути из аргумента, выводит результат, завершается с ненулевым кодом при сбое запуска и не вызывает Claude, когда ничего не проиндексировано\n  PASS  `\.practice\/a-4-result\.json` содержит успешный запуск в пределах вашего лимита\n\nПройдено 3 из 4/);
  });
});

test('a-4 runs the committed script, not the working copy, and points out uncommitted changes', () => {
  withRepo(reviewRepo({ script: withFlags(FLAGS.replace('--output-format json ', '')), after: (dir) => write(dir, { [SCRIPT]: REVIEW }) }), (dir) => {
    const hint = callHint(dir);
    assert.match(String(hint), /Он не просит JSON/);
    assert.match(String(hint), /В вашей копии `scripts\/review-staged\.sh` есть незакоммиченные изменения: если они это исправляют, закоммитьте их\./);
  });
  withRepo(reviewRepo({ after: (dir) => write(dir, { [SCRIPT]: withFlags('--max-turns 5') }) }), (dir) => {
    assert.equal(callHint(dir), true);
  });
});

// The arguments a shell passes for `flags`, written with double quotes only.
const argvOf = (flags) => [...flags.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
const flagHints = (flags, prompt = ['-p', PROMPT]) => callHints([...prompt, ...argvOf(flags)]).join(' ');

test('a-4 accepts the flags written in other forms, and the prompt after -p wherever -p is', () => {
  for (const flags of [
    FLAGS.replace('--max-turns 5', '--max-turns=5'),
    FLAGS.replace('--permission-mode dontAsk', '--permission-mode=dontAsk'),
    FLAGS.replace('--allowedTools "Read,Grep,Glob"', '--allowed-tools Read Grep Glob'),
    FLAGS.replace('"Read,Grep,Glob"', '"Read Grep Glob"'),
    FLAGS.replace('"Read,Grep,Glob"', '"Read, Grep, Glob"'),
    FLAGS.replace('"Read,Grep,Glob"', 'Read --allowedTools "Grep,Glob"'),
    FLAGS.replace('"Read,Grep,Glob"', '"Read(./src/**)" Grep'),
    FLAGS.replace('--max-turns 5', '--max-turns 10'),
    `--model sonnet ${FLAGS} --max-budget-usd 1`,
  ]) {
    assert.equal(flagHints(flags), '', flags);
  }
  assert.equal(flagHints(FLAGS, ['--print', PROMPT]), '');
  assert.equal(flagHints(FLAGS, ['--model', 'sonnet', '-p', PROMPT]), '');
  // The same, end to end: the stand-in records the call the script makes.
  for (const script of [
    withFlags('--max-turns=5 --permission-mode=dontAsk --output-format json --allowed-tools Read Grep Glob'),
    withCall(`claude --model sonnet -p "${PROMPT}" ${FLAGS}`),
  ]) {
    withRepo(reviewRepo({ script }), (dir) => {
      assert.equal(callHint(dir), true, script);
    });
  }
});

test('a-4 names each flag the call lacks or gets wrong', () => {
  for (const [flags, hint] of [
    [FLAGS.replace('--output-format json ', ''), /Он не просит JSON: добавьте `--output-format json`\./],
    [FLAGS.replace('--output-format json', '--output-format text'), /Он просит `--output-format text`: используйте `json`, чтобы скрипт мог сохранить результат и прочитать его\./],
    [FLAGS.replace('--permission-mode dontAsk ', ''), /Режим разрешений не задан: добавьте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\./],
    [FLAGS.replace('dontAsk', 'dontask'), /Пишите `dontAsk` так, как его пишет Claude Code, а не `dontask`\./],
    [FLAGS.replace('dontAsk', 'acceptEdits'), /Он работает в режиме `acceptEdits`: используйте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\./],
    [FLAGS.replace('dontAsk', 'bypassPermissions'), /Он работает в режиме `bypassPermissions`: используйте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\./],
    [`${FLAGS} --dangerously-skip-permissions`, /Уберите `--dangerously-skip-permissions`: это то же самое, что `--permission-mode bypassPermissions`\./],
    [FLAGS.replace('"Read,Grep,Glob"', '"Read,Grep,Glob,Bash"'), /В `--allowedTools` указано: `Bash` — это не `Read`, `Grep` или `Glob`\./],
    [FLAGS.replace('"Read,Grep,Glob"', '"Edit Write Read"'), /В `--allowedTools` указано: `Edit` и `Write` — это не `Read`, `Grep` или `Glob`\./],
    [FLAGS.replace('"Read,Grep,Glob"', '"Read,Bash(git diff *)"'), /указано: `Bash\(git diff \*\)` — это не/],
    [FLAGS.replace('"Read,Grep,Glob"', 'read,grep,glob'), /Пишите `Read` так, как Claude Code пишет имя инструмента, а не `read`\./],
    [FLAGS.replace('--allowedTools "Read,Grep,Glob" ', ''), /Ни один инструмент не одобрен заранее: добавьте `--allowedTools "Read,Grep,Glob"`\./],
    [FLAGS.replace('"Read,Grep,Glob"', '""'), /В `--allowedTools` нет ни одного инструмента: напишите `--allowedTools "Read,Grep,Glob"`\./],
    [FLAGS.replace('--max-turns 5', '--max-turns 0'), /`--max-turns 0` меньше 1: используйте число от 1 до 10\./],
    [FLAGS.replace('--max-turns 5', '--max-turns 11'), /`--max-turns 11` больше 10: используйте число от 1 до 10\./],
    [FLAGS.replace('--max-turns 5', '--max-turns five'), /`--max-turns five` — не целое число: используйте число от 1 до 10\./],
    [FLAGS.replace(' --max-turns 5', ''), /Лимит ходов не задан: добавьте `--max-turns` с числом от 1 до 10\./],
    [FLAGS.replace('--max-turns', '--max_turns'), /Claude Code не знает `--max_turns`, поэтому останавливается с ошибкой до начала запуска: напишите `--max-turns`\./],
    [FLAGS.replace(' 5', ''), /После `--max-turns` нет числа: напишите число от 1 до 10\./],
  ]) {
    assert.match(flagHints(flags), hint, flags);
  }
  // End to end, a misspelt flag the stand-in captured.
  withRepo(reviewRepo({ script: withFlags(FLAGS.replace('--allowedTools', '--allowedtools')) }), (dir) => {
    assert.match(String(callHint(dir)), /Ни один инструмент не одобрен заранее: добавьте `--allowedTools "Read,Grep,Glob"`\. Claude Code не знает `--allowedtools`, поэтому останавливается с ошибкой до начала запуска: напишите `--allowedTools`\./);
  });
});

test('a-4 fails a prompt that isn\'t right after -p, naming a word the tool list took', () => {
  withRepo(reviewRepo({ script: withCall(`claude -p --output-format json --permission-mode dontAsk --max-turns 5 --allowedTools "Read,Grep,Glob" "${PROMPT}"`) }), (dir) => {
    const hint = String(callHint(dir));
    assert.match(hint, /Сразу после `-p` идёт `--output-format`\. Напишите промпт сразу после `-p`, как в `claude -p "<prompt>" --output-format json \.\.\.`\. `this` — не инструмент только для чтения: после `--allowedTools` перечислите только `Read`, `Grep` и `Glob`, а промпт напишите сразу после `-p`\./);
    assert.match(hint, /`this` — не инструмент только для чтения: после `--allowedTools` перечислите только `Read`, `Grep` и `Glob`, а промпт напишите сразу после `-p`\./);
    assert.doesNotMatch(hint, /lists `Review`/);
  });
  const last = flagHints(`${FLAGS} "${PROMPT}"`, ['-p']);
  assert.match(last, /Сразу после `-p` идёт `--output-format`\. Напишите промпт сразу после `-p`, как в `claude -p "<prompt>" --output-format json \.\.\.`\./);
  assert.doesNotMatch(last, /read-only tool/);
  assert.match(flagHints(`${FLAGS} -p`, []), /После `-p` ничего нет\./);
  assert.match(flagHints(FLAGS, ['-p', ' ']), /Промпт после `-p` пуст\./);
});

test('a-4 fails a script that runs claude without -p, or never runs it, and says how it ended', () => {
  withRepo(reviewRepo({ script: withCall(`claude "${PROMPT}" ${FLAGS}`) }), (dir) => {
    assert.match(String(callHint(dir)), /При проиндексированном изменении `scripts\/review-staged\.sh` запустил `claude` без `-p` \(или `--print`\), а это открывает интерактивную сессию\./);
  });
  withRepo(reviewRepo({ script: edited([`git diff --cached | ${CALL} > "$out"`, 'echo "Claude is off today." >&2; exit 3']) }), (dir) => {
    assert.match(String(callHint(dir)), /При проиндексированном изменении `scripts\/review-staged\.sh` ни разу не запустил `claude -p`, поэтому проверка не увидела его флаги\. Он завершился с кодом 3: Claude is off today\./);
  });
});

test('a-4 checks that the script pipes in the staged diff and nothing else', () => {
  for (const [script, hint] of [
    [edited([`git diff --cached | ${CALL}`, `git diff | ${CALL}`]), /То, что он подал в `claude -p`, не содержит проиндексированного изменения\./],
    [edited([`git diff --cached | ${CALL}`, `git diff HEAD | ${CALL}`]), /Дифф, поданный в `claude -p`, содержит и непроиндексированное изменение\. Подайте `git diff --cached`: в нём только проиндексированное\./],
    [edited([`git diff --cached | ${CALL}`, `claude -p "${PROMPT} $(git diff --cached)" ${FLAGS}`]), /Он кладёт дифф в промпт\. Подайте его через конвейер/],
  ]) {
    withRepo(reviewRepo({ script }), (dir) => {
      assert.match(String(behaviorHint(dir)), hint);
    });
  }
});

test('a-4 checks where the script saves the JSON, and that it prints the review', () => {
  withRepo(reviewRepo({ script: edited(['out="${1:-.practice/a-4-result.json}"', 'out=".practice/a-4-result.json"']) }), (dir) => {
    assert.match(String(behaviorHint(dir)), /Он сохранил JSON в `\.practice\/a-4-result\.json`, хотя первый аргумент указывал другой путь\. Сохраняйте вывод `claude -p` по пути из первого аргумента, а без аргумента — в `\.practice\/a-4-result\.json`: `out="\$\{1:-\.practice\/a-4-result\.json\}"`, затем `> "\$out"`\./);
  });
  withRepo(reviewRepo({ script: edited(['out="${1:-.practice/a-4-result.json}"', 'out="$1"']) }), (dir) => {
    assert.match(String(behaviorHint(dir)), /Запущенный без аргумента, он не сохранил JSON в `\.practice\/a-4-result\.json` \(он завершился с кодом 1: scripts\/review-staged\.sh: line 4: \$1: unbound variable\)\./);
  });
  withRepo(reviewRepo({ script: edited([`> "$out"\nstatus=$?\njq -r '.result // empty' "$out"`, `| tee /dev/stderr | jq -r .result > "$out"\nstatus=$?\ncat "$out"`]) }), (dir) => {
    assert.match(String(behaviorHint(dir)), /Файл по пути из первого аргумента — не тот JSON, который вывел `claude -p`\./);
  });
  withRepo(reviewRepo({ script: edited(['jq -r \'.result // empty\' "$out"\n', '']) }), (dir) => {
    assert.match(String(behaviorHint(dir)), /Выведите поле `result` из JSON, как это делает `jq -r '\.result'`\./);
  });
});

test('a-4 checks both exit rules apart: claude exiting non-zero, and is_error', () => {
  withRepo(reviewRepo({ script: edited(['> "$out"\nstatus=$?', '> "$out" || true\nstatus=$?'], ['if [ "$status" -ne 0 ] || [ "$(jq -r \'.is_error\' "$out")" != "false" ]; then', 'if [ "$(jq -r \'.is_error\' "$out")" = "true" ]; then']) }), (dir) => {
    const hint = String(behaviorHint(dir));
    assert.match(hint, /Когда `claude -p` завершается с ненулевым кодом и не выводит JSON, как при нечитаемом флаге, скрипт завершился с кодом 0\. Завершайтесь с ненулевым кодом всегда, когда так делает `claude -p`\./);
    assert.doesNotMatch(hint, /is_error/);
  });
  withRepo(reviewRepo({ script: edited(['if [ "$status" -ne 0 ] || [ "$(jq -r \'.is_error\' "$out")" != "false" ]; then', 'if [ "$status" -ne 0 ]; then']) }), (dir) => {
    const hint = String(behaviorHint(dir));
    assert.match(hint, /Когда в JSON `"is_error": true`, а `claude -p` завершается с кодом 0, скрипт завершился с кодом 0\. Завершайтесь с ненулевым кодом всегда, когда `is_error` равен `true`: проверяйте `jq -r '\.is_error'`\./);
    assert.doesNotMatch(hint, /prints no JSON/);
  });
});

test('a-4 fails a script that calls Claude, exits 0 or says nothing when nothing is staged', () => {
  withRepo(reviewRepo({ script: edited(['if git diff --cached --quiet; then echo "Nothing is staged." >&2; exit 2; fi\n', '']) }), (dir) => {
    const hint = String(behaviorHint(dir));
    assert.match(hint, /Когда ничего не проиндексировано, он всё равно запустил `claude -p`\. Сначала проверьте наличие проиндексированного изменения, как это делает `git diff --cached --quiet`, и остановитесь до вызова Claude\./);
    assert.match(hint, /Когда ничего не проиндексировано, он завершился с кодом 0\./);
  });
  withRepo(reviewRepo({ script: edited(['if git diff --cached --quiet;', 'if git diff --quiet;']) }), (dir) => {
    assert.match(String(behaviorHint(dir)), /Когда ничего не проиндексировано, он всё равно запустил `claude -p`\./);
  });
  withRepo(reviewRepo({ script: edited(['then echo "Nothing is staged." >&2; exit 2; fi', 'then exit 0; fi']) }), (dir) => {
    const hint = String(behaviorHint(dir));
    assert.match(hint, /Когда ничего не проиндексировано, он завершился с кодом 0\./);
    assert.match(hint, /он ничего не вывел\. Сообщите, что ничего не проиндексировано\./);
    assert.doesNotMatch(hint, /still ran/);
  });
});

test('a-4 wants one claude -p call, and lets the script ask for the version first', () => {
  withRepo(reviewRepo({ script: edited(['status=$?\n', `status=$?\ngit diff --cached | ${CALL} > /dev/null\n`]) }), (dir) => {
    assert.match(String(behaviorHint(dir)), /При одном проиндексированном изменении он запустил `claude -p` 2 раз\./);
  });
  withRepo(reviewRepo({ script: edited(['set -uo pipefail\n', 'set -uo pipefail\nclaude --version > /dev/null || { echo "Install Claude Code first." >&2; exit 1; }\n']) }), (dir) => {
    const { code, out } = a4(dir);
    assert.equal(code, 0, out);
  });
});

test('a-4 refuses to run a script that could reach the real Claude Code, and runs nothing', () => {
  const outside = mkdtempSync(join(tmpdir(), 'a4-ran-'));
  const ran = join(outside, 'ran');
  try {
    for (const [script, why] of [
      [withCall(`/usr/local/bin/claude -p "${PROMPT}" ${FLAGS}`), /Но `scripts\/review-staged\.sh` вызывает Claude Code по пути `\/usr\/local\/bin\/claude`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [withCall(`"$HOME"/.local/bin/claude -p "${PROMPT}" ${FLAGS}`), /Но `scripts\/review-staged\.sh` вызывает Claude Code по пути `\/\.local\/bin\/claude`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [withCall(`npx @anthropic-ai/claude-code -p "${PROMPT}" ${FLAGS}`), /Но `scripts\/review-staged\.sh` запускает Claude Code через `npx`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [withCall(`bunx claude -p "${PROMPT}" ${FLAGS}`), /Но `scripts\/review-staged\.sh` запускает Claude Code через `bunx`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [edited(['set -uo pipefail\n', 'set -uo pipefail\nexport PATH="$HOME/.local/bin:$PATH"\n']), /a-4  Скрипт для Claude Code с `claude -p`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  FAIL  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n        Проверка запускает ваш скрипт с подставной заменой `claude`, которая находится по имени в `PATH`, поэтому ваш расход не тратится\./],
      [withCall(`bash -lc 'claude -p "${PROMPT}" ${FLAGS}'`), /Но `scripts\/review-staged\.sh` запускает login-оболочку с `-l` или `--login`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [withCall(`/bin/zsh --login -c 'claude -p "${PROMPT}" ${FLAGS}'`), /Но `scripts\/review-staged\.sh` запускает login-оболочку с `-l` или `--login`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [edited(['set -uo pipefail\n', 'set -uo pipefail\n. /etc/profile\n']), /Но `scripts\/review-staged\.sh` читает `\/etc\/profile`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [edited(['set -uo pipefail\n', 'set -uo pipefail\nsource "/etc/zprofile"\n']), /Но `scripts\/review-staged\.sh` читает `\/etc\/zprofile`, и замена этого не перехватит, поэтому проверка его не запускала\./],
      [edited(['set -uo pipefail\n', 'set -uo pipefail\neval "$(/usr/libexec/path_helper -s)"\n']), /Но `scripts\/review-staged\.sh` запускает `path_helper`, и замена этого не перехватит, поэтому проверка его не запускала\./],
    ]) {
      const marked = script.replace('set -uo pipefail\n', () => `set -uo pipefail\ntouch "${ran}"\n`);
      withRepo(reviewRepo({ script: marked }), (dir) => {
        const { code, out } = a4(dir);
        assert.equal(code, 1, out);
        assert.match(out, why);
        assert.match(out, /a-4  Скрипт для Claude Code с `claude -p`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  FAIL  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n        Проверка запускает ваш скрипт с подставной заменой `claude`, которая находится по имени в `PATH`, поэтому ваш расход не тратится\./);
        assert.equal(existsSync(ran), false, `the check ran ${script}`);
      });
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
  withRepo(reviewRepo({ script: edited(['set -uo pipefail\n', 'set -uo pipefail\n# Not /usr/local/bin/claude: the check stands in for claude on PATH.\n']) }), (dir) => {
    assert.equal(callHint(dir), true);
  });
  // A shell that isn't a login shell, and an `-l` meant for another command.
  withRepo(reviewRepo({ script: edited(['set -uo pipefail\n', 'set -uo pipefail\nbash -c \'ls -l src\' > /dev/null\necho ssh -l nobody example.invalid > /dev/null\n']) }), (dir) => {
    assert.equal(callHint(dir), true);
  });
});

test('a-4 runs the script without an argument in a copy that has no .practice/ yet, and wants it to create the folder', () => {
  withRepo(reviewRepo({ script: edited(['mkdir -p "$(dirname "$out")"\n', '']) }), (dir) => {
    assert.equal(behaviorHint(dir), 'Запущенный без аргумента в свежей копии, где `.practice/` ещё нет, он не смог записать `.practice/a-4-result.json`. Сначала создайте папку, как это делает `mkdir -p "$(dirname "$out")"`.');
  });
  withRepo(reviewRepo({ script: edited(['mkdir -p "$(dirname "$out")"', 'mkdir -p .practice']) }), (dir) => {
    assert.equal(behaviorHint(dir), true);
  });
});

test('a-4 fails a script with Windows line ends, and points at jq when it is missing', () => {
  withRepo(reviewRepo({ script: REVIEW.replace(/\n/g, '\r\n') }), (dir) => {
    const { code, out } = a4(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-4  Скрипт для Claude Code с `claude -p`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  FAIL  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n        В закоммиченном `scripts\/review-staged\.sh` окончания строк Windows \(CRLF\), и bash не может его выполнить\./);
  });
  withRepo(reviewRepo({ script: edited(['jq -r \'.result // empty\' "$out"', 'echo "scripts/review-staged.sh: line 9: jq: command not found" >&2; exit 127']) }), (dir) => {
    assert.equal(behaviorHint(dir), 'Скрипту нужен `jq`, а он не установлен. Установите его и запустите проверку снова.');
  });
});

test('a-4 reads the saved run, and says what is wrong with it', () => {
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
  for (const result of [{ ...REAL_RUN, num_turns: 6 }, utf16(JSON.stringify(REAL_RUN, null, 2)), `﻿${JSON.stringify(REAL_RUN)}`]) {
    withRepo(reviewRepo({ result }), (dir) => {
      assert.equal(runHint(dir), true);
    });
  }
  for (const [result, hint] of [
    [null, /Файла `\.practice\/a-4-result\.json` ещё нет: проиндексируйте изменение и выполните `scripts\/review-staged\.sh`, это сохранит туда JSON\./],
    ['Looks good to me.\n', /`\.practice\/a-4-result\.json` — не JSON\./],
    [{ ...REAL_RUN, type: 'assistant' }, /`\.practice\/a-4-result\.json` — не результат запуска `claude -p` с `--output-format json`\./],
    [{ ...REAL_RUN, session_id: STUB_SESSION }, /лежит подставной ответ проверки, а не настоящий запуск/],
    [{ ...REAL_RUN, subtype: 'error_max_turns', is_error: true, result: undefined }, /Запуск в `\.practice\/a-4-result\.json` остановился раньше времени \(`error_max_turns`\) и не содержит рецензии\. Поднимите лимит \(до 10\) или сузьте промпт\. Затем снова: проиндексируйте изменение и выполните `scripts\/review-staged\.sh`\./],
    [{ ...REAL_RUN, is_error: true, result: 'Not logged in · Please run /login' }, /Запуск в `\.practice\/a-4-result\.json` завершился сбоем: «Not logged in · Please run \/login»\./],
    [{ ...REAL_RUN, result: '  ' }, /В запуске в `\.practice\/a-4-result\.json` нет рецензии в `result`\./],
    [{ ...REAL_RUN, num_turns: 7 }, /Запуск в `\.practice\/a-4-result\.json` занял 7 ходов, больше, чем допускает `--max-turns 5`, значит, он шёл с более высоким лимитом\./],
  ]) {
    withRepo(reviewRepo({ result }), (dir) => {
      assert.match(String(runHint(dir)), hint, JSON.stringify(result));
    });
  }
  // Without a script to read the cap from, the cap is 10.
  withRepo(reviewRepo({ script: null, result: { ...REAL_RUN, num_turns: 11 } }), (dir) => {
    assert.equal(runHint(dir), true);
  });
});

test('the stand-in records each call\'s arguments and stdin as they were, and answers --version', () => {
  const script = '#!/usr/bin/env bash\nv=$(claude --version)\nprintf \'staged\\n\' | claude -p "$(printf \'two\\nlines\')" --model "x y" > "$1"\necho "$v"\n';
  withRepo(reviewRepo({ script }), (dir) => {
    const run = runStubbed(openRepo(dir), SCRIPT, { args: (out) => [join(out, 'reply.json')], reply: { type: 'result', session_id: STUB_SESSION } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.calls.map((c) => c.argv), [['--version'], ['-p', 'two\nlines', '--model', 'x y']]);
    assert.equal(run.calls[1].stdin, 'staged\n');
    assert.equal(JSON.parse(run.saved['out/reply.json']).session_id, STUB_SESSION);
    assert.match(run.stdout, /\(Claude Code\)/);
  });
});

test('the stand-in runs the script without the sign-in variables, with a HOME of its own', () => {
  const script = '#!/usr/bin/env bash\nprintf "%s|%s|%s|%s|%s|%s" "${ANTHROPIC_API_KEY-unset}" "${ANTHROPIC_AUTH_TOKEN-unset}" "${CLAUDE_CODE_OAUTH_TOKEN-unset}" "${ANTHROPIC_BASE_URL-unset}" "$HOME" "$CLAUDE_CONFIG_DIR" > "$1"\n';
  const fake = { ANTHROPIC_API_KEY: 'not-a-key', ANTHROPIC_AUTH_TOKEN: 'not-a-token', CLAUDE_CODE_OAUTH_TOKEN: 'not-a-token', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' };
  const before = Object.fromEntries(Object.keys(fake).map((k) => [k, process.env[k]]));
  withRepo(reviewRepo({ script }), (dir) => {
    let run;
    try {
      Object.assign(process.env, fake);
      run = runStubbed(openRepo(dir), SCRIPT, { args: (out) => [join(out, 'env.txt')] });
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    const [key, auth, token, url, home, config] = run.saved['out/env.txt'].split('|');
    assert.deepEqual([key, auth, token, url], ['unset', 'unset', 'unset', 'unset']);
    assert.match(home, /stub-claude-[^/]+\/home$/);
    assert.match(config, /stub-claude-[^/]+\/config$/);
  });
});

test('the stand-in stops a script at the time limit, with whatever the script left running', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'a4-beat-'));
  const beat = join(outside, 'beat');
  const dir = reviewRepo({ script: '#!/usr/bin/env bash\n( while :; do date > "$1"; sleep 0.1; done ) &\nsleep 30\n' })();
  try {
    const started = Date.now();
    const run = runStubbed(openRepo(dir), SCRIPT, { args: () => [beat], timeout: 1000 });
    assert.equal(run.timedOut, true);
    assert.ok(Date.now() - started < 10_000, 'the run went on past the time limit');
    const last = statSync(beat).mtimeMs;
    await wait(600);
    assert.equal(statSync(beat).mtimeMs, last, 'the background loop is still running');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('the stand-in runs nothing on Windows itself, and says to run the check from WSL 2, macOS or Linux', () => {
  const outside = mkdtempSync(join(tmpdir(), 'a4-win-'));
  const ran = join(outside, 'ran');
  try {
    withRepo(reviewRepo({ script: `#!/usr/bin/env bash\ntouch "${ran}"\n` }), (dir) => {
      const run = runStubbed(openRepo(dir), SCRIPT, { platform: 'win32' });
      assert.deepEqual(run, { windows: true });
      assert.equal(existsSync(ran), false, 'the stand-in ran the script on Windows');
      assert.equal(notRun(run, SCRIPT), 'Проверка не запускала `scripts/review-staged.sh`: скрипты она выполняет через bash и подставную замену `claude` только из WSL 2, macOS или Linux, но не из самой Windows. Запустите проверку там.');
      assert.equal(runStubbed(openRepo(dir), SCRIPT, { platform: 'linux' }).status, 0);
      assert.equal(existsSync(ran), true);
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('the argv reader takes values and lists as Claude Code does', () => {
  const p = (...argv) => parseClaudeArgs(argv);
  // A list keeps taking arguments until the next option, so it takes a
  // prompt written after it; the = form takes one value.
  assert.deepEqual(p('-p', '--allowedTools', 'Read', 'Say hi').flags.allowedTools, ['Read', 'Say hi']);
  assert.equal(p('-p', '--allowedTools', 'Read', 'Say hi').promptFirst, false);
  assert.equal(p('--allowedTools=Read', 'Say hi', '-p').prompt, 'Say hi');
  // Short flags combine; what follows -p in the same token comes next.
  assert.equal(p('-cp', 'Say hi').promptFirst, true);
  assert.deepEqual([p('-pc', 'Say hi').promptFirst, p('-pc', 'Say hi').next], [false, '-c']);
  // An optional value is the next argument unless that is an option; a
  // value is the next argument, whatever it starts with.
  assert.equal(p('-p', '--debug', 'Say hi').prompt, undefined);
  assert.equal(p('--debug', '-p', 'Say hi').prompt, 'Say hi');
  assert.equal(p('-p', 'x', '--append-system-prompt', '-be brief').flags.appendSystemPrompt, '-be brief');
  assert.equal(p('-p', 'x', '-rabc').flags.resume, 'abc');
  // Aliases share a name, a list adds up, and the last value wins.
  const r = p('-p', 'x', '--allowed-tools', 'Read', '--allowedTools', 'Grep', '--max-turns', '3', '--max-turns=5', '--max-budget-usd');
  assert.deepEqual([r.flags.allowedTools, r.flags.maxTurns, r.flags.maxBudgetUsd], [['Read', 'Grep'], '5', null]);
  assert.deepEqual(p('-p', 'x', '--allowedtools', 'Read').unknown, ['--allowedtools']);
  assert.deepEqual(p('-p', '--', '-x').operands, ['-x']);
  assert.deepEqual(ruleList(['Read, Grep', 'Bash(git diff *) Glob', ' ']), ['Read', 'Grep', 'Bash(git diff *)', 'Glob']);
});

test('a-4 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(reviewRepo({ script: null, result: null }), (dir) => {
    const { code, out } = check(['a-4', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  withRepo(reviewRepo(), (dir) => {
    const { code, out } = check(['a-4', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// A repository after lesson a-5, in a copy of the template: the link check
// report workflow on a commit of its own, and the saved list of its runs, one
// run on that commit. The options change a step: `workflow` (null for none) is
// written at `path` and committed unless `commitWorkflow` is false;
// `teardown` deletes it in a later commit; `runs` builds the saved list from
// the workflow's commit (null for none; text or a Buffer as it is);
// `origin` is the remote (null for none); `after` changes the repository
// last. The checks never run gh, so no run happens.
const PIN = 'fd1c128679612beff4ca259c78021c506e8aa7a7';
const ORIGIN = 'git@github.com:learner/claude-actions-practice.git';
const RUN_AT = 'https://github.com/learner/claude-actions-practice/actions/runs/123456789';
const PROMPT_LINES = [
  '          prompt: |',
  '            Run `npm run linkcheck -- samples`. For each broken link it reports, explain in one sentence why it is broken.',
  "            Don't change any files.",
];
const ARGS = '--model sonnet --max-turns 8 --allowedTools "Bash(npm run linkcheck *)"';
const LINKCHECK_REPORT = [
  'name: Link check report',
  '',
  'on:',
  '  workflow_dispatch:',
  '',
  'permissions:',
  '  contents: read',
  '',
  'jobs:',
  '  report:',
  '    runs-on: ubuntu-latest',
  '    timeout-minutes: 10',
  '    steps:',
  '      - uses: actions/checkout@v7',
  '      - uses: actions/setup-node@v7',
  '        with:',
  '          node-version: lts/*',
  `      - uses: anthropics/claude-code-action@${PIN} # v1.0.237`,
  '        with:',
  '          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}',
  '          github_token: ${{ github.token }}',
  ...PROMPT_LINES,
  `          claude_args: ${ARGS}`,
  '',
].join('\n');
// Quick setup's interactive workflow, cut down: no prompt, @claude events.
const CLAUDE_YML = [
  'name: Claude Code',
  'on:',
  '  issue_comment:',
  '    types: [created]',
  '  issues:',
  '    types: [opened, assigned]',
  'jobs:',
  '  claude:',
  "    if: contains(github.event.comment.body, '@claude')",
  '    runs-on: ubuntu-latest',
  '    permissions:',
  '      contents: read',
  '      id-token: write',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: anthropics/claude-code-action@v1',
  '        with:',
  '          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}',
  '',
].join('\n');

const runOf = (sha, extra = {}) => ({ databaseId: 123456789, status: 'completed', conclusion: 'success', event: 'workflow_dispatch', headSha: sha, url: RUN_AT, workflowName: 'Link check report', ...extra });

// The lesson's workflow with each `[from, to]` replaced.
function reportWith(...pairs) {
  return pairs.reduce((text, [from, to]) => {
    assert.ok(text.includes(from), `the workflow has no ${JSON.stringify(from)}`);
    return text.replace(from, () => to);
  }, LINKCHECK_REPORT);
}
const withArgs = (args) => reportWith([`claude_args: ${ARGS}`, `claude_args: ${args}`]);

function actionsRepo({ workflow = LINKCHECK_REPORT, path = WORKFLOW, commitWorkflow = true, teardown = false, runs = (sha) => [runOf(sha)], origin = ORIGIN, after } = {}) {
  return () => {
    const dir = repo({ 'README.md': '# demo\n', 'samples/guide.md': '[setup](setup.md)\n' });
    if (origin) git(dir, 'remote', 'add', 'origin', origin);
    const start = commit(dir, 'Start');
    let added = start;
    if (workflow !== null) {
      write(dir, { [path]: workflow });
      if (commitWorkflow) added = commit(dir, 'Add the link check report workflow', [path]);
    }
    if (teardown) {
      git(dir, 'rm', '-q', path);
      commit(dir, 'Tear down the Claude workflow', []);
    }
    if (runs !== null) {
      const saved = typeof runs === 'function' ? runs(added, start) : runs;
      write(dir, { [RUNS]: typeof saved === 'string' || Buffer.isBuffer(saved) ? saved : JSON.stringify(saved, null, 2) });
    }
    after?.(dir, { added, start });
    return dir;
  };
}

const a5 = (dir) => check(['a-5', '--dir', dir]);
// One item on its own.
const setupHint = (dir, options) => pinnedWorkflow(options).check(openRepo(dir));
const limitsHint = (dir, options) => workflowLimits(options).check(openRepo(dir));
const runsHint = (dir) => dispatchedRun().check(openRepo(dir));

test('a-5 passes for the lesson\'s workflow, committed, and a saved manual run on its commit', () => {
  withRepo(actionsRepo(), (dir) => {
    const { code, out } = a5(dir);
    assert.equal(code, 0, out);
    assert.match(out, /Пройдено 3 из 3/);
  });
});

test('a-5 still passes after the teardown deletes the workflow, since it reads the history', () => {
  withRepo(actionsRepo({ teardown: true }), (dir) => {
    assert.equal(existsSync(join(dir, WORKFLOW)), false);
    const { code, out } = a5(dir);
    assert.equal(code, 0, out);
  });
  // The same with quick setup's workflow beside it, both deleted.
  withRepo(actionsRepo({
    teardown: true,
    after: (dir) => {
      write(dir, { '.github/workflows/claude.yml': CLAUDE_YML });
      commit(dir, 'Add claude.yml', ['.github/workflows/claude.yml']);
      git(dir, 'rm', '-q', '.github/workflows/claude.yml');
      commit(dir, 'Remove claude.yml', []);
    },
  }), (dir) => {
    const { code, out } = a5(dir);
    assert.equal(code, 0, out);
  });
});

test('a-5 accepts the workflow written in other ways', () => {
  const steps = LINKCHECK_REPORT.split('\n');
  const atStepsIndent = steps.map((l, i) => (i > 12 ? l.replace(/^ {2}/, '') : l)).join('\n');
  for (const workflow of [
    withArgs(ARGS.replace('--allowedTools', '--allowed-tools')),
    withArgs('|\n            --model sonnet\n            # One command, and a cap.\n            --max-turns 8\n            --allowedTools "Bash(npm run linkcheck *)"'),
    withArgs('>-\n            --model sonnet --max-turns 8\n            --allowedTools "Bash(npm run linkcheck *)"'),
    withArgs(`'--max-turns 8 --allowedTools "Bash(npm run linkcheck *)"'`),
    withArgs(`"--max-turns 8 --allowedTools \\"Bash(npm run linkcheck *)\\""`),
    withArgs("--max-turns 8 --allowedTools 'Bash(npm run linkcheck *)' Read"),
    withArgs('--max-turns 8 --allowedTools=Bash(npm\\ run\\ linkcheck\\ *)'),
    withArgs('--max-turns 10 --allowedTools "Bash(npm run linkcheck *),Read"'),
    reportWith([`anthropics/claude-code-action@${PIN} # v1.0.237`, '"anthropics/claude-code-action@v1.0.237"']),
    reportWith([`anthropics/claude-code-action@${PIN} # v1.0.237`, `'anthropics/claude-code-action@${PIN}'`]),
    reportWith(['${{ github.token }}', '${{ secrets.GITHUB_TOKEN }}']),
    reportWith(['anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}', 'claude_code_oauth_token: ${{secrets.CLAUDE_CODE_OAUTH_TOKEN}}']),
    reportWith(['permissions:\n  contents: read\n\n', ''], ['    timeout-minutes: 10\n', '    timeout-minutes: 10\n    permissions:\n      contents: read\n      id-token: write\n']),
    reportWith(['permissions:\n  contents: read', 'permissions: read-all']),
    reportWith(['permissions:\n  contents: read', 'permissions: {}']),
    reportWith(['    timeout-minutes: 10\n', ''], ['        with:\n          anthropic_api_key', '        timeout-minutes: 15\n        with:\n          anthropic_api_key']),
    reportWith(['on:\n  workflow_dispatch:', 'on: workflow_dispatch']),
    reportWith(['on:\n  workflow_dispatch:', 'on: [push, workflow_dispatch]']),
    reportWith(['on:\n  workflow_dispatch:', '"on":\n  workflow_dispatch:\n    inputs:\n      folder:\n        default: samples']),
    reportWith([PROMPT_LINES.join('\n'), '          prompt: Run `npm run linkcheck -- samples` and explain\n            why each broken link is broken. Change no files.']),
    atStepsIndent,
  ]) {
    withRepo(actionsRepo({ workflow }), (dir) => {
      assert.equal(setupHint(dir), true, workflow);
      assert.equal(limitsHint(dir), true, workflow);
    });
  }
  // A .yaml file, and Windows line ends, end to end.
  for (const options of [{ path: '.github/workflows/linkcheck-report.yaml' }, { workflow: LINKCHECK_REPORT.replace(/\n/g, '\r\n') }]) {
    withRepo(actionsRepo(options), (dir) => {
      const { code, out } = a5(dir);
      assert.equal(code, 0, `${JSON.stringify(options)}: ${out}`);
    });
  }
});

test('a-5 names what the first item finds wrong, in the file and on its line', () => {
  const KEY_TEXT = `sk-ant-api03-${'Xy9_'.repeat(8)}`;
  for (const [workflow, hint] of [
    [reportWith([`@${PIN} # v1.0.237`, '@v1']), /`\.github\/workflows\/linkcheck-report\.yml`: `@v1` в строке 18 может перейти на новый релиз, и версия Claude Code на раннере изменится без вашего коммита\. Закрепите тег релиза \(`@vX\.Y\.Z`\) или полный SHA коммита этого релиза\./],
    [reportWith([`@${PIN} # v1.0.237`, '@main']), /`\.github\/workflows\/linkcheck-report\.yml`: `@main` в строке 18 может перейти на новый релиз, и версия Claude Code на раннере изменится без вашего коммита\./],
    [reportWith([`@${PIN} # v1.0.237`, '@fd1c128']), /`\.github\/workflows\/linkcheck-report\.yml`: `@fd1c128` в строке 18 — короткий SHA коммита\. Напишите полный SHA из 40 символов\./],
    [reportWith([`@${PIN} # v1.0.237`, '']), /`\.github\/workflows\/linkcheck-report\.yml`: Строка 18 запускает `anthropics\/claude-code-action` без версии\./],
    [reportWith([PROMPT_LINES.join('\n') + '\n', '']), /`\.github\/workflows\/linkcheck-report\.yml`: У шага в строке 18 нет `prompt`, поэтому Claude ждёт `@claude` в issue или pull request \(интерактивный режим\)\. Добавьте `prompt` под `with:` с описанием того, что должен сделать Claude, чтобы он запускался сразу при старте workflow \(режим автоматизации\)\./],
    [reportWith([PROMPT_LINES.join('\n'), '          prompt: ""']), /`\.github\/workflows\/linkcheck-report\.yml`: `prompt` в строке 22 пуст\./],
    [reportWith(['${{ secrets.ANTHROPIC_API_KEY }}', KEY_TEXT]), /`\.github\/workflows\/linkcheck-report\.yml`: Строка 20 похожа на ключ или токен Claude API\./],
    [reportWith(['name: Link check report', `name: Link check report # was ${KEY_TEXT}`]), /`\.github\/workflows\/linkcheck-report\.yml`: Строка 1 похожа на ключ или токен Claude API\./],
    [reportWith(['${{ secrets.ANTHROPIC_API_KEY }}', '${{ env.CLAUDE_KEY }}']), /`\.github\/workflows\/linkcheck-report\.yml`: `anthropic_api_key` в строке 20 не берётся из секрета\./],
    [reportWith(['          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}\n', '']), /`\.github\/workflows\/linkcheck-report\.yml`: Шаг в строке 18 не передаёт учётные данные\. Добавьте `anthropic_api_key: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}` под `with:` или `claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}` для токена подписки, указав секрет, который сохранила быстрая настройка \(quick setup\)\./],
    [reportWith(['  workflow_dispatch:', '  workflow_dispatch:\n  pull_request_target:']), /`\.github\/workflows\/linkcheck-report\.yml`: Уберите `pull_request_target` из `on:`\./],
  ]) {
    withRepo(actionsRepo({ workflow }), (dir) => {
      const got = String(setupHint(dir));
      assert.match(got, /^`\.github\/workflows\/linkcheck-report\.yml`: /, workflow);
      assert.match(got, hint, workflow);
      assert.doesNotMatch(got, /sk-ant-/, 'the hint repeats the key');
      assert.doesNotMatch(got, /undefined|null/, workflow);
    });
  }
});

test('a-5 names each limit the second item finds missing or too loose', () => {
  const longKey = '--max-turns 8 --allowedTools "Bash(npm run linkcheck *)"';
  for (const [workflow, hint] of [
    [withArgs(ARGS.replace('--max-turns 8', '--max-turns 50')), /`\.github\/workflows\/linkcheck-report\.yml`: `--max-turns 50` больше 10: используйте число от 1 до 10\./],
    [withArgs(ARGS.replace('--max-turns 8', '--max-turns 0')), /`\.github\/workflows\/linkcheck-report\.yml`: `--max-turns 0` меньше 1: используйте число от 1 до 10\./],
    [withArgs(ARGS.replace('--max-turns 8', '--max-turns eight')), /`\.github\/workflows\/linkcheck-report\.yml`: `--max-turns eight` — не целое число: используйте число от 1 до 10\./],
    [withArgs(ARGS.replace(' --max-turns 8', '')), /`\.github\/workflows\/linkcheck-report\.yml`: В `claude_args` не задан лимит ходов: добавьте `--max-turns` и число от 1 до 10\./],
    [withArgs(ARGS.replace('--max-turns 8', '--max-turns=8')), /`\.github\/workflows\/linkcheck-report\.yml`: Напишите `--max-turns 8` через пробел, а не `--max-turns=8`: action читает значение флага из следующего слова\./],
    [withArgs(ARGS.replace('--max-turns 8', '--max-turns=20')), /`\.github\/workflows\/linkcheck-report\.yml`: Напишите `--max-turns` через пробел и число от 1 до 10, а не `--max-turns=20`: action читает значение флага из следующего слова\./],
    [withArgs(ARGS.replace('--max-turns 8', '--max_turns 8')), /Claude Code не знает `--max_turns`: напишите `--max-turns`\./],
    [withArgs('--allowedTools "Bash(npm run linkcheck *)" --max-turns'), /После `--max-turns` нет числа: напишите число от 1 до 10\./],
    [withArgs(ARGS.replace('"Bash(npm run linkcheck *)"', 'Bash')), /`\.github\/workflows\/linkcheck-report\.yml`: В `--allowedTools` указано `Bash`, что позволяет Claude запускать любую команду\./],
    [withArgs(ARGS.replace('"Bash(npm run linkcheck *)"', '"Read,Bash(*)"')), /указано `Bash\(\*\)`, что позволяет Claude запускать любую команду/],
    [withArgs(ARGS.replace('"Bash(npm run linkcheck *)"', '"Bash(:*)"')), /указано `Bash\(:\*\)`/],
    [withArgs(ARGS.replace('"Bash(npm run linkcheck *)"', '"Bash( *)"')), /указано `Bash\( \*\)`/],
    [withArgs(ARGS.replace('"Bash(npm run linkcheck *)"', 'Bash(npm run linkcheck *)')), /`\.github\/workflows\/linkcheck-report\.yml`: `--allowedTools` получает `Bash\(npm`, `run`, `linkcheck` и `\*\)` отдельными словами, потому что action делит `claude_args` по пробелам вне кавычек\./],
    [withArgs(ARGS.replace(' --allowedTools "Bash(npm run linkcheck *)"', '')), /`\.github\/workflows\/linkcheck-report\.yml`: В `claude_args` ни один инструмент не одобрен заранее: добавьте `--allowedTools`, указав только ту команду, которая нужна Claude, как в `--allowedTools "Bash\(<command> \*\)"`\./],
    [withArgs(ARGS.replace('--allowedTools', '--allowedtools')), /Claude Code не знает `--allowedtools`: напишите `--allowedTools`\./],
    [withArgs(ARGS.replace('"Bash(npm run linkcheck *)"', '""')), /В `--allowedTools` нет ни одного инструмента: укажите только ту команду, которая нужна Claude/],
    [withArgs(`|\n            --model sonnet # the cheaper model\n            ${longKey}`), /`\.github\/workflows\/linkcheck-report\.yml`: Незакавыченный `#` в `claude_args` начинает комментарий, который для action тянется до конца значения, поэтому `--max-turns` и `--allowedTools` он не читает\. Перенесите этот комментарий на отдельную строку выше `claude_args`\./],
    [reportWith([`          claude_args: ${ARGS}\n`, '']), /`\.github\/workflows\/linkcheck-report\.yml`: У шага в строке 18 нет `claude_args`, поэтому запуск ничем не ограничен\./],
    [reportWith(['    timeout-minutes: 10\n', '']), /`\.github\/workflows\/linkcheck-report\.yml`: У задания `report` не задан `timeout-minutes`, поэтому зависший запуск остановит только лимит GitHub по умолчанию\. Добавьте заданию `timeout-minutes` и число от 1 до 30\./],
    [reportWith(['timeout-minutes: 10', 'timeout-minutes: 90']), /`\.github\/workflows\/linkcheck-report\.yml`: `timeout-minutes: 90` on line 12 is above 30: use число от 1 до 30\./],
    [reportWith(['timeout-minutes: 10', 'timeout-minutes: ${{ inputs.minutes }}']), /`\.github\/workflows\/linkcheck-report\.yml`: `timeout-minutes: \$\{\{ inputs\.minutes \}\}` в строке 12 — не целое число: напишите число от 1 до 30\./],
    [reportWith(['permissions:\n  contents: read\n', '']), /`\.github\/workflows\/linkcheck-report\.yml`: Ни у workflow, ни у задания `report` не задан `permissions`, поэтому токен задания получает доступ репозитория по умолчанию, а он может включать запись\. Добавьте `permissions:` с `contents: read`\./],
    [reportWith(['contents: read', 'contents: write']), /`\.github\/workflows\/linkcheck-report\.yml`: `contents: write` в строке 7 даёт токену задания право записи, а это задание только читает\. Сделайте это `read` или удалите\./],
    [reportWith(['contents: read', 'contents: read\n  issues: write\n  pull-requests: write']), /`\.github\/workflows\/linkcheck-report\.yml`: `issues: write` и `pull-requests: write` в строках 8 и 9 дают токену задания право записи, а это задание только читает\./],
    [reportWith(['permissions:\n  contents: read', 'permissions: write-all']), /`\.github\/workflows\/linkcheck-report\.yml`: `permissions: write-all` в строке 6 даёт токену задания право записи на всё\. Используйте `contents: read`\./],
    [reportWith(['          github_token: ${{ github.token }}\n', '']), /`\.github\/workflows\/linkcheck-report\.yml`: Шаг в строке 18 не передаёт `github_token`, поэтому Claude действует как приложение Claude GitHub App, которое может писать в репозиторий\. Добавьте `github_token: \$\{\{ github\.token \}\}` под `with:`, чтобы Claude использовал токен этого задания и заданные вами `permissions`\./],
    [reportWith(['${{ github.token }}', '${{ secrets.MY_TOKEN }}']), /`\.github\/workflows\/linkcheck-report\.yml`: `github_token` в строке 21 — не собственный токен этого задания, поэтому `permissions` задания его не ограничивают\./],
  ]) {
    withRepo(actionsRepo({ workflow }), (dir) => {
      const got = String(limitsHint(dir));
      assert.match(got, /^`\.github\/workflows\/linkcheck-report\.yml`: /, workflow);
      assert.match(got, hint, workflow);
      assert.doesNotMatch(got, /undefined|null/, workflow);
    });
  }
  // A job's own permissions replace the workflow's.
  withRepo(actionsRepo({ workflow: reportWith(['permissions:\n  contents: read', 'permissions: write-all'], ['    timeout-minutes: 10\n', '    timeout-minutes: 10\n    permissions:\n      contents: read\n']) }), (dir) => {
    assert.equal(limitsHint(dir), true);
  });
  // Four problems at once: three are named, then how many more.
  withRepo(actionsRepo({ workflow: reportWith([`          claude_args: ${ARGS}\n`, ''], ['    timeout-minutes: 10\n', ''], ['contents: read', 'contents: write'], ['          github_token: ${{ github.token }}\n', '']) }), (dir) => {
    assert.match(String(limitsHint(dir)), /`\.github\/workflows\/linkcheck-report\.yml`: У шага в строке 17 нет `claude_args`, поэтому запуск ничем не ограничен\./);
  });
});

test('a-5 says to commit a workflow that is only in the working tree, and points out uncommitted fixes', () => {
  withRepo(actionsRepo({ commitWorkflow: false }), (dir) => {
    const { code, out } = a5(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-5  GitHub Actions\n  FAIL  закоммиченный workflow запускает `anthropics\/claude-code-action`, закреплённый на релизе или SHA коммита, в режиме автоматизации, с учётными данными из секрета и без них в файле\n        `\.github\/workflows\/linkcheck-report\.yml` не закоммичен\. Выполните `git add \.github\/workflows\/linkcheck-report\.yml`, закоммитьте его и отправьте \(push\)\./);
    assert.match(out, /FAIL  его ограничения заданы в файле: `--max-turns` не больше 10, список `--allowedTools` без неограниченного `Bash`, токен задания только для чтения и `timeout-minutes`\n        Нет закоммиченного workflow, который запускается по `workflow_dispatch` и запускающего `anthropics\/claude-code-action`, поэтому проверка не может прочитать его ограничения\./);
  });
  withRepo(actionsRepo({ workflow: reportWith([`@${PIN} # v1.0.237`, '@v1']), after: (dir) => write(dir, { [WORKFLOW]: LINKCHECK_REPORT }) }), (dir) => {
    assert.match(String(setupHint(dir)), /`\.github\/workflows\/linkcheck-report\.yml`: `@v1` в строке 18 может перейти на новый релиз, и версия Claude Code на раннере изменится без вашего коммита\. Закрепите тег релиза \(`@vX\.Y\.Z`\) или полный SHA коммита этого релиза\. В вашей копии `\.github\/workflows\/linkcheck-report\.yml` есть незакоммиченные изменения: если они это исправляют, закоммитьте их\./);
  });
  withRepo(actionsRepo({ workflow: 'name: Placeholder\non: workflow_dispatch\njobs: {}\n', after: (dir) => write(dir, { [WORKFLOW]: LINKCHECK_REPORT }) }), (dir) => {
    assert.match(String(setupHint(dir)), /Ваша копия `\.github\/workflows\/linkcheck-report\.yml` запускает `anthropics\/claude-code-action`, но это изменение не закоммичено\./);
  });
});

test('a-5 says the @claude workflow is not the one the lesson asks for, and names the events of one that starts otherwise', () => {
  withRepo(actionsRepo({ workflow: CLAUDE_YML, path: '.github/workflows/claude.yml' }), (dir) => {
    assert.match(String(setupHint(dir)), /В `\.github\/workflows\/claude\.yml` нет `prompt`, поэтому он ждёт `@claude` \(интерактивный режим\)\. Нужен второй workflow, `\.github\/workflows\/linkcheck-report\.yml`, который стартует по `on: workflow_dispatch` и имеет `prompt`\./);
  });
  withRepo(actionsRepo({ workflow: reportWith(['on:\n  workflow_dispatch:', 'on:\n  push:\n    branches: [main]']) }), (dir) => {
    assert.match(String(setupHint(dir)), /`\.github\/workflows\/linkcheck-report\.yml` запускает Claude с `prompt`, но стартует по `push`\. Запускайте его по `on: workflow_dispatch`, затем закоммитьте и отправьте \(push\)\./);
  });
  withRepo(actionsRepo({ workflow: null }), (dir) => {
    assert.match(String(setupHint(dir)), /Нет закоммиченного workflow, который запускает `anthropics\/claude-code-action`\. Напишите `\.github\/workflows\/linkcheck-report\.yml` по описанию в разделе «Ваша очередь», затем закоммитьте и отправьте \(push\)\./);
  });
});

test('a-5 reads the newest commit that holds a manual workflow, and a later pull_request workflow never stands in for it', () => {
  const review = reportWith(['on:\n  workflow_dispatch:', 'on:\n  pull_request:'], [`@${PIN} # v1.0.237`, '@v1']);
  const later = (dir) => {
    write(dir, { '.github/workflows/claude-review.yml': review });
    commit(dir, 'Add the review workflow', ['.github/workflows/claude-review.yml']);
  };
  withRepo(actionsRepo({ after: later }), (dir) => {
    const { code, out } = a5(dir);
    assert.equal(code, 0, out);
    // The capstone's builder, limited to pull_request, reads the later one.
    const capstone = { triggers: ['pull_request'], file: '.github/workflows/claude-review.yml', guide: 'the brief' };
    assert.match(String(setupHint(dir, capstone)), /`\.github\/workflows\/claude-review\.yml`: `@v1` в строке 18 может перейти на новый релиз, и версия Claude Code на раннере изменится без вашего коммита\./);
    assert.equal(chosenWorkflow(openRepo(dir), ['pull_request']).file.path, '.github/workflows/claude-review.yml');
    assert.equal(chosenWorkflow(openRepo(dir), ['workflow_dispatch']).file.path, WORKFLOW);
  });
  // The newest version of the workflow counts, whichever way it changed.
  const edit = (text) => (dir) => {
    write(dir, { [WORKFLOW]: text });
    commit(dir, 'Change the workflow', [WORKFLOW]);
  };
  withRepo(actionsRepo({ after: edit(reportWith([`@${PIN} # v1.0.237`, '@v1'])) }), (dir) => {
    assert.match(String(setupHint(dir)), /`\.github\/workflows\/linkcheck-report\.yml`: `@v1` в строке 18 может перейти на новый релиз, и версия Claude Code на раннере изменится без вашего коммита\./);
  });
  withRepo(actionsRepo({ workflow: reportWith([`@${PIN} # v1.0.237`, '@v1']), after: edit(LINKCHECK_REPORT) }), (dir) => {
    assert.equal(setupHint(dir), true);
  });
  // After the teardown, a hint names the commit it read.
  withRepo(actionsRepo({ workflow: reportWith([`@${PIN} # v1.0.237`, '@v1']), teardown: true }), (dir) => {
    const added = git(dir, 'rev-parse', '--short=7', 'HEAD~1');
    assert.match(String(setupHint(dir)), new RegExp(`^\`\\.github/workflows/linkcheck-report\\.yml\` \\(как в коммите ${added}\\): \`@v1\``));
  });
});

test('a-5 reads the workflow on both sides of a merge, after a merge that keeps the other side\'s workflows', () => {
  // After the teardown, a branch from the start that adds another workflow
  // is merged: the merge's workflows match that branch's alone.
  const merged = (dir, { start }) => {
    git(dir, 'checkout', '-q', '-b', 'other-ci', start);
    write(dir, { '.github/workflows/ci.yml': 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n' });
    commit(dir, 'Add CI', ['.github/workflows/ci.yml']);
    git(dir, 'checkout', '-q', '-');
    git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'other-ci');
  };
  withRepo(actionsRepo({ teardown: true, after: merged }), (dir) => {
    assert.equal(git(dir, 'log', '--format=%H', '--', '.github/workflows').split('\n').length, 1, 'the merge hides nothing from git log, so this test shows nothing');
    const { code, out } = a5(dir);
    assert.equal(code, 0, out);
  });
});

test('a-5 picks the workflow with a prompt and the fewest problems among those of one commit', () => {
  const broken = reportWith([`@${PIN} # v1.0.237`, '@v1']);
  withRepo(actionsRepo({ after: (dir) => { write(dir, { '.github/workflows/a-broken.yml': broken }); commit(dir, 'Add another', ['.github/workflows/a-broken.yml']); } }), (dir) => {
    assert.equal(setupHint(dir), true);
  });
  const noPrompt = reportWith([PROMPT_LINES.join('\n') + '\n', '']);
  withRepo(actionsRepo({ workflow: broken, after: (dir) => { write(dir, { '.github/workflows/a-dispatch.yml': noPrompt }); commit(dir, 'Add another', ['.github/workflows/a-dispatch.yml']); } }), (dir) => {
    assert.match(String(setupHint(dir)), /^`\.github\/workflows\/linkcheck-report\.yml`: `@v1`/);
  });
});

test('a-5 reads the saved runs, and says what is wrong with them', () => {
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
  for (const options of [
    { runs: (sha) => utf16(JSON.stringify([runOf(sha)], null, 2)) },
    { runs: (sha) => `﻿${JSON.stringify([runOf(sha)])}` },
    { runs: (sha) => runOf(sha) },
    { runs: (sha) => [runOf(sha, { status: 'in_progress', conclusion: '', databaseId: 2 }), runOf(sha)] },
    { runs: (sha) => [runOf(sha, { url: 'https://github.com/Learner/Claude-Actions-Practice/actions/runs/123456789' })] },
    { origin: 'https://github.com/learner/claude-actions-practice' },
    { origin: 'ssh://git@github.com/learner/claude-actions-practice.git' },
    { origin: null, runs: (sha) => [runOf(sha, { url: 'https://github.com/someone/else/actions/runs/1' })] },
    { origin: 'https://gitlab.com/learner/claude-actions-practice.git', runs: (sha) => [runOf(sha, { url: undefined })] },
  ]) {
    withRepo(actionsRepo(options), (dir) => {
      assert.equal(runsHint(dir), true, String(options.runs ?? options.origin));
    });
  }
  const SAVE = '`gh run list --workflow linkcheck-report\\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \\.practice\\/a-5-runs\\.json`';
  for (const [runs, hint] of [
    [null, new RegExp(`^Файла \`\\.practice/a-5-runs\\.json\` ещё нет\\. Запустите workflow командой \`gh workflow run linkcheck-report\\.yml\`, дождитесь завершения, затем сохраните список: ${SAVE}\\.$`)],
    ['completed  success  Link check report\n', /`\.practice\/a-5-runs\.json` — не JSON\. Сохраните список с `--json` без изменений: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [[], /В `\.practice\/a-5-runs\.json` нет запусков\. Запустите workflow командой `gh workflow run linkcheck-report\.yml`, дождитесь завершения, затем сохраните список заново: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [[{ name: 'Link check report' }], /нет полей, которые читает проверка\. Сохраните список с ними:/],
    [(sha) => [runOf(sha, { status: 'in_progress', conclusion: '' })], /Запуск 123456789 не завершился: его `status` — `in_progress`\. Дождитесь его командой `gh run watch 123456789`, затем сохраните список заново: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [(sha) => [runOf(sha, { conclusion: 'failure' })], /Запуск 123456789 завершился с результатом `failure`\. Причину покажет `gh run view 123456789 --log-failed`; исправьте workflow, закоммитьте и отправьте его \(push\), запустите снова командой `gh workflow run linkcheck-report\.yml`, затем сохраните список заново: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [(sha) => [runOf(sha, { conclusion: 'cancelled' })], /Запуск 123456789 завершился с результатом `cancelled`\. Запустите workflow снова командой `gh workflow run linkcheck-report\.yml`, дождитесь завершения, затем сохраните список заново: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [(sha) => [runOf(sha, { event: 'issues' }), runOf(sha, { event: 'issue_comment' })], /В `\.practice\/a-5-runs\.json` только запуски, начатые `@claude` \(`issues` и `issue_comment`\)\. Запустите свой workflow вручную командой `gh workflow run linkcheck-report\.yml`, дождитесь завершения, затем сохраните список заново: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [(sha) => [runOf(sha, { event: 'push' })], /В `\.practice\/a-5-runs\.json` нет запуска, начатого вручную \(`workflow_dispatch`\), только `push`\./],
    [(sha) => [runOf(sha, { url: 'https://github.com/someone/else/actions/runs/1' })], /Запуск 123456789 шёл в `someone\/else`, а `origin` этого репозитория — `learner\/claude-actions-practice`\./],
    [(sha) => [runOf(sha, { url: undefined })], /У запуска в `\.practice\/a-5-runs\.json` нет URL запуска GitHub, поэтому проверка не знает, в каком репозитории он шёл\./],
    [(sha) => [runOf(sha, { headSha: undefined })], /У запуска 123456789 нет `headSha`, поэтому проверка не знает, на каком коммите он шёл\./],
    [() => [runOf('0123456789abcdef0123456789abcdef01234567')], /Запуск 123456789 шёл на коммите 0123456, которого нет в этом репозитории\. Выполните `git pull`, чтобы получить его, и запустите проверку снова\./],
    [(sha, start) => [runOf(start)], /Запуск 123456789 шёл на коммите [0-9a-f]{7}, где ни один workflow не запускает `anthropics\/claude-code-action` с `prompt`\. Когда ваш workflow отправлен \(push\), запустите его командой `gh workflow run linkcheck-report\.yml`, дождитесь завершения, затем сохраните список заново: `gh run list --workflow linkcheck-report\.yml --json databaseId,status,conclusion,event,headSha,url,workflowName > \.practice\/a-5-runs\.json`\./],
    [(sha) => [runOf(sha, { event: 'issues' }), runOf(sha, { conclusion: 'failure', databaseId: 7 })], /Запуск 7 завершился с результатом `failure`\./],
  ]) {
    withRepo(actionsRepo({ runs }), (dir) => {
      assert.match(String(runsHint(dir)), hint, String(runs));
    });
  }
  // A run on a commit that holds only the @claude workflow, which has no prompt.
  withRepo(actionsRepo({
    runs: null,
    after: (dir) => {
      write(dir, { '.github/workflows/claude.yml': CLAUDE_YML });
      const sha = commit(dir, 'Add claude.yml', ['.github/workflows/claude.yml']);
      git(dir, 'rm', '-q', WORKFLOW);
      const without = commit(dir, 'Drop the report', []);
      write(dir, { [RUNS]: JSON.stringify([runOf(without)]) });
      assert.ok(sha);
    },
  }), (dir) => {
    assert.match(String(runsHint(dir)), /Запуск 123456789 шёл на коммите [0-9a-f]{7}, где ни один workflow не запускает `anthropics\/claude-code-action` с `prompt`\./);
  });
});

test('the workflow reader takes the forms workflow files use, without a YAML library', () => {
  const read = (text) => readActions(text);
  assert.deepEqual(read('on: {workflow_dispatch: {}, push: {branches: [main]}}\njobs: {}\n').triggers, ['workflow_dispatch', 'push']);
  assert.deepEqual(read('on:\n  - push\n  - workflow_dispatch # by hand\njobs: {}\n').triggers, ['push', 'workflow_dispatch']);
  assert.deepEqual(read("'on': [ \"push\" ]\n").triggers, ['push']);
  const steps = read([
    'on: workflow_dispatch',
    'jobs:',
    '  a:',
    '    steps:',
    '      # - uses: anthropics/claude-code-action@v1',
    '      - name: Ask Claude',
    '        uses: Anthropics/Claude-Code-Action@v1.0.237 # pinned',
    '        with:',
    '          prompt: |',
    '            # Not a comment: part of the prompt.',
    '            Say hi.',
    '          claude_args: "--max-turns 2 --allowedTools \\"Read\\""',
    '  b:',
    '    steps:',
    '      - uses: anthropics/claude-code-action/base-action@v1',
    '',
  ].join('\n')).steps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].ref, 'v1.0.237');
  assert.equal(steps[0].line, 7);
  assert.equal(steps[0].inputs.prompt.text, '# Not a comment: part of the prompt.\nSay hi.');
  assert.equal(steps[0].inputs.claude_args.text, '--max-turns 2 --allowedTools "Read"');
  assert.equal(parseYaml('a: "one\n  two"\n').entries[0].value.text, 'one two');
  assert.equal(parseYaml('a: >\n  one\n  two\n\n  three\n').entries[0].value.text, 'one two\nthree');
  // claude_args as the action reads it: comment lines go, an inline # ends it.
  assert.deepEqual(claudeArgWords('# note\n--max-turns 3\n  --allowedTools "Bash(npm run linkcheck *)" \'Read\''), { words: ['--max-turns', '3', '--allowedTools', 'Bash(npm run linkcheck *)', 'Read'], comment: null });
  assert.deepEqual(claudeArgWords('--model sonnet # cheap\n--max-turns 3'), { words: ['--model', 'sonnet'], comment: '# cheap\n--max-turns 3' });
  assert.deepEqual(claudeArgWords('a#b "c#d"').words, ['a']);
  assert.deepEqual(claudeArgWords('--allowedTools Bash(npm\\ run\\ *) ""').words, ['--allowedTools', 'Bash(npm run *)', '']);
});

test('a-5 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(actionsRepo({ workflow: null, runs: null }), (dir) => {
    const { code, out } = check(['a-5', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  // The solutions branch: the workflow added, then torn down, so no branch
  // head carries a live Claude workflow, and a run record on the add commit.
  withRepo(actionsRepo({ teardown: true }), (dir) => {
    const { code, out } = check(['a-5', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// A repository after lesson a-6: an Intermediate setup (a tdd skill, a
// test-gaps subagent and a protect-files hook in .claude/), then the example
// marketplace committed in `root`, registered in .claude/settings.json and
// turned on, the subagent moved into team-kit with git mv, the personal
// files ignored, and the strict validation of the plugin saved. The options
// change a step: `market` replaces the marketplace file; `settings` replaces
// the committed settings (null for none); `gitignore` is committed (null for
// none); `move` lists the [from, to] pairs moved with git mv; `files` writes
// or, with null, deletes files before the commit; `report` is the saved
// validation, as an object, text, a Buffer, a function of the folder and the
// plugin's path, or null for none; `after` changes the repository last.
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const TDD_SKILL = '---\nname: tdd\ndescription: Builds a feature test first, then the code, then refactors.\n---\n\nWrite a failing test first.\n';
const TEST_GAPS = '---\nname: test-gaps\ndescription: Lists the functions that no test calls. Use before adding tests.\ntools: Read, Grep, Glob\n---\n\nList them.\n';
const PROTECT_HOOK = '.claude/hooks/protect-files.sh';
const PROJECT_HOOKS = { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-files.sh', args: [] }] }] };
const BASE_SETTINGS = { permissions: { allow: ['Bash(npm test)'], deny: ['Read(./.env)'] }, hooks: PROJECT_HOOKS };
const MARKETPLACE_ROOT = 'team-marketplace';
const TEAM_KIT = `${MARKETPLACE_ROOT}/plugins/team-kit`;
const TEAM_MARKET = { name: 'team-tools', description: 'A demo team marketplace.', owner: { name: 'Your team' }, plugins: [{ name: 'team-kit', source: './plugins/team-kit', description: 'The team\'s shared skills and subagents' }] };
const SHARED_SETTINGS = {
  ...BASE_SETTINGS,
  extraKnownMarketplaces: { 'team-tools': { source: { source: 'directory', path: './team-marketplace' } } },
  enabledPlugins: { 'team-kit@team-tools': true },
};
const PERSONAL_IGNORE = '.practice/\n.claude/settings.local.json\nCLAUDE.local.md\n';
const under = (root, path) => (root ? `${root}/${path}` : path);
const reportOf = (target, extra = {}) => ({ success: true, strict: true, target, manifest: { file: target, type: 'plugin', errors: [], warnings: [], notes: [] }, contents: [], ...extra });
const VALID_REPORT = (dir, plugin) => reportOf(join(realpathSync(dir), plugin, '.claude-plugin', 'plugin.json'));

function shareRepo({
  root = MARKETPLACE_ROOT, market = TEAM_MARKET, settings = SHARED_SETTINGS, gitignore = PERSONAL_IGNORE,
  move = [['.claude/agents/test-gaps.md', 'agents/test-gaps.md']], files = {}, report = VALID_REPORT, after,
} = {}) {
  return () => {
    const plugin = under(root, 'plugins/team-kit');
    const dir = repo({
      'README.md': '# demo\n',
      ...(gitignore === null ? {} : { '.gitignore': gitignore }),
      '.claude/settings.json': json(BASE_SETTINGS),
      '.claude/skills/tdd/SKILL.md': TDD_SKILL,
      '.claude/agents/test-gaps.md': TEST_GAPS,
      [PROTECT_HOOK]: '#!/bin/bash\nexit 0\n',
    });
    commit(dir, 'Start');
    write(dir, {
      [under(root, '.claude-plugin/marketplace.json')]: typeof market === 'string' ? market : json(market),
      [`${plugin}/.claude-plugin/plugin.json`]: json({ name: 'team-kit', version: '0.1.0', description: 'A team\'s shared setup', author: { name: 'Your team' } }),
      [`${plugin}/skills/onboard/SKILL.md`]: '---\nname: onboard\ndescription: Explains the shared setup to a new teammate.\n---\n\nExplain it.\n',
      [`${plugin}/agents/config-reviewer.md`]: '---\nname: config-reviewer\ndescription: Reviews the shared configuration.\ntools: Read, Grep, Glob\nmodel: inherit\n---\n\nReview it.\n',
    });
    if (settings === null) rmSync(join(dir, '.claude/settings.json'));
    else write(dir, { '.claude/settings.json': typeof settings === 'string' ? settings : json(settings) });
    for (const [from, to] of move) {
      const target = to.startsWith('.claude/') ? to : `${plugin}/${to}`;
      execFileSync('mkdir', ['-p', join(dir, target, '..')]);
      git(dir, 'mv', from, target);
    }
    for (const [path, text] of Object.entries(files)) {
      if (text === null) rmSync(join(dir, path), { recursive: true, force: true });
      else write(dir, { [path]: text });
    }
    commit(dir, 'Share the team\'s Claude Code setup');
    if (report !== null) {
      const saved = typeof report === 'function' ? report(dir, plugin) : report;
      write(dir, { [VALIDATE]: typeof saved === 'string' || Buffer.isBuffer(saved) ? saved : json(saved) });
    }
    after?.(dir, plugin);
    return dir;
  };
}

const a6 = (dir) => check(['a-6', '--dir', dir]);
// One item on its own.
const marketHint = (dir) => teamMarketplace.check(openRepo(dir));
const settingsHint = (dir) => sharedSettings.check(openRepo(dir));
const movedHint = (dir) => movedComponent.check(openRepo(dir));
const personalHint = (dir) => personalFiles.check(openRepo(dir));
const validateHint = (dir) => strictValidation().check(openRepo(dir));
const marketWith = (...entries) => ({ ...TEAM_MARKET, plugins: entries });
const settingsWith = (extra) => ({ ...BASE_SETTINGS, ...extra });
const registered = (source, key = 'team-tools') => settingsWith({ extraKnownMarketplaces: { [key]: { source } }, enabledPlugins: { 'team-kit@team-tools': true } });

test('a-6 passes for the example marketplace registered and turned on, a subagent moved into it, the personal files ignored and a strict validation saved', () => {
  withRepo(shareRepo(), (dir) => {
    const { code, out } = a6(dir);
    assert.equal(code, 0, out);
    assert.match(out, /a-6  Поделитесь настройкой с командой\n  PASS  закоммиченный marketplace команды перечисляет плагин по относительному пути, а имя записи совпадает с `name` в `plugin\.json` плагина\n  PASS  закоммиченный `\.claude\/settings\.json` регистрирует этот marketplace по относительному пути и включает плагин\n  PASS  перенесённый вами компонент лежит в плагине и исчез из `\.claude\/`\n  PASS  закоммиченный `\.gitignore` исключает `\.claude\/settings\.local\.json` и `CLAUDE\.local\.md`, и git не отслеживает ни тот, ни другой\n  PASS  `\.practice\/a-6-validate\.json` содержит успешную строгую проверку папки плагина\n\nПройдено 5 из 5/);
  });
});

test('a-6 accepts the other ways to write the registration', () => {
  for (const settings of [
    registered({ source: 'directory', path: 'team-marketplace' }),
    registered({ source: 'directory', path: './team-marketplace/' }),
    registered({ source: 'file', path: './team-marketplace/.claude-plugin/marketplace.json' }),
    settingsWith({ additionalMarketplaces: SHARED_SETTINGS.extraKnownMarketplaces, enabledPlugins: { 'team-kit@team-tools': true } }),
    // With both spellings, Claude Code reads extraKnownMarketplaces only.
    { ...SHARED_SETTINGS, additionalMarketplaces: { 'team-tools': { source: { source: 'github', repo: 'acme/elsewhere' } } } },
  ]) {
    withRepo(shareRepo({ settings }), (dir) => {
      assert.equal(settingsHint(dir), true, JSON.stringify(settings));
    });
  }
});

test('a-6 accepts a marketplace at the repository\'s root, registered as . or ./', () => {
  for (const path of ['.', './']) {
    withRepo(shareRepo({ root: '', settings: registered({ source: 'directory', path }) }), (dir) => {
      const { code, out } = a6(dir);
      assert.equal(code, 0, `${path}: ${out}`);
    });
  }
});

test('a-6 says how to start without a marketplace, to commit one, and to rename a folder still called dot-claude-plugin/', () => {
  withRepo(shareRepo({ market: null, files: { [`${MARKETPLACE_ROOT}/.claude-plugin`]: null } }), (dir) => {
    const { code, out } = a6(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-6  Поделитесь настройкой с командой\n  FAIL  закоммиченный marketplace команды перечисляет плагин по относительному пути, а имя записи совпадает с `name` в `plugin\.json` плагина\n        Закоммиченного `\.claude-plugin\/marketplace\.json` нет\. Скачайте пример marketplace в `team-marketplace\/`, как показано в разделе «Разбор на примере», и закоммитьте его\./);
    assert.match(out, /Ни один закоммиченный marketplace пока не проходит пункт выше/);
  });
  withRepo(shareRepo({ files: { [`${MARKETPLACE_ROOT}/.claude-plugin`]: null, [`${MARKETPLACE_ROOT}/dot-claude-plugin/marketplace.json`]: json(TEAM_MARKET) } }), (dir) => {
    assert.match(String(marketHint(dir)), /`team-marketplace\/dot-claude-plugin\/` не станет marketplace, пока папка не называется `\.claude-plugin\/`: Claude Code читает marketplace из `\.claude-plugin\/marketplace\.json`\. Выполните `git mv team-marketplace\/dot-claude-plugin team-marketplace\/\.claude-plugin` \(или `mv`, если она ещё не закоммичена\) и закоммитьте\./);
  });
  withRepo(shareRepo({
    files: { [`${MARKETPLACE_ROOT}/.claude-plugin`]: null },
    after: (dir) => write(dir, { [`${MARKETPLACE_ROOT}/.claude-plugin/marketplace.json`]: json(TEAM_MARKET) }),
  }), (dir) => {
    assert.equal(marketHint(dir), '`team-marketplace` не закоммичен. Выполните `git add team-marketplace` и закоммитьте.');
  });
  // The template's own folders and dependencies are never read.
  withRepo(shareRepo({ files: { [`${MARKETPLACE_ROOT}/.claude-plugin`]: null, 'node_modules/kit/.claude-plugin/marketplace.json': json(TEAM_MARKET) } }), (dir) => {
    assert.match(String(marketHint(dir)), /Закоммиченного `\.claude-plugin\/marketplace\.json` нет\./);
  });
});

test('a-6 fails a marketplace name that Claude Code reserves or can\'t use', () => {
  assert.equal(nameProblem('team-tools'), null);
  for (const name of ['claude-plugins-official', 'Claude-Code-Plugins', 'GitHub', 'npm', 'skills-dir', 'healthcare', 'claude.code.plugins', 'anthropic-plugins.']) {
    assert.match(String(nameProblem(name)), /а это имя зарезервировано в Claude Code/, name);
  }
  assert.match(nameProblem('claude.code.plugins'), /называет marketplace `claude\.code\.plugins`, а это имя зарезервировано в Claude Code как другое написание `claude-code-plugins`/);
  assert.match(nameProblem('claudeai-team'), /называет marketplace `claudeai-team`, но имена, начинающиеся с `claudeai-`, зарезервированы за marketplace на claude\.ai/);
  for (const name of ['team tools', '.team', 'team..tools', 'tëam', 'team/tools']) assert.match(String(nameProblem(name)), /может содержать только буквы, цифры/, name);
  assert.equal(nameProblem(''), 'has no `name`');
  withRepo(shareRepo({ market: { ...TEAM_MARKET, name: 'claude-plugins-official' } }), (dir) => {
    const hint = String(marketHint(dir));
    assert.match(hint, /`team-marketplace\/\.claude-plugin\/marketplace\.json` называет marketplace `claude-plugins-official`, а это имя зарезервировано в Claude Code\./);
  });
});

test('a-6 fails a marketplace file that isn\'t JSON, or has no owner name or no plugins', () => {
  for (const [market, hint] of [
    ['{ "name": "team-tools", }', /Закоммиченный `team-marketplace\/\.claude-plugin\/marketplace\.json` не является корректным JSON: Expected double-quoted property name in JSON at position 24 \(line 1 column 25\)/],
    ['[]', /Закоммиченный `team-marketplace\/\.claude-plugin\/marketplace\.json` не является JSON-объектом с `name`, `owner` и списком `plugins`\./],
    [{ ...TEAM_MARKET, owner: {} }, /`team-marketplace\/\.claude-plugin\/marketplace\.json` нужен `owner` с `name`, например `"owner": \{ "name": "Your team" \}`\./],
    [{ ...TEAM_MARKET, owner: 'Your team' }, /`team-marketplace\/\.claude-plugin\/marketplace\.json` нужен `owner` с `name`, например `"owner": \{ "name": "Your team" \}`\./],
    [{ ...TEAM_MARKET, plugins: [] }, /Добавьте запись в `plugins`, например `\{ "name": "team-kit", "source": "\.\/plugins\/team-kit" \}`\./],
  ]) {
    withRepo(shareRepo({ market }), (dir) => {
      assert.match(String(marketHint(dir)), hint, JSON.stringify(market));
    });
  }
});

test('a-6 names what is wrong with each kind of entry', () => {
  for (const [entry, hint] of [
    [{ source: './plugins/team-kit' }, /The entry number 1 in `team-marketplace\/\.claude-plugin\/marketplace\.json` нужен `name` из букв, цифр, `\.`, `_` и `-`, начинающийся с буквы или цифры\./],
    [{ name: 'team-kit', source: { source: 'github', repo: 'acme/team-kit' } }, /The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` берёт плагин из источника `github`, который пришлось бы устанавливать каждому коллеге\. Держите плагин внутри папки marketplace и указывайте его относительным путём, например `"source": "\.\/plugins\/team-kit"`\./],
    [{ name: 'team-kit' }, /У The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` нет `source`\./],
    [{ name: 'team-kit', source: 'plugins/team-kit' }, /У The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` `source` равен `plugins\/team-kit`\. Относительный путь должен начинаться с `\.\/`: напишите `"source": "\.\/plugins\/team-kit"`\./],
    [{ name: 'team-kit', source: './plugins/../../team-kit' }, /У The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` `source` равен `\.\/plugins\/\.\.\/\.\.\/team-kit`, и `\.\.` выводит за пределы папки marketplace\./],
    [{ name: 'team-kit', source: '.\\plugins\\team-kit' }, /The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` пишет `source` с обратной косой чертой, `\.\\plugins\\team-kit`, а Claude Code отвергает такой путь в macOS и Linux\./],
    [{ name: 'team-kit', source: './plugins/missing' }, /The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` lists `team-marketplace\/plugins\/missing\/`, но там не закоммичен ни один плагин\./],
    [{ name: 'kit', source: './plugins/team-kit' }, /The entry `kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` называется `kit`, а `team-marketplace\/plugins\/team-kit\/\.claude-plugin\/plugin\.json` называет плагин `team-kit`\./],
  ]) {
    withRepo(shareRepo({ market: marketWith(entry) }), (dir) => {
      assert.match(String(marketHint(dir)), hint, JSON.stringify(entry));
    });
  }
  // The entry that gets furthest speaks for the marketplace.
  withRepo(shareRepo({ market: marketWith({ name: 'other', source: 'other' }, { name: 'kit', source: './plugins/team-kit' }) }), (dir) => {
    assert.match(String(marketHint(dir)), /The entry `kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` называется `kit`, а `team-marketplace\/plugins\/team-kit\/\.claude-plugin\/plugin\.json` называет плагин `team-kit`\./);
  });
  // Any entry that passes is enough.
  withRepo(shareRepo({ market: marketWith({ name: 'other', source: './plugins/missing' }, TEAM_MARKET.plugins[0]) }), (dir) => {
    assert.equal(marketHint(dir), true);
  });
});

test('a-6 names what is wrong with the plugin an entry lists', () => {
  const manifest = `${TEAM_KIT}/.claude-plugin/plugin.json`;
  withRepo(shareRepo({ files: { [manifest]: '{}\n' } }), (dir) => {
    assert.match(String(marketHint(dir)), /В закоммиченном `team-marketplace\/plugins\/team-kit\/\.claude-plugin\/plugin\.json` нет `name`\. Задайте `"name": "team-kit"`, имя записи, и закоммитьте\./);
  });
  withRepo(shareRepo({ files: { [manifest]: '{ name }' } }), (dir) => {
    assert.match(String(marketHint(dir)), /plugin\.json` не является корректным JSON/);
  });
  // The plugin.json is on disk but not committed.
  withRepo(shareRepo({ files: { [manifest]: null }, after: (dir) => write(dir, { [manifest]: json({ name: 'team-kit' }) }) }), (dir) => {
    assert.match(String(marketHint(dir)), /The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` lists `team-marketplace\/plugins\/team-kit\/`, but `team-marketplace\/plugins\/team-kit` не закоммичен\. Выполните `git add team-marketplace\/plugins\/team-kit` и закоммитьте\./);
  });
  withRepo(shareRepo({ files: { [manifest]: null } }), (dir) => {
    assert.match(String(marketHint(dir)), /The entry `team-kit` in `team-marketplace\/\.claude-plugin\/marketplace\.json` lists `team-marketplace\/plugins\/team-kit\/`, но в ней нет `\.claude-plugin\/plugin\.json`\./);
  });
  withRepo(shareRepo({ move: [], files: { [`${TEAM_KIT}/skills`]: null, [`${TEAM_KIT}/agents`]: null } }), (dir) => {
    assert.match(String(marketHint(dir)), /В плагине из `team-marketplace\/plugins\/team-kit\/` не закоммичено ни одного компонента: ни skill в `skills\/<name>\/SKILL\.md`, ни субагента в `agents\/`, ни `hooks\/hooks\.json`\./);
  });
});

test('a-6 fails a registration by a path on one machine, outside the repository or at another folder', () => {
  for (const [source, hint] of [
    [{ source: 'directory', path: '/Users/me/repo/team-marketplace' }, /У `extraKnownMarketplaces\.team-tools` `path` равен `[^`\s]*`: это путь на вашем компьютере, которого нет в клоне коллеги\. Напишите его относительно репозитория: `"path": "\.\/team-marketplace"`\./],
    [{ source: 'directory', path: '~/repo/team-marketplace' }, /это путь на вашем компьютере/],
    [{ source: 'directory', path: 'C:\\repo\\team-marketplace' }, /это путь на вашем компьютере/],
    [{ source: 'directory', path: '../repo/team-marketplace' }, /У `extraKnownMarketplaces\.team-tools` `path` равен `\.\.\/repo\/team-marketplace`, и `\.\.` выводит за пределы репозитория\./],
    [{ source: 'directory', path: '.\\team-marketplace' }, /`extraKnownMarketplaces\.team-tools` пишет `path` с обратной косой чертой, `\.\\team-marketplace`, а в macOS и Linux это не разделитель папок\./],
    [{ source: 'directory', path: './plugins' }, /У `extraKnownMarketplaces\.team-tools` `path` равен `\.\/plugins`, а marketplace лежит в `team-marketplace\/\.claude-plugin\/marketplace\.json`\./],
    [{ source: 'file', path: './team-marketplace' }, /Напишите `"path": "\.\/team-marketplace\/\.claude-plugin\/marketplace\.json"`\./],
    [{ source: 'directory' }, /has no `path`\. Write `"path": "\.\/team-marketplace"`/],
    [{ source: 'github', repo: 'acme/team-marketplace' }, /`extraKnownMarketplaces\.team-tools` регистрирует marketplace из источника `github`\./],
    ['./team-marketplace', /has no `source` object/],
  ]) {
    withRepo(shareRepo({ settings: registered(source) }), (dir) => {
      assert.match(String(settingsHint(dir)), hint, JSON.stringify(source));
    });
  }
});

test('a-6 fails a registration under another key, or under the alias beside extraKnownMarketplaces', () => {
  withRepo(shareRepo({ settings: registered({ source: 'directory', path: './team-marketplace' }, 'team') }), (dir) => {
    assert.match(String(settingsHint(dir)), /`extraKnownMarketplaces` регистрирует marketplace под ключом `team`, но ключом должно быть `name` marketplace из `team-marketplace\/\.claude-plugin\/marketplace\.json`, `team-tools`\./);
  });
  withRepo(shareRepo({ settings: registered({ source: 'directory', path: './elsewhere' }, 'other') }), (dir) => {
    assert.match(String(settingsHint(dir)), /`extraKnownMarketplaces` в закоммиченном `\.claude\/settings\.json` не регистрирует marketplace с именем `team-tools`\./);
  });
  withRepo(shareRepo({ settings: settingsWith({ enabledPlugins: { 'team-kit@team-tools': true } }) }), (dir) => {
    assert.match(String(settingsHint(dir)), /Закоммиченный `\.claude\/settings\.json` не регистрирует ни одного marketplace\. Добавьте `"extraKnownMarketplaces": \{ "team-tools": \{ "source": \{ "source": "directory", "path": "\.\/team-marketplace" \} \} \}` и закоммитьте\./);
  });
  withRepo(shareRepo({ settings: { ...SHARED_SETTINGS, extraKnownMarketplaces: {}, additionalMarketplaces: SHARED_SETTINGS.extraKnownMarketplaces } }), (dir) => {
    assert.match(String(settingsHint(dir)), /В закоммиченном `\.claude\/settings\.json` заданы и `extraKnownMarketplaces`, и другое его написание, `additionalMarketplaces`; Claude Code тогда читает только `extraKnownMarketplaces`, поэтому `team-tools` в `additionalMarketplaces` игнорируется\./);
  });
});

test('a-6 names what is wrong with enabledPlugins', () => {
  for (const [enabledPlugins, hint] of [
    [{ 'team-kit@team-marketplace': true }, /`enabledPlugins` включает `team-kit@team-marketplace`, но часть после `@` должна быть `name` marketplace, `team-tools`: напишите `"team-kit@team-tools": true` и закоммитьте\./],
    [{ 'team-kit@team-tools': 'true' }, /`enabledPlugins` задаёт для `team-kit@team-tools` значение `"true"`\. Поставьте логическое значение JSON `true`, без кавычек/],
    [{ 'team-kit@team-tools': false }, /`enabledPlugins` в закоммиченном `\.claude\/settings\.json` выключает `team-kit@team-tools`\. Поставьте `true`, чтобы плагин был включён у всех, а для себя выключайте его только в `\.claude\/settings\.local\.json`\./],
    [{ 'claude-code-setup@claude-plugins-official': true }, /Закоммиченный `\.claude\/settings\.json` регистрирует `team-tools`, но не включает ни одного его плагина\./],
    [undefined, /не включает ни одного его плагина/],
  ]) {
    withRepo(shareRepo({ settings: { ...SHARED_SETTINGS, enabledPlugins } }), (dir) => {
      assert.match(String(settingsHint(dir)), hint, JSON.stringify(enabledPlugins));
    });
  }
});

test('a-6 says to create the settings, fix their JSON, or commit them, with -f when an ignore rule hides them', () => {
  withRepo(shareRepo({ settings: null }), (dir) => {
    assert.match(String(settingsHint(dir)), /Нет закоммиченного `\.claude\/settings\.json`\./);
  });
  withRepo(shareRepo({ settings: '{ "enabledPlugins": }' }), (dir) => {
    assert.match(String(settingsHint(dir)), /Закоммиченный `\.claude\/settings\.json` — невалидный JSON: Unexpected token '\}', \.\.\."Plugins": \}" is not valid JSON/);
  });
  // A global excludes file that ignores .claude/ hid the file from `git add`.
  withRepo(shareRepo({
    after: (dir) => {
      git(dir, 'rm', '-q', '--cached', '.claude/settings.json');
      commit(dir, 'Drop the settings', []);
      write(dir, { '.git/global-ignore': '.claude/\n' });
      git(dir, 'config', 'core.excludesFile', join(dir, '.git', 'global-ignore'));
    },
  }), (dir) => {
    assert.match(String(settingsHint(dir)), /`\.claude\/settings\.json` не закоммичен, а строка 1 в `[^`\s]*`, `\.claude\/`, его игнорирует\. Выполните `git add -f \.claude\/settings\.json` и закоммитьте\./);
  });
  // The fix is in the working copy only.
  withRepo(shareRepo({
    settings: { ...SHARED_SETTINGS, enabledPlugins: {} },
    after: (dir) => write(dir, { '.claude/settings.json': json(SHARED_SETTINGS) }),
  }), (dir) => {
    assert.equal(settingsHint(dir), 'Ваша копия `.claude/settings.json` регистрирует marketplace и включает плагин, но это изменение не закоммичено. Выполните `git add .claude/settings.json` и закоммитьте.');
  });
});

test('a-6 reads a marketplace.json and plugin.json that start with a byte-order mark, as claude plugin validate does, and names the mark in other JSON files', () => {
  const BOM = '\uFEFF';
  const plugin = `${TEAM_KIT}/.claude-plugin/plugin.json`;
  withRepo(shareRepo({ market: `${BOM}${json(TEAM_MARKET)}`, files: { [plugin]: `${BOM}${json({ name: 'team-kit', version: '0.1.0', description: 'A team\'s shared setup', author: { name: 'Your team' } })}` } }), (dir) => {
    const { code, out } = a6(dir);
    assert.equal(code, 0, out);
  });
  withRepo(shareRepo({ settings: `${BOM}${json(SHARED_SETTINGS)}` }), (dir) => {
    assert.equal(settingsHint(dir), 'Закоммиченный `.claude/settings.json` — невалидный JSON: он начинается с метки порядка байтов UTF-8. Сохраните его как UTF-8 без неё и закоммитьте.');
  });
  const hook = `${TEAM_KIT}/hooks/hooks.json`;
  withRepo(shareRepo({ move: [], files: { [hook]: `${BOM}${json({ hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'true' }] }] } })}` } }), (dir) => {
    assert.equal(movedHint(dir), `Закоммиченный \`${hook}\` — невалидный JSON: он начинается с метки порядка байтов UTF-8. Сохраните его как UTF-8 без неё и закоммитьте.`);
  });
});

test('a-6 fails until a component of your own is in the plugin and gone from .claude/', () => {
  withRepo(shareRepo({ move: [] }), (dir) => {
    assert.match(String(movedHint(dir)), /В плагине только skill `onboard` и субагент `config-reviewer` из примера\. Перенесите в него свой компонент: skill в `team-marketplace\/plugins\/team-kit\/skills\/<name>\/SKILL\.md`, субагент в `team-marketplace\/plugins\/team-kit\/agents\/<name>\.md` или hook в `team-marketplace\/plugins\/team-kit\/hooks\/hooks\.json`, как описано в разделе «Ваша очередь», командой `git mv`, чтобы оригинал исчез из `\.claude\/`\./);
  });
  // Copied, not moved.
  withRepo(shareRepo({ move: [], files: { [`${TEAM_KIT}/agents/test-gaps.md`]: TEST_GAPS } }), (dir) => {
    assert.equal(movedHint(dir), '`team-marketplace/plugins/team-kit/agents/test-gaps.md` лежит в плагине, но `.claude/agents/test-gaps.md` всё ещё закоммичен, поэтому субагент загружается дважды, как `test-gaps` и `team-kit:test-gaps`. Выполните `git rm .claude/agents/test-gaps.md` и закоммитьте.');
  });
  // The same subagent name in a file of another name.
  withRepo(shareRepo({ move: [], files: { [`${TEAM_KIT}/agents/review/gaps.md`]: TEST_GAPS } }), (dir) => {
    assert.match(String(movedHint(dir)), /`team-marketplace\/plugins\/team-kit\/agents\/review\/gaps\.md` лежит в плагине, но `\.claude\/agents\/test-gaps\.md` всё ещё закоммичен, поэтому субагент загружается дважды, как `test-gaps` и `team-kit:test-gaps`\./);
  });
  // A skill moved instead of the subagent.
  withRepo(shareRepo({ move: [['.claude/skills/tdd', 'skills/tdd']] }), (dir) => {
    assert.equal(movedHint(dir), true);
  });
  // A copied skill, by its folder or by its frontmatter name on either side.
  for (const [files, twin] of [
    [{ [`${TEAM_KIT}/skills/tdd/SKILL.md`]: TDD_SKILL }, '.claude/skills/tdd'],
    [{ [`${TEAM_KIT}/skills/testing/SKILL.md`]: TDD_SKILL }, '.claude/skills/tdd'],
    [{ [`${TEAM_KIT}/skills/review/SKILL.md`]: '---\ndescription: Reviews a change.\n---\n\nReview it.\n', '.claude/skills/checklist/SKILL.md': '---\nname: review\ndescription: Reviews a change.\n---\n' }, '.claude/skills/checklist'],
  ]) {
    withRepo(shareRepo({ move: [], files }), (dir) => {
      const hint = String(movedHint(dir));
      assert.match(hint, /поэтому skill загружается дважды, как `\/(tdd|review)` и `\/team-kit:(tdd|review)`/, hint);
      assert.ok(hint.endsWith(`Выполните \`git rm -r ${twin}\` и закоммитьте.`), hint);
    });
  }
  // On disk in the plugin, but not committed.
  withRepo(shareRepo({ move: [], after: (dir) => write(dir, { [`${TEAM_KIT}/skills/release/SKILL.md`]: '---\ndescription: Cuts a release.\n---\n' }) }), (dir) => {
    assert.equal(movedHint(dir), '`team-marketplace/plugins/team-kit/skills/release/SKILL.md` не закоммичен. Выполните `git add team-marketplace/plugins/team-kit/skills/release/SKILL.md` и закоммитьте.');
  });
  withRepo(shareRepo({ market: { ...TEAM_MARKET, plugins: [] } }), (dir) => {
    assert.match(String(movedHint(dir)), /Ни один закоммиченный marketplace пока не перечисляет закоммиченный плагин/);
  });
});

test('a-6 doesn\'t count the practice copy\'s /tutor skill as a component you moved', () => {
  const tutor = { [`${TEAM_KIT}/skills/tutor/SKILL.md`]: '---\nname: tutor\ndescription: Coaches you through one lesson.\ndisable-model-invocation: true\n---\n\nTutor.\n' };
  withRepo(shareRepo({ move: [], files: tutor }), (dir) => {
    assert.equal(movedHint(dir), '`team-marketplace/plugins/team-kit/skills/tutor/SKILL.md` — это skill `/tutor` учебной копии, он пришёл с шаблоном, поэтому не считается вашим собственным. Верните его в `.claude/skills/tutor/` командой `git mv`, затем перенесите в плагин свой skill, субагент или hook и закоммитьте.');
  });
  // Moved together with one of your own, it doesn't stop the item passing.
  withRepo(shareRepo({ files: tutor }), (dir) => {
    assert.equal(movedHint(dir), true);
  });
});

test('a-6 tells a copied or uncommitted /tutor skill apart from a component you moved', () => {
  const text = '---\nname: tutor\ndescription: Coaches you through one lesson.\ndisable-model-invocation: true\n---\n\nTutor.\n';
  // Copied: .claude/skills/tutor/ is still committed, so the hint removes the copy instead of moving it back.
  withRepo(shareRepo({ move: [], files: { '.claude/skills/tutor/SKILL.md': text, [`${TEAM_KIT}/skills/tutor/SKILL.md`]: text } }), (dir) => {
    assert.equal(movedHint(dir), '`team-marketplace/plugins/team-kit/skills/tutor/SKILL.md` — это skill `/tutor` учебной копии, он пришёл с шаблоном, поэтому не считается вашим собственным. Удалите копию командой `git rm -r team-marketplace/plugins/team-kit/skills/tutor`, затем перенесите в плагин свой skill, субагент или hook и закоммитьте.');
  });
  // Uncommitted in the plugin, it is neither a component of your own nor a file to commit.
  withRepo(shareRepo({ move: [], after: (dir, plugin) => write(dir, { [`${plugin}/skills/tutor/SKILL.md`]: text }) }), (dir) => {
    assert.match(movedHint(dir), /^В плагине только skill/);
  });
});

test('a-6 accepts a hook moved into hooks/hooks.json, and fails one still in the settings, still in .claude/ or whose script isn\'t committed', () => {
  const hooksWith = (command, args) => json({ hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command, ...(args ? { args } : {}) }] }] } });
  const moved = { move: [[PROTECT_HOOK, 'scripts/protect-files.sh']], settings: { ...SHARED_SETTINGS, hooks: undefined } };
  for (const [command, args] of [['"${CLAUDE_PLUGIN_ROOT}/scripts/protect-files.sh"'], ['${CLAUDE_PLUGIN_ROOT}/scripts/protect-files.sh', []], ['bash', ['${CLAUDE_PLUGIN_ROOT}/scripts/protect-files.sh']]]) {
    withRepo(shareRepo({ ...moved, move: [...moved.move], files: { [`${TEAM_KIT}/hooks/hooks.json`]: hooksWith(command, args) } }), (dir) => {
      const { code, out } = a6(dir);
      assert.equal(code, 0, `${command}: ${out}`);
    });
  }
  const hook = `${TEAM_KIT}/hooks/hooks.json`;
  // Left in the settings too.
  withRepo(shareRepo({ ...moved, settings: SHARED_SETTINGS, files: { [hook]: hooksWith('"${CLAUDE_PLUGIN_ROOT}/scripts/protect-files.sh"') } }), (dir) => {
    assert.match(String(movedHint(dir)), /`\.claude\/settings\.json` по-прежнему запускает тот же hook, `protect-files\.sh`, поэтому он выполнялся бы дважды при каждом событии\. Удалите этот hook из `\.claude\/settings\.json` и закоммитьте\./);
  });
  withRepo(shareRepo({ move: [], settings: { ...SHARED_SETTINGS, hooks: undefined }, files: { [hook]: hooksWith('${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-files.sh', []) } }), (dir) => {
    assert.match(String(movedHint(dir)), /Hook в `team-marketplace\/plugins\/team-kit\/hooks\/hooks\.json` по-прежнему запускает `\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/protect-files\.sh`, скрипт в `\.claude\/`\./);
  });
  withRepo(shareRepo({ move: [], settings: { ...SHARED_SETTINGS, hooks: undefined }, files: { [hook]: hooksWith('"${CLAUDE_PLUGIN_ROOT}/scripts/check.sh"') } }), (dir) => {
    assert.equal(movedHint(dir), 'Hook в `team-marketplace/plugins/team-kit/hooks/hooks.json` запускает `team-marketplace/plugins/team-kit/scripts/check.sh`, которого нет в плагине. Положите скрипт туда или исправьте путь после `${CLAUDE_PLUGIN_ROOT}/` и закоммитьте.');
  });
  withRepo(shareRepo({
    move: [], settings: { ...SHARED_SETTINGS, hooks: undefined }, files: { [hook]: hooksWith('"${CLAUDE_PLUGIN_ROOT}/scripts/check.sh"') },
    after: (dir) => write(dir, { [`${TEAM_KIT}/scripts/check.sh`]: '#!/bin/bash\nexit 0\n' }),
  }), (dir) => {
    assert.equal(movedHint(dir), 'Hook в `team-marketplace/plugins/team-kit/hooks/hooks.json` запускает `team-marketplace/plugins/team-kit/scripts/check.sh`, но он не закоммичен. Выполните `git add team-marketplace/plugins/team-kit/scripts/check.sh` и закоммитьте.');
  });
  for (const text of ['{ "hooks": ', json({ PreToolUse: [] })]) {
    withRepo(shareRepo({ move: [], files: { [hook]: text } }), (dir) => {
      assert.match(String(movedHint(dir)), /невалидный JSON|Положите запись под ключ верхнего уровня `hooks`/, text);
    });
  }
});

test('a-6 fails while git tracks a personal file, or only an uncommitted or uncommon rule ignores it', () => {
  withRepo(shareRepo({ gitignore: '.practice/\nCLAUDE.local.md\n', files: { '.claude/settings.local.json': '{}\n' } }), (dir) => {
    assert.equal(personalHint(dir), 'git отслеживает `.claude/settings.local.json`, а этот файл только ваш. Выполните `git rm --cached .claude/settings.local.json`, добавьте строку `.claude/settings.local.json` в `.gitignore` и закоммитьте.');
  });
  withRepo(shareRepo({ gitignore: '.practice/\n', files: { 'CLAUDE.local.md': '# mine\n' }, after: (dir) => git(dir, 'rm', '-q', '--cached', 'CLAUDE.local.md') }), (dir) => {
    const hint = String(personalHint(dir));
    assert.match(hint, /`CLAUDE\.local\.md` всё ещё есть в вашем последнем коммите\. Закоммитьте его удаление\. Ни один закоммиченный `\.gitignore` не игнорирует `\.claude\/settings\.local\.json`\./);
  });
  withRepo(shareRepo({ gitignore: '.practice/\n' }), (dir) => {
    assert.equal(personalHint(dir), 'Ни один закоммиченный `.gitignore` не игнорирует `.claude/settings.local.json` и `CLAUDE.local.md`. Добавьте строки `.claude/settings.local.json` и `CLAUDE.local.md` в `.gitignore` и закоммитьте. Правило в вашем глобальном файле исключений git не считается: его нет в репозитории.');
  });
  withRepo(shareRepo({ gitignore: '.practice/\nCLAUDE.local.md\n', after: (dir) => write(dir, { '.git/info/exclude': '.practice/\n.claude/settings.local.json\n' }) }), (dir) => {
    assert.match(String(personalHint(dir)), /`\.claude\/settings\.local\.json` игнорирует только `\.git\/info\/exclude`, а git никогда не коммитит этот файл, поэтому у коллег этого правила не будет\. Добавьте строку `\.claude\/settings\.local\.json` в `\.gitignore` и закоммитьте\./);
  });
  // Where Claude Code adds its rule: the global excludes file.
  withRepo(shareRepo({
    gitignore: '.practice/\nCLAUDE.local.md\n',
    after: (dir) => {
      write(dir, { '.git/global-ignore': '**/.claude/settings.local.json\n' });
      git(dir, 'config', 'core.excludesFile', join(dir, '.git', 'global-ignore'));
    },
  }), (dir) => {
    assert.match(String(personalHint(dir)), /Ни один закоммиченный `\.gitignore` не игнорирует `\.claude\/settings\.local\.json`\./);
  });
  withRepo(shareRepo({ gitignore: '.practice/\n', after: (dir) => write(dir, { '.gitignore': PERSONAL_IGNORE }) }), (dir) => {
    const hint = String(personalHint(dir));
    assert.match(hint, /`\.gitignore` игнорирует `\.claude\/settings\.local\.json`, но это правило не закоммичено\. Выполните `git add \.gitignore` и закоммитьте\./);
    assert.match(hint, /`\.gitignore` игнорирует `\.claude\/settings\.local\.json`, но это правило не закоммичено\. Выполните `git add \.gitignore` и закоммитьте\. `\.gitignore` игнорирует `CLAUDE\.local\.md`, но это правило не закоммичено\./);
  });
  for (const gitignore of ['.practice/\n*.local.json\n*.local.md\n', '.practice/\n**/.claude/settings.local.json\n/CLAUDE.local.md\n']) {
    withRepo(shareRepo({ gitignore }), (dir) => {
      assert.equal(personalHint(dir), true, gitignore);
    });
  }
});

test('a-6 reads the saved validation, and says what is wrong with it', () => {
  const save = '`claude plugin validate ./team-marketplace/plugins/team-kit --strict --json > .practice/a-6-validate.json`';
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
  const elsewhere = '/nonexistent-a6-checkout/claude-code-practice';
  for (const report of [
    (dir, plugin) => reportOf(join(realpathSync(dir), plugin)),
    // The folder as the Learner's shell named it, through a symlink such as macOS's /tmp.
    (dir, plugin) => reportOf(join(dir, plugin, '.claude-plugin', 'plugin.json')),
    reportOf(`${elsewhere}/${TEAM_KIT}/.claude-plugin/plugin.json`),
    reportOf(`C:\\Users\\me\\repo\\${TEAM_KIT.replace(/\//g, '\\')}`),
    (dir, plugin) => utf16(json(VALID_REPORT(dir, plugin))),
  ]) {
    withRepo(shareRepo({ report }), (dir) => {
      assert.equal(validateHint(dir), true, String(report));
    });
  }
  const other = mkdtempSync(join(tmpdir(), 'other-'));
  try {
    for (const [report, hint] of [
      [null, `Файла \`.practice/a-6-validate.json\` ещё нет. Когда плагин на месте, выполните из корня репозитория ${save}.`],
      ['✔ Validation passed\n', /Сохраните JSON-отчёт с `--json`: `claude plugin validate \.\/team-marketplace\/plugins\/team-kit --strict --json > \.practice\/a-6-validate\.json`\./],
      ['oops', /— не JSON\. Сохраните отчёт без изменений/],
      [[], /`\.practice\/a-6-validate\.json` — не отчёт `claude plugin validate --json`: в нём нет `success`\./],
      [reportOf('x', { success: false, manifest: { errors: [{ path: 'name', message: 'Plugin name cannot contain spaces' }], warnings: ['No version'] } }), /Сообщается: `Plugin name cannot contain spaces`; `No version`\. Исправьте то, о чём сообщается, выполняйте `claude plugin validate \.\/team-marketplace\/plugins\/team-kit --strict`, пока она не пройдёт, затем сохраните отчёт заново: `claude plugin validate \.\/team-marketplace\/plugins\/team-kit --strict --json > \.practice\/a-6-validate\.json`\./],
      [reportOf('x', { success: false, manifest: null }), /проверка не пройдена\. Исправьте то, о чём сообщается/],
      [(dir, plugin) => reportOf(join(realpathSync(dir), plugin), { strict: false }), /В `\.practice\/a-6-validate\.json` проверка без `--strict`, а она пропускает предупреждения\./],
      [reportOf(''), /В `\.practice\/a-6-validate\.json` нет `target`, поэтому проверка не знает, что проверялось\./],
      [(dir) => reportOf(join(realpathSync(dir), MARKETPLACE_ROOT, '.claude-plugin', 'marketplace.json')), /проверен marketplace, .*, а он не открывает файлы skills и агентов плагина\. Проверьте папку плагина/],
      [reportOf(other), /В `\.practice\/a-6-validate\.json` проверено `[^`\s]*`, вне этого репозитория, а не папка плагина в нём \(`\.\/team-marketplace\/plugins\/team-kit`\)\./],
      [(dir) => reportOf(realpathSync(dir)), /сам репозиторий, а не папка плагина в нём/],
      [(dir) => reportOf(join(realpathSync(dir), MARKETPLACE_ROOT)), /В `\.practice\/a-6-validate\.json` проверено `team-marketplace`, а это не закоммиченная папка плагина \(`\.\/team-marketplace\/plugins\/team-kit`\)\./],
      [reportOf(`${elsewhere}/plugins/other/.claude-plugin/plugin.json`), /В `\.practice\/a-6-validate\.json` проверено `\/nonexistent-a6-checkout\/claude-code-practice\/plugins\/other\/\.claude-plugin\/plugin\.json`, чего нет на этой машине и что не оканчивается закоммиченной папкой плагина \(`\.\/team-marketplace\/plugins\/team-kit`\)\./],
    ]) {
      withRepo(shareRepo({ report }), (dir) => {
        const result = validateHint(dir);
        if (typeof hint === 'string') assert.equal(result, hint);
        else assert.match(String(result), hint, JSON.stringify(report));
      });
    }
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});

test('a-6 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(() => {
    const dir = repo({ '.gitignore': '.practice/\nnode_modules/\n', 'README.md': '# demo\n' });
    commit(dir, 'Start');
    return dir;
  }, (dir) => {
    const { code, out } = check(['a-6', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  // The solutions branch: a new skill in team-kit that .claude/skills/ never
  // had, and a validation saved with its paths scrubbed.
  withRepo(shareRepo({
    move: [],
    files: { [`${TEAM_KIT}/skills/release-notes/SKILL.md`]: '---\ndescription: Drafts release notes from the commits since the last tag.\n---\n' },
    report: reportOf(`/tmp/claude-code-practice/${TEAM_KIT}/.claude-plugin/plugin.json`),
  }), (dir) => {
    const { code, out } = check(['a-6', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// A repository after lesson a-7: the bounded runner and its bounds file
// committed, the Intermediate settings in .claude/settings.json, and two real
// runs saved, a slice of a task and a run a limit stopped. The options
// replace a step: `script` (null for none) is saved with `mode` and committed
// unless `commitScript` is false; `bounds` (null for none) is the bounds
// file, as an object or text, committed unless `commitBounds` is false;
// `settings` is the committed .claude/settings.json (null for none);
// `gitignore` is committed first; `slice` and `capped` (null for none) are
// the saved runs, as objects, text or Buffers; `after` changes the
// repository last. The items run the script with a stand-in for `claude`,
// never Claude Code itself.
const BOUNDS_PATH = '.claude/bounded-run.json';
const BOUNDED_CALL = [
  'claude -p "$1" \\',
  '  --setting-sources project \\',
  `  --settings ${BOUNDS_PATH} \\`,
  '  --permission-mode dontAsk \\',
  '  --model sonnet \\',
  '  --max-turns 15 \\',
  '  --max-budget-usd 2 \\',
  '  --output-format json > "$2"',
].join('\n');
const BOUNDED = [
  '#!/bin/bash',
  `# Runs one unattended task inside the bounds in ${BOUNDS_PATH}.`,
  'set -u',
  'if [ $# -ne 2 ]; then',
  '  echo \'Usage: scripts/bounded-run.sh "<task>" <result.json>\' >&2',
  '  exit 2',
  'fi',
  'before=$(git rev-parse --short HEAD)',
  BOUNDED_CALL,
  'status=$?',
  'jq \'{subtype, num_turns, total_cost_usd, denied: [.permission_denials[]? | .tool_input.command // .tool_name]}\' "$2"',
  'echo "HEAD before: $before, after: $(git rev-parse --short HEAD)"',
  'git status --short',
  'exit "$status"',
  '',
].join('\n');
const BOUNDS = {
  permissions: {
    allow: ['Edit(./src/**)', 'Edit(./test/**)', 'Bash(npm test *)'],
    deny: ['Agent', 'Read(./.env)', 'Read(./.env.*)', 'Bash(git commit *)', 'Bash(git push *)'],
  },
  sandbox: { enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: false },
};
const PROJECT_SETTINGS = { permissions: { allow: ['Bash(npm test)'], deny: ['Read(./.env)', 'Read(./.env.*)'] }, sandbox: { enabled: true } };
const SESSION = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const SLICE_RUN = {
  type: 'result', subtype: 'success', is_error: false, num_turns: 9, total_cost_usd: 0.42,
  result: 'Added test/total.test.js for total(); npm test passes. The commit was denied.',
  session_id: SESSION, permission_denials: [{ tool_name: 'Bash', tool_use_id: 'toolu_00000000000000000000000000', tool_input: { command: 'git commit -m "Add a test for total"' } }],
};
const CAPPED_RUN = { type: 'result', subtype: 'error_max_budget_usd', is_error: true, num_turns: 1, total_cost_usd: 0.03, session_id: SESSION, permission_denials: [] };

// The runner with each `[from, to]` replaced.
function runner(...pairs) {
  return pairs.reduce((text, [from, to]) => {
    assert.ok(text.includes(from), `the runner has no ${JSON.stringify(from)}`);
    return text.replace(from, () => to);
  }, BOUNDED);
}
const runnerCall = (call) => runner([BOUNDED_CALL, call]);
const boundsWith = (change) => {
  const bounds = structuredClone(BOUNDS);
  change(bounds);
  return bounds;
};

function boundedRepo({ script = BOUNDED, mode = 0o755, commitScript = true, bounds = BOUNDS, commitBounds = true, settings = PROJECT_SETTINGS, gitignore = '.practice/\n', slice = SLICE_RUN, capped = CAPPED_RUN, after } = {}) {
  return () => {
    const dir = repo({ '.gitignore': gitignore, 'README.md': '# demo\n', 'src/total.js': TOTAL });
    if (settings !== null) write(dir, { '.claude/settings.json': typeof settings === 'string' ? settings : json(settings) });
    commit(dir, 'Start');
    if (bounds !== null) {
      write(dir, { [BOUNDS_PATH]: typeof bounds === 'string' ? bounds : json(bounds) });
      if (commitBounds) commit(dir, 'Add the bounds', [BOUNDS_PATH]);
    }
    if (script !== null) {
      write(dir, { [RUNNER]: script });
      chmodSync(join(dir, RUNNER), mode);
      if (commitScript) commit(dir, 'Add the bounded runner', [RUNNER]);
    }
    for (const [path, run] of [[SLICE, slice], [CAPPED, capped]]) {
      if (run !== null) write(dir, { [path]: typeof run === 'string' || Buffer.isBuffer(run) ? run : JSON.stringify(run, null, 2) });
    }
    after?.(dir);
    return dir;
  };
}

const a7 = (dir) => check(['a-7', '--dir', dir]);
// One item on its own, which runs only what that item needs.
const runnerHint = (dir) => boundedScript().check(openRepo(dir));
const limitHint = (dir) => runLimits().check(openRepo(dir));
const ruleHint = (dir) => narrowRules().check(openRepo(dir));
const sandboxHint = (dir) => strictSandbox().check(openRepo(dir));
const sliceHint = (dir) => sliceRun().check(openRepo(dir));
const cappedHint = (dir) => cappedRun().check(openRepo(dir));
// The first four items, which read the committed runner and bounds, from
// one run of it.
const committedHints = (dir) => {
  const opened = openRepo(dir);
  return [boundedScript(), runLimits(), narrowRules(), strictSandbox()].map((item) => item.check(opened));
};

test('a-7 passes for the lesson\'s runner and bounds, committed, and a slice and a capped run saved', () => {
  withRepo(boundedRepo(), (dir) => {
    const { code, out } = a7(dir);
    assert.equal(code, 0, out);
    assert.match(out, /a-7  Ограничения для автономных запусков\n  PASS  `scripts\/bounded-run\.sh` закоммичен и исполняемый, принимает задачу и путь результата \(`scripts\/bounded-run\.sh "<task>" <result\.json>`\) и запускает `claude -p` в режиме `dontAsk` с JSON-выводом и закоммиченным файлом `--settings`\n  PASS  в нём заданы лимит ходов и лимит расходов\n  PASS  каждое правило allow называет одну команду или одну папку, а правила deny останавливают `git commit` и `git push`\n  PASS  файл настроек включает песочницу \(sandbox\) в строгом режиме без авторазрешения и заставляет запуск отказаться стартовать без неё\n  PASS  `\.practice\/a-7-slice\.json` содержит запуск среза, стоимость которого ниже вашего лимита расходов\n  PASS  `\.practice\/a-7-capped\.json` содержит запуск, остановленный лимитом\n\nПройдено 6 из 6/);
  });
});

test('a-7 says to write the runner, commit it or make it executable', () => {
  withRepo(boundedRepo({ script: null }), (dir) => {
    const { code, out } = a7(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-7  Ограничения для автономных запусков\n  FAIL  `scripts\/bounded-run\.sh` закоммичен и исполняемый, принимает задачу и путь результата \(`scripts\/bounded-run\.sh "<task>" <result\.json>`\) и запускает `claude -p` в режиме `dontAsk` с JSON-выводом и закоммиченным файлом `--settings`\n        Нет файла `scripts\/bounded-run\.sh`\./);
    assert.match(out, /a-7  Ограничения для автономных запусков\n  FAIL  `scripts\/bounded-run\.sh` закоммичен и исполняемый, принимает задачу и путь результата \(`scripts\/bounded-run\.sh "<task>" <result\.json>`\) и запускает `claude -p` в режиме `dontAsk` с JSON-выводом и закоммиченным файлом `--settings`\n        Нет файла `scripts\/bounded-run\.sh`\./);
  });
  withRepo(boundedRepo({ commitScript: false }), (dir) => {
    assert.equal(runnerHint(dir), '`scripts/bounded-run.sh` не закоммичен. Выполните `git add scripts/bounded-run.sh` и закоммитьте.');
  });
  withRepo(boundedRepo({ mode: 0o644 }), (dir) => {
    const { code, out } = a7(dir);
    assert.equal(code, 1, out);
    assert.match(out, /Выполните `chmod \+x scripts\/bounded-run\.sh`, затем `git add scripts\/bounded-run\.sh` и закоммитьте\./);
    assert.match(out, /PASS  в нём заданы лимит ходов и лимит расходов\n  PASS  каждое правило allow называет одну команду или одну папку, а правила deny останавливают `git commit` и `git push`\n  PASS  файл настроек включает песочницу \(sandbox\) в строгом режиме без авторазрешения и заставляет запуск отказаться стартовать без неё\n  PASS  `\.practice\/a-7-slice\.json` содержит запуск среза, стоимость которого ниже вашего лимита расходов\n  PASS  `\.practice\/a-7-capped\.json` содержит запуск, остановленный лимитом\n\nПройдено 5 из 6/);
  });
});

test('a-7 runs the committed runner, not the working copy, and points out uncommitted changes', () => {
  withRepo(boundedRepo({ script: runner(['--permission-mode dontAsk', '--permission-mode auto']), after: (dir) => write(dir, { [RUNNER]: BOUNDED }) }), (dir) => {
    assert.match(String(runnerHint(dir)), /Он работает в режиме `auto`: используйте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\. В вашей копии `scripts\/bounded-run\.sh` есть незакоммиченные изменения: если они это исправляют, закоммитьте их\./);
  });
  withRepo(boundedRepo({ after: (dir) => write(dir, { [RUNNER]: runner(['--permission-mode dontAsk', '--permission-mode auto']) }) }), (dir) => {
    assert.equal(runnerHint(dir), true);
  });
});

test('a-7 accepts the call written in other ways', () => {
  const inline = `'${JSON.stringify(BOUNDS)}'`;
  for (const script of [
    // --flag=value, and the flags in another order.
    runnerCall(`claude --output-format=json --max-turns=15 --max-budget-usd=2.50 --permission-mode=dontAsk --settings=${BOUNDS_PATH} -p "$1" > "$2"`),
    // Values in variables, quoted and not.
    runner(['set -u\n', 'set -u\nturns=15\nbudget=0.5\nbounds=.claude/bounded-run.json\n'], ['--max-turns 15', '--max-turns "$turns"'], ['--max-budget-usd 2', '--max-budget-usd $budget'], [`--settings ${BOUNDS_PATH}`, '--settings "$bounds"']),
    // The flags in an array.
    runnerCall(`limits=(--max-turns 15 --max-budget-usd .5)\nclaude -p "$1" --settings ${BOUNDS_PATH} --permission-mode dontAsk "\${limits[@]}" --output-format json > "$2"`),
    // From the repository's root, with the settings file's full path.
    runnerCall(`root=$(git rev-parse --show-toplevel)\ncd "$root" || exit 1\nclaude -p "$1" --settings "$root/${BOUNDS_PATH}" --permission-mode dontAsk --max-turns 15 --max-budget-usd 2 --output-format json > "$2"`),
    // From another folder, with a relative path from there.
    runnerCall(`out=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")\ncd scripts || exit 1\nclaude -p "$1" --settings ../${BOUNDS_PATH} --permission-mode dontAsk --max-turns 15 --max-budget-usd 2 --output-format json > "$out"`),
    // The task on stdin, or inside a longer prompt.
    runnerCall(`printf '%s\\n' "$1" | claude -p --settings ${BOUNDS_PATH} --permission-mode dontAsk --max-turns 15 --max-budget-usd 2 --output-format json > "$2"`),
    runnerCall(`claude -p "Do this task, and only this: $1 Then stop." --settings ${BOUNDS_PATH} --permission-mode dontAsk --max-turns 15 --max-budget-usd 2 --output-format json > "$2"`),
    // A runner that checks its bounds file before the run.
    runner(['set -u\n', `set -u\njq empty ${BOUNDS_PATH} || { echo "No valid ${BOUNDS_PATH}." >&2; exit 1; }\n`]),
    // The bounds inline, and the rules as flags.
    runnerCall(`claude -p "$1" --settings ${inline} --permission-mode dontAsk --max-turns 15 --max-budget-usd 2 --output-format json > "$2"`),
    runnerCall(`claude -p "$1" --settings '${JSON.stringify({ sandbox: BOUNDS.sandbox })}' --allowedTools "Edit(./src/**)" "Bash(npm test)" --disallowedTools "Bash(git commit:*),Bash(git push:*)" --permission-mode dontAsk --max-turns 15 --max-budget-usd 2 --output-format json > "$2"`),
  ]) {
    withRepo(boundedRepo({ script }), (dir) => {
      assert.deepEqual(committedHints(dir), [true, true, true, true], script);
    });
  }
});

test('a-7 names what the first item finds wrong with the call', () => {
  for (const [from, to, hint] of [
    ['--permission-mode dontAsk', '--permission-mode bypassPermissions', /Он работает в режиме `bypassPermissions`: используйте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\./],
    ['--permission-mode dontAsk', '--permission-mode dontask', /Пишите `dontAsk` так, как его пишет Claude Code, а не `dontask`\./],
    ['--permission-mode dontAsk', '--permission-mode', /После `--permission-mode` нет режима, поэтому он принимает `--model` как значение: напишите `--permission-mode dontAsk`\./],
    ['--output-format json', '--output-format', /После `--output-format` нет формата: напишите `--output-format json`\./],
    ['  --permission-mode dontAsk \\\n', '', /Режим разрешений не задан: добавьте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\./],
    ['--permission-mode dontAsk', '--dangerously-skip-permissions', /Уберите `--dangerously-skip-permissions`: это то же самое, что `--permission-mode bypassPermissions`, а он пропускает ваши проверки разрешений\./],
    ['--permission-mode dontAsk', '--permission-mode dontAsk --allow-dangerously-skip-permissions', /Уберите `--allow-dangerously-skip-permissions`: ограниченный запуск никогда не переключается на `bypassPermissions`\./],
    ['--permission-mode dontAsk', '--permissionMode dontAsk', /Claude Code не знает `--permissionMode`, поэтому останавливается с ошибкой до начала запуска: напишите `--permission-mode`\./],
    ['--output-format json', '--output-format text', /Он просит `--output-format text`: используйте `json`, чтобы по пути результата лежал результат запуска одним JSON-объектом\./],
    ['--output-format json', '--output-format stream-json --verbose', /Он просит `--output-format stream-json`: используйте `json`, чтобы по пути результата лежал результат запуска одним JSON-объектом\./],
    ['  --output-format json > "$2"', '  > "$2"', /Он не просит JSON: добавьте `--output-format json`\./],
  ]) {
    withRepo(boundedRepo({ script: runner([from, to]) }), (dir) => {
      assert.match(String(runnerHint(dir)), hint, to);
    });
  }
});

test('a-7 checks that the task reaches claude -p as its prompt, and the JSON lands where the second argument says', () => {
  for (const [script, hint] of [
    [runner(['claude -p "$1"', 'claude -p $1']), /Задача передаётся без кавычек, поэтому оболочка разбивает её на слова, и Claude получает только первое\. Напишите `"\$1"` в двойных кавычках\./],
    [runner(['claude -p "$1"', 'claude -p "Add the missing tests."']), /Задача из первого аргумента не доходит до `claude -p`\. Передайте её как промпт сразу после `-p`, как в `claude -p "\$1" \.\.\.`\./],
    [runner(['claude -p "$1"', 'claude -p --allowedTools "Edit(./src/**)" "$1"']), /Задача попала в значение `--allowed-tools`, а не в промпт\. Напишите промпт сразу после `-p`, как в `claude -p "\$1" \.\.\.`\./],
    [runner(['--output-format json > "$2"', '--output-format json > .practice/a-7-slice.json']), /Он сохранил JSON, выведенный `claude -p`, в `\.practice\/a-7-slice\.json`, а не по пути из второго аргумента\./],
    [runner(['--output-format json > "$2"', '--output-format json > /dev/null']), /Он не сохранил JSON, выведенный `claude -p`, по пути из второго аргумента\./],
    [runner(['--output-format json > "$2"', '--output-format json | jq .result > "$2"']), /Файл по пути из второго аргумента — не тот JSON, который вывел `claude -p`\./],
  ]) {
    withRepo(boundedRepo({ script }), (dir) => {
      assert.match(String(runnerHint(dir)), hint);
    });
  }
});

test('a-7 wants one claude -p call, and says how a runner that never makes one ended', () => {
  withRepo(boundedRepo({ script: runner(['status=$?\n', `status=$?\n${BOUNDED_CALL.replace('> "$2"', '> /dev/null')}\n`]) }), (dir) => {
    assert.match(String(runnerHint(dir)), /При одной задаче он запустил `claude -p` 2 раз\./);
  });
  withRepo(boundedRepo({ script: runner(['claude -p "$1"', 'claude "$1"']) }), (dir) => {
    assert.match(String(runnerHint(dir)), /При запуске как `scripts\/bounded-run\.sh "<task>" <result\.json>` `scripts\/bounded-run\.sh` запустил `claude` без `-p` \(или `--print`\), а это открывает интерактивную сессию, которая ждёт вас\./);
  });
  withRepo(boundedRepo({ script: runner(['set -u\n', 'set -u\nclaude --version > /dev/null || exit 1\n']) }), (dir) => {
    assert.equal(runnerHint(dir), true);
  });
  // A runner with another interface: the stand-in sees no call, so the
  // other items read the call from the script's text.
  withRepo(boundedRepo({ script: runner(['if [ $# -ne 2 ]', 'if [ $# -ne 3 ]']) }), (dir) => {
    assert.match(String(runnerHint(dir)), /При запуске как `scripts\/bounded-run\.sh "<task>" <result\.json>` `scripts\/bounded-run\.sh` ни разу не запустил `claude -p`\. Он завершился с кодом 2: Usage: scripts\/bounded-run\.sh "<task>" <result\.json> Пусть скрипт берёт задачу из первого аргумента, а путь результата — из второго\./);
    assert.deepEqual(committedHints(dir).slice(1), [true, true, true]);
  });
  withRepo(boundedRepo({ script: runner(['if [ $# -ne 2 ]', 'if [ $# -ne 3 ]'], ['--max-turns 15', '--max-turns "$TURNS"'], ['--max-budget-usd 2', '--max-budget-usd 0']) }), (dir) => {
    assert.match(String(limitHint(dir)), /`--max-budget-usd 0` не больше 0: напишите сумму в долларах США больше стоимости одного среза задачи\./);
  });
  withRepo(boundedRepo({ script: '#!/bin/bash\necho "Not written yet." >&2\nexit 1\n' }), (dir) => {
    const hints = committedHints(dir);
    assert.match(String(hints[0]), /При запуске как `scripts\/bounded-run\.sh "<task>" <result\.json>` `scripts\/bounded-run\.sh` ни разу не запустил `claude -p`\. Он завершился с кодом 1: Not written yet\./);
    for (const hint of hints.slice(1)) assert.match(String(hint), /При запуске как `scripts\/bounded-run\.sh "<task>" <result\.json>` `scripts\/bounded-run\.sh` ни разу не запустил `claude -p`, и проверка не нашла вызова `claude -p` в его тексте\. Он завершился с кодом 1: Not written yet\./);
  });
});

test('a-7 refuses to run a runner that could reach the real Claude Code, and reads its call from the text', () => {
  const outside = mkdtempSync(join(tmpdir(), 'a7-ran-'));
  const ran = join(outside, 'ran');
  try {
    for (const [script, why] of [
      [runner(['claude -p "$1"', '~/.local/bin/claude -p "$1"']), /вызывает Claude Code по пути `~\/\.local\/bin\/claude`/],
      [runner(['claude -p "$1"', 'npx @anthropic-ai/claude-code -p "$1"']), /запускает Claude Code через `npx`/],
      [runner(['set -u\n', 'set -u\nPATH="$HOME/.local/bin:$PATH"\n']), /меняет `PATH`/],
    ]) {
      withRepo(boundedRepo({ script: script.replace('set -u\n', () => `set -u\ntouch "${ran}"\n`) }), (dir) => {
        const [first, ...rest] = committedHints(dir);
        assert.match(String(first), why);
        assert.match(String(first), /замена этого не перехватит, поэтому проверка его не запускала\./);
        assert.equal(existsSync(ran), false, `the check ran ${script}`);
        if (!/npx/.test(script)) assert.deepEqual(rest, [true, true, true]);
      });
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
  withRepo(boundedRepo({ script: BOUNDED.replace(/\n/g, '\r\n') }), (dir) => {
    assert.match(String(runnerHint(dir)), /В закоммиченном `scripts\/bounded-run\.sh` окончания строк Windows \(CRLF\), и bash не может его выполнить\./);
    assert.equal(limitHint(dir), true);
  });
});

test('a-7 says what is wrong with the settings file the call names', () => {
  withRepo(boundedRepo({ script: runner([`  --settings ${BOUNDS_PATH} \\\n`, '']) }), (dir) => {
    assert.match(String(runnerHint(dir)), /Файл настроек не передан: добавьте `--settings` с закоммиченным файлом, в котором лежат ограничения, например `--settings \.claude\/bounded-run\.json`\./);
    assert.match(String(sandboxHint(dir)), /Запуск не получает файл настроек, поэтому ничто не включает песочницу \(sandbox\): передайте файл с ограничениями через `--settings` и положите в него `"sandbox": \{"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false, "autoAllowBashIfSandboxed": false\}`\./);
  });
  withRepo(boundedRepo({ commitBounds: false }), (dir) => {
    const hint = String(runnerHint(dir));
    assert.match(hint, /`\.claude\/bounded-run\.json` не закоммичен\. Выполните `git add \.claude\/bounded-run\.json` и закоммитьте\. Запуск читает ограничения из этого файла\./);
    assert.equal(ruleHint(dir), hint.match(/`\.claude\/bounded-run\.json` не закоммичен\.[^]*этого файла\./)[0]);
  });
  // An ignore rule for .claude/, such as a global one, needs git add -f.
  withRepo(boundedRepo({ settings: null, gitignore: '.practice/\n.claude/\n', commitBounds: false }), (dir) => {
    assert.match(String(runnerHint(dir)), /не закоммичен, а строка 2 в `\.gitignore`, `\.claude\/`, его игнорирует\. Выполните `git add -f \.claude\/bounded-run\.json` и закоммитьте\./);
  });
  withRepo(boundedRepo({ bounds: null }), (dir) => {
    assert.match(String(runnerHint(dir)), /`--settings` указывает на `\.claude\/bounded-run\.json`, которого нет\. Сохраните ограничения туда, как показано в уроке, и закоммитьте файл\./);
  });
  withRepo(boundedRepo({ bounds: '{ "permissions": { "allow": [ } }\n' }), (dir) => {
    assert.match(String(sandboxHint(dir)), /Закоммиченный `\.claude\/bounded-run\.json` — невалидный JSON: /);
  });
  withRepo(boundedRepo({ script: runner([`--settings ${BOUNDS_PATH}`, '--settings ~/bounded-run.json']) }), (dir) => {
    assert.match(String(runnerHint(dir)), /`--settings` указывает на `[^`]*\/bounded-run\.json`, вне вашего репозитория\. Передайте файл, закоммиченный в нём/);
  });
  withRepo(boundedRepo({ script: runner([`--settings ${BOUNDS_PATH}`, '--settings \'{"sandbox": {"enabled": true,}}\'']) }), (dir) => {
    assert.match(String(runnerHint(dir)), /Встроенный JSON в `--settings` невалиден: /);
  });
});

test('a-7 names a byte-order mark at the start of the bounds file or the project settings', () => {
  withRepo(boundedRepo({ bounds: `\uFEFF${json(BOUNDS)}` }), (dir) => {
    assert.equal(sandboxHint(dir), 'Закоммиченный `.claude/bounded-run.json` — невалидный JSON: он начинается с метки порядка байтов UTF-8. Сохраните его как UTF-8 без неё и закоммитьте.');
  });
  withRepo(boundedRepo({ settings: `\uFEFF${json(PROJECT_SETTINGS)}` }), (dir) => {
    assert.equal(ruleHint(dir), 'Закоммиченный `.claude/settings.json` — невалидный JSON: он начинается с метки порядка байтов UTF-8. Сохраните его как UTF-8 без неё и закоммитьте.');
  });
});

test('a-7 names each turn and spend limit that is missing or not a usable number', () => {
  for (const [from, to, hint] of [
    ['  --max-turns 15 \\\n', '', /Лимит ходов не задан: добавьте `--max-turns` с целым числом от 1\./],
    ['  --max-budget-usd 2 \\\n', '', /Лимит расходов не задан: добавьте `--max-budget-usd` с суммой в долларах США больше стоимости одного среза задачи\./],
    ['--max-turns 15', '--max-turns 0', /`--max-turns 0` меньше 1: напишите целое число от 1\./],
    ['--max-turns 15', '--max-turns abc', /`--max-turns abc` — не целое число: напишите целое число от 1\./],
    ['--max-turns 15', '--max-turns 7.5', /`--max-turns 7\.5` — не целое число: напишите целое число от 1\./],
    ['--max-turns 15', '--max-turns "$TURNS"', /После `--max-turns` нет числа: напишите целое число от 1\./],
    ['--max-turns 15', '--max-turns', /После `--max-turns` нет числа, поэтому он принимает `--max-budget-usd` как значение: напишите целое число от 1\./],
    ['--max-turns 15', '--max_turns 15', /Claude Code не знает `--max_turns`, поэтому останавливается с ошибкой до начала запуска: напишите `--max-turns`\./],
    ['--max-budget-usd 2', '--max-budget-usd 0', /`--max-budget-usd 0` не больше 0: напишите сумму в долларах США больше стоимости одного среза задачи\./],
    ['--max-budget-usd 2', '--max-budget-usd -1', /`--max-budget-usd -1` — не сумма: напишите число долларов США без знака `\$`\./],
    ['--max-budget-usd 2', '--max-budget-usd abc', /`--max-budget-usd abc` — не сумма: напишите число долларов США без знака `\$`\./],
    ['--max-budget-usd 2', '--max-budget-usd \'$2\'', /`--max-budget-usd \$2` — не сумма: напишите число долларов США без знака `\$`\./],
  ]) {
    withRepo(boundedRepo({ script: runner(['set -u\n', ''], [from, to]) }), (dir) => {
      assert.match(String(limitHint(dir)), hint, to);
    });
  }
  // A flag commented out inside the continued command ends the command
  // there, so neither it nor the flags after it reach claude.
  withRepo(boundedRepo({ script: runner(['  --max-turns 15 \\', '  # --max-turns 15 \\']) }), (dir) => {
    const hint = String(limitHint(dir));
    assert.match(hint, /Лимит ходов не задан/);
    assert.match(hint, /Лимит расходов не задан/);
  });
});

test('a-7 tells a rule for one folder or one command from a wider one', () => {
  for (const rule of ['Edit(./src/**)', 'Edit(src/**)', 'Edit(/test/**)', 'Edit(docs/guide.md)', 'Read(./docs/**)', 'Bash(npm test)', 'Bash(npm test *)', 'Bash(npm run lint:*)', 'WebFetch(domain:example.com)', 'mcp__github__get_issue', 'Agent(Explore)', 'Workflow(todo-check)']) {
    assert.equal(wideReason(rule), null, rule);
  }
  for (const [rule, why] of [
    ['Bash', 'пропускает любую команду'],
    ['Bash(*)', 'пропускает любую команду'],
    ['Bash(npm *)', 'пропускает любую команду `npm` с любыми аргументами'],
    ['Bash(npm:*)', 'пропускает любую команду `npm` с любыми аргументами'],
    ['Bash(npm*)', 'пропускает любую команду `npm` с любыми аргументами'],
    ['Bash(* --version)', 'начинается с подстановочного знака, поэтому подходит к командам любой программы'],
    ['Edit', 'позволяет запуску изменять любой файл'],
    ['Write', 'позволяет запуску изменять любой файл'],
    ['Read', 'позволяет запуску читать любой файл'],
    ['Edit(**)', 'позволяет запуску изменять любой файл'],
    ['Edit(./**)', 'позволяет запуску изменять файлы в любой папке проекта'],
    ['Edit(/**)', 'позволяет запуску изменять файлы в любой папке проекта'],
    ['Edit(**/*.ts)', 'позволяет запуску изменять файлы в любой папке проекта'],
    ['Edit(../**)', 'позволяет запуску изменять файлы вне проекта'],
    ['Edit(//**)', 'позволяет запуску изменять файлы в любом месте диска'],
    ['Edit(~/**)', 'позволяет запуску изменять файлы в любом месте вашей домашней папки'],
    ['WebFetch', 'пропускает любое использование `WebFetch`'],
    ['WebFetch(domain:*)', 'позволяет запуску обращаться к любому домену'],
    ['Workflow', 'пропускает любое использование `Workflow`'],
    ['mcp__github', 'пропускает все инструменты этого MCP-сервера'],
    ['mcp__github__*', 'подходит ко всем инструментам, чьё имя ему соответствует'],
  ]) {
    assert.equal(wideReason(rule), why, rule);
  }
});

test('a-7 counts a deny rule as stopping a git command only when it matches every form of it', () => {
  for (const rule of ['Bash(git push *)', 'Bash(git push:*)', 'Bash(git push*)', 'Bash(git *)', 'Bash(git:*)', 'Bash', 'Bash(*)', '*']) {
    assert.equal(stops(rule, 'git push'), true, rule);
  }
  for (const rule of ['Bash(git push)', 'Bash(git push origin *)', 'Bash(git * push *)', 'Bash(git pull *)', 'Bash(git commit *)', 'Read(./.git/**)', 'Bash(gitpush *)']) {
    assert.equal(stops(rule, 'git push'), false, rule);
  }
});

test('a-7 names allow rules wider than one folder or one command, wherever the run reads them', () => {
  withRepo(boundedRepo({ bounds: boundsWith((b) => b.permissions.allow.push('Bash(npm *)', 'Edit(**)')) }), (dir) => {
    assert.equal(ruleHint(dir), '`Bash(npm *)` (`.claude/bounded-run.json`) пропускает любую команду `npm` с любыми аргументами. `Edit(**)` (`.claude/bounded-run.json`) позволяет запуску изменять любой файл. Разрешайте одной папке или одной команде по правилу, как в `Edit(./src/**)` или `Bash(npm test *)`.');
  });
  withRepo(boundedRepo({ script: runner(['--permission-mode dontAsk', '--permission-mode dontAsk --allowedTools "Read,Edit(./src/**)"']) }), (dir) => {
    assert.match(String(ruleHint(dir)), /`Read` \(`--allowedTools`\) позволяет запуску читать любой файл\./);
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => b.permissions.allow.push('Bash(git push *)')) }), (dir) => {
    assert.match(String(ruleHint(dir)), /`Bash\(git push \*\)` \(`\.claude\/bounded-run\.json`\) позволяет запуску использовать `git push`\./);
  });
  // A trusted folder adds the project's allow rules to the run's.
  withRepo(boundedRepo({ settings: { ...PROJECT_SETTINGS, permissions: { allow: ['Bash(npm *)'] } } }), (dir) => {
    assert.match(String(ruleHint(dir)), /`Bash\(npm \*\)` \(`\.claude\/settings\.json`\) пропускает любую команду `npm` с любыми аргументами\./);
  });
  // Unless the run leaves the project's settings files out.
  withRepo(boundedRepo({ script: runner(['--setting-sources project', '--setting-sources user']), settings: { permissions: { allow: ['Bash(npm *)'] } } }), (dir) => {
    assert.equal(ruleHint(dir), true);
  });
  withRepo(boundedRepo({ settings: '{ "permissions": \n' }), (dir) => {
    assert.match(String(ruleHint(dir)), /Закоммиченный `\.claude\/settings\.json` — невалидный JSON: Unexpected end of JSON input/);
  });
});

test('a-7 fails bounds that allow nothing of their own', () => {
  const hint = /Ничто из выданного запуску не разрешает ни одного вызова, поэтому в режиме `dontAsk` он не сможет изменить файл или запустить ваши тесты, а запуск `-p` в папке, которой вы не доверяли, не читает правила allow из `\.claude\/settings\.json`\./;
  withRepo(boundedRepo({ bounds: boundsWith((b) => delete b.permissions.allow) }), (dir) => {
    assert.match(String(ruleHint(dir)), hint);
  });
});

test('a-7 wants deny rules that stop git commit and git push with any arguments, from the file, the flags or the project', () => {
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = ['Bash(git commit:*)', 'Bash(git push:*)']; }) }), (dir) => {
    assert.equal(ruleHint(dir), true);
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = ['Bash(git commit *)', 'Bash(git push)']; }) }), (dir) => {
    assert.equal(ruleHint(dir), '`Bash(git push)` (`.claude/bounded-run.json`) подходит только к голой `git push`, но не к `git push origin main`. Напишите `Bash(git push *)`: завершающий ` *` подходит и к голой команде.');
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = ['Read(./.env)']; }) }), (dir) => {
    assert.equal(ruleHint(dir), 'Ни одно правило deny не останавливает `git commit`: добавьте `"Bash(git commit *)"` в `permissions.deny` файла настроек. Ни одно правило deny не останавливает `git push`: добавьте `"Bash(git push *)"` в `permissions.deny` файла настроек.');
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = []; }), script: runner(['--permission-mode dontAsk', '--permission-mode dontAsk --disallowedTools "Bash(git commit *)" "Bash(git push *)"']) }), (dir) => {
    assert.equal(ruleHint(dir), true);
  });
  // Deny rules in .claude/settings.json hold whether or not the folder is trusted.
  const projectDeny = { ...PROJECT_SETTINGS, permissions: { ...PROJECT_SETTINGS.permissions, deny: ['Bash(git commit *)', 'Bash(git push *)'] } };
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = []; }), settings: projectDeny }), (dir) => {
    assert.equal(ruleHint(dir), true);
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = []; }), settings: projectDeny, script: runner(['--setting-sources project', '--setting-sources user']) }), (dir) => {
    assert.match(String(ruleHint(dir)), /Ни одно правило deny не останавливает `git commit`: добавьте `"Bash\(git commit \*\)"` в `permissions\.deny` файла настроек\./);
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.permissions.deny = ['Bash(git commit *)']; }), after: (dir) => write(dir, { [BOUNDS_PATH]: json(BOUNDS) }) }), (dir) => {
    assert.match(String(ruleHint(dir)), /Ни одно правило deny не останавливает `git push`: добавьте `"Bash\(git push \*\)"` в `permissions\.deny` файла настроек\. В вашей копии `\.claude\/bounded-run\.json` есть незакоммиченные изменения: если они это исправляют, закоммитьте их\./);
  });
});

test('a-7 names each sandbox setting the bounds file leaves out', () => {
  for (const [key, hint] of [
    ['enabled', /Задайте `"enabled": true` в `sandbox`: песочница выключена, пока файл настроек её не включит\./],
    ['failIfUnavailable', /Задайте `"failIfUnavailable": true`: без него запуск, у которого песочница не стартовала, выполняет команды без песочницы\./],
    ['allowUnsandboxedCommands', /Задайте `"allowUnsandboxedCommands": false`: без него Claude может повторить заблокированную песочницей команду вне песочницы\./],
    ['autoAllowBashIfSandboxed', /Задайте `"autoAllowBashIfSandboxed": false`: без него команды в песочнице выполняются, не спрашивая ваши правила allow и режим разрешений, и остановить их могут только правила deny\./],
  ]) {
    withRepo(boundedRepo({ bounds: boundsWith((b) => delete b.sandbox[key]) }), (dir) => {
      const result = String(sandboxHint(dir));
      assert.match(result, /^`\.claude\/bounded-run\.json`: /);
      assert.match(result, hint, key);
      assert.equal(result.match(/Задайте `/g).length, 1, result);
    });
  }
  withRepo(boundedRepo({ bounds: boundsWith((b) => { b.sandbox.enabled = 'true'; b.sandbox.autoAllowBashIfSandboxed = true; }) }), (dir) => {
    assert.match(String(sandboxHint(dir)), /Задайте `"enabled": true`.*Задайте `"autoAllowBashIfSandboxed": false`/);
  });
  withRepo(boundedRepo({ bounds: boundsWith((b) => delete b.sandbox) }), (dir) => {
    assert.equal(sandboxHint(dir), '`.claude/bounded-run.json`: нет настроек `sandbox`. Добавьте `"sandbox": {"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false, "autoAllowBashIfSandboxed": false}`.');
  });
  // The sandbox in .claude/settings.json isn't the run's bounds file.
  withRepo(boundedRepo({ bounds: boundsWith((b) => delete b.sandbox), settings: { ...PROJECT_SETTINGS, sandbox: BOUNDS.sandbox } }), (dir) => {
    assert.match(String(sandboxHint(dir)), /нет настроек `sandbox`/);
  });
});

test('a-7 reads the saved slice, and says what is wrong with it', () => {
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
  const stream = [{ type: 'system', subtype: 'init', session_id: SESSION, permissionMode: 'dontAsk' }, { type: 'assistant', session_id: SESSION, message: { content: [] } }, SLICE_RUN].map((m) => JSON.stringify(m)).join('\n');
  for (const slice of [`﻿${JSON.stringify(SLICE_RUN)}`, utf16(JSON.stringify(SLICE_RUN, null, 2)), `${stream}\n`, { ...SLICE_RUN, total_cost_usd: 1.99 }]) {
    withRepo(boundedRepo({ slice }), (dir) => {
      assert.equal(sliceHint(dir), true);
    });
  }
  for (const [slice, hint] of [
    [null, /Файла `\.practice\/a-7-slice\.json` ещё нет: запустите свой скрипт на срезе задачи, как в разделе «Разбор на примере» урока: `scripts\/bounded-run\.sh "<небольшая часть задачи>" \.practice\/a-7-slice\.json`\./],
    ['Added a test for total(). npm test passes.\n', /`\.practice\/a-7-slice\.json` — не JSON\. Сохраняйте туда только то, что `claude -p --output-format json` печатает в стандартный вывод\./],
    [`${stream.split('\n').slice(0, 2).join('\n')}\n`, /В `\.practice\/a-7-slice\.json` нет результата: запуск не завершился\./],
    [{ ...SLICE_RUN, type: 'assistant' }, /`\.practice\/a-7-slice\.json` — не результат запуска `claude -p` с `--output-format json`\./],
    [{ ...SLICE_RUN, session_id: STUB_SESSION }, /лежит подставной ответ проверки, а не настоящий запуск/],
    [{ ...SLICE_RUN, subtype: 'error_max_budget_usd', is_error: true }, /Срез остановился на вашем лимите расходов \(`error_max_budget_usd`\), значит, лимит ниже стоимости одного среза\. Поднимите `--max-budget-usd` в `scripts\/bounded-run\.sh` и закоммитьте\./],
    [{ ...SLICE_RUN, subtype: 'error_max_turns', is_error: true }, /Срез остановился на вашем лимите ходов \(`error_max_turns`\), не закончив\. Поднимите `--max-turns` в `scripts\/bounded-run\.sh` или дайте срез поменьше\./],
    [{ ...SLICE_RUN, subtype: 'error_during_execution', is_error: true }, /Срез завершился с `error_during_execution`, а не `success`, поэтому не показывает стоимость целого среза\./],
    [{ ...SLICE_RUN, is_error: true, result: 'Not logged in · Please run /login' }, /Запуск среза завершился сбоем: «Not logged in · Please run \/login»\. Исправьте то, о чём там сказано\./],
    [{ ...SLICE_RUN, total_cost_usd: undefined }, /В запуске в `\.practice\/a-7-slice\.json` нет оценки стоимости в `total_cost_usd`, а срез нужен именно для неё\./],
    [{ ...SLICE_RUN, num_turns: undefined }, /В запуске в `\.practice\/a-7-slice\.json` нет числа ходов в `num_turns`, значит, это не тот JSON, который сохраняет `claude -p`\./],
    [{ ...SLICE_RUN, total_cost_usd: 2.37 }, /Срез стоил примерно \$2\.37 \(`total_cost_usd`\), а ваш лимит расходов `--max-budget-usd 2` не выше\. Поставьте лимит выше стоимости среза, пересчитанной на всю задачу, и закоммитьте `scripts\/bounded-run\.sh`\./],
    [{ ...SLICE_RUN, total_cost_usd: 2 }, /не выше/],
  ]) {
    withRepo(boundedRepo({ slice }), (dir) => {
      assert.match(String(sliceHint(dir)), hint, JSON.stringify(slice));
    });
  }
  withRepo(boundedRepo({ script: runner(['  --max-budget-usd 2 \\\n', '']) }), (dir) => {
    assert.equal(sliceHint(dir), 'Проверка не может прочитать лимит расходов из `scripts/bounded-run.sh` (см. второй пункт), поэтому не может сравнить с ним стоимость среза.');
  });
});

test('a-7 reads the saved capped run, and wants it stopped by a limit', () => {
  const stream = [{ type: 'system', subtype: 'init', session_id: SESSION }, { ...CAPPED_RUN, subtype: 'error_max_turns', total_cost_usd: 0.01 }].map((m) => JSON.stringify(m)).join('\n');
  for (const capped of [CAPPED_RUN, { ...CAPPED_RUN, subtype: 'error_max_turns' }, `${stream}\n`]) {
    withRepo(boundedRepo({ capped }), (dir) => {
      assert.equal(cappedHint(dir), true);
    });
  }
  for (const [capped, hint] of [
    [null, /Файла `\.practice\/a-7-capped\.json` ещё нет: выполните шаг урока, где запуску даётся слишком маленький для завершения лимит; он сохранит туда JSON\./],
    ['Error: Reached max turns (1)\n', /`\.practice\/a-7-capped\.json` — не JSON\./],
    [{ ...CAPPED_RUN, session_id: STUB_SESSION }, /лежит подставной ответ проверки, а не настоящий запуск/],
    [{ ...CAPPED_RUN, subtype: 'success', is_error: false }, /Запуск в `\.practice\/a-7-capped\.json` завершился \(`success`\), значит, никакой лимит его не остановил\. Дайте ему слишком маленький для задачи лимит, например `--max-budget-usd 0\.01`, как в шаге 4 урока\./],
    [{ ...CAPPED_RUN, subtype: 'error_during_execution' }, /Запуск в `\.practice\/a-7-capped\.json` завершился с `error_during_execution`, а не на лимите \(`error_max_turns` или `error_max_budget_usd`\)\./],
  ]) {
    withRepo(boundedRepo({ capped }), (dir) => {
      assert.match(String(cappedHint(dir)), hint, JSON.stringify(capped));
    });
  }
});

test('the script reader finds each claude call as the shell would pass it', () => {
  const text = [
    '#!/bin/bash',
    '# claude -p "a comment, not a call"',
    'turns=15',
    'export FLAGS="--output-format json --model sonnet"',
    'if [ $# -ne 2 ]; then echo "usage: claude -p <task>" >&2; exit 2; fi',
    'claude -p "$1" \\',
    '  --settings .claude/bounded-run.json \\',
    '  --max-turns "$turns" --max-budget-usd ${BUDGET:-2} $FLAGS 2>&1 > "$2"',
    'version=$(claude --version)',
    'printf "%s" "$1" | ~/.local/bin/claude -p --allowedTools \'Bash(npm test *)\' "Edit(./src/**)"',
    'cat <<EOF',
    'claude -p "inside a here-document"',
    'EOF',
    'claude -p "$1" \\',
    '  # --max-turns 5',
    '  --output-format json',
    '',
  ].join('\n');
  assert.deepEqual(scriptCalls(text), [
    ['-p', '$1', '--settings', '.claude/bounded-run.json', '--max-turns', '15', '--max-budget-usd', '2', '--output-format', 'json', '--model', 'sonnet'],
    ['--version'],
    ['-p', '--allowedTools', 'Bash(npm test *)', 'Edit(./src/**)'],
    ['-p', '$1'],
  ]);
  assert.deepEqual(scriptCalls('claude -p "$(cat prompt.txt)" --max-turns=$N\r\n'), [['-p', '$(cat prompt.txt)', '--max-turns=$N']]);
});

test('the stand-in records the folder each call ran in, and maps a path argument into the scratch repository', () => {
  const script = '#!/usr/bin/env bash\nclaude -p a --settings .claude/x.json\ncd src && claude -p b --settings ../.claude/x.json --add-dir "$PWD/.."\nclaude -p c --settings /etc/hosts\n';
  withRepo(boundedRepo({ script }), (dir) => {
    const run = runStubbed(openRepo(dir), RUNNER, { commit: { 'src/a.js': '' } });
    assert.deepEqual(run.calls.map((c) => c.cwd), ['', 'src', 'src']);
    assert.deepEqual(run.calls.map((c) => scratchPath(run, c, c.argv[3])), ['.claude/x.json', '.claude/x.json', null]);
    assert.equal(scratchPath(run, run.calls[1], run.calls[1].argv[5]), '');
  });
});

test('a-7 fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(boundedRepo({ script: null, bounds: null, slice: null, capped: null }), (dir) => {
    const { code, out } = check(['a-7', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  withRepo(boundedRepo(), (dir) => {
    const { code, out } = check(['a-7', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

// The Advanced capstone, in a new copy of the template: the worktrees
// ignored; two sessions at once, one adding the review script and one the
// team marketplace with the settings that register it, listed while both
// worktrees existed, merged and removed; the per-file review workflow saved;
// the review workflow on pull_request committed and, with `teardown`,
// deleted; and one run of the script saved. The options change a step:
// `gitignore` is committed first, with `files`; `script`, `settings`,
// `workflow` and `ci` (null for none) replace what is committed; `merge` is
// 'no-ff', 'squash' or 'one'; `listing` and `run` (null for none) are what
// is saved; `after` changes the repository last. The check runs the script
// with a stand-in for `claude` and never runs gh.
const CAPSTONE_START = {
  'README.md': '# linkcheck\n',
  'package.json': json({ name: 'linkcheck', private: true, type: 'module', scripts: { test: 'node -e "process.exit(0)"' } }),
  'src/total.js': TOTAL,
};
const KIT_FILES = {
  [`${MARKETPLACE_ROOT}/.claude-plugin/marketplace.json`]: json(TEAM_MARKET),
  [`${TEAM_KIT}/.claude-plugin/plugin.json`]: json({ name: 'team-kit', version: '0.1.0', description: 'A team\'s shared setup', author: { name: 'Your team' } }),
  [`${TEAM_KIT}/skills/onboard/SKILL.md`]: '---\nname: onboard\ndescription: Explains the shared setup to a new teammate.\n---\n\nExplain it.\n',
};
const TEAM_SETTINGS = {
  permissions: { deny: ['Read(.env)'] },
  extraKnownMarketplaces: { 'team-tools': { source: { source: 'directory', path: './team-marketplace' } } },
  enabledPlugins: { 'team-kit@team-tools': true },
};
const FILE_REVIEW_PATH = '.claude/workflows/file-review.js';
const FILE_REVIEW = [
  'export const meta = {',
  "  name: 'file-review',",
  "  description: 'Review each file under src/ and have a second agent verify each finding',",
  '}',
  '',
  "const listed = await agent('List every file under src/, one path from the repository root each.', {",
  "  schema: { type: 'object', required: ['paths'], properties: { paths: { type: 'array', items: { type: 'string' } } } },",
  '})',
  'const found = await pipeline(listed.paths, (path) => agent(`Review ${path} for bugs. Report each finding as path:line and one sentence.`))',
  'const verified = await pipeline(found, (finding) => agent(`Check this finding against the code and say whether it holds: ${finding}`))',
  "return verified.join('\\n')",
  '',
].join('\n');
const CLAUDE_REVIEW = [
  'name: Claude review',
  '',
  'on:',
  '  pull_request:',
  '    types: [opened, synchronize]',
  '',
  'permissions:',
  '  contents: read',
  '  pull-requests: read',
  '',
  'jobs:',
  '  review:',
  '    runs-on: ubuntu-latest',
  '    timeout-minutes: 10',
  '    steps:',
  '      - uses: actions/checkout@v7',
  '        with:',
  '          fetch-depth: 0',
  `      - uses: anthropics/claude-code-action@${PIN} # v1.0.237`,
  '        with:',
  '          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}',
  '          github_token: ${{ github.token }}',
  "          prompt: Review this pull request's changes against origin/main for bugs. List each finding as file:line and one sentence.",
  '          claude_args: --model sonnet --max-turns 5 --allowedTools "Read,Grep,Glob,Bash(git diff *)"',
  '',
].join('\n');
const MADE_UP_KEY = `sk-ant-api03-${'Xy9_'.repeat(8)}`;

// The review workflow with each `[from, to]` replaced.
function reviewWith(...pairs) {
  return pairs.reduce((text, [from, to]) => {
    assert.ok(text.includes(from), `the review workflow has no ${JSON.stringify(from)}`);
    return text.replace(from, () => to);
  }, CLAUDE_REVIEW);
}

function capstoneRepo({
  gitignore = IGNORE, files = {}, script = REVIEW, settings = TEAM_SETTINGS, workflow = FILE_REVIEW, ci = CLAUDE_REVIEW,
  teardown = false, merge = 'no-ff', listing = (text) => text, run = REAL_RUN, after,
} = {}) {
  return () => {
    const dir = repo({ '.gitignore': gitignore, ...CAPSTONE_START, ...files });
    commit(dir, 'Start');
    const sessions = [
      ['review-script', script === null ? {} : { [SCRIPT]: script }],
      ['team-kit', { ...KIT_FILES, ...(settings === null ? {} : { '.claude/settings.json': typeof settings === 'string' ? settings : json(settings) }) }],
    ];
    const at = (name) => join(dir, '.claude', 'worktrees', name);
    for (const [name] of sessions) git(dir, 'worktree', 'add', '-q', '-b', `worktree-${name}`, `.claude/worktrees/${name}`);
    for (const [name, made] of sessions) {
      write(at(name), made);
      if (made[SCRIPT]) chmodSync(join(at(name), SCRIPT), 0o755);
      commit(at(name), `Build ${name}`);
    }
    const saved = listing(`${git(dir, 'worktree', 'list', '--porcelain')}\n`);
    if (saved !== null) write(dir, { [CAPSTONE_LISTING]: saved });
    for (const [name] of merge === 'one' ? sessions.slice(0, 1) : sessions) {
      if (merge === 'squash') {
        git(dir, 'merge', '-q', '--squash', `worktree-${name}`);
        git(dir, 'commit', '-q', '-m', `Squash worktree-${name}`);
      } else {
        git(dir, 'merge', '-q', '--no-ff', '--no-edit', `worktree-${name}`);
      }
    }
    for (const [name] of sessions) git(dir, 'worktree', 'remove', '--force', `.claude/worktrees/${name}`);
    if (workflow !== null) {
      write(dir, { [FILE_REVIEW_PATH]: workflow });
      commit(dir, 'Save the per-file review workflow', [FILE_REVIEW_PATH]);
    }
    if (ci !== null) {
      write(dir, { [REVIEW_WORKFLOW]: ci });
      commit(dir, 'Review each pull request with Claude', [REVIEW_WORKFLOW]);
    }
    if (teardown) {
      git(dir, 'rm', '-q', REVIEW_WORKFLOW);
      commit(dir, 'Tear down the review workflow', []);
    }
    if (run !== null) write(dir, { [CAPSTONE_RUN]: typeof run === 'string' || Buffer.isBuffer(run) ? run : JSON.stringify(run, null, 2) });
    after?.(dir);
    return dir;
  };
}

const aCapstone = (dir) => check(['a-capstone', '--dir', dir]);
// One item on its own, found by its text.
const capstoneHint = (dir, pattern) => {
  const item = capstoneItems.find((i) => pattern.test(i.text));
  assert.ok(item, `no capstone item matches ${pattern}`);
  return item.check(openRepo(dir));
};
const CI_ITEM = /^закоммиченный workflow запускает `anthropics\/claude-code-action` по `pull_request`/;

test('the Advanced capstone passes for everything the brief asks for, committed, with the worktree listing and one run saved', () => {
  withRepo(capstoneRepo(), (dir) => {
    const { code, out } = aCapstone(dir);
    assert.equal(code, 0, out);
    assert.match(out, /a-capstone  Итоговый проект продвинутого уровня\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  PASS  в `\.practice\/a-capstone-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и запускает субагентов через `agent\(\)`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  PASS  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n  PASS  он подаёт проиндексированный дифф через конвейер, сохраняет JSON по пути из аргумента, выводит результат, завершается с ненулевым кодом при сбое запуска и не вызывает Claude, когда ничего не проиндексировано\n  PASS  `\.practice\/a-capstone-run\.json` содержит успешный запуск в пределах вашего лимита\n  PASS  закоммиченный workflow запускает `anthropics\/claude-code-action` по `pull_request`, закреплённый на релизе или SHA коммита, в режиме автоматизации, с учётными данными из секрета и без них в файле, токеном задания только для чтения, `--max-turns` не больше 10, списком `--allowedTools` без неограниченного `Bash` и `timeout-minutes` не больше 30\n  PASS  ни ключ Claude API, ни токен не закоммичены ни в `HEAD`, ни в коммите, который читает пункт про workflow\n  PASS  закоммиченный marketplace команды перечисляет плагин по относительному пути, а имя записи совпадает с `name` в `plugin\.json` плагина\n  PASS  закоммиченный `\.claude\/settings\.json` регистрирует этот marketplace по относительному пути и включает плагин\n  PASS  тесты проходят\n  PASS  не осталось незакоммиченных изменений\n\nПройдено 13 из 13/);
  });
});

test('the Advanced capstone still passes after the teardown deletes the review workflow, since it reads the history', () => {
  withRepo(capstoneRepo({ teardown: true }), (dir) => {
    assert.equal(existsSync(join(dir, REVIEW_WORKFLOW)), false);
    const { code, out } = aCapstone(dir);
    assert.equal(code, 0, out);
  });
});

test('the Advanced capstone reads its own saved files, not the ones the lessons save', () => {
  const lessonPaths = (dir) => {
    renameSync(join(dir, CAPSTONE_LISTING), join(dir, LISTING));
    renameSync(join(dir, CAPSTONE_RUN), join(dir, RESULT));
  };
  withRepo(capstoneRepo({ after: lessonPaths }), (dir) => {
    const { code, out } = aCapstone(dir);
    assert.equal(code, 1, out);
    assert.match(out, /PASS  закоммиченный workflow запускает `anthropics\/claude-code-action` по `pull_request`, закреплённый на релизе или SHA коммита, в режиме автоматизации, с учётными данными из секрета и без них в файле, токеном задания только для чтения, `--max-turns` не больше 10, списком `--allowedTools` без неограниченного `Bash` и `timeout-minutes` не больше 30\n  PASS  ни ключ Claude API, ни токен не закоммичены ни в `HEAD`, ни в коммите, который читает пункт про workflow\n  PASS  закоммиченный marketplace команды перечисляет плагин по относительному пути, а имя записи совпадает с `name` в `plugin\.json` плагина\n  PASS  закоммиченный `\.claude\/settings\.json` регистрирует этот marketplace по относительному пути и включает плагин\n  PASS  тесты проходят\n  PASS  не осталось незакоммиченных изменений\n\nПройдено 11 из 13/);
    assert.match(out, /выполните `git worktree list --porcelain > \.practice\/a-capstone-worktrees\.txt` в основной рабочей папке/);
    assert.match(out, /PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и запускает субагентов через `agent\(\)`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  PASS  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n  PASS  он подаёт проиндексированный дифф через конвейер, сохраняет JSON по пути из аргумента, выводит результат, завершается с ненулевым кодом при сбое запуска и не вызывает Claude, когда ничего не проиндексировано\n  FAIL  `\.practice\/a-capstone-run\.json` содержит успешный запуск в пределах вашего лимита\n        Файла `\.practice\/a-capstone-run\.json` ещё нет: проиндексируйте изменение и выполните `scripts\/review-staged\.sh \.practice\/a-capstone-run\.json`, это сохранит туда JSON\./);
  });
});

test('the Advanced capstone wants both worktree branches merged as they are, as lesson 1 does', () => {
  withRepo(capstoneRepo({ merge: 'one' }), (dir) => {
    assert.match(String(capstoneHint(dir, /a-capstone-worktrees\.txt/)), /`worktree-team-kit` не влита в вашу текущую ветку\. В основной рабочей папке выполните `git merge worktree-team-kit`\./);
  });
  withRepo(capstoneRepo({ merge: 'squash' }), (dir) => {
    assert.match(String(capstoneHint(dir, /a-capstone-worktrees\.txt/)), /Squash-слияние и rebase копируют коммиты/);
  });
  withRepo(capstoneRepo({ listing: (text) => text.split('\n\n')[0] }), (dir) => {
    assert.match(String(capstoneHint(dir, /a-capstone-worktrees\.txt/)), /нет ни одной worktree в `\.claude\/worktrees\/`/);
  });
});

test('the Advanced capstone wants the worktrees ignored in a committed .gitignore, whatever a global excludes file says', () => {
  const globalIgnore = (dir) => {
    write(dir, { '.git/global-ignore': '.claude/\n' });
    git(dir, 'config', 'core.excludesFile', join(dir, '.git', 'global-ignore'));
  };
  withRepo(capstoneRepo({ gitignore: '.practice/\n', after: globalIgnore }), (dir) => {
    assert.match(String(capstoneHint(dir, /игнорирует `\.claude\/worktrees\/`/)), /Ни один закоммиченный `\.gitignore` не игнорирует `\.claude\/worktrees\/`/);
  });
});

test('the Advanced capstone wants a saved workflow that starts subagents, and doesn\'t ask it to read args', () => {
  const noAgent = FILE_REVIEW.replace(/const listed[\s\S]*$/, "return 'nothing to review'\n");
  withRepo(capstoneRepo({ workflow: noAgent }), (dir) => {
    assert.match(String(capstoneHint(dir, /\.claude\/workflows\//)), /`\.claude\/workflows\/file-review\.js` нигде не вызывает `agent\(\)`, поэтому не запускает ни одного субагента\./);
  });
  // Lesson 3's workflow, which also reads args, passes too.
  withRepo(capstoneRepo({ workflow: TODO_CHECK }), (dir) => {
    assert.equal(capstoneHint(dir, /\.claude\/workflows\//), true);
  });
  withRepo(capstoneRepo({ workflow: null }), (dir) => {
    assert.match(String(capstoneHint(dir, /\.claude\/workflows\//)), /В `\.claude\/workflows\/` нет скрипта workflow\./);
  });
});

test('the Advanced capstone holds the review script to lesson 4\'s rules', () => {
  withRepo(capstoneRepo({ script: null }), (dir) => {
    assert.match(String(capstoneHint(dir, /закоммичен и исполняемый/)), /Нет файла `scripts\/review-staged\.sh`/);
  });
  withRepo(capstoneRepo({ script: withFlags(FLAGS.replace('dontAsk', 'acceptEdits')) }), (dir) => {
    assert.match(String(capstoneHint(dir, /^его вызов `claude -p`/)), /Он работает в режиме `acceptEdits`: используйте `--permission-mode dontAsk`, чтобы каждый вызов, требующий разрешения, отклонялся\./);
  });
  withRepo(capstoneRepo({ run: { ...REAL_RUN, subtype: 'error_max_turns', is_error: true } }), (dir) => {
    assert.match(String(capstoneHint(dir, /a-capstone-run\.json/)), /Запуск в `\.practice\/a-capstone-run\.json` остановился раньше времени \(`error_max_turns`\)/);
  });
});

test('the Advanced capstone wants the review workflow on pull_request, and lesson 5\'s manual workflow never stands in for it', () => {
  const lesson5 = { [WORKFLOW]: LINKCHECK_REPORT };
  withRepo(capstoneRepo({ ci: null, files: lesson5 }), (dir) => {
    assert.match(String(capstoneHint(dir, CI_ITEM)), /`\.github\/workflows\/linkcheck-report\.yml` запускает Claude с `prompt`, но стартует по `workflow_dispatch`\. Запускайте его по `on: pull_request`, затем закоммитьте и отправьте \(push\)\./);
  });
  withRepo(capstoneRepo({ ci: null }), (dir) => {
    assert.match(String(capstoneHint(dir, CI_ITEM)), /Напишите `\.github\/workflows\/claude-review\.yml` по описанию в части 5 файла `capstone\/advanced-brief\.md`/);
  });
  // A later manual workflow doesn't shadow the review, and a review that
  // also starts by hand still counts.
  const later = (dir) => {
    write(dir, lesson5);
    commit(dir, 'Add the link check report', [WORKFLOW]);
  };
  withRepo(capstoneRepo({ after: later }), (dir) => {
    assert.equal(capstoneHint(dir, CI_ITEM), true);
    assert.equal(chosenWorkflow(openRepo(dir), CI.triggers).file.path, REVIEW_WORKFLOW);
  });
  withRepo(capstoneRepo({ ci: reviewWith(['    types: [opened, synchronize]', '    types: [opened, synchronize]\n  workflow_dispatch:']) }), (dir) => {
    assert.equal(capstoneHint(dir, CI_ITEM), true);
  });
});

test('the Advanced capstone reports what is wrong with the review workflow\'s setup and limits together, on the file it read', () => {
  const loose = reviewWith([`@${PIN} # v1.0.237`, '@v1'], ['    timeout-minutes: 10\n', ''], ['          github_token: ${{ github.token }}\n', '']);
  withRepo(capstoneRepo({ ci: loose }), (dir) => {
    const got = String(capstoneHint(dir, CI_ITEM));
    assert.match(got, /^`\.github\/workflows\/claude-review\.yml`: `@v1` в строке 18 может перейти на новый релиз/);
    assert.match(got, /У задания `review` не задан `timeout-minutes`/);
    assert.match(got, /не передаёт `github_token`/);
  });
  // The copy has only the credential's secret: no hint sends the learner to
  // quick setup or relies on the Claude GitHub App.
  const bare = reviewWith(['          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}\n', ''], ['          github_token: ${{ github.token }}\n', '']);
  withRepo(capstoneRepo({ ci: bare }), (dir) => {
    const got = String(capstoneHint(dir, CI_ITEM));
    assert.match(got, /не передаёт учётные данные\. Добавьте `anthropic_api_key: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}` под `with:` или `claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}` для токена подписки, указав секрет, который вы сохранили командой `gh secret set`\./);
    assert.match(got, /не передаёт `github_token`, поэтому action аутентифицируется как приложение Claude GitHub App, которое в итоговом проекте не устанавливается\. Добавьте `github_token: \$\{\{ github\.token \}\}` под `with:`/);
    assert.doesNotMatch(got, /quick setup/);
  });
  withRepo(capstoneRepo({ ci: reviewWith(['${{ secrets.ANTHROPIC_API_KEY }}', '${{ env.CLAUDE_KEY }}']) }), (dir) => {
    assert.match(String(capstoneHint(dir, CI_ITEM)), /`anthropic_api_key` в строке 21 не берётся из секрета\. Напишите `anthropic_api_key: \$\{\{ secrets\.<NAME> \}\}`, указав секрет, который вы сохранили командой `gh secret set`, а сами учётные данные в файле не храните\./);
  });
  for (const [ci, hint] of [
    [reviewWith(['--max-turns 5', '--max-turns 25']), /`--max-turns 25` больше 10/],
    [reviewWith(['"Read,Grep,Glob,Bash(git diff *)"', '"Read,Grep,Glob,Bash"']), /В `--allowedTools` указано `Bash`, что позволяет Claude запускать любую команду/],
    [reviewWith(['  contents: read\n', '  contents: write\n']), /`contents: write` в строке 8 даёт токену задания право записи/],
    [reviewWith(['    types: [opened, synchronize]', '    types: [opened, synchronize]\n  pull_request_target:']), /Уберите `pull_request_target` из `on:`/],
  ]) {
    withRepo(capstoneRepo({ ci }), (dir) => {
      assert.match(String(capstoneHint(dir, CI_ITEM)), hint, ci);
    });
  }
  // After the teardown, the hint names the commit it read.
  withRepo(capstoneRepo({ ci: reviewWith([`@${PIN} # v1.0.237`, '@v1']), teardown: true }), (dir) => {
    const added = git(dir, 'rev-parse', '--short=7', 'HEAD~1');
    assert.match(String(capstoneHint(dir, CI_ITEM)), new RegExp(`^\`\\.github/workflows/claude-review\\.yml\` \\(как в коммите ${added}\\): \`@v1\``));
  });
});

test('the Advanced capstone fails for a Claude key or token committed at HEAD or in the workflow\'s commit, and never prints it', () => {
  const keyHint = (dir) => noCommittedKey.check(openRepo(dir));
  withRepo(capstoneRepo({ files: { 'notes/ci setup.txt': `Remember:\nANTHROPIC_API_KEY=${MADE_UP_KEY}\n` } }), (dir) => {
    const { code, out } = aCapstone(dir);
    assert.equal(code, 1, out);
    assert.match(out, /a-capstone  Итоговый проект продвинутого уровня\n  PASS  закоммиченный `\.gitignore` игнорирует `\.claude\/worktrees\/`, а остальное в `\.claude\/` — нет\n  PASS  в `\.practice\/a-capstone-worktrees\.txt` перечислены две worktrees в `\.claude\/worktrees\/`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку\n  PASS  закоммиченный скрипт в `\.claude\/workflows\/` начинается с литерального `export const meta` с полями `name` и `description` и запускает субагентов через `agent\(\)`\n  PASS  `scripts\/review-staged\.sh` закоммичен и исполняемый\n  PASS  его вызов `claude -p` просит JSON, работает в режиме `dontAsk`, заранее одобряет только `Read`, `Grep` и `Glob`, ограничивает ходы числом не больше 10 и имеет промпт сразу после `-p`\n  PASS  он подаёт проиндексированный дифф через конвейер, сохраняет JSON по пути из аргумента, выводит результат, завершается с ненулевым кодом при сбое запуска и не вызывает Claude, когда ничего не проиндексировано\n  PASS  `\.practice\/a-capstone-run\.json` содержит успешный запуск в пределах вашего лимита\n  PASS  закоммиченный workflow запускает `anthropics\/claude-code-action` по `pull_request`, закреплённый на релизе или SHA коммита, в режиме автоматизации, с учётными данными из секрета и без них в файле, токеном задания только для чтения, `--max-turns` не больше 10, списком `--allowedTools` без неограниченного `Bash` и `timeout-minutes` не больше 30\n  FAIL  ни ключ Claude API, ни токен не закоммичены ни в `HEAD`, ни в коммите, который читает пункт про workflow\n        В `HEAD`: строка 2 файла `notes\/ci setup\.txt` — похоже на ключ или токен Claude API\./);
    assert.doesNotMatch(out, /sk-ant-/, 'the check repeats the key');
  });
  // In the workflow, then torn down: HEAD is clean, the commit the workflow
  // item reads isn't.
  withRepo(capstoneRepo({ ci: reviewWith(['${{ secrets.ANTHROPIC_API_KEY }}', MADE_UP_KEY]), teardown: true }), (dir) => {
    const added = git(dir, 'rev-parse', '--short=7', 'HEAD~1');
    const got = String(keyHint(dir));
    assert.match(got, new RegExp(`^В коммите ${added}, где проверка читает ваш workflow: строка 21 файла \`\\.github/workflows/claude-review\\.yml\` — похоже`));
    assert.doesNotMatch(got, /sk-ant-/);
    assert.doesNotMatch(String(capstoneHint(dir, CI_ITEM)), /sk-ant-/);
  });
  // Several places are counted; the checks' own made-up keys, and text too
  // short to be a key, are not.
  const many = Object.fromEntries([1, 2, 3, 4].map((n) => [`notes/${n}.txt`, `${MADE_UP_KEY}\n`]));
  withRepo(capstoneRepo({ files: many }), (dir) => {
    assert.match(String(keyHint(dir)), /строка 1 файла `notes\/1\.txt`, строка 1 файла `notes\/2\.txt`, строка 1 файла `notes\/3\.txt`, и ещё 1 — похоже/);
  });
  withRepo(capstoneRepo({ files: { 'checks/test/keys.test.mjs': `const key = '${MADE_UP_KEY}';\n`, 'notes/prefix.txt': 'Keys start with sk-ant-api03-.\n' } }), (dir) => {
    assert.equal(keyHint(dir), true);
  });
});

test('the Advanced capstone wants the team marketplace and its registration committed, as lesson 6 does', () => {
  withRepo(capstoneRepo({ settings: null }), (dir) => {
    assert.match(String(capstoneHint(dir, /регистрирует этот marketplace/)), /Нет закоммиченного `\.claude\/settings\.json`/);
  });
  withRepo(capstoneRepo({ settings: { ...TEAM_SETTINGS, extraKnownMarketplaces: { 'team-tools': { source: { source: 'directory', path: '/Users/me/claude-capstone/team-marketplace' } } } } }), (dir) => {
    assert.match(String(capstoneHint(dir, /регистрирует этот marketplace/)), /это путь на вашем компьютере, которого нет в клоне коллеги/);
  });
  withRepo(capstoneRepo({ after: (dir) => { git(dir, 'rm', '-q', '-r', MARKETPLACE_ROOT); commit(dir, 'Drop the marketplace', []); } }), (dir) => {
    assert.match(String(capstoneHint(dir, /marketplace команды перечисляет плагин/)), /Закоммиченного `\.claude-plugin\/marketplace\.json` нет\./);
  });
});

test('the Advanced capstone\'s hints point at the brief\'s parts, not at lesson sections the capstone page doesn\'t have', () => {
  const lessonSections = /Worked example|Your turn|as the lesson/;
  withRepo(capstoneRepo({ script: null }), (dir) => {
    const hint = String(capstoneHint(dir, /закоммичен и исполняемый/));
    assert.equal(hint, 'Нет файла `scripts/review-staged.sh`. Напишите его по описанию в части 2 файла `capstone/advanced-brief.md`, затем закоммитьте.');
  });
  withRepo(capstoneRepo({ settings: null }), (dir) => {
    const hint = String(capstoneHint(dir, /регистрирует этот marketplace/));
    assert.match(hint, /`"enabledPlugins": \{ "team-kit@team-tools": true \}`, как описано в части 3 файла `capstone\/advanced-brief\.md`, и закоммитьте\.$/);
    assert.doesNotMatch(hint, lessonSections);
  });
  withRepo(capstoneRepo({ after: (dir) => { git(dir, 'rm', '-q', '-r', MARKETPLACE_ROOT); commit(dir, 'Drop the marketplace', []); } }), (dir) => {
    assert.equal(capstoneHint(dir, /marketplace команды перечисляет плагин/), 'Закоммиченного `.claude-plugin/marketplace.json` нет. Положите marketplace с одним вашим плагином в `team-marketplace/`, как описано в части 3 файла `capstone/advanced-brief.md`, и закоммитьте его.');
  });
  // Every hint of an empty copy.
  withRepo(() => {
    const dir = repo({ '.gitignore': '.practice/\nnode_modules/\n', ...CAPSTONE_START });
    commit(dir, 'Start');
    return dir;
  }, (dir) => {
    const { out } = aCapstone(dir);
    assert.doesNotMatch(out, lessonSections);
  });
  // The lessons keep their own sections.
  withRepo(reviewRepo({ script: null }), (dir) => {
    assert.match(String(a4(dir).out), /Напишите его по описанию в разделе «Ваша очередь» урока/);
  });
  withRepo(shareRepo({ market: null, files: { [`${MARKETPLACE_ROOT}/.claude-plugin`]: null } }), (dir) => {
    assert.match(String(marketHint(dir)), /Скачайте пример marketplace в `team-marketplace\/`, как показано в разделе «Разбор на примере», и закоммитьте его\.$/);
  });
  withRepo(shareRepo({ settings: null }), (dir) => {
    assert.match(String(settingsHint(dir)), /, как показано в разделе «Разбор на примере», и закоммитьте\.$/);
  });
});

test('the Advanced capstone fails while the tests fail or something is left uncommitted', () => {
  const failing = { 'package.json': json({ name: 'linkcheck', private: true, scripts: { test: 'node -e "process.exit(1)"' } }) };
  withRepo(capstoneRepo({ files: failing }), (dir) => {
    assert.match(String(capstoneHint(dir, /^тесты проходят$/)), /`npm test` завершается ошибкой/);
  });
  withRepo(capstoneRepo({ after: (dir) => write(dir, { 'src/new.js': '// not committed\n' }) }), (dir) => {
    assert.match(String(capstoneHint(dir, /незакоммиченных изменений/)), /Эти изменения не закоммичены: src\/new\.js/);
  });
});

test('the capstone brief names the files the Advanced capstone\'s check reads', () => {
  const brief = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'capstone', 'advanced-brief.md'), 'utf8');
  for (const path of [CAPSTONE_LISTING, CAPSTONE_RUN, SCRIPT, REVIEW_WORKFLOW, 'team-marketplace/', '.claude/workflows/', 'npm run check -- a-capstone']) {
    assert.ok(brief.includes(path), `the brief doesn't name ${path}`);
  }
});

test('the Advanced capstone fails on an unsolved repository and passes on a solved one, as the template\'s assertions expect', () => {
  withRepo(() => {
    const dir = repo({ '.gitignore': '.practice/\nnode_modules/\n', ...CAPSTONE_START });
    commit(dir, 'Start');
    return dir;
  }, (dir) => {
    const { code, out } = check(['a-capstone', '--assert', 'fail', '--dir', dir]);
    assert.equal(code, 0, out);
  });
  withRepo(capstoneRepo({ teardown: true }), (dir) => {
    const { code, out } = check(['a-capstone', '--assert', 'pass', '--dir', dir]);
    assert.equal(code, 0, out);
  });
});

test('the history reads never fetch an object a partial clone lacks', () => {
  const source = actionsRepo({ teardown: true, runs: null })();
  const clone = mkdtempSync(join(tmpdir(), 'partial-'));
  // Whether the clone holds `object`, without fetching it.
  const holds = (object, env = { GIT_NO_LAZY_FETCH: '1' }) => {
    try {
      execFileSync('git', ['cat-file', '-e', object], { cwd: clone, env: { ...process.env, ...env }, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  try {
    git(source, 'config', 'uploadpack.allowFilter', 'true');
    git(source, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    const blob = git(source, 'rev-parse', `HEAD~1:${WORKFLOW}`);
    git(clone, 'clone', '-q', '--filter=blob:none', `file://${source}`, '.');
    // A commit the remote has and the clone doesn't.
    git(source, 'checkout', '-q', '-b', 'later');
    const later = commit(source, 'A commit made after the clone');
    write(clone, { [RUNS]: JSON.stringify([runOf(later)]) });
    assert.equal(holds(blob), false, 'the clone already holds the workflow');
    assert.match(String(setupHint(clone)), /Нет закоммиченного workflow, который запускает `anthropics\/claude-code-action`\./);
    assert.match(String(runsHint(clone)), new RegExp(`шёл на коммите ${later.slice(0, 7)}, которого нет в этом репозитории`));
    assert.equal(holds(blob), false, 'the check fetched the workflow');
    assert.equal(holds(`${later}^{commit}`), false, 'the check fetched the commit');
    // git itself would have fetched both.
    assert.equal(holds(blob, {}), true);
    assert.equal(holds(`${later}^{commit}`, {}), true);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(clone, { recursive: true, force: true });
  }
});

test('the Assert checks workflow says to merge, never squash or rebase, naming the saved files that hold commit SHAs', () => {
  const workflow = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows', 'assert-checks.yml'), 'utf8');
  const line = workflow.split('\n').find((l) => l.startsWith('#') && /never squash or rebase/.test(l));
  assert.ok(line, 'assert-checks.yml has no comment that says never to squash or rebase');
  for (const path of [LISTING, RUNS, CAPSTONE_LISTING]) assert.ok(line.includes(path), `the comment doesn't name ${path}`);
  assert.doesNotMatch(workflow, /\u2014/, 'the workflow has an em dash');
});
