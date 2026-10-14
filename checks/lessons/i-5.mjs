// Enforce a rule with a hook (Intermediate, lesson 5). The Learner fixes the
// hooks guide's protect-files script so it blocks .env files (but not
// .env.example) and anything in a secrets/ folder, commits it as an
// executable file, and registers it as a PreToolUse hook for Edit and Write.
// The check runs the committed script with the JSON a tool call sends. Seeing
// the hook fire in a session is self-checked.
import { committedMode, editWriteScripts, missingJq, runCommitted } from '../hooks.mjs';

export const title = 'Закрепите правило с помощью hook';

const HOOK = '.claude/hooks/protect-files.sh';
const SETTINGS = '.claude/settings.json';

// Each path, under the repository, and the exit code the hook must give it.
// The guide's own protections for package-lock.json and .git/ stay.
const CASES = [
  ['.env', 2],
  ['config/.env.local', 2],
  ['.env.example', 0],
  ['secrets/api.key', 2],
  ['src/config.envelope.ts', 0],
  ['src/app.js', 0],
  ['package-lock.json', 2],
  ['.git/config', 2],
];

export const items = [
  {
    text: '`.claude/hooks/protect-files.sh` закоммичен и исполняемый',
    check(repo) {
      const mode = committedMode(repo, HOOK);
      if (mode === null) return repo.exists(HOOK) ? `${HOOK} не закоммичен. Выполните \`git add ${HOOK}\` и закоммитьте его.` : `Файла ${HOOK} нет. Скопируйте hook из раздела «Разбор на примере» урока.`;
      return mode === '100755' ? true : `${HOOK} не исполняемый, поэтому Claude Code не может его запустить. Выполните \`chmod +x ${HOOK}\`, затем \`git add ${HOOK}\` и закоммитьте.`;
    },
  },
  {
    text: 'закоммиченный `.claude/settings.json` запускает его как hook `PreToolUse` для Edit и Write',
    check(repo) {
      let text;
      try {
        text = repo.git('show', `HEAD:${SETTINGS}`);
      } catch {
        return `Закоммиченного ${SETTINGS} нет. Добавьте в него настройки hook из урока и закоммитьте.`;
      }
      let value;
      try {
        value = JSON.parse(text);
      } catch (error) {
        return `Закоммиченный ${SETTINGS} — не корректный JSON: ${error.message}`;
      }
      return editWriteScripts(value).includes(HOOK) ? true : `${SETTINGS} не запускает protect-files.sh как hook PreToolUse с matcher для Edit и Write, например \`"matcher": "Edit|Write"\`.`;
    },
  },
  {
    text: 'закоммиченный hook блокирует файлы `.env` (но не `.env.example`), всё в папке `secrets/`, `package-lock.json` и `.git/`, а остальное пропускает',
    check(repo) {
      if (committedMode(repo, HOOK) === null) return `Закоммитьте ${HOOK}: проверка запускает закоммиченный скрипт — тот, который получат ваши коллеги.`;
      const wrong = [];
      for (const [path, want] of CASES) {
        const run = runCommitted(repo, HOOK, path, 'Write');
        if (run.error) return `Не удалось запустить hook: ${run.error.message}`;
        if (missingJq(run)) return 'Hook нужен `jq`, а он не установлен. Установите его и запустите проверку снова.';
        if (run.status !== want) wrong.push(`${path}: код выхода ${run.status}, ожидался ${want}`);
        else if (want === 2 && !run.stderr.trim()) wrong.push(`${path} заблокирован без объяснения причины в stderr для Claude`);
      }
      return wrong.length ? `${wrong.join('; ')}.` : true;
    },
  },
];
