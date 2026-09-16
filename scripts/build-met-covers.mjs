/**
 * Rebuild the bundled images for the Met cover gallery.
 *
 * The cover picker shows Japanese prints from the Metropolitan Museum of Art's
 * Open Access collection, all of them public domain. The pictures ship inside
 * the app rather than being fetched: Max never loads a remote address in the
 * window, and choosing a cover has to work with no connection at all.
 *
 * Run it by hand after editing the object list, not as part of a build:
 *
 *     node scripts/build-met-covers.mjs
 *
 * It needs the network and `sharp`, which is present through the packaging
 * tooling rather than as a declared dependency, so it is deliberately not
 * wired into `npm run build`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/renderer/assets/covers');
const API = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';

/** Curated Open Access prints, all landscape oban sheets that crop well. */
const OBJECT_IDS = [45434, 36493, 36497, 56242, 56395, 57003, 39800, 39798, 54868, 36504, 55049, 36965];

/**
 * Wide enough to paint a cover strip on a large window, small enough that
 * twelve of them do not dominate the packaged app.
 */
const COVER_WIDTH = 1200;

async function main() {
  await mkdir(OUT, { recursive: true });
  const entries = [];

  for (const id of OBJECT_IDS) {
    const object = await (await fetch(`${API}/${id}`)).json();
    if (!object.isPublicDomain) throw new Error(`Object ${id} is not public domain.`);
    if (!object.primaryImage) throw new Error(`Object ${id} has no image.`);

    // The museum's "web-large" file is only 600px across, which is fine for the
    // grid and too soft for a cover, so the full-size file is what gets resized.
    const bytes = Buffer.from(await (await fetch(object.primaryImage)).arrayBuffer());
    const cover = await sharp(bytes).resize({ width: COVER_WIDTH, withoutEnlargement: true }).jpeg({ mozjpeg: true, quality: 68 }).toBuffer();
    await writeFile(join(OUT, `met-${id}.jpg`), cover);

    entries.push({
      artist: object.artistDisplayName || object.culture || 'Unknown',
      date: object.objectDate || '',
      id: `met-${id}`,
      objectUrl: object.objectURL,
      title: String(object.title).split(', from the series')[0].split(', also known as')[0].trim(),
    });
    console.log(`${id}  ${(cover.byteLength / 1024).toFixed(1)} KiB  ${entries.at(-1).title}`);
  }

  console.log('\nPaste into src/shared/cover-contract.ts:\n');
  console.log(entries.map((entry) => `  { artist: ${JSON.stringify(entry.artist)}, date: ${JSON.stringify(entry.date)}, id: ${JSON.stringify(entry.id)}, objectUrl: ${JSON.stringify(entry.objectUrl)}, title: ${JSON.stringify(entry.title)} },`).join('\n'));
}

await main();
