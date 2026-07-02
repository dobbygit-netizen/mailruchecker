// content.js | ISOLATED world | Инжектит injector.js в MAIN world
(function() {
  'use strict';
  
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injector.js');
    script.onload = () => script.remove();
    script.onerror = () => console.warn('[MailChecker] injector.js load failed');
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn('[MailChecker] content.js error:', e.message);
  }
})();