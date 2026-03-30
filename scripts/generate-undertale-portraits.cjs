const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('Set GEMINI_API_KEY env var'); process.exit(1); }
const MODEL = 'gemini-3.1-flash-image-preview';
const OUT_DIR = path.join(__dirname, '..', 'client', 'img', 'chars');
const BASE_INDEX = 516;
const DELAY_MS = 8000;
const TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;

const CHARACTER_DETAILS = {
  'Frisk': 'determined human child with striped blue and purple shirt, short brown hair, neutral expression, holding a stick',
  'Sans': 'skeleton with blue glowing left eye, lazy grin, blue hoodie',
  'Papyrus': 'tall skeleton in red scarf and battle body armor, confident pose',
  'Undyne': 'blue fish woman warrior in armor, eyepatch, red hair, holding spear',
  'Undyne the Undying': 'blue fish woman warrior in glowing black armor, eyepatch, red hair flowing upward, holding energy spear, determined fierce expression',
  'Alphys': 'short yellow dinosaur scientist, lab coat, glasses, nervous smile',
  'Mettaton EX': 'fabulous humanoid robot, pink and black, dramatic pose, star',
  'Mettaton NEO': 'sleek black and silver combat robot, arm cannon, one wing, dramatic battle pose',
  'Toriel': 'white goat woman in purple robes, kind motherly expression, fire magic',
  'Asgore': 'large goat king with golden beard, crown, trident, cape',
  'Flowey': 'sinister smiling golden flower with a face',
  'Asriel Dreemurr': 'white goat boy with rainbow aura, god of hyperdeath form, dramatic',
  'Napstablook': 'translucent blue ghost with headphones, sad teary expression, music notes',
  'Muffet': 'purple spider girl with six arms, pigtails, holding teacup, mischievous smile',
  'Mad Dummy': 'angry possessed training dummy, cotton stuffing, furious expression, ghost energy',
  'Temmie': 'small cat-dog creature with vibrant blue hair, excited face, cute',
  'Greater Dog': 'large white dog in full knight armor, holding a spear, wagging tail, happy',
  'Lesser Dog': 'white dog in light armor, extremely long neck, holding a sword, happy',
  'Chara': 'creepy human child with rosy cheeks, red eyes, wide sinister smile, holding a knife, striped green and yellow shirt',
  'W.D. Gaster': 'mysterious dark figure, cracked skull face, white hands with holes, glitching distorted, void energy'
};

const roster = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'undertale-roster.json'), 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generatePortrait(characterName, index) {
  const details = CHARACTER_DETAILS[characterName] || '';
  const detailStr = details ? `, ${details}` : '';
  const prompt = `Anime portrait of "${characterName}" from Undertale${detailStr}, head and shoulders character portrait, detailed anime art, vibrant colors, dark background, fighting game character select screen, no text no words`;

  const outPath = path.join(OUT_DIR, `${BASE_INDEX + index}.png`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${index + 1}/20] Generating ${characterName} (attempt ${attempt})...`);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();

      // Find the image part in the response
      const candidates = data.candidates || [];
      let imageData = null;
      for (const candidate of candidates) {
        const parts = candidate.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
            imageData = part.inlineData.data;
            break;
          }
        }
        if (imageData) break;
      }

      if (!imageData) {
        console.error(`  No image data in response for ${characterName}:`, JSON.stringify(data).slice(0, 300));
        throw new Error('No image data in response');
      }

      const buffer = Buffer.from(imageData, 'base64');
      fs.writeFileSync(outPath, buffer);
      console.log(`  Saved ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
      return true;

    } catch (err) {
      console.error(`  Attempt ${attempt} failed for ${characterName}: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const backoff = DELAY_MS * attempt;
        console.log(`  Retrying in ${backoff / 1000}s...`);
        await sleep(backoff);
      } else {
        console.error(`  FAILED after ${MAX_RETRIES} attempts: ${characterName}`);
        return false;
      }
    }
  }
}

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating portraits for ${roster.length} Undertale characters...`);
  console.log(`Output: ${OUT_DIR}, indices ${BASE_INDEX}-${BASE_INDEX + roster.length - 1}\n`);

  const results = [];
  for (let i = 0; i < roster.length; i++) {
    const name = roster[i].fullName;
    const success = await generatePortrait(name, i);
    results.push({ name, success });

    // Delay between requests (skip after last)
    if (i < roster.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== RESULTS ===');
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  console.log(`Success: ${succeeded.length}/${roster.length}`);
  if (failed.length > 0) {
    console.log('Failed:', failed.map(r => r.name).join(', '));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
