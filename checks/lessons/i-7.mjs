// Connect a tool with MCP (Intermediate, lesson 7). The Learner shares Chrome
// DevTools MCP at project scope in a committed .mcp.json, pinned to one
// version with the server's three outbound data flows turned off, and saves
// a screenshot a session took with it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const title = 'Подключите инструмент через MCP';

const SHOT = '.practice/i-7-page.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function server(value) {
  const servers = value?.mcpServers ?? {};
  return Object.values(servers).find((s) => (s?.args ?? []).some((a) => /^chrome-devtools-mcp(@|$)/.test(String(a))));
}

const off = (args, name) => args.includes(`--no-${name}`) || args.includes(`--${name}=false`);

export const items = [
  {
    text: 'закоммиченный `.mcp.json` запускает chrome-devtools-mcp точной версии, с выключенными статистикой использования, запросами CrUX и проверкой обновлений',
    check(repo) {
      let text;
      try {
        text = repo.git('show', 'HEAD:.mcp.json');
      } catch {
        return repo.exists('.mcp.json') ? '.mcp.json не закоммичен. Выполните `git add .mcp.json` и закоммитьте его: серверы уровня проекта передаются коллегам через него.' : 'В корне репозитория нет .mcp.json. Сохраните заготовку из раздела «Ваша очередь» урока.';
      }
      let value;
      try {
        value = JSON.parse(text);
      } catch (error) {
        return `Закоммиченный .mcp.json — не корректный JSON: ${error.message}`;
      }
      const s = server(value);
      if (!s) return 'Ни один сервер в .mcp.json не запускает chrome-devtools-mcp. Добавьте его в `mcpServers`, как в уроке.';
      const args = (s.args ?? []).map(String);
      const pkg = args.find((a) => a.startsWith('chrome-devtools-mcp'));
      if (!/^chrome-devtools-mcp@\d+\.\d+\.\d+$/.test(pkg)) return `Версия \`${pkg}\` не закреплена. Укажите точную версию, например \`chrome-devtools-mcp@1.10.1\`, чтобы каждый коллега запускал тот код, который вы проверили.`;
      if (!off(args, 'usage-statistics')) return 'Статистика использования всё ещё включена. Добавьте `--no-usage-statistics` в args.';
      if (!off(args, 'performance-crux')) return 'Трассировки производительности всё ещё могут отправлять URL в CrUX API Google. Добавьте `--no-performance-crux` в args.';
      if (!String(s.env?.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS ?? '').trim()) return 'Проверка обновлений всё ещё включена. Задайте `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` равным `"1"` в `env` сервера.';
      return true;
    },
  },
  {
    text: '`.practice/i-7-page.png` — скриншот, сохранённый сервером',
    local: true,
    check(repo) {
      const path = join(repo.dir, SHOT);
      if (!existsSync(path)) return `Файла ${SHOT} нет. Попросите Claude открыть страницу инструментами chrome-devtools и сохранить скриншот в ${SHOT}.`;
      return readFileSync(path).subarray(0, 8).equals(PNG_SIGNATURE) ? true : `${SHOT} — не изображение PNG. Попросите Claude сохранить скриншот заново, в формате PNG.`;
    },
  },
];
