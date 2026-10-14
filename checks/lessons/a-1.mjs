// Parallel sessions with worktrees (Advanced, lesson 1). The Learner ignores
// .claude/worktrees/ in a committed .gitignore, runs two sessions at once,
// each in a worktree that `claude --worktree <name>` makes there, merges both
// branches and removes the worktrees. A worktree listing saved while both
// existed names the commit each session made. That neither session saw the
// other's uncommitted edits shows only in the sessions, so the lesson
// self-checks it. The Advanced capstone reuses these items with its own
// listing.
import { committedIgnore, ignoreHint } from '../ignore.mjs';
import { claudeWorktrees, liveWorktrees, parseWorktrees } from '../worktrees.mjs';

export const title = 'Параллельные сессии с worktrees';

const SNAPSHOT = '.practice/a-1-worktrees.txt';

const save = (snapshot) => `\`git worktree list --porcelain > ${snapshot}\``;
const short = (sha) => sha.slice(0, 7);
const label = (r) => r.branch ?? short(r.head);
const shell = (path) => (/\s/.test(path) ? `"${path}"` : path);

function isCommit(repo, sha) {
  try {
    repo.gitLocal('cat-file', '-e', `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// `git merge-base --is-ancestor`, remembered: it exits 1 for "no".
function ancestry(repo) {
  const known = new Map();
  return (a, b) => {
    const key = `${a} ${b}`;
    if (!known.has(key)) {
      try {
        repo.gitLocal('merge-base', '--is-ancestor', a, b);
        known.set(key, true);
      } catch (error) {
        if (error.status !== 1) throw error;
        known.set(key, false);
      }
    }
    return known.get(key);
  };
}

// What a saved listing shows: the Claude Code worktrees it lists, the two
// whose commits split from each other (a merged pair first, as any two
// pass), and a hint, which is null when both of that pair are merged.
function review(repo, snapshot) {
  const text = repo.read(snapshot);
  if (text === null || !text.trim()) return { worktrees: [], hint: `Пока обе сессии с worktree существуют и после того, как в каждой сделан коммит, выполните ${save(snapshot)} в основной рабочей папке.` };
  const records = parseWorktrees(text);
  if (!records.length) return { worktrees: [], hint: `\`${snapshot}\` не похож на вывод \`git worktree list --porcelain\`. Пока обе worktree существуют, сохраните список заново: ${save(snapshot)}.` };
  const worktrees = claudeWorktrees(records);
  if (worktrees.length < 2) {
    const others = records.slice(1).filter((r) => !r.bare && !worktrees.includes(r));
    const elsewhere = others.length ? ` Там есть также ${others.map((r) => `\`${r.path}\``).join(', ')}, но проверка считает только worktrees, которые создаёт \`claude --worktree <name>\`, в папке \`.claude/worktrees/\`.` : '';
    return { worktrees, hint: `В \`${snapshot}\` ${worktrees.length ? 'одна worktree' : 'нет ни одной worktree'} в \`.claude/worktrees/\`.${elsewhere} Запускайте каждую сессию командой \`claude --worktree <name>\` и сохраните ${save(snapshot)}, пока существуют обе worktree.` };
  }
  const known = worktrees.filter((r) => r.head && isCommit(repo, r.head));
  if (known.length < 2) {
    const missing = worktrees.find((r) => !known.includes(r));
    const what = missing.head ? `коммит ${short(missing.head)}, которого нет в этом репозитории` : `\`${missing.path}\` без коммита`;
    return { worktrees, hint: `В \`${snapshot}\` указан ${what}. Сохраните список из основной рабочей папки этого репозитория, пока его worktrees существуют: ${save(snapshot)}.` };
  }
  const isAncestor = ancestry(repo);
  const pairs = [];
  for (const [i, a] of known.entries()) {
    for (const b of known.slice(i + 1)) {
      if (a.head !== b.head && !isAncestor(a.head, b.head) && !isAncestor(b.head, a.head)) pairs.push([a, b]);
    }
  }
  if (!pairs.length) return { worktrees, hint: `Worktrees в \`${snapshot}\` указывают на один коммит или одна из них — на более ранний коммит другой, значит, список сохранён до того, как обе сессии сделали коммиты. Сохраните его заново после коммита в каждой сессии и до удаления worktrees: ${save(snapshot)}.` };
  const [{ pair, unmerged }] = pairs
    .map((p) => ({ pair: p, unmerged: p.filter((r) => !isAncestor(r.head, 'HEAD')) }))
    .sort((x, y) => x.unmerged.length - y.unmerged.length);
  if (!unmerged.length) return { worktrees, pair, hint: null };
  const names = unmerged.map(label);
  return { worktrees, pair, hint: `${names.map((n) => `\`${n}\``).join(' и ')} ${names.length > 1 ? 'не влиты' : 'не влита'} в вашу текущую ветку. В основной рабочей папке выполните ${names.map((n) => `\`git merge ${n}\``).join(', затем ')}. Squash-слияние и rebase копируют коммиты, поэтому проверка не найдёт их в вашей ветке.` };
}

export const ignoresWorktrees = {
  text: 'закоммиченный `.gitignore` игнорирует `.claude/worktrees/`, а остальное в `.claude/` — нет',
  check(repo) {
    const worktrees = committedIgnore(repo, '.claude/worktrees/a-1-probe/file');
    if (worktrees.problem) return ignoreHint(worktrees, '.claude/worktrees/');
    const settings = committedIgnore(repo, '.claude/settings.json');
    if (settings.problem || settings.source !== worktrees.source) return true;
    return `Строка ${settings.line} файла \`${settings.source}\`, \`${settings.pattern}\`, игнорирует и \`.claude/settings.json\`, а значит, скроет настройки, которые вы делите с командой. Игнорируйте только \`.claude/worktrees/\` и закоммитьте.`;
  },
};

export function mergedWorktrees(snapshot) {
  return {
    text: `в \`${snapshot}\` перечислены две worktrees в \`.claude/worktrees/\`, чьи коммиты разошлись между собой, и обе влиты в вашу ветку`,
    local: true,
    check: (repo) => review(repo, snapshot).hint ?? true,
  };
}

export function removedWorktrees(snapshot) {
  return {
    text: 'ни одной из этих worktrees больше нет',
    local: true,
    check(repo) {
      const text = repo.read(snapshot);
      if (text === null || !text.trim()) return `Нет файла \`${snapshot}\`, поэтому проверка не знает, какие worktrees должны исчезнуть. Сохраните его, как сказано в пункте выше.`;
      const { worktrees, pair } = review(repo, snapshot);
      if (!worktrees.length) return `В \`${snapshot}\` нет ни одной worktree в \`.claude/worktrees/\`, поэтому проверка не знает, какие worktrees должны исчезнуть. Сохраните его, как сказано в пункте выше.`;
      // Paths as git printed them: one that isn't on this machine was saved elsewhere.
      const live = new Map(liveWorktrees(repo).map((r) => [r.path, r]));
      const left = (pair ?? worktrees).map((r) => live.get(r.path)).filter(Boolean);
      if (!left.length) return true;
      return left.map((r) => {
        const path = shell(r.path);
        if (r.locked) return `\`${r.path}\` ещё существует и заблокирована: выполните \`git worktree unlock ${path}\`, затем \`git worktree remove ${path}\`.`;
        if (r.prunable) return `git всё ещё показывает \`${r.path}\`, хотя её папки уже нет: выполните \`git worktree prune\`.`;
        return `\`${r.path}\` ещё существует: когда её ветка влита, выполните \`git worktree remove ${path}\` в основной рабочей папке.`;
      }).join(' ');
    },
  };
}

export const items = [ignoresWorktrees, mergedWorktrees(SNAPSHOT), removedWorktrees(SNAPSHOT)];
