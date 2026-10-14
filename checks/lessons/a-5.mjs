// GitHub Actions (Advanced, lesson 5). In a copy of the template made for this
// lesson, the Learner commits a workflow they start by hand, in which a pinned
// anthropics/claude-code-action runs Claude in automation mode, with its
// credential from a repository secret and its limits in the file; runs it
// once; saves the `gh run list` JSON under .practice/; and then tears the
// workflow down. The workflow items read the history, newest first, so they
// pass before and after the teardown, and a later workflow on other events
// never stands in for this one. That Claude answered the @claude issue and
// explained each broken link shows only on GitHub, so the lesson self-checks
// it. The Advanced capstone reuses the workflow items, as one item, with its
// own events.
import { claudeArgWords, claudeHistory, claudeWorkflowsAt, headBlob, uncommittedWorkflows } from '../actions.mjs';
import { ruleList } from '../claude-args.mjs';

export const title = 'GitHub Actions';

export const WORKFLOW = '.github/workflows/linkcheck-report.yml';
export const RUNS = '.practice/a-5-runs.json';
export const TURNS_MAX = 10;
export const TIMEOUT_MAX = 30;

// What the lesson's workflow starts on, its file, where the page says what to
// write, and two things the hints say about the setup: where the credential's
// secret came from, and what the action does without `github_token`. The
// lesson's copy is set up with quick setup, which installs the Claude GitHub
// App.
const LESSON = {
  triggers: ['workflow_dispatch'],
  file: WORKFLOW,
  guide: 'разделе «Ваша очередь»',
  secret: 'секрет, который сохранила быстрая настройка (quick setup)',
  noToken: 'Claude действует как приложение Claude GitHub App, которое может писать в репозиторий',
};

const RUN_FIELDS = 'databaseId,status,conclusion,event,headSha,url,workflowName';
const CREDENTIALS = ['anthropic_api_key', 'claude_code_oauth_token'];
// A Claude API key or OAuth token written out.
const KEY = /sk-ant-[A-Za-z0-9_-]{20,}/;
const PINNED = /^(?:v\d+\.\d+\.\d+|[0-9a-f]{40})$/i;
const SECRET = /^\$\{\{\s*secrets(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\s*(['"])[A-Za-z_][A-Za-z0-9_]*\1\s*\])\s*\}\}$/;
const JOB_TOKEN = /^\$\{\{\s*(?:github\.token|secrets\.GITHUB_TOKEN)\s*\}\}$/;
// The events of an @claude conversation, which quick setup's claude.yml runs on.
const CONVERSATION = new Set(['issues', 'issue_comment', 'pull_request_review', 'pull_request_review_comment']);
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const RUN_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/\d+/i;
const GITHUB_REMOTE = /^(?:(?:https?|ssh|git):\/\/)?(?:[^@/]+@)?(?:www\.)?github\.com(?::\d+)?[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

const and = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : list[0]);
const or = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} или ${list.at(-1)}` : list[0]);
const code = (text) => `\`${text}\``;
const short = (sha) => sha.slice(0, 7);
const onPhrase = (triggers) => (triggers.length === 1 ? code(`on: ${triggers[0]}`) : `\`on:\` с ${or(triggers.map(code))}`);
const startsOn = (triggers) => `который запускается по ${or(triggers.map(code))}`;
const squash = (flag) => flag.split('=')[0].replace(/^-+/, '').replace(/[-_]/g, '').toLowerCase();

// The ways to write a Bash rule that matches every command.
function anyBash(entry) {
  if (entry === 'Bash') return true;
  const m = entry.match(/^Bash\((.*)\)$/s);
  return Boolean(m && /^\*+$/.test(m[1].replace(/[\s:]/g, '')));
}

// What item 1 reads: the pin, automation mode, the credential and the events.
function setupProblems(file, step, o) {
  const problems = [];
  const leaked = file.text.split('\n').findIndex((line) => KEY.test(line));
  if (leaked !== -1) problems.push(`Строка ${leaked + 1} похожа на ключ или токен Claude API. Считайте его утёкшим: удалите ключ в Claude Console прямо сейчас, ведь удаление из файла не убирает его из истории. Храните учётные данные только в секрете репозитория.`);
  if (!step.ref) problems.push(`Строка ${step.line} запускает \`anthropics/claude-code-action\` без версии. Закрепите тег релиза (\`@vX.Y.Z\`) или полный SHA коммита этого релиза.`);
  else if (/^[0-9a-f]{7,39}$/i.test(step.ref)) problems.push(`\`@${step.ref}\` в строке ${step.line} — короткий SHA коммита. Напишите полный SHA из 40 символов.`);
  else if (!PINNED.test(step.ref)) problems.push(`\`@${step.ref}\` в строке ${step.line} может перейти на новый релиз, и версия Claude Code на раннере изменится без вашего коммита. Закрепите тег релиза (\`@vX.Y.Z\`) или полный SHA коммита этого релиза.`);

  const { prompt } = step.inputs;
  if (!prompt) problems.push(`У шага в строке ${step.line} нет \`prompt\`, поэтому Claude ждёт \`@claude\` в issue или pull request (интерактивный режим). Добавьте \`prompt\` под \`with:\` с описанием того, что должен сделать Claude, чтобы он запускался сразу при старте workflow (режим автоматизации).`);
  else if (!prompt.text?.trim()) problems.push(`\`prompt\` в строке ${prompt.line} пуст. Напишите там, что должен сделать Claude.`);

  const given = CREDENTIALS.filter((k) => step.inputs[k]);
  if (!given.length) problems.push(`Шаг в строке ${step.line} не передаёт учётные данные. Добавьте \`anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}\` под \`with:\` или \`claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\` для токена подписки, указав ${o.secret}.`);
  for (const k of given) {
    const v = step.inputs[k];
    const text = (v.text ?? '').trim();
    if (!SECRET.test(text) && !KEY.test(text)) problems.push(`\`${k}\` в строке ${v.line} не берётся из секрета. Напишите \`${k}: \${{ secrets.<NAME> }}\`, указав ${o.secret}, а сами учётные данные в файле не храните.`);
  }
  if (step.triggers.includes('pull_request_target')) problems.push('Уберите `pull_request_target` из `on:`. GitHub предупреждает, что запуск недоверенного кода по этому событию может случайно дать доступ на запись или к секретам.');
  return problems;
}

// The flags in `claude_args` that set the turn limit and the tools.
function argProblems(args) {
  const { words, comment } = claudeArgWords(args.text);
  const problems = [];
  // Flags after an unquoted `#`, which the action never reads.
  const hidden = ['--max-turns', '--allowedTools', '--allowed-tools'].filter((f) => comment && new RegExp(`(^|\\s)${f}(=|\\s|$)`).test(comment));
  if (hidden.length) problems.push(`Незакавыченный \`#\` в \`claude_args\` начинает комментарий, который для action тянется до конца значения, поэтому ${and(hidden.map(code))} он не читает. Перенесите этот комментарий на отдельную строку выше \`claude_args\`.`);
  const spelling = (flags) => {
    const typo = words.find((w) => w.startsWith('--') && !flags.includes(w.split('=')[0]) && flags.some((f) => squash(w) === squash(f)));
    return typo ? ` Claude Code не знает ${code(typo.split('=')[0])}: напишите ${code(flags[0])}.` : '';
  };

  // The action reads a flag's value from the word after it, so it takes the
  // turn limit itself only from `--max-turns 5`; the page asks for that form.
  let turns;
  let joined = null;
  for (let i = 0; i < words.length; i += 1) {
    if (words[i] === '--max-turns') turns = words[i + 1] !== undefined && !words[i + 1].startsWith('--') ? words[i + 1] : null;
    else if (words[i].startsWith('--max-turns=')) joined = words[i];
  }
  const range = `число от 1 до ${TURNS_MAX}`;
  const fits = (n) => /^\d+$/.test(n ?? '') && Number(n) >= 1 && Number(n) <= TURNS_MAX;
  if (joined) {
    const n = joined.slice('--max-turns='.length);
    problems.push(`Напишите ${fits(n) ? `\`--max-turns ${n}\` через пробел` : `\`--max-turns\` через пробел и ${range}`}, а не ${code(joined)}: action читает значение флага из следующего слова.`);
  }
  else if (turns === undefined) {
    if (!hidden.includes('--max-turns')) problems.push(`В \`claude_args\` не задан лимит ходов: добавьте \`--max-turns\` и ${range}.${spelling(['--max-turns'])}`);
  }
  else if (turns === null) problems.push(`После \`--max-turns\` нет числа: напишите ${range}.`);
  else if (!/^\d+$/.test(turns)) problems.push(`\`--max-turns ${turns}\` — не целое число: используйте ${range}.`);
  else if (Number(turns) < 1 || Number(turns) > TURNS_MAX) problems.push(`\`--max-turns ${turns}\` ${Number(turns) < 1 ? 'меньше 1' : `больше ${TURNS_MAX}`}: используйте ${range}.`);

  // Every word after `--allowedTools` up to the next option is a value.
  const values = [];
  let named = false;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === '--allowedTools' || w === '--allowed-tools') {
      named = true;
      while (i + 1 < words.length && !words[i + 1].startsWith('--')) values.push(words[(i += 1)]);
    } else if (/^--(allowedTools|allowed-tools)=/.test(w)) {
      named = true;
      values.push(w.slice(w.indexOf('=') + 1));
    }
  }
  const example = 'как в `--allowedTools "Bash(<command> *)"`';
  if (!named) {
    if (!hidden.some((f) => f !== '--max-turns')) problems.push(`В \`claude_args\` ни один инструмент не одобрен заранее: добавьте \`--allowedTools\`, указав только ту команду, которая нужна Claude, ${example}.${spelling(['--allowedTools', '--allowed-tools'])}`);
    return problems;
  }
  const entries = ruleList(values);
  const count = (text, ch) => text.split(ch).length - 1;
  if (!entries.length) problems.push(`В \`--allowedTools\` нет ни одного инструмента: укажите только ту команду, которая нужна Claude, ${example}.`);
  else if (entries.some((e) => count(e, '(') !== count(e, ')'))) {
    problems.push(`\`--allowedTools\` получает ${and(values.slice(0, 4).map(code))}${values.length > 4 ? ' и другие' : ''} отдельными словами, потому что action делит \`claude_args\` по пробелам вне кавычек. Возьмите каждое правило в кавычки, как в \`--allowedTools "${values.join(' ')}"\`.`);
  }
  const broad = entries.find(anyBash);
  if (broad) problems.push(`В \`--allowedTools\` указано ${code(broad)}, что позволяет Claude запускать любую команду. Назовите только нужную команду, как в \`Bash(<command> *)\`.`);
  return problems;
}

// What item 2 reads: the turn and tool limits, the time limit and the token.
function limitProblems(file, step, o) {
  const problems = [];
  const args = step.inputs.claude_args;
  if (!args?.text?.trim()) problems.push(`У шага в строке ${step.line} нет \`claude_args\`, поэтому запуск ничем не ограничен. Добавьте \`claude_args\` с \`--max-turns\` и числом от 1 до ${TURNS_MAX}, а также \`--allowedTools\` только с той командой, которая нужна Claude, как в \`--allowedTools "Bash(<command> *)"\`.`);
  else problems.push(...argProblems(args));

  const range = `число от 1 до ${TIMEOUT_MAX}`;
  const timeouts = [step.stepTimeout, step.jobTimeout].filter(Boolean);
  if (!timeouts.length) problems.push(`У задания \`${step.job}\` не задан \`timeout-minutes\`, поэтому зависший запуск остановит только лимит GitHub по умолчанию. Добавьте заданию \`timeout-minutes\` и ${range}.`);
  for (const t of timeouts) {
    const v = (t.text ?? '').trim();
    if (!/^\d+$/.test(v)) problems.push(`\`timeout-minutes: ${v}\` в строке ${t.line} — не целое число: напишите ${range}.`);
    else if (Number(v) < 1 || Number(v) > TIMEOUT_MAX) problems.push(`\`timeout-minutes: ${v}\` on line ${t.line} is ${Number(v) < 1 ? 'below 1' : `above ${TIMEOUT_MAX}`}: use ${range}.`);
  }

  // The job's own permissions replace the workflow's. `id-token: write` lets
  // the job ask for an OIDC token, which the action uses to sign in; it gives
  // no write access to the repository.
  const p = step.permissions;
  if (!p) problems.push(`Ни у workflow, ни у задания \`${step.job}\` не задан \`permissions\`, поэтому токен задания получает доступ репозитория по умолчанию, а он может включать запись. Добавьте \`permissions:\` с \`contents: read\`.`);
  else if (p.all === 'write-all') problems.push(`\`permissions: write-all\` в строке ${p.line} даёт токену задания право записи на всё. Используйте \`contents: read\`.`);
  else {
    const writes = (p.scopes ?? []).filter((s) => s.level === 'write' && s.scope !== 'id-token');
    if (writes.length) {
      const named = writes.map((s) => code(`${s.scope}: write`));
      const lines = writes.map((s) => s.line);
      problems.push(`${and(named)} в ${lines.length > 1 ? 'строках' : 'строке'} ${and(lines.map(String))} ${writes.length > 1 ? 'дают' : 'даёт'} токену задания право записи, а это задание только читает. Сделайте ${writes.length > 1 ? 'их' : 'это'} \`read\` или удалите.`);
    }
  }

  const token = step.inputs.github_token;
  if (!token) problems.push(`Шаг в строке ${step.line} не передаёт \`github_token\`, поэтому ${o.noToken}. Добавьте \`github_token: \${{ github.token }}\` под \`with:\`, чтобы Claude использовал токен этого задания и заданные вами \`permissions\`.`);
  else if (!JOB_TOKEN.test((token.text ?? '').trim())) problems.push(`\`github_token\` в строке ${token.line} — не собственный токен этого задания, поэтому \`permissions\` задания его не ограничивают. Напишите \`github_token: \${{ github.token }}\`.`);
  return problems;
}

// Each repository's chosen workflow, by the events it may start on.
const chosen = new WeakMap();

// The workflow step the items evaluate: in the newest commit that holds a
// step on one of `triggers`, the one with a `prompt` and the fewest problems.
// `options` gives the hints' wording, as the items' options do. Returns
// `{ file, step, setup, limits }`, or null.
export function chosenWorkflow(repo, triggers, options = LESSON) {
  const o = { ...LESSON, ...options };
  if (!chosen.has(repo)) chosen.set(repo, new Map());
  const byTriggers = chosen.get(repo);
  const key = [...triggers, o.secret, o.noToken].join('\0');
  if (!byTriggers.has(key)) {
    let found = null;
    for (const { files } of claudeHistory(repo)) {
      const steps = files.flatMap((file) => file.steps
        .filter((step) => step.triggers.some((t) => triggers.includes(t)))
        .map((step) => ({ file, step, setup: setupProblems(file, step, o), limits: limitProblems(file, step, o) })));
      if (!steps.length) continue;
      const rank = (c) => [c.step.inputs.prompt?.text?.trim() ? 0 : 1, c.setup.length + c.limits.length];
      [found] = steps.sort((a, b) => {
        const [x, y] = [rank(a), rank(b)];
        return x[0] - y[0] || x[1] - y[1];
      });
      break;
    }
    byTriggers.set(key, found);
  }
  return byTriggers.get(key);
}

function changed(repo, path) {
  try {
    repo.git('diff', '--quiet', 'HEAD', '--', path);
    return false;
  } catch {
    return true;
  }
}

function report(repo, { file }, problems) {
  const inHead = headBlob(repo, file.path) === file.blob;
  const where = inHead ? code(file.path) : `${code(file.path)} (как в коммите ${short(file.commit)})`;
  const more = problems.length > 3 ? ` И ещё ${problems.length - 3}: исправьте эти и запустите проверку снова.` : '';
  const pending = inHead && changed(repo, file.path) ? ` В вашей копии ${code(file.path)} есть незакоммиченные изменения: если они это исправляют, закоммитьте их.` : '';
  return `${where}: ${problems.slice(0, 3).join(' ')}${more}${pending}`;
}

// Why no committed workflow step starts on one of `triggers`.
function missingHint(repo, { triggers, file, guide }) {
  const byHand = triggers.includes('workflow_dispatch') ? ' GitHub запускает workflow вручную, только когда его файл лежит в ветке по умолчанию.' : '';
  const [loose] = uncommittedWorkflows(repo);
  if (loose) {
    return loose.tracked
      ? `Ваша копия ${code(loose.path)} запускает \`anthropics/claude-code-action\`, но это изменение не закоммичено. Закоммитьте его и отправьте (push).${byHand}`
      : `${code(loose.path)} не закоммичен. Выполните \`git add ${loose.path}\`, закоммитьте его и отправьте (push).${byHand}`;
  }
  const seen = new Map();
  for (const { files } of claudeHistory(repo)) for (const f of files) if (!seen.has(f.path)) seen.set(f.path, f);
  const files = [...seen.values()];
  const prompted = files.find((f) => f.steps.some((s) => s.inputs.prompt?.text?.trim()));
  if (prompted) {
    const events = prompted.steps[0].triggers;
    return `${code(prompted.path)} запускает Claude с \`prompt\`, но ${events.length ? `стартует по ${and(events.map(code))}` : 'в нём нет событий `on:`, которые проверка может прочитать'}. Запускайте его по ${onPhrase(triggers)}, затем закоммитьте и отправьте (push).${byHand}`;
  }
  if (files.length) return `В ${code(files[0].path)} нет \`prompt\`, поэтому он ждёт \`@claude\` (интерактивный режим). Нужен второй workflow, ${code(file)}, который стартует по ${onPhrase(triggers)} и имеет \`prompt\`. Напишите его по описанию в ${guide}, затем закоммитьте и отправьте (push).${byHand}`;
  return `Нет закоммиченного workflow, который запускает \`anthropics/claude-code-action\`. Напишите ${code(file)} по описанию в ${guide}, затем закоммитьте и отправьте (push).${byHand}`;
}

// The workflow items. Options: `triggers`, the events the workflow may start
// on, which pick it out of the history; `file`, the path a hint suggests;
// `guide`, where the page describes it; `secret` and `noToken`, as in LESSON.
export function pinnedWorkflow(options = LESSON) {
  const o = { ...LESSON, ...options };
  return {
    text: 'закоммиченный workflow запускает `anthropics/claude-code-action`, закреплённый на релизе или SHA коммита, в режиме автоматизации, с учётными данными из секрета и без них в файле',
    check(repo) {
      const c = chosenWorkflow(repo, o.triggers, o);
      if (!c) return missingHint(repo, o);
      return c.setup.length ? report(repo, c, c.setup) : true;
    },
  };
}

export function workflowLimits(options = LESSON) {
  const o = { ...LESSON, ...options };
  return {
    text: `его ограничения заданы в файле: \`--max-turns\` не больше ${TURNS_MAX}, список \`--allowedTools\` без неограниченного \`Bash\`, токен задания только для чтения и \`timeout-minutes\``,
    check(repo) {
      const c = chosenWorkflow(repo, o.triggers, o);
      if (!c) return `Нет закоммиченного workflow, ${startsOn(o.triggers)} и запускающего \`anthropics/claude-code-action\`, поэтому проверка не может прочитать его ограничения. Закоммитьте его, как сказано в пункте выше.`;
      return c.limits.length ? report(repo, c, c.limits) : true;
    },
  };
}

// Both workflow items as one, as the Advanced capstone checks its review
// workflow: what each finds wrong, in one report on the file it read.
export function boundedWorkflow(options = LESSON) {
  const o = { ...LESSON, ...options };
  return {
    text: `закоммиченный workflow запускает \`anthropics/claude-code-action\` по ${or(o.triggers.map(code))}, закреплённый на релизе или SHA коммита, в режиме автоматизации, с учётными данными из секрета и без них в файле, токеном задания только для чтения, \`--max-turns\` не больше ${TURNS_MAX}, списком \`--allowedTools\` без неограниченного \`Bash\` и \`timeout-minutes\` не больше ${TIMEOUT_MAX}`,
    check(repo) {
      const c = chosenWorkflow(repo, o.triggers, o);
      if (!c) return missingHint(repo, o);
      const problems = [...c.setup, ...c.limits];
      return problems.length ? report(repo, c, problems) : true;
    },
  };
}

// `owner/repo` of a github.com `origin`, or null.
function originRepo(repo) {
  try {
    const m = repo.git('remote', 'get-url', 'origin').match(GITHUB_REMOTE);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

function isCommit(repo, sha) {
  try {
    repo.gitLocal('cat-file', '-e', `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// A saved run of the workflow: `record` holds `gh run list --json` output
// (or one run from `gh run view --json`), and `file` is the workflow the
// hints name.
export function dispatchedRun(record = RUNS, file = WORKFLOW) {
  const name = file.split('/').pop();
  const save = `\`gh run list --workflow ${name} --json ${RUN_FIELDS} > ${record}\``;
  const start = `\`gh workflow run ${name}\``;
  const again = `затем сохраните список заново: ${save}`;

  // How far one run gets: 0, not started by hand; 1, another repository;
  // 2, not finished; 3, not successful; 4, an unknown commit; 5, a commit
  // without the workflow; 6, passed.
  function review(repo, run, origin) {
    const id = /^\d+$/.test(String(run.databaseId ?? '')) ? String(run.databaseId) : '<run-id>';
    const which = id === '<run-id>' ? 'Запуск' : `Запуск ${id}`;
    if (run.event !== 'workflow_dispatch') return { stage: 0 };
    if (origin) {
      const m = typeof run.url === 'string' ? run.url.match(RUN_URL) : null;
      if (!m) return { stage: 1, hint: `У запуска в ${code(record)} нет URL запуска GitHub, поэтому проверка не знает, в каком репозитории он шёл. Сохраните список вместе с \`url\`: ${save}.` };
      if (`${m[1]}/${m[2]}`.toLowerCase() !== origin.toLowerCase()) return { stage: 1, hint: `${which} шёл в \`${m[1]}/${m[2]}\`, а \`origin\` этого репозитория — \`${origin}\`. Сохраните список в копии, которую вы сделали для этого урока, и запустите проверку там.` };
    }
    if (run.status !== 'completed') return { stage: 2, hint: `${which} не завершился: его \`status\` — ${code(String(run.status ?? 'missing'))}. Дождитесь его командой \`gh run watch ${id}\`, ${again}.` };
    if (run.conclusion !== 'success') {
      const how = code(String(run.conclusion ?? 'missing'));
      return {
        stage: 3,
        hint: FAILED.has(run.conclusion)
          ? `${which} завершился с результатом ${how}. Причину покажет \`gh run view ${id} --log-failed\`; исправьте workflow, закоммитьте и отправьте его (push), запустите снова командой ${start}, ${again}.`
          : `${which} завершился с результатом ${how}. Запустите workflow снова командой ${start}, дождитесь завершения, ${again}.`,
      };
    }
    const sha = typeof run.headSha === 'string' && /^[0-9a-f]{40}$/i.test(run.headSha) ? run.headSha.toLowerCase() : null;
    if (!sha) return { stage: 4, hint: `У ${which.replace('Запуск', 'запуска')} нет \`headSha\`, поэтому проверка не знает, на каком коммите он шёл. Сохраните список вместе с этим полем: ${save}.` };
    if (!isCommit(repo, sha)) return { stage: 4, hint: `${which} шёл на коммите ${short(sha)}, которого нет в этом репозитории. Выполните \`git pull\`, чтобы получить его, и запустите проверку снова.` };
    const held = claudeWorkflowsAt(repo, sha).some((f) => f.steps.some((s) => s.inputs.prompt?.text?.trim()));
    if (!held) return { stage: 5, hint: `${which} шёл на коммите ${short(sha)}, где ни один workflow не запускает \`anthropics/claude-code-action\` с \`prompt\`. Когда ваш workflow отправлен (push), запустите его командой ${start}, дождитесь завершения, ${again}.` };
    return { stage: 6 };
  }

  return {
    text: `${code(record)} показывает завершённый успешный ручной запуск на коммите, где есть этот workflow`,
    local: true,
    check(repo) {
      const text = repo.read(record);
      if (text === null || !text.trim()) return `Файла ${code(record)} ещё нет. Запустите workflow командой ${start}, дождитесь завершения, затем сохраните список: ${save}.`;
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        return `${code(record)} — не JSON. Сохраните список с \`--json\` без изменений: ${save}.`;
      }
      const runs = (Array.isArray(value) ? value : [value]).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
      if (!runs.length) return `В ${code(record)} нет запусков. Запустите workflow командой ${start}, дождитесь завершения, ${again}.`;
      if (!runs.some((r) => ['status', 'conclusion', 'event', 'headSha'].some((k) => k in r))) return `В ${code(record)} нет полей, которые читает проверка. Сохраните список с ними: ${save}.`;
      const origin = originRepo(repo);
      // The run that got furthest; the first of those, as gh lists the newest first.
      const best = runs.map((r) => review(repo, r, origin)).reduce((a, b) => (b.stage > a.stage ? b : a));
      if (best.stage === 6) return true;
      if (best.stage > 0) return best.hint;
      const events = [...new Set(runs.map((r) => r.event).filter((e) => typeof e === 'string' && e))];
      if (events.length && events.every((e) => CONVERSATION.has(e))) return `В ${code(record)} только запуски, начатые \`@claude\` (${and(events.map(code))}). Запустите свой workflow вручную командой ${start}, дождитесь завершения, ${again}.`;
      return `В ${code(record)} нет запуска, начатого вручную (\`workflow_dispatch\`)${events.length ? `, только ${and(events.map(code))}` : ''}. Запустите свой workflow командой ${start}, дождитесь завершения, ${again}.`;
    },
  };
}

export const items = [pinnedWorkflow(), workflowLimits(), dispatchedRun()];
