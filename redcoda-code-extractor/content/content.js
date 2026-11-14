// RedCoda Code Extractor - Content Script
// Scans page for code blocks, extracts, deduplicates, names files

(() => {
  'use strict';

  // ============ CONFIG & STATE ============
  const SELECTORS = {
    // Generic code containers
    preCode: 'pre code, pre[class*="language"], pre[class*="hljs"]',
    // Multi-line inline code
    multilineCode: 'code:not([class*="inline"])',
    // Monaco editor
    monaco: '.monaco-editor .view-lines .view-line',
    monacoContainer: '.monaco-editor',
    // CodeMirror 6
    codemirror6: '.cm-editor .cm-line',
    codemirror6Container: '.cm-editor',
    // CodeMirror 5
    codemirror5: '.CodeMirror-code .CodeMirror-line',
    codemirror5Container: '.CodeMirror',
    // Generic fallback
    anyCode: '[class*="code"], [class*="CodeBlock"], [data-language]'
  };

  const LANGUAGE_MAP = {
    'js': 'javascript', 'ts': 'typescript', 'jsx': 'javascript', 'tsx': 'typescript',
    'py': 'python', 'rb': 'ruby', 'php': 'php', 'java': 'java', 'cs': 'csharp',
    'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'c': 'c', 'h': 'c', 'hpp': 'cpp',
    'go': 'go', 'rs': 'rust', 'swift': 'swift', 'kt': 'kotlin', 'scala': 'scala',
    'sh': 'bash', 'bash': 'bash', 'zsh': 'bash', 'fish': 'bash',
    'html': 'html', 'htm': 'html', 'xml': 'xml', 'svg': 'xml',
    'css': 'css', 'scss': 'scss', 'sass': 'sass', 'less': 'less',
    'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'toml': 'toml',
    'sql': 'sql', 'md': 'markdown', 'markdown': 'markdown',
    'dockerfile': 'dockerfile', 'docker': 'dockerfile',
    'tf': 'hcl', 'hcl': 'hcl',
    'vue': 'vue', 'svelte': 'svelte'
  };

  const EXTENSION_MAP = {
    'javascript': 'js', 'typescript': 'ts', 'python': 'py', 'ruby': 'rb',
    'php': 'php', 'java': 'java', 'csharp': 'cs', 'cpp': 'cpp', 'c': 'c',
    'go': 'go', 'rust': 'rs', 'swift': 'swift', 'kotlin': 'kt', 'scala': 'scala',
    'bash': 'sh', 'html': 'html', 'xml': 'xml', 'css': 'css', 'scss': 'scss',
    'sass': 'sass', 'less': 'less', 'json': 'json', 'yaml': 'yaml', 'toml': 'toml',
    'sql': 'sql', 'markdown': 'md', 'dockerfile': 'dockerfile', 'hcl': 'tf',
    'vue': 'vue', 'svelte': 'svelte', 'plaintext': 'txt'
  };

  let extractedBlocks = [];
  let isDeepScanning = false;
  let deepScanStopRequested = false;
  let progressOverlay = null;
  let messagePort = null;

  // ============ UTILITY FUNCTIONS ============
  function normalizeLanguage(lang) {
    if (!lang) return 'plaintext';
    const lower = lang.toLowerCase().replace(/^language-/, '');
    return LANGUAGE_MAP[lower] || lower;
  }

  function getExtension(language) {
    return EXTENSION_MAP[normalizeLanguage(language)] || 'txt';
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(16);
  }

  function cleanCodeText(text) {
    // Remove "Copy" button text that gets glued
    text = text.replace(/\bCopy\b/g, '');
    // Remove stacked line numbers (lines starting with digits + whitespace)
    text = text.replace(/^\s*\d+\s*/gm, '');
    // Trim excessive whitespace but preserve structure
    text = text.replace(/\n{4,}/g, '\n\n\n');
    return text.trim();
  }

  function detectLanguageFromCode(code) {
    // Simple heuristic detection
    const patterns = [
      { lang: 'python', regex: /^\s*(def|class|import|from|async def|await)\b/m },
      { lang: 'javascript', regex: /^\s*(function|const|let|var|import|export|async|await|=>)\b/m },
      { lang: 'typescript', regex: /^\s*(interface|type|enum|const|let|var)\s+\w+\s*:/m },
      { lang: 'html', regex: /^<\w+.*>/m },
      { lang: 'css', regex: /^\s*[\w\-]+\s*\{/m },
      { lang: 'json', regex: /^\s*[\{\[]/m },
      { lang: 'sql', regex: /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/im },
      { lang: 'bash', regex: /^\s*(\#!\/|npm|yarn|pnpm|git|cd|ls|mkdir)\b/m },
      { lang: 'dockerfile', regex: /^\s*(FROM|RUN|COPY|ADD|CMD|ENTRYPOINT)\b/im },
      { lang: 'rust', regex: /^\s*(fn|struct|enum|impl|use|mod|let|mut)\b/m },
      { lang: 'go', regex: /^\s*(func|package|import|type|struct|var|const)\b/m },
    ];
    for (const { lang, regex } of patterns) {
      if (regex.test(code)) return lang;
    }
    return 'plaintext';
  }

  function extractFilenameFromHeader(block) {
    // Look for filename in header bar, data attributes, or nearby elements
    const headerSelectors = [
      '[data-filename]', '[data-path]', '[title*="."]', '.filename', '.file-name',
      '.code-header .title', '.code-block-header', '[class*="header"] [class*="name"]'
    ];
    for (const sel of headerSelectors) {
      const el = block.querySelector(sel) || block.closest(sel);
      if (el) {
        const text = (el.textContent || el.getAttribute('data-filename') || el.getAttribute('data-path') || '').trim();
        if (text && text.includes('.')) return text.split('/').pop().split('\\').pop();
      }
    }
    return null;
  }

  function extractFilenameFromComment(code) {
    const firstLine = code.split('\n')[0].trim();
    // Match: // path/to/file.ext or # path/to/file.ext or <!-- path/to/file.ext -->
    const match = firstLine.match(/^(\/\/|#|<!--)\s*([^\s]+\.\w+)\s*(-->)?$/);
    if (match) return match[2].split('/').pop().split('\\').pop();
    return null;
  }

  function extractFilenameFromContext(block) {
    // Look at preceding sibling or nearby text for "Create src/app.py" patterns
    let prev = block.previousElementSibling;
    let attempts = 0;
    while (prev && attempts < 3) {
      const text = prev.textContent?.trim() || '';
      const match = text.match(/(?:create|add|write|file)\s+([^\s]+\.\w+)/i);
      if (match) return match[1].split('/').pop().split('\\').pop();
      prev = prev.previousElementSibling;
      attempts++;
    }
    return null;
  }

  function generateFilename(language, index, existingNames) {
    const ext = getExtension(language);
    let name = `snippet-${String(index).padStart(2, '0')}.${ext}`;
    let counter = 1;
    while (existingNames.has(name)) {
      name = `snippet-${String(index).padStart(2, '0')}-${counter}.${ext}`;
      counter++;
    }
    return name;
  }

  function getBlockCode(block, type) {
    switch (type) {
      case 'preCode':
        return block.textContent || '';
      case 'monaco':
        // Monaco: collect all visible lines
        const lines = block.querySelectorAll('.view-line');
        return Array.from(lines).map(l => l.textContent).join('\n');
      case 'codemirror6':
        return block.textContent || '';
      case 'codemirror5':
        return block.textContent || '';
      default:
        return block.textContent || '';
    }
  }

  // ============ EXTRACTION LOGIC ============
  function scanForBlocks(root = document) {
    const blocks = [];
    const seen = new Set();

    // Helper to add unique blocks
    function addBlock(element, type, languageHint = null) {
      const key = element.id || hashCode(element.outerHTML.slice(0, 500));
      if (seen.has(key)) return;
      seen.add(key);

      const code = cleanCodeText(getBlockCode(element, type));
      if (code.length < 10) return; // Skip tiny snippets

      const language = languageHint || normalizeLanguage(
        element.className.match(/language-(\w+)/)?.[1] ||
        element.getAttribute('data-language') ||
        detectLanguageFromCode(code)
      );

      blocks.push({ element, type, code, language, root });
    }

    // 1. <pre><code> blocks
    root.querySelectorAll(SELECTORS.preCode).forEach(el => {
      const lang = el.className.match(/language-(\w+)/)?.[1] || el.getAttribute('data-language');
      addBlock(el, 'preCode', lang);
    });

    // 2. Monaco editors
    root.querySelectorAll(SELECTORS.monacoContainer).forEach(container => {
      const langEl = container.querySelector('[data-language]') || container;
      const lang = langEl.getAttribute('data-language');
      addBlock(container, 'monaco', lang);
    });

    // 3. CodeMirror 6
    root.querySelectorAll(SELECTORS.codemirror6Container).forEach(container => {
      const langEl = container.querySelector('[data-language]') || container;
      const lang = langEl.getAttribute('data-language');
      addBlock(container, 'codemirror6', lang);
    });

    // 4. CodeMirror 5
    root.querySelectorAll(SELECTORS.codemirror5Container).forEach(container => {
      const langEl = container.querySelector('[data-language]') || container;
      const lang = langEl.getAttribute('data-language');
      addBlock(container, 'codemirror5', lang);
    });

    // 5. Shadow DOM
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        scanShadowDom(el.shadowRoot, blocks, seen);
      }
    });

    // 6. Same-origin iframes
    root.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentDocument) {
          scanForBlocks(iframe.contentDocument);
        }
      } catch (e) {
        // Cross-origin, skip
      }
    });

    return blocks;
  }

  function scanShadowDom(shadowRoot, blocks, seen) {
    shadowRoot.querySelectorAll(SELECTORS.preCode).forEach(el => {
      const key = hashCode(el.outerHTML.slice(0, 500));
      if (seen.has(key)) return;
      seen.add(key);
      const code = cleanCodeText(el.textContent || '');
      if (code.length >= 10) {
        const lang = normalizeLanguage(el.className.match(/language-(\w+)/)?.[1] || detectLanguageFromCode(code));
        blocks.push({ element: el, type: 'preCode', code, language: lang, root: shadowRoot });
      }
    });
    // Recurse into nested shadow roots
    shadowRoot.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) scanShadowDom(el.shadowRoot, blocks, seen);
    });
  }

  function buildBlockMetadata(block, index) {
    const existingNames = new Set(extractedBlocks.map(b => b.filename));
    let filename = extractFilenameFromHeader(block.element) ||
                   extractFilenameFromComment(block.code) ||
                   extractFilenameFromContext(block.element) ||
                   generateFilename(block.language, index, existingNames);

    // Handle duplicates: same filename, different content -> version
    const sameNameBlocks = extractedBlocks.filter(b => b.filename === filename);
    if (sameNameBlocks.length > 0) {
      const isDuplicate = sameNameBlocks.some(b => b.code === block.code);
      if (isDuplicate) {
        return { ...block, filename, isDuplicate: true, version: null };
      }
      // Different content, same name -> version suffix
      const baseName = filename.replace(/\.(\w+)$/, '');
      const ext = filename.split('.').pop();
      filename = `${baseName}-${sameNameBlocks.length + 1}.${ext}`;
    }

    return { ...block, filename, isDuplicate: false, version: null };
  }

  function extractAll() {
    extractedBlocks = [];
    const rawBlocks = scanForBlocks(document);

    rawBlocks.forEach((block, i) => {
      const meta = buildBlockMetadata(block, i + 1);
      extractedBlocks.push({
        ...meta,
        id: `block-${i}`,
        index: i,
        selected: !meta.isDuplicate,
        editedCode: null
      });
    });

    // Mark duplicates visually
    extractedBlocks.forEach(b => {
      if (b.isDuplicate) {
        b.element.classList.add('redcoda-highlight', 'duplicate');
        const badge = document.createElement('span');
        badge.className = 'redcoda-badge duplicate';
        badge.textContent = 'Duplicate';
        b.element.style.position = 'relative';
        b.element.appendChild(badge);
      } else {
        b.element.classList.add('redcoda-highlight');
        const badge = document.createElement('span');
        badge.className = 'redcoda-badge';
        badge.textContent = b.filename;
        b.element.style.position = 'relative';
        b.element.appendChild(badge);
      }
    });

    return extractedBlocks.filter(b => !b.isDuplicate);
  }

  // ============ DEEP SCAN ============
  async function deepScan(sendProgress) {
    isDeepScanning = true;
    deepScanStopRequested = false;
    showProgressOverlay();

    const scrollContainer = findScrollContainer();
    let lastHeight = 0;
    let stagnantCount = 0;
    let totalBlocks = 0;

    while (!deepScanStopRequested) {
      // Scroll up to load more
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
        await sleep(500);
      } else {
        window.scrollTo(0, 0);
        await sleep(500);
      }

      const newBlocks = extractAll();
      const newCount = newBlocks.length;

      sendProgress({
        current: newCount,
        total: newCount,
        message: `Found ${newCount} code blocks...`
      });

      if (newCount === totalBlocks) {
        stagnantCount++;
        if (stagnantCount >= 3) break;
      } else {
        stagnantCount = 0;
        totalBlocks = newCount;
      }

      // Check if we've reached top
      const currentHeight = scrollContainer?.scrollHeight || document.body.scrollHeight;
      if (currentHeight === lastHeight) {
        stagnantCount++;
        if (stagnantCount >= 3) break;
      }
      lastHeight = currentHeight;

      if (deepScanStopRequested) break;
    }

    hideProgressOverlay();
    isDeepScanning = false;
    return extractedBlocks.filter(b => !b.isDuplicate);
  }

  function findScrollContainer() {
    // Common chat scroll containers
    const selectors = [
      '[data-scroll-container]', '.chat-messages', '.conversation',
      '[role="log"]', 'main', '.messages-container'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    // Fallback: find any scrollable ancestor of first code block
    const firstBlock = document.querySelector(SELECTORS.preCode);
    if (firstBlock) {
      let parent = firstBlock.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight) return parent;
        parent = parent.parentElement;
      }
    }
    return null;
  }

  function showProgressOverlay() {
    if (progressOverlay) return;
    progressOverlay = document.createElement('div');
    progressOverlay.className = 'redcoda-progress-overlay';
    progressOverlay.innerHTML = `
      <div style="font-size: 20px; font-weight: 600; color: #e53935; margin-bottom: 8px;">Deep Scanning...</div>
      <div class="redcoda-progress-bar"><div class="redcoda-progress-fill" style="width: 0%"></div></div>
      <div class="redcoda-progress-text">Initializing...</div>
      <button class="redcoda-stop-btn">Stop</button>
    `;
    progressOverlay.querySelector('.redcoda-stop-btn').onclick = () => {
      deepScanStopRequested = true;
    };
    document.body.appendChild(progressOverlay);
  }

  function hideProgressOverlay() {
    if (progressOverlay) {
      progressOverlay.remove();
      progressOverlay = null;
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ MESSAGE HANDLING ============
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'extract':
          const blocks = extractAll();
          sendResponse({ blocks: blocks.map(b => ({
            id: b.id, filename: b.filename, language: b.language,
            code: b.editedCode || b.code, selected: b.selected
          })), total: blocks.length });
          break;
        case 'deep-scan':
          deepScan(progress => {
            chrome.runtime.sendMessage({ action: 'deep-scan-progress', ...progress });
          }).then(blocks => {
            sendResponse({ blocks: blocks.map(b => ({
              id: b.id, filename: b.filename, language: b.language,
              code: b.editedCode || b.code, selected: b.selected
            })) });
          });
          return true; // Async response
        case 'stop-deep-scan':
          deepScanStopRequested = true;
          sendResponse({ success: true });
          break;
        case 'get-block':
          const block = extractedBlocks.find(b => b.id === message.id);
          sendResponse(block ? { code: block.editedCode || block.code, filename: block.filename, language: block.language } : null);
          break;
        case 'update-block':
          const blockToUpdate = extractedBlocks.find(b => b.id === message.id);
          if (blockToUpdate) {
            blockToUpdate.editedCode = message.code;
            blockToUpdate.filename = message.filename;
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false });
          }
          break;
        case 'toggle-block':
          const blockToToggle = extractedBlocks.find(b => b.id === message.id);
          if (blockToToggle) {
            blockToToggle.selected = !blockToToggle.selected;
            sendResponse({ selected: blockToToggle.selected });
          }
          break;
        case 'flash-block':
          const blockToFlash = extractedBlocks.find(b => b.id === message.id);
          if (blockToFlash) {
            blockToFlash.element.classList.add('redcoda-flash');
            setTimeout(() => blockToFlash.element.classList.remove('redcoda-flash'), 800);
            sendResponse({ success: true });
          }
          break;
        case 'clear-highlights':
          document.querySelectorAll('.redcoda-highlight').forEach(el => {
            el.classList.remove('redcoda-highlight');
            el.querySelectorAll('.redcoda-badge').forEach(b => b.remove());
          });
          extractedBlocks = [];
          sendResponse({ success: true });
          break;
      }
      return true;
    });
  }

  // ============ INIT ============
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupMessageListener);
    } else {
      setupMessageListener();
    }
    // Auto-scan on load
    setTimeout(extractAll, 100);
  }

  init();
})();