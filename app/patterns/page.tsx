import Link from "next/link";
import { PatternBars } from "@/components/pattern-bars";
import { formatCount } from "@/lib/metrics";
import { enrich } from "@/lib/metrics";
import { DIMENSIONS, confidenceLabel, minePatterns } from "@/lib/patterns";
import { loadDataset } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PatternsPage() {
  const dataset = await loadDataset();

  if (!dataset) {
    return (
      <p className="secondary text-sm">
        No data loaded.{" "}
        <Link href="/ingest" className="underline">
          Import your JSON
        </Link>{" "}
        to get started.
      </p>
    );
  }

  const posts = enrich(dataset.posts);
  const findings = minePatterns(posts);

  const byDimension = DIMENSIONS.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    items: findings
      .filter((f) => f.dimension === dimension.key)
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 12),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patterns</h1>
        <p className="secondary mt-1 max-w-3xl text-sm">
          Every feature your posts carry, tested against every other post in the account. Lift is
          the ratio of median performance with the feature to median performance without it, where
          performance is views divided by your own account median — so post size never distorts the
          comparison. The p-value comes from a Mann–Whitney rank-sum test, which makes no
          assumptions about how view counts are distributed.
        </p>
      </div>

      {byDimension.length === 0 && (
        <p className="secondary text-sm">
          Not enough data to separate signal from noise yet. Patterns start emerging at around 30
          posts.
        </p>
      )}

      {byDimension.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{group.label}</h2>
          <div className="card px-5 py-5">
            <PatternBars findings={group.items} />
          </div>
          <details className="text-sm">
            <summary className="secondary cursor-pointer">Show the numbers</summary>
            <div className="card scroll-x mt-2">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="muted text-left text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">Value</th>
                    <th className="px-3 py-2.5 text-right font-medium">Posts</th>
                    <th className="px-3 py-2.5 text-right font-medium">Median views</th>
                    <th className="px-3 py-2.5 text-right font-medium">Lift</th>
                    <th className="px-3 py-2.5 text-right font-medium">p</th>
                    <th className="px-3 py-2.5 text-right font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.value} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-4 py-2 font-medium">{item.label}</td>
                      <td className="secondary px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {item.n}
                      </td>
                      <td className="secondary px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatCount(item.medianViews)}
                      </td>
                      <td className="secondary px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {item.lift.toFixed(2)}×
                      </td>
                      <td className="secondary px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {item.pValue.toFixed(3)}
                      </td>
                      <td className="secondary px-3 py-2 text-right">
                        {confidenceLabel(item.pValue, item.n)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}
