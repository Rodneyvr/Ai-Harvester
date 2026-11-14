// Extension verification script
const fs = require('fs');
const path = require('path');

console.log('=== RedCoda Code Extractor v2 - Verification ===\n');

const requiredFiles = [
  'manifest.json',
  'background/background.js',
  'content/content.js',
  'content/content.css',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png'
];

let allPassed = true;

console.log('1. Checking required files...');
for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : 0;
  console.log(`  ${exists ? '✓' : '✗'} ${file} (${size} bytes)`);
  if (!exists) allPassed = false;
}

console.log('\n2. Validating manifest.json...');
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));
  const checks = [
    { key: 'name', expected: 'RedCoda Code Extractor' },
    { key: 'version', expected: '2.0.0' },
    { key: 'manifest_version', expected: 3 },
    { key: 'action.default_popup', expected: 'popup/popup.html' },
    { key: 'background.service_worker', expected: 'background/background.js' },
    { key: 'background.type', expected: 'module' },
    { key: 'permissions', expected: ['activeTab', 'scripting', 'downloads', 'storage'] },
    { key: 'commands.open-popup.suggested_key.default', expected: 'Alt+Shift+R' }
  ];

  for (const check of checks) {
    const keys = check.key.split('.');
    let value = manifest;
    for (const k of keys) value = value?.[k];
    const passed = JSON.stringify(value) === JSON.stringify(check.expected);
    console.log(`  ${passed ? '✓' : '✗'} manifest.${check.key}: ${JSON.stringify(value)}`);
    if (!passed) allPassed = false;
  }
} catch (e) {
  console.log('  ✗ Failed to parse manifest.json:', e.message);
  allPassed = false;
}

console.log('\n3. Checking content script key features...');
const contentJs = fs.readFileSync(path.join(__dirname, 'content/content.js'), 'utf-8');
const contentFeatures = [
  { name: 'extractAll function', pattern: /function extractAll/ },
  { name: 'deepScan function', pattern: /async function deepScan/ },
  { name: 'Monaco detection', pattern: /monaco-editor/ },
  { name: 'CodeMirror 6 detection', pattern: /cm-editor/ },
  { name: 'CodeMirror 5 detection', pattern: /CodeMirror/ },
  { name: 'Shadow DOM scanning', pattern: /shadowRoot/ },
  { name: 'iframe scanning', pattern: /iframe/ },
  { name: 'Filename from header', pattern: /extractFilenameFromHeader/ },
  { name: 'Filename from comment', pattern: /extractFilenameFromComment/ },
  { name: 'Filename from context', pattern: /extractFilenameFromContext/ },
  { name: 'Duplicate detection', pattern: /isDuplicate/ },
  { name: 'Version numbering', pattern: /baseName.*version|sameNameBlocks\.length/ },
  { name: 'Line number stripping', pattern: /replace.*\\d+.*gm/ },
  { name: 'Copy button text removal', pattern: /replace.*Copy/ },
  { name: 'Language detection from code', pattern: /detectLanguageFromCode/ },
  { name: 'Progress overlay', pattern: /redcoda-progress-overlay/ },
  { name: 'Stop button', pattern: /deepScanStopRequested/ }
];

for (const feature of contentFeatures) {
  const passed = feature.pattern.test(contentJs);
  console.log(`  ${passed ? '✓' : '✗'} ${feature.name}`);
  if (!passed) allPassed = false;
}

console.log('\n4. Checking popup features...');
const popupJs = fs.readFileSync(path.join(__dirname, 'popup/popup.js'), 'utf-8');
const popupFeatures = [
  { name: 'Search filter', pattern: /handleSearch/ },
  { name: 'Language chips filter', pattern: /toggleLanguage/ },
  { name: 'AI only toggle', pattern: /handleAiOnly/ },
  { name: 'Deep scan button', pattern: /startDeepScan/ },
  { name: 'Block selection', pattern: /toggleBlockSelection/ },
  { name: 'Edit block modal', pattern: /openEditModal/ },
  { name: 'Copy block code', pattern: /copyBlockCode/ },
  { name: 'Save block as file', pattern: /saveBlockFile/ },
  { name: 'Flash on page', pattern: /flashBlock/ },
  { name: 'Export as Markdown', pattern: /exportMarkdown/ },
  { name: 'Export as ZIP', pattern: /exportZip/ },
  { name: 'ZIP creation', pattern: /createZip/ },
  { name: 'Folder layouts', pattern: /layout.*paths|flat|language|message/ },
  { name: 'Number files option', pattern: /numberFiles/ },
  { name: 'INDEX.md option', pattern: /includeIndex/ },
  { name: 'Compression level', pattern: /compressionLevel/ },
  { name: 'Settings persistence', pattern: /chrome\.storage\.sync/ }
];

for (const feature of popupFeatures) {
  const passed = feature.pattern.test(popupJs);
  console.log(`  ${passed ? '✓' : '✗'} ${feature.name}`);
  if (!passed) allPassed = false;
}

console.log('\n5. Checking popup HTML structure...');
const popupHtml = fs.readFileSync(path.join(__dirname, 'popup/popup.html'), 'utf-8');
const htmlElements = [
  { name: 'Search input', pattern: /id="search-input"/ },
  { name: 'Language chips container', pattern: /id="language-chips"/ },
  { name: 'AI only toggle', pattern: /id="ai-only-toggle"/ },
  { name: 'Block list container', pattern: /id="block-list"/ },
  { name: 'Deep scan button', pattern: /id="deep-scan-btn"/ },
  { name: 'Progress section', pattern: /id="progress-section"/ },
  { name: 'Progress bar', pattern: /id="progress-fill"/ },
  { name: 'Stop scan button', pattern: /id="stop-scan-btn"/ },
  { name: 'Selection count', pattern: /id="selection-count"/ },
  { name: 'Copy MD button', pattern: /id="copy-md-btn"/ },
  { name: 'Save MD button', pattern: /id="save-md-btn"/ },
  { name: 'Export ZIP button', pattern: /id="export-zip-btn"/ },
  { name: 'Settings panel', pattern: /class="settings-panel"/ },
  { name: 'Layout select', pattern: /id="layout-select"/ },
  { name: 'Number files checkbox', pattern: /id="number-files"/ },
  { name: 'Include index checkbox', pattern: /id="include-index"/ },
  { name: 'Compression level select', pattern: /id="compression-level"/ }
];

for (const element of htmlElements) {
  const passed = element.pattern.test(popupHtml);
  console.log(`  ${passed ? '✓' : '✗'} ${element.name}`);
  if (!passed) allPassed = false;
}

console.log('\n6. Checking CSS theme (RedCoda: black/red/silver)...');
const popupCss = fs.readFileSync(path.join(__dirname, 'popup/popup.css'), 'utf-8');
const cssChecks = [
  { name: 'Dark background (#0d0d0d)', pattern: /--bg:\s*#0d0d0d/ },
  { name: 'Red accent (#e53935)', pattern: /--accent:\s*#e53935/ },
  { name: 'Silver (#b0b0b0)', pattern: /--silver:\s*#b0b0b0/ },
  { name: 'Elevated background (#1a1a1a)', pattern: /--bg-elevated:\s*#1a1a1a/ }
];

for (const check of cssChecks) {
  const passed = check.pattern.test(popupCss);
  console.log(`  ${passed ? '✓' : '✗'} ${check.name}`);
  if (!passed) allPassed = false;
}

console.log('\n7. Checking background script...');
const bgJs = fs.readFileSync(path.join(__dirname, 'background/background.js'), 'utf-8');
const bgChecks = [
  { name: 'onInstalled handler', pattern: /onInstalled/ },
  { name: 'Default settings', pattern: /redcoda-settings/ },
  { name: 'Commands listener', pattern: /onCommand/ },
  { name: 'Message listener', pattern: /onMessage/ }
];

for (const check of bgChecks) {
  const passed = check.pattern.test(bgJs);
  console.log(`  ${passed ? '✓' : '✗'} ${check.name}`);
  if (!passed) allPassed = false;
}

console.log('\n8. Checking ZIP file...');
const zipPath = path.join(__dirname, '..', 'redcoda-code-extractor.zip');
const zipExists = fs.existsSync(zipPath);
const zipSize = zipExists ? fs.statSync(zipPath).size : 0;
console.log(`  ${zipExists ? '✓' : '✗'} redcoda-code-extractor.zip (${zipSize} bytes)`);
if (!zipExists) allPassed = false;

console.log('\n9. Checking test page...');
const testPage = path.join(__dirname, 'test-page.html');
const testExists = fs.existsSync(testPage);
console.log(`  ${testExists ? '✓' : '✗'} test-page.html (${testExists ? fs.statSync(testPage).size : 0} bytes)`);

console.log('\n=== SUMMARY ===');
console.log(`Status: ${allPassed ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`);
console.log(`Extension size: ~${Math.round(zipSize / 1024)} KB`);
console.log(`Install: Unzip redcoda-code-extractor.zip, open chrome://extensions, enable Developer mode, "Load unpacked"`);
console.log(`Shortcut: Alt+Shift+R`);
console.log(`Test: Open test-page.html in browser, click extension icon or press Alt+Shift+R`);

process.exit(allPassed ? 0 : 1);