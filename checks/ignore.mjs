// Ignore-rule helpers shared by the Advanced checks: whether a committed
// .gitignore ignores a path. The machine's global excludes file is switched
// off, so a rule that lives only on the Learner's machine never counts.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const run = (cwd, args, input) => execFileSync('git', args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

// The rule that decides `probe` in the repository at `cwd`, as
// `{ source, line, pattern, negated }`, or null when no rule matches it.
// --no-index asks about the rules even when the path is tracked.
function rule(cwd, probe) {
  let out;
  try {
    out = run(cwd, ['-c', `core.excludesFile=${devNull}`, 'check-ignore', '--stdin', '-z', '-v', '--no-index'], `${probe}\0`);
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
  const [source, line, pattern] = out.split('\0');
  return source ? { source, line: Number(line), pattern, negated: pattern.startsWith('!') } : null;
}

// A per-directory .gitignore, which git reports relative to the repository's
// root; .git/info/exclude is reported by its path into .git, or in full from
// a linked worktree.
const perDirectory = (source) => /(^|\/)\.gitignore$/.test(source) && !source.startsWith('.git/') && !/^([a-zA-Z]:)?\//.test(source);

function committedClean(repo, source) {
  try {
    repo.git('cat-file', '-e', `HEAD:${source}`);
    repo.git('diff', '--quiet', 'HEAD', '--', source);
    return true;
  } catch {
    return false;
  }
}

// The same question asked of the .gitignore files committed at HEAD alone,
// in a scratch repository that holds only them: a rule in .git/info/exclude
// or an uncommitted edit can't hide or stand in for a committed rule there.
function committedRule(repo, probe) {
  const parts = probe.split('/');
  const files = parts.map((_, i) => [...parts.slice(0, i), '.gitignore'].join('/'));
  let listed;
  try {
    listed = repo.git('ls-tree', '-r', '--name-only', 'HEAD', '--', ...files).split('\n').filter(Boolean);
  } catch {
    return null;
  }
  if (!listed.length) return null;
  const dir = mkdtempSync(join(tmpdir(), 'ignore-'));
  try {
    run(dir, ['init', '-q']);
    // A template directory could seed rules here.
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '');
    for (const path of listed) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), execFileSync('git', ['show', `HEAD:${path}`], { cwd: repo.dir, stdio: ['ignore', 'pipe', 'pipe'] }));
    }
    return rule(dir, probe);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Whether a .gitignore committed at HEAD ignores `probe`, a path relative to
// the repository's root. Returns `{ source, line, pattern }` when it does,
// and otherwise `{ problem }` with what stands in its way: 'none' (no rule),
// 'negated' (a `!` rule keeps the path), 'exclude' (only .git/info/exclude
// ignores it) or 'uncommitted' (a .gitignore rule that isn't committed).
export function committedIgnore(repo, probe) {
  const live = rule(repo.dir, probe);
  if (!live) return { problem: 'none' };
  if (live.negated) return { problem: 'negated', ...live };
  if (perDirectory(live.source) && committedClean(repo, live.source)) return live;
  // .git/info/exclude can shadow a committed rule, such as `.claude/` there
  // over `.claude/worktrees/` in .gitignore, and an unrelated edit to a
  // .gitignore leaves its committed rules in force: ask the committed files.
  const committed = committedRule(repo, probe);
  if (committed && !committed.negated) return committed;
  return { problem: perDirectory(live.source) ? 'uncommitted' : 'exclude', ...live };
}

// What to do when committedIgnore finds no committed rule, given the line
// the Learner should add, such as `.claude/worktrees/`.
export function ignoreHint(result, line) {
  if (result.problem === 'negated') return `Строка ${result.line} в \`${result.source}\`, \`${result.pattern}\`, не даёт игнорировать \`${line}\`. Удалите её, добавьте строку \`${line}\` в \`.gitignore\` и закоммитьте.`;
  if (result.problem === 'exclude') return `\`${line}\` игнорирует только \`.git/info/exclude\`, а git никогда не коммитит этот файл, поэтому у коллег этого правила не будет. Добавьте строку \`${line}\` в \`.gitignore\` и закоммитьте.`;
  if (result.problem === 'uncommitted') return `\`${result.source}\` игнорирует \`${line}\`, но это правило не закоммичено. Выполните \`git add ${result.source}\` и закоммитьте.`;
  return `Ни один закоммиченный \`.gitignore\` не игнорирует \`${line}\`. Добавьте строку \`${line}\` в \`.gitignore\` и закоммитьте. Правило в вашем глобальном файле исключений git не считается: его нет в репозитории.`;
}
