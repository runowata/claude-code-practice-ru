// Permissions, settings scopes and the sandbox (Intermediate, lesson 4). The
// Learner commits team permission rules in the shared .claude/settings.json,
// keeps personal settings in the uncommitted .claude/settings.local.json, and
// turns the sandbox on. That a sandboxed write outside the project fails shows
// only in a session, so the lesson self-checks it.
export const title = 'Разрешения, уровни настроек и песочница';

const SHARED = '.claude/settings.json';
const LOCAL = '.claude/settings.local.json';

function parse(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: error.message };
  }
}

function committed(repo, path) {
  try {
    return repo.git('show', `HEAD:${path}`);
  } catch {
    return null;
  }
}

// An allow rule that lets every command, or every use of a tool, through:
// a bare tool name, `Bash(*)`, or one program with any arguments.
function broad(rule) {
  const m = rule.match(/^(\w+)(?:\((.*)\))?$/);
  if (!m) return false;
  const [, tool, spec] = m;
  if (spec === undefined || spec === '*' || spec === '**') return true;
  return tool === 'Bash' && /^\S+(\s+\*|:\*)$/.test(spec.trim());
}

const READ_ENV = /^Read\((\.\/|\/|\*\*\/)?\.env\)$/;
const READ_ENV_ANY = /^Read\((\.\/|\/|\*\*\/)?\.env\.\*\)$/;

export const items = [
  {
    text: 'закоммиченный `.claude/settings.json` запрещает читать файлы `.env` и разрешает одну узкую команду запуска тестов',
    check(repo) {
      const text = committed(repo, SHARED);
      if (text === null) return repo.exists(SHARED) ? `${SHARED} не закоммичен. Выполните \`git add ${SHARED}\` и закоммитьте его: правила команды хранятся в общем файле.` : `Файла ${SHARED} нет. Сохраните заготовку из раздела «Ваша очередь» урока.`;
      const { value, error } = parse(text);
      if (error) return `Закоммиченный ${SHARED} — не корректный JSON: ${error}`;
      const allow = value?.permissions?.allow ?? [];
      const deny = value?.permissions?.deny ?? [];
      const todo = [...allow, ...deny].filter((r) => /TODO/.test(r));
      if (todo.length) return `Замените каждый TODO правилом: ${todo.join('; ')}.`;
      if (!deny.some((r) => READ_ENV.test(r))) return 'Добавьте `Read(./.env)` в `permissions.deny`.';
      if (!deny.some((r) => READ_ENV_ANY.test(r))) return 'Добавьте `Read(./.env.*)` в `permissions.deny` — для .env.local и других файлов .env.*.';
      const wide = allow.filter(broad);
      if (wide.length) return `${wide.join(', ')} пропускает любую команду или любое использование инструмента. Разрешите одну команду, например \`Bash(npm test)\`.`;
      if (!allow.some((r) => /^Bash\(.+\)$/.test(r))) return 'Добавьте разрешающее правило для команды, которая запускает ваши тесты, например `Bash(npm test)`.';
      return true;
    },
  },
  {
    text: 'песочница включена, а `.claude/settings.local.json` не попадает в git',
    // `/sandbox` saves to the uncommitted local file, which never reaches CI.
    local: true,
    check(repo) {
      if (repo.git('ls-files', '--', LOCAL)) return `${LOCAL} закоммичен, но в нём ваши личные настройки. Выполните \`git rm --cached ${LOCAL}\`, закоммитьте и добавьте файл в \`.gitignore\`.`;
      for (const path of [LOCAL, SHARED]) {
        const text = repo.read(path);
        if (text === null) continue;
        const { value, error } = parse(text);
        if (error) return `${path} — не корректный JSON: ${error}`;
        if (value?.sandbox?.enabled === true) return true;
      }
      return 'Песочница выключена. Выполните `/sandbox` в сессии и выберите режим auto-allow: он сохранит `"sandbox": {"enabled": true}` в .claude/settings.local.json.';
    },
  },
];
