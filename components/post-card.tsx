import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
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
    <article className="panel flex h-full flex-col gap-5 px-5 py-5">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[14.5px] leading-snug font-medium">{describePost(post)}</p>
          <p className="muted mt-2 text-[11.5px]">
            {[
              post.format === "photo" ? "Slideshow" : post.format === "video" ? "Video" : null,
              post.slideCount ? `${post.slideCount} slides` : null,
              post.createdAt ? new Date(post.createdAt).toLocaleDateString() : null,
              post.soundName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="numeric text-[21px] leading-none font-medium">
            {formatMultiple(post.metrics.outlierMultiple)}
          </div>
          <div className="muted mt-1.5 text-[10.5px]">vs median</div>
        </div>
      </header>

      <dl className="grid grid-cols-4 gap-3">
        <Metric label="Views" value={formatCount(post.views)} />
        <Metric label="Likes" value={formatCount(post.likes)} />
        <Metric label="Shares" value={formatCount(post.shares)} />
        <Metric label="Saves" value={formatCount(post.saves)} />
      </dl>

      {reasons.length > 0 && (
        <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <p className="muted text-[11px] font-medium">Why it worked</p>
          <ul className="mt-2.5 space-y-2">
            {reasons.slice(0, 4).map((reason) => (
              <li
                key={`${reason.dimension}-${reason.value}`}
                className="secondary flex items-baseline justify-between gap-4 text-[12.5px]"
              >
                <span style={{ color: "var(--text-primary)" }}>{reason.label}</span>
                <span className="numeric muted shrink-0 text-[11.5px]">
                  {reason.lift.toFixed(2)}× · n={reason.n} · {confidenceLabel(reason.pValue, reason.n).toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer
        className="muted mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3.5 text-[11px]"
        style={{ borderColor: "var(--line)" }}
      >
        <span className="numeric">{formatPercent(post.metrics.engagementRate, 2)} engagement</span>
        {post.hashtags.length > 0 && (
          <span className="min-w-0 truncate">
            {post.hashtags.slice(0, 4).map((h) => `#${h}`).join(" ")}
          </span>
        )}
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex shrink-0 items-center gap-1"
            style={{ color: "var(--accent)" }}
          >
            Open <ArrowUpRightIcon size={11} weight="bold" />
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
  if (post.soundName) return post.soundName;
  return "no caption text";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="muted text-[10.5px]">{label}</dt>
      <dd className="numeric mt-1 text-[14px] font-medium">{value}</dd>
    </div>
  );
}
