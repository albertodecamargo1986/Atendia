// Generate a 256x256 ICO file with proper PNG encoding for AtendIA
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.join(__dirname, '..', 'resources');

// First generate the PNG (256x256 RGBA)
const width = 256, height = 256;

// Raw RGBA data
const rawPixels = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const off = (y * width + x) * 4;
    const cx = x - 127.5, cy = y - 127.5;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const inCircle = dist < 112;
    rawPixels[off]     = inCircle ? 0x4f : 0x00; // R
    rawPixels[off + 1] = inCircle ? 0x46 : 0x00; // G
    rawPixels[off + 2] = inCircle ? 0xe5 : 0x00; // B
    rawPixels[off + 3] = inCircle ? 0xff : 0x00; // A
  }
}

// Build raw image data with filter byte (0 = None) per row
const filtered = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++) {
  const rowOff = y * (1 + width * 4);
  filtered[rowOff] = 0; // filter: None
  rawPixels.copy(filtered, rowOff + 1, y * width * 4, (y + 1) * width * 4);
}

const compressed = zlib.deflateSync(filtered);

// CRC32
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

// PNG signature
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const ihdrChunk = makeChunk('IHDR', ihdr);
const idatChunk = makeChunk('IDAT', compressed);
const iendChunk = makeChunk('IEND', Buffer.alloc(0));

const pngData = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);

// Save PNG
fs.writeFileSync(path.join(outDir, 'icon.png'), pngData);
console.log('Generated icon.png (256x256)');

// Create ICO from PNG
// ICO with 256x256 entry (width=0 means 256)
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);    // reserved
icoHeader.writeUInt16LE(1, 2);    // type = ICO
icoHeader.writeUInt16LE(1, 4);    // 1 image

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0);                      // width (0 = 256)
dirEntry.writeUInt8(0, 1);                      // height (0 = 256)
dirEntry.writeUInt8(0, 2);                      // palette
dirEntry.writeUInt8(0, 3);                      // reserved
dirEntry.writeUInt16LE(1, 4);                   // color planes
dirEntry.writeUInt16LE(32, 6);                  // bits per pixel
dirEntry.writeUInt32LE(pngData.length, 8);       // image size
dirEntry.writeUInt32LE(22, 12);                  // offset (6 + 16 = 22)

const ico = Buffer.concat([icoHeader, dirEntry, pngData]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log('Generated icon.ico (256x256, PNG-based)');
