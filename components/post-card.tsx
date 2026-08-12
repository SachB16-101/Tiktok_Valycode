import { formatCount, formatMultiple, formatPercent } from "@/lib/metrics";
import { confidenceLabel } from "@/lib/patterns";
import type { EnrichedPost, PatternFinding } from "@/lib/types";

export function PostCard({
  post,
  reasons,
}: {
  post: EnrichedPost;
  reasons: PatternFinding[];
}) {
  return (
    <article className="card flex flex-col gap-3 px-5 py-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{describePost(post)}</p>
          <p className="muted mt-1 text-xs">
            {post.format === "photo" ? "Slideshow" : post.format === "video" ? "Video" : "Unknown format"}
            {post.slideCount ? ` · ${post.slideCount} slides` : ""}
            {post.createdAt ? ` · ${new Date(post.createdAt).toLocaleDateString()}` : ""}
            {post.soundName ? ` · ${post.soundName}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-semibold leading-none">
            {formatMultiple(post.metrics.outlierMultiple)}
          </div>
          <div className="muted mt-1 text-[11px]">vs median</div>
        </div>
      </header>

      <dl className="grid grid-cols-4 gap-2 text-xs">
        <Metric label="Views" value={formatCount(post.views)} />
        <Metric label="Likes" value={formatCount(post.likes)} />
        <Metric label="Shares" value={formatCount(post.shares)} />
        <Metric label="Saves" value={formatCount(post.saves)} />
      </dl>

      {reasons.length > 0 && (
        <div>
          <p className="muted text-[11px] font-medium uppercase tracking-wide">Why it worked</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {reasons.map((reason) => (
              <li key={`${reason.dimension}-${reason.value}`} className="secondary flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--lift)" }}
                />
                <span>
                  <span className="font-medium text-[var(--text-primary)]">{reason.label}</span> runs{" "}
                  {reason.lift.toFixed(2)}× your median across {reason.n} posts —{" "}
                  {confidenceLabel(reason.pValue, reason.n).toLowerCase()} evidence.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span>Engagement {formatPercent(post.metrics.engagementRate, 2)}</span>
        {post.hashtags.length > 0 && <span>{post.hashtags.slice(0, 5).map((h) => `#${h}`).join(" ")}</span>}
        {post.url && (
          <a href={post.url} target="_blank" rel="noreferrer" className="underline">
            Open on TikTok
          </a>
        )}
      </footer>
    </article>
  );
}

/** Slideshow captions are often hashtags only; name the post by what we do have. */
function describePost(post: EnrichedPost): string {
  if (post.hook) return post.hook;
  if (post.hashtags.length) return post.hashtags.slice(0, 4).map((h) => `#${h}`).join(" ");
  if (post.soundName) return `sound: ${post.soundName}`;
  return "no caption text";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="muted text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </dd>
    </div>
  );
}
