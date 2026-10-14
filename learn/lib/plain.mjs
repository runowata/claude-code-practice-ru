// What `npm run learn` prints when it isn't attached to a terminal (piped,
// in CI, or with no TTY): the Beginner path and each lesson's check, as
// plain text with no escape codes.
import { C, pl } from './copy.mjs';
import { lessonLabel } from './render.mjs';

export function plainProgress(course, results, saved) {
  const lines = [C.plainIntro, ''];
  for (const l of course) {
    const r = results[l.id];
    const done = saved?.lessons?.[l.id]?.complete ? ' (пройден в приложении)' : '';
    const ran = r?.items?.filter((i) => !i.slow) ?? [];
    const slow = (r?.items?.length ?? 0) - ran.length;
    const checked = r?.error ? `проверка не смогла запуститься: ${r.error}`
      : `проходит ${ran.filter((i) => i.pass).length} из ${ran.length} ${pl(ran.length, 'пункта', 'пунктов', 'пунктов')} проверки${slow ? ` (npm run check -- ${l.id} запускает ещё ${slow} ${pl(slow, 'медленный', 'медленных', 'медленных')})` : ''}`;
    lines.push(`${lessonLabel(l.id).padEnd(4)} ${l.title}: ${checked}${done}`);
    lines.push(`     ${l.url}`);
  }
  return `${lines.join('\n')}\n`;
}
