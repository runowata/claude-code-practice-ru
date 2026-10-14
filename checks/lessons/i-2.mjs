// Organize project memory and see what loaded (Intermediate, lesson 2). The
// Learner imports a file into CLAUDE.md with @path, scopes a rule in
// .claude/rules/ to the files it applies to, and saves the log an
// InstructionsLoaded hook wrote, which shows both loading. What /context
// lists shows only in a session, so the lesson self-checks it.
import { existsSync } from 'node:fs';
import { isAbsolute, posix } from 'node:path';
import { homedir } from 'node:os';
import { frontmatter } from '../frontmatter.mjs';

export const title = 'Упорядочите память проекта и посмотрите, что загрузилось';

const START = 'запустите сессию командой `claude --settings .practice/i-2-hook.json` (файл хука взят из урока)';

function committed(repo, path) {
  try {
    return repo.git('show', `HEAD:${path}`);
  } catch {
    return null;
  }
}

function committedMemory(repo) {
  for (const path of ['CLAUDE.md', '.claude/CLAUDE.md']) {
    const text = committed(repo, path);
    if (text !== null) return { path, text };
  }
  return null;
}

// @path imports outside fenced code and code spans. An @ after a non-space,
// as in an email address, doesn't start one.
export function imports(text) {
  let fence = false;
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/(?:^|\s)@((?:\\ |\S)+)/g)) found.push(m[1].replace(/\\ /g, ' '));
  }
  return found;
}

// Whether an import's file exists: a relative path resolves from the file
// that holds the import.
function importExists(repo, memoryPath, target) {
  if (target.startsWith('~/')) return existsSync(posix.join(homedir(), target.slice(2)));
  if (isAbsolute(target)) return existsSync(target);
  return repo.exists(posix.join(posix.dirname(memoryPath), target));
}

// A rule's `paths` value: a YAML list, or a string of comma-separated
// patterns (commas inside {braces} belong to the pattern).
function patterns(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of String(value ?? '')) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  out.push(current.trim());
  return out.filter(Boolean).map((p) => p.replace(/^(['"])(.*)\1$/, '$2'));
}

function expandBraces(pattern) {
  const m = pattern.match(/^(.*?)\{([^{}]*)\}(.*)$/);
  if (!m) return [pattern];
  return m[2].split(',').flatMap((alt) => expandBraces(`${m[1]}${alt}${m[3]}`));
}

// Glob to RegExp, relative to the project root: ** spans folders, * and ?
// stay within one.
export function globMatcher(pattern) {
  const regexes = expandBraces(pattern.replace(/^\.\//, '')).map((p) => {
    let re = '';
    for (let i = 0; i < p.length; i += 1) {
      if (p.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
      else if (p.startsWith('**', i)) { re += '.*'; i += 1; }
      else if (p[i] === '*') re += '[^/]*';
      else if (p[i] === '?') re += '[^/]';
      else re += p[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${re}$`);
  });
  return (path) => regexes.some((r) => r.test(path));
}

function scopedRules(repo) {
  let names;
  try {
    names = repo.git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.claude/rules').split('\n').filter((f) => f.endsWith('.md'));
  } catch {
    names = [];
  }
  return names.map((path) => ({ path, globs: patterns(frontmatter(committed(repo, path) ?? '')?.fields.paths) })).filter((r) => r.globs.length);
}

export const items = [
  {
    text: 'в закоммиченном CLAUDE.md есть импорт файла через `@путь`, и этот файл существует',
    check(repo) {
      const memory = committedMemory(repo);
      if (!memory) return 'Закоммиченного CLAUDE.md нет. Закоммитьте тот, который вы приводите в порядок в этом уроке.';
      const found = imports(memory.text);
      if (!found.length) return `В закоммиченном ${memory.path} нет импорта @путь вне обратных кавычек. Добавьте строку вроде \`- npm scripts: @package.json\` и закоммитьте.`;
      const missing = found.filter((target) => !importExists(repo, memory.path, target));
      if (missing.length < found.length) return true;
      return `${memory.path} импортирует ${missing.map((m) => `@${m}`).join(', ')}, но ${missing[0]} не существует. Путь импорта идёт до первого пробела, поэтому точка или запятая сразу после него становится частью пути: поставьте импорт в конец строки или добавьте после него пробел.`;
    },
  },
  {
    text: 'закоммиченное правило в `.claude/rules/` ограничено через `paths:`, и каждое такое правило подходит хотя бы к одному файлу репозитория',
    check(repo) {
      const rules = scopedRules(repo);
      if (!rules.length) return 'Ни у одного закоммиченного файла в .claude/rules/ нет frontmatter `paths:`. Ограничьте правило файлами, к которым оно относится, например `test/**/*.js`, и закоммитьте.';
      const files = repo.git('ls-files').split('\n').filter(Boolean);
      const dead = rules.filter((r) => !r.globs.some((g) => files.some(globMatcher(g))));
      if (!dead.length) return true;
      return dead.map((r) => `${r.path} ограничено шаблоном ${r.globs.join(', ')}, который не подходит ни к одному файлу репозитория, поэтому оно никогда не загрузится.`).join(' ') + ' Исправьте шаблон так, чтобы он подходил к файлам, для которых написано правило, и закоммитьте.';
    },
  },
  {
    text: '`.practice/i-2-loaded.txt` показывает загрузку импортированного файла и ограниченного правила',
    local: true,
    check(repo) {
      const log = repo.read('.practice/i-2-loaded.txt');
      if (log === null) return `Журнала загрузки нет. Сначала ${START}, затем попросите Claude прочитать файл, к которому относится ваше правило.`;
      const lines = log.split(/\r?\n/).map((l) => l.split('\t')).filter((p) => p.length >= 2);
      const rules = scopedRules(repo).map((r) => r.path);
      if (!lines.some(([reason]) => reason === 'include')) return `В журнале нет строки \`include\`, значит, импортированный файл не загрузился. Проверьте путь импорта, затем ${START}.`;
      const loaded = lines.filter(([reason, path]) => reason === 'path_glob_match' && rules.some((r) => path.replace(/\\/g, '/').endsWith(`/${r}`)));
      if (loaded.length) return true;
      return 'В журнале нет загрузки ограниченного правила. Такое правило загружается, когда Claude читает подходящий файл своим инструментом Read, а не командой оболочки. Попросите Claude прочитать инструментом Read файл, к которому относится правило.';
    },
  },
];
