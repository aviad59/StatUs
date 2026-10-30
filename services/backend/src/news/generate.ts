// Draws the photos for Pull (the app's news site, see articles.ts) and writes them, with
// `articles.json`, into the frontend's static folder (services/frontend/public/news). Run
// once, ahead of time: `pnpm news:generate` (add `--force` to redraw every photo). Photos
// that already exist are kept, so adding an article draws only its own.
//
// A dev script, not the app: it calls the image provider directly instead of through
// AiService, so it runs without Nest (and the database). Needs CLOUDFLARE_ACCOUNT_ID and
// CLOUDFLARE_API_TOKEN in .env.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { CloudflareImageProvider } from '../ai/providers/cloudflare.provider';
import { ARTICLES, NEWS_PHOTO_STYLE } from './articles';

const OUT_DIR = join(__dirname, '../../../frontend/public/news');
// Every photo in the same frame, small enough for a phone: a 16:9 crop of the middle
// (the image model draws squares, and the prompts keep the subject centered).
const WIDTH = 1200;
const HEIGHT = 675;

const toNewsPhoto = (image: Buffer) =>
  sharp(image).resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();

/** A photo already in the folder, in the news frame (re-encoded once if it isn't yet). */
async function keep(file: string) {
  const { width, height } = await sharp(file).metadata();
  if (width === WIDTH && height === HEIGHT) return false;
  writeFileSync(file, await toNewsPhoto(readFileSync(file)));
  return true;
}

async function main() {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_IMAGE_MODEL } = process.env;
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env to draw the news photos.');
  }
  const images = new CloudflareImageProvider(
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell',
  );
  const force = process.argv.includes('--force');
  mkdirSync(OUT_DIR, { recursive: true });

  let drawn = 0;
  for (const article of ARTICLES) {
    const file = join(OUT_DIR, `${article.slug}.jpg`);
    if (existsSync(file) && !force) {
      if (await keep(file)) console.log(`re-framed ${article.slug}`);
      continue;
    }
    const prompt = `${article.prompt}\n\n${NEWS_PHOTO_STYLE}`;
    // One retry: the image model fails now and then (and its safety filter can misfire).
    const drawing = await images.generateImage(prompt).catch((error: unknown) => {
      console.warn(`  retrying ${article.slug}: ${String(error)}`);
      return images.generateImage(`${prompt} Wholesome, family-friendly scene.`);
    });
    const jpeg = await toNewsPhoto(drawing);
    writeFileSync(file, jpeg);
    drawn++;
    console.log(`drew ${article.slug} (${Math.round(jpeg.length / 1024)} KB)`);
  }

  // What the page reads: everything but the prompts, newest first.
  const index = [...ARTICLES]
    .sort((a, b) => a.hoursAgo - b.hoursAgo)
    .map(({ prompt: _prompt, ...article }) => ({ ...article, image: `/news/${article.slug}.jpg` }));
  writeFileSync(join(OUT_DIR, 'articles.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`Pull: ${ARTICLES.length} articles, ${drawn} photos drawn, written to ${OUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
