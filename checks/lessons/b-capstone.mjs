// The Beginner capstone: fix the bug in capstone/beginner-bug.md from plan to
// commit. It checks the parts of the Beginner Exit statements B1, B2, B3 and
// B5 that a script can see in files and git. The rest, B4 and the new-session
// half of B5 included, is self-assessed on the capstone page.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { versionSaved } from './b-1.mjs';
import { testsPass, nothingUncommitted } from './b-3.mjs';
import { isTestFile, planPaths, statusPaths } from '../paths.mjs';

export const title = 'Итоговый проект начального уровня';

const lines = (text) => (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const SAVE_COMMIT = '`git rev-parse HEAD > .practice/capstone-commit.txt`';

export const items = [
  versionSaved,
  {
    text: '`.practice/capstone-before.txt`, сохранённый, пока план был на экране, не содержит изменённых файлов',
    local: true,
    check(repo) {
      const before = repo.read('.practice/capstone-before.txt');
      if (before === null) return 'Пока план на экране, выполните `git status --porcelain > .practice/capstone-before.txt`.';
      const changed = statusPaths(before);
      return changed.length ? `Файлы изменились ещё до того, как вы одобрили план: ${changed.join(', ')}. Начните с чистого рабочего дерева (закоммитьте их или отложите командой \`git stash push --include-untracked\`), оставайтесь в plan mode, пока не одобрите план, и сохраните этот файл, пока план на экране.` : true;
    },
  },
  {
    text: 'коммит из `.practice/capstone-commit.txt` меняет только файлы, перечисленные в `.practice/capstone-plan.txt`, и среди них есть тест',
    local: true,
    check(repo) {
      const plan = planPaths(repo.read('.practice/capstone-plan.txt'), repo.dir);
      if (!plan.size) return 'Перед одобрением сохраните файлы, которые изменит план, по одному в строке, в `.practice/capstone-plan.txt`.';
      const sha = lines(repo.read('.practice/capstone-commit.txt'))[0];
      if (!sha) return `После коммита с исправлением выполните ${SAVE_COMMIT}.`;
      let files;
      try {
        files = repo.git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean);
      } catch {
        return `В \`.practice/capstone-commit.txt\` указан ${sha}, но это не коммит этого репозитория.`;
      }
      const extra = files.filter((f) => !plan.has(f));
      if (extra.length) return `Коммит меняет файлы, которых нет в плане: ${extra.join(', ')}. Если в одобренном вами плане они были, добавьте их в \`.practice/capstone-plan.txt\`. Если нет, уберите их из коммита, отложите командой \`git stash push --include-untracked\` и снова выполните ${SAVE_COMMIT}.`;
      return files.some(isTestFile) ? true : `Коммит не меняет ни одного файла с тестами. Положите тест, которого просит описание ошибки, в тот же коммит, что и исправление, затем снова выполните ${SAVE_COMMIT}.`;
    },
  },
  {
    text: 'описанная ошибка исправлена: отсутствующая папка в `linkcheck.json` завершает программу с кодом 2',
    check(repo) {
      const dir = mkdtempSync(join(tmpdir(), 'linkcheck-'));
      try {
        writeFileSync(join(dir, 'linkcheck.json'), '{ "files": ["docs"] }\n');
        const run = spawnSync(process.execPath, [join(repo.dir, 'src', 'cli.js'), dir], { encoding: 'utf8', timeout: 30_000 });
        return run.status === 2 ? true : `Программа завершилась с кодом ${run.status}, а не 2. Перечитайте capstone/beginner-bug.md.`;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  testsPass,
  {
    text: 'закоммиченный CLAUDE.md называет команду тестов, `npm test`',
    check(repo) {
      for (const path of ['CLAUDE.md', '.claude/CLAUDE.md']) {
        try {
          return repo.git('show', `HEAD:${path}`).includes('npm test') ? true : 'В закоммиченном CLAUDE.md нет `npm test`. Добавьте команду тестов и закоммитьте.';
        } catch { /* not committed at this path */ }
      }
      return 'Закоммиченного CLAUDE.md нет. Выполните `/init` в сессии, проверьте файл и закоммитьте его.';
    },
  },
  nothingUncommitted,
];
