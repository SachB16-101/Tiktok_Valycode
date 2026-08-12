import { looksLikeComments, normaliseComments } from "./comments";
import type { Dataset, FieldMapping, Post, PostFormat } from "./types";

/**
 * TikTok data arrives in a dozen shapes: the official account export, the
 * Research API, Creator Center dumps, and every third-party scraper. Rather
 * than pick one, we detect the record array anywhere in the file and score
 * candidate keys against alias lists to build a field mapping.
 */

type Rec = Record<string, unknown>;

/**
 * Alias lists per canonical field, best match first. Matching is done on a
 * normalised key (lowercased, punctuation stripped) so `playCount`,
 * `play_count`, `Play Count` and `PLAYCOUNT` all collapse together.
 */
const ALIASES: Record<string, string[]> = {
  id: ["id", "videoid", "awemeid", "itemid", "postid", "aweme_id", "key"],
  account: [
    "account",
    "username",
    "authorname",
    "uniqueid",
    "authormetaname",
    "author",
    "handle",
    "nickname",
    "profile",
  ],
  url: ["webvideourl", "url", "link", "shareurl", "videourl", "permalink", "postlink"],
  caption: [
    "caption",
    "text",
    "desc",
    "description",
    "videodescription",
    "title",
    "content",
  ],
  createdAt: [
    "createtimeiso",
    "createdat",
    "createtime",
    "date",
    "timestamp",
    "posttime",
    "publishedat",
    "publishtime",
    "datetime",
  ],
  views: [
    "playcount",
    "views",
    "viewcount",
    "videoviews",
    "plays",
    "totalviews",
    "impressions",
  ],
  likes: ["diggcount", "likes", "likecount", "likescount", "hearts", "totallikes"],
  comments: ["commentcount", "comments", "commentscount", "totalcomments"],
  shares: ["sharecount", "shares", "sharescount", "totalshares"],
  saves: [
    "collectcount",
    "saves",
    "savecount",
    "favorites",
    "favouritecount",
    "bookmarks",
    "totalsaves",
  ],
  durationSec: ["duration", "videometaduration", "videoduration", "lengthseconds", "length"],
  slideCount: ["imagecount", "slidecount", "imagesconut", "numimages", "photocount"],
  soundId: ["musicid", "musicmetamusicid", "soundid", "audioid"],
  soundName: [
    "musicname",
    "musicmetamusicname",
    "soundname",
    "songtitle",
    "audiotitle",
    "musictitle",
  ],
  soundAuthor: ["musicauthor", "musicmetamusicauthor", "soundauthor", "artist"],
  isOriginalSound: ["musicoriginal", "musicmetamusicoriginal", "isoriginalsound", "original"],
  hashtags: ["hashtags", "hashtagnames", "challenges", "tags", "hashtaglist"],
  coverUrl: [
    "coverurl",
    "covermedium",
    "cover",
    "coverimageurl",
    "thumbnail",
    "dynamiccover",
    "originalcover",
    "originalcoverurl",
  ],
  format: ["mediatype", "posttype", "contenttype", "format", "type"],
};

/**
 * Values that mean something for the `format` field. Scrapers also expose a
 * `videoMeta.format` holding the container ("mp4"), which is not what we mean
 * — without this guard it would claim the slot and tell us nothing.
 */
const FORMAT_VALUE_PATTERN = /photo|image|slide|carousel|video|reel|story/i;

/** Keys holding the per-slide image list, whose length is the slide count. */
const SLIDE_ARRAY_PATTERN = /slideshowimage|imagelinks|imageurls|images$|imagepostimages/;

/** Fields we accept as numbers even when the source stores them as strings. */
const NUMERIC_FIELDS = new Set([
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "durationSec",
  "slideCount",
]);

export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Flattens nested objects into dot-paths so `musicMeta.musicName` becomes a
 * single addressable key. Arrays of scalars are kept whole; arrays of objects
 * are kept whole too (hashtag lists need their structure).
 */
export function flatten(obj: unknown, prefix = "", depth = 0): Rec {
  const out: Rec = {};
  if (depth > 4 || obj === null || typeof obj !== "object") return out;

  for (const [key, value] of Object.entries(obj as Rec)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path, depth + 1));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * Walks arbitrary JSON looking for the array most likely to be the post list:
 * the largest array whose elements are objects. Handles the official TikTok
 * export, where the list is buried several levels deep.
 */
export function findRecordArray(root: unknown): Rec[] {
  let best: Rec[] = [];

  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || node === null || typeof node !== "object") return;

    if (Array.isArray(node)) {
      const objects = node.filter(
        (item): item is Rec => item !== null && typeof item === "object" && !Array.isArray(item),
      );
      // Require a majority of object elements so we don't latch onto a list of
      // hashtag strings or image URLs.
      if (objects.length > best.length && objects.length >= node.length * 0.5) {
        best = objects;
      }
      for (const item of node) visit(item, depth + 1);
      return;
    }

    for (const value of Object.values(node as Rec)) visit(value, depth + 1);
  };

  visit(root, 0);
  return best;
}

/**
 * Scores every flattened key in the sample against each canonical field's
 * aliases and returns the winning key per field. Earlier aliases win, and an
 * exact match on the final path segment beats a match on the whole path.
 */
export function inferMapping(records: Rec[]): FieldMapping {
  const sample = records.slice(0, 200).map((r) => flatten(r));
  const keyCounts = new Map<string, number>();

  for (const rec of sample) {
    for (const [key, value] of Object.entries(rec)) {
      if (value === null || value === undefined || value === "") continue;
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }

  const mapping: FieldMapping = {};
  const claimed = new Set<string>();

  for (const [field, aliases] of Object.entries(ALIASES)) {
    let bestKey: string | null = null;
    let bestScore = -Infinity;

    for (const [key, count] of keyCounts) {
      if (claimed.has(key)) continue;

      const segments = key.split(".");
      const lastSegment = normaliseKey(segments[segments.length - 1]);
      const wholePath = normaliseKey(key);

      const lastIdx = aliases.indexOf(lastSegment);
      const wholeIdx = aliases.indexOf(wholePath);
      if (lastIdx === -1 && wholeIdx === -1) continue;

      // Lower alias index = stronger signal. Fill rate breaks ties.
      const aliasIdx = lastIdx === -1 ? wholeIdx : lastIdx;
      const fillRate = count / sample.length;
      let score = (aliases.length - aliasIdx) * 10 + fillRate * 5;
      // Prefer shallow keys — `id` beats `authorMeta.id`.
      score -= (segments.length - 1) * 2;

      if (NUMERIC_FIELDS.has(field)) {
        const looksNumeric = sample.some((r) => coerceNumber(r[key]) !== null);
        if (!looksNumeric) continue;
      }

      // Only accept a `format` key whose values actually name a media format.
      if (field === "format") {
        const looksLikeFormat = sample.some(
          (r) => typeof r[key] === "string" && FORMAT_VALUE_PATTERN.test(r[key] as string),
        );
        if (!looksLikeFormat) continue;
      }

      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    mapping[field] = bestKey;
    if (bestKey) claimed.add(bestKey);
  }

  return mapping;
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Handles "1.2M", "45.3K", "1,234" — common in dashboard exports.
    const match = trimmed.match(/^([\d,.]+)\s*([kmb])?$/i);
    if (match) {
      const base = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(base)) return null;
      const suffix = match[2]?.toLowerCase();
      const factor = suffix === "b" ? 1e9 : suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
      return base * factor;
    }
    const plain = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(plain) ? plain : null;
  }
  return null;
}

export function coerceDate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Unix seconds vs milliseconds. Anything below ~year 2100 in seconds.
    return value < 4_102_444_800 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && /^\d+$/.test(trimmed)) {
      return asNumber < 4_102_444_800 ? asNumber * 1000 : asNumber;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Pulls hashtags from a dedicated field and, failing that, from the caption. */
export function extractHashtags(value: unknown, caption: string): string[] {
  const found = new Set<string>();

  const push = (tag: unknown) => {
    if (typeof tag !== "string") return;
    const clean = tag.trim().replace(/^#/, "").toLowerCase();
    if (clean) found.add(clean);
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const obj = item as Rec;
        push(obj.name ?? obj.title ?? obj.hashtagName ?? obj.challengeName);
      }
    }
  } else if (typeof value === "string") {
    for (const part of value.split(/[,\s]+/)) push(part);
  }

  for (const match of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) push(match[1]);

  return [...found];
}

function detectFormat(
  flat: Rec,
  mapping: FieldMapping,
  slideCount: number | null,
  durationSec: number | null,
): PostFormat {
  const declared = mapping.format ? flat[mapping.format] : null;
  if (typeof declared === "string") {
    const value = declared.toLowerCase();
    if (/photo|image|slide|carousel/.test(value)) return "photo";
    if (/video/.test(value)) return "video";
  }

  if (slideCount !== null && slideCount > 0) return "photo";

  // Scrapers signal a slideshow with an imagePostInfo payload or an explicit
  // boolean. The boolean is also the strongest *negative* signal we get, so a
  // definitive `false` settles it as a video.
  let explicitlyNotSlideshow = false;
  for (const [key, value] of Object.entries(flat)) {
    const normalised = normaliseKey(key);
    if (/imagepost|imagesposinfo/.test(normalised)) {
      if (value !== null && value !== undefined && value !== "" && value !== false) return "photo";
    }
    if (normalised === "isslideshow" || normalised === "isphotopost" || normalised === "slideshow") {
      if (value === true || value === "true") return "photo";
      if (value === false || value === "false") explicitlyNotSlideshow = true;
    }
  }

  if (explicitlyNotSlideshow) return "video";
  // A real playback duration only exists on a video.
  if (durationSec !== null && durationSec > 0) return "video";

  return "unknown";
}

/**
 * Slide count is rarely a plain number in the wild. Scrapers ship the per-slide
 * image URLs as an array, and its length is the slide count — so when no
 * numeric field mapped, fall back to counting that array.
 */
function deriveSlideCount(flat: Rec, mapped: number | null): number | null {
  if (mapped !== null) return mapped;

  for (const [key, value] of Object.entries(flat)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (SLIDE_ARRAY_PATTERN.test(normaliseKey(key))) return value.length;
  }
  return null;
}

function stableId(flat: Rec, mapping: FieldMapping, index: number): string {
  const raw = mapping.id ? flat[mapping.id] : null;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number") return String(raw);

  const url = mapping.url ? flat[mapping.url] : null;
  if (typeof url === "string" && url.trim()) {
    const match = url.match(/(\d{8,})/);
    if (match) return match[1];
    return url.trim();
  }
  return `post-${index}`;
}

function readString(flat: Rec, key: string | null): string | null {
  if (!key) return null;
  const value = flat[key];
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

export function normaliseRecords(
  records: Rec[],
  mapping: FieldMapping,
  fallbackAccount: string,
): Post[] {
  return records.map((record, index) => {
    const flat = flatten(record);
    const caption = readString(flat, mapping.caption) ?? "";
    const slideCount = deriveSlideCount(
      flat,
      mapping.slideCount ? coerceNumber(flat[mapping.slideCount]) : null,
    );
    const durationSec = mapping.durationSec ? coerceNumber(flat[mapping.durationSec]) : null;
    const originalRaw = mapping.isOriginalSound ? flat[mapping.isOriginalSound] : null;

    return {
      id: stableId(flat, mapping, index),
      account: readString(flat, mapping.account) ?? fallbackAccount,
      url: readString(flat, mapping.url),
      caption,
      createdAt: mapping.createdAt ? coerceDate(flat[mapping.createdAt]) : null,

      views: mapping.views ? coerceNumber(flat[mapping.views]) : null,
      likes: mapping.likes ? coerceNumber(flat[mapping.likes]) : null,
      comments: mapping.comments ? coerceNumber(flat[mapping.comments]) : null,
      shares: mapping.shares ? coerceNumber(flat[mapping.shares]) : null,
      saves: mapping.saves ? coerceNumber(flat[mapping.saves]) : null,

      durationSec,
      format: detectFormat(flat, mapping, slideCount, durationSec),
      slideCount,

      soundId: readString(flat, mapping.soundId),
      soundName: readString(flat, mapping.soundName),
      soundAuthor: readString(flat, mapping.soundAuthor),
      isOriginalSound:
        originalRaw === null || originalRaw === undefined
          ? null
          : originalRaw === true || originalRaw === "true",

      hashtags: extractHashtags(mapping.hashtags ? flat[mapping.hashtags] : null, caption),
      coverUrl: readString(flat, mapping.coverUrl),

      raw: record,
    };
  });
}

/** Parses a file body that may be JSON, a JSON array, or newline-delimited JSON. */
export function parseFileBody(body: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("File is empty");

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to NDJSON.
  }

  const lines = trimmed.split("\n").filter((line) => line.trim());
  const records: unknown[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip unparseable lines rather than failing the whole import.
    }
  }
  if (!records.length) throw new Error("Could not parse file as JSON or NDJSON");
  return records;
}

export interface IngestInput {
  filename: string;
  body: string;
}

export function ingest(files: IngestInput[], mappingOverride?: FieldMapping): Dataset {
  const allRecords: Rec[] = [];
  const commentRecords: Rec[] = [];
  const accountHints: string[] = [];

  for (const file of files) {
    const parsed = parseFileBody(file.body);
    const records = findRecordArray(parsed);
    if (!records.length) {
      throw new Error(`No records found in ${file.filename}`);
    }

    // Comment exports and post exports can be dropped in together — they are
    // told apart by shape, so the user never has to say which is which.
    if (looksLikeComments(records)) {
      commentRecords.push(...records);
      continue;
    }

    allRecords.push(...records);
    // "@valycode.json" -> "valycode", a decent fallback when the records
    // themselves carry no account field.
    accountHints.push(file.filename.replace(/\.(json|ndjson|txt)$/i, "").replace(/^@/, ""));
  }

  if (!allRecords.length) {
    throw new Error(
      commentRecords.length
        ? "Those files look like comments. Import your posts export first, then add comments."
        : "No post records found.",
    );
  }

  const mapping = mappingOverride ?? inferMapping(allRecords);
  const posts = normaliseRecords(allRecords, mapping, accountHints[0] ?? "account");

  const consumed = new Set(Object.values(mapping).filter((key): key is string => Boolean(key)));
  const seen = new Set<string>();
  for (const record of allRecords.slice(0, 200)) {
    for (const key of Object.keys(flatten(record))) seen.add(key);
  }

  return {
    posts: dedupe(posts),
    comments: normaliseComments(commentRecords),
    mapping,
    unmappedKeys: [...seen].filter((key) => !consumed.has(key)).sort(),
    sourceFiles: files.map((f) => f.filename),
    ingestedAt: Date.now(),
  };
}

/** Same post can appear in several exports; keep the record with the most data. */
function dedupe(posts: Post[]): Post[] {
  const byId = new Map<string, Post>();
  for (const post of posts) {
    const existing = byId.get(post.id);
    if (!existing || filledFields(post) > filledFields(existing)) byId.set(post.id, post);
  }
  return [...byId.values()];
}

function filledFields(post: Post): number {
  return Object.values(post).filter((v) => v !== null && v !== undefined && v !== "").length;
}
