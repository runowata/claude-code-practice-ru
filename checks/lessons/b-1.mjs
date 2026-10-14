// Install, sign in and look around (Beginner, lesson 1).
export const title = 'Установка, вход и первый осмотр';

export const versionSaved = {
  text: '`.practice/version.txt` содержит вывод `claude --version`',
  // Saved state under .practice/ is git-ignored, so only a local run can see it.
  local: true,
  check(repo) {
    const text = repo.read('.practice/version.txt');
    // With --dir, this is the Learner's own repository, not the practice copy.
    const save = `выполните \`claude --version > .practice/version.txt\` в ${repo.dir}, папке, которую читает эта проверка`;
    if (text === null) return `Файла \`.practice/version.txt\` пока нет: ${save} (сначала создайте папку \`.practice\`).`;
    if (!text.trim()) return `Файл \`.practice/version.txt\` пуст. Запустите \`claude --version\` отдельно: если оболочка пишет, что \`claude\` не найден, папки установки ещё нет в вашем PATH (исправление есть по ссылке в уроке 1). Затем ${save}.`;
    if (!/^\d+\.\d+\.\d+ \(Claude Code\)/m.test(text)) return `В \`.practice/version.txt\` должна быть строка вида \`2.1.0 (Claude Code)\`. Чтобы сохранить заново, ${save}.`;
    return true;
  },
};

export const items = [versionSaved];
