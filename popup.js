// popup.js — интерфейс v0.0.4
document.addEventListener('DOMContentLoaded', async () => {
  const badgeEl = document.getElementById('badge');
  const accountsListEl = document.getElementById('accounts-list');
  const messagesListEl = document.getElementById('messages-list');
  const btnAdd = document.getElementById('btn-add');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnMarkAll = document.getElementById('btn-mark-all');

  async function render() {
    try {
      const { accounts = [], cache = {} } = await chrome.runtime.sendMessage({ type: 'getState' });
      
      // Бейдж
      let total = 0;
      for (const email in cache) total += cache[email]?.length || 0;
      badgeEl.textContent = total > 999 ? '999+' : total;
      badgeEl.classList.toggle('empty', total === 0);

      // Аккаунты
      accountsListEl.innerHTML = '';
      accounts.forEach(acc => {
        const email = typeof acc === 'string' ? acc : acc.email;
        const div = document.createElement('div');
        div.className = 'account-item';
        div.textContent = email;
        accountsListEl.appendChild(div);
      });

      // Сообщения (последний аккаунт или все)
      messagesListEl.innerHTML = '';
      const lastEmail = accounts[accounts.length - 1]?.email || Object.keys(cache)[0];
      const msgs = cache[lastEmail] || [];
      
      if (msgs.length === 0) {
        messagesListEl.innerHTML = '<div class="empty">Нет непрочитанных</div>';
        return;
      }

      msgs.slice(0, 10).forEach(m => {
        const item = document.createElement('div');
        item.className = 'message-item';
        item.innerHTML = `
          <div class="msg-header">
            <span class="msg-from">${m.from}</span>
            <span class="msg-subject">${m.subject}</span>
          </div>
          <a href="${m.link}" target="_blank" class="msg-link">Открыть</a>
          <button class="msg-mark btn small" data-href="${m.link}">✓</button>
        `;
        messagesListEl.appendChild(item);
      });

      // Обработчики пометки одного письма
      document.querySelectorAll('.msg-mark').forEach(btn => {
        btn.onclick = async (e) => {
          e.preventDefault();
          btn.disabled = true;
          await chrome.runtime.sendMessage({ type: 'markRead', href: btn.dataset.href });
          render();
        };
      });

    } catch (e) {
      console.warn('Popup render error:', e);
    }
  }

  btnAdd?.addEventListener('click', async () => {
    const email = prompt('Введите email аккаунта Mail.ru:');
    if (!email || !email.includes('@')) return;
    await chrome.runtime.sendMessage({ type: 'addAccount', email });
    render();
  });

  btnRefresh?.addEventListener('click', async () => {
    btnRefresh.disabled = true;
    await chrome.runtime.sendMessage({ type: 'FORCE_CHECK' });
    btnRefresh.disabled = false;
    render();
  });

  btnMarkAll?.addEventListener('click', async () => {
    btnMarkAll.disabled = true;
    btnMarkAll.textContent = 'Обработка...';
    await chrome.runtime.sendMessage({ type: 'markRead' });
    btnMarkAll.disabled = false;
    btnMarkAll.textContent = 'Прочитать всё';
    render();
  });

  render();
});