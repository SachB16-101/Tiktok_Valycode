import { promises as fs } from "node:fs";
import path from "node:path";
import type { Dataset } from "./types";

/**
 * File-backed store. Deliberately not a database: the whole point is that you
 * drop JSON in and it works, with no setup step. Data lives in ./data, which
 * is gitignored.
 */

const DATA_DIR = process.env.VALYCODE_DATA_DIR ?? path.join(process.cwd(), "data");
const DATASET_PATH = path.join(DATA_DIR, "dataset.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function saveDataset(dataset: Dataset): Promise<void> {
  await ensureDir();
  await fs.writeFile(DATASET_PATH, JSON.stringify(dataset), "utf8");
}

export async function loadDataset(): Promise<Dataset | null> {
  try {
    const body = await fs.readFile(DATASET_PATH, "utf8");
    return JSON.parse(body) as Dataset;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function clearDataset(): Promise<void> {
  try {
    await fs.unlink(DATASET_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Saved slideshow plans, so work survives a refresh. */
export async function saveArtifact(name: string, payload: unknown): Promise<void> {
  await ensureDir();
  const safe = name.replace(/[^a-z0-9._-]/gi, "_");
  await fs.writeFile(path.join(DATA_DIR, `${safe}.json`), JSON.stringify(payload), "utf8");
}

export async function listArtifacts(): Promise<string[]> {
  try {
    const entries = await fs.readdir(DATA_DIR);
    return entries.filter((e) => e.endsWith(".json") && e !== "dataset.json");
  } catch {
    return [];
  }
}
