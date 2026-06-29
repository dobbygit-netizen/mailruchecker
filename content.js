// content.js - Content Script для Mail.ru Checker
console.log('📬 Mail.ru Checker: Content Script loaded');

// Функция извлечения всех писем
function extractEmails() {
  const emails = [];
  const rows = document.querySelectorAll('.llc__content');
  
  console.log(`🔍 Найдено строк писем: ${rows.length}`);
  
  rows.forEach((row, index) => {
    try {
      // Отправитель
      const senderEl = row.querySelector('.llc__item_correspondent .ll-crpt');
      const sender = senderEl ? senderEl.textContent.trim() : 'Unknown';
      const senderTitle = senderEl?.getAttribute('title') || '';
      const senderEmail = senderTitle.match(/<([^>]+)>/)?.[1]?.trim() || 
                          (senderTitle.includes('@') ? senderTitle : sender);
      
      // Тема
      const subjectEl = row.querySelector('.llc__subject');
      const subject = subjectEl ? subjectEl.textContent.trim() : 'Без темы';
      
      // Дата/время
      const dateEl = row.querySelector('.llc__item_time') || 
                     row.querySelector('[class*="time"]');
      const date = dateEl ? dateEl.textContent.trim() : '';
      
      // 🔍 НАДЕЖНАЯ проверка непрочитанного
      let isUnread = false;
      const debugInfo = {};
      
      // ✅ ГЛАВНЫЙ ПРИЗНАК: жирная тема (класс unread)
      if (subjectEl && subjectEl.classList.contains('llc__subject_unread')) {
        isUnread = true;
      }
      debugInfo.hasUnreadSubjectClass = subjectEl?.classList.contains('llc__subject_unread');
      
      // ✅ Дополнительный: отдельный элемент непрочитанной темы
      const unreadSubjectEl = row.querySelector('.llc__subject_unread');
      debugInfo.hasUnreadSubjectEl = !!unreadSubjectEl;
      if (unreadSubjectEl && !isUnread) isUnread = true;
      
      // ✅ Класс у родителя
      const parentItem = row.closest('[class*="datalist"], [class*="llc__item"]');
      if (parentItem) {
        const parentClasses = parentItem.className;
        debugInfo.parentClasses = parentClasses;
        if (parentClasses.includes('unread') || parentClasses.includes('mod_unread')) {
          isUnread = true;
        }
      }
      
      // ❌ НЕ ПРОВЕРЯЕМ .ll-fs_new — это просто кнопка флажка!
      
      // 🔍 ОТЛАДКА: выводим первые 5 писем
      if (index < 5) {
        console.log(`📧 Письмо #${index + 1}:`, {
          sender: sender.substring(0, 20),
          subject: subject.substring(0, 30),
          isUnread,
          debug: debugInfo
        });
      }
      
      // Извлекаем ссылку или ID
      let href = '';
      let msgId = '';
      
      const linkEl = row.closest('a') || row.querySelector('a');
      if (linkEl) {
        href = linkEl.getAttribute('href') || '';
        const match = href.match(/\/message\/([^/]+)/);
        if (match) msgId = match[1];
      }
      
      const rowWithId = row.closest('[data-msg-id]') || row.querySelector('[data-msg-id]');
      if (rowWithId?.dataset?.msgId) {
        msgId = rowWithId.dataset.msgId;
      }
      
      emails.push({
        sender,
        senderEmail: senderEmail.replace(/&lt;/g, '').replace(/&gt;/g, '').trim(),
        subject,
        date,
        isUnread,
        href,
        msgId
      });
      
    } catch (e) {
      console.error('Ошибка парсинга письма:', e);
    }
  });
  
  return emails;
}

// Отправка данных в background
function sendToBackground() {
  const emails = extractEmails();
  const unread = emails.filter(e => e.isUnread);
  
  console.log(`📬 Content Script: найдено ${emails.length} писем, непрочитанных: ${unread.length}`);
  
  // Выводим список непрочитанных для отладки
  if (unread.length > 0) {
    console.log('🔴 Непрочитанные:', unread.map(e => `${e.sender}: ${e.subject}`));
  } else {
    console.log('✅ Все письма прочитаны');
  }
  
  chrome.runtime.sendMessage({
    action: 'emailsExtracted',
    total: emails.length,
    unread: unread.length,
    emails: emails,
    unreadEmails: unread,
    timestamp: Date.now()
  });
}

// Слушаем сообщения от background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getEmails') {
    const emails = extractEmails();
    const unread = emails.filter(e => e.isUnread);
    
    sendResponse({
      success: true,
      total: emails.length,
      unread: unread.length,
      emails: emails,
      unreadEmails: unread
    });
    return true;
  }
  
  if (request.action === 'checkNow') {
    sendToBackground();
    sendResponse({ success: true });
    return true;
  }
});

// Отправляем данные при загрузке страницы
setTimeout(() => {
  sendToBackground();
}, 2000);

// Наблюдаем за изменениями (но НЕ отправляем автоматически, чтобы не спамить)
const observer = new MutationObserver(() => {
  if (observer.timeout) clearTimeout(observer.timeout);
  observer.timeout = setTimeout(() => {
    // sendToBackground(); // ← ЗАКОММЕНТИРОВАНО: не спамим уведомлениями
    console.log('👀 DOM изменился (автообновление отключено)');
  }, 2000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('✅ Content Script готов к работе');