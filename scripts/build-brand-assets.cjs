/**
 * Input: frontend/public/brand/xiangyang-mark-black.svg (the hand-built vector master: path#horn-wave + path#node)
 * Output: derived rasters (PNG/JPG/ICO), app icons, and docs/brand/small-size-proof.png
 * Pos: reproducible export of the 向阳逐浪 brand assets from the vector; never reads/embeds a bitmap into any SVG
 * Note: run from repo root: node scripts/build-brand-assets.cjs; uses frontend's locked sharp (no new dependency)
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(path.resolve(__dirname, '../frontend/node_modules/sharp'));

const ROOT = path.resolve(__dirname, '..');
const BRAND = path.join(ROOT, 'frontend/public/brand');
const MASTER = path.join(BRAND, 'xiangyang-mark-black.svg');
const CHARCOAL = '#1C1C1C';
const RED = '#B91C2B';
// Mark bounding box on the 1000x1000 master canvas: x 50..946, y 154..845.
const BOX = { cx: 498, cy: 499.5, w: 896, h: 691 };

function readPaths() {
  const svg = fs.readFileSync(MASTER, 'utf8');
  const grab = (id) => {
    const m = new RegExp(`<path id="${id}"[^>]* d="([^"]+)"`).exec(svg);
    if (!m) throw new Error(`master is missing path#${id}`);
    return m[1];
  };
  return { hornWave: grab('horn-wave'), node: grab('node') };
}

// Draws the mark centred in a size x size square at `widthShare` of the square width, optional solid tile.
function svgOf(size, { widthShare, hornWave, node, fill = '#000000', nodeFill = fill, bg = null }) {
  const k = (widthShare * size) / BOX.w;
  const tile = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile}`
    + `<g transform="translate(${size / 2} ${size / 2}) scale(${k}) translate(${-BOX.cx} ${-BOX.cy})">`
    + `<path fill="${fill}" d="${hornWave}"/><path fill="${nodeFill}" d="${node}"/></g></svg>`,
  );
}

const png = (buf) => sharp(buf).png({ compressionLevel: 9 }).toBuffer();

// PNG-compressed ICO container (16/32/48), supported by all current browsers.
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head[e] = size; head[e + 1] = size; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.data)]);
}

async function main() {
  const paths = readPaths();
  const w = (file, buf) => fs.writeFileSync(path.join(BRAND, file), buf);
  // Transparent marks (1024 wide canvas, mark at its native 89.6% share).
  w('xiangyang-mark-black-1024.png', await png(svgOf(1024, { widthShare: 0.896, ...paths })));
  w('xiangyang-mark-white-1024.png', await png(svgOf(1024, { widthShare: 0.896, ...paths, fill: '#ffffff' })));
  w('xiangyang-mark-color-1024.png', await png(svgOf(1024, { widthShare: 0.896, ...paths, fill: CHARCOAL, nodeFill: RED })));
  // CNIPA-style black on white, 1000x1000 RGB JPG re-exported from the vector (candidate file itself is NOT replaced).
  w('xiangyang-mark-cnipa-from-vector-1000.jpg', await sharp(svgOf(1000, { widthShare: 0.896, ...paths, bg: '#ffffff' }))
    .flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer());
  // App icons: white mark on a full-bleed charcoal tile.
  const tile = (size, widthShare) => png(svgOf(size, { widthShare, ...paths, fill: '#ffffff', bg: CHARCOAL }));
  const icons = path.join(ROOT, 'frontend/public/icons');
  fs.writeFileSync(path.join(icons, 'icon-192.png'), await tile(192, 0.78));
  fs.writeFileSync(path.join(icons, 'icon-512.png'), await tile(512, 0.78));
  // Maskable: mark diagonal stays inside the central 80% circle (PWA safe zone) -> 63% of the width.
  fs.writeFileSync(path.join(icons, 'icon-maskable-192.png'), await tile(192, 0.63));
  fs.writeFileSync(path.join(icons, 'icon-maskable-512.png'), await tile(512, 0.63));
  fs.writeFileSync(path.join(ROOT, 'frontend/src/app/apple-icon.png'), await tile(180, 0.78));
  fs.writeFileSync(path.join(ROOT, 'frontend/src/app/favicon.ico'),
    ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await tile(size, 0.86) })))));
  // Tab icon as SVG (tile + mark, no raster).
  const k = (0.86 * 64) / BOX.w;
  fs.writeFileSync(path.join(ROOT, 'frontend/src/app/icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="12" fill="${CHARCOAL}"/>`
    + `<g transform="translate(32 32) scale(${k.toFixed(5)}) translate(${-BOX.cx} ${-BOX.cy})"><path fill="#fff" d="${paths.hornWave}"/><path fill="#fff" d="${paths.node}"/></g></svg>\n`);
  // Proof sheet: black mark at 16/24/32/48/64 px native, each next to a 4x nearest-neighbour enlargement.
  const sizes = [16, 24, 32, 48, 64]; const cell = 64 * 4 + 20;
  const layers = []; let y = 10;
  for (const s of sizes) {
    const size = Math.round(s / 0.896);
    const native = await sharp(svgOf(size, { widthShare: 0.896, ...paths, bg: '#ffffff' })).png().toBuffer();
    const big = await sharp(native).resize(size * 4, size * 4, { kernel: 'nearest' }).png().toBuffer();
    layers.push({ input: native, left: 10, top: y }, { input: big, left: 90, top: y });
    y += size * 4 + 10;
  }
  await sharp({ create: { width: 90 + 72 * 4 + 20, height: y, channels: 3, background: '#ffffff' } })
    .composite(layers).png().toFile(path.join(ROOT, 'docs/brand/small-size-proof.png'));
  console.log('brand assets written');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
