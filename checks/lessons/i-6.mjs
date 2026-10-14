// Delegate to a custom subagent (Intermediate, lesson 6). The Learner
// finishes a read-only test-gaps subagent, commits it, and delegates to it in
// a session started with a SubagentStart hook that logs each subagent's name.
import { frontmatter } from '../frontmatter.mjs';

export const title = 'Передайте работу своему субагенту';

const AGENT = '.claude/agents/test-gaps.md';
const READ_ONLY = new Set(['Read', 'Grep', 'Glob', 'LSP', 'WebFetch', 'WebSearch']);

function committedFields(repo) {
  try {
    return frontmatter(repo.git('show', `HEAD:${AGENT}`))?.fields ?? {};
  } catch {
    return null;
  }
}

function missing(repo) {
  return repo.exists(AGENT) ? `${AGENT} не закоммичен. Выполните \`git add ${AGENT}\` и закоммитьте его.` : `Файла ${AGENT} нет. Сохраните заготовку из раздела «Ваша очередь» урока.`;
}

const list = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
  .map((t) => t.trim()).filter(Boolean);

export const items = [
  {
    text: '`.claude/agents/test-gaps.md` закоммичен: в нём есть имя и описание, когда его использовать',
    check(repo) {
      const fields = committedFields(repo);
      if (fields === null) return missing(repo);
      if (fields.name !== 'test-gaps') return `В frontmatter указано имя «${fields.name ?? ''}». Укажите \`name: test-gaps\`: Claude Code пропускает файл агента без имени.`;
      const description = String(fields.description ?? '').trim();
      const words = description.split(/\s+/).filter((w) => w && w !== 'TODO').length;
      return words >= 8 ? true : 'Напишите описание из одного-двух предложений: что делает субагент и когда Claude должен поручать ему работу. По описанию Claude решает, когда делегировать.';
    },
  },
  {
    text: 'список `tools` только для чтения: нет инструментов, которые правят файлы или запускают команды',
    check(repo) {
      const fields = committedFields(repo);
      if (fields === null) return missing(repo);
      const tools = list(fields.tools);
      if (!tools.length || tools.includes('TODO')) return 'Заполните `tools:` нужными инструментами только для чтения, например `Read, Grep, Glob`. Без этого поля субагент получает все инструменты.';
      const extra = tools.filter((t) => !READ_ONLY.has(t));
      return extra.length ? `${extra.join(', ')} позволят ему менять файлы или запускать команды, так что он не только для чтения. Оставьте инструменты вроде Read, Grep и Glob.` : true;
    },
  },
  {
    text: '`.practice/i-6-agents.txt` показывает, что Claude передал работу test-gaps',
    local: true,
    check(repo) {
      const log = repo.read('.practice/i-6-agents.txt');
      if (log === null) return 'Журнала нет. Запустите сессию командой `claude --settings .practice/i-6-hook.json` (файл хука взят из урока), затем поручите работу субагенту.';
      return log.split(/\r?\n/).map((l) => l.trim()).includes('test-gaps') ? true : 'В журнале нет строки `test-gaps`, значит, Claude не передал ему работу. В сессии, запущенной с хуком, попросите: «Используй агента test-gaps, чтобы перечислить функции, которые не вызывает ни один тест».';
    },
  },
];
