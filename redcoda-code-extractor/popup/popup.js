// RedCoda Code Extractor - Popup Logic

class RedCodaPopup {
  constructor() {
    this.blocks = [];
    this.filteredBlocks = [];
    this.settings = {
      layout: 'paths',
      numberFiles: true,
      includeIndex: true,
      compressionLevel: 6
    };
    this.languages = new Set();
    this.searchQuery = '';
    this.selectedLanguages = new Set();
    this.aiOnly = false;

    this.initElements();
    this.loadSettings();
    this.bindEvents();
    this.requestBlocks();
  }

  initElements() {
    // Header
    this.rescanBtn = document.getElementById('rescan-btn');

    // Progress
    this.progressSection = document.getElementById('progress-section');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');
    this.stopScanBtn = document.getElementById('stop-scan-btn');

    // Filters
    this.searchInput = document.getElementById('search-input');
    this.languageChips = document.getElementById('language-chips');
    this.aiOnlyToggle = document.getElementById('ai-only-toggle');

    // List
    this.blockList = document.getElementById('block-list');
    this.emptyState = document.getElementById('empty-state');
    this.deepScanBtn = document.getElementById('deep-scan-btn');

    // Footer
    this.selectionCount = document.getElementById('selection-count');
    this.totalSize = document.getElementById('total-size');
    this.copyMdBtn = document.getElementById('copy-md-btn');
    this.saveMdBtn = document.getElementById('save-md-btn');
    this.exportZipBtn = document.getElementById('export-zip-btn');

    // Settings
    this.layoutSelect = document.getElementById('layout-select');
    this.numberFiles = document.getElementById('number-files');
    this.includeIndex = document.getElementById('include-index');
    this.compressionLevel = document.getElementById('compression-level');
  }

  bindEvents() {
    this.rescanBtn.addEventListener('click', () => this.requestBlocks(true));
    this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    this.aiOnlyToggle.addEventListener('change', (e) => this.handleAiOnly(e.target.checked));
    this.deepScanBtn.addEventListener('click', () => this.startDeepScan());
    this.stopScanBtn.addEventListener('click', () => this.stopDeepScan());

    this.copyMdBtn.addEventListener('click', () => this.exportMarkdown('copy'));
    this.saveMdBtn.addEventListener('click', () => this.exportMarkdown('save'));
    this.exportZipBtn.addEventListener('click', () => this.exportZip());

    this.layoutSelect.addEventListener('change', (e) => this.saveSetting('layout', e.target.value));
    this.numberFiles.addEventListener('change', (e) => this.saveSetting('numberFiles', e.target.checked));
    this.includeIndex.addEventListener('change', (e) => this.saveSetting('includeIndex', e.target.checked));
    this.compressionLevel.addEventListener('change', (e) => this.saveSetting('compressionLevel', parseInt(e.target.value)));

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.action) {
        case 'blocks-response':
          this.handleBlocksResponse(message.blocks, message.total);
          break;
        case 'deep-scan-progress':
          this.updateProgress(message.current, message.total, message.message);
          break;
      }
    });
  }

  async loadSettings() {
    const stored = await chrome.storage.sync.get(['redcoda-settings']);
    if (stored['redcoda-settings']) {
      this.settings = { ...this.settings, ...stored['redcoda-settings'] };
      this.layoutSelect.value = this.settings.layout;
      this.numberFiles.checked = this.settings.numberFiles;
      this.includeIndex.checked = this.settings.includeIndex;
      this.compressionLevel.value = String(this.settings.compressionLevel);
    }
  }

  async saveSetting(key, value) {
    this.settings[key] = value;
    await chrome.storage.sync.set({ 'redcoda-settings': this.settings });
  }

  requestBlocks(forceRescan = false) {
    this.showEmptyState(false);
    this.blockList.innerHTML = '<div class="loading">Scanning...</div>';
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: forceRescan ? 'extract' : 'extract' });
      }
    });
  }

  handleBlocksResponse(blocks, total) {
    this.blocks = blocks.map(b => ({
      ...b,
      selected: b.selected !== false,
      editedCode: b.editedCode || null
    }));
    this.updateLanguages();
    this.applyFilters();
    this.renderBlocks();
    this.updateFooter();
  }

  updateLanguages() {
    this.languages.clear();
    this.blocks.forEach(b => this.languages.add(b.language));
    this.renderLanguageChips();
  }

  renderLanguageChips() {
    const sorted = Array.from(this.languages).sort();
    this.languageChips.innerHTML = sorted.map(lang => `
      <button class="lang-chip ${this.selectedLanguages.has(lang) ? 'active' : ''}" data-lang="${lang}">
        ${lang}
      </button>
    `).join('');

    this.languageChips.querySelectorAll('.lang-chip').forEach(btn => {
      btn.addEventListener('click', () => this.toggleLanguage(btn.dataset.lang));
    });
  }

  toggleLanguage(lang) {
    if (this.selectedLanguages.has(lang)) {
      this.selectedLanguages.delete(lang);
    } else {
      this.selectedLanguages.add(lang);
    }
    this.renderLanguageChips();
    this.applyFilters();
  }

  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.applyFilters();
  }

  handleAiOnly(checked) {
    this.aiOnly = checked;
    this.applyFilters();
  }

  applyFilters() {
    this.filteredBlocks = this.blocks.filter(block => {
      if (this.searchQuery && !block.code.toLowerCase().includes(this.searchQuery) &&
          !block.filename.toLowerCase().includes(this.searchQuery)) {
        return false;
      }
      if (this.selectedLanguages.size > 0 && !this.selectedLanguages.has(block.language)) {
        return false;
      }
      // AI only filter would need message author detection
      // For now, just pass through
      return true;
    });
    this.renderBlocks();
    this.updateFooter();
  }

  renderBlocks() {
    if (this.filteredBlocks.length === 0) {
      this.blockList.innerHTML = '';
      this.showEmptyState(true);
      return;
    }

    this.showEmptyState(false);
    this.blockList.innerHTML = this.filteredBlocks.map(block => `
      <div class="block-item ${block.selected ? 'selected' : ''} ${block.isDuplicate ? 'duplicate' : ''}" data-id="${block.id}">
        <input type="checkbox" class="block-checkbox" ${block.selected ? 'checked' : ''} ${block.isDuplicate ? 'disabled' : ''}>
        <div class="block-content">
          <div class="block-header">
            <span class="block-filename" title="${block.filename}">${this.escapeHtml(block.filename)}</span>
            <span class="block-language">${block.language}</span>
          </div>
          <div class="block-code-preview">${this.escapeHtml(block.code.slice(0, 200))}</div>
        </div>
        <div class="block-actions">
          <button class="action-btn edit-btn" title="Edit" data-id="${block.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="action-btn copy-btn" title="Copy code" data-id="${block.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="action-btn save-btn" title="Save as file" data-id="${block.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          </button>
          <button class="action-btn flash-btn" title="Flash on page" data-id="${block.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Bind block actions
    this.blockList.querySelectorAll('.block-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => this.toggleBlockSelection(e.target.closest('.block-item').dataset.id, e.target.checked));
    });
    this.blockList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openEditModal(btn.dataset.id));
    });
    this.blockList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => this.copyBlockCode(btn.dataset.id));
    });
    this.blockList.querySelectorAll('.save-btn').forEach(btn => {
      btn.addEventListener('click', () => this.saveBlockFile(btn.dataset.id));
    });
    this.blockList.querySelectorAll('.flash-btn').forEach(btn => {
      btn.addEventListener('click', () => this.flashBlock(btn.dataset.id));
    });
  }

  toggleBlockSelection(id, selected) {
    const block = this.blocks.find(b => b.id === id);
    if (block) {
      block.selected = selected;
      this.updateBlockElement(id, selected);
      this.updateFooter();
      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-block', id });
        }
      });
    }
  }

  updateBlockElement(id, selected) {
    const el = this.blockList.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.toggle('selected', selected);
      el.querySelector('.block-checkbox').checked = selected;
    }
  }

  updateFooter() {
    const selected = this.filteredBlocks.filter(b => b.selected);
    const totalBytes = selected.reduce((sum, b) => sum + (b.editedCode || b.code).length, 0);
    this.selectionCount.textContent = `${selected.length} selected`;
    this.totalSize.textContent = this.formatBytes(totalBytes);
    const hasSelection = selected.length > 0;
    this.copyMdBtn.disabled = !hasSelection;
    this.saveMdBtn.disabled = !hasSelection;
    this.exportZipBtn.disabled = !hasSelection;
  }

  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showEmptyState(show) {
    this.emptyState.style.display = show ? 'flex' : 'none';
  }

  // ============ DEEP SCAN ============
  startDeepScan() {
    this.progressSection.classList.remove('hidden');
    this.progressFill.style.width = '0%';
    this.progressText.textContent = 'Starting deep scan...';
    this.deepScanBtn.disabled = true;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'deep-scan' });
      }
    });
  }

  stopDeepScan() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stop-deep-scan' });
      }
    });
    this.finishDeepScan();
  }

  updateProgress(current, total, message) {
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    this.progressFill.style.width = `${percent}%`;
    this.progressText.textContent = message || `Found ${current} blocks...`;
  }

  finishDeepScan() {
    this.progressSection.classList.add('hidden');
    this.deepScanBtn.disabled = false;
    this.requestBlocks(true);
  }

  // ============ BLOCK ACTIONS ============
  openEditModal(id) {
    const block = this.blocks.find(b => b.id === id);
    if (!block) return;

    const code = block.editedCode || block.code;
    const newCode = prompt(`Edit ${block.filename}:`, code);
    if (newCode !== null && newCode !== code) {
      block.editedCode = newCode;
      this.updateFooter();
      this.renderBlocks();

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'update-block', id, code: newCode, filename: block.filename });
        }
      });
    }
  }

  copyBlockCode(id) {
    const block = this.blocks.find(b => b.id === id);
    if (block) {
      navigator.clipboard.writeText(block.editedCode || block.code);
      this.showToast('Copied!');
    }
  }

  saveBlockFile(id) {
    const block = this.blocks.find(b => b.id === id);
    if (block) {
      const blob = new Blob([block.editedCode || block.code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: block.filename,
        saveAs: true
      });
    }
  }

  flashBlock(id) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'flash-block', id });
      }
    });
  }

  showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: var(--accent); color: white; padding: 8px 16px;
      border-radius: var(--radius); font-size: 12px; z-index: 10000;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  }

  // ============ EXPORT ============
  async exportMarkdown(mode) {
    const selected = this.filteredBlocks.filter(b => b.selected);
    if (selected.length === 0) return;

    let markdown = '';
    if (this.settings.includeIndex) {
      markdown += '# RedCoda Code Extract\n\n';
      markdown += `Source: ${window.location.href}\n`;
      markdown += `Extracted: ${new Date().toISOString()}\n`;
      markdown += `Blocks: ${selected.length}\n\n`;
      markdown += '## Files\n\n';
      selected.forEach((b, i) => {
        const num = this.settings.numberFiles ? `${String(i + 1).padStart(2, '0')}-` : '';
        markdown += `- ${num}${b.filename} (${b.language})\n`;
      });
      markdown += '\n---\n\n';
    }

    selected.forEach((b, i) => {
      const num = this.settings.numberFiles ? `${String(i + 1).padStart(2, '0')}-` : '';
      markdown += `# ${num}${b.filename}\n\n`;
      markdown += `\`\`\`${b.language}\n${b.editedCode || b.code}\n\`\`\`\n\n`;
    });

    if (mode === 'copy') {
      await navigator.clipboard.writeText(markdown);
      this.showToast('Markdown copied!');
    } else {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `redcoda-extract-${Date.now()}.md`,
        saveAs: true
      });
    }
  }

  async exportZip() {
    const selected = this.filteredBlocks.filter(b => b.selected);
    if (selected.length === 0) return;

    this.exportZipBtn.disabled = true;
    this.exportZipBtn.innerHTML = '<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></svg> Creating ZIP...';

    try {
      const zip = await this.createZip(selected);
      const url = URL.createObjectURL(zip);
      chrome.downloads.download({
        url,
        filename: `redcoda-extract-${Date.now()}.zip`,
        saveAs: true
      });
      this.showToast('ZIP downloaded!');
    } catch (err) {
      console.error('ZIP creation failed:', err);
      this.showToast('ZIP creation failed');
    } finally {
      this.exportZipBtn.disabled = false;
      this.exportZipBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        Export ZIP
      `;
    }
  }

  async createZip(blocks) {
    // Use a simple ZIP implementation (no external deps)
    // For production, consider using zip.js or similar
    const encoder = new TextEncoder();
    const files = [];

    // Build file entries
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const num = this.settings.numberFiles ? `${String(i + 1).padStart(2, '0')}-` : '';
      let path = '';

      switch (this.settings.layout) {
        case 'paths':
          // Use detected path from filename or create from language
          path = `${block.language}/${num}${block.filename}`;
          break;
        case 'flat':
          path = `${num}${block.filename}`;
          break;
        case 'language':
          path = `${block.language}/${num}${block.filename}`;
          break;
        case 'message':
          path = `message-${String(i + 1).padStart(2, '0')}/${num}${block.filename}`;
          break;
      }

      const content = block.editedCode || block.code;
      files.push({ path, content });
    }

    // Add INDEX.md if enabled
    if (this.settings.includeIndex) {
      let indexContent = '# RedCoda Code Extract\n\n';
      indexContent += `Source: ${window.location.href}\n`;
      indexContent += `Extracted: ${new Date().toISOString()}\n`;
      indexContent += `Blocks: ${blocks.length}\n\n`;
      indexContent += '## Files\n\n';
      files.forEach((f, i) => {
        indexContent += `- ${f.path}\n`;
      });
      files.unshift({ path: 'INDEX.md', content: indexContent });
    }

    // Create ZIP using a minimal implementation
    // Note: For production, use a proper ZIP library like zip.js
    return this.createZipBlob(files, this.settings.compressionLevel);
  }

  createZipBlob(files, compressionLevel) {
    // Minimal ZIP creation - stores files without compression (level 0)
    // For real compression, would need a library
    const encoder = new TextEncoder();
    const fileRecords = [];
    const centralDirectoryRecords = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.path);
      const contentBytes = encoder.encode(file.content);
      const crc32 = this.crc32(contentBytes);
      const compressed = contentBytes; // No compression for simplicity
      const compressedSize = compressed.length;
      const uncompressedSize = contentBytes.length;

      // Local file header
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true); // Signature
      localView.setUint16(4, 20, true); // Version needed
      localView.setUint16(6, 0, true); // Flags
      localView.setUint16(8, compressionLevel === 0 ? 0 : 8, true); // Compression method
      localView.setUint16(10, 0, true); // Mod time
      localView.setUint16(12, 0, true); // Mod date
      localView.setUint32(14, crc32, true); // CRC32
      localView.setUint32(18, compressedSize, true); // Compressed size
      localView.setUint32(22, uncompressedSize, true); // Uncompressed size
      localView.setUint16(26, nameBytes.length, true); // Name length
      localView.setUint16(28, 0, true); // Extra field length
      localHeader.set(nameBytes, 30);
      fileRecords.push(localHeader);
      fileRecords.push(compressed);

      // Central directory record
      const cdRecord = new Uint8Array(46 + nameBytes.length);
      const cdView = new DataView(cdRecord.buffer);
      cdView.setUint32(0, 0x02014b50, true); // Signature
      cdView.setUint16(4, 20, true); // Version made by
      cdView.setUint16(6, 20, true); // Version needed
      cdView.setUint16(8, 0, true); // Flags
      cdView.setUint16(10, compressionLevel === 0 ? 0 : 8, true); // Compression
      cdView.setUint16(12, 0, true); // Mod time
      cdView.setUint16(14, 0, true); // Mod date
      cdView.setUint32(16, crc32, true); // CRC32
      cdView.setUint32(20, compressedSize, true); // Compressed size
      cdView.setUint32(24, uncompressedSize, true); // Uncompressed size
      cdView.setUint16(28, nameBytes.length, true); // Name length
      cdView.setUint16(30, 0, true); // Extra field length
      cdView.setUint16(32, 0, true); // Comment length
      cdView.setUint16(34, 0, true); // Disk number
      cdView.setUint16(36, 0, true); // Internal attributes
      cdView.setUint32(38, 0, true); // External attributes
      cdView.setUint32(42, offset, true); // Local header offset
      cdRecord.set(nameBytes, 46);
      centralDirectoryRecords.push(cdRecord);

      offset += localHeader.length + compressedSize;
    }

    // End of central directory
    const centralDirOffset = offset;
    const centralDirSize = centralDirectoryRecords.reduce((sum, r) => sum + r.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true); // Signature
    endView.setUint16(4, 0, true); // Disk number
    endView.setUint16(6, 0, true); // Central dir disk
    endView.setUint16(8, files.length, true); // Entries on this disk
    endView.setUint16(10, files.length, true); // Total entries
    endView.setUint32(12, centralDirSize, true); // Central dir size
    endView.setUint32(16, centralDirOffset, true); // Central dir offset
    endView.setUint16(20, 0, true); // Comment length

    // Concatenate all parts
    const totalSize = fileRecords.reduce((sum, r) => sum + r.length, 0) + centralDirSize + 22;
    const zip = new Uint8Array(totalSize);
    let pos = 0;
    for (const record of fileRecords) {
      zip.set(record, pos);
      pos += record.length;
    }
    for (const record of centralDirectoryRecords) {
      zip.set(record, pos);
      pos += record.length;
    }
    zip.set(endRecord, pos);

    return new Blob([zip], { type: 'application/zip' });
  }

  crc32(buf) {
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new RedCodaPopup();
});