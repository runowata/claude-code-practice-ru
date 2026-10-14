// Turn a repeated workflow into a skill (Intermediate, lesson 1). The Learner
// finishes the partial tdd skill so it runs by name and loads on its own,
// commits it, and saves the commit a /tdd run made. Whether Claude loaded the
// skill on its own shows only in a session, so the lesson self-checks it.
import { frontmatter } from '../frontmatter.mjs';
import { isTestFile, TEST_NAMES } from '../paths.mjs';

export const title = 'Превратите повторяющийся процесс в skill';

const SKILL = '.claude/skills/tdd/SKILL.md';
const SAVE_COMMIT = '`git rev-parse HEAD > .practice/i-1-commit.txt`';

function committedSkill(repo) {
  try {
    return repo.git('show', `HEAD:${SKILL}`);
  } catch {
    return null;
  }
}

function missing(repo) {
  if (repo.exists(SKILL)) return `${SKILL} не закоммичен. Выполните \`git add ${SKILL}\` и закоммитьте его.`;
  return `Файла ${SKILL} нет. Сохраните заготовку skill из раздела «Ваша очередь» урока, доработайте её и закоммитьте.`;
}

export const items = [
  {
    text: '`.claude/skills/tdd/SKILL.md` закоммичен, и в нём не осталось TODO',
    check(repo) {
      const text = committedSkill(repo);
      if (text === null) return missing(repo);
      const todo = text.split(/\r?\n/).flatMap((line, i) => (/\bTODO\b/.test(line) ? [i + 1] : []));
      if (!todo.length) return true;
      return `В закоммиченном skill ещё есть TODO в ${todo.length > 1 ? 'строках' : 'строке'} ${todo.join(', ')}. Напишите описание и шаги Green и Refactor, затем закоммитьте файл снова.`;
    },
  },
  {
    text: 'skill tdd запускается как `/tdd` и подгружается сам: есть описание, нет `disable-model-invocation: true`',
    check(repo) {
      const text = committedSkill(repo);
      if (text === null) return missing(repo);
      const fm = frontmatter(text);
      if (!fm) return `${SKILL} должен начинаться с frontmatter между двумя строками ---.`;
      const { fields } = fm;
      if (String(fields['disable-model-invocation']) === 'true') return 'Удалите строку `disable-model-invocation: true` и закоммитьте снова: из-за неё Claude не подгружает skill сам.';
      if (String(fields['user-invocable']) === 'false') return 'Удалите строку `user-invocable: false` и закоммитьте снова: из-за неё `/tdd` не запускает skill.';
      if (typeof fields.name === 'string' && fields.name && fields.name !== 'tdd') return `В frontmatter указано имя «${fields.name}», поэтому skill запускается как /${fields.name}, а не /tdd. Укажите \`name: tdd\` или удалите строку.`;
      const description = typeof fields.description === 'string' ? fields.description.trim() : '';
      const words = description.split(/\s+/).filter((w) => w && w !== 'TODO').length;
      if (words < 8) return 'Напишите описание из одного-двух предложений: что делает skill и когда Claude должен им пользоваться. Claude читает только описание, чтобы решить, когда подгружать skill.';
      return true;
    },
  },
  {
    text: 'коммит из `.practice/i-1-commit.txt` меняет тест и проверяемый им код',
    local: true,
    check(repo) {
      const saved = repo.read('.practice/i-1-commit.txt');
      if (saved === null || !saved.trim()) return `Когда запуск /tdd закоммитит свою работу, выполните ${SAVE_COMMIT}.`;
      const sha = saved.trim().split(/\s+/)[0];
      let files;
      try {
        files = repo.git('show', '--name-only', '--format=', sha).split('\n').filter(Boolean);
      } catch {
        return `В \`.practice/i-1-commit.txt\` указан ${sha}, но такого коммита в этом репозитории нет.`;
      }
      const tests = files.filter(isTestFile);
      const code = files.filter((f) => !isTestFile(f) && !/\.md$/i.test(f) && !f.startsWith('.claude/'));
      if (tests.length && code.length) return true;
      return `В этом коммите должны быть вместе тест и проверяемый им код; сейчас он меняет: ${files.join(', ') || 'ничего'}. Тесты — это ${TEST_NAMES}. Запустите /tdd на небольшой функции, дайте ему закоммитить, затем снова выполните ${SAVE_COMMIT}.`;
    },
  },
];
