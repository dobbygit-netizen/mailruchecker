// Mail.ru Checker - Background Script
// Периодическая проверка почты и управление расширением

let checkInterval = null;
let lastCheckTime = null;
let unreadCount = 0;

// Настройки по умолчанию
const DEFAULT_SETTINGS = {
  checkInterval: 5, // минуты
  showNotifications: true,
  playSound: false,
  accounts: []
};

// Инициализация при установке расширения
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Mail.ru Checker установлен');
  
  // Инициализация настроек
  const settings = await chrome.storage.local.get('settings');
  if (!settings.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  
  // Запуск проверки почты
  startMailCheck();
});

// Запуск при старте браузера
chrome.runtime.onStartup.addListener(() => {
  console.log('Браузер запущен, начинаем проверку почты');
  startMailCheck();
});

// Показ детального уведомления о новых письмах
async function showDetailedNotification(unreadEmails) {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || !settings.showNotifications) return;

  if (!Array.isArray(unreadEmails) || unreadEmails.length === 0) {
    console.warn('showDetailedNotification: No unread emails to display.');
    return;
  }

  let message = '';
  const maxEmailsInNotification = 5;
  for (let i = 0; i < Math.min(unreadEmails.length, maxEmailsInNotification); i++) {
    const email = unreadEmails[i];
    // ✅ ИСПРАВЛЕНО: email.from → email.sender + защита от undefined
    message += `${email.sender || 'Отправитель'} - ${email.subject || 'Без темы'}\n`;
  }
  if (unreadEmails.length > maxEmailsInNotification) {
    message += `И еще ${unreadEmails.length - maxEmailsInNotification} писем...`;
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'img/128_activ.png',
    title: `Новые письма (${unreadEmails.length})`,
    message: message.trim(),
    priority: 2
  });
  
  if (settings.playSound) {
    chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play sound for new mail notification'
    });
    chrome.runtime.sendMessage({ action: 'playNotificationSound' });
  }
}

// Обработка сообщений от popup и других частей расширения
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Получено сообщение:', request);
  
  const { settings } = await chrome.storage.local.get('settings');
  
  if (request.action === 'emailsExtracted') {
    console.log(`📨 Получено от content script: ${request.unread} непрочитанных из ${request.total}`);
    
    await chrome.storage.local.set({
      totalEmails: request.total,
      unreadCount: request.unread,
      emails: request.emails,
      unreadEmails: request.unreadEmails,
      lastCheck: new Date().toISOString(),
      source: 'content-script'
    });
    
    updateBadge(request.unread);
    
    if (request.unread > 0 && settings?.showNotifications) {
      showDetailedNotification(request.unreadEmails);
    }
    
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'unreadCountUpdated' && request.source === 'content-script') {
    console.log(`🔄 Обновление счётчика из content script: ${request.count}`);
    updateBadge(request.count);
    unreadCount = request.count;
    
    await chrome.storage.local.set({
      totalUnread: request.count,
      lastCheck: new Date().toISOString()
    });
    
    sendResponse({ success: true });
    return true;
  }

  switch (request.action) {
    case 'checkMail':
      try {
        const result = await checkAllAccounts();
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true;
      
    case 'getUnreadCount':
      sendResponse({ count: unreadCount });
      break;
      
    case 'openMail':
      chrome.tabs.create({ url: 'https://e.mail.ru/inbox/' });
      sendResponse({ success: true });
      break;
      
    case 'updateSettings':
      await updateSettings(request.settings);
      sendResponse({ success: true });
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Запуск периодической проверки почты
async function startMailCheck() {
  console.log('Запуск проверки почты');
  
  // Остановить предыдущий интервал
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  // Получить настройки
  const { settings } = await chrome.storage.local.get('settings');
  const interval = (settings?.checkInterval || DEFAULT_SETTINGS.checkInterval) * 60 * 1000;
  
  // Первая проверка сразу
  await checkAllAccounts();
  
  // Установить периодическую проверку
  checkInterval = setInterval(async () => {
    await checkAllAccounts();
  }, interval);
  
  console.log(`Проверка почты каждые ${settings?.checkInterval || DEFAULT_SETTINGS.checkInterval} минут`);
}

// Проверка всех аккаунтов
async function checkAllAccounts() {
  console.log('Проверка всех аккаунтов...');
  // Проверяем куки ПЕРЕД проверкой аккаунтов
  const hasAuth = await checkMailruCookies();
  if (!hasAuth) {
    console.warn('⚠️ Пользователь не авторизован на Mail.ru!');
    updateBadge(0);
    return { totalUnread: 0, accounts: [], error: 'No auth' };
  }
  lastCheckTime = new Date();
  
  try {
    const { settings } = await chrome.storage.local.get('settings');
    const accounts = settings?.accounts || [];
    
    if (accounts.length === 0) {
      console.log('Нет настроенных аккаунтов');
      updateBadge(0);
      return { totalUnread: 0, accounts: [] };
    }
    
    let totalUnread = 0;
    const accountResults = [];
    
    for (const account of accounts) {
      try {
        const result = await checkAccount(account);
        accountResults.push(result);
        totalUnread += result.unread;
      } catch (error) {
        console.error(`Ошибка проверки аккаунта ${account.email}:`, error);
        accountResults.push({
          email: account.email,
          unread: 0,
          error: error.message
        });
      }
    }
    
    unreadCount = totalUnread;
    updateBadge(totalUnread);
    
    // Показать уведомление если есть новые письма
    if (totalUnread > 0 && settings?.showNotifications) {
      showNotification(totalUnread, accountResults);
    }
    
    // Сохранить результаты
    await chrome.storage.local.set({
      lastCheck: lastCheckTime.toISOString(),
      accountResults: accountResults,
      totalUnread: totalUnread
    });
    
    return { totalUnread, accounts: accountResults, lastCheck: lastCheckTime };
    
  } catch (error) {
    console.error('Ошибка при проверке аккаунтов:', error);
    updateBadge(0);
    throw error;
  }
}

// Проверка одного аккаунта (ПРЯМОЙ ЗАПРОС из background)
async function checkAccount(account) {
  console.log(`Проверка аккаунта: ${account.email}`);
  
  try {
    const login = account.email.split('@')[0];
    const url = `https://portal.mail.ru/NaviData?mac=1&Socials=1&gamescnt=1&external_mail_quota=1&login=${encodeURIComponent(login)}`;
    
    console.log('🔄 Запрос к NaviData:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📡 Статус:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Ответ NaviData:', JSON.stringify(data, null, 2));
    
    if (data.status === 'ok' && data.data && data.data.mail_cnt) {
      const count = parseInt(data.data.mail_cnt, 10);
      console.log(`✅ Найдено: ${count} непрочитанных`);
      
      return {
        email: account.email,
        unread: count,
        error: null
      };
    }
    
    console.log('⚠️ Не удалось получить mail_cnt');
    return {
      email: account.email,
      unread: 0,
      error: 'mail_cnt не найден'
    };
    
  } catch (error) {
    console.error(`❌ Ошибка проверки ${account.email}:`, error);
    return {
      email: account.email,
      unread: 0,
      error: error.message
    };
  }
}

// Резервный метод API (если content script недоступен)
async function checkViaAPIFallback(account) {
  return 0;
}

// Обновление badge (счетчика на иконке)
function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    chrome.action.setIcon({
      path: {
        '16': 'img/16_activ.png',
        '48': 'img/48_activ.png',
        '128': 'img/128_activ.png'
      }
    });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setIcon({
      path: {
        '16': 'img/16_activ.png',
        '48': 'img/48_activ.png',
        '128': 'img/128_activ.png'
      }
    });
  }
}

// Показ уведомления о новых письмах
function showNotification(count, accounts) {
  let message = `У вас ${count} непрочитанных писем`;
  
  if (accounts.length > 1) {
    const accountsWithMail = accounts.filter(a => a.unread > 0);
    if (accountsWithMail.length > 0) {
      message += '\n' + accountsWithMail.map(a => 
        `${a.email}: ${a.unread}`
      ).join('\n');
    }
  }
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'img/128_activ.png',
    title: 'Mail.ru Checker',
    message: message,
    priority: 1
  });
}

// Обновление настроек
async function updateSettings(newSettings) {
  await chrome.storage.local.set({ settings: newSettings });
  // Перезапустить проверку с новыми настройками
  await startMailCheck();
}

// Проверка доступности куки Mail.ru
async function checkMailruCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.mail.ru' });
    console.log('🍪 Куки mail.ru найдены:', cookies.length);
    console.log('🍪 Имена:', cookies.map(c => c.name).join(', '));
    const hasAuth = cookies.some(c => {
      const name = c.name.toLowerCase();
      return (
        name.includes('session') ||
        name.includes('auth') ||
        name.includes('csrf') ||
        name === 'sdcs' ||
        name === 'sdcsp'
      );
    });
    console.log('✅ Авторизация:', hasAuth ? 'ЕСТЬ' : 'НЕТ');
    return hasAuth;
  } catch (e) {
    console.error('❌ Ошибка проверки куки:', e.message);
    return false;
  }
}

// Обработка кликов по уведомлениям
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://e.mail.ru/inbox/' });
});

console.log('Background script загружен');