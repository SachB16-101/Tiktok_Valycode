import { NextResponse } from "next/server";
import { ingest, inferMapping, findRecordArray, parseFileBody } from "@/lib/normalize";
import { clearDataset, loadDataset, saveDataset } from "@/lib/store";
import type { FieldMapping } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface IngestBody {
  files: { filename: string; body: string }[];
  mapping?: FieldMapping;
  /** When true, only infer the mapping and return a preview — do not save. */
  previewOnly?: boolean;
}

export async function POST(request: Request) {
  try {
    const { files, mapping, previewOnly } = (await request.json()) as IngestBody;

    if (!files?.length) {
      return NextResponse.json({ error: "No files supplied" }, { status: 400 });
    }

    if (previewOnly) {
      const records = files.flatMap((file) => findRecordArray(parseFileBody(file.body)));
      if (!records.length) {
        return NextResponse.json(
          { error: "No post records found. Is this a TikTok export?" },
          { status: 400 },
        );
      }
      return NextResponse.json({
        recordCount: records.length,
        mapping: inferMapping(records),
        sampleRecord: records[0],
      });
    }

    const dataset = ingest(files, mapping);
    await saveDataset(dataset);

    return NextResponse.json({
      postCount: dataset.posts.length,
      mapping: dataset.mapping,
      unmappedKeys: dataset.unmappedKeys,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  const dataset = await loadDataset();
  if (!dataset) return NextResponse.json({ dataset: null });
  return NextResponse.json({
    postCount: dataset.posts.length,
    mapping: dataset.mapping,
    unmappedKeys: dataset.unmappedKeys,
    sourceFiles: dataset.sourceFiles,
    ingestedAt: dataset.ingestedAt,
  });
}

export async function DELETE() {
  await clearDataset();
  return NextResponse.json({ ok: true });
}
