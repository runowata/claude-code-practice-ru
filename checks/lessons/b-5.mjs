// Project memory with CLAUDE.md (Beginner, lesson 5). The Learner commits a
// CLAUDE.md with a rule a script can see in files, saves that rule's line,
// and records the commit a new session made.
import { isTestFile } from '../paths.mjs';

export const title = 'Память проекта в CLAUDE.md';

const SAVE_COMMIT = '`git rev-parse HEAD > .practice/b-5-commit.txt`';
const isSource = (f) => !isTestFile(f) && !/\.md$/i.test(f);

function rule(repo) {
  const text = repo.read('.practice/b-5-rule.txt');
  const line = (text ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return line ?? null;
}

function committedMemory(repo) {
  for (const path of ['CLAUDE.md', '.claude/CLAUDE.md']) {
    try {
      return repo.git('show', `HEAD:${path}`);
    } catch { /* not in the last commit */ }
  }
  return null;
}

export const items = [
  {
    text: 'закоммиченный CLAUDE.md содержит правило, сохранённое в `.practice/b-5-rule.txt`',
    local: true,
    check(repo) {
      const line = rule(repo);
      if (!line) return 'Сохраните точную строку правила, например `echo \'// Part of linkcheck.\' > .practice/b-5-rule.txt`.';
      const memory = committedMemory(repo);
      if (memory === null) return 'CLAUDE.md не закоммичен. Выполните `git add CLAUDE.md` и закоммитьте его.';
      return memory.includes(line) ? true : `В закоммиченном CLAUDE.md нет строки \`${line}\`, сохранённой в \`.practice/b-5-rule.txt\`. Добавьте эту строку в CLAUDE.md проекта и закоммитьте снова либо сохраните в \`.practice/b-5-rule.txt\` строку своего правила.`;
    },
  },
  {
    text: 'каждый новый файл в коммите, указанном в `.practice/b-5-commit.txt`, кроме тестов и Markdown, начинается с этого правила',
    local: true,
    check(repo) {
      const line = rule(repo);
      const saved = repo.read('.practice/b-5-commit.txt');
      if (!line || !saved?.trim()) return `После того как новая сессия закоммитит своё изменение, выполните ${SAVE_COMMIT}.`;
      const sha = saved.trim().split(/\s+/)[0];
      let added;
      try {
        added = repo.git('show', '--diff-filter=A', '--name-only', '--format=', sha).split('\n').filter(Boolean);
      } catch {
        return `В \`.practice/b-5-commit.txt\` указан ${sha}, но это не коммит этого репозитория.`;
      }
      const sources = added.filter(isSource);
      if (!sources.length) {
        const waiting = repo.git('status', '--porcelain', '--untracked-files=all').split('\n')
          .filter((l) => l.startsWith('?? ')).map((l) => l.slice(3))
          .filter((f) => !f.startsWith('.practice/') && isSource(f));
        if (waiting.length) return `Этот коммит не добавляет ни одного нового файла с кодом, а эти новые файлы ещё не закоммичены: ${waiting.join(', ')}. Попросите Claude закоммитить их, затем снова выполните ${SAVE_COMMIT}.`;
        return `Этот коммит не добавляет ни одного нового файла с кодом. Попросите новую сессию сделать изменение, которое создаёт такой файл, и закоммитить его, затем снова выполните ${SAVE_COMMIT}.`;
      }
      const wrong = sources.filter((f) => repo.git('show', `${sha}:${f}`).replace(/^\uFEFF/, '').split(/\r?\n/)[0].trim() !== line);
      return wrong.length ? `Эти новые файлы не начинаются с \`${line}\`: ${wrong.join(', ')}. Убедитесь, что правило есть в закоммиченном CLAUDE.md, начните новую сессию, попросите её создать другой новый файл и закоммитить его, затем снова выполните ${SAVE_COMMIT}.` : true;
    },
  },
];
