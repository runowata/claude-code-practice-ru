// Put bounds on autonomous runs (Advanced, lesson 7). The Learner commits
// scripts/bounded-run.sh, which takes a task and a result path and starts
// one `claude -p` run in dontAsk mode, with JSON output, a turn limit, a
// spend limit and a committed settings file passed with --settings. That
// file allows only one folder or one command per rule, denies `git commit`
// and `git push`, and turns the sandbox on in strict mode, without
// auto-allow, refusing to start without it. The check runs the committed
// script with a stand-in for `claude`, so it spends no usage; when the
// script never reaches its `claude -p` call there, it reads the call from
// the script's text. It also reads two real runs the Learner saved: a
// slice of the task, whose cost must be under the spend limit, and a run a
// limit stopped. Reading the diff and running the tests before committing
// any of it is self-checked.
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute, join, posix, relative, sep } from 'node:path';
import { parseClaudeArgs, ruleList, scriptCalls } from '../claude-args.mjs';
import { committedMode, missingJq } from '../hooks.mjs';
import { commitHint, headText, parseJson } from '../marketplace.mjs';
import { notRun, runStubbed, scratchPath, stderrTail, STUB_SESSION, TIME_LIMIT } from '../stub-claude.mjs';

export const title = 'Ограничения для автономных запусков';

export const SCRIPT = 'scripts/bounded-run.sh';
export const SLICE = '.practice/a-7-slice.json';
export const CAPPED = '.practice/a-7-capped.json';

const PROJECT = '.claude/settings.json';
const OUT = 'result.json';
const LIMITS = new Set(['error_max_turns', 'error_max_budget_usd']);
const PATH_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'Glob', 'Grep']);
const SANDBOX = '`"sandbox": {"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false, "autoAllowBashIfSandboxed": false}`';
const NARROW = 'Разрешайте одной папке или одной команде по правилу, как в `Edit(./src/**)` или `Bash(npm test *)`.';
const AMOUNT = /^(\d+(\.\d*)?|\.\d+)$/;

const code = (text) => `\`${text}\``;
const quoted = (text) => (text.length > 120 ? `${text.slice(0, 120)}...` : text).replace(/\s+/g, ' ').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const usage = (script) => `\`${script} "<task>" <result.json>\``;
const squash = (flag) => flag.split('=')[0].replace(/^-+/, '').replace(/[-_]/g, '').toLowerCase();

// A sentence for an option Claude Code doesn't know, written like `flag`,
// or ''.
function misspelt(args, flag) {
  const typo = args.unknown.find((u) => squash(u) === squash(flag));
  return typo ? ` Claude Code не знает ${code(typo.split('=')[0])}, поэтому останавливается с ошибкой до начала запуска: напишите ${code(flag)}.` : '';
}

// The note for a committed file whose working copy differs, or ''.
function pending(repo, path) {
  try {
    repo.git('diff', '--quiet', 'HEAD', '--', path);
    return '';
  } catch {
    return ` В вашей копии ${code(path)} есть незакоммиченные изменения: если они это исправляют, закоммитьте их.`;
  }
}

// Up to three problems, then how many more, then the notes.
function report(problems, notes = '') {
  const more = problems.length > 3 ? ` И ещё ${problems.length - 3}: исправьте эти и запустите проверку снова.` : '';
  return `${problems.slice(0, 3).join(' ')}${more}${notes}`;
}

const exitOf = (run) => run.status ?? run.signal;

// How a run ended, for a hint.
function ended(run) {
  if (run.timedOut) return `Скрипт всё ещё работал через ${TIME_LIMIT / 1000} с, поэтому проверка его остановила.`;
  if (missingJq(run)) return 'Ему нужен `jq`, а он не установлен: установите его и запустите проверку снова.';
  const tail = stderrTail(run);
  return `Он завершился с кодом ${exitOf(run)}${tail ? `: ${tail}` : '.'}`;
}

// A path written in the script, relative to the Learner's repository, or
// null when it points outside it. Used for calls read from the text, which
// the check assumes run from the repository's root.
function inRepo(repo, path) {
  const roots = [repo.dir];
  try {
    roots.push(realpathSync(repo.dir));
  } catch {
    // The folder's own path is enough.
  }
  const target = isAbsolute(path) ? path : join(repo.dir, path);
  for (const root of roots) {
    const rel = relative(root, target);
    if (!isAbsolute(rel) && rel.split(sep)[0] !== '..') return rel.split(sep).join('/');
  }
  return null;
}

// The committed files the script may read before it calls `claude`: the
// JSON files in .claude/, and any file a `--settings` in its text names.
function companions(repo, text) {
  let listed = [];
  try {
    listed = repo.git('ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', '.claude').split('\0');
  } catch {
    // Nothing is committed yet.
  }
  const named = scriptCalls(text ?? '')
    .map((argv) => parseClaudeArgs(argv).flags.settings)
    .filter((v) => typeof v === 'string' && v && !v.includes('$') && !v.trim().startsWith('{') && !isAbsolute(v))
    .map((v) => posix.normalize(v));
  const files = {};
  for (const path of [...listed.filter((p) => p.endsWith('.json') && !p.startsWith('.claude/worktrees/')), ...named]) {
    if (path.startsWith('..') || files[path] !== undefined) continue;
    const content = headText(repo, path);
    if (content !== null) files[path] = `${content}\n`;
  }
  return files;
}

// What the items read about the script, once per repository: the stand-in
// run with a task and a result path; its `claude -p` calls, or, when it
// made none, the calls in the committed text.
const cache = new WeakMap();

function analysis(repo, script) {
  if (!cache.has(repo)) cache.set(repo, new Map());
  const runs = cache.get(repo);
  if (!runs.has(script)) runs.set(script, analyze(repo, script));
  return runs.get(script);
}

function analyze(repo, script) {
  const id = randomBytes(6).toString('hex');
  const task = `Add a test for one function (STUB-TASK-${id}), then run the tests.`;
  const text = headText(repo, script);
  const run = runStubbed(repo, script, {
    args: (out) => [task, join(out, OUT)],
    commit: { 'README.md': '# Scratch repository for the practice check\n', 'src/example.js': 'export const answer = 42;\n', ...companions(repo, text) },
    reply: { type: 'result', subtype: 'success', is_error: false, num_turns: 1, result: `STUB-RESULT-${id}`, session_id: STUB_SESSION, total_cost_usd: 0, permission_denials: [] },
  });
  const made = (run.calls ?? []).map((c) => ({ ...c, args: parseClaudeArgs(c.argv), where: (path) => scratchPath(run, c, path) }));
  const print = made.filter((c) => c.args.print);
  const stray = made.filter((c) => !c.args.print && !c.args.flags.version && !c.args.flags.help);
  const written = print.length || text === null ? [] : scriptCalls(text)
    .map((argv) => ({ argv, args: parseClaudeArgs(argv), where: (path) => inRepo(repo, path), fromText: true }))
    .filter((c) => c.args.print);
  return { run, task, print, stray, calls: print.length ? print : written };
}

// The hint when the check has no `claude -p` call to read, or null.
function noCall(repo, a, script) {
  if (a.calls.length) return null;
  const skipped = notRun(a.run, script);
  if (skipped) return skipped;
  return `При запуске как ${usage(script)} ${code(script)} ни разу не запустил \`claude -p\`, и проверка не нашла вызова \`claude -p\` в его тексте. ${ended(a.run)}${pending(repo, script)}`;
}

// The settings a call passes with --settings: `{ value, path, label }`, or
// `{ hint }` when the check can't read them; `none` when there is no flag.
const loaded = new WeakMap();

function settingsOf(repo, call) {
  if (!loaded.has(call)) loaded.set(call, loadSettings(repo, call));
  return loaded.get(call);
}

function loadSettings(repo, call) {
  const raw = call.args.flags.settings;
  const example = 'например `--settings .claude/bounded-run.json`';
  if (raw === undefined) return { none: true, hint: `Файл настроек не передан: добавьте \`--settings\` с закоммиченным файлом, в котором лежат ограничения, ${example}.${misspelt(call.args, '--settings')}` };
  if (raw === null || !raw.trim()) return { hint: `После \`--settings\` нет файла: назовите закоммиченный файл с ограничениями, ${example}.` };
  if (raw.trim().startsWith('{')) {
    try {
      const value = JSON.parse(raw);
      return isObject(value) ? { value, label: 'встроенный JSON в `--settings`' } : { hint: 'Встроенный JSON в `--settings` — не объект.' };
    } catch (error) {
      return { hint: `Встроенный JSON в \`--settings\` невалиден: ${error.message}` };
    }
  }
  if (call.fromText && raw.includes('$')) return { hint: `\`--settings ${raw}\` берёт файл из переменной, которую проверка не может вычислить: напишите путь прямо в скрипте, ${example}.` };
  const path = call.where(raw);
  if (path === null || path === '') return { hint: `\`--settings\` указывает на ${code(raw)}, вне вашего репозитория. Передайте файл, закоммиченный в нём, ${example}.` };
  const text = headText(repo, path);
  if (text === null) {
    return { hint: repo.exists(path) ? `${commitHint(repo, path)} Запуск читает ограничения из этого файла.` : `\`--settings\` указывает на ${code(path)}, которого нет. Сохраните ограничения туда, как показано в уроке, и закоммитьте файл.` };
  }
  const { value, error } = parseJson(text);
  if (error) return { hint: `Закоммиченный ${code(path)} — невалидный JSON: ${error}${pending(repo, path)}` };
  if (!isObject(value)) return { hint: `Закоммиченный ${code(path)} — не JSON-объект.${pending(repo, path)}` };
  return { value, path, label: code(path) };
}

// What is wrong with one call's mode, output and settings file, for item 1.
function callProblems(repo, call) {
  const { flags } = call.args;
  const problems = [];
  const spelling = (flag) => misspelt(call.args, flag);
  const mode = flags.permissionMode;
  if (flags.dangerouslySkipPermissions) problems.push('Уберите `--dangerously-skip-permissions`: это то же самое, что `--permission-mode bypassPermissions`, а он пропускает ваши проверки разрешений.');
  if (flags.allowDangerouslySkipPermissions) problems.push('Уберите `--allow-dangerously-skip-permissions`: ограниченный запуск никогда не переключается на `bypassPermissions`.');
  if (mode === undefined) problems.push(`Режим разрешений не задан: добавьте \`--permission-mode dontAsk\`, чтобы каждый вызов, требующий разрешения, отклонялся.${spelling('--permission-mode')}`);
  else if (mode === null) problems.push('После `--permission-mode` нет режима: напишите `--permission-mode dontAsk`.');
  else if (mode.startsWith('-')) problems.push(`После \`--permission-mode\` нет режима, поэтому он принимает ${code(mode)} как значение: напишите \`--permission-mode dontAsk\`.`);
  else if (mode.toLowerCase() === 'dontask' && mode !== 'dontAsk') problems.push(`Пишите \`dontAsk\` так, как его пишет Claude Code, а не ${code(mode)}.`);
  else if (mode !== 'dontAsk') problems.push(`Он работает в режиме ${code(mode)}: используйте \`--permission-mode dontAsk\`, чтобы каждый вызов, требующий разрешения, отклонялся.`);

  const format = flags.outputFormat;
  if (format === undefined) problems.push(`Он не просит JSON: добавьте \`--output-format json\`.${spelling('--output-format')}`);
  else if (format === null) problems.push('После `--output-format` нет формата: напишите `--output-format json`.');
  else if (format.startsWith('-')) problems.push(`После \`--output-format\` нет формата, поэтому он принимает ${code(format)} как значение: напишите \`--output-format json\`.`);
  else if (format !== 'json') problems.push(`Он просит \`--output-format ${format}\`: используйте \`json\`, чтобы по пути результата лежал результат запуска одним JSON-объектом.`);

  const settings = settingsOf(repo, call);
  if (settings.hint) problems.push(settings.hint);
  return problems;
}

// Whether the task reached the call as its prompt, and where it went if not.
function taskProblems(a, call) {
  if (call.args.prompt?.includes(a.task) || call.stdin.includes(a.task)) return [];
  if (call.args.operands.join(' ').includes(a.task)) return ['Задача передаётся без кавычек, поэтому оболочка разбивает её на слова, и Claude получает только первое. Напишите `"$1"` в двойных кавычках.'];
  const flag = Object.entries(call.args.flags).find(([, v]) => [v].flat().some((x) => typeof x === 'string' && x.includes(a.task)));
  if (flag) return [`Задача попала в значение \`--${flag[0].replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}\`, а не в промпт. Напишите промпт сразу после \`-p\`, как в \`claude -p "$1" ...\`.`];
  return ['Задача из первого аргумента не доходит до `claude -p`. Передайте её как промпт сразу после `-p`, как в `claude -p "$1" ...`.'];
}

const isStubJson = (text) => {
  try {
    return JSON.parse(text)?.session_id === STUB_SESSION;
  } catch {
    return false;
  }
};

function savedProblems(a) {
  const saved = a.run.saved[`out/${OUT}`];
  const save = 'Перенаправьте в путь из второго аргумента только его стандартный вывод: `claude -p "$1" ... > "$2"`.';
  if (saved === undefined) {
    const elsewhere = Object.keys(a.run.saved).find((p) => isStubJson(a.run.saved[p]));
    return [elsewhere ? `Он сохранил JSON, выведенный \`claude -p\`, в ${code(elsewhere)}, а не по пути из второго аргумента. ${save}` : `Он не сохранил JSON, выведенный \`claude -p\`, по пути из второго аргумента. ${save}`];
  }
  return isStubJson(saved) ? [] : [`Файл по пути из второго аргумента — не тот JSON, который вывел \`claude -p\`. ${save}`];
}

function modeHint(repo, script) {
  const mode = committedMode(repo, script);
  if (mode === null) return repo.exists(script) ? commitHint(repo, script) : `Нет файла ${code(script)}. Напишите его, как показано в уроке, затем закоммитьте.`;
  if (mode === '100755') return null;
  if (mode === '100644') return `${code(script)} не исполняемый. Выполните \`chmod +x ${script}\`, затем \`git add ${script}\` и закоммитьте. В Windows выполните \`git update-index --chmod=+x ${script}\` и закоммитьте.`;
  return `${code(script)} закоммичен как ${mode === '120000' ? 'символическая ссылка' : 'не файл'}. Закоммитьте сам файл скрипта и сделайте его исполняемым.`;
}

export function boundedScript(script = SCRIPT) {
  return {
    text: `${code(script)} закоммичен и исполняемый, принимает задачу и путь результата (${usage(script)}) и запускает \`claude -p\` в режиме \`dontAsk\` с JSON-выводом и закоммиченным файлом \`--settings\``,
    check(repo) {
      const mode = modeHint(repo, script);
      if (mode) return mode;
      const a = analysis(repo, script);
      const skipped = notRun(a.run, script);
      if (skipped) return skipped;
      if (!a.print.length) {
        const why = a.stray.length
          ? 'запустил `claude` без `-p` (или `--print`), а это открывает интерактивную сессию, которая ждёт вас. Добавьте `-p` и задачу сразу после него.'
          : `ни разу не запустил \`claude -p\`. ${ended(a.run)} Пусть скрипт берёт задачу из первого аргумента, а путь результата — из второго.`;
        return `При запуске как ${usage(script)} ${code(script)} ${why}${pending(repo, script)}`;
      }
      const problems = [];
      if (a.print.length > 1) problems.push(`При одной задаче он запустил \`claude -p\` ${a.print.length} раз. Запускайте один раз.`);
      if (a.stray.length) problems.push('Он также запустил `claude` без `-p`, а это открывает интерактивную сессию, которая ждёт вас. Оставьте только вызов `claude -p`.');
      problems.push(...taskProblems(a, a.print[0]), ...savedProblems(a));
      problems.push(...new Set(a.print.flatMap((c) => callProblems(repo, c))));
      return problems.length ? report(problems, pending(repo, script)) : true;
    },
  };
}

// What is wrong with one call's turn and spend limits.
function limitProblems(call) {
  const { flags } = call.args;
  const problems = [];
  const spelling = (flag) => misspelt(call.args, flag);
  const variable = (flag, value) => `\`${flag} ${value}\` берёт значение из переменной, которую проверка не может вычислить: напишите число прямо в скрипте.`;
  const option = (value) => /^--?[A-Za-z]/.test(value);
  const taken = (flag, value, what) => `После \`${flag}\` нет ${what === 'number' ? 'числа' : 'суммы'}, поэтому он принимает ${code(value)} как значение: напишите ${what === 'number' ? 'целое число от 1' : 'сумму в долларах США больше 0'}.`;

  const turns = flags.maxTurns;
  if (turns === undefined) problems.push(`Лимит ходов не задан: добавьте \`--max-turns\` с целым числом от 1.${spelling('--max-turns')}`);
  else if (turns === null || !turns.trim()) problems.push('После `--max-turns` нет числа: напишите целое число от 1.');
  else if (option(turns)) problems.push(taken('--max-turns', turns, 'number'));
  else if (call.fromText && turns.includes('$')) problems.push(variable('--max-turns', turns));
  else if (!/^\d+$/.test(turns)) problems.push(`\`--max-turns ${turns}\` — не целое число: напишите целое число от 1.`);
  else if (Number(turns) < 1) problems.push(`\`--max-turns ${turns}\` меньше 1: напишите целое число от 1.`);

  const budget = flags.maxBudgetUsd;
  if (budget === undefined) problems.push(`Лимит расходов не задан: добавьте \`--max-budget-usd\` с суммой в долларах США больше стоимости одного среза задачи.${spelling('--max-budget-usd')}`);
  else if (budget === null || !budget.trim()) problems.push('После `--max-budget-usd` нет суммы: напишите сумму в долларах США больше 0.');
  else if (option(budget)) problems.push(taken('--max-budget-usd', budget, 'amount'));
  else if (call.fromText && budget.includes('$')) problems.push(variable('--max-budget-usd', budget));
  else if (!AMOUNT.test(budget)) problems.push(`\`--max-budget-usd ${budget}\` — не сумма: напишите число долларов США без знака \`$\`.`);
  else if (Number(budget) <= 0) problems.push(`\`--max-budget-usd ${budget}\` не больше 0: напишите сумму в долларах США больше стоимости одного среза задачи.`);
  return problems;
}

export function runLimits(script = SCRIPT) {
  return {
    text: 'в нём заданы лимит ходов и лимит расходов',
    check(repo) {
      const a = analysis(repo, script);
      const none = noCall(repo, a, script);
      if (none) return none;
      const problems = [...new Set(a.calls.flatMap(limitProblems))];
      return problems.length ? report(problems, pending(repo, script)) : true;
    },
  };
}

// The spend limit the script passes, as a number, or null.
function budgetOf(a) {
  const budget = a.calls[0]?.args.flags.maxBudgetUsd;
  return typeof budget === 'string' && AMOUNT.test(budget) && Number(budget) > 0 ? Number(budget) : null;
}

// Why an allow rule is wider than one folder or one command, or null.
export function wideReason(rule) {
  const m = rule.trim().match(/^([^()\s]+)(?:\(([\s\S]*)\))?$/);
  if (!m) return null;
  const [, tool, spec] = m;
  if (tool.includes('*')) return 'подходит ко всем инструментам, чьё имя ему соответствует';
  if (tool.startsWith('mcp__')) return spec === undefined && tool.split('__').filter(Boolean).length < 3 ? 'пропускает все инструменты этого MCP-сервера' : null;
  const all = spec === undefined || /^\*+$/.test(spec.trim());
  if (tool === 'Bash') {
    if (all) return 'пропускает любую команду';
    const s = spec.trim();
    if (s.startsWith('*')) return 'начинается с подстановочного знака, поэтому подходит к командам любой программы';
    const program = s.match(/^([^\s*:]+)(?:\s+\*|:\*|\*)$/);
    return program ? `пропускает любую команду \`${program[1]}\` с любыми аргументами` : null;
  }
  if (PATH_TOOLS.has(tool)) {
    const verb = ['Read', 'Glob', 'Grep'].includes(tool) ? 'читать' : 'изменять';
    if (all) return `позволяет запуску ${verb} любой файл`;
    const s = spec.trim();
    const anchor = s.match(/^(\/\/|~\/|\.\/|\/)?/)[1] ?? '';
    const first = s.slice(anchor.length).split('/')[0];
    if (first && !first.includes('*') && first !== '.' && first !== '..') return null;
    if (first === '..') return `позволяет запуску ${verb} файлы вне проекта`;
    if (anchor === '//') return `позволяет запуску ${verb} файлы в любом месте диска`;
    if (anchor === '~/') return `позволяет запуску ${verb} файлы в любом месте вашей домашней папки`;
    return `позволяет запуску ${verb} файлы в любой папке проекта`;
  }
  if (all) return `пропускает любое использование \`${tool}\``;
  if (tool === 'WebFetch' && spec.trim() === 'domain:*') return 'позволяет запуску обращаться к любому домену';
  return null;
}

// The git command an allow rule lets through, `commit` or `push`, or null.
function gitWrite(rule) {
  const m = rule.trim().match(/^Bash\(([\s\S]*)\)$/);
  return m?.[1].match(/(?:^|[\s;&|(])git\s+(?:-\S+\s+)*(commit|push)\b/)?.[1] ?? null;
}

// Whether a deny rule stops `command` with any arguments, and the bare
// command too: a bare `Bash`, `Bash(*)`, or one trailing wildcard after a
// prefix of it, as in `Bash(git push *)`, `Bash(git push:*)` or `Bash(git *)`.
// A rule with no wildcard, such as `Bash(git push)`, matches only the bare
// command.
export function stops(rule, command) {
  const r = rule.trim();
  if (r === 'Bash' || r === '*') return true;
  const m = r.match(/^Bash\(([\s\S]*)\)$/);
  if (!m) return false;
  const spec = m[1];
  if (/^\s*\*+\s*$/.test(spec)) return true;
  if ((spec.match(/\*/g) ?? []).length !== 1 || !spec.endsWith('*')) return false;
  const words = spec.match(/^(.*?)(?: \*|:\*)$/);
  if (words) return command === words[1] || command.startsWith(`${words[1]} `);
  return command.startsWith(spec.slice(0, -1));
}

// The rules of a settings object, as `{ rule, label }`.
function rulesOf(value, key, label) {
  const list = value?.permissions?.[key];
  return Array.isArray(list) ? list.filter((r) => typeof r === 'string' && r.trim()).map((rule) => ({ rule: rule.trim(), label })) : [];
}

// Whether the call loads the project's settings files: it does unless
// `--setting-sources` leaves `project` out.
function loadsProject(call) {
  const sources = call.args.flags.settingSources;
  return typeof sources !== 'string' || sources.split(',').map((s) => s.trim()).includes('project');
}

function projectSettings(repo) {
  const text = headText(repo, PROJECT);
  if (text === null) return {};
  const { value, error } = parseJson(text);
  if (error) return { hint: `Закоммиченный ${code(PROJECT)} — невалидный JSON: ${error}` };
  return isObject(value) ? { value } : { hint: `Закоммиченный ${code(PROJECT)} — не JSON-объект.` };
}

function ruleProblems(repo, call) {
  const settings = settingsOf(repo, call);
  if (settings.hint && !settings.none) return [settings.hint];
  const { allowedTools, disallowedTools } = call.args.flags;
  const allow = ruleList(allowedTools ?? []).map((rule) => ({ rule, label: '`--allowedTools`' }));
  const deny = ruleList(disallowedTools ?? []).map((rule) => ({ rule, label: '`--disallowedTools`' }));
  if (settings.value) {
    allow.push(...rulesOf(settings.value, 'allow', settings.label));
    deny.push(...rulesOf(settings.value, 'deny', settings.label));
  }
  // Only the run's own rules count here: a `-p` run in a folder you never
  // trusted leaves out the allow rules in .claude/settings.json.
  const own = allow.length;
  if (loadsProject(call) && settings.path !== PROJECT) {
    const project = projectSettings(repo);
    if (project.hint) return [project.hint];
    allow.push(...rulesOf(project.value, 'allow', code(PROJECT)));
    deny.push(...rulesOf(project.value, 'deny', code(PROJECT)));
  }

  const problems = [];
  const writes = allow.filter((a) => gitWrite(a.rule));
  for (const { rule, label } of writes.slice(0, 2)) problems.push(`${code(rule)} (${label}) позволяет запуску использовать \`git ${gitWrite(rule)}\`. Уберите его: это должны останавливать правила deny.`);
  const wide = allow.filter((a) => !gitWrite(a.rule)).map((a) => ({ ...a, why: wideReason(a.rule) })).filter((a) => a.why);
  for (const { rule, label, why } of wide.slice(0, 3)) problems.push(`${code(rule)} (${label}) ${why}.`);
  if (wide.length > 3) problems.push(`И ещё ${wide.length - 3} таких правил.`);
  if (wide.length) problems.push(NARROW);
  if (!own) problems.push(`Ничто из выданного запуску не разрешает ни одного вызова, поэтому в режиме \`dontAsk\` он не сможет изменить файл или запустить ваши тесты, а запуск \`-p\` в папке, которой вы не доверяли, не читает правила allow из ${code(PROJECT)}. В \`permissions.allow\` файла настроек разрешите папки, которые правит задача, и одну команду, которую она запускает, как в \`"Edit(./src/**)"\` и \`"Bash(npm test *)"\`.`);

  for (const command of ['git commit', 'git push']) {
    if (deny.some((d) => stops(d.rule, command))) continue;
    const exact = deny.find((d) => d.rule.replace(/\s+/g, ' ') === `Bash(${command})`);
    problems.push(exact
      ? `${code(exact.rule)} (${exact.label}) подходит только к голой \`${command}\`, но не к \`${command} ${command.endsWith('push') ? 'origin main' : '-m "..."'}\`. Напишите \`Bash(${command} *)\`: завершающий \` *\` подходит и к голой команде.`
      : `Ни одно правило deny не останавливает \`${command}\`: добавьте \`"Bash(${command} *)"\` в \`permissions.deny\` файла настроек.`);
  }
  const notes = settings.path ? pending(repo, settings.path) : '';
  return problems.length && notes ? [...problems, notes.trim()] : problems;
}

export function narrowRules(script = SCRIPT) {
  return {
    text: 'каждое правило allow называет одну команду или одну папку, а правила deny останавливают `git commit` и `git push`',
    check(repo) {
      const a = analysis(repo, script);
      const none = noCall(repo, a, script);
      if (none) return none;
      const problems = [...new Set(a.calls.flatMap((c) => ruleProblems(repo, c)))];
      return problems.length ? problems.join(' ') : true;
    },
  };
}

function sandboxProblems(repo, call) {
  const settings = settingsOf(repo, call);
  if (settings.none) return [`Запуск не получает файл настроек, поэтому ничто не включает песочницу (sandbox): передайте файл с ограничениями через \`--settings\` и положите в него ${SANDBOX}.`];
  if (settings.hint) return [settings.hint];
  const box = settings.value.sandbox;
  const notes = settings.path ? pending(repo, settings.path) : '';
  if (!isObject(box)) return [`${settings.label}: нет настроек \`sandbox\`. Добавьте ${SANDBOX}.${notes}`];
  const problems = [];
  if (box.enabled !== true) problems.push('Задайте `"enabled": true` в `sandbox`: песочница выключена, пока файл настроек её не включит.');
  if (box.failIfUnavailable !== true) problems.push('Задайте `"failIfUnavailable": true`: без него запуск, у которого песочница не стартовала, выполняет команды без песочницы.');
  if (box.allowUnsandboxedCommands !== false) problems.push('Задайте `"allowUnsandboxedCommands": false`: без него Claude может повторить заблокированную песочницей команду вне песочницы.');
  if (box.autoAllowBashIfSandboxed !== false) problems.push('Задайте `"autoAllowBashIfSandboxed": false`: без него команды в песочнице выполняются, не спрашивая ваши правила allow и режим разрешений, и остановить их могут только правила deny.');
  if (!problems.length) return [];
  return [`${settings.label}: ${problems.join(' ')}${notes}`];
}

export function strictSandbox(script = SCRIPT) {
  return {
    text: 'файл настроек включает песочницу (sandbox) в строгом режиме без авторазрешения и заставляет запуск отказаться стартовать без неё',
    check(repo) {
      const a = analysis(repo, script);
      const none = noCall(repo, a, script);
      if (none) return none;
      const problems = [...new Set(a.calls.flatMap((c) => sandboxProblems(repo, c)))];
      return problems.length ? problems.join(' ') : true;
    },
  };
}

// A saved run: the JSON `claude -p --output-format json` prints, or, from
// `--output-format stream-json`, the last result among its lines. Returns
// `{ value }`, or `{ missing }`, `{ text }` (not JSON) or `{ noResult }`.
function savedResult(repo, path) {
  const text = repo.read(path);
  if (text === null || !text.trim()) return { missing: true };
  try {
    return { value: JSON.parse(text) };
  } catch {
    // Not one JSON value: it may be stream-json, one JSON object per line.
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return undefined;
    }
  });
  if (lines.length < 2 || !lines.some((v) => isObject(v))) return { text: true };
  const results = lines.filter((v) => v?.type === 'result');
  return results.length ? { value: results.at(-1) } : { noResult: true };
}

// The hint for a saved run that isn't a real run's result, or null.
function resultHint(saved, path, again) {
  if (saved.text) return `${code(path)} — не JSON. Сохраняйте туда только то, что \`claude -p --output-format json\` печатает в стандартный вывод. ${again}`;
  if (saved.noResult) return `В ${code(path)} нет результата: запуск не завершился. ${again}`;
  if (saved.value?.type !== 'result') return `${code(path)} — не результат запуска \`claude -p\` с \`--output-format json\`. ${again}`;
  if (saved.value.session_id === STUB_SESSION) return `В ${code(path)} лежит подставной ответ проверки, а не настоящий запуск: ваш скрипт сохранил его туда, пока проверка его запускала. Сохраняйте JSON только по пути из второго аргумента скрипта. ${again}`;
  return null;
}

export function sliceRun(record = SLICE, script = SCRIPT) {
  const again = 'Затем запустите срез снова.';
  return {
    text: `${code(record)} содержит запуск среза, стоимость которого ниже вашего лимита расходов`,
    local: true,
    check(repo) {
      const saved = savedResult(repo, record);
      if (saved.missing) return `Файла ${code(record)} ещё нет: запустите свой скрипт на срезе задачи, как в разделе «Разбор на примере» урока: \`${script} "<небольшая часть задачи>" ${record}\`.`;
      const wrong = resultHint(saved, record, again);
      if (wrong) return wrong;
      const run = saved.value;
      if (run.subtype === 'error_max_budget_usd') return `Срез остановился на вашем лимите расходов (\`error_max_budget_usd\`), значит, лимит ниже стоимости одного среза. Поднимите \`--max-budget-usd\` в ${code(script)} и закоммитьте. ${again}`;
      if (run.subtype === 'error_max_turns') return `Срез остановился на вашем лимите ходов (\`error_max_turns\`), не закончив. Поднимите \`--max-turns\` в ${code(script)} или дайте срез поменьше. ${again}`;
      if (run.subtype !== 'success') return `Срез завершился с ${code(String(run.subtype))}, а не \`success\`, поэтому не показывает стоимость целого среза. ${again}`;
      if (run.is_error === true) return `Запуск среза завершился сбоем${typeof run.result === 'string' && run.result.trim() ? `: «${quoted(run.result)}»` : ''}. Исправьте то, о чём там сказано. ${again}`;
      if (typeof run.total_cost_usd !== 'number' || !Number.isFinite(run.total_cost_usd) || run.total_cost_usd < 0) return `В запуске в ${code(record)} нет оценки стоимости в \`total_cost_usd\`, а срез нужен именно для неё. Сохраните JSON, который печатает \`claude -p\`, без изменений. ${again}`;
      if (!Number.isInteger(run.num_turns)) return `В запуске в ${code(record)} нет числа ходов в \`num_turns\`, значит, это не тот JSON, который сохраняет \`claude -p\`. ${again}`;
      const budget = budgetOf(analysis(repo, script));
      if (budget === null) return `Проверка не может прочитать лимит расходов из ${code(script)} (см. второй пункт), поэтому не может сравнить с ним стоимость среза.`;
      if (run.total_cost_usd >= budget) return `Срез стоил примерно $${run.total_cost_usd} (\`total_cost_usd\`), а ваш лимит расходов \`--max-budget-usd ${budget}\` не выше. Поставьте лимит выше стоимости среза, пересчитанной на всю задачу, и закоммитьте ${code(script)}.`;
      return true;
    },
  };
}

export function cappedRun(record = CAPPED) {
  const again = 'Затем снова выполните шаг урока, на котором запуск останавливается на лимите.';
  return {
    text: `${code(record)} содержит запуск, остановленный лимитом`,
    local: true,
    check(repo) {
      const saved = savedResult(repo, record);
      if (saved.missing) return `Файла ${code(record)} ещё нет: выполните шаг урока, где запуску даётся слишком маленький для завершения лимит; он сохранит туда JSON.`;
      const wrong = resultHint(saved, record, again);
      if (wrong) return wrong;
      const { subtype } = saved.value;
      if (LIMITS.has(subtype)) return true;
      if (subtype === 'success') return `Запуск в ${code(record)} завершился (\`success\`), значит, никакой лимит его не остановил. Дайте ему слишком маленький для задачи лимит, например \`--max-budget-usd 0.01\`, как в шаге 4 урока. ${again}`;
      return `Запуск в ${code(record)} завершился с ${code(String(subtype))}, а не на лимите (\`error_max_turns\` или \`error_max_budget_usd\`). ${again}`;
    },
  };
}

export const items = [boundedScript(), runLimits(), narrowRules(), strictSandbox(), sliceRun(), cappedRun()];
