document.addEventListener('DOMContentLoaded', async () => {
  console.log('📦 Popup открыт');
  
  const emailList = document.getElementById('emailList');
  const totalEl = document.getElementById('total');
  const unreadEl = document.getElementById('unread');
  const checkBtn = document.getElementById('checkBtn');
  const openBtn = document.getElementById('openBtn');
  
  if (!totalEl || !unreadEl) {
    console.error('Не найдены элементы статистики');
    return;
  }
  
  // Показываем индикатор загрузки
  if (emailList) {
    emailList.innerHTML = '<div class="empty">⏳ Загрузка...</div>';
  }
  
  // Функция отрисовки
  function renderEmails(emails) {
    if (!emailList) return;
    
    if (!emails || emails.length === 0) {
      emailList.innerHTML = '<div class="empty">Нет писем</div>';
      return;
    }
    
    emailList.innerHTML = emails.map(email => `
      <div class="email-item ${email.isUnread ? 'unread' : ''}" 
           style="cursor: pointer;"
           data-href="${email.href || ''}"
           data-msgid="${email.msgId || ''}">
        <div class="email-sender">
          ${email.sender || 'Неизвестно'}
          ${email.isUnread ? '<span class="badge">NEW</span>' : ''}
        </div>
        <div class="email-subject">${email.subject || 'Без темы'}</div>
        <div class="email-date">${email.date || ''}</div>
      </div>
    `).join('');
    
    document.querySelectorAll('.email-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        
        const href = item.dataset.href;
        const msgId = item.dataset.msgid;
        
        let url = 'https://e.mail.ru/inbox/';
        
        if (msgId) {
          url = `https://e.mail.ru/message/${msgId}/`;
        } else if (href && href.startsWith('/')) {
          url = `https://e.mail.ru${href}`;
        }
        
        chrome.tabs.create({ url });
      });
    });
  }
  
  // ✅ ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ ДАННЫХ ПРИ ОТКРЫТИИ
  async function forceRefresh() {
    console.log('🔄 Принудительное обновление данных...');
    
    try {
      const tabs = await chrome.tabs.query({ url: 'https://e.mail.ru/*', active: true });
      
      if (tabs.length > 0) {
        console.log('📤 Отправляем запрос content script...');
        await chrome.tabs.sendMessage(tabs[0].id, { action: 'checkNow' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ Content script получил команду');
      } else {
        console.log('⚠️ Вкладка Mail.ru не найдена');
      }
    } catch (error) {
      console.error('Ошибка при запросе обновления:', error);
    }
  }
  
  // Загрузка и отображение данных
  async function loadData() {
    console.log('📥 Загрузка данных (прямой запрос)...');
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getLatestData' });
      
      if (!response?.success) {
        throw new Error('Background не ответил');
      }
      
      console.log('📊 Получено от background:', {
        total: response.total,
        unread: response.unread,
        emailsCount: response.emails?.length
      });
      
      const total = response.total;
      const unread = response.unread;
      
      if (totalEl) totalEl.textContent = total;
      if (unreadEl) unreadEl.textContent = unread;
      
      const unreadEmails = response.unreadEmails || [];
      const allEmails = response.emails || [];
      
      // ✅ УБИРАЕМ ДУБЛИКАТЫ: объединяем и фильтруем уникальные письма
      const seenSubjects = new Set();
      const uniqueEmails = [];
      
      // Сначала добавляем непрочитанные
      unreadEmails.forEach(email => {
        const key = `${email.sender}-${email.subject}`;
        if (!seenSubjects.has(key)) {
          uniqueEmails.push(email);
          seenSubjects.add(key);
        }
      });
      
      // Потом добавляем прочитанные (если их еще нет)
      allEmails.forEach(email => {
        const key = `${email.sender}-${email.subject}`;
        if (!seenSubjects.has(key) && uniqueEmails.length < 10) {
          uniqueEmails.push(email);
          seenSubjects.add(key);
        }
      });
      
      // Берем максимум 10 писем
      const displayEmails = uniqueEmails.slice(0, 10);
      
      console.log(`📬 Показываем ${displayEmails.length} писем (без дубликатов)`);
      renderEmails(displayEmails);
      
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      
      // Fallback: читаем из storage, если background не ответил
      console.log('⚠️ Пробуем читать из storage напрямую...');
      const data = await chrome.storage.local.get([
        'emails', 'unreadEmails', 'totalEmails', 'unreadCount', 'totalUnread'
      ]);
      
      const total = data.totalEmails || 0;
      const unread = data.unreadCount || data.totalUnread || 0;
      
      if (totalEl) totalEl.textContent = total;
      if (unreadEl) unreadEl.textContent = unread;
      
      const unreadEmails = data.unreadEmails || [];
      const allEmails = data.emails || [];
      
      // ✅ Также убираем дубликаты в fallback
      const seenSubjects = new Set();
      const uniqueEmails = [];
      
      unreadEmails.forEach(email => {
        const key = `${email.sender}-${email.subject}`;
        if (!seenSubjects.has(key)) {
          uniqueEmails.push(email);
          seenSubjects.add(key);
        }
      });
      
      allEmails.forEach(email => {
        const key = `${email.sender}-${email.subject}`;
        if (!seenSubjects.has(key) && uniqueEmails.length < 10) {
          uniqueEmails.push(email);
          seenSubjects.add(key);
        }
      });
      
      const displayEmails = uniqueEmails.slice(0, 10);
      renderEmails(displayEmails);
    }
  }
  
  // Кнопка проверки
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      checkBtn.textContent = '⏳ Проверка...';
      await forceRefresh();
      await loadData();
      checkBtn.textContent = '✅ Проверено';
      setTimeout(() => {
        checkBtn.textContent = '🔄 Проверить';
      }, 1000);
    });
  }
  
  // Кнопка открыть почту
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://e.mail.ru/inbox/' });
    });
  }
  
  // Автообновление при изменении storage
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.unreadCount || changes.emails)) {
      console.log('📦 Storage изменился, обновляем...');
      loadData();
    }
  });
  
  console.log('✅ Popup инициализирован');
});