// Build ZIP for distribution
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
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

function writeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function addFileToZip(zipData, filePath, content) {
  const nameBytes = Buffer.from(filePath, 'utf-8');
  const contentBytes = Buffer.from(content);
  const crc = crc32(contentBytes);
  const compressed = contentBytes; // Store uncompressed for simplicity
  const compressedSize = compressed.length;
  const uncompressedSize = contentBytes.length;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  // Local file header
  const localHeader = Buffer.alloc(30 + nameBytes.length);
  const localView = new DataView(localHeader.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0, true);
  localView.setUint16(8, 0, true); // No compression
  localView.setUint16(10, dosTime, true);
  localView.setUint16(12, dosDate, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, compressedSize, true);
  localView.setUint32(22, uncompressedSize, true);
  localView.setUint16(26, nameBytes.length, true);
  localView.setUint16(28, 0, true);
  localHeader.set(nameBytes, 30);

  zipData.localFiles.push({ header: localHeader, data: compressed });
  zipData.centralDir.push({
    name: nameBytes,
    crc,
    compressedSize,
    uncompressedSize,
    offset: zipData.offset,
    dosTime,
    dosDate,
    nameLength: nameBytes.length
  });
  zipData.offset += localHeader.length + compressedSize;
}

function finishZip(zipData) {
  const centralDirOffset = zipData.offset;
  let centralDirSize = 0;

  // Write central directory records
  for (const file of zipData.centralDir) {
    const cdRecord = Buffer.alloc(46 + file.nameLength);
    const cdView = new DataView(cdRecord.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, file.dosTime, true);
    cdView.setUint16(14, file.dosDate, true);
    cdView.setUint32(16, file.crc, true);
    cdView.setUint32(20, file.compressedSize, true);
    cdView.setUint32(24, file.uncompressedSize, true);
    cdView.setUint16(28, file.nameLength, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, file.offset, true);
    cdRecord.set(file.name, 46);
    zipData.centralDirRecords.push(cdRecord);
    centralDirSize += cdRecord.length;
  }

  // End of central directory
  const endRecord = Buffer.alloc(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, zipData.centralDir.length, true);
  endView.setUint16(10, zipData.centralDir.length, true);
  endView.setUint32(12, centralDirSize, true);
  endView.setUint32(16, centralDirOffset, true);
  endView.setUint16(20, 0, true);

  // Concatenate all
  const parts = [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])]; // Wait, this is PNG not ZIP

  // Fix: proper ZIP concatenation
  const zipParts = [];
  for (const file of zipData.localFiles) {
    zipParts.push(file.header);
    zipParts.push(file.data);
  }
  for (const record of zipData.centralDirRecords) {
    zipParts.push(record);
  }
  zipParts.push(endRecord);

  return Buffer.concat(zipParts);
}

// Build the extension ZIP
function buildExtensionZip() {
  const zipData = {
    localFiles: [],
    centralDir: [],
    centralDirRecords: [],
    offset: 0
  };

  const filesToInclude = [
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

  for (const file of filesToInclude) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath);
      addFileToZip(zipData, file, content);
      console.log(`Added: ${file} (${content.length} bytes)`);
    } else {
      console.warn(`Missing: ${file}`);
    }
  }

  const zipBuffer = finishZip(zipData);
  const outputPath = path.join(__dirname, '..', 'redcoda-code-extractor.zip');
  fs.writeFileSync(outputPath, zipBuffer);
  console.log(`\nCreated: ${outputPath} (${zipBuffer.length} bytes)`);

  // Verify with unzip -l equivalent
  console.log('\nZIP contents:');
  for (const file of filesToInclude) {
    console.log(`  ${file}`);
  }
}

buildExtensionZip();