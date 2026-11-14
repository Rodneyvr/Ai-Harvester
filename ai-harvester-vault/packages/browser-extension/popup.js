// RedCoda Harvester Vault - Popup
const BACKEND_URL = 'http://localhost:8000';
const apiStatus = document.getElementById('api-status');

async function checkApiHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { timeout: 3000 });
    if (res.ok) {
      apiStatus.textContent = 'ONLINE';
      apiStatus.className = 'status online';
    }
  } catch (err) {
    apiStatus.textContent = 'OFFLINE';
    apiStatus.className = 'status offline';
  }
}

async function loadCredentials() {
  try {
    const res = await fetch(`${BACKEND_URL}/vault/credentials?page_size=5`, { timeout: 3000 });
    if (!res.ok) return;
    const creds = await res.json();
    const list = document.getElementById('credential-list');
    list.innerHTML = '';
    if (!creds || creds.length === 0) {
      list.innerHTML = '<div class="empty">No credentials found.</div>';
      return;
    }
    creds.forEach(c => {
      const el = document.createElement('div');
      el.className = 'credential-item';
      el.innerHTML = `
        <div>
          <div class="credential-name">${escapeHtml(c.name)}</div>
          <div class="credential-provider">${escapeHtml(c.provider)}</div>
        </div>
        <button class="reveal-btn" title="Reveal">👁</button>
      `;
      list.appendChild(el);
    });
  } catch (err) {
    console.error(err);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function harvestPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ action: 'harvest-url', url: tab.url });
  window.close();
}

checkApiHealth();
loadCredentials();
setInterval(checkApiHealth, 10000);

document.getElementById('btn-harvest').onclick = harvestPage;
document.getElementById('btn-sidepanel').onclick = () => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  window.close();
};
document.getElementById('btn-dashboard').onclick = () => {
  chrome.tabs.create({ url: 'http://localhost:3000/vault' });
  window.close();
};
document.getElementById('btn-settings').onclick = () => {
  chrome.tabs.create({ url: 'http://localhost:3000/settings' });
  window.close();
};