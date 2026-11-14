// RedCoda Harvester Vault - Side Panel
const BACKEND_URL = 'http://localhost:8000';
const apiStatus = document.getElementById('api-status');
const credBody = document.getElementById('cred-body');

async function checkApiHealth() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { timeout: 3000 });
    if (res.ok) {
      apiStatus.textContent = 'ONLINE';
      apiStatus.className = 'status online';
      loadCredentials();
    } else {
      apiStatus.textContent = 'OFFLINE';
      apiStatus.className = 'status offline';
    }
  } catch (err) {
    apiStatus.textContent = 'OFFLINE';
    apiStatus.className = 'status offline';
  }
}

async function loadCredentials() {
  try {
    const res = await fetch(`${BACKEND_URL}/vault/credentials?page_size=20`, { timeout: 5000 });
    if (!res.ok) throw new Error('Failed');
    const creds = await res.json();
    credBody.innerHTML = '';
    if (!creds || creds.length === 0) {
      credBody.innerHTML = '<tr><td colspan="5" class="empty">No credentials found.</td></tr>';
      return;
    }
    creds.forEach(c => {
      const tr = document.createElement('tr');
      const envBadge = c.environment === 'production' ? 'badge-red' :
                       c.environment === 'free-tier' ? 'badge-gray' : 'badge-gray';
      tr.innerHTML = `
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(c.provider)}</td>
        <td>${escapeHtml(c.category || '-')}</td>
        <td><span class="badge ${envBadge}">${escapeHtml(c.environment)}</span></td>
        <td><span class="badge ${c.is_valid ? 'badge-green' : 'badge-red'}">
          ${c.is_valid ? 'Valid' : 'Invalid'}
        </span></td>
      `;
      credBody.appendChild(tr);
    });
  } catch (err) {
    credBody.innerHTML = '<tr><td colspan="5" class="empty">Failed to load credentials. Is the backend running?</td></tr>';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function harvestCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const res = await fetch(`${BACKEND_URL}/harvester/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: tab.url,
        source_type: 'browser_extension',
        priority: 5,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      // Notify content script or show toast via sidepanel
      const btn = document.getElementById('btn-harvest-current');
      const orig = btn.textContent;
      btn.textContent = 'Queued!';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    }
  } catch (err) {
    console.error(err);
  }
}

checkApiHealth();
setInterval(checkApiHealth, 15000);

document.getElementById('btn-harvest-current').onclick = harvestCurrentPage;
document.getElementById('btn-open-dashboard').onclick = () => {
  chrome.tabs.create({ url: 'http://localhost:3000/vault' });
};