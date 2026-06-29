// Offscreen Document для проверки почты Mail.ru
// Используется для парсинга HTML и работы с DOM

console.log('Offscreen document загружен');

// Слушаем сообщения от background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') {
    return;
  }
  
  console.log('Offscreen получил сообщение:', request);
  
  switch (request.action) {
    case 'checkAccount':
      checkMailruAccount(request.account)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Асинхронный ответ
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

async function checkMailruAccount(account) {
  console.log(`Offscreen: проверка аккаунта ${account.email}`);
  
  try {
    // Метод 1: NaviData (наш найденный рабочий метод)
    const naviResult = await checkViaNaviData(account);
    if (naviResult !== null) {
      return { unread: naviResult };
    }
    
    // Метод 2: API (резервный, если NaviData не сработает)
    const apiResult = await checkViaAPI(account);
    if (apiResult !== null) {
      return { unread: apiResult };
    }
    
    // Метод 3: Fetch (последний резерв)
    const fetchResult = await checkViaFetch();
    return { unread: fetchResult };
    
  } catch (error) {
    console.error('Ошибка проверки почты:', error);
    throw error;
  }
}

async function checkViaNaviData(account) {
  console.log('🔄 Пробуем NaviData API...');
  
  try {
    // Формируем URL. Login берем из аккаунта, чтобы запрос был персонализированным
    const login = account.email.split('@')[0];
    const url = `https://portal.mail.ru/NaviData?mac=1&Socials=1&gamescnt=1&external_mail_quota=1&login=${login}`;
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include', // ВАЖНО: отправляем куки
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('📡 NaviData статус:', response.status);
    
    if (!response.ok) {
      console.log('❌ NaviData API вернул ошибку');
      return null;
    }
    
    const data = await response.json();
    console.log('📦 NaviData ответ:', JSON.stringify(data, null, 2));
    
    // Извлекаем mail_cnt
    if (data.status === 'ok' && data.data && data.data.mail_cnt) {
      const count = parseInt(data.data.mail_cnt, 10);
      console.log(`✅ Найдено через NaviData: ${count} непрочитанных`);
      return count;
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Ошибка NaviData:', error);
    return null;
  }
}

// Извлечение счётчика непрочитанных
function extractUnreadCount(data) {
  if (!data) return null;
  
  console.log('🔍 Ищем unread_count в:', Object.keys(data));
  
  // Проверяем counters object
  if (data.counters) {
    const counters = data.counters;
    console.log('📊 Counters:', counters);
    
    const unread =
      counters['inbox'] ??
      counters['0'] ??
      counters.unread ??
      counters.unread_count ??
      counters.count_unread ??
      counters.new;
      
    if (unread !== undefined && unread !== null) {
      return Number(unread);
    }
  }
  
  // Проверяем body object
  if (data.body) {
    const body = data.body;
    
    // Прямые поля
    const unread =
      body.unread ??
      body.unread_count ??
      body.unreadCount ??
      body.count_unread ??
      body.new_count;
      
    if (unread !== undefined && unread !== null) {
      return Number(unread);
    }
    
    // Проверяем folders array
    if (Array.isArray(body.folders)) {
      const inbox = body.folders.find(f =>
        f.id === '0' || f.id === 0 ||
        f.name === 'Inbox' || f.name === 'INBOX' ||
        f.slug === 'inbox' || f.type === 'inbox'
      );
      if (inbox) {
        const unread =
          inbox.unread ??
          inbox.unread_count ??
          inbox.count_unread ??
          inbox.new_count;
          
        if (unread !== undefined && unread !== null) {
          return Number(unread);
        }
      }
    }
  }
  
  // Прямая проверка data
  const directUnread =
    data.unread ??
    data.unread_count ??
    data.unreadCount ??
    data.count_unread ??
    data.new_count;
    
  if (directUnread !== undefined && directUnread !== null) {
    return Number(directUnread);
  }
  
  return null;
}

// Проверка через парсинг страницы в iframe с подробными логами
async function checkViaIframe(account) {
  console.log('Начинаем проверку через iframe для аккаунта', account.email);
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = 'https://e.mail.ru/inbox/';
    document.body.appendChild(iframe);
    console.log('iframe создан и добавлен в документ');

    const result = await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.warn('iframe загрузка превысила таймаут, переходим к fetch');
        resolve(null);
      }, 8000);

      iframe.onload = () => {
        clearTimeout(timeoutId);
        console.log('iframe загрузился, пытаемся получить доступ к документу');
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          const html = doc.documentElement.outerHTML;
          console.log('HTML из iframe получен, длина:', html.length);
          // Пробуем извлечь количество непрочитанных из полученного HTML
          const patterns = [
            /"inbox"[^}]*?"unread[_-]?count"[\s:]+(\d+)/i,
            /"folders"[^}]*?"0"[^}]*?"unread[_-]?count"[\s:]+(\d+)/i,
            /data-folder-id="0"[^>]*data-unread="(\d+)"/i,
            /"unread_count":(\d+)/,
            /"unread":(\d+)/
          ];
          for (const p of patterns) {
            const m = html.match(p);
            if (m && m[1]) {
              const cnt = parseInt(m[1], 10);
              console.log('Найдено количество непрочитанных в iframe по паттерну', p, ':', cnt);
              resolve(cnt);
              return;
            }
          }
          console.warn('Не удалось извлечь количество из iframe, возвращаем null');
          resolve(null);
        } catch (e) {
          console.error('Ошибка доступа к содержимому iframe (возможно cross‑origin):', e);
          resolve(null);
        }
      };

      iframe.onerror = (e) => {
        clearTimeout(timeoutId);
        console.error('Ошибка загрузки iframe:', e);
        resolve(null);
      };
    });

    if (result !== null) {
      console.log('Успешно получили количество через iframe:', result);
      return result;
    }
    console.log('Переходим к резервному методу fetch');
    return await checkViaFetch();
  } catch (e) {
    console.error('Неожиданная ошибка в checkViaIframe:', e);
    return await checkViaFetch();
  }
}

// Альтернативный метод: прямой fetch запрос
async function checkViaFetch() {
  try {
    console.log('Проверка через fetch...');
    
    const response = await fetch('https://e.mail.ru/inbox/', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log('HTML получен, длина:', html.length);
    
    // Ищем в HTML количество непрочитанных писем
    // Mail.ru обычно включает это в метаданные или в скриптах
    const patterns = [
      // Современные паттерны (2026)
      /"inbox"[^}]*?"unread[_-]?count["\s:]+(\d+)/i,
      /"folders"[^}]*?"0"[^}]*?"unread[_-]?count["\s:]+(\d+)/i,
      /data-folder-id="0"[^>]*data-unread="(\d+)"/i,
      /inbox[^}]*unread[_-]?count["\s:]+(\d+)/i,
      // Старые паттерны
      /"unread_count":(\d+)/,
      /"unread":(\d+)/,
      /unreadCount["\s:]+(\d+)/,
      /"count_unread":(\d+)/,
      // Дополнительные варианты
      /window\.__INITIAL_STATE__[^}]*unread["\s:]+(\d+)/i,
      /counters[^}]*inbox[^}]*(\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const count = parseInt(match[1], 10);
        console.log(`Найдено непрочитанных через fetch (pattern: ${pattern}): ${count}`);
        return count;
      }
    }
    
    console.log('Не удалось найти количество непрочитанных писем в HTML');
    return 0;
    
  } catch (error) {
    console.error('Ошибка fetch запроса:', error);
    throw error;
  }
}

console.log('Offscreen script готов к работе');