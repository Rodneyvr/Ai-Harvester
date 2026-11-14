// RedCoda Harvester Vault - Content Script
// Injects harvesting UI into web pages and extracts page context

(function() {
  'use strict';

  const EXTENSION_NAME = 'RedCoda Harvester Vault';
  const BACKEND_URL = 'http://localhost:8000';
  let harvestButton = null;

  // Create floating harvest button
  function createHarvestButton() {
    if (harvestButton) return;

    harvestButton = document.createElement('div');
    harvestButton.id = 'redcoda-harvest-btn';
    harvestButton.innerHTML = '⟡ Harvest';
    harvestButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      padding: 8px 16px;
      background: #EF4444;
      color: #FFFFFF;
      border: none;
      border-radius: 6px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
      transition: all 0.2s;
    `;

    harvestButton.onmouseenter = () => {
      harvestButton.style.background = '#B91C1C';
      harvestButton.style.transform = 'translateY(-1px)';
    };
    harvestButton.onmouseleave = () => {
      harvestButton.style.background = '#EF4444';
      harvestButton.style.transform = 'translateY(0)';
    };
    harvestButton.onclick = () => harvestCurrentPage();

    document.body.appendChild(harvestButton);
  }

  function removeHarvestButton() {
    if (harvestButton) {
      harvestButton.remove();
      harvestButton = null;
    }
  }

  // Extract page context for harvesting
  function extractPageContext() {
    const article = document.querySelector('article, main, [role="main"]');
    const content = article ? article.innerText : document.body.innerText;
    
    const scripts = Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src);
    
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => l.href);

    return {
      title: document.title,
      url: window.location.href,
      contentLength: content.length,
      hasForms: !!document.querySelector('form'),
      scripts,
      stylesheets: links,
    };
  }

  async function harvestCurrentPage() {
    const context = extractPageContext();
    
    try {
      const response = await fetch(`${BACKEND_URL}/harvester/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: context.url,
          source_type: 'browser_extension',
          priority: 5,
          metadata: {
            title: context.title,
            contentLength: context.contentLength,
            hasForms: context.hasForms,
            scripts: context.scripts.slice(0, 10),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        showToast(`Queued: ${context.title}`, 'success');
      } else {
        showToast('Backend not reachable', 'error');
      }
    } catch (err) {
      showToast('Backend not reachable. Start the API server.', 'error');
    }
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('#redcoda-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'redcoda-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483648;
      padding: 12px 20px;
      background: ${type === 'error' ? '#B91C1C' : '#EF4444'};
      color: #FFFFFF;
      border-radius: 6px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Inject CSS for animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  // Listen for messages from extension
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'show-harvest-btn') {
      createHarvestButton();
    }
    if (message.action === 'hide-harvest-btn') {
      removeHarvestButton();
    }
    return true;
  });

  // Auto-create button on page load (can be disabled by user)
  createHarvestButton();
})();