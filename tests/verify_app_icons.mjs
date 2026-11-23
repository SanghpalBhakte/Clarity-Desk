// ==================================================================
// Clarity Desk: APP ICONS IN manifest.json
// ==================================================================
// Locked down here (issue #456):
//  - the main ("any") app icons are see-through around the logo, with the
//    logo itself solid. Some phones (OnePlus, Oppo, Realme) paint the main
//    icon in one colour for the status bar, and a solid tile showed up as
//    a white square there;
//  - the maskable icons (Android home screen) stay solid edge to edge, so
//    the home-screen icon looks the same as before.
// Reads the real PNG files with a small decoder (8-bit, not interlaced).
// ==================================================================
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readPng(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  let pos = 8, width = 0, height = 0, colorType = 0, depth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`${file}: only 8-bit RGB/RGBA, not interlaced, is supported (depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  // Alpha at a point given as fractions of the size (0..1).
  return { width, height, alpha: (fx, fy) => {
    const x = Math.min(width - 1, Math.round(fx * width)), y = Math.min(height - 1, Math.round(fy * height));
    return bpp === 4 ? px[(y * width + x) * 4 + 3] : 255;
  } };
}

let total = 0, passed = 0; const errors = [];
function scenario(name, fn) {
  total++;
  let res;
  try { res = fn(); } catch (e) { res = e.message; }
  if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
  else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
}

console.log('==================================================================');
console.log('🖼️  APP ICONS: see-through main icons, solid home-screen icons');
console.log('==================================================================');

const icons = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).icons;
const src = (i) => i.src.replace(/^\.\//, '');
const anyIcons = icons.filter((i) => i.purpose === 'any' && /^icon-\d+\.png$/.test(src(i))).map(src);
const maskable = icons.filter((i) => i.purpose === 'maskable').map(src);

// Points where the old dark tile was solid but the logo is not: the four
// corners, and just inside the middle of each edge.
const AROUND_LOGO = [[0, 0], [0.999, 0], [0, 0.999], [0.999, 0.999], [0.04, 0.5], [0.96, 0.5], [0.5, 0.04], [0.5, 0.96]];

scenario('manifest lists the 192 and 512 main icons and their maskable twins', () =>
  JSON.stringify(anyIcons) === JSON.stringify(['icon-192.png', 'icon-512.png']) &&
  JSON.stringify(maskable) === JSON.stringify(['icon-192-maskable.png', 'icon-512-maskable.png'])
  || `any: ${anyIcons.join(', ')}; maskable: ${maskable.join(', ')}`);

for (const file of anyIcons) {
  scenario(`${file} is see-through around the logo`, () => {
    const png = readPng(file);
    const solid = AROUND_LOGO.filter(([x, y]) => png.alpha(x, y) !== 0);
    return solid.length === 0 || `solid at ${solid.map((p) => p.join(',')).join(' ')}`;
  });
  scenario(`${file} still shows the logo (centre dot is solid)`, () => {
    const a = readPng(file).alpha(0.5, 0.5);
    return a === 255 || `centre alpha ${a}`;
  });
}

for (const file of maskable) {
  scenario(`${file} stays solid edge to edge (home screen unchanged)`, () => {
    const png = readPng(file);
    const clear = AROUND_LOGO.filter(([x, y]) => png.alpha(x, y) !== 255);
    return clear.length === 0 || `see-through at ${clear.map((p) => p.join(',')).join(' ')}`;
  });
}

console.log(`\n${passed}/${total} passed`);
if (errors.length) process.exit(1);
