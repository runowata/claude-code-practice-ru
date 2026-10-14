// Pick the model and effort (Intermediate, lesson 3). The Learner fills in
// the model and effort of a skill for a routine, precisely described task,
// and commits the entry a /changelog run wrote. Picking the model and effort
// for other tasks is judgement, self-checked here and at the capstone.
import { frontmatter } from '../frontmatter.mjs';

export const title = 'Выберите модель и уровень усилий';

const SKILL = '.claude/skills/changelog/SKILL.md';
const SMALL = /^(sonnet|claude-sonnet-[\w.-]+)(\[1m\])?$|^(haiku|claude-haiku-[\w.-]+)$/;
const LARGE = /^(opus|fable|best|opusplan|claude-opus-[\w.-]+|claude-fable-[\w.-]+)(\[1m\])?$/;
const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

function committed(repo, path) {
  try {
    return repo.git('show', `HEAD:${path}`);
  } catch {
    return null;
  }
}

export const items = [
  {
    text: 'закоммиченный skill changelog работает на более лёгкой модели с низким или средним effort',
    check(repo) {
      const text = committed(repo, SKILL);
      if (text === null) return repo.exists(SKILL) ? `${SKILL} не закоммичен. Выполните \`git add ${SKILL}\` и закоммитьте его.` : `Файла ${SKILL} нет. Сохраните заготовку skill из раздела «Ваша очередь» урока.`;
      const fields = frontmatter(text)?.fields ?? {};
      const model = String(fields.model ?? '').trim();
      const effort = String(fields.effort ?? '').trim();
      if (!model || model === 'TODO') return 'Укажите `model:` в skill: псевдоним модели, нужной для этой задачи, например `sonnet`.';
      if (LARGE.test(model)) return `\`model: ${model}\` выбирает модель крупнее, чем нужно для этой задачи: изменение, которое можно точно описать, — рутинная работа. Укажите \`sonnet\` или, вне auto mode, \`haiku\`.`;
      if (!SMALL.test(model)) return `\`model: ${model}\` — не псевдоним и не имя модели, известные Claude Code. Укажите \`sonnet\` или \`haiku\`.`;
      if (!LEVELS.includes(effort)) return `Укажите в \`effort:\` одно из значений: ${LEVELS.join(', ')}.`;
      if (LEVELS.indexOf(effort) > 1) return `\`effort: ${effort}\` требует больше усилий, чем нужно рутинному изменению, которое вы всё равно проверяете. Укажите \`low\` или \`medium\`.`;
      return true;
    },
  },
  {
    text: 'в закоммиченном CHANGELOG.md есть запись под `## Unreleased`',
    check(repo) {
      const text = committed(repo, 'CHANGELOG.md');
      const hint = 'Добавьте в индекс небольшое изменение, запустите `/changelog` и закоммитьте изменение вместе с записью, которую он напишет.';
      if (text === null) return `Закоммиченного CHANGELOG.md нет. ${hint}`;
      const lines = text.split(/\r?\n/);
      const at = lines.findIndex((l) => /^##\s+Unreleased\b/i.test(l.trim()));
      if (at === -1) return `В CHANGELOG.md нет заголовка \`## Unreleased\`. ${hint}`;
      const next = lines.slice(at + 1).findIndex((l) => /^#{1,2}\s/.test(l));
      const section = lines.slice(at + 1, next === -1 ? undefined : at + 1 + next);
      return section.some((l) => /^\s*[-*]\s+\S/.test(l)) ? true : `Под \`## Unreleased\` в CHANGELOG.md нет ни одной записи. ${hint}`;
    },
  },
];
