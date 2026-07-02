# 📌 TASK-001: Network Interceptor for Accurate Unread Detection

## 🎯 Проблема

DOM-парсинг (`querySelectorAll('.llc__content')`) не определяет статус непрочитанных писем. Все письма возвращают `isUnread: false`, хотя в интерфейсе Mail.ru есть визуальные маркеры "New". Селекторы и `getComputedStyle` ненадёжны из-за динамического рендеринга.

## ✅ Цель

Переписать `content.js` на перехват внутренних API-запросов Mail.ru (`fetch` hook). Извлекать данные и статус `unread` напрямую из JSON-ответов сервера, гарантируя 100% точность.

## 📁 Файлы для изменения

| Файл            | Действие              | Описание                                                                               |
| --------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `content.js`    | 🔄 Полная замена      | Удалить DOM-парсинг. Добавить `fetch` interceptor, JSON-парсер, отправку в background. |
| `background.js` | ➕ Минимальная правка | Добавить логирование `source: 'network-api'` в обработчик `emailsExtracted`.           |
| `popup.js`      | ✅ Без изменений      | Уже поддерживает `inboxActive` и рендеринг. Только тестирование.                       |

## План реализации

### 1. content.js — Перехватчик API

- Хукнуть `window.fetch` в IIFE.
- Фильтровать запросы: `url.includes('mail.ru') && (url.includes('inbox') || url.includes('msglist') || url.includes('messages'))`.
- Клонировать ответ: `response.clone().json()`.
- Парсить JSON: поддержка структур `{messages: [...]}`, `{body: {messages: [...]}}`, `{data: {list: [...]}}`.
- Маппинг полей:
  ```js
  {
    sender: msg.from?.name || msg.from?.email || msg.sender || 'Unknown',
    senderEmail: msg.from?.email || '',
    subject: msg.subject || 'Без темы',
    date: msg.date || msg.receivedAt || '',
    isUnread: msg.unread === true || msg.read === false || msg.flags?.unread === true,
    href: `/message/${msg.id || msg.messageId}/`,
    msgId: msg.id || msg.messageId || ''
  }
  Отправлять в background: chrome.runtime.sendMessage({ action: 'emailsExtracted', source: 'network-api', ... }).
  Сохранить логику isInboxPage() и отправку inboxStatus.
  ```

2. background.js — Обработка нового источника

В существующем обработчике emailsExtracted добавить проверку request.source === 'network-api' для логирования.
Убедиться, что storage, badge, notifications работают идентично DOM-версии. 3. popup.js — Проверка
Убедиться, что при открытии popup данные загружаются корректно.
Проверить переключение /inbox/ ↔ /message/... (флаг inboxActive).

🧪 Чек-лист тестирования
консоли content script видно: Перехвачен API запрос: ...
В консоли видно: Найдено X писем, непрочитанных: Y (Y > 0)
Popup показывает корректное количество непрочитанных
Badge на иконке обновляется
Переход на /message/... → popup показывает "📥 Откройте Входящие"
Возврат во входящие → данные обновляются автоматически
Исходные запросы Mail.ru не блокируются, почта работает штатно
Нет ошибок Unchecked runtime.lastError в консолях

🤖 Правила для агента
НЕ блокируй оригинальные запросы — всегда возвращай оригинальный response.
Обрабатывай ошибки — try/catch вокруг clone().json(), игнорируй не-JSON ответы.
Не спамь background — отправляй сообщение только если emails.length > 0.
Сохраняй архитектуру — inboxActive, storage, badge должны работать как раньше.
Пиши чистый код — 2 пробела, const/let, асинхронные onMessage с return true.

📤 Формат ответа агента
Полный код content.js (готовый к замене)
Дифф для background.js (если менялся)
Краткая инструкция по тесту
Git-команда для коммита
