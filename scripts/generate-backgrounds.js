/**
 * Generate franchise-themed battle backgrounds using Gemini Image API.
 * Run: node scripts/generate-backgrounds.js
 * Output: client/img/bg/<franchise-key>.png
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('Set GEMINI_API_KEY env var'); process.exit(1); }
const OUTPUT_DIR = join(__dirname, '..', 'client', 'img', 'bg');
const DELAY_MS = 8000;

mkdirSync(OUTPUT_DIR, { recursive: true });

const FRANCHISES = [
  { key: 'sailor-moon', prompt: 'Wide panoramic anime battle arena background, magical girl theme, crystal tokyo cityscape at night, crescent moon in sky, sparkling magical energy, pastel pink and silver atmosphere, no characters, no text, cinematic widescreen' },
  { key: 'dragon-ball', prompt: 'Wide panoramic anime battle arena background, rocky desert wasteland with craters, dramatic orange sky, energy beams in distance, floating rocks, dragon ball z style, no characters, no text, cinematic widescreen' },
  { key: 'pokemon', prompt: 'Wide panoramic Pokemon battle arena background, grassy stadium field with pokeball markings, bright blue sky, colorful flowers, pokemon league style, no characters, no text, cinematic widescreen' },
  { key: 'capcom', prompt: 'Wide panoramic street fighter battle arena background, urban city street at dusk, neon signs, japanese temple in background, fighting game stage, no characters, no text, cinematic widescreen' },
  { key: 'mario', prompt: 'Wide panoramic Super Mario battle arena background, mushroom kingdom castle, floating platforms, green pipes, colorful cartoon landscape, bright and cheerful, no characters, no text, cinematic widescreen' },
  { key: 'final-fantasy', prompt: 'Wide panoramic JRPG battle arena background, medieval fantasy castle ruins, magical crystals glowing, dramatic cloudy sky, epic fantasy landscape, no characters, no text, cinematic widescreen' },
  { key: 'zelda', prompt: 'Wide panoramic Legend of Zelda battle arena background, hyrule field with castle in distance, triforce symbol in sky, ancient ruins, lush green landscape, no characters, no text, cinematic widescreen' },
  { key: 'marvel', prompt: 'Wide panoramic comic book superhero battle arena background, destroyed city street, dramatic lighting, smoke and debris, skyscrapers, comic book style colors, no characters, no text, cinematic widescreen' },
  { key: 'lodoss-war', prompt: 'Wide panoramic medieval dark fantasy battle arena background, ancient stone fortress, misty forest, torchlight, swords and sorcery atmosphere, no characters, no text, cinematic widescreen' },
  { key: 'ronin-warriors', prompt: 'Wide panoramic anime samurai battle arena background, japanese feudal castle, cherry blossoms, mystical armor energy, dramatic sunset, no characters, no text, cinematic widescreen' },
  { key: 'star-wars', prompt: 'Wide panoramic sci-fi battle arena background, space station interior with viewport showing stars, holographic displays, futuristic corridor, blue and red lighting, no characters, no text, cinematic widescreen' },
  { key: 'wrestling', prompt: 'Wide panoramic professional wrestling arena background, WWE style ring with spotlights, pyrotechnics, crowd silhouettes, dramatic stage lighting, no characters, no text, cinematic widescreen' },
  { key: 'default', prompt: 'Wide panoramic retro arcade fighting game battle arena background, dark cyberpunk city, neon lights, pixel art aesthetic, 90s style, purple and cyan color scheme, no characters, no text, cinematic widescreen' },
];

async function generateBg(franchise) {
  const outPath = join(OUTPUT_DIR, `${franchise.key}.png`);
  if (existsSync(outPath)) {
    console.log(`  [SKIP] ${franchise.key} — already exists`);
    return { key: franchise.key, status: 'skipped' };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: franchise.prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: AbortSignal.timeout(60000),
        }
      );

      const data = await res.json();

      if (data.candidates && data.candidates[0]) {
        const parts = data.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            const buf = Buffer.from(part.inlineData.data, 'base64');
            writeFileSync(outPath, buf);
            console.log(`  [OK] ${franchise.key} (${buf.length} bytes)`);
            return { key: franchise.key, status: 'ok', size: buf.length };
          }
        }
        console.log(`  [FAIL] ${franchise.key} — no image in response`);
        return { key: franchise.key, status: 'no_image' };
      } else if (data.error && data.error.code === 429) {
        console.log(`  [RATE] ${franchise.key} — waiting 30s (attempt ${attempt + 1}/3)...`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      } else {
        console.log(`  [FAIL] ${franchise.key} — ${JSON.stringify(data).slice(0, 150)}`);
        return { key: franchise.key, status: 'error' };
      }
    } catch (e) {
      if (attempt < 2) {
        console.log(`  [RETRY] ${franchise.key} — ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      console.log(`  [FAIL] ${franchise.key} — ${e.message}`);
      return { key: franchise.key, status: 'error', error: e.message };
    }
  }
  return { key: franchise.key, status: 'exhausted' };
}

async function main() {
  console.log(`Generating ${FRANCHISES.length} franchise backgrounds...\n`);

  let ok = 0, skip = 0, fail = 0;
  for (const f of FRANCHISES) {
    const result = await generateBg(f);
    if (result.status === 'ok') ok++;
    else if (result.status === 'skipped') skip++;
    else fail++;

    // Rate limit delay after API calls
    if (result.status !== 'skipped') {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone! Generated: ${ok}, Skipped: ${skip}, Failed: ${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
