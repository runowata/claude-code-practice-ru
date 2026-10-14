// Choose an orchestration pattern (Advanced, lesson 2). The Learner picks a
// pattern for each of four queued jobs by what it needs and what it costs,
// writes the choices to a file, and runs job 1 as parallel subagents in a
// session started with a SubagentStart hook that logs each subagent's id and
// type. Naming the pattern for a job of their own is self-checked.

export const title = 'Выберите схему оркестрации';

const CHOICES = '.practice/a-2-choices.md';
const LOG = '.practice/a-2-agents.txt';
const HOOK = '.practice/a-2-hook.json';
const HOOKED = `\`claude --settings ${HOOK}\``;
const FORMAT = '`<номер задания>: <схема> потому что <причина>`';
const NAMES = '`main conversation`, `subagents`, `workflow` или `agent team`';

// What the text after a job number may start with, once an article goes.
const PATTERNS = [
  ['subagents', /^(?:parallel\s+)?sub[\s-]?agents?\b/i],
  ['workflow', /^(?:dynamic\s+)?workflows?\b/i],
  ['main conversation', /^(?:main\s+(?:conversation|session)|(?:single|one)\s+(?:conversation|session))\b/i],
  ['agent team', /^agent[\s-]+teams?\b/i],
];
const LABEL = { 'main conversation': 'основной разговор (main conversation)', subagents: 'субагенты (subagents)', workflow: 'workflow', 'agent team': 'agent team' };

// The lesson's chart: its questions in order, and the answers that lead to
// each pattern. Where a wrong pick leaves the right path is the question that
// settles the job.
const QUESTIONS = [
  'Справится ли один разговор, не переполнившись?',
  'Должны ли исполнители общаться друг с другом?',
  'Нужны ли много агентов, перекрёстная проверка находок или повторный запуск?',
];
const PATH = {
  'main conversation': [true],
  'agent team': [false, true],
  subagents: [false, false, false],
  workflow: [false, false, true],
};

// The four jobs in the lesson's Your turn, and the answer to each question on
// the way to the pattern that fits.
const JOBS = {
  1: { pattern: 'subagents', why: [
    'Нет: чтение файлов в вашем разговоре его переполнит, а нужны только находки.',
    'Нет: каждый рецензент проверяет свой файл и сообщает, что нашёл.',
    'Нет: три файла, одна проверка, без шага, который перепроверяет находки.',
  ] },
  2: { pattern: 'workflow', why: [
    'Нет: проверяется каждый исходный файл.',
    'Нет: каждая находка сверяется с кодом, а не обсуждается между исполнителями.',
    'Да: проверяется каждый исходный файл, каждая находка перепроверяется, и всё запускается заново перед каждым релизом, поэтому план должен храниться в скрипте.',
  ] },
  3: { pattern: 'main conversation', why: [
    'Да: исправить опечатку — быстрая точечная правка, а каждый шаг за пределы одного разговора стоит дороже.',
  ] },
  4: { pattern: 'agent team', why: [
    'Нет: три исследователя работают одновременно, каждый над своей версией.',
    'Да: исследователи пишут друг другу по ходу работы, чтобы оспаривать находки друг друга, а участники agent team обмениваются сообщениями напрямую.',
  ] },
};

const SEPARATOR = '[:.)|\\-\\u2013\\u2014]';
const JOB_LINE = new RegExp(`^(?:job\\s*#?\\s*([1-4])(?!\\d)\\s*${SEPARATOR}*|#?([1-4])(?!\\d)\\s*${SEPARATOR}+)\\s*(.*)$`, 'i');

const and = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : list[0]);

// The choice lines in the file, by job number. `1: subagents because ...`,
// `Job 1 - Subagents`, `- **2:** dynamic workflow`, `3. main session`,
// `4) agent teams` and a table row `| 4 | agent team | ... |` all count. A
// line's pattern is null when its text starts with none of the four, and
// `start` keeps that text's first words for the hint.
export function readChoices(text) {
  const jobs = new Map([1, 2, 3, 4].map((n) => [n, []]));
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*_`]/g, '')
      .replace(/^\s*(?:[-+>|(]\s*|#{1,6}\s+|\[[ xX]\]\s*)*/, '')
      .replace(/^\d+[.)]\s+(?=job\b)/i, '')
      .trim();
    const match = line.match(JOB_LINE);
    if (!match) continue;
    const rest = match[3].replace(/^["'([\s]+/, '').replace(/^(?:an?|the)\s+/i, '');
    const found = PATTERNS.find(([, pattern]) => pattern.test(rest));
    const start = rest.replace(/\s+(?:because\b|потому что).*$/i, '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
    jobs.get(Number(match[1] ?? match[2])).push({ pattern: found ? found[0] : null, start });
  }
  return jobs;
}

function wrongPick(n, chosen) {
  const { pattern, why } = JOBS[n];
  const at = PATH[chosen].findIndex((answer, i) => answer !== PATH[pattern][i]);
  return `Заданию ${n} не подходит схема: ${LABEL[chosen]}. ${QUESTIONS[at]} ${why[at]} Подходит: ${LABEL[pattern]}.`;
}

// Subagent starts in the hook's log, one per line: `agent_id<TAB>agent_type`.
// A resumed subagent logs its id again, so each id counts once. A line with no
// id, from a hook that logs only the type, counts as a start of its own.
export function startedAgents(text) {
  const ids = new Map();
  let unnamed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    const id = tab === -1 ? '' : line.slice(0, tab).trim();
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
    else unnamed += 1;
  }
  return { ids, count: ids.size + unnamed };
}

export const fittingPatterns = {
  text: `\`${CHOICES}\` выбирает для каждого задания самую дешёвую подходящую схему`,
  local: true,
  check(repo) {
    const text = repo.read(CHOICES);
    if (text === null) return `Нет файла \`${CHOICES}\`. Сохраните в нём свой выбор: одна строка на задание в виде ${FORMAT}, где схема — ${NAMES}.`;
    const jobs = readChoices(text);
    if ([...jobs.values()].every((lines) => !lines.length)) return `В \`${CHOICES}\` нет ни одной строки, которая начинается с номера задания. Напишите по строке на задание в виде ${FORMAT}, где схема — ${NAMES}.`;
    const missing = [...jobs].filter(([, lines]) => !lines.length).map(([n]) => n);
    const problems = missing.length ? [`В \`${CHOICES}\` нет строки для ${missing.length > 1 ? 'заданий' : 'задания'} ${and(missing)}. Добавьте по строке на задание в виде ${FORMAT}.`] : [];
    for (const [n, lines] of jobs) {
      if (!lines.length) continue;
      const picked = [...new Set(lines.map((l) => l.pattern).filter(Boolean))];
      if (!picked.length) {
        const { start } = lines[0];
        problems.push(start ? `Строка задания ${n} начинается с «${start}», а это не одна из четырёх схем. Сразу после номера задания напишите ${NAMES}.` : `В строке задания ${n} не названа схема. Сразу после номера задания напишите ${NAMES}.`);
      } else if (picked.length > 1) {
        problems.push(`У задания ${n} строки выбирают разные схемы: ${and(picked.map((p) => LABEL[p]))}. Оставьте одну строку на задание.`);
      } else if (picked[0] !== JOBS[n].pattern) {
        problems.push(wrongPick(n, picked[0]));
      }
    }
    return problems.length ? problems.join(' ') : true;
  },
};

export const parallelSubagents = {
  text: `\`${LOG}\` показывает запуск как минимум двух субагентов для задания 1`,
  local: true,
  check(repo) {
    const text = repo.read(LOG);
    if (text === null) {
      return repo.exists(HOOK)
        ? `Нет файла \`${LOG}\`. Запустите сессию с ${HOOKED}, затем выполните задание 1.`
        : `Нет файла \`${LOG}\`. Сохраните файл хука из раздела «Ваша очередь» урока как \`${HOOK}\`, запустите сессию с ${HOOKED}, затем выполните задание 1.`;
    }
    const { ids, count } = startedAgents(text);
    if (count >= 2) return true;
    if (count === 0) return `\`${LOG}\` пуст. Команда хука создаёт файл до запуска \`jq\`, поэтому проверьте, что \`jq --version\` работает, и снова выполните задание 1 в сессии, запущенной с ${HOOKED}.`;
    const [[id, times] = []] = ids;
    const seen = times > 1 ? ` В нём один субагент, \`${id}\`, запущенный ${times} раз: возобновлённый Claude субагент снова пишет свой id, поэтому он считается один раз.` : ' В нём запуск одного субагента.';
    return `В \`${LOG}\` нужны как минимум два субагента.${seen} В сессии, запущенной с ${HOOKED}, попросите по одному субагенту на файл, параллельно.`;
  },
};

export const items = [fittingPatterns, parallelSubagents];
