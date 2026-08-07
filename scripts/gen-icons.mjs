// Pure-Node PNG encoder (no native deps) that draws a simple icon:
// solid black background + a purple filled circle, matching the "dot" motif
// used throughout the app (nav indicator, calendar dots, memory-web center).
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";

const PURPLE = [168, 85, 247]; // #a855f7, matches --color-nothing-purple
const BLACK = [10, 10, 10]; // matches bg-[#0a0a0a] used across the app

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// radiusFraction: circle radius as a fraction of min(width,height)/2.
function drawIcon(size, radiusFraction) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * radiusFraction;
  // Soft glow ring just outside the solid dot, matching the app's
  // box-shadow glow on purple dots (e.g. nav-dot, calendar togetherDays).
  const glowR = r * 1.6;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let px = BLACK;
      let alphaBlend = 1;
      if (dist <= r) {
        px = PURPLE;
      } else if (dist <= glowR) {
        const t = 1 - (dist - r) / (glowR - r);
        const glowAlpha = t * 0.35;
        px = [
          Math.round(BLACK[0] * (1 - glowAlpha) + PURPLE[0] * glowAlpha),
          Math.round(BLACK[1] * (1 - glowAlpha) + PURPLE[1] * glowAlpha),
          Math.round(BLACK[2] * (1 - glowAlpha) + PURPLE[2] * glowAlpha),
        ];
      }
      const off = rowStart + 1 + x * 4;
      raw[off] = px[0];
      raw[off + 1] = px[1];
      raw[off + 2] = px[2];
      raw[off + 3] = 255;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk("IHDR", ihdrData);
  const idat = chunk("IDAT", deflateSync(raw, { level: 9 }));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

mkdirSync("./public/icons", { recursive: true });

// Standard icons: dot fills most of the frame.
writeFileSync("./public/icons/icon-192.png", drawIcon(192, 0.42));
writeFileSync("./public/icons/icon-512.png", drawIcon(512, 0.42));
// Maskable icons: keep the dot within the ~40%-radius safe zone so it
// survives circular/squircle masking on Android adaptive icons.
writeFileSync("./public/icons/icon-maskable-192.png", drawIcon(192, 0.32));
writeFileSync("./public/icons/icon-maskable-512.png", drawIcon(512, 0.32));
// Apple touch icon (iOS ignores maskable/manifest icons, needs its own tag).
writeFileSync("./public/icons/apple-touch-icon.png", drawIcon(180, 0.38));

console.log("Generated icons in public/icons/");
