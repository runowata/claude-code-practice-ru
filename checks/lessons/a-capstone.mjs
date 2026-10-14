// The Advanced capstone: add CI review your team can share, as
// capstone/advanced-brief.md asks, in a new copy of the template. It reuses
// the Advanced lessons' items with the capstone's own files: the worktree
// listing and the review script's run, both saved under .practice/; the
// saved workflow, which must start subagents; and the review workflow, which
// runs on pull requests and is read from the history, so the check passes
// before and after the teardown. Running both sessions at once, choosing a
// workflow over subagents, reading the CI review and the cost estimates are
// self-assessed on the capstone page.
import { ignoresWorktrees, mergedWorktrees } from './a-1.mjs';
import { savedWorkflow } from './a-3.mjs';
import { committedScript, savedRun, SCRIPT, scriptBehavior, scriptCall } from './a-4.mjs';
import { boundedWorkflow, chosenWorkflow } from './a-5.mjs';
import { marketplaceItem, settingsItem } from './a-6.mjs';
import { testsPass, nothingUncommitted } from './b-3.mjs';

export const title = 'Итоговый проект продвинутого уровня';

export const SNAPSHOT = '.practice/a-capstone-worktrees.txt';
export const RUN = '.practice/a-capstone-run.json';
export const REVIEW = '.github/workflows/claude-review.yml';
// The brief's review runs on each pull request; a workflow started by hand,
// such as lesson 5's, never stands in for it. The copy has only the
// credential's secret, saved with `gh secret set`, and no Claude GitHub App.
export const CI = {
  triggers: ['pull_request'],
  file: REVIEW,
  guide: 'части 5 файла `capstone/advanced-brief.md`',
  secret: 'секрет, который вы сохранили командой `gh secret set`',
  noToken: 'action аутентифицируется как приложение Claude GitHub App, которое в итоговом проекте не устанавливается',
};
// Where the brief describes the review script and the team's plugin, for the
// hints of the lessons' items, which name the lessons' own sections.
const SCRIPT_GUIDE = 'части 2 файла `capstone/advanced-brief.md`';
const PLUGIN_GUIDE = 'части 3 файла `capstone/advanced-brief.md`';
const PLUGIN = {
  marketplace: `Положите marketplace с одним вашим плагином в \`team-marketplace/\`, как описано в ${PLUGIN_GUIDE}`,
  settings: `как описано в ${PLUGIN_GUIDE}`,
};

// A Claude API key or OAuth token written out, as lesson 5's check spots one
// in a workflow file. checks/ holds the checks' own made-up keys.
const KEY = 'sk-ant-[A-Za-z0-9_-]{20,}';
const OWN = ':(exclude)checks/';

const short = (sha) => sha.slice(0, 7);

// Where `commit` holds a key, each `{ path, line }`, by path. The key itself
// is never kept, so no hint can print it.
function keysAt(repo, commit) {
  let out;
  try {
    out = repo.gitLocal('grep', '--no-color', '-I', '-n', '-z', '-E', KEY, commit, '--', '.', OWN);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
  return out.split('\n').filter(Boolean).map((record) => {
    const [where, line] = record.split('\0');
    return { path: where.slice(commit.length + 1), line: Number(line) };
  });
}

function headCommit(repo) {
  try {
    return repo.git('rev-parse', '--verify', '--quiet', 'HEAD^{commit}');
  } catch {
    return null;
  }
}

export const noCommittedKey = {
  text: 'ни ключ Claude API, ни токен не закоммичены ни в `HEAD`, ни в коммите, который читает пункт про workflow',
  check(repo) {
    const head = headCommit(repo);
    if (!head) return true;
    const read = chosenWorkflow(repo, CI.triggers, CI)?.file.commit;
    for (const commit of [head, read].filter((c, i, all) => c && all.indexOf(c) === i)) {
      const found = keysAt(repo, commit);
      if (!found.length) continue;
      const places = found.slice(0, 3).map((f) => `строка ${f.line} файла \`${f.path}\``);
      const more = found.length > 3 ? `, и ещё ${found.length - 3}` : '';
      const where = commit === head ? 'В `HEAD`' : `В коммите ${short(commit)}, где проверка читает ваш workflow`;
      return `${where}: ${places.join(', ')}${more} — похоже на ключ или токен Claude API. Считайте его утёкшим, ведь удаление из файла не убирает его из истории: удалите ключ API в Claude Console прямо сейчас (для токена от \`claude setup-token\` прочитайте предупреждение на странице итогового проекта) и храните учётные данные только в секрете репозитория.`;
    }
    return true;
  },
};

export const items = [
  ignoresWorktrees,
  mergedWorktrees(SNAPSHOT),
  savedWorkflow({ needArgs: false, needAgentCall: true }),
  committedScript(SCRIPT, SCRIPT_GUIDE),
  scriptCall(SCRIPT),
  scriptBehavior(SCRIPT),
  savedRun(RUN, SCRIPT),
  boundedWorkflow(CI),
  noCommittedKey,
  marketplaceItem(PLUGIN),
  settingsItem(PLUGIN),
  testsPass,
  nothingUncommitted,
];
