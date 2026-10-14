// Share your setup with a team (Advanced, lesson 6). The Learner commits a
// team marketplace inside the repository, copied from the guide's example,
// registers it in the committed .claude/settings.json by a relative path and
// turns its plugin on; moves a skill, a subagent or a hook of their own from
// .claude/ into the plugin; keeps their personal files out of git with a
// committed .gitignore; and saves a strict validation of the plugin
// directory. That the moved component loads from the plugin after trust,
// with no install command, shows only in a session, so the lesson
// self-checks it. The Advanced capstone reuses the marketplace items.
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, posix, relative } from 'node:path';
import { frontmatter } from '../frontmatter.mjs';
import { committedIgnore, ignoreHint } from '../ignore.mjs';
import {
  commitHint, committedFiles, committedMarketplaces, committedSettings, headText, marketplaceHint,
  parseJson, passingMarketplaces, pluginComponents, pluginFolders, registration, relativePath, uncommittedFiles,
} from '../marketplace.mjs';

export const title = 'Поделитесь настройкой с командой';

export const VALIDATE = '.practice/a-6-validate.json';
const SETTINGS = '.claude/settings.json';
const PERSONAL = ['.claude/settings.local.json', 'CLAUDE.local.md'];
// The example plugin, as the Worked example copies it, and the components it
// already holds.
const EXAMPLE = { name: 'team-kit', dir: 'team-marketplace/plugins/team-kit' };
const KIT = new Set(['skills/onboard/SKILL.md', 'agents/config-reviewer.md']);
// The /tutor skill that earlier versions of the practice template shipped in
// .claude/skills/tutor/, which an older copy may still hold. Moving it into the
// plugin doesn't move a component of the Learner's own.
const TUTOR = 'skills/tutor/SKILL.md';
// Words of a hook command that name an interpreter, not the script it runs.
const INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'node', 'python', 'python3', 'env', 'deno', 'bun', 'ruby', 'perl', 'pwsh']);
const PLUGIN_ROOT = /^\$\{?CLAUDE_PLUGIN_ROOT\}?\/(.+)$/;

const and = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : list[0]);
const code = (text) => `\`${text}\``;
const shell = (path) => (/\s/.test(path) ? `"${path}"` : path);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const named = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// The plugins committed marketplaces list by a relative path, with a
// committed plugin.json, the passing ones first.
function listedPlugins(repo) {
  const passing = passingMarketplaces(repo).flatMap((m) => m.plugins);
  const others = committedMarketplaces(repo).flatMap((m) => m.entries).filter((e) => e.stage >= 3 && !passing.includes(e));
  const seen = new Set();
  return [...passing, ...others].filter((p) => !seen.has(p.dir) && seen.add(p.dir));
}

// The plugin a hint names: the first that passes, or the example's.
const mainPlugin = (repo) => listedPlugins(repo)[0] ?? EXAMPLE;

// What the hints say to do when there is no marketplace or no settings yet,
// as the lesson's page says it. The Advanced capstone passes its own.
const LESSON = {
  marketplace: 'Скачайте пример marketplace в `team-marketplace/`, как показано в разделе «Разбор на примере»',
  settings: 'как показано в разделе «Разбор на примере»',
};

export function marketplaceItem(page = LESSON) {
  return {
    text: 'закоммиченный marketplace команды перечисляет плагин по относительному пути, а имя записи совпадает с `name` в `plugin.json` плагина',
    check: (repo) => (passingMarketplaces(repo).length ? true : marketplaceHint(repo, page.marketplace)),
  };
}

// Whether the working copy of the settings would pass where the committed
// one doesn't: then the fix only needs committing.
function pendingSettings(repo, marketplaces) {
  // repo.read drops a byte-order mark, which the committed text keeps.
  const text = repo.read(SETTINGS);
  if (text === null || text.trimEnd() === (headText(repo, SETTINGS) ?? '').replace(/^\uFEFF/, '').trimEnd()) return false;
  try {
    return registration(JSON.parse(text), marketplaces).ok;
  } catch {
    return false;
  }
}

function settingsHint(repo, settings, marketplaces, page) {
  if (settings === null) {
    if (repo.exists(SETTINGS)) return commitHint(repo, SETTINGS);
    const [m] = marketplaces;
    return `Нет закоммиченного ${code(SETTINGS)}. Создайте его с \`"extraKnownMarketplaces": { "${m.name}": { "source": { "source": "directory", "path": "${relativePath(m.root)}" } } }\` и \`"enabledPlugins": { "${m.plugins[0].name}@${m.name}": true }\`, ${page.settings}, и закоммитьте.`;
  }
  if (settings.error) return `Закоммиченный ${code(SETTINGS)} — невалидный JSON: ${settings.error}`;
  if (!isObject(settings.value)) return `Закоммиченный ${code(SETTINGS)} — не JSON-объект.`;
  const result = registration(settings.value, marketplaces);
  return result.ok ? null : result.hint;
}

export function settingsItem(page = LESSON) {
  return {
    text: 'закоммиченный `.claude/settings.json` регистрирует этот marketplace по относительному пути и включает плагин',
    check(repo) {
      const marketplaces = passingMarketplaces(repo);
      if (!marketplaces.length) return 'Ни один закоммиченный marketplace пока не проходит пункт выше, поэтому проверка не знает, какой из них должен регистрировать `.claude/settings.json`. Сначала исправьте это.';
      const settings = committedSettings(repo);
      const hint = settingsHint(repo, settings, marketplaces, page);
      if (hint === null) return true;
      if (settings !== null && pendingSettings(repo, marketplaces)) return `Ваша копия ${code(SETTINGS)} регистрирует marketplace и включает плагин, но это изменение не закоммичено. Выполните \`git add ${SETTINGS}\` и закоммитьте.`;
      return hint;
    },
  };
}

export const teamMarketplace = marketplaceItem();
export const sharedSettings = settingsItem();

// The frontmatter fields of a committed file.
const fieldsOf = (repo, path) => frontmatter(headText(repo, path) ?? '')?.fields ?? {};

// The names a skill runs under. A project skill runs by its folder's name and
// by its frontmatter `name`; a plugin skill takes its `name` in place of the
// folder's, after the plugin's prefix.
function skillNames(repo, path, inPlugin) {
  const folder = path.split('/').at(-2);
  const name = named(fieldsOf(repo, path).name)?.split(':').pop();
  if (inPlugin) return [name ?? folder];
  return [...new Set([folder, name].filter(Boolean))];
}

// The name a subagent loads under: its frontmatter `name`; a plugin's
// subagent without one takes its file's name.
function agentName(repo, path, inPlugin) {
  const name = named(fieldsOf(repo, path).name)?.split(':').pop();
  return name ?? (inPlugin ? posix.basename(path, '.md') : null);
}

// The hook handlers in a settings-shaped `hooks` object.
function handlers(hooks) {
  if (!isObject(hooks)) return [];
  return Object.values(hooks)
    .flatMap((groups) => (Array.isArray(groups) ? groups : []))
    .flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks : []))
    .filter((h) => isObject(h) && typeof h.type === 'string');
}

// The script paths a command hook names, as written: the words of its command
// and args that look like a file path.
function scripts(handler) {
  if (handler.type !== 'command') return [];
  return [handler.command, ...(Array.isArray(handler.args) ? handler.args : [])]
    .flatMap((t) => String(t ?? '').split(/\s+/))
    .map((w) => w.replace(/["']/g, '').replace(/\\/g, '/'))
    .filter((w) => w && !/[<>|&;]/.test(w) && w !== '/dev/null' && (w.includes('/') || /\.(?:sh|bash|zsh|py|[cm]?js|ts|rb|pl|ps1)$/.test(w)))
    .filter((w) => !INTERPRETERS.has(posix.basename(w)));
}
const commandOf = (h) => (h.type === 'command' ? [h.command, ...(Array.isArray(h.args) ? h.args : [])].map((t) => String(t ?? '').trim()).join(' ') : null);

// What the committed .claude/ still holds: each skill and subagent with the
// names it loads under, and the settings' command hooks.
function projectSetup(repo, files) {
  const settings = committedSettings(repo);
  return {
    skills: files.filter((p) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(p)).map((path) => ({ path, names: skillNames(repo, path, false) })),
    agents: files.filter((p) => /^\.claude\/agents\/.+\.md$/.test(p)).map((path) => ({ path, name: agentName(repo, path, false) })),
    hooks: settings?.value ? handlers(settings.value.hooks) : [],
  };
}

// Whether a plugin's hooks/hooks.json holds a hook moved out of .claude/:
// `{ ok }` or `{ hint }`.
function reviewHooks(repo, plugin, path, project, committed) {
  const parsed = parseJson(headText(repo, path) ?? '');
  if (parsed.error) return { hint: `Закоммиченный ${code(path)} — невалидный JSON: ${parsed.error}` };
  const list = handlers(parsed.value?.hooks);
  if (!list.length) return { hint: `В закоммиченном ${code(path)} нет ни одного hook. Положите запись под ключ верхнего уровня \`hooks\`, в том же виде, что и в файле настроек.` };
  const problems = [];
  const theirs = project.hooks.map((h) => ({ command: commandOf(h), names: scripts(h).map((s) => posix.basename(s)) }));
  for (const h of list) {
    const words = scripts(h);
    const twice = theirs.find((t) => (t.command && t.command === commandOf(h)) || t.names.some((n) => words.some((w) => posix.basename(w) === n)));
    const stays = words.find((w) => /(^|\/)\.claude\//.test(w));
    const missing = words.map((w) => w.match(PLUGIN_ROOT)?.[1]).filter(Boolean).map((rel) => `${plugin.dir ? `${plugin.dir}/` : ''}${posix.normalize(rel)}`).find((p) => !committed.has(p));
    if (twice) problems.push(`\`${SETTINGS}\` по-прежнему запускает тот же hook${twice.names.length ? `, ${code(twice.names[0])}` : ''}, поэтому он выполнялся бы дважды при каждом событии. Удалите этот hook из \`${SETTINGS}\` и закоммитьте.`);
    else if (stays) problems.push(`Hook в ${code(path)} по-прежнему запускает ${code(stays)}, скрипт в \`.claude/\`. Перенесите скрипт в плагин и вызывайте его как \`\${CLAUDE_PLUGIN_ROOT}/<путь в плагине>\`, затем закоммитьте.`);
    else if (missing) {
      problems.push(existsSync(join(repo.dir, missing))
        ? `Hook в ${code(path)} запускает ${code(missing)}, но ${commitHint(repo, missing).replace(/^`[^`]+` /, 'он ')}`
        : `Hook в ${code(path)} запускает ${code(missing)}, которого нет в плагине. Положите скрипт туда или исправьте путь после \`\${CLAUDE_PLUGIN_ROOT}/\` и закоммитьте.`);
    }
    else return { ok: true };
  }
  return { hint: problems[0] };
}

export const movedComponent = {
  text: 'перенесённый вами компонент лежит в плагине и исчез из `.claude/`',
  check(repo) {
    const plugins = listedPlugins(repo);
    if (!plugins.length) return 'Ни один закоммиченный marketplace пока не перечисляет закоммиченный плагин, так что переносить компонент некуда. Пройдите первый пункт, затем перенесите в плагин skill, субагент или hook.';
    const files = committedFiles(repo);
    const committed = new Set(files);
    const project = projectSetup(repo, files);
    const tried = [];
    for (const plugin of plugins) {
      const { skills, agents, hooks } = pluginComponents(files, plugin.dir);
      for (const { path, rel } of skills.filter((s) => !KIT.has(s.rel) && s.rel !== TUTOR)) {
        const [name] = skillNames(repo, path, true);
        const twin = project.skills.find((s) => s.names.includes(name));
        tried.push(twin ? { hint: `${code(path)} лежит в плагине, но ${code(twin.path)} всё ещё закоммичен, поэтому skill загружается дважды, как \`/${name}\` и \`/${plugin.name}:${name}\`. Выполните \`git rm -r ${shell(posix.dirname(twin.path))}\` и закоммитьте.` } : { ok: rel });
      }
      for (const { path, rel } of agents.filter((a) => !KIT.has(a.rel))) {
        const name = agentName(repo, path, true);
        const twin = project.agents.find((a) => a.name === name);
        tried.push(twin ? { hint: `${code(path)} лежит в плагине, но ${code(twin.path)} всё ещё закоммичен, поэтому субагент загружается дважды, как ${code(name)} и ${code(`${plugin.name}:${name}`)}. Выполните \`git rm ${shell(twin.path)}\` и закоммитьте.` } : { ok: rel });
      }
      for (const { path } of hooks) tried.push(reviewHooks(repo, plugin, path, project, committed));
    }
    if (tried.some((t) => t.ok)) return true;
    if (tried.length) return tried[0].hint;
    // Nothing beyond the example's own components is committed.
    const component = /^(?:skills\/[^/]+\/SKILL\.md|agents\/.+\.md|hooks\/hooks\.json)$/;
    const loose = ['skills/*/SKILL.md', 'agents/**/*.md', 'hooks/hooks.json']
      .flatMap((pattern) => uncommittedFiles(repo, pattern))
      .find((p) => plugins.some((pl) => {
        const rel = p.slice(pl.dir ? pl.dir.length + 1 : 0);
        return p.startsWith(pl.dir ? `${pl.dir}/` : '') && component.test(rel) && rel !== TUTOR;
      }));
    if (loose) return commitHint(repo, loose);
    const tutor = plugins.map((pl) => `${pl.dir ? `${pl.dir}/` : ''}${TUTOR}`).find((p) => committed.has(p));
    if (tutor) {
      // Still committed at its own path, the plugin's tutor is a copy: remove it rather than move it back.
      const fix = committed.has(`.claude/${TUTOR}`) ? `Удалите копию командой \`git rm -r ${shell(posix.dirname(tutor))}\`` : 'Верните его в `.claude/skills/tutor/` командой `git mv`';
      return `${code(tutor)} — это skill \`/tutor\` учебной копии, он пришёл с шаблоном, поэтому не считается вашим собственным. ${fix}, затем перенесите в плагин свой skill, субагент или hook и закоммитьте.`;
    }
    const [{ dir }] = plugins;
    const at = (rest) => code(dir ? `${dir}/${rest}` : rest);
    return `В плагине только skill \`onboard\` и субагент \`config-reviewer\` из примера. Перенесите в него свой компонент: skill в ${at('skills/<name>/SKILL.md')}, субагент в ${at('agents/<name>.md')} или hook в ${at('hooks/hooks.json')}, как описано в разделе «Ваша очередь», командой \`git mv\`, чтобы оригинал исчез из \`.claude/\`. Затем закоммитьте.`;
  },
};

function tracked(repo, ...args) {
  try {
    return Boolean(repo.git(...args));
  } catch {
    return false;
  }
}

export const personalFiles = {
  text: 'закоммиченный `.gitignore` исключает `.claude/settings.local.json` и `CLAUDE.local.md`, и git не отслеживает ни тот, ни другой',
  check(repo) {
    const problems = [];
    const unruled = [];
    for (const path of PERSONAL) {
      if (tracked(repo, 'ls-files', '--', path)) {
        problems.push(`git отслеживает ${code(path)}, а этот файл только ваш. Выполните \`git rm --cached ${path}\`, добавьте строку ${code(path)} в \`.gitignore\` и закоммитьте.`);
      } else if (tracked(repo, 'ls-tree', '--name-only', 'HEAD', '--', path)) {
        problems.push(`${code(path)} всё ещё есть в вашем последнем коммите. Закоммитьте его удаление.`);
      } else {
        const rule = committedIgnore(repo, path);
        if (rule.problem === 'none') unruled.push(path);
        else if (rule.problem) problems.push(ignoreHint(rule, path));
      }
    }
    if (unruled.length > 1) problems.push(`Ни один закоммиченный \`.gitignore\` не игнорирует ${and(unruled.map(code))}. Добавьте строки ${and(unruled.map(code))} в \`.gitignore\` и закоммитьте. Правило в вашем глобальном файле исключений git не считается: его нет в репозитории.`);
    else if (unruled.length) problems.push(ignoreHint({ problem: 'none' }, unruled[0]));
    return problems.length ? problems.join(' ') : true;
  },
};

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

// Messages from a failed report: its errors first, then the warnings that
// --strict counts as errors.
function messages(report) {
  const results = [report.manifest, ...(Array.isArray(report.contents) ? report.contents : [])].filter(isObject);
  const text = (m) => (typeof m === 'string' ? m : typeof m?.message === 'string' ? m.message : null);
  return ['errors', 'warnings'].flatMap((k) => results.flatMap((r) => (Array.isArray(r[k]) ? r[k] : []))).map(text).filter(Boolean);
}

// The saved report of `claude plugin validate <plugin folder> --strict --json`.
export function strictValidation(record = VALIDATE) {
  return {
    text: `${code(record)} содержит успешную строгую проверку папки плагина`,
    local: true,
    check(repo) {
      const plugin = mainPlugin(repo);
      const save = `\`claude plugin validate ${shell(relativePath(plugin.dir))} --strict --json > ${record}\``;
      const text = repo.read(record);
      if (text === null || !text.trim()) return `Файла ${code(record)} ещё нет. Когда плагин на месте, выполните из корня репозитория ${save}.`;
      let report;
      try {
        report = JSON.parse(text);
      } catch {
        if (/Validation (passed|failed)/.test(text)) return `В ${code(record)} текстовый отчёт. Сохраните JSON-отчёт с \`--json\`: ${save}.`;
        return `${code(record)} — не JSON. Сохраните отчёт без изменений: ${save}.`;
      }
      if (!isObject(report) || !('success' in report)) return `${code(record)} — не отчёт \`claude plugin validate --json\`: в нём нет \`success\`. Сохраните заново: ${save}.`;
      if (report.success !== true) {
        const found = messages(report);
        const said = found.length ? ` Сообщается: ${found.slice(0, 2).map(code).join('; ')}${found.length > 2 ? ` и ещё ${found.length - 2}` : ''}.` : '';
        return `В ${code(record)} проверка не пройдена.${said} Исправьте то, о чём сообщается, выполняйте \`claude plugin validate ${shell(relativePath(plugin.dir))} --strict\`, пока она не пройдёт, затем сохраните отчёт заново: ${save}.`;
      }
      if (report.strict !== true) return `В ${code(record)} проверка без \`--strict\`, а она пропускает предупреждения. Запустите с \`--strict\`: ${save}.`;
      const target = typeof report.target === 'string' ? report.target.trim() : '';
      if (!target) return `В ${code(record)} нет \`target\`, поэтому проверка не знает, что проверялось. Сохраните отчёт без изменений: ${save}.`;
      const slashed = target.replace(/\\/g, '/');
      if (/(?:^|\/)\.claude-plugin\/marketplace\.json$/.test(slashed)) return `В ${code(record)} проверен marketplace, ${code(target)}, а он не открывает файлы skills и агентов плагина. Проверьте папку плагина: ${save}.`;
      const dirs = pluginFolders(repo);
      if (!dirs.length) return `Нет закоммиченной папки плагина — папки с \`.claude-plugin/plugin.json\`, — которой мог бы соответствовать ${code(record)}. Закоммитьте плагин, затем сохраните отчёт заново: ${save}.`;
      const listed = and(dirs.map((d) => code(relativePath(d))));
      const where = real(target);
      if (where !== null) {
        const ok = dirs.some((d) => {
          const base = real(join(repo.dir, d));
          return base !== null && (where === base || where === join(base, '.claude-plugin', 'plugin.json'));
        });
        if (ok) return true;
        const rel = relative(real(repo.dir) ?? repo.dir, where);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) return `В ${code(record)} проверено ${code(target)}, ${rel ? 'вне этого репозитория' : 'сам репозиторий'}, а не папка плагина в нём (${listed}). Выполните из корня репозитория ${save}.`;
        return `В ${code(record)} проверено ${code(rel.replace(/\\/g, '/'))}, а это не закоммиченная папка плагина (${listed}). Выполните ${save}.`;
      }
      // A path that isn't on this machine was saved elsewhere: it must end in
      // a committed plugin folder, or in that folder's plugin.json.
      const parts = slashed.split('/').filter(Boolean);
      const ends = (tail) => tail.length <= parts.length && tail.every((s, i) => parts[parts.length - tail.length + i] === s);
      if (dirs.some((d) => {
        const own = d ? d.split('/') : [];
        return (own.length && ends(own)) || ends([...own, '.claude-plugin', 'plugin.json']);
      })) return true;
      return `В ${code(record)} проверено ${code(target)}, чего нет на этой машине и что не оканчивается закоммиченной папкой плагина (${listed}). Выполните из корня репозитория ${save}.`;
    },
  };
}

export const items = [teamMarketplace, sharedSettings, movedComponent, personalFiles, strictValidation()];
