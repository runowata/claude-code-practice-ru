// Install and manage plugins (Intermediate, lesson 8). The Learner enables a
// plugin from one of Anthropic's marketplaces for the whole project, in the
// committed .claude/settings.json, installs it at project scope, and saves
// `claude plugin list --json` so the check can see the install.
import { realpathSync } from 'node:fs';

export const title = 'Установите плагины и управляйте ими';

const ANTHROPIC = ['claude-plugins-official', 'claude-community', 'claude-code-plugins'];
const SAVE = '`claude plugin list --json > .practice/i-8-plugins.json`';

// Whether an install's projectPath is this repository: true or false when the
// path exists on this machine, null when it doesn't (a list saved elsewhere).
function here(projectPath, dir) {
  try {
    return realpathSync(projectPath) === realpathSync(dir);
  } catch {
    return null;
  }
}

function projectPlugins(repo) {
  try {
    const value = JSON.parse(repo.git('show', 'HEAD:.claude/settings.json'));
    return Object.entries(value?.enabledPlugins ?? {})
      .filter(([id, on]) => on === true && ANTHROPIC.includes(id.split('@')[1]))
      .map(([id]) => id);
  } catch {
    return null;
  }
}

export const items = [
  {
    text: 'закоммиченный `.claude/settings.json` включает плагин из одного из marketplace Anthropic',
    check(repo) {
      const ids = projectPlugins(repo);
      if (ids === null) return 'Нет закоммиченного .claude/settings.json, который читается как JSON. Добавьте запись `enabledPlugins` из урока и закоммитьте.';
      return ids.length ? true : `В \`enabledPlugins\` не включён ни один плагин из marketplace Anthropic. Добавьте \`"claude-code-setup@claude-plugins-official": true\`: часть после @ — имя marketplace, одно из ${ANTHROPIC.join(', ')}.`;
    },
  },
  {
    text: '`.practice/i-8-plugins.json`, сохранённый в этом репозитории, показывает, что этот плагин установлен на уровне проекта и включён',
    local: true,
    check(repo) {
      const text = repo.read('.practice/i-8-plugins.json');
      if (text === null) return `В репозитории выполните ${SAVE}.`;
      let list;
      try {
        list = JSON.parse(text);
      } catch {
        return `.practice/i-8-plugins.json — не JSON. Выполните ${SAVE} снова, из корня репозитория.`;
      }
      const ids = projectPlugins(repo) ?? [];
      // The list holds project-scope installs for every project on the machine,
      // and projectEnabled reflects the settings of the folder it ran in, so an
      // install counts only when its projectPath is this repository.
      const ok = (Array.isArray(list) ? list : list?.installed ?? []).some((p) => ids.includes(p?.id) && p.scope === 'project' && p.enabled === true && p.projectEnabled === true && here(p.projectPath, repo.dir) !== false);
      return ok ? true : `Сохранённый список не показывает, что ${ids[0] ?? 'плагин'} установлен на уровне проекта для этого репозитория. Выполните в репозитории \`claude plugin install ${ids[0] ?? '<plugin>@<marketplace>'} --scope project\`, затем ${SAVE}.`;
    },
  },
];
