/**
 * Minimal PNG generator for XPulse icons.
 * Run: node generate-icons.js
 * Creates icon16.png, icon48.png, icon128.png in assets/icons/
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function createPNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx]     = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  const compressed = zlib.deflateSync(rawData);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend)
  ]);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    // Alpha blend
    const srcA = a / 255;
    const dstA = pixels[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
      pixels[i]     = Math.round((r * srcA + pixels[i] * dstA * (1 - srcA)) / outA);
      pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
      pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
      pixels[i + 3] = Math.round(outA * 255);
    }
  }

  function fillRect(x1, y1, x2, y2, r, g, b, a = 255) {
    for (let y = Math.floor(y1); y < Math.ceil(y2); y++) {
      for (let x = Math.floor(x1); x < Math.ceil(x2); x++) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }

  function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  // Background: dark rounded rect
  const rad = Math.max(2, Math.floor(size * 0.15));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      // Check corners
      if (x < rad && y < rad && dist(x, y, rad, rad) > rad) inside = false;
      if (x >= size - rad && y < rad && dist(x, y, size - rad - 1, rad) > rad) inside = false;
      if (x < rad && y >= size - rad && dist(x, y, rad, size - rad - 1) > rad) inside = false;
      if (x >= size - rad && y >= size - rad && dist(x, y, size - rad - 1, size - rad - 1) > rad) inside = false;

      if (inside) {
        setPixel(x, y, 13, 17, 23, 255); // #0d1117
      }
    }
  }

  // Draw a lightning bolt in the center
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 128;

  // Define bolt as polygon points (relative to center)
  const boltPoints = [
    [-15, -50], [10, -10], [-5, -10],
    [15, 50], [-10, 10], [5, 10]
  ];

  // Scale and translate
  const absPoints = boltPoints.map(([px, py]) => [
    cx + px * scale,
    cy + py * scale
  ]);

  // Fill polygon using scanline
  function fillPolygon(points, r, g, b, a) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, py] of points) {
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(size - 1, Math.ceil(maxY));

    for (let y = minY; y <= maxY; y++) {
      const intersections = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          const t = (y - y1) / (y2 - y1);
          intersections.push(x1 + t * (x2 - x1));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const xStart = Math.max(0, Math.floor(intersections[i]));
        const xEnd = Math.min(size - 1, Math.ceil(intersections[i + 1]));
        for (let x = xStart; x <= xEnd; x++) {
          // Gradient: blend from blue (#58a6ff) to green (#00c9a7)
          const t = (y - minY) / Math.max(1, maxY - minY);
          const gr = Math.round(88 * (1 - t) + 0 * t);
          const gg = Math.round(166 * (1 - t) + 201 * t);
          const gb = Math.round(255 * (1 - t) + 167 * t);
          setPixel(x, y, gr, gg, gb, a);
        }
      }
    }
  }

  fillPolygon(absPoints, 88, 166, 255, 255);

  return createPNG(size, size, pixels);
}

// Generate icons
const outDir = path.join(__dirname, 'assets', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

[16, 48, 128].forEach(size => {
  const png = drawIcon(size);
  const filePath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`✓ Created ${filePath} (${png.length} bytes)`);
});

console.log('\nAll icons generated successfully!');
