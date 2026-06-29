// Mail.ru Checker - Settings Page
// Страница настроек расширения

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Страница настроек загружена');
  
  // Элементы формы
  const checkIntervalInput = document.getElementById('checkInterval');
  const showNotificationsCheckbox = document.getElementById('showNotifications');
  const playSoundCheckbox = document.getElementById('playSound');
  const accountsContainer = document.getElementById('accountsContainer');
  const addAccountButton = document.getElementById('addAccount');
  const saveButton = document.getElementById('saveSettings');
  const statusElement = document.getElementById('status');
  
  // Загрузка текущих настроек
  await loadSettings();
  
  // Обработчики событий
  addAccountButton?.addEventListener('click', () => {
    addAccountField();
  });
  
  saveButton?.addEventListener('click', async () => {
    await saveSettings();
  });
  
  // Загрузка настроек из storage
  async function loadSettings() {
    try {
      const { settings } = await chrome.storage.local.get('settings');
      
      if (settings) {
        // Загрузка общих настроек
        if (checkIntervalInput) {
          checkIntervalInput.value = settings.checkInterval || 5;
        }
        if (showNotificationsCheckbox) {
          showNotificationsCheckbox.checked = settings.showNotifications !== false;
        }
        if (playSoundCheckbox) {
          playSoundCheckbox.checked = settings.playSound === true;
        }
        
        // Загрузка аккаунтов
        if (accountsContainer) {
          accountsContainer.innerHTML = '';
          if (settings.accounts && settings.accounts.length > 0) {
            settings.accounts.forEach(account => {
              addAccountField(account);
            });
          } else {
            addAccountField(); // Добавляем пустое поле
          }
        }
      } else {
        // Настройки по умолчанию
        addAccountField();
      }
      
      console.log('Настройки загружены:', settings);
      
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
      showStatus('Ошибка загрузки настроек', 'error');
    }
  }
  
  // Добавление поля для аккаунта
  function addAccountField(account = null) {
    const accountDiv = document.createElement('div');
    accountDiv.className = 'account-field';
    
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.className = 'account-email';
    emailInput.placeholder = 'example@mail.ru';
    emailInput.value = account?.email || '';
    
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-account';
    removeButton.textContent = '✕';
    removeButton.title = 'Удалить аккаунт';
    
    removeButton.addEventListener('click', () => {
      accountDiv.remove();
      // Если не осталось полей, добавляем пустое
      if (accountsContainer.children.length === 0) {
        addAccountField();
      }
    });
    
    accountDiv.appendChild(emailInput);
    accountDiv.appendChild(removeButton);
    accountsContainer.appendChild(accountDiv);
    
    // Фокус на новом поле
    emailInput.focus();
  }
  
  // Сохранение настроек
  async function saveSettings() {
    try {
      saveButton.disabled = true;
      
      // Сбор данных из формы
      const settings = {
        checkInterval: parseInt(checkIntervalInput.value) || 5,
        showNotifications: showNotificationsCheckbox.checked,
        playSound: playSoundCheckbox.checked,
        accounts: []
      };
      
      // Валидация интервала
      if (settings.checkInterval < 1 || settings.checkInterval > 60) {
        showStatus('Интервал проверки должен быть от 1 до 60 минут', 'error');
        saveButton.disabled = false;
        return;
      }
      
      // Сбор аккаунтов
      const accountFields = accountsContainer.querySelectorAll('.account-email');
      accountFields.forEach(field => {
        const email = field.value.trim();
        if (email) {
          settings.accounts.push({ email });
        }
      });
      
      // Сохранение в storage
      await chrome.storage.local.set({ settings });
      
      // Уведомление background script об обновлении настроек
      await chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: settings
      });
      
      showStatus('Настройки сохранены', 'success');
      console.log('Настройки сохранены:', settings);
      
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      showStatus('Ошибка сохранения настроек', 'error');
    } finally {
      saveButton.disabled = false;
    }
  }
  
  // Показ статуса
  function showStatus(message, type = 'info') {
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';
    
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
});

console.log('Settings script загружен');