# Русский перевод учебного шаблона

Форк `wesammustafa/claude-code-practice`. Перевод сделан по коммиту оригинала из `UPSTREAM_SHA`.
Правила, словарь и порядок синхронизации — в репозитории руководства
`runowata/claude-code-ru`: `.translation/PLAN.md`, `.translation/GLOSSARY.md`.

Что переведено: `learn/lessons/*.md` (цитаты — дословно из русских страниц руководства), видимые строки
`learn/lib/*.mjs`, подсказки `checks/**/*.mjs`, `README.md`, `capstone/*.md`; тесты подогнаны.
Не переведено: подписи шагов в `learn/lessons` (`Worked example step N of M`, `Your turn` …) — их читает
парсер, ученику они не показываются; `src/`, `test/`, `samples/` — учебный проект.
