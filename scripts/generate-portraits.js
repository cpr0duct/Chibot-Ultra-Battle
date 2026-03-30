/**
 * Batch generate character portraits using Gemini Imagen API.
 * Run: node scripts/generate-portraits.js
 *
 * Generates pixel-art style portraits for all characters in the dataset.
 * Saves to client/img/chars/<index>.png
 * Skips already-generated images (re-runnable).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadDataset } from '../parsers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('Set GEMINI_API_KEY env var'); process.exit(1); }
const OUTPUT_DIR = join(__dirname, '..', 'client', 'img', 'chars');
const CONCURRENT = 1; // One at a time to avoid rate limits
const DELAY_MS = 6000; // 6 seconds between requests (Flash is faster)

// Franchise context for better prompts
const FRANCHISE_HINTS = {
  'Sailor Moon': 'anime magical girl style',
  'Dragon Ball': 'anime fighting style, muscular',
  'Pokemon': 'cute creature or Pokemon trainer style',
  'Capcom': 'fighting game character style',
  'Mario': 'Nintendo cartoon style',
  'Final Fantasy': 'JRPG fantasy anime style',
  'Zelda': 'Legend of Zelda fantasy adventure style',
  'Marvel': 'comic book superhero style',
  'Lodoss War': 'medieval fantasy anime style',
  'Ronin Warriors': 'samurai armor anime style',
  'Star Wars': 'sci-fi space opera style',
  'Wrestling': 'professional wrestling, muscular',
};

function detectFranchise(name) {
  // Simplified detection for prompt hints
  if (/sailor|senshi|tuxedo|chibi|moon|Queen Beryl|Queen Metal|Queen Neh|Haruka$|Hotaru$|Michiru$|Minako$|Makoto$|Mamoru$/i.test(name)) return 'Sailor Moon';
  if (/Goku|Gohan|Vegeta|Trunks|Piccolo|Cell|Frieza|Buu|Raditz|SSJ|Majin|Artificial|Saiyan/i.test(name)) return 'Dragon Ball';
  if (/Pikachu|Bulbasaur|Charmander|Squirtle|Meowth|Nidoran|Pokemon|Ash Ketch/i.test(name)) return 'Pokemon';
  if (/Chun Li|Ryu$|Akuma|Morrigan|Felicia|Mega Man|Strider/i.test(name)) return 'Capcom';
  if (/Mario|Luigi|Bowser|Toadstool|Geno|Mallow|Smithy/i.test(name)) return 'Mario';
  if (/Aeris|Cloud|Sephiroth|Barret|Tifa|Final Fantasy|Chocobo|Cyan Gara/i.test(name)) return 'Final Fantasy';
  if (/Link|Zelda|Ganon|Sheik|Darunia|Nabooru/i.test(name)) return 'Zelda';
  if (/Iron Man|Wolverine|Spider|Cyclops|Storm$|Hulk|Venom/i.test(name)) return 'Marvel';
  if (/Deedlit|Parn|Lodoss|Ashram|Pirotessa|Slayn|Karla$/i.test(name)) return 'Lodoss War';
  if (/Ryo of|Rowen of|Sage of|Ronin|Kayura/i.test(name)) return 'Ronin Warriors';
  if (/Skywalker|Leia|Chewbacca|R2-D2|Obi-Wan|Death Star/i.test(name)) return 'Star Wars';
  if (/Undertaker|Kane$|Mankind|Gangrel/i.test(name)) return 'Wrestling';
  return null;
}

async function generatePortrait(name, index) {
  const outPath = join(OUTPUT_DIR, `${index}.png`);
  if (existsSync(outPath)) {
    return { index, name, status: 'skipped' };
  }

  const franchise = detectFranchise(name);
  const styleHint = franchise ? FRANCHISE_HINTS[franchise] : 'video game character';

  const prompt = `Anime portrait of "${name}", ${styleHint}, head and shoulders character portrait, detailed anime art, vibrant colors, dark background, fighting game character select screen, no text no words`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Nano Banana 2 (Gemini 3.1 Flash Image)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: AbortSignal.timeout(45000),
        }
      );

      const data = await res.json();

      // Gemini response format: candidates[0].content.parts[] with inlineData
      if (data.candidates && data.candidates[0]) {
        const parts = data.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            const buf = Buffer.from(part.inlineData.data, 'base64');
            writeFileSync(outPath, buf);
            return { index, name, status: 'ok', size: buf.length };
          }
        }
        return { index, name, status: 'no_image', error: 'Response had no image data' };
      } else if (data.error && data.error.code === 429) {
        const wait = 35000;
        console.log(`  [${index}] Rate limited, waiting ${wait/1000}s (attempt ${attempt + 1}/3)...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      } else {
        const err = JSON.stringify(data).slice(0, 200);
        return { index, name, status: 'api_error', error: err };
      }
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      return { index, name, status: 'network_error', error: e.message };
    }
  }
  return { index, name, status: 'exhausted_retries' };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const config = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'default.json'), 'utf-8'));
  const ds = await loadDataset(join(config.datasetsDir, config.defaultDataset));
  const characters = ds.characters;

  console.log(`Generating portraits for ${characters.length} characters...`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Concurrent: ${CONCURRENT}, Delay: ${DELAY_MS}ms\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  // Process sequentially, skip existing fast
  for (let i = 0; i < characters.length; i++) {
    const outPath = join(OUTPUT_DIR, `${i}.png`);
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }

    const r = await generatePortrait(characters[i].fullName, i);
    if (r.status === 'ok') {
      generated++;
      console.log(`[${r.index}/${characters.length}] OK: ${r.name} (${r.size} bytes)`);
    } else {
      failed++;
      failures.push(r);
      console.log(`[${r.index}/${characters.length}] FAILED: ${r.name} - ${r.error}`);
    }

    // Rate limit delay after each API call
    if (i < characters.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  [${f.index}] ${f.name}: ${f.error}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
