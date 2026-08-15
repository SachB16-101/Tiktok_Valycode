# Valycode

Turns a TikTok JSON export into three things: a dashboard of your best posts
**with the reasons they won**, hook ideas ranked by measured viral potential, and
finished slideshows built slide by slide.

## Quick start

```bash
npm install
npm run setup     # paste your Anthropic API key, it gets verified before saving
npm run dev       # http://localhost:3000
```

Then open **Data** and drop your JSON in.

`npm run setup` writes `.env.local` (gitignored, chmod 600) and checks the key
against the API before saving it, so a typo fails here rather than halfway
through a generation. `npm run setup:check` re-verifies an existing key.

The key is only needed for hook generation and slideshow authoring. Ingest,
analysis, charts, slide rendering and export all work without one.

## What it does with your data

### 1. Ingest — works with whatever shape your JSON is in

There is no required schema. The importer walks the file, finds the array of
post records wherever it is nested, and matches source keys to canonical fields
by name. It handles the official TikTok data export, the Research API, Creator
Center dumps, and third-party scrapers, plus NDJSON and multi-file imports.

Whatever it infers is shown to you as an editable mapping table before anything
is committed. Fields it cannot find stay unmapped, and every analysis that
depends on them is **skipped rather than guessed**.

Numbers arrive in many disguises — `1.2M`, `45.3K`, `"1,234"` — and are parsed
accordingly. Dates are detected as unix seconds, milliseconds, or ISO strings.
Duplicate posts across files collapse to the richest copy.

### 2. Analyse — why the winners won

Absolute view counts say nothing across accounts of different sizes, so every
post is scored **relative to its own account's median**. A post at 5× is one
that reached five times the account's typical post.

Each feature a post can carry — hashtag, sound, format, hook archetype, slide
count, caption length, posting hour, weekday, video length, CTA presence — is
tested against every other post in the account:

- **Lift** is the ratio of median performance with the feature to median
  performance without it.
- **Significance** comes from a Mann–Whitney rank-sum test, which assumes
  nothing about how view counts are distributed. They are not normal.
- **Ranking** uses a reliability-adjusted lift that shrinks small-sample effects
  toward "no effect", so a huge number measured on five posts cannot outrank a
  solid one measured across the account. Without this, a three-post hashtag that
  happened to sit on one viral post reports as a 500× winner.

Every top post then carries a plain-language explanation naming the features it
has that measurably over-perform, with sample size and confidence attached.

### 3. Generate — hooks and finished slideshows

**Hook ideas** builds an evidence pack from your own top posts and measured
lifts, and asks Claude for hooks with the highest viral potential for *this*
account. Every idea comes back with the evidence behind it — the lift, the
sample size, the post it is reasoning from. Confidence is the model's honest
read, not a sales pitch.

**Slideshow studio** takes a hook and writes the whole post:

- every slide's on-image text and optional supporting line
- a concrete, shootable **picture brief** per slide
- why each slide sits where it does in the sequence
- caption, hashtags, sound suggestion

Slides render to a real 1080×1920 canvas — TikTok's native photo-post size — so
the preview is the export. Edit any slide's text and it re-renders live. Drop
your own photo into a slide and it is cover-fit under a scrim so the text keeps
contrast. **Download all slides** gives you a zip of ready-to-post PNGs plus the
caption and a shot list.

### Without an API key

Ingest, analysis, charts and export all work with no key. Generation falls back
to evidence-only templates that recombine your measured patterns — weaker than
the model path, but honest about which lift each suggestion rests on.

## A note on slideshow accounts

If most of your captions are hashtags only, the hook your viewers actually read
is burned onto the first image — and **no TikTok export contains that text**.
The app detects this, tells you what share of your posts it affects, and limits
hook analysis to the posts that do have caption text. Everything else — format,
sound, hashtags, timing, slide count — still uses all of them.

To get hook analysis across your whole account, put the slide-one text into the
caption when you post, or add a `hookText` field to your JSON and map it to
Caption on the Data page.

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Add and verify your API key |
| `npm run setup:check` | Re-verify the configured key |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Analysis-pipeline test suite |
| `npm run typecheck` | Type check |
| `node scripts/make-sample.mjs` | Generate synthetic sample data |

## Layout

```
lib/normalize.ts   schema detection, field mapping, parsing
lib/metrics.ts     per-account baselines and post scoring
lib/patterns.ts    lift, rank-sum significance, per-post explanation
lib/hooks.ts       hook extraction and archetype classification
lib/claude.ts      evidence brief + structured generation
lib/fallback.ts    evidence-only generators for the no-key path
app/               dashboard, posts, patterns, ideas, studio, data
components/        charts, slide canvas, tables
```

Data lives in `./data` as JSON. It is gitignored and never leaves your machine
except for the evidence brief sent to the Anthropic API during generation.
