#!/usr/bin/env node
// Checks your work on a lesson's exercise.
//
//   npm run check -- <lesson-id> [--dir <path>]   one lesson, here or in another repo
//   npm run check -- all [--dir <path>]           every lesson
//
// Used by this repository's workflows:
//   --summary        a Markdown table for the progress run; never fails
//   --assert fail    every lesson must fail (the template's main branch)
//   --assert pass    every lesson must pass (the template's solutions branch)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { lessons } from './lessons/index.mjs';
import { openRepo } from './repo.mjs';

function usage(message) {
  console.error(`${message}\nиспользование: npm run check -- <${Object.keys(lessons).join('|')}|all> [--dir <path>]`);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { dir: { type: 'string', default: '.' }, summary: { type: 'boolean' }, assert: { type: 'string' } },
  });
} catch (error) {
  usage(error.message);
}
const { values, positionals } = parsed;
const [id, extra] = positionals;
if (!id) usage('назовите урок для проверки');
// Some shells, such as Windows PowerShell with an older npm, drop the `--`, so
// npm keeps --dir for itself and passes only the folder on.
if (extra !== undefined) usage(`лишний аргумент «${extra}». Поставьте --dir перед папкой, которую проверяете. Если так и сделали, оболочка потеряла --: запустите node checks/run.mjs ${id} --dir <папка>.`);
if (id !== 'all' && !lessons[id]) usage(`нет проверки для «${id}»`);
if (values.assert && !['pass', 'fail'].includes(values.assert)) usage('--assert принимает pass или fail');
const dir = resolve(values.dir);
if (!existsSync(dir)) usage(`нет такой папки: ${dir}`);

const repo = openRepo(dir);
const chosen = id === 'all' ? Object.entries(lessons) : [[id, lessons[id]]];
const results = chosen.map(([lessonId, lesson]) => ({
  id: lessonId,
  title: lesson.title,
  items: lesson.items.map((item) => {
    let outcome;
    try {
      outcome = item.check(repo);
    } catch (error) {
      outcome = `Проверка не смогла запуститься: ${error.message}`;
    }
    return { text: item.text, local: Boolean(item.local), pass: outcome === true, hint: outcome === true ? '' : outcome };
  }),
}));

// Each report sets the exit code and lets the process end on its own:
// process.exit() would drop output still on its way through a pipe, which a
// busy machine can leave there.
if (values.summary) {
  // Saved state under .practice/ never reaches GitHub, so the progress run
  // reports those items as checked locally instead of failed.
  const rows = results.flatMap((l) => l.items.map((i) => `| ${l.id} | ${i.text} | ${i.local ? 'проверено локально' : i.pass ? 'пройдено' : 'пока нет'} |`));
  console.log(['## Прогресс практики', '', '| Урок | Пункт | Результат |', '|---|---|---|', ...rows, '',
    'Пункты с пометкой «проверено локально» читают файлы в `.practice/`, которые никогда не отправляются на GitHub. Запустите `npm run check -- <lesson-id>` на своём компьютере, чтобы проверить их.'].join('\n'));
} else if (values.assert) {
  const wrong = results.filter((l) => (values.assert === 'pass') !== l.items.every((i) => i.pass));
  for (const l of wrong) console.log(`${l.id}: ожидалось, что каждая проверка ${values.assert === 'pass' ? 'пройдёт' : 'провалится'}, но ${values.assert === 'pass' ? 'часть провалилась' : 'все прошли'}`);
  console.log(wrong.length ? `${wrong.length} урок(ов) нарушили ожидание` : `Проверка каждого урока ${values.assert === 'pass' ? 'проходит' : 'не проходит'}, как и ожидалось.`);
  process.exitCode = wrong.length ? 1 : 0;
} else report();

function report() {
  let failed = 0;
  for (const l of results) {
    console.log(`${l.id}  ${l.title}`);
    for (const i of l.items) {
      console.log(`  ${i.pass ? 'PASS' : 'FAIL'}  ${i.text}`);
      if (!i.pass) {
        failed += 1;
        console.log(`        ${i.hint}`);
      }
    }
  }
  const total = results.reduce((n, l) => n + l.items.length, 0);
  console.log(`\nПройдено ${total - failed} из ${total}`);
  process.exitCode = failed ? 1 : 0;
}
