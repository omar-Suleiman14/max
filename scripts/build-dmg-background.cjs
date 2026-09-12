/**
 * Draw the macOS disk image background.
 *
 * The installer window has to say, without words in any language, "drag the app
 * onto Applications". electron-installer-dmg otherwise supplies its own
 * placeholder - a white box with a black border - which is both off-brand and
 * sized for coordinates Max does not use.
 *
 * Run with `node scripts/build-dmg-background.cjs`; the result is committed, so
 * packaging never depends on regenerating it.
 */
const { deflateSync } = require('node:zlib');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const WIDTH = 640;
const HEIGHT = 400;
// Where forge.config.cjs places the two icons, in window points.
const APP_X = 170;
const LINK_X = 470;
const ICON_Y = 196;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** Coverage of one pixel by a line segment, antialiased by distance. */
function strokeCoverage(x, y, ax, ay, bx, by, halfWidth) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  const distance = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
  return Math.min(1, Math.max(0, halfWidth + 0.5 - distance));
}

function mix(base, over, alpha) {
  return Math.round(base + (over - base) * alpha);
}

function render(scale) {
  const width = WIDTH * scale;
  const height = HEIGHT * scale;
  const rows = [];
  // The chevron sits midway between the app and the Applications folder.
  const midX = (APP_X + LINK_X) / 2;
  const arms = [
    [midX - 13, ICON_Y - 26, midX + 9, ICON_Y],
    [midX + 9, ICON_Y, midX - 13, ICON_Y + 26],
  ];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // No per-row filter: the image is small and compresses well flat.
    for (let x = 0; x < width; x += 1) {
      // A quiet vertical gradient, lighter at the top, the way sheets read.
      const down = y / (height - 1);
      let red = mix(252, 238, down);
      let green = mix(252, 240, down);
      let blue = mix(253, 243, down);
      const px = x / scale;
      const py = y / scale;
      let coverage = 0;
      for (const [ax, ay, bx, by] of arms) coverage = Math.max(coverage, strokeCoverage(px, py, ax, ay, bx, by, 3.4));
      if (coverage > 0) {
        red = mix(red, 178, coverage);
        green = mix(green, 184, coverage);
        blue = mix(blue, 193, coverage);
      }
      row.writeUInt8(red, 1 + x * 3);
      row.writeUInt8(green, 2 + x * 3);
      row.writeUInt8(blue, 3 + x * 3);
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // Bit depth.
  header.writeUInt8(2, 9); // Truecolour.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const assets = join(__dirname, '..', 'assets');
writeFileSync(join(assets, 'dmg-background.png'), render(1));
// appdmg picks the @2x file up on its own and builds a multi-resolution TIFF.
writeFileSync(join(assets, 'dmg-background@2x.png'), render(2));
process.stdout.write(`Wrote ${WIDTH}x${HEIGHT} and @2x disk image backgrounds.\n`);
