// Your first change, from request to commit (Beginner, lesson 3). The Learner
// saves the sha of the commit they made; the check reads that commit, runs
// the tests and looks for anything left uncommitted.
import { spawnSync } from 'node:child_process';
import { isTestFile, TEST_NAMES } from '../paths.mjs';

export const title = 'Первое изменение: от запроса до коммита';

const SAVE_COMMIT = '`git rev-parse HEAD > .practice/b-3-commit.txt`';

function savedCommit(repo) {
  const text = repo.read('.practice/b-3-commit.txt');
  if (text === null || !text.trim()) return { error: `После коммита выполните ${SAVE_COMMIT}.` };
  const sha = text.trim().split(/\s+/)[0];
  try {
    repo.git('cat-file', '-e', `${sha}^{commit}`);
  } catch {
    return { error: `В \`.practice/b-3-commit.txt\` указан ${sha}, но это не коммит этого репозитория.` };
  }
  return { sha };
}

export const testsPass = {
  text: 'тесты проходят',
  check(repo) {
    const pkg = repo.read('package.json');
    let hasScript = false;
    try { hasScript = Boolean(pkg && JSON.parse(pkg).scripts?.test); } catch { /* not JSON */ }
    if (hasScript) {
      const run = spawnSync('npm', ['test', '--silent'], { cwd: repo.dir, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000 });
      return run.status === 0 ? true : '`npm test` завершается ошибкой. Запустите его, прочитайте первый сбой и попросите Claude исправить код, а не тест.';
    }
    const saved = repo.read('.practice/b-3-tests.txt');
    const save = '`<ваша команда тестов>; echo $? > .practice/b-3-tests.txt` (Windows: `<ваша команда тестов>; $LASTEXITCODE > .practice/b-3-tests.txt`)';
    if (saved === null) return `В этом репозитории нет скрипта \`npm test\`. Запустите тесты и сохраните их код выхода: ${save}.`;
    const code = saved.trim();
    if (code === '0') return true;
    // In PowerShell, `$?` is True or False rather than an exit code.
    if (!/^-?\d+$/.test(code)) return `В \`.practice/b-3-tests.txt\` записано «${code}», а не код выхода. Сохраните заново: ${save}.`;
    return `Судя по \`.practice/b-3-tests.txt\`, тесты завершились с кодом ${code}, а не 0.`;
  },
};

export const nothingUncommitted = {
  text: 'не осталось незакоммиченных изменений',
  check(repo) {
    const status = repo.git('status', '--porcelain').split('\n').filter((l) => l && !l.slice(3).startsWith('.practice/'));
    // Plain `git stash` leaves new, untracked files behind.
    return status.length ? `Эти изменения не закоммичены: ${status.map((l) => l.slice(3)).join(', ')}. Закоммитьте их или отложите командой \`git stash push --include-untracked\`.` : true;
  },
};

export const items = [
  {
    text: 'коммит, указанный в `.practice/b-3-commit.txt`, меняет файл с тестами и хотя бы один другой файл',
    local: true,
    check(repo) {
      const { sha, error } = savedCommit(repo);
      if (error) return error;
      const files = repo.git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean);
      const tests = files.filter(isTestFile);
      if (!tests.length) return `Коммит не меняет ни одного файла с тестами (${files.join(', ')}). Проверка считает тестовыми ${TEST_NAMES}. Попросите Claude добавить тест и дополните коммит командой \`git commit --amend\`, затем сохраните его заново: ${SAVE_COMMIT}.`;
      if (tests.length === files.length) return `Коммит меняет только тесты (${files.join(', ')}). Если изменение кода в более раннем коммите, попросите Claude объединить два коммита в один и сохраните его заново: ${SAVE_COMMIT}.`;
      return true;
    },
  },
  testsPass,
  nothingUncommitted,
];
