"use client";

import { useMemo, useState } from "react";
import { formatCount, formatMultiple, formatPercent } from "@/lib/metrics";

export interface PostRow {
  id: string;
  hook: string;
  url: string | null;
  format: string;
  slideCount: number | null;
  createdAt: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: number | null;
  outlierMultiple: number | null;
  score: number;
  soundName: string | null;
  hashtags: string[];
  reasons: string[];
}

type SortKey = "outlierMultiple" | "views" | "engagementRate" | "createdAt" | "score" | "saves";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "outlierMultiple", label: "vs median" },
  { key: "views", label: "Views" },
  { key: "engagementRate", label: "Engagement" },
  { key: "saves", label: "Saves" },
  { key: "score", label: "Score" },
  { key: "createdAt", label: "Posted" },
];

export function PostsTable({ rows }: { rows: PostRow[] }) {
  const [sort, setSort] = useState<SortKey>("outlierMultiple");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (formatFilter !== "all" && row.format !== formatFilter) return false;
        if (!needle) return true;
        return (
          row.hook.toLowerCase().includes(needle) ||
          row.hashtags.some((tag) => tag.includes(needle)) ||
          (row.soundName?.toLowerCase().includes(needle) ?? false)
        );
      })
      .sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity) || 0);
  }, [rows, sort, query, formatFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search hooks, hashtags, sounds"
          className="min-w-[220px] flex-1 px-3 py-2 text-sm"
        />
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          className="px-3 py-2 text-sm"
        >
          <option value="all">All formats</option>
          <option value="photo">Slideshows</option>
          <option value="video">Videos</option>
          <option value="unknown">Unknown</option>
        </select>
        <span className="muted text-xs">{filtered.length.toLocaleString()} shown</span>
      </div>

      <div className="card scroll-x">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="muted text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Hook</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-2.5 text-right font-medium">
                  <button
                    onClick={() => setSort(column.key)}
                    className={sort === column.key ? "text-[var(--text-primary)]" : ""}
                  >
                    {column.label}
                    {sort === column.key ? " ↓" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="max-w-[360px] px-4 py-3">
                  <div className="truncate font-medium">
                    {row.url ? (
                      <a href={row.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {row.hook}
                      </a>
                    ) : (
                      row.hook
                    )}
                  </div>
                  <div className="muted mt-0.5 truncate text-xs">
                    {row.format === "photo" ? "Slideshow" : row.format === "video" ? "Video" : "—"}
                    {row.slideCount ? ` · ${row.slideCount} slides` : ""}
                    {row.reasons.length > 0 && ` · ${row.reasons.join(", ")}`}
                  </div>
                </td>
                <Cell>{formatMultiple(row.outlierMultiple)}</Cell>
                <Cell>{formatCount(row.views)}</Cell>
                <Cell>{formatPercent(row.engagementRate, 2)}</Cell>
                <Cell>{formatCount(row.saves)}</Cell>
                <Cell>{row.score}</Cell>
                <Cell>
                  {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="secondary px-3 py-3 text-right whitespace-nowrap"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </td>
  );
}
