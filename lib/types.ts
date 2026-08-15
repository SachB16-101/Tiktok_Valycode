/**
 * Canonical shapes. Everything ingested from TikTok JSON is normalised into
 * `Post` before any analysis runs, so the rest of the app never has to care
 * which export format the data came from.
 */

export type PostFormat = "video" | "photo" | "unknown";

export interface Post {
  /** Stable id. Falls back to a hash of url+caption when the source has none. */
  id: string;
  account: string;
  url: string | null;
  caption: string;
  /** Epoch ms. Null when the source has no usable timestamp. */
  createdAt: number | null;

  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;

  durationSec: number | null;
  format: PostFormat;
  /** Number of images in a slideshow, when known. */
  slideCount: number | null;

  soundId: string | null;
  soundName: string | null;
  soundAuthor: string | null;
  isOriginalSound: boolean | null;

  hashtags: string[];
  coverUrl: string | null;

  /** The untouched source record, kept so nothing is ever lost in translation. */
  raw: Record<string, unknown>;
}

/** Per-post derived numbers. Computed relative to the post's own account. */
export interface PostMetrics {
  engagementRate: number | null;
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  saveRate: number | null;
  /** views / median views for the same account. 1 = typical, 5 = 5x normal. */
  outlierMultiple: number | null;
  /** 0-100 percentile of views within the account. */
  viewPercentile: number | null;
  /** Blended 0-100 performance score. */
  score: number;
}

export interface EnrichedPost extends Post {
  metrics: PostMetrics;
  /** First line / opening sentence of the caption. */
  hook: string;
  hookArchetypes: string[];
  captionLength: number;
  wordCount: number;
  hasCTA: boolean;
  hasQuestion: boolean;
  hashtagCount: number;
  postHour: number | null;
  postWeekday: number | null;
}

/** One value of one feature dimension, with its measured effect. */
export interface PatternFinding {
  dimension: string;
  value: string;
  label: string;
  /** Posts carrying this feature. */
  n: number;
  medianOutlier: number;
  medianEngagement: number | null;
  medianViews: number | null;
  /** medianOutlier(group) / medianOutlier(rest). >1 means it over-performs. */
  lift: number;
  /** Two-sided p from a rank-sum test against every other post. */
  pValue: number;
  /** Ids of the strongest examples, for citation. */
  exampleIds: string[];
}

export interface FieldMapping {
  [canonicalField: string]: string | null;
}

export interface Comment {
  id: string;
  /** The post this comment belongs to, joined by video id. */
  postId: string;
  text: string;
  author: string | null;
  likes: number | null;
  replyCount: number | null;
  createdAt: number | null;
  isReply: boolean;
}

/** A question or request in the comments, a content idea with proven demand. */
export interface DemandSignal {
  text: string;
  intent: "question" | "request";
  likes: number;
  replyCount: number;
  postId: string;
  postHook: string | null;
  postViews: number | null;
}

/** A word the audience uses more than the creator does. */
export interface VocabularyTerm {
  term: string;
  audienceCount: number;
  creatorCount: number;
  /** How much more often the audience says it than the creator. */
  ratio: number;
}

export interface CommentInsights {
  commentCount: number;
  postsWithComments: number;
  unmatchedComments: number;
  intents: Record<string, number>;
  tagRate: number;
  questionRate: number;
  objectionRate: number;
  demandSignals: DemandSignal[];
  vocabulary: VocabularyTerm[];
  topComments: { text: string; likes: number; postHook: string | null }[];
}

export interface Dataset {
  posts: Post[];
  comments: Comment[];
  /** Which source key each canonical field was read from. */
  mapping: FieldMapping;
  /** Keys present in the source that we did not consume. */
  unmappedKeys: string[];
  sourceFiles: string[];
  ingestedAt: number;
}

export interface HookIdea {
  hook: string;
  /** Slideshow, video, carousel... whatever the evidence supports. */
  format: string;
  angle: string;
  /** Why this should travel, grounded in the account's own numbers. */
  rationale: string;
  /** Named evidence from the dataset: lifts, example post ids. */
  evidence: string[];
  suggestedSounds: string[];
  suggestedHashtags: string[];
  /** 0-100, model's own read of viral potential. */
  confidence: number;
}

export interface Slide {
  index: number;
  /** Text burned onto the image itself. Keep it short. */
  onImageText: string;
  /** What the picture should be. Shoot list / sourcing brief. */
  imageBrief: string;
  /** Optional smaller supporting line. */
  subText: string | null;
  /** Notes on why this slide sits here in the sequence. */
  purpose: string;
}

export interface SlideshowPlan {
  title: string;
  hook: string;
  slides: Slide[];
  caption: string;
  hashtags: string[];
  soundSuggestion: string;
  /** Why the sequence is ordered this way. */
  strategy: string;
}
