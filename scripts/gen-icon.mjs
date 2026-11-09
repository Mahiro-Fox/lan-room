// 生成 1024x1024 的应用图标（纯 Node，无依赖）
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 1024;
const SS = 3; // 每像素 3x3 超采样
const buf = Buffer.alloc(S * S * 4);

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// 背景圆角矩形
const R = 216;
function roundedCoverage(x, y) {
  const dx = Math.max(R - x, 0, x - (S - R));
  const dy = Math.max(R - y, 0, y - (S - R));
  return Math.hypot(dx, dy) <= R ? 1 : 0;
}

const cx = S / 2;
const cy = 742;

// 渐变定义：背景
function bgColor(x, y) {
  const t = clamp01((x + y) / (2 * S));
  const r = lerp(14, 26, t);
  const g = lerp(19, 34, t);
  const b = lerp(44, 92, t);
  // 左上角柔光
  const d = Math.hypot(x - 240, y - 200) / 700;
  const glow = Math.pow(clamp01(1 - d), 3) * 0.55;
  return [r + glow * 26, g + glow * 60, b + glow * 110];
}

// 扇形弧线覆盖：以 (cx,cy) 为圆心
function arcCoverage(x, y, radius, thickness, fromDeg, toDeg) {
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.hypot(dx, dy);
  const band = Math.abs(r - radius) - thickness / 2;
  if (band > 2) return 0;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
  const inside = ang >= fromDeg && ang <= toDeg;
  if (!inside) return 0;
  return clamp01(-band / 2 + 0.5);
}

const arcs = [
  { r: 168, t: 92 },
  { r: 320, t: 96 },
  { r: 472, t: 100 },
];

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let ar = 0,
      ag = 0,
      ab = 0,
      aa = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        const cov = roundedCoverage(px, py);
        if (cov === 0) continue;
        let [r, g, b] = bgColor(px, py);

        // 中心圆点
        const dc = Math.hypot(px - cx, py - cy);
        let glyph = 0;
        if (dc < 96) glyph = clamp01((96 - dc) / 2.5);

        // 三段弧
        for (const a of arcs) {
          const c = arcCoverage(px, py, a.r, a.t, -152, -28);
          if (c > glyph) glyph = c;
        }

        if (glyph > 0) {
          // 青 -> 紫 渐变
          const t = clamp01((940 - py) / 620);
          const gr = lerp(56, 167, t);
          const gg = lerp(225, 139, t);
          const gb = lerp(255, 250, t);
          r = lerp(r, gr, glyph);
          g = lerp(g, gg, glyph);
          b = lerp(b, gb, glyph);
        }
        ar += r;
        ag += g;
        ab += b;
        aa += 1;
      }
    }
    const n = SS * SS;
    const o = (y * S + x) * 4;
    if (aa === 0) {
      buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0;
    } else {
      buf[o] = Math.round(ar / aa);
      buf[o + 1] = Math.round(ag / aa);
      buf[o + 2] = Math.round(ab / aa);
      buf[o + 3] = Math.round((aa / n) * 255);
    }
  }
}

// 预乘后转直通 alpha（上面按覆盖率平均，简单场景足够）
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(process.argv[2] || "app-icon.png", png);
console.log("icon written:", png.length, "bytes");
