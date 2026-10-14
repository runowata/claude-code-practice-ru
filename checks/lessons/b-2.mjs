// Permission modes and plan mode (Beginner, lesson 2). The Learner saves
// three snapshots under .practice/: git's status while the plan is on screen,
// the files the plan says it will change, and git's status after approving.
import { inPlan, planPaths, statusPaths } from '../paths.mjs';

export const title = 'Режимы разрешений и plan mode';

const SAVE_BEFORE = 'Пока план на экране, выполните `git status --porcelain > .practice/b-2-before.txt` в другом терминале.';

export const items = [
  {
    text: '`.practice/b-2-before.txt`, сохранённый, пока план был на экране, не содержит изменённых файлов',
    local: true,
    check(repo) {
      const before = repo.read('.practice/b-2-before.txt');
      if (before === null) return SAVE_BEFORE;
      const changed = statusPaths(before);
      if (changed.length) return `Файлы изменились ещё до того, как вы одобрили план: ${changed.join(', ')}. Начните с чистого рабочего дерева (закоммитьте их или отложите командой \`git stash push --include-untracked\`) и оставайтесь в plan mode, пока не одобрите план.`;
      return true;
    },
  },
  {
    text: 'каждый файл из `.practice/b-2-after.txt` указан в `.practice/b-2-plan.txt`',
    local: true,
    check(repo) {
      const plan = repo.read('.practice/b-2-plan.txt');
      const after = repo.read('.practice/b-2-after.txt');
      if (plan === null || !plan.trim()) return 'Перед одобрением впишите в `.practice/b-2-plan.txt` файлы, которые изменит план, по одному пути в строке.';
      if (after === null || !statusPaths(after).length) return 'Когда Claude закончит правки, выполните `git status --porcelain > .practice/b-2-after.txt`.';
      const planned = planPaths(plan, repo.dir);
      const extra = statusPaths(after).filter((path) => !inPlan(planned, path));
      if (extra.length) return `Изменены, но не указаны в плане: ${extra.join(', ')}. Сравните одобренный план с тем, что изменил Claude.`;
      return true;
    },
  },
];
