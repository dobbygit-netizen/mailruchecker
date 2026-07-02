# 📜 Правила проекта — Mail.ru Checker

##  Философия
- **Стабильность > фичи**: если работает — не трогай без необходимости
- **Минимум зависимостей**: только нативный Chrome Extensions API
- **Локальность**: все данные в `chrome.storage.local`, никакой синхронизации между устройствами

## 🔧 Код-стайл
- Отступы: 2 пробела, без табов
- Переменные: `const` по умолчанию, `let` только при изменении
- Асинхронность: все `chrome.runtime.onMessage` → `return true` + `sendResponse()` внутри колбэка
- Ошибки: `console.error()` в content scripts, не `throw` (чтобы не крашить вкладку)
- Селекторы: всегда с фоллбэками, Mail.ru может менять DOM

##  Конвенции коммитов
<type>(<scope>): <короткое описание>
[опционально: детали]
**Типы:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`  
**Скоупы:** `content`, `background`, `popup`, `manifest`, `api`, `ui`

**Пример:**
fix(content): improve unread detection via font-weight check
add computed style check for bold text
fallback to parent class inspection
add debug logging for first 5 emails


## 🧪 Чек-лист перед пушем
- [ ] Content script не парсит на `/message/...`
- [ ] Popup показывает "📥 Откройте Входящие" при `!inboxActive`
- [ ] Badge обновляется при новых письмах
- [ ] Нет ошибок в консоли (content + background + popup)
- [ ] `RULES.md` и `tasks/` актуальны

## 🤖 Работа с AI-агентами
- Все задачи хранятся в папке `tasks/` (локально)
- Перед запуском агента: обнови `TASK_*.md` → скопируй в промпт
- После выполнения: проверь дифф → протестируй → закоммить
- Не копируй сырые ответы агента без ревью

## 🚫 Строго запрещено
- Добавлять внешние библиотеки без обсуждения
- Менять `manifest.json` без причины
- Удалять `try/catch` в парсерах
- Пушить приватные ключи/токены

---
*Последнее обновление: 2026-06-29*
