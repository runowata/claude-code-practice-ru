---
lesson: b-capstone
title: "Итоговый проект начального уровня: исправляем найденную ошибку, от плана до коммита"
source: docs/beginner/capstone.md
source-commit: 8abdd44
stamp: "Проверено на Claude Code v2.1.285 (stable) 2026-10-05"
page: https://github.com/runowata/claude-code-ru/blob/main/docs/beginner/capstone.md
stuck: https://github.com/runowata/claude-code-ru/issues/new?template=lesson-feedback.yml&lesson=b-capstone
badge: Beginner
---

## intro
- minutes: "от 30 до 60 минут"
- can: "исправить найденную ошибку, от плана до коммита"
- can: "определить, какую модель и какой аккаунт использует сессия"
- can: "переключать режимы разрешений"
- can: "прочитать весь дифф перед коммитом"
- can: "удерживать сессию в рабочем русле"

## steps

### T1 | The task step 1 of 6 | Подготовка
- tier: challenge
- skill: save-version
- where: terminal
- beat: do
- verify: check 0
- watching: .practice/version.txt
- evidence: .practice/version.txt
- goal: "Сохраните вывод `claude --version` в `.practice/version.txt`."
- hint: "Если вы пропустили уроки: создайте в своей копии папку `.practice/` (`mkdir -p .practice`; **Windows:** `New-Item -ItemType Directory -Force .practice`)."
- beat: do
- verify: check 5
- watching: git show HEAD:CLAUDE.md
- say: Закоммитьте `CLAUDE.md`, где указана команда тестов `npm test`.
- expect: "`git show HEAD:CLAUDE.md` его покажет."
- hint: "Его даёт урок 5; если в вашем `npm test` не указан, добавьте."
- hint: "Если вы пропустили урок 5 или выполнили его только в своём репозитории: запустите `claude` в своей копии и выполните `/init`."
- hint: "В новом `CLAUDE.md` удалите всё, что он пишет о файлах самого курса (`checks/`, `learn/`, `capstone/` и `.github/`) и о `npm run check`, `npm run learn` и `npm run test:checks`, включая любое правило не работать в `main`: оно относится к репозиторию шаблона, а не к вашей копии."
- hint: "Любое изменение `CLAUDE.md` закоммитьте отдельно до начала (`git add CLAUDE.md`, затем `git commit -m "Add CLAUDE.md"`)"
- why: "коммит с исправлением может менять только файлы, названные в плане."
- beat: do
- verify: self
- done-label: я выполнил
- say: Если сессия от `/init` там ещё открыта, сначала завершите её.
- goal: "Чтобы воспроизвести ошибку вручную, создайте новую папку вне учебной копии и сохраните в ней `{ "files": ["docs"] }` как `linkcheck.json`."
- do: "Затем выполните в своей копии `npm run linkcheck -- <that folder>`"
- note: "Не кладите `linkcheck.json` в свою копию: проверка сочтёт его изменением."
- win-note: "**Windows:** сохраняйте файл командой `'{ "files": ["docs"] }' | Set-Content <that folder>\linkcheck.json`, а не через `>`."
- beat: ask
- ask: Что он напечатал?
- right: "`All relative links resolve.`"
- stuck: "некорректный JSON с кодом завершения 2"
- because: "**Windows:** сохраняйте файл командой `'{ "files": ["docs"] }' | Set-Content <that folder>\linkcheck.json`, а не через `>`."
- other: Я увидел что-то другое
- reveal: "Затем выполните в своей копии `npm run linkcheck -- <that folder>`: пока ошибка не исправлена, он печатает `All relative links resolve.`"
- beat: do
- verify: git-clean
- watching: git status
- say: Перед началом убедитесь, что в вашей копии нет ничего незакоммиченного.
- hint: "Если `git status --porcelain` перечисляет файлы, закоммитьте их или отложите командой `git stash push --include-untracked`."
- hint: "Не кладите `linkcheck.json` в свою копию: проверка сочтёт его изменением."
- why: "`.practice/capstone-before.txt`, сохранённый, пока план был на экране, не перечисляет изменённых файлов."

### T2 | The task step 2 of 6 | Спланируйте исправление
- tier: challenge
- skill: plan-mode
- where: claude
- beat: do
- where: terminal
- verify: self
- done-label: plan mode включён
- goal: "Начните сессию и переключитесь в plan mode до первого запроса."
- note: "Удерживайте сессию в рабочем русле по ходу работы: смотрите `/context`, сжимайте контекст или откатывайте, когда это помогает."
- hint: "запустите `claude` в своей копии"
- hint: "Если `Shift+Tab` ничего не делает, нажмите вместо него `Alt+M`"
- beat: do
- verify: self
- done-label: план на экране
- goal: "Затем пусть Claude прочитает отчёт об ошибке и составит план исправления."
- note: "Коллега завёл отчёт об ошибке в файле `capstone/beginner-bug.md` в вашей учебной копии"
- do: "Попросите план, в котором тест добавляется и запускается до изменения кода, чтобы увидеть его падение"
- hint: "напиши падающий тест, воспроизводящий проблему, затем исправь её"
- beat: ask
- ask: Что меняет план на экране?
- right: "два файла с исходным кодом и хотя бы один тестовый файл"
- option: один файл с исходным кодом и хотя бы один тестовый файл
- stuck: файлы с исходным кодом, но ни одного тестового
- because: "Попросите план, в котором тест добавляется и запускается до изменения кода, чтобы увидеть его падение"
- other: Я увидел что-то другое
- reveal: "Исправление затрагивает два файла с исходным кодом и хотя бы один тестовый файл."

### T3 | The task step 3 of 6 | Сохраните план
- tier: challenge
- skill: snapshot
- where: shell
- beat: predict
- safety: plan-approval
- ask: Угадайте: итоговый план на экране. Что вы сделаете в первую очередь?
- option: Одобрю план
- right: Сохраню, что видит git, из другого терминала
- option: Попрошу Claude запустить тесты
- reveal: "`.practice/capstone-before.txt`, сохранённый, пока план был на экране, не перечисляет изменённых файлов."
- beat: do
- verify: check 1 fresh since T2
- watching: .practice/capstone-before.txt
- evidence: .practice/capstone-before.txt
- say: Оставьте итоговый план на экране и сохраните то, что git видит сейчас.
- hint: "Пока итоговый план на экране, откройте другой терминал в той же папке."
- hint: "Сохраните `git status --porcelain` в `.practice/capstone-before.txt`."
- beat: do
- verify: file .practice/capstone-plan.txt fresh since T2
- watching: .practice/capstone-plan.txt
- goal: "Сохраните файлы, которые план изменит, включая все тестовые, в `.practice/capstone-plan.txt`: по одному пути в строке, относительно корня репозитория, с прямыми слэшами, например `src/cli.js`."
- why: "коммит с исправлением может менять только файлы, названные в плане."

### T4 | The task step 4 of 6 | Понаблюдайте за тестом
- tier: challenge
- skill: run-tests
- where: claude
- beat: do
- verify: self
- done-label: одобрено
- goal: "Одобрите план."
- note: "Чтобы прочитать вывод тестов, а не только отчёт Claude, нажмите `Ctrl+O`, как в [уроке 3](03-first-change.md#worked-example), и `Esc`, чтобы вернуться"
- beat: ask
- ask: Что сделал новый тест?
- right: "падает, а после исправления проходит"
- option: прошёл с первого запуска
- because: "напиши падающий тест, воспроизводящий проблему, затем исправь её"
- option: вообще не запускался
- because: "Попросите план, в котором тест добавляется и запускается до изменения кода, чтобы увидеть его падение"
- other: Я увидел что-то другое
- reveal: "Посмотрите, как новый тест падает, а после исправления проходит."
- beat: do
- where: shell
- verify: check 3 4
- watching: npm test
- expect: "`npm run linkcheck -- <that folder>` завершается с кодом 2."
- expect: "`npm test` проходит."
- bottom: "npm run linkcheck -- <that folder>"

### T5 | The task step 5 of 6 | Просмотрите
- tier: challenge
- skill: review-diff
- where: claude
- beat: do
- verify: self
- done-label: прочитал всё
- goal: "Просмотрите весь дифф, включая тестовый файл, как в [уроке 3](03-first-change.md#worked-example)."
- note: "Список в панели диффа скрывает тестовые файлы, пока вы не нажмёте строку, которая их считает"
- hint: "`git diff` не показывает новый файл, пока вы не выполните `git add -N <file>`"
- beat: do
- verify: self
- done-label: попросил правку
- goal: "Попросите хотя бы одну правку, которая остаётся в файлах из плана, и убедитесь, что `npm test` проходит."
- beat: do
- where: shell
- verify: check 4
- watching: npm test
- say: Когда правка внесена, снова проверьте тесты.
- expect: "`npm test` проходит."

### T6 | The task step 6 of 6 | Закоммитьте
- tier: challenge
- skill: commit
- where: claude
- beat: do
- verify: self
- done-label: закоммичено
- goal: "Закоммитьте исправление и его тест вместе"
- beat: do
- where: shell
- verify: check 2 fresh since T2
- watching: .practice/capstone-commit.txt
- evidence: .practice/capstone-commit.txt
- say: Сохраните коммит для проверки.
- hint: "Проверка читает только этот коммит, поэтому если вы позже его измените, сохраните снова."
- hint: "сохраните коммит командой `git rev-parse HEAD > .practice/capstone-commit.txt`"
- why: "коммит с исправлением может менять только файлы, названные в плане."
- beat: do
- where: shell
- verify: git-clean
- watching: git status
- say: Не оставляйте ничего незакоммиченным.
- hint: "Проверка читает только этот коммит, поэтому если вы позже его измените, сохраните снова."
- hint: "Если `git status --porcelain` перечисляет файлы, закоммитьте их или отложите командой `git stash push --include-untracked`."

### C | Check | Проверка
- tier: challenge
- skill: check
- where: shell
- beat: do
- verify: check all
- goal: "Запустите `npm run check -- b-capstone` в учебной копии."
- hint: "Каждый невыполненный пункт напечатает, что исправить."
- beat: type
- ask: Какая клавиша переключает режимы разрешений?
- accept: Shift+Tab
- accept: Alt+M
- hint: "Начните сессию и переключитесь в plan mode до первого запроса."
- hint: "Если `Shift+Tab` ничего не делает, нажмите вместо него `Alt+M`"
- reveal: "Я могу переключать режимы разрешений через `Shift+Tab` и сказать, какой из них нужен для задачи."
- beat: self
- done-label: да, умею
- note: "Эти части итога начального уровня проверка не просматривает. Отметьте их сами, честно"
- self: "Я могу определить, какую модель и какой аккаунт использует сессия, с помощью `/status`."
- beat: self
- done-label: да, умею
- self: "Я могу переключать режимы разрешений через `Shift+Tab` и сказать, какой из них нужен для задачи."
- beat: self
- done-label: да, сделал
- self: "Я прочитал весь дифф перед коммитом и попросил Claude хотя бы об одной правке."
- beat: self
- done-label: да, умею
- self: "Я могу удерживать сессию в рабочем русле с помощью `/context`, `/clear`, `/compact`, `/rewind` и `/resume`."
- beat: self
- done-label: да, видел
- self: "Я видел, как новая сессия следует правилу из CLAUDE.md, которое я не повторял в запросе."
- note: "Если вы пропустили урок 5, его [разбор на примере](05-project-memory.md#worked-example) покажет, как это сделать."
- after: "Когда на этой странице отмечены все пункты, вы готовы к [среднему уровню](../intermediate/README.md)."

## ladder

### `.practice/version.txt` содержит вывод `claude --version`
- narrow "Файла `.practice/version.txt` пока нет": В какой папке ищет проверка, и это та папка, где вы сохраняли файл?
- narrow "пуст. Запустите `claude --version` отдельно": Что выводит `claude --version`, если запустить её отдельно?
- narrow "должна быть строка вида": Что сейчас лежит в `.practice/version.txt`?

### `.practice/capstone-before.txt`, сохранённый, пока план был на экране, не содержит изменённых файлов
- narrow "Пока план на экране, выполните": Вы сохранили файл из терминала, открытого в учебной копии, пока план ещё был на экране?
- narrow "Файлы изменились ещё до того, как вы одобрили план": Вы сохранили его, пока план ещё ждал одобрения, до того как Claude изменил какой-либо файл?
- hint: "Если `git status --porcelain` перечисляет файлы, закоммитьте их или отложите командой `git stash push --include-untracked`."
- hint: "Начните сессию и переключитесь в plan mode до первого запроса."

### коммит из `.practice/capstone-commit.txt` меняет только файлы, перечисленные в `.practice/capstone-plan.txt`, и среди них есть тест
- narrow "Перед одобрением сохраните файлы": Есть ли в учебной копии `.practice/capstone-plan.txt` с одним путём в каждой строке?
- narrow "После коммита с исправлением выполните": Исправление закоммичено, и вы сохранили этот коммит в файл, который читает проверка?
- narrow "это не коммит этого репозитория": Лежит ли в файле то, что печатает `git rev-parse HEAD` в вашей учебной копии?
- narrow "Коммит меняет файлы, которых нет в плане": Сохранён ли ваш коммит с исправлением, а не более ранний, например коммит с CLAUDE.md? Если план, который вы одобрили, называл перечисленные файлы, сохранили ли вы каждый из них, в том числе каждый тестовый?
- narrow "Коммит не меняет ни одного файла с тестами": Лежит ли новый тест в том же коммите, что и исправление?
- hint: "Закоммитьте исправление и его тест вместе"
- hint: "Сохраните файлы, которые план изменит, включая все тестовые, в `.practice/capstone-plan.txt`: по одному пути в строке, относительно корня репозитория, с прямыми слэшами, например `src/cli.js`."

### описанная ошибка исправлена: отсутствующая папка в `linkcheck.json` завершает программу с кодом 2
- narrow "Программа завершилась с кодом 0, а не 2": Какой код завершения требует отчёт об ошибке, когда папки из `linkcheck.json` не существует?
- hint: "Коллега завёл отчёт об ошибке в файле `capstone/beginner-bug.md` в вашей учебной копии: когда `linkcheck.json` перечисляет несуществующую папку, инструмент сообщает, что все ссылки в порядке, и завершается с кодом 0."
- hint: "Чтобы воспроизвести ошибку вручную, создайте новую папку вне учебной копии и сохраните в ней `{ "files": ["docs"] }` как `linkcheck.json`."

### тесты проходят
- narrow "`npm test` завершается ошибкой": Какую первую ошибку печатает `npm test`?
- narrow "нет скрипта `npm test`": Читает ли проверка вашу учебную копию, ту, где лежит отчёт об ошибке из итогового проекта?
- narrow "а не код выхода": Что сейчас лежит в `.practice/b-3-tests.txt`?
- narrow "тесты завершились с кодом": Проходят ли тесты, если запустить их сейчас?
- bottom: "npm test"

### закоммиченный CLAUDE.md называет команду тестов, `npm test`
- narrow "нет `npm test`": Что печатает `git show HEAD:CLAUDE.md` и называет ли он команду тестов?
- narrow "Закоммиченного CLAUDE.md нет": Печатает ли `git show HEAD:CLAUDE.md` файл или ошибку?

### не осталось незакоммиченных изменений
- narrow "Эти изменения не закоммичены": Какие файлы перечисляет проверка и относятся ли они к коммиту с исправлением?
- hint: "Проверка читает только этот коммит, поэтому если вы позже его измените, сохраните снова."
- hint: "Не кладите `linkcheck.json` в свою копию: проверка сочтёт его изменением."
