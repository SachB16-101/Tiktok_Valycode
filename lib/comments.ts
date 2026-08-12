import { coerceDate, coerceNumber, flatten, normaliseKey } from "./normalize";
import type { Comment, CommentInsights, DemandSignal, EnrichedPost, VocabularyTerm } from "./types";

type Rec = Record<string, unknown>;

/**
 * Comment analysis.
 *
 * Metrics tell you which posts won. Comments tell you *why people cared* and,
 * more usefully, what they wanted next. A question in the comments is a content
 * request with demand already proven — someone cared enough to type it.
 *
 * The other thing comments give you that nothing else does is the audience's
 * own vocabulary. Creators systematically describe their work in their own
 * words; the audience searches in theirs. The gap between the two is where
 * hooks go to die.
 */

/** A comment record references its parent post by URL or by a bare video id. */
const VIDEO_ID_PATTERN = /(\d{15,21})/;

function extractPostId(flat: Rec): string | null {
  // Prefer an explicit parent-video field, then any TikTok URL, then any long
  // numeric id that is not the comment's own id.
  const entries = Object.entries(flat);

  for (const [key, value] of entries) {
    const k = normaliseKey(key);
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value);
    if (/videoid|awemeid|itemid|postid|parentid/.test(k) && !/comment/.test(k)) {
      const match = text.match(VIDEO_ID_PATTERN);
      if (match) return match[1];
    }
  }

  for (const [key, value] of entries) {
    const k = normaliseKey(key);
    if (typeof value !== "string") continue;
    if (/videowebur|videourl|submittedvideourl|weburl|posturl/.test(k)) {
      const match = value.match(VIDEO_ID_PATTERN);
      if (match) return match[1];
    }
  }

  return null;
}

function readText(flat: Rec): string {
  for (const key of ["text", "comment", "content", "body", "message"]) {
    for (const [k, v] of Object.entries(flat)) {
      if (normaliseKey(k) === key && typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

function readBy(flat: Rec, patterns: RegExp): unknown {
  for (const [key, value] of Object.entries(flat)) {
    if (patterns.test(normaliseKey(key))) return value;
  }
  return null;
}

/**
 * A record array is comments rather than posts when its rows carry text and a
 * parent-video reference but no view count of their own.
 */
export function looksLikeComments(records: Rec[]): boolean {
  const sample = records.slice(0, 50).map((r) => flatten(r));
  if (!sample.length) return false;

  let commentish = 0;
  for (const flat of sample) {
    const hasText = readText(flat).length > 0;
    const hasParent = extractPostId(flat) !== null;
    const hasViews = Object.keys(flat).some((k) =>
      /^(playcount|views|viewcount|videoviews)$/.test(normaliseKey(k)),
    );
    if (hasText && hasParent && !hasViews) commentish += 1;
  }
  return commentish / sample.length > 0.6;
}

export function normaliseComments(records: Rec[]): Comment[] {
  const out: Comment[] = [];

  records.forEach((record, index) => {
    const flat = flatten(record);
    const text = readText(flat);
    const postId = extractPostId(flat);
    if (!text || !postId) return;

    const replyTo = readBy(flat, /repliestoid|parentcommentid|replyto/);

    out.push({
      id: String(readBy(flat, /^(cid|commentid|id)$/) ?? `c-${index}`),
      postId,
      text,
      author: (readBy(flat, /uniqueid|username|nickname|author/) as string) ?? null,
      likes: coerceNumber(readBy(flat, /diggcount|likecount|likes/)),
      replyCount: coerceNumber(readBy(flat, /replycommenttotal|replycount|replies/)),
      createdAt: coerceDate(readBy(flat, /createtimeiso|createtime|timestamp|date/)),
      isReply: Boolean(replyTo && replyTo !== "0" && replyTo !== 0),
    });
  });

  return out;
}

/* ------------------------------------------------------------------ *
 * Demand extraction
 * ------------------------------------------------------------------ */

const QUESTION_OPENERS =
  /^(how|what|where|when|why|which|who|can|could|do|does|did|is|are|will|would|should|any|anyone|is there)\b/i;

/** Phrases that are requests even without a question mark. */
const REQUEST_PATTERN =
  /\b(tutorial|link\??|drop the|please make|can you (make|do|show)|need (a|the)|part \d|more of|how do (you|i)|what('| i)?s the (name|app|tool|song))\b/i;

/** Comments that signal a problem rather than a request. */
const OBJECTION_PATTERN =
  /\b(doesn'?t work|not working|didn'?t work|too expensive|paid|scam|useless|waste of|clickbait|misleading|wrong|fake)\b/i;

/** Tagging a friend is the strongest organic-reach signal a comment can carry. */
const TAG_PATTERN = /@[\w.]+/;

export type CommentIntent = "question" | "request" | "objection" | "tag" | "praise" | "other";

export function classifyComment(text: string): CommentIntent {
  const trimmed = text.trim();
  if (OBJECTION_PATTERN.test(trimmed)) return "objection";
  // Question shape wins over request shape: "how do you price this?" is a
  // question that happens to imply a request. Only imperative asks with no
  // question form ("please make a part 2", "drop the link") count as requests.
  if (trimmed.includes("?") || QUESTION_OPENERS.test(trimmed)) return "question";
  if (REQUEST_PATTERN.test(trimmed)) return "request";
  if (TAG_PATTERN.test(trimmed)) return "tag";
  if (/\b(love|amazing|thank|great|goat|fire|helpful|needed this|underrated)\b/i.test(trimmed))
    return "praise";
  return "other";
}

/* ------------------------------------------------------------------ *
 * Vocabulary gap
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set(
  (
    // Grammatical words.
    "a an the and or but if then than that this these those i me my mine you your yours he she it we " +
    "they them his her its our their is are was were be been being am do does did done doing have has " +
    "had having will would can could should shall may might must of in on at to for with from by as " +
    "about into over under after before up down out off so no nor not yes just even still also again " +
    "how what where when why which who whom whose all any some more most other such only own same too " +
    "very there here now ever never always one two been " +
    // Chat shorthand and contractions the tokeniser leaves behind.
    "dont didnt doesnt isnt arent wasnt werent wont wouldnt couldnt shouldnt hasnt hadnt havent " +
    "im ive id ill youre youve youll youd theyre theyve theres thats whats wheres hows heres itsn " +
    "cant lets u ur ya yall pls plz lol lmao omg bro bruh fr ngl tbh imo idk btw rn though although " +
    "because since while whether either neither both each every " +
    // Reaction vocabulary. It is real language but it describes the audience's
    // feelings, not the subject — including it drowns out the topic terms.
    "love loved loving amazing great good best better nice cool awesome perfect thank thanks thankyou " +
    "please helpful help needed need underrated goat fire insane crazy wild actually really literally " +
    "honestly seriously definitely absolutely exactly totally basically obviously today tomorrow " +
    "yesterday saving saved save watching watched watch looking look seeing seen video post content " +
    "thing things stuff way ways get got getting make made making take took like likes liked much many " +
    "lot lots time times people guy guys man dude sir bro someone something anything nothing everyone"
  )
    .split(/\s+/)
    .filter(Boolean),
);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    // Fold apostrophes out entirely so "doesn't" and "doesnt" are one token and
    // both are caught by a single stopword entry.
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && word.length < 24 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
}

/**
 * Terms the audience uses that the creator does not. Scored by how much more
 * often a term appears in comments than in the creator's own captions and
 * hashtags — this is the language gap, and it is where hooks should be written
 * from, because it is the language people actually think in.
 */
export function vocabularyGap(
  comments: Comment[],
  posts: EnrichedPost[],
  limit = 20,
): VocabularyTerm[] {
  // Only questions and requests carry subject matter. Praise describes how
  // someone felt, not what they want — mining it returns "thank" and "amazing"
  // and buries the terms that could actually become a hook.
  const substantive = comments.filter((c) => {
    const intent = classifyComment(c.text);
    return intent === "question" || intent === "request" || intent === "objection";
  });
  const source = substantive.length >= 20 ? substantive : comments;

  const audience = new Map<string, number>();
  // A term repeated inside one pile-on is not a pattern. Track how many
  // distinct posts each term appears under and require breadth.
  const postsPerTerm = new Map<string, Set<string>>();

  for (const comment of source) {
    for (const word of new Set(tokenise(comment.text))) {
      audience.set(word, (audience.get(word) ?? 0) + 1);
      const seen = postsPerTerm.get(word) ?? new Set<string>();
      seen.add(comment.postId);
      postsPerTerm.set(word, seen);
    }
  }

  const creator = new Map<string, number>();
  for (const post of posts) {
    const own = [post.caption, ...post.hashtags].join(" ");
    for (const word of new Set(tokenise(own))) {
      creator.set(word, (creator.get(word) ?? 0) + 1);
    }
  }

  const audienceTotal = Math.max(1, source.length);
  const creatorTotal = Math.max(1, posts.length);

  const terms: VocabularyTerm[] = [];
  for (const [word, count] of audience) {
    // Ignore one-off typos and noise.
    if (count < Math.max(3, source.length * 0.004)) continue;
    // Must show up under several different posts, or it is one thread's quirk.
    if ((postsPerTerm.get(word)?.size ?? 0) < 3) continue;

    const audienceRate = count / audienceTotal;
    const creatorRate = (creator.get(word) ?? 0) / creatorTotal;
    // +smoothing so a term the creator never uses does not divide by zero.
    const ratio = (audienceRate + 0.0005) / (creatorRate + 0.0005);

    terms.push({
      term: word,
      audienceCount: count,
      creatorCount: creator.get(word) ?? 0,
      ratio,
    });
  }

  return terms.sort((a, b) => b.ratio * Math.log(1 + b.audienceCount) - a.ratio * Math.log(1 + a.audienceCount)).slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Top-level analysis
 * ------------------------------------------------------------------ */

export function analyseComments(posts: EnrichedPost[], comments: Comment[]): CommentInsights {
  const byPost = new Map<string, Comment[]>();
  for (const comment of comments) {
    const list = byPost.get(comment.postId) ?? [];
    list.push(comment);
    byPost.set(comment.postId, list);
  }

  const postsById = new Map(posts.map((p) => [p.id, p]));

  const intents: Record<CommentIntent, number> = {
    question: 0,
    request: 0,
    objection: 0,
    tag: 0,
    praise: 0,
    other: 0,
  };

  const demand: DemandSignal[] = [];

  for (const comment of comments) {
    const intent = classifyComment(comment.text);
    intents[intent] += 1;

    if (intent === "question" || intent === "request") {
      const post = postsById.get(comment.postId);
      demand.push({
        text: comment.text.slice(0, 200),
        intent,
        likes: comment.likes ?? 0,
        replyCount: comment.replyCount ?? 0,
        postId: comment.postId,
        postHook: post?.hook || post?.hashtags.slice(0, 3).map((h) => `#${h}`).join(" ") || null,
        postViews: post?.views ?? null,
      });
    }
  }

  // A question with many likes is many people asking it at once — that is the
  // strongest content request available anywhere in the data.
  demand.sort((a, b) => b.likes + b.replyCount * 2 - (a.likes + a.replyCount * 2));

  const matched = [...byPost.keys()].filter((id) => postsById.has(id)).length;

  return {
    commentCount: comments.length,
    postsWithComments: matched,
    unmatchedComments: comments.filter((c) => !postsById.has(c.postId)).length,
    intents,
    tagRate: comments.length ? intents.tag / comments.length : 0,
    questionRate: comments.length ? (intents.question + intents.request) / comments.length : 0,
    objectionRate: comments.length ? intents.objection / comments.length : 0,
    demandSignals: demand.slice(0, 40),
    vocabulary: vocabularyGap(comments, posts),
    topComments: [...comments]
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
      .slice(0, 15)
      .map((c) => ({
        text: c.text.slice(0, 240),
        likes: c.likes ?? 0,
        postHook: postsById.get(c.postId)?.hook || null,
      })),
  };
}

/**
 * Per-post comment signals, folded back into the post record so they can be
 * mined as pattern dimensions alongside everything else.
 */
export function commentSignalsByPost(comments: Comment[]): Map<string, { questionRate: number; tagRate: number; count: number }> {
  const grouped = new Map<string, Comment[]>();
  for (const comment of comments) {
    const list = grouped.get(comment.postId) ?? [];
    list.push(comment);
    grouped.set(comment.postId, list);
  }

  const out = new Map<string, { questionRate: number; tagRate: number; count: number }>();
  for (const [postId, list] of grouped) {
    const intents = list.map((c) => classifyComment(c.text));
    out.set(postId, {
      count: list.length,
      questionRate:
        intents.filter((i) => i === "question" || i === "request").length / Math.max(1, list.length),
      tagRate: intents.filter((i) => i === "tag").length / Math.max(1, list.length),
    });
  }
  return out;
}
