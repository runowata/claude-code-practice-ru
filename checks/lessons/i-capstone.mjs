// The Intermediate capstone: get the practice repository ready for a new
// teammate, as capstone/intermediate-brief.md asks. It checks what each
// Intermediate Exit statement leaves in files and git; picking a model and
// effort, and seeing each piece work in a session, are self-assessed on the
// capstone page.
import { frontmatter } from '../frontmatter.mjs';
import { committedMode, editWriteScripts, missingJq, runCommitted } from '../hooks.mjs';
import { items as memory } from './i-2.mjs';
import { items as scopes } from './i-4.mjs';
import { items as mcp } from './i-7.mjs';
import { items as plugins } from './i-8.mjs';
import { testsPass, nothingUncommitted } from './b-3.mjs';

export const title = 'Итоговый проект среднего уровня';

const READ_ONLY = new Set(['Read', 'Grep', 'Glob', 'LSP', 'WebFetch', 'WebSearch']);
const list = (value) => (Array.isArray(value) ? value : String(value ?? '').split(',')).map((t) => t.trim()).filter(Boolean);

function committedFiles(repo, dir, suffix) {
  try {
    return repo.git('ls-tree', '-r', '--name-only', 'HEAD', '--', dir).split('\n').filter((f) => f.endsWith(suffix));
  } catch {
    return [];
  }
}

function committedFile(repo, path) {
  try {
    return frontmatter(repo.git('show', `HEAD:${path}`));
  } catch {
    return null;
  }
}

const words = (text) => String(text ?? '').split(/\s+/).filter((w) => w && w !== 'TODO').length;

// The brief's skill runs the link checker: `npm run linkcheck` or src/cli.js.
const LINKCHECK = /npm run linkcheck|src\/cli\.js/;

const skill = {
  text: 'закоммиченный skill проекта, который запускает проверку ссылок и может подгружаться сам',
  check(repo) {
    const ok = committedFiles(repo, '.claude/skills', '/SKILL.md').some((path) => {
      const file = committedFile(repo, path);
      const f = file?.fields;
      return f && LINKCHECK.test(file.body) && words(f.description) >= 8 && String(f['disable-model-invocation']) !== 'true' && String(f['user-invocable']) !== 'false';
    });
    return ok ? true : 'Закоммитьте skill в `.claude/skills/<имя>/SKILL.md`, чьи инструкции запускают проверку ссылок (`npm run linkcheck -- <папка>`): с описанием, что он делает и когда его применять, и без `disable-model-invocation: true`, как в уроке 1.';
  },
};

const reviewer = {
  text: 'закоммиченный субагент-рецензент только с инструментами для чтения',
  check(repo) {
    const ok = committedFiles(repo, '.claude/agents', '.md').some((path) => {
      const f = committedFile(repo, path)?.fields;
      const tools = list(f?.tools);
      return f?.name && /review/i.test(`${f.name} ${f.description}`) && words(f.description) >= 5 && tools.length && tools.every((t) => READ_ONLY.has(t));
    });
    return ok ? true : 'Закоммитьте рецензента в `.claude/agents/`: субагента, в имени или описании которого сказано, что он проверяет изменения, со списком `tools` только из инструментов для чтения, например `Read, Grep, Glob`, как в уроке 6.';
  },
};

function committedSettings(repo) {
  try {
    return JSON.parse(repo.git('show', 'HEAD:.claude/settings.json'));
  } catch {
    return null;
  }
}

const hook = {
  text: 'закоммиченный исполняемый hook `PreToolUse` для Edit и Write блокирует `samples/` и ничего больше',
  check(repo) {
    const scripts = editWriteScripts(committedSettings(repo)).filter((s) => committedMode(repo, s) === '100755');
    if (!scripts.length) return 'Закоммитьте исполняемый скрипт в `.claude/hooks/` и запускайте его из `.claude/settings.json` как hook `PreToolUse` с matcher `Edit|Write`, как в уроке 5, чтобы не пускать Claude в samples/.';
    const samples = scripts.map((s) => runCommitted(repo, s, 'samples/guide.md'));
    const source = scripts.map((s) => runCommitted(repo, s, 'src/cli.js'));
    if ([...samples, ...source].some(missingJq)) return 'Hook нужен `jq`, а он не установлен. Установите его и запустите проверку снова.';
    if (!samples.some((r) => r?.status === 2)) return 'Ни один hook Edit|Write не завершается кодом 2 для `samples/guide.md`, поэтому Claude всё ещё может править samples/.';
    return source.every((r) => r?.status === 0) ? true : 'Hook Edit|Write блокирует и `src/cli.js`: блокируйте только samples/.';
  },
};

// The brief puts the sandbox in the team's committed settings.
const sandbox = {
  text: 'закоммиченный `.claude/settings.json` включает песочницу, а `.claude/settings.local.json` не попадает в git',
  check(repo) {
    if (repo.git('ls-files', '--', '.claude/settings.local.json')) return '.claude/settings.local.json закоммичен, но в нём ваши личные настройки. Выполните `git rm --cached .claude/settings.local.json`, закоммитьте и добавьте файл в `.gitignore`.';
    return committedSettings(repo)?.sandbox?.enabled === true ? true : 'Закоммиченный .claude/settings.json не включает песочницу. Добавьте в него `"sandbox": {"enabled": true}` и закоммитьте: `/sandbox` сохраняет в ваш локальный файл, а коллеги его не получают.';
  },
};

export const items = [skill, hook, reviewer, mcp[0], plugins[0], scopes[0], sandbox, memory[0], memory[1], testsPass, nothingUncommitted];
