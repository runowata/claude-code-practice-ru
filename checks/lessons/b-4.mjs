// Keep a session on track (Beginner, lesson 4). Only rewinding leaves file
// state, so the Learner saves git's status just before and just after it.
export const title = 'Удержать сессию в рабочем русле';

function changed(text) {
  return (text ?? '').split(/\r?\n/).filter((l) => l.trim() && !l.slice(3).startsWith('.practice/'));
}

const SAVE_AFTER = '`git status --porcelain > .practice/b-4-after-rewind.txt`';

export const items = [
  {
    text: '`.practice/b-4-before-rewind.txt` содержит файл, который изменил Claude',
    local: true,
    check(repo) {
      const before = repo.read('.practice/b-4-before-rewind.txt');
      if (before === null) return 'После одобрения правки выполните `git status --porcelain > .practice/b-4-before-rewind.txt`.';
      return changed(before).length ? true : 'В нём нет ни одного изменённого файла. Сохраните его после одобрения правки и до отката.';
    },
  },
  {
    text: '`.practice/b-4-after-rewind.txt` не содержит изменённых файлов',
    local: true,
    check(repo) {
      const after = repo.read('.practice/b-4-after-rewind.txt');
      if (after === null) return `После отката выполните ${SAVE_AFTER}.`;
      const left = changed(after);
      if (!left.length) return true;
      const names = left.map((l) => l.slice(3)).join(', ');
      // The edit itself is gone, and only what was already there stays.
      const before = changed(repo.read('.practice/b-4-before-rewind.txt'));
      if (before.some((l) => !left.includes(l)) && left.every((l) => before.includes(l))) {
        return `После отката всё ещё изменены: ${names}. Откат сработал, но он не отменяет изменения, сделанные до урока: закоммитьте их или отложите командой \`git stash push --include-untracked\`, затем снова выполните ${SAVE_AFTER}.`;
      }
      return `После отката всё ещё изменены: ${names}. Откатите этот запрос вариантом Restore code или Restore code and conversation, затем снова выполните ${SAVE_AFTER}. Если ни один вариант не восстанавливает код (Claude использовал команду или вы выбрали Restore conversation), выполните \`git restore\` для файла и повторите правку, файл «до» и откат.`;
    },
  },
];
