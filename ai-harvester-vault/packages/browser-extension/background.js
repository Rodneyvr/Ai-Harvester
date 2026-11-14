// RedCoda Harvester Vault - Background Service Worker
// Manages extension lifecycle, context menus, and API communication with the backend

const BACKEND_URL = 'http://localhost:8000';
const EXTENSION_NAME = 'RedCoda Harvester Vault';

// Context menu items
async function initContextMenus() {
  await chrome.contextMenus.removeAll();
  
  await chrome.contextMenus.create({
    id: 'harvest-page',
    title: 'Harvest this page (RedCoda)',
    contexts: ['page'],
  });

  await chrome.contextMenus.create({
    id: 'harvest-selection',
    title: 'Harvest selected text',
    contexts: ['selection'],
  });

  await chrome.contextMenus.create({
    type: 'separator',
  });

  await chrome.contextMenus.create({
    id: 'open-sidepanel',
    title: 'Open RedCoda Vault',
    contexts: ['action'],
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'harvest-page':
      await harvestUrl(tab.url, tab);
      break;
    case 'harvest-selection':
      await harvestText(info.selectionText, tab);
      break;
    case 'open-sidepanel':
      await chrome.sidePanel.open({ windowId: tab.windowId });
      break;
  }
});

// Harvest a URL by sending to backend
async function harvestUrl(url, tab) {
  try {
    const response = await fetch(`${BACKEND_URL}/harvester/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        source_type: 'browser_extension',
        priority: 5,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      showNotification('RedCoda', `Queued: ${data.url}`, 'harvest-started');
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    showNotification('RedCoda', 'Backend not reachable. Start the API server.', 'error');
    console.error('[RedCoda] Harvest failed:', err);
  }
}

// Harvest selected text
async function harvestText(text, tab) {
  try {
    const response = await fetch(`${BACKEND_URL}/harvester/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: tab.url,
        source_type: 'browser_selection',
        priority: 3,
        metadata: { selectedText: text },
      }),
    });

    if (response.ok) {
      showNotification('RedCoda', 'Selected text queued for harvesting.', 'harvest-started');
    }
  } catch (err) {
    showNotification('RedCoda', 'Backend not reachable.', 'error');
  }
}

// Show notification
function showNotification(title, message, type = 'info') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title,
    message,
    priority: type === 'error' ? 2 : 0,
  });
}

// Listen for messages from content script / popup / sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-status') {
    sendResponse({ status: 'ready', extension: EXTENSION_NAME });
    return true;
  }
  if (message.action === 'harvest-url') {
    harvestUrl(message.url, sender.tab);
    sendResponse({ queued: true });
    return true;
  }
  return false;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  initContextMenus();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});