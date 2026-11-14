// Pure JS PNG generator - no native deps
const fs = require('fs');
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

function createPNG(width, height, drawFn) {
  // Create image data
  const imgData = Buffer.alloc(width * height * 4);
  const ctx = {
    width, height,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    font: '10px monospace',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    beginPath: () => { ctx._path = []; },
    moveTo: (x, y) => { ctx._path.push({ type: 'M', x, y }); },
    lineTo: (x, y) => { ctx._path.push({ type: 'L', x, y }); },
    stroke: () => {
      ctx._path.forEach((cmd, i) => {
        if (cmd.type === 'M') return;
        const prev = ctx._path[i - 1];
        if (!prev) return;
        drawLine(imgData, width, height, prev.x, prev.y, cmd.x, cmd.y, ctx.strokeStyle, ctx.lineWidth);
      });
    },
    fillText: (text, x, y) => {
      // Simple text rendering - draw as rectangles for each char
      const charWidth = parseInt(ctx.font) * 0.6;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const cx = x + i * charWidth - (ctx.textAlign === 'center' ? text.length * charWidth / 2 : 0);
        drawChar(imgData, width, height, cx, y - parseInt(ctx.font) * 0.35, ch, ctx.fillStyle);
      }
    },
    fillRect: (x, y, w, h) => {
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py++) {
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px++) {
          const idx = (py * width + px) * 4;
          const color = parseColor(ctx.fillStyle);
          imgData[idx] = color.r;
          imgData[idx + 1] = color.g;
          imgData[idx + 2] = color.b;
          imgData[idx + 3] = Math.round(color.a * 255 * ctx.globalAlpha);
        }
      }
    },
    strokeRect: (x, y, w, h) => {
      drawLine(imgData, width, height, x, y, x + w, y, ctx.strokeStyle, ctx.lineWidth);
      drawLine(imgData, width, height, x + w, y, x + w, y + h, ctx.strokeStyle, ctx.lineWidth);
      drawLine(imgData, width, height, x + w, y + h, x, y + h, ctx.strokeStyle, ctx.lineWidth);
      drawLine(imgData, width, height, x, y + h, x, y, ctx.strokeStyle, ctx.lineWidth);
    },
    roundRect: (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.lineTo(x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.lineTo(x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.lineTo(x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x + r, y);
      if (ctx.fillStyle) {
        // Fill - simplified
        for (let py = y; py < y + h; py++) {
          for (let px = x; px < x + w; px++) {
            const dx = Math.max(Math.max(x - px, 0), Math.max(px - (x + w), 0));
            const dy = Math.max(Math.max(y - py, 0), Math.max(py - (y + h), 0));
            if (dx * dx + dy * dy <= r * r) continue;
            const idx = (Math.floor(py) * width + Math.floor(px)) * 4;
            if (idx >= 0 && idx < imgData.length - 3) {
              const color = parseColor(ctx.fillStyle);
              imgData[idx] = color.r;
              imgData[idx + 1] = color.g;
              imgData[idx + 2] = color.b;
              imgData[idx + 3] = Math.round(color.a * 255 * ctx.globalAlpha);
            }
          }
        }
      }
    }
  };

  drawFn(ctx);

  // Create PNG
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Add filter bytes (0 = none) to each scanline
  const filteredData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    filteredData[y * (width * 4 + 1)] = 0; // filter type
    imgData.copy(filteredData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(filteredData);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG signature
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', compressed),
    writeChunk('IEND', Buffer.alloc(0))
  ]);

  return png;
}

function parseColor(str) {
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
    } else if (hex.length === 6) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
    }
  }
  // rgba() parsing
  const match = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]), a: match[4] ? parseFloat(match[4]) : 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function drawLine(data, width, height, x1, y1, x2, y2, color, lineWidth) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  if (steps === 0) return;
  const parsed = parseColor(color);
  const r = parsed.r, g = parsed.g, b = parsed.b, a = Math.round(parsed.a * 255);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    for (let dy = -Math.floor(lineWidth / 2); dy <= Math.floor(lineWidth / 2); dy++) {
      for (let dx = -Math.floor(lineWidth / 2); dx <= Math.floor(lineWidth / 2); dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = (py * width + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }
}

function drawChar(data, width, height, x, y, ch, color) {
  // Very simple 5x7 font rendering
  const font = {
    'R': [0x7E, 0x81, 0x81, 0x7E, 0x90, 0x88, 0x84],
    '<': [0x10, 0x28, 0x44, 0x82, 0x44, 0x28, 0x10],
    '/': [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
    '>': [0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01],
    'C': [0x3C, 0x42, 0x80, 0x80, 0x80, 0x42, 0x3C],
    'O': [0x3C, 0x42, 0x81, 0x81, 0x81, 0x42, 0x3C],
    'D': [0x7C, 0x42, 0x81, 0x81, 0x81, 0x42, 0x7C],
    'A': [0x3C, 0x42, 0x42, 0x7E, 0x42, 0x42, 0x42],
    'E': [0x7E, 0x80, 0x80, 0x7C, 0x80, 0x80, 0x7E],
    'X': [0x81, 0x42, 0x24, 0x18, 0x24, 0x42, 0x81],
    'T': [0x7E, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18],
    'S': [0x3C, 0x42, 0x80, 0x3C, 0x02, 0x42, 0x3C]
  };
  const pattern = font[ch] || [0,0,0,0,0,0,0];
  const parsed = parseColor(color);
  const r = parsed.r, g = parsed.g, b = parsed.b, a = Math.round(parsed.a * 255);
  const scale = 2;
  for (let row = 0; row < 7; row++) {
    const bits = pattern[row];
    for (let col = 0; col < 8; col++) {
      if (bits & (0x80 >> col)) {
        const px = Math.floor(x + col * scale);
        const py = Math.floor(y + row * scale);
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const ppx = px + dx;
            const ppy = py + dy;
            if (ppx >= 0 && ppx < width && ppy >= 0 && ppy < height) {
              const idx = (ppy * width + ppx) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = a;
            }
          }
        }
      }
    }
  }
}

const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
  const png = createPNG(size, size, (ctx) => {
    const scale = size / 128;
    const s = (v) => v * scale;

    // Background dark
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, size, size);

    // Rounded rect background
    ctx.fillStyle = '#1a1a1a';
    ctx.roundRect(s(8), s(8), s(112), s(112), s(20));

    // Border
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = s(2);
    ctx.strokeRect(s(8), s(8), s(112), s(112));

    // Code streaks
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = s(2);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(s(25), s(35)); ctx.lineTo(s(103), s(35));
    ctx.moveTo(s(25), s(55)); ctx.lineTo(s(95), s(55));
    ctx.moveTo(s(25), s(75)); ctx.lineTo(s(103), s(75));
    ctx.moveTo(s(35), s(95)); ctx.lineTo(s(93), s(95));
    ctx.stroke();
    ctx.globalAlpha = 1;

    // R letter
    ctx.fillStyle = '#e53935';
    ctx.font = `${Math.round(s(48))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', s(64), s(72));

    // </> tag
    ctx.fillStyle = '#e53935';
    ctx.font = `${Math.round(s(16))}px monospace`;
    ctx.fillText('</>', s(64), s(100));
  });

  fs.writeFileSync(`./icons/icon-${size}.png`, png);
  console.log(`Created icon-${size}.png (${png.length} bytes)`);
});

console.log('All icons generated!');