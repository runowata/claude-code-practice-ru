// Script Claude Code with `claude -p` (Advanced, lesson 4). The Learner
// commits scripts/review-staged.sh, which pipes the staged diff into one
// `claude -p` call that asks for JSON, runs in dontAsk mode, pre-approves
// only Read, Grep and Glob and caps its turns; saves the JSON to the path in
// its first argument, or .practice/a-4-result.json without one; prints the
// review; and exits non-zero when the run fails or nothing is staged. The
// check runs the committed script with a stand-in for `claude`, so it
// spends no usage, and reads the result of one real run the Learner saved.
// Seeing a run stop at the turn cap is self-checked. The Advanced capstone
// reuses these items with its own result file.
import { randomBytes } from 'node:crypto';
import { join, posix } from 'node:path';
import { parseClaudeArgs, ruleList } from '../claude-args.mjs';
import { committedMode, missingJq } from '../hooks.mjs';
import { notRun, runStubbed, stderrTail, STUB_SESSION, TIME_LIMIT } from '../stub-claude.mjs';

export const title = 'Скрипт для Claude Code с `claude -p`';

export const SCRIPT = 'scripts/review-staged.sh';
export const RESULT = '.practice/a-4-result.json';
export const CAP_MAX = 10;

const JQ = 'Скрипту нужен `jq`, а он не установлен. Установите его и запустите проверку снова.';
const OUT = 'review.json';
const READ_ONLY = /^(Read|Grep|Glob)(\(.*\))?$/s;
const TOOL_NAME = /^(?:[A-Z]\w*|mcp__\S+|\*)(\(.*\))?$/s;

const and = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : list[0]);
const code = (text) => `\`${text}\``;
const quoted = (text) => (text.length > 120 ? `${text.slice(0, 120)}...` : text).replace(/\s+/g, ' ').trim();

// What the scratch repository holds, and what the stand-in answers, in each
// run: a review of a staged change; the same without an argument, in a
// repository without `.practice/`, as a fresh copy is; `claude`
// exiting non-zero with an error on stderr and no JSON, as it does for a
// flag it can't read; JSON that says the run failed while `claude` exits 0;
// and nothing staged. The two failures test the script's two exit rules
// apart. Every run but the last has a staged change, and every run a change
// that isn't staged.
const SCENARIOS = {
  review: { stage: true, args: (out) => [join(out, OUT)], reply: (m) => ({ subtype: 'success', is_error: false, result: m.review, num_turns: 1 }) },
  noArgument: { stage: true, practice: false, args: () => [], reply: (m) => ({ subtype: 'success', is_error: false, result: m.review, num_turns: 1 }) },
  failed: { stage: true, args: (out) => [join(out, OUT)], reply: () => null, stderr: 'error: the stand-in for claude failed before the run', exit: 1 },
  isError: { stage: true, args: (out) => [join(out, OUT)], reply: () => ({ subtype: 'success', is_error: true, result: 'The stand-in reports a failed run.', num_turns: 1 }) },
  nothingStaged: { stage: false, args: (out) => [join(out, OUT)], reply: (m) => ({ subtype: 'success', is_error: false, result: m.review, num_turns: 1 }) },
};

const README = '# Scratch repository for the practice check\n';
const SOURCE = 'export const answer = 42;\n';

function plan(name) {
  const id = randomBytes(6).toString('hex');
  // No marker holds another, so each shows on its own.
  const m = { staged: `change-in-the-index-${id}`, unstaged: `change-not-added-${id}`, review: `STUB-REVIEW-${id}` };
  const s = SCENARIOS[name];
  return {
    markers: m,
    options: {
      args: s.args,
      commit: { 'README.md': README, 'src/example.js': SOURCE },
      stage: s.stage ? { 'src/example.js': `${SOURCE}// ${m.staged}\n` } : {},
      change: { 'README.md': `${README}\n${m.unstaged}\n` },
      reply: s.reply(m) && { type: 'result', session_id: STUB_SESSION, total_cost_usd: 0, permission_denials: [], ...s.reply(m) },
      stderr: s.stderr,
      exit: s.exit ?? 0,
      practice: s.practice ?? true,
    },
  };
}

// Each repository's runs, by script and scenario, so the items share them.
const cache = new WeakMap();

function scenario(repo, script, name) {
  if (!cache.has(repo)) cache.set(repo, new Map());
  const runs = cache.get(repo);
  const key = `${script}\n${name}`;
  if (!runs.has(key)) {
    const { markers, options } = plan(name);
    const run = runStubbed(repo, script, options);
    const parsed = (run.calls ?? []).map((c) => ({ ...c, args: parseClaudeArgs(c.argv) }));
    run.markers = markers;
    run.print = parsed.filter((c) => c.args.print);
    // Calls without -p, apart from `claude --version` and `claude --help`.
    run.stray = parsed.filter((c) => !c.args.print && !c.args.flags.version && !c.args.flags.help);
    runs.set(key, run);
  }
  return runs.get(key);
}

function pending(repo, script) {
  try {
    repo.git('diff', '--quiet', 'HEAD', '--', script);
    return '';
  } catch {
    return ` В вашей копии ${code(script)} есть незакоммиченные изменения: если они это исправляют, закоммитьте их.`;
  }
}

// A run's exit code, or the signal that ended it.
const exitOf = (run) => run.status ?? run.signal;

const timedOut = `всё ещё работал через ${TIME_LIMIT / 1000} с, поэтому проверка его остановила`;

// How a run ended, for a hint.
function ended(run) {
  if (run.timedOut) return `Скрипт ${timedOut}.`;
  if (missingJq(run)) return JQ;
  const tail = stderrTail(run);
  return `Он завершился с кодом ${exitOf(run)}${tail ? `: ${tail}` : '.'}`;
}

// The turn cap the script passes, or CAP_MAX when the check can't tell.
function capOf(repo, script) {
  const value = scenario(repo, script, 'review').print?.[0]?.args.flags.maxTurns;
  return /^\d+$/.test(value ?? '') && Number(value) >= 1 ? Number(value) : CAP_MAX;
}

const squash = (flag) => flag.split('=')[0].replace(/^-+/, '').replace(/[-_]/g, '').toLowerCase();

// What's wrong with the arguments of one `claude -p` call, as sentences;
// none when nothing is.
export function callHints(argv) {
  const args = parseClaudeArgs(argv);
  const problems = [];
  // An option Claude Code doesn't know, written like one the call needs.
  const spelling = (flag) => {
    const typo = args.unknown.find((u) => squash(u) === squash(flag));
    return typo ? ` Claude Code не знает ${code(typo.split('=')[0])}, поэтому останавливается с ошибкой до начала запуска: напишите ${code(flag)}.` : '';
  };
  const example = 'как в `claude -p "<prompt>" --output-format json ...`';
  if (!args.promptFirst) {
    problems.push(args.next === undefined
      ? `После \`-p\` ничего нет. Напишите промпт сразу после него, ${example}.`
      : `Сразу после \`-p\` идёт ${code(args.next)}. Напишите промпт сразу после \`-p\`, ${example}.`);
  } else if (!args.prompt.trim()) {
    problems.push('Промпт после `-p` пуст. Напишите там, что Claude должен сделать с диффом.');
  }

  const { outputFormat, permissionMode, allowedTools, maxTurns, dangerouslySkipPermissions } = args.flags;
  if (outputFormat === undefined) problems.push(`Он не просит JSON: добавьте \`--output-format json\`.${spelling('--output-format')}`);
  else if (outputFormat === null) problems.push('После `--output-format` нет формата: напишите `--output-format json`.');
  else if (outputFormat !== 'json') problems.push(`Он просит \`--output-format ${outputFormat}\`: используйте \`json\`, чтобы скрипт мог сохранить результат и прочитать его.`);

  if (permissionMode === undefined) problems.push(`Режим разрешений не задан: добавьте \`--permission-mode dontAsk\`, чтобы каждый вызов, требующий разрешения, отклонялся.${spelling('--permission-mode')}`);
  else if (permissionMode === null) problems.push('После `--permission-mode` нет режима: напишите `--permission-mode dontAsk`.');
  else if (permissionMode.toLowerCase() === 'dontask' && permissionMode !== 'dontAsk') problems.push(`Пишите \`dontAsk\` так, как его пишет Claude Code, а не ${code(permissionMode)}.`);
  else if (permissionMode !== 'dontAsk') problems.push(`Он работает в режиме ${code(permissionMode)}: используйте \`--permission-mode dontAsk\`, чтобы каждый вызов, требующий разрешения, отклонялся.`);
  if (dangerouslySkipPermissions) problems.push('Уберите `--dangerously-skip-permissions`: это то же самое, что `--permission-mode bypassPermissions`.');

  // A value with a word that can't be a tool name, such as a prompt written
  // after the list, is reported by that word alone.
  const values = allowedTools ?? [];
  const words = values.flatMap((v) => ruleList([v]).filter((e) => !TOOL_NAME.test(e)));
  const entries = ruleList(values.filter((v) => ruleList([v]).every((e) => TOOL_NAME.test(e))));
  const others = [...new Set(entries.filter((e) => !READ_ONLY.test(e)))];
  if (allowedTools === undefined) problems.push(`Ни один инструмент не одобрен заранее: добавьте \`--allowedTools "Read,Grep,Glob"\`.${spelling('--allowedTools')}`);
  else if (!ruleList(values).length) problems.push('В `--allowedTools` нет ни одного инструмента: напишите `--allowedTools "Read,Grep,Glob"`.');
  if (words.length) {
    const [word] = words;
    problems.push(/^(read|grep|glob)$/i.test(word)
      ? `Пишите ${code(word[0].toUpperCase() + word.slice(1).toLowerCase())} так, как Claude Code пишет имя инструмента, а не ${code(word)}.`
      : `${code(word)} — не инструмент только для чтения: после \`--allowedTools\` перечислите только \`Read\`, \`Grep\` и \`Glob\`, а промпт напишите сразу после \`-p\`.`);
  }
  if (others.length) {
    const shown = others.slice(0, 3).map(code);
    problems.push(`В \`--allowedTools\` указано: ${and(shown)}${others.length > 3 ? ` и ещё ${others.length - 3}` : ''} — ${others.length > 1 ? 'это не' : 'это не'} \`Read\`, \`Grep\` или \`Glob\`. Claude получает дифф через stdin, поэтому перечислите только эти три.`);
  }

  if (maxTurns === undefined) problems.push(`Лимит ходов не задан: добавьте \`--max-turns\` с числом от 1 до ${CAP_MAX}.${spelling('--max-turns')}`);
  else if (maxTurns === null) problems.push(`После \`--max-turns\` нет числа: напишите число от 1 до ${CAP_MAX}.`);
  else if (!/^\d+$/.test(maxTurns)) problems.push(`\`--max-turns ${maxTurns}\` — не целое число: используйте число от 1 до ${CAP_MAX}.`);
  else if (Number(maxTurns) < 1 || Number(maxTurns) > CAP_MAX) problems.push(`\`--max-turns ${maxTurns}\` ${Number(maxTurns) < 1 ? 'меньше 1' : `больше ${CAP_MAX}`}: используйте число от 1 до ${CAP_MAX}.`);
  return problems;
}

// `guide` is where the page describes the script.
export function committedScript(script, guide = 'разделе «Ваша очередь» урока') {
  return {
    text: `${code(script)} закоммичен и исполняемый`,
    check(repo) {
      const mode = committedMode(repo, script);
      if (mode === null) return repo.exists(script) ? `${code(script)} не закоммичен. Выполните \`git add ${script}\` и закоммитьте его.` : `Нет файла ${code(script)}. Напишите его по описанию в ${guide}, затем закоммитьте.`;
      if (mode === '100755') return true;
      if (mode === '100644') return `${code(script)} не исполняемый. Выполните \`chmod +x ${script}\`, затем \`git add ${script}\` и закоммитьте. В Windows выполните \`git update-index --chmod=+x ${script}\` и закоммитьте.`;
      return `${code(script)} закоммичен как ${mode === '120000' ? 'символическая ссылка' : 'не файл'}. Закоммитьте сам файл скрипта и сделайте его исполняемым.`;
    },
  };
}

export function scriptCall(script) {
  return {
    text: `его вызов \`claude -p\` просит JSON, работает в режиме \`dontAsk\`, заранее одобряет только \`Read\`, \`Grep\` и \`Glob\`, ограничивает ходы числом не больше ${CAP_MAX} и имеет промпт сразу после \`-p\``,
    check(repo) {
      const run = scenario(repo, script, 'review');
      const skipped = notRun(run, script);
      if (skipped) return skipped;
      if (!run.print.length) {
        const why = run.stray.length
          ? `запустил \`claude\` без \`-p\` (или \`--print\`), а это открывает интерактивную сессию. Добавьте \`-p\` и промпт сразу после него.`
          : `ни разу не запустил \`claude -p\`, поэтому проверка не увидела его флаги. ${ended(run)}`;
        return `При проиндексированном изменении ${code(script)} ${why}${pending(repo, script)}`;
      }
      const problems = [...new Set(run.print.flatMap((c) => callHints(c.argv)))];
      return problems.length ? `${problems.join(' ')}${pending(repo, script)}` : true;
    },
  };
}

const isStubJson = (text) => {
  try {
    return JSON.parse(text)?.session_id === STUB_SESSION;
  } catch {
    return false;
  }
};

// The review of a staged change, in a run that finished: one call, the staged
// diff on its stdin and nothing else, exit 0, the review printed and the JSON
// saved where the first argument says.
function reviewProblems(run, fallback) {
  const m = run.markers;
  if (!run.print.length) return [`При проиндексированном изменении скрипт ни разу не запустил \`claude -p\`. ${ended(run)}`];
  const problems = [];
  if (run.print.length > 1) problems.push(`При одном проиндексированном изменении он запустил \`claude -p\` ${run.print.length} раз. Запускайте его один раз, подав весь проиндексированный дифф в stdin.`);
  if (run.stray.length) problems.push('Он также запустил `claude` без `-p`, а это открывает интерактивную сессию. Оставьте только вызов `claude -p`.');
  const [call] = run.print;
  if (!call.stdin.includes(m.staged)) {
    problems.push(call.argv.some((a) => a.includes(m.staged))
      ? 'Он кладёт дифф в промпт. Подайте его через конвейер: `git diff --cached | claude -p "<prompt>" ...`.'
      : 'То, что он подал в `claude -p`, не содержит проиндексированного изменения. Подайте проиндексированный дифф: `git diff --cached | claude -p "<prompt>" ...`.');
  } else if (call.stdin.includes(m.unstaged)) {
    problems.push('Дифф, поданный в `claude -p`, содержит и непроиндексированное изменение. Подайте `git diff --cached`: в нём только проиндексированное.');
  }
  if (run.status !== 0) problems.push(`При проиндексированном изменении и успешном запуске он завершился с кодом ${exitOf(run)}${stderrTail(run) ? ` (${stderrTail(run)})` : ''}. Завершайтесь с кодом 0, когда рецензия удалась.`);
  if (!run.stdout.includes(m.review)) problems.push('Он не вывел рецензию. Выведите поле `result` из JSON, как это делает `jq -r \'.result\'`.');
  const saved = run.saved[`out/${OUT}`];
  const save = `Сохраняйте вывод \`claude -p\` по пути из первого аргумента, а без аргумента — в ${code(fallback)}: \`out="\${1:-${fallback}}"\`, затем \`> "$out"\`.`;
  if (saved === undefined) problems.push(run.saved[fallback] !== undefined ? `Он сохранил JSON в ${code(fallback)}, хотя первый аргумент указывал другой путь. ${save}` : `Он не сохранил JSON по пути из первого аргумента. ${save}`);
  else if (!isStubJson(saved)) problems.push('Файл по пути из первого аргумента — не тот JSON, который вывел `claude -p`. Сохраняйте этот вывод без изменений.');
  return problems;
}

function defaultProblems(run, fallback) {
  if (run.timedOut) return [`Запущенный без аргумента, он ${timedOut}.`];
  const saved = run.saved[fallback];
  if (saved === undefined) {
    const folder = posix.dirname(fallback);
    if (run.stderr.includes(fallback) && /No such file or directory/.test(run.stderr)) return [`Запущенный без аргумента в свежей копии, где ${code(`${folder}/`)} ещё нет, он не смог записать ${code(fallback)}. Сначала создайте папку, как это делает \`mkdir -p "$(dirname "$out")"\`.`];
    const how = run.status !== 0 ? ` (он завершился с кодом ${exitOf(run)}${stderrTail(run) ? `: ${stderrTail(run)}` : ''})` : '';
    return [`Запущенный без аргумента, он не сохранил JSON в ${code(fallback)}${how}. Используйте этот путь, когда аргумента нет: \`out="\${1:-${fallback}}"\`.`];
  }
  return isStubJson(saved) ? [] : [`Запущенный без аргумента, он сохранил в ${code(fallback)} не тот JSON, который вывел \`claude -p\`.`];
}

function failureProblems(failed, isError) {
  const problems = [];
  if (failed.timedOut) problems.push(`Когда \`claude -p\` завершается с ненулевым кодом, он ${timedOut}. Завершайтесь с ненулевым кодом тоже, не ожидая и не повторяя.`);
  else if (failed.status === 0) problems.push('Когда `claude -p` завершается с ненулевым кодом и не выводит JSON, как при нечитаемом флаге, скрипт завершился с кодом 0. Завершайтесь с ненулевым кодом всегда, когда так делает `claude -p`.');
  if (isError.timedOut) problems.push(`Когда в JSON \`"is_error": true\`, он ${timedOut}.`);
  else if (isError.status === 0) problems.push('Когда в JSON `"is_error": true`, а `claude -p` завершается с кодом 0, скрипт завершился с кодом 0. Завершайтесь с ненулевым кодом всегда, когда `is_error` равен `true`: проверяйте `jq -r \'.is_error\'`.');
  return problems;
}

function emptyProblems(run) {
  if (run.timedOut) return [`Когда ничего не проиндексировано, он ${timedOut}.`];
  const problems = [];
  if (run.print.length) problems.push('Когда ничего не проиндексировано, он всё равно запустил `claude -p`. Сначала проверьте наличие проиндексированного изменения, как это делает `git diff --cached --quiet`, и остановитесь до вызова Claude.');
  if (run.status === 0) problems.push('Когда ничего не проиндексировано, он завершился с кодом 0. Завершайтесь с ненулевым кодом, чтобы тот, кто его запускает, понял, что рецензии не было.');
  if (!`${run.stdout}${run.stderr}`.trim()) problems.push('Когда ничего не проиндексировано, он ничего не вывел. Сообщите, что ничего не проиндексировано.');
  return problems;
}

// `fallback` is where the script saves the JSON without an argument: the
// lesson's path, which the capstone's script keeps.
export function scriptBehavior(script, fallback = RESULT) {
  return {
    text: 'он подаёт проиндексированный дифф через конвейер, сохраняет JSON по пути из аргумента, выводит результат, завершается с ненулевым кодом при сбое запуска и не вызывает Claude, когда ничего не проиндексировано',
    check(repo) {
      const review = scenario(repo, script, 'review');
      const skipped = notRun(review, script);
      if (skipped) return skipped;
      if (missingJq(review)) return JQ;
      // A script that hangs on a staged change would hang in every run.
      if (review.timedOut) return `При проиндексированном изменении ${code(script)} ${timedOut}.${pending(repo, script)}`;
      const [noArgument, failed, isError, nothingStaged] = ['noArgument', 'failed', 'isError', 'nothingStaged'].map((n) => scenario(repo, script, n));
      if ([noArgument, failed, isError, nothingStaged].some(missingJq)) return JQ;
      const problems = [...reviewProblems(review, fallback), ...defaultProblems(noArgument, fallback), ...failureProblems(failed, isError), ...emptyProblems(nothingStaged)];
      if (!problems.length) return true;
      const more = problems.length > 3 ? ` И ещё ${problems.length - 3}: исправьте эти и запустите проверку снова.` : '';
      return `${problems.slice(0, 3).join(' ')}${more}${pending(repo, script)}`;
    },
  };
}

// A real run the Learner saved. Its turn count may be one above the cap:
// the cap counts only the turns that use tools, and `num_turns` counts the
// final answer too (How the agent loop works). The lesson's dry-run confirms
// the bound.
export function savedRun(result, script) {
  const run = `проиндексируйте изменение и выполните \`${script}${result === RESULT ? '' : ` ${result}`}\``;
  const again = `Затем снова: ${run}.`;
  return {
    text: `${code(result)} содержит успешный запуск в пределах вашего лимита`,
    local: true,
    check(repo) {
      const text = repo.read(result);
      if (text === null || !text.trim()) return `Файла ${code(result)} ещё нет: ${run}, это сохранит туда JSON.`;
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        return `${code(result)} — не JSON. Сохраните туда вывод \`claude -p --output-format json\` без изменений. ${again}`;
      }
      if (value?.type !== 'result') return `${code(result)} — не результат запуска \`claude -p\` с \`--output-format json\`. ${again}`;
      if (value.session_id === STUB_SESSION) return `В ${code(result)} лежит подставной ответ проверки, а не настоящий запуск: ваш скрипт сохранил его туда, пока проверка его запускала. Сохраняйте JSON только по пути из первого аргумента скрипта. ${again}`;
      if (value.subtype !== 'success') return `Запуск в ${code(result)} остановился раньше времени (${code(String(value.subtype))}) и не содержит рецензии.${value.subtype === 'error_max_turns' ? ` Поднимите лимит (до ${CAP_MAX}) или сузьте промпт.` : ''} ${again}`;
      if (value.is_error !== false) return `Запуск в ${code(result)} завершился сбоем${typeof value.result === 'string' && value.result.trim() ? `: «${quoted(value.result)}»` : ''}. Исправьте то, о чём там сказано. ${again}`;
      if (typeof value.result !== 'string' || !value.result.trim()) return `В запуске в ${code(result)} нет рецензии в \`result\`. ${again}`;
      if (typeof value.session_id !== 'string' || !value.session_id) return `В запуске в ${code(result)} нет \`session_id\`, значит, это не тот JSON, который сохраняет \`claude -p\`. ${again}`;
      const cap = capOf(repo, script);
      if (!Number.isInteger(value.num_turns) || value.num_turns < 1) return `В запуске в ${code(result)} нет числа ходов в \`num_turns\`, значит, это не тот JSON, который сохраняет \`claude -p\`. ${again}`;
      if (value.num_turns > cap + 1) return `Запуск в ${code(result)} занял ${value.num_turns} ходов, больше, чем допускает \`--max-turns ${cap}\`, значит, он шёл с более высоким лимитом. ${again}`;
      return true;
    },
  };
}

export const items = [committedScript(SCRIPT), scriptCall(SCRIPT), scriptBehavior(SCRIPT), savedRun(RESULT, SCRIPT)];
