/**
 * Generates a sample comments export in the Apify TikTok-comments shape,
 * joined to the sample posts. Run after make-sample.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";

const posts = JSON.parse(readFileSync("sample/valycode-export.json", "utf8"));

const QUESTIONS = [
  "how do you decide what to charge for a first client?",
  "what app do you use to make these slideshows?",
  "can you do a part 2 on retainers",
  "wait how do you handle scope creep though",
  "whats the name of the template you mentioned",
  "do you send a contract before or after the quote?",
  "please make one about chasing late invoices",
  "is this still relevant for beginners with no portfolio",
];
const PRAISE = [
  "this is so underrated, thank you",
  "needed this today honestly",
  "the way you explained this 🔥",
  "saving this immediately",
];
const OBJECTIONS = [
  "this doesn't work if you're in a saturated niche",
  "kinda clickbait, expected actual numbers",
  "doesn't work for agencies though",
];
const TAGS = ["@sam look at this", "@jess this is what I meant", "@alex 👀"];

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rand() * a.length)];

const comments = [];
for (const post of posts) {
  // Bigger posts draw more comments; questions cluster on the how-to content.
  const n = Math.min(40, Math.round((post.commentCount || 0) * (0.25 + rand() * 0.35)));
  for (let i = 0; i < n; i += 1) {
    const roll = rand();
    const text =
      roll < 0.34 ? pick(QUESTIONS) : roll < 0.62 ? pick(PRAISE) : roll < 0.76 ? pick(OBJECTIONS) : roll < 0.88 ? pick(TAGS) : "🔥🔥";
    comments.push({
      cid: `${post.id}-${i}`,
      text,
      diggCount: Math.round(rand() * 240),
      replyCommentTotal: rand() < 0.2 ? Math.round(rand() * 8) : 0,
      repliesToId: null,
      uid: `u${Math.round(rand() * 99999)}`,
      uniqueId: `user${Math.round(rand() * 9999)}`,
      createTimeISO: post.createTimeISO,
      videoWebUrl: post.webVideoUrl,
      submittedVideoUrl: post.webVideoUrl,
    });
  }
}

writeFileSync("sample/valycode-comments.json", JSON.stringify(comments, null, 2));
console.log(`Wrote sample/valycode-comments.json — ${comments.length} comments`);
