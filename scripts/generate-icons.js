// scripts/generate-icons.js
// Dependency-free PNG generator using Node.js built-in zlib
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePNG(width, height, drawFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data with scanline filter 0
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon drawer: Stylish F95 tracker badge (dark indigo rounded rect with bright cyan arrow / F glyph)
function iconPixel(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;

  // Background: rounded badge
  const radius = 0.15;
  const dx = Math.max(0, Math.abs(nx - cx) - (0.45 - radius));
  const dy = Math.max(0, Math.abs(ny - cy) - (0.45 - radius));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > radius) {
    return [0, 0, 0, 0]; // Transparent outside badge
  }

  // Base background: #1a1e2e (f95 dark theme feel)
  let r = 26;
  let g = 30;
  let b = 46;
  let a = 255;

  // Draw 'F' and tracking arrow glyph inside badge
  // F stem: x in [0.25, 0.40], y in [0.22, 0.78]
  const inStem = (nx >= 0.26 && nx <= 0.40 && ny >= 0.22 && ny <= 0.78);
  // F top bar: x in [0.26, 0.74], y in [0.22, 0.36]
  const inTopBar = (nx >= 0.26 && nx <= 0.74 && ny >= 0.22 && ny <= 0.36);
  // F middle bar: x in [0.26, 0.62], y in [0.44, 0.56]
  const inMidBar = (nx >= 0.26 && nx <= 0.62 && ny >= 0.44 && ny <= 0.56);

  // Tracking notification dot in bottom right:
  const dotDx = nx - 0.72;
  const dotDy = ny - 0.72;
  const inDot = (dotDx * dotDx + dotDy * dotDy) <= 0.016;

  if (inDot) {
    // Bright vibrant amber/orange notification dot: #ff9800
    return [255, 152, 0, 255];
  }

  if (inStem || inTopBar || inMidBar) {
    // Electric cyan glyph: #00e5ff
    return [0, 229, 255, 255];
  }

  // Subtle inner border
  if (dist > radius - 0.03) {
    return [55, 65, 81, 255];
  }

  return [r, g, b, a];
}

const outDir = path.resolve(__dirname, '../icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const size of [16, 48, 128]) {
  const buf = generatePNG(size, size, iconPixel);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated: ${outPath} (${buf.length} bytes)`);
}
