/**
 * Generates a sample TikTok export in the Apify-scraper shape so the app can be
 * exercised end to end without real data. Run: node scripts/make-sample.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const HOOKS = [
  ["5 things about pricing I wish I knew sooner", "listicle"],
  ["Stop discounting your work like this", "contrarian"],
  ["What nobody tells you about freelance rates?", "question"],
  ["POV: you finally raised your prices", "pov"],
  ["The pricing mistake costing you clients", "warning"],
  ["The rate card nobody talks about", "curiosity"],
  ["How I went from £20 to £200 an hour", "transformation"],
  ["If you undercharge, read this", "direct"],
  ["How to price a project in 3 steps", "howto"],
  ["My rates, explained properly", "statement"],
  ["3 red flags in a client brief", "listicle"],
  ["Never send a quote before this", "contrarian"],
];

const TAGS = [
  ["freelance", "pricing", "smallbusiness"],
  ["freelance", "creativebusiness"],
  ["pricing", "moneytips", "fyp"],
  ["designer", "freelance", "fyp", "viral"],
  ["smallbusiness", "entrepreneur"],
];

const SOUNDS = [
  ["original sound - valycode", true],
  ["Aesthetic Lofi Beat", false],
  ["Storytime Piano", false],
  ["original sound - valycode", true],
];

let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const records = [];
const start = Date.parse("2025-01-05T00:00:00Z");

for (let i = 0; i < 140; i += 1) {
  const [hook, archetype] = HOOKS[i % HOOKS.length];
  const tags = TAGS[i % TAGS.length];
  const [soundName, isOriginal] = SOUNDS[i % SOUNDS.length];
  const isSlideshow = rand() < 0.68;

  // Deliberately bake in real effects so the pattern miner has something to find:
  // slideshows out-perform, contrarian and listicle hooks out-perform, and the
  // #pricing tag out-performs. Everything else is noise.
  let base = 8000 + rand() * 12000;
  if (isSlideshow) base *= 2.4;
  if (archetype === "contrarian" || archetype === "listicle") base *= 1.9;
  if (tags.includes("pricing")) base *= 1.5;
  if (rand() < 0.06) base *= 6; // occasional runaway

  const views = Math.round(base * (0.6 + rand() * 0.9));
  const likes = Math.round(views * (0.05 + rand() * 0.06));
  const comments = Math.round(likes * (0.02 + rand() * 0.05));
  const shares = Math.round(likes * (0.03 + rand() * 0.08));
  const saves = Math.round(likes * (0.08 + rand() * 0.2));

  records.push({
    id: `74${String(1000000000000 + i)}`,
    text: `${hook}\n\n${tags.map((t) => `#${t}`).join(" ")}`,
    createTimeISO: new Date(start + i * 36 * 3600 * 1000 + rand() * 8 * 3600 * 1000).toISOString(),
    webVideoUrl: `https://www.tiktok.com/@valycode/video/74${String(1000000000000 + i)}`,
    authorMeta: { name: "valycode", nickName: "Valycode" },
    musicMeta: { musicName: soundName, musicAuthor: "valycode", musicOriginal: isOriginal, musicId: `m${i % 4}` },
    videoMeta: { duration: isSlideshow ? 0 : 12 + Math.round(rand() * 40) },
    diggCount: likes,
    shareCount: shares,
    playCount: views,
    commentCount: comments,
    collectCount: saves,
    hashtags: tags.map((name) => ({ name })),
    isSlideshow,
    imageCount: isSlideshow ? 4 + Math.round(rand() * 6) : 0,
  });
}

mkdirSync("sample", { recursive: true });
writeFileSync("sample/valycode-export.json", JSON.stringify(records, null, 2));
console.log(`Wrote sample/valycode-export.json — ${records.length} posts`);
