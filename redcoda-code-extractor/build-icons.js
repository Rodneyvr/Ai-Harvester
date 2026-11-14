// Build script to convert SVG to PNG icons
// Run with: node build-icons.js
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { createCanvas } = require('canvas');

const svgPath = './icons/icon.svg';
const sizes = [16, 32, 48, 128];

const svgContent = fs.readFileSync(svgPath, 'utf-8');

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Parse and draw SVG
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${svgContent}</body></html>`);
  const svg = dom.window.document.querySelector('svg');
  const img = new dom.window.Image();
  img.src = 'data:image/svg+xml;base64,' + Buffer.from(svgContent).toString('base64');

  // Use canvas to render
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, size, size);

  // Draw a simplified version directly
  const scale = size / 128;
  ctx.save();
  ctx.scale(scale, scale);

  // Background
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#1a1a1a');
  grad.addColorStop(1, '#0d0d0d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 112, 20);
  ctx.fill();
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Code streaks
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(25, 35); ctx.lineTo(103, 35);
  ctx.moveTo(25, 55); ctx.lineTo(95, 55);
  ctx.moveTo(25, 75); ctx.lineTo(103, 75);
  ctx.moveTo(35, 95); ctx.lineTo(93, 95);
  ctx.stroke();

  // R letter
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = '#e53935';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', 64, 72);

  // </> tag
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#e53935';
  ctx.fillText('</>', 64, 100);

  ctx.restore();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`./icons/icon-${size}.png`, buffer);
  console.log(`Created icon-${size}.png`);
});

console.log('All icons generated!');