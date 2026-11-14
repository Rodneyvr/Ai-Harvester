// RedCoda Code Extractor - Background Service Worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      'redcoda-settings': {
        layout: 'paths',
        numberFiles: true,
        includeIndex: true,
        compressionLevel: 6
      }
    });

    // Open welcome page or show notification
    console.log('RedCoda Code Extractor v2 installed');
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-popup') {
    // Popup opens automatically via action
    console.log('Shortcut triggered: Open RedCoda');
  }
});

// Handle downloads if needed
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.filename.startsWith('redcoda-')) {
    suggest({ filename: item.filename });
  }
});

// Keep service worker alive for message passing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward messages between popup and content scripts if needed
  if (message.action === 'ping') {
    sendResponse({ pong: true });
  }
  return true;
});