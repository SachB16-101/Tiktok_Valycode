"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldMapping } from "@/lib/types";

interface LoadedFile {
  filename: string;
  body: string;
}

interface Preview {
  recordCount: number;
  mapping: FieldMapping;
  sampleRecord: Record<string, unknown>;
}

const FIELD_ORDER = [
  "id",
  "account",
  "url",
  "caption",
  "createdAt",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "durationSec",
  "slideCount",
  "format",
  "soundId",
  "soundName",
  "soundAuthor",
  "isOriginalSound",
  "hashtags",
  "coverUrl",
];

const FIELD_LABELS: Record<string, string> = {
  id: "Post ID",
  account: "Account",
  url: "Post URL",
  caption: "Caption",
  createdAt: "Posted at",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  durationSec: "Duration (s)",
  slideCount: "Slide count",
  format: "Format",
  soundId: "Sound ID",
  soundName: "Sound name",
  soundAuthor: "Sound author",
  isOriginalSound: "Original sound",
  hashtags: "Hashtags",
  coverUrl: "Cover image",
};

export default function IngestPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ postCount: number; sourceFiles: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/ingest")
      .then((r) => r.json())
      .then((data) => {
        if (data.postCount) setExisting({ postCount: data.postCount, sourceFiles: data.sourceFiles ?? [] });
      })
      .catch(() => undefined);
  }, []);

  const availableKeys = preview ? Object.keys(flattenSample(preview.sampleRecord)).sort() : [];

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    setBusy(true);

    try {
      const loaded = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          filename: file.name,
          body: await file.text(),
        })),
      );
      setFiles(loaded);

      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: loaded, previewOnly: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read those files");

      setPreview(data);
      setMapping(data.mapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setFiles([]);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files, mapping }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import your TikTok data</h1>
        <p className="secondary mt-1 max-w-2xl text-sm">
          Drop in one or more JSON files. Official TikTok data exports, Research API dumps, Creator
          Center exports and third-party scraper output all work — fields are detected by matching
          key names, and you can correct anything it gets wrong before importing.
        </p>
      </div>

      {existing && !preview && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
          <span className="secondary">
            Currently loaded: <strong className="text-[var(--text-primary)]">{existing.postCount.toLocaleString()} posts</strong>
            {existing.sourceFiles.length > 0 && ` from ${existing.sourceFiles.join(", ")}`}
          </span>
          <button
            onClick={async () => {
              await fetch("/api/ingest", { method: "DELETE" });
              setExisting(null);
              router.refresh();
            }}
            className="rounded-lg border px-3 py-1.5"
            style={{ borderColor: "var(--border)" }}
          >
            Clear data
          </button>
        </div>
      )}

      <div
        className="card flex flex-col items-center justify-center gap-3 border-dashed px-6 py-12 text-center"
        style={{ borderStyle: "dashed", borderWidth: 2 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <p className="font-medium">Drop JSON files here</p>
        <p className="muted text-sm">or</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--lift)" }}
          disabled={busy}
        >
          {busy ? "Reading…" : "Choose files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.ndjson,.txt,application/json"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        {files.length > 0 && (
          <p className="muted text-xs">{files.map((f) => f.filename).join(", ")}</p>
        )}
      </div>

      {error && (
        <div className="card px-4 py-3 text-sm" style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>
          {error}
        </div>
      )}

      {preview && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Found {preview.recordCount.toLocaleString()} records
            </h2>
            <button
              onClick={() => void commit()}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--lift)" }}
            >
              {busy ? "Importing…" : "Import with this mapping"}
            </button>
          </div>

          <p className="secondary text-sm">
            Check the mapping below. Anything set to <em>Not mapped</em> is simply skipped — the
            analysis never invents a number it does not have.
          </p>

          <div className="card scroll-x">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="muted text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Field</th>
                  <th className="px-4 py-2.5 font-medium">Source key</th>
                  <th className="px-4 py-2.5 font-medium">Sample value</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_ORDER.map((field) => {
                  const key = mapping[field] ?? null;
                  const sample = key ? flattenSample(preview.sampleRecord)[key] : undefined;
                  return (
                    <tr key={field} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-4 py-2 font-medium">{FIELD_LABELS[field] ?? field}</td>
                      <td className="px-4 py-2">
                        <select
                          value={key ?? ""}
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [field]: e.target.value || null }))
                          }
                          className="w-full px-2 py-1 text-xs"
                        >
                          <option value="">Not mapped</option>
                          {availableKeys.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="muted max-w-[240px] truncate px-4 py-2 text-xs">
                        {sample === undefined || sample === null ? "—" : String(sample).slice(0, 80)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/** Mirrors lib/normalize flatten() for preview display. */
function flattenSample(obj: unknown, prefix = "", depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (depth > 4 || obj === null || typeof obj !== "object") return out;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenSample(value, path, depth + 1));
    } else {
      out[path] = value;
    }
  }
  return out;
}
