// Run and save a dynamic workflow (Advanced, lesson 3). The Learner has
// Claude write a workflow, saves the run from /workflows as a project command
// in .claude/workflows/, has it read a folder from `args`, commits it, and
// runs it by name on two folders, saving each report under .practice/ with
// the folder on its first line. That both runs stayed within the size
// guideline shows only in /workflows, so the lesson self-checks it. The
// Advanced capstone reuses the script item with its own options.
import { statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { planPaths } from '../paths.mjs';
import { findWorkflows, readWorkflow, STAGES } from '../workflow-script.mjs';

export const title = 'Запустите и сохраните dynamic workflow';

const REPORTS = ['.practice/a-3-run1.md', '.practice/a-3-run2.md'];
const TODO = /\b(TODO|FIXME)\b/i;

const and = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : list[0]);
const code = (text) => `\`${text}\``;
const shell = (path) => (/\s/.test(path) ? `"${path}"` : path);
const SAVE = 'Когда запуск workflow закончится, выполните `/workflows`, выберите запуск, нажмите `s`, оставьте расположение проекта `.claude/workflows/` и нажмите `Enter`. Затем закоммитьте сохранённый `.js`-файл.';

// Where a misplaced script should go: a .js file directly in the
// .claude/workflows/ folder it sits under.
function placed(path) {
  const at = path.lastIndexOf('.claude/workflows/') + '.claude/workflows/'.length;
  return `${path.slice(0, at)}${posix.basename(path).replace(/\.[^.]+$/, '')}.js`;
}

function scriptHint({ path, result, changed }) {
  const p = code(path);
  const hint = {
    first: () => `${p} не начинается с \`export const meta\`${result.found ? `: код начинается с ${code(result.found)}` : ''}. Claude Code требует, чтобы \`export const meta = { ... }\` был первым оператором скрипта. Перенесите его наверх (комментарии могут остаться выше) и закоммитьте.`,
    literal: () => `Строка ${result.line} файла ${p}: \`meta\` содержит ${result.what}. Если в \`meta\` не только литеральные значения, Claude Code убирает \`/<name>\` из автодополнения \`/\`. Запишите каждое значение как строку, число, список или объект и закоммитьте.`,
    fields: () => `В \`meta\` файла ${p} нужн${result.missing.length > 1 ? 'ы' : 'а'} ${result.missing.map((f) => `непустая строка \`${f}\``).join(' и ')}. Добавьте ${result.missing.length > 1 ? 'их' : 'её'} и закоммитьте.`,
    compile: () => `${p} не компилируется${result.line ? ` (строка ${result.line})` : ''}: ${result.message}. Исправьте это сами или попросите Claude и закоммитьте.`,
    args: () => {
      const why = result.declared
        ? `В строке ${result.declared} файла ${p} объявлен собственный \`args\`, который скрывает входные данные, передаваемые workflow.`
        : result.mentioned
          ? `${p} упоминает \`args\` только в комментарии, строке или имени свойства, поэтому входные данные не читает.`
          : `${p} нигде не читает \`args\`, поэтому не может принять папку на вход.`;
      return `${why} Выполните \`/workflow-authoring\`, попросите Claude изменить скрипт так, чтобы он читал папку из \`args\`, выполните \`/reload-skills\` и закоммитьте.`;
    },
    agent: () => `${p} нигде не вызывает \`agent()\`, поэтому не запускает ни одного субагента. Пусть Claude снова напишет workflow для задачи, сохраните запуск из \`/workflows\` и закоммитьте.`,
  }[result.problem]();
  const pending = changed ? ` В вашей копии ${p} есть незакоммиченные изменения: если они это исправляют, закоммитьте их.` : '';
  return `${hint}${pending}`;
}

function uncommittedHint({ path, rule }) {
  if (!rule) return `${code(path)} не закоммичен. Выполните \`git add ${shell(path)}\` и закоммитьте его.`;
  return `${code(path)} не закоммичен, а строка ${rule.line} файла ${code(rule.source)}, ${code(rule.pattern)}, его игнорирует. Выполните \`git add -f ${shell(path)}\` и закоммитьте его.`;
}

// The script item. Options as readWorkflow takes them: `needArgs`, the script
// reads its input from `args`; `needAgentCall`, it starts subagents.
export function savedWorkflow(options = {}) {
  const needs = [options.needArgs && 'читает входные данные из `args`', options.needAgentCall && 'запускает субагентов через `agent()`'].filter(Boolean);
  return {
    text: `закоммиченный скрипт в \`.claude/workflows/\` начинается с литерального \`export const meta\` с полями \`name\` и \`description\`${needs.length ? ` и ${and(needs)}` : ''}`,
    check(repo) {
      const { scripts, misplaced, uncommitted } = findWorkflows(repo);
      const results = scripts.map((s) => ({ ...s, result: readWorkflow(s.text, options) }));
      if (results.some((r) => r.result.ok)) return true;
      if (results.length) {
        const rank = (r) => STAGES.indexOf(r.result.problem);
        const other = uncommitted.length ? ` Кроме того: ${uncommittedHint(uncommitted[0])}` : '';
        return `${scriptHint(results.reduce((best, r) => (rank(r) > rank(best) ? r : best)))}${other}`;
      }
      if (misplaced.length) {
        const [path] = misplaced;
        return `${code(path)} лежит в \`.claude/workflows/\`, но проверка читает только \`.js\`-файлы прямо в этой папке, куда их сохраняет \`/workflows\`. Переместите его в ${code(placed(path))} и закоммитьте.`;
      }
      if (uncommitted.length) return uncommittedHint(uncommitted[0]);
      return `В \`.claude/workflows/\` нет скрипта workflow. ${SAVE}`;
    },
  };
}

const isDir = (dir, path) => {
  try {
    return statSync(join(dir, path)).isDirectory();
  } catch {
    return false;
  }
};

const isFile = (dir, path) => {
  try {
    return statSync(join(dir, path)).isFile();
  } catch {
    return false;
  }
};

// A path as a report writes it, in git's form from the repository's root:
// '' for the root itself, or null when it points outside the repository.
function repoPath(token, dir) {
  const [path = ''] = planPaths(token, dir);
  const normal = posix.normalize(path || '.').replace(/(.)\/+$/, '$1');
  if (normal === '.') return '';
  if (normal === '..' || normal.startsWith('../') || posix.isAbsolute(normal) || /^[A-Za-z]:/.test(normal)) return null;
  return normal;
}

// The folder a report's first line names: the whole line, as in `src/payments`
// or `# src/payments`, or else the first word that names a folder, as in
// `Folder: src/payments`. `root` is true when it names only the repository's
// root.
const unwrap = (s) => s.trim().replace(/^[#>*`"'([\s-]+/, '').replace(/[*`"')\]:,;\s]+$/, '').replace(/(\w)\.$/, '$1');

function folderOf(line, dir) {
  let root = false;
  for (const candidate of new Set([unwrap(line), ...line.split(/\s+/).map(unwrap)])) {
    if (!candidate) continue;
    const path = repoPath(candidate, dir);
    if (path === '') root = true;
    else if (path && isDir(dir, path)) return { folder: path };
  }
  return { root };
}

// The `path:line` citations in a report: `src/a.js:12`, `src/a.js:12:5`,
// `./src/a.js:12`, `src\a.js:12`, a full path into the repository, and a
// link such as `[a.js](src/a.js#L12)`. A URL, `localhost:8080` and a time
// like `10:30` aren't citations: the path must have a folder or an extension.
const COLON = /([^\s`'"()[\]{}<>*|,;]+?):(\d+)(?::\d+)?/g;
const ANCHOR = /([^\s`'"()[\]{}<>*|,;#]+)#L(\d+)/g;
const PATHLIKE = /[/\\]|\.[A-Za-z][\w-]*$/;

function citations(text, dir) {
  const found = new Map();
  for (const pattern of [COLON, ANCHOR]) {
    for (const [, match, number] of text.matchAll(pattern)) {
      if (match.includes('://') || match.startsWith('//')) continue;
      // A word glued on with a colon, as in `at:src/a.js:12`, isn't part of
      // the path; a Windows drive letter is.
      const raw = /^[A-Za-z]:[\\/]/.test(match) ? match : match.split(':').pop();
      if (!PATHLIKE.test(raw)) continue;
      const path = repoPath(raw, dir);
      const line = Number(number);
      const key = `${path ?? raw}:${line}`;
      if (!found.has(key)) found.set(key, { raw: `${raw}:${line}`, path, line, cited: path ? `${path}:${line}` : `${raw}:${line}` });
    }
  }
  return [...found.values()];
}

function readReport(repo, path) {
  const text = repo.read(path);
  if (text === null || !text.trim()) return { path, text };
  const first = text.split(/\r?\n/).find((l) => l.trim()).trim();
  return { path, text, first, ...folderOf(first, repo.dir), cites: citations(text, repo.dir) };
}

const inside = (path, folder) => path.startsWith(`${folder}/`);
const some = (list) => `${and(list.slice(0, 3).map(code))}${list.length > 3 ? ` и ещё ${list.length - 3}` : ''}`;

export const twoFolderReports = {
  text: '`.practice/a-3-run1.md` и `.practice/a-3-run2.md` называют в первых строках две разные папки, и каждый ссылается хотя бы на один `path:line` внутри своей папки',
  local: true,
  check(repo) {
    const reports = REPORTS.map((path) => readReport(repo, path));
    const missing = reports.filter((r) => r.text === null);
    if (missing.length === 2) return `Отчётов пока нет. Запустите сохранённый workflow по имени на какой-нибудь папке и попросите Claude сохранить отчёт в \`${REPORTS[0]}\`, указав папку в первой строке. То же сделайте на второй папке для \`${REPORTS[1]}\`.`;
    const problems = [];
    for (const r of reports) {
      if (r.text === null) problems.push(`Нет файла ${code(r.path)}. Запустите сохранённый workflow по имени на другой папке и попросите Claude сохранить отчёт туда, указав папку в первой строке.`);
      else if (!r.first) problems.push(`${code(r.path)} пуст. Попросите Claude сохранить отчёт туда заново, указав папку в первой строке.`);
      else if (r.root) problems.push(`В первой строке ${code(r.path)} указан корень репозитория. Запустите workflow на папке внутри него и напишите эту папку в первой строке.`);
      else if (!r.folder) problems.push(`Первая строка ${code(r.path)}, «${r.first.length > 60 ? `${r.first.slice(0, 60)}...` : r.first}», не называет ни одной папки этого репозитория. Напишите в первой строке папку, на которой вы запускали workflow, например \`src\`, как путь от корня репозитория.`);
    }
    const [a, b] = reports;
    if (a.folder && a.folder === b.folder) problems.push(`Оба отчёта называют ${code(a.folder)}. Запустите сохранённый workflow на второй, другой папке и сохраните этот отчёт как \`${REPORTS[1]}\`.`);
    for (const r of reports.filter((x) => x.folder)) {
      const outside = r.cites.filter((c) => c.path && isFile(repo.dir, c.path) && !inside(c.path, r.folder)).map((c) => c.cited);
      const within = r.cites.filter((c) => c.path && inside(c.path, r.folder));
      const fromFolder = r.cites.find((c) => c.path && !isFile(repo.dir, c.path) && isFile(repo.dir, `${r.folder}/${c.path}`));
      if (outside.length) {
        problems.push(`${code(r.path)} ссылается на ${some(outside)} — за пределами ${code(`${r.folder}/`)}, папки из первой строки. Проверьте, что workflow читает папку из \`args\` и сообщает только о файлах внутри неё, и запустите его снова.`);
      } else if (!within.length && fromFolder) {
        problems.push(`${code(r.path)} ссылается на ${code(fromFolder.raw)} — путь изнутри ${code(`${r.folder}/`)}. Каждый \`path:line\` должен начинаться от корня репозитория, как ${code(`${r.folder}/${fromFolder.path}:${fromFolder.line}`)}: запустите \`claude\` из корня или попросите Claude писать пути от него и снова запустите workflow.`);
      } else if (!within.length) {
        problems.push(`В ${code(r.path)} нет ссылок \`path:line\`${r.cites.length ? ` внутри ${code(`${r.folder}/`)}` : ''}. Каждый пункт отчёта workflow должен иметь такую ссылку от корня репозитория, например ${code(`${r.folder}/<file>:<line>`)}.`);
      }
    }
    return problems.length ? problems.join(' ') : true;
  },
};

// The lines of a file in the working tree, without the empty one after a
// final newline.
function lines(repo, path) {
  const list = (repo.read(path) ?? '').split(/\r?\n/);
  if (list.length > 1 && list.at(-1) === '') list.pop();
  return list;
}

export const citedTodos = {
  text: 'каждый указанный `path:line` существует и содержит `TODO` или `FIXME`',
  local: true,
  check(repo) {
    const reports = REPORTS.map((path) => readReport(repo, path)).filter((r) => r.text !== null && r.first);
    if (!reports.length) return 'Отчётов для чтения пока нет. Сохраните их, как сказано в пункте выше.';
    const seen = new Map();
    for (const r of reports) for (const c of r.cites) if (!seen.has(c.cited)) seen.set(c.cited, { ...c, folder: r.folder });
    if (!seen.size) return 'В отчётах нет ссылок `path:line`. Каждый пункт отчёта workflow должен иметь такую ссылку от корня репозитория, например `src/a.js:12`.';
    const failures = [];
    for (const c of seen.values()) {
      if (!c.path) {
        failures.push(`${code(c.raw)} не указывает на файл этого репозитория`);
      } else if (!isFile(repo.dir, c.path)) {
        const nested = c.folder && isFile(repo.dir, `${c.folder}/${c.path}`);
        failures.push(nested ? `${code(c.raw)} — путь изнутри ${code(`${c.folder}/`)}; от корня это ${code(`${c.folder}/${c.path}:${c.line}`)}` : `нет ${code(c.path)} для ${code(c.cited)}`);
      } else {
        const text = lines(repo, c.path);
        if (c.line < 1) failures.push(`${code(c.cited)} указывает на строку 0, а строки считаются с 1`);
        else if (c.line > text.length) failures.push(`${code(c.cited)} за концом файла ${code(c.path)}, в котором строк: ${text.length}`);
        else if (!TODO.test(text[c.line - 1])) failures.push(`в ${code(c.cited)} нет \`TODO\` или \`FIXME\``);
      }
    }
    if (!failures.length) return true;
    const shown = failures.slice(0, 3).join('; ');
    const more = failures.length > 3 ? `; и ещё ${failures.length - 3}` : '';
    return `${shown.charAt(0).toUpperCase()}${shown.slice(1)}${more}. Если код изменился после запуска, запустите workflow снова и сохраните новый отчёт. Если отчёт ссылается на другие строки в рассуждениях, попросите Claude ссылаться только на строки с \`TODO\` и \`FIXME\`.`;
  },
};

export const items = [savedWorkflow({ needArgs: true }), twoFolderReports, citedTodos];
