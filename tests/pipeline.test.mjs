import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Imports the CommonJS build produced by `npm run pretest`, so tests exercise
// the same source the app does without duplicating module-resolution config.
const { ingest, coerceNumber, coerceDate, findRecordArray, extractHashtags } = await import(
  "../dist-test/lib/normalize.js"
);
const { enrich, summarise, topPosts, median } = await import("../dist-test/lib/metrics.js");
const { minePatterns, rankSumPValue, explainPost } = await import("../dist-test/lib/patterns.js");
const { extractHook, classifyHook } = await import("../dist-test/lib/hooks.js");

const sample = readFileSync(new URL("../sample/valycode-export.json", import.meta.url), "utf8");

test("coerceNumber handles the formats dashboards actually emit", () => {
  assert.equal(coerceNumber(1234), 1234);
  assert.equal(coerceNumber("1,234"), 1234);
  assert.equal(coerceNumber("45.3K"), 45300);
  assert.equal(coerceNumber("1.2M"), 1200000);
  assert.equal(coerceNumber(""), null);
  assert.equal(coerceNumber("not a number"), null);
});

test("coerceDate distinguishes unix seconds from milliseconds", () => {
  assert.equal(coerceDate(1735689600), 1735689600000);
  assert.equal(coerceDate(1735689600000), 1735689600000);
  assert.equal(coerceDate("2025-01-01T00:00:00Z"), Date.parse("2025-01-01T00:00:00Z"));
  assert.equal(coerceDate("nope"), null);
});

test("findRecordArray digs the post list out of a deeply nested export", () => {
  // Mirrors the shape of an official TikTok data export.
  const official = {
    Activity: { "Login History": { List: [{ Date: "x" }] } },
    Video: {
      Videos: {
        VideoList: [
          { Date: "2025-01-01", Link: "https://tiktok.com/1", Likes: "12" },
          { Date: "2025-01-02", Link: "https://tiktok.com/2", Likes: "40" },
          { Date: "2025-01-03", Link: "https://tiktok.com/3", Likes: "9" },
        ],
      },
    },
  };
  const found = findRecordArray(official);
  assert.equal(found.length, 3);
  assert.equal(found[0].Link, "https://tiktok.com/1");
});

test("extractHashtags merges the tag field with tags found in the caption", () => {
  const tags = extractHashtags([{ name: "pricing" }, "Freelance"], "great tips #moneytips #pricing");
  assert.deepEqual(new Set(tags), new Set(["pricing", "freelance", "moneytips"]));
});

test("ingest auto-detects the scraper schema without a manual mapping", () => {
  const dataset = ingest([{ filename: "valycode-export.json", body: sample }]);

  assert.equal(dataset.posts.length, 140);
  assert.equal(dataset.mapping.views, "playCount");
  assert.equal(dataset.mapping.likes, "diggCount");
  assert.equal(dataset.mapping.saves, "collectCount");
  assert.equal(dataset.mapping.caption, "text");
  assert.equal(dataset.mapping.soundName, "musicMeta.musicName");

  const post = dataset.posts[0];
  assert.equal(post.account, "valycode");
  assert.ok(post.views > 0);
  assert.ok(post.hashtags.length > 0);
  assert.ok(post.createdAt > Date.parse("2024-12-01"));
});

test("slideshows and videos are both detected, with nothing left unknown", () => {
  const dataset = ingest([{ filename: "sample.json", body: sample }]);
  const photos = dataset.posts.filter((p) => p.format === "photo");
  const videos = dataset.posts.filter((p) => p.format === "video");

  assert.ok(photos.length > 50, `expected many slideshows, got ${photos.length}`);
  assert.ok(videos.length > 20, `expected videos to be classified, got ${videos.length}`);
  assert.equal(
    photos.length + videos.length,
    dataset.posts.length,
    "every post in this export should resolve to a known format",
  );
});

test("format detection falls back cleanly when a source gives no signal", () => {
  const body = JSON.stringify([
    { id: "1", playCount: 10, text: "a" },
    { id: "2", playCount: 20, text: "b" },
    { id: "3", playCount: 30, text: "c" },
  ]);
  const dataset = ingest([{ filename: "x.json", body }]);
  assert.ok(
    dataset.posts.every((p) => p.format === "unknown"),
    "with no duration, slide count or flag, format must stay unknown rather than be guessed",
  );
});

test("hook extraction takes the opening line and drops the trailing tag block", () => {
  assert.equal(
    extractHook("Stop discounting your work\n\n#freelance #pricing"),
    "Stop discounting your work",
  );
  assert.equal(extractHook(""), "");
  assert.deepEqual(classifyHook("5 things I wish I knew"), ["listicle"]);
  assert.ok(classifyHook("Stop doing this").includes("contrarian"));
  assert.deepEqual(classifyHook("My rates explained"), ["statement"]);
});

test("metrics are relative to the account's own median, not absolute", () => {
  const dataset = ingest([{ filename: "sample.json", body: sample }]);
  const posts = enrich(dataset.posts);
  const summary = summarise(posts);

  assert.equal(summary.postCount, 140);
  assert.ok(summary.medianViews > 0);
  assert.ok(summary.slideshowShare > 0.5);
  assert.deepEqual(summary.missingFields, []);

  // The median post should sit at roughly 1x by construction.
  const multiples = posts.map((p) => p.metrics.outlierMultiple).filter((v) => v !== null);
  assert.ok(Math.abs(median(multiples) - 1) < 0.05, `median multiple was ${median(multiples)}`);

  const best = topPosts(posts, 5);
  assert.ok(best[0].metrics.outlierMultiple > best[4].metrics.outlierMultiple);
});

test("rank-sum test separates a real difference from noise", () => {
  const low = [1, 2, 3, 4, 5, 6, 7, 8];
  const high = [20, 21, 22, 23, 24, 25, 26, 27];
  assert.ok(rankSumPValue(low, high) < 0.01, "clearly separated groups should be significant");

  const overlapA = [1, 5, 3, 8, 2, 9, 4, 7];
  const overlapB = [2, 6, 4, 7, 3, 8, 5, 6];
  assert.ok(rankSumPValue(overlapA, overlapB) > 0.2, "overlapping groups should not be significant");

  // Too small to say anything.
  assert.equal(rankSumPValue([1, 2], [10, 20]), 1);
});

test("pattern miner recovers the effects baked into the sample data", () => {
  const dataset = ingest([{ filename: "sample.json", body: sample }]);
  const posts = enrich(dataset.posts);
  const findings = minePatterns(posts);

  assert.ok(findings.length > 5, "expected several findings");

  const slideshow = findings.find((f) => f.dimension === "format" && f.value === "photo");
  assert.ok(slideshow, "should have measured the slideshow format");
  assert.ok(slideshow.lift > 1.3, `slideshow lift was ${slideshow.lift}`);
  assert.ok(slideshow.pValue < 0.05, `slideshow p was ${slideshow.pValue}`);

  const pricing = findings.find((f) => f.dimension === "hashtag" && f.value === "pricing");
  assert.ok(pricing, "should have measured #pricing");
  assert.ok(pricing.lift > 1.1, `#pricing lift was ${pricing.lift}`);

  const contrarian = findings.find(
    (f) => f.dimension === "hookArchetype" && f.value === "contrarian",
  );
  assert.ok(contrarian, "should have measured the contrarian archetype");
  assert.ok(contrarian.lift > 1.2, `contrarian lift was ${contrarian.lift}`);

  // Every finding must clear the minimum group size.
  assert.ok(findings.every((f) => f.n >= 3));
});

test("per-post explanation only cites features that post actually has", () => {
  const dataset = ingest([{ filename: "sample.json", body: sample }]);
  const posts = enrich(dataset.posts);
  const findings = minePatterns(posts);

  const video = posts.find((p) => p.format === "video");
  const reasons = explainPost(video, findings);
  assert.ok(
    !reasons.some((r) => r.dimension === "format" && r.value === "photo"),
    "a video must never be credited with the slideshow lift",
  );
  assert.ok(reasons.every((r) => r.lift > 1), "explanations should only cite positive lifts");
});

test("slide count is derived from the per-slide image array", () => {
  // Apify-shaped: no numeric slide field, but the image links are the count.
  const body = JSON.stringify([
    { id: "1", playCount: 10, text: "a", isSlideshow: true, slideshowImageLinks: ["x", "y", "z"] },
    { id: "2", playCount: 20, text: "b", isSlideshow: true, slideshowImageLinks: ["x", "y"] },
    { id: "3", playCount: 30, text: "c", isSlideshow: false, videoMeta: { duration: 20 } },
  ]);
  const dataset = ingest([{ filename: "x.json", body }]);
  assert.equal(dataset.posts[0].slideCount, 3);
  assert.equal(dataset.posts[1].slideCount, 2);
  assert.equal(dataset.posts[2].slideCount, null, "a video has no slides");
  assert.equal(dataset.posts[2].format, "video");
});

test("a container format like mp4 never claims the format field", () => {
  const body = JSON.stringify([
    { id: "1", playCount: 10, text: "a", videoMeta: { format: "mp4", duration: 12 } },
    { id: "2", playCount: 20, text: "b", videoMeta: { format: "mp4", duration: 15 } },
    { id: "3", playCount: 30, text: "c", videoMeta: { format: "mp4", duration: 9 } },
  ]);
  const dataset = ingest([{ filename: "x.json", body }]);
  assert.equal(dataset.mapping.format, null, "'mp4' is a container, not a post format");
  assert.ok(dataset.posts.every((p) => p.format === "video"));
});

test("a hashtag-only caption yields no hook rather than a fake one", () => {
  assert.equal(extractHook("#fyp #computerscience #coding"), "");
  assert.equal(extractHook("#fyp\n#ai #vibecoding"), "");
  assert.deepEqual(classifyHook(extractHook("#fyp #ai")), []);

  // Leading tags are stripped, but real text still survives.
  assert.equal(
    extractHook("#fyp ChatGPT 5 just killed Replit\n\n#ai #chatgpt"),
    "ChatGPT 5 just killed Replit",
  );
});

test("summary reports how much of the account has no caption hook", () => {
  const body = JSON.stringify([
    { id: "1", playCount: 10, text: "#fyp #ai" },
    { id: "2", playCount: 20, text: "#fyp #coding" },
    { id: "3", playCount: 30, text: "How to build an app\n\n#fyp" },
    { id: "4", playCount: 40, text: "Stop doing this\n\n#fyp" },
  ]);
  const posts = enrich(ingest([{ filename: "x.json", body }]).posts);
  const summary = summarise(posts);
  assert.equal(summary.postsWithHooks, 2);
  assert.equal(summary.captionlessShare, 0.5);
});

test("ingest survives a schema with none of the expected keys", () => {
  const alien = JSON.stringify([
    { thing: "a", blah: 1 },
    { thing: "b", blah: 2 },
    { thing: "c", blah: 3 },
  ]);
  const dataset = ingest([{ filename: "alien.json", body: alien }]);
  assert.equal(dataset.posts.length, 3);
  assert.equal(dataset.posts[0].views, null);

  // Downstream analysis must degrade rather than throw.
  const posts = enrich(dataset.posts);
  const summary = summarise(posts);
  assert.equal(summary.medianViews, null);
  assert.ok(summary.missingFields.includes("views"));
  assert.deepEqual(minePatterns(posts), []);
});

test("NDJSON input parses as well as a JSON array", () => {
  const ndjson = [
    '{"id":"1","playCount":100,"text":"a"}',
    '{"id":"2","playCount":200,"text":"b"}',
    '{"id":"3","playCount":300,"text":"c"}',
  ].join("\n");
  const dataset = ingest([{ filename: "posts.ndjson", body: ndjson }]);
  assert.equal(dataset.posts.length, 3);
  assert.equal(dataset.posts[1].views, 200);
});

test("duplicate posts across files collapse to one record", () => {
  const a = JSON.stringify([{ id: "1", playCount: 100, text: "a" }, { id: "2", playCount: 5, text: "b" }]);
  const b = JSON.stringify([{ id: "1", playCount: 100, text: "a", collectCount: 9 }, { id: "3", playCount: 7, text: "c" }]);
  const dataset = ingest([
    { filename: "a.json", body: a },
    { filename: "b.json", body: b },
  ]);
  assert.equal(dataset.posts.length, 3, "id 1 should appear once");
});

/* ------------------------------------------------------------------ *
 * Comments and the critical-reading layer
 * ------------------------------------------------------------------ */

const { looksLikeComments, normaliseComments, classifyComment, vocabularyGap, analyseComments } =
  await import("../dist-test/lib/comments.js");
const {
  assessAgeBias,
  diagnosePosts,
  summariseDiagnoses,
  findConfounds,
  findReplicatedPatterns,
} = await import("../dist-test/lib/diagnose.js");

const commentBody = JSON.stringify([
  { cid: "1", text: "how do you price a first client?", diggCount: 90, videoWebUrl: "https://www.tiktok.com/@v/video/741000000000000" },
  { cid: "2", text: "this doesn't work in a saturated niche", diggCount: 12, videoWebUrl: "https://www.tiktok.com/@v/video/741000000000000" },
  { cid: "3", text: "@sam look at this", diggCount: 3, videoWebUrl: "https://www.tiktok.com/@v/video/741000000000001" },
  { cid: "4", text: "love this, thank you", diggCount: 5, videoWebUrl: "https://www.tiktok.com/@v/video/741000000000001" },
]);

test("comment files are recognised by shape, not by filename", () => {
  const comments = JSON.parse(commentBody);
  assert.equal(looksLikeComments(comments), true);

  const posts = JSON.parse(sample).slice(0, 5);
  assert.equal(looksLikeComments(posts), false, "posts must never be mistaken for comments");
});

test("comments join to posts by the video id inside the URL", () => {
  const parsed = normaliseComments(JSON.parse(commentBody));
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].postId, "741000000000000");
  assert.equal(parsed[2].postId, "741000000000001");
  assert.equal(parsed[0].likes, 90);
});

test("posts and comments can be imported together in one go", () => {
  const dataset = ingest([
    { filename: "posts.json", body: sample },
    { filename: "comments.json", body: commentBody },
  ]);
  assert.equal(dataset.posts.length, 140);
  assert.equal(dataset.comments.length, 4);
});

test("comment intent separates demand from praise", () => {
  assert.equal(classifyComment("how do you do this?"), "question");
  assert.equal(classifyComment("drop the link"), "request");
  assert.equal(classifyComment("please make a part 2"), "request");
  assert.equal(classifyComment("this doesn't work"), "objection");
  assert.equal(classifyComment("@sam look"), "tag");
  assert.equal(classifyComment("love this"), "praise");
});

test("vocabulary gap surfaces topic words, not praise filler", () => {
  const posts = enrich(ingest([{ filename: "p.json", body: sample }]).posts);
  const comments = normaliseComments(
    JSON.parse(
      JSON.stringify(
        Array.from({ length: 30 }, (_, i) => ({
          cid: String(i),
          text:
            i % 2
              ? "how do i handle scope creep with a retainer client?"
              : "amazing, thank you so much, love this, needed it today",
          diggCount: 1,
          videoWebUrl: `https://www.tiktok.com/@v/video/7410000000000${String(i).padStart(2, "0")}`,
        })),
      ),
    ),
  );
  const terms = vocabularyGap(comments, posts).map((t) => t.term);
  assert.ok(terms.includes("scope") || terms.includes("retainer") || terms.includes("creep"),
    `expected topic terms, got: ${terms.join(", ")}`);
  for (const filler of ["thank", "love", "amazing", "needed", "today"]) {
    assert.ok(!terms.includes(filler), `"${filler}" is praise filler and must be excluded`);
  }
});

test("reach and resonance are diagnosed separately", () => {
  const body = JSON.stringify([
    // High views, low engagement -> hook worked, content did not.
    { id: "1", playCount: 100000, diggCount: 10, text: "a" },
    // Low views, high engagement -> content worked, distribution did not.
    { id: "2", playCount: 100, diggCount: 40, text: "b" },
    { id: "3", playCount: 90000, diggCount: 9, text: "c" },
    { id: "4", playCount: 120, diggCount: 50, text: "d" },
  ]);
  const posts = enrich(ingest([{ filename: "x.json", body }]).posts);
  const d = diagnosePosts(posts);
  assert.equal(d.get("2").diagnosis, "distribution-failure");
  assert.equal(d.get("1").diagnosis, "content-failure");

  const s = summariseDiagnoses(d);
  assert.equal(s.counts["distribution-failure"] + s.counts["content-failure"], 4);
});

test("age bias is detected when older posts systematically out-perform", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const posts = enrich(
    ingest([
      {
        filename: "x.json",
        body: JSON.stringify(
          Array.from({ length: 40 }, (_, i) => ({
            id: String(i),
            text: "t",
            // Older posts (higher i) get monotonically more views.
            playCount: 1000 + i * 500,
            createTimeISO: new Date(now - i * 30 * 86400000).toISOString(),
          })),
        ),
      },
    ]).posts,
  );
  const report = assessAgeBias(posts, now);
  assert.ok(report.correlation > 0.8, `expected strong positive correlation, got ${report.correlation}`);
  assert.equal(report.material, true);

  // A dataset with no age relationship must not raise the flag.
  const flat = enrich(
    ingest([
      {
        filename: "y.json",
        body: JSON.stringify(
          Array.from({ length: 40 }, (_, i) => ({
            id: String(i),
            text: "t",
            playCount: 1000 + ((i * 7919) % 500),
            createTimeISO: new Date(now - i * 30 * 86400000).toISOString(),
          })),
        ),
      },
    ]).posts,
  );
  assert.equal(assessAgeBias(flat, now).material, false);
});

test("confounded findings are flagged when they sit on the same posts", () => {
  const findings = [
    { dimension: "hashtag", value: "ai", label: "#ai", n: 10, lift: 1.8, pValue: 0.01, medianOutlier: 1.8, medianEngagement: null, medianViews: 100, exampleIds: [] },
    { dimension: "format", value: "photo", label: "Slideshow", n: 10, lift: 1.7, pValue: 0.01, medianOutlier: 1.7, medianEngagement: null, medianViews: 100, exampleIds: [] },
    { dimension: "sound", value: "x", label: "x", n: 10, lift: 1.6, pValue: 0.01, medianOutlier: 1.6, medianEngagement: null, medianViews: 100, exampleIds: [] },
  ];
  const ids = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  const memberships = new Map([
    ["hashtag:ai", ids],
    ["format:photo", ids],                      // identical set -> confounded
    ["sound:x", new Set(["p", "q", "r", "s"])], // disjoint -> independent
  ]);
  const pairs = findConfounds(findings, memberships);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].overlap, 1);
});

test("replication requires the same direction on multiple accounts", () => {
  const mk = (dimension, value, lift, n) => ({
    dimension, value, label: value, n, lift, pValue: 0.01,
    medianOutlier: lift, medianEngagement: null, medianViews: 100, exampleIds: [],
  });

  const replicated = findReplicatedPatterns(
    new Map([
      ["acct1", [mk("hashtag", "appdeveloper", 2.2, 11), mk("hashtag", "ai", 0.4, 40)]],
      ["acct2", [mk("hashtag", "appdeveloper", 1.9, 9), mk("hashtag", "ai", 0.6, 47)]],
      // Disagrees on direction -> must not count as replicated.
      ["acct3", [mk("hashtag", "devtok", 1.5, 8)]],
    ]),
  );

  const labels = replicated.map((r) => `${r.value}:${r.direction}`);
  assert.ok(labels.includes("appdeveloper:helps"));
  assert.ok(labels.includes("ai:hurts"));
  assert.ok(!labels.some((l) => l.startsWith("devtok")), "one account is not a replication");
});
