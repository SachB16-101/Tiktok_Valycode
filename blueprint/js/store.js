/**
 * Storage.
 *
 * Two stores, chosen by what the data is:
 *
 *   localStorage   Everything structured. Small, synchronous, survives
 *                  reinstall of the service worker, easy to export as one
 *                  JSON file the user actually owns.
 *   IndexedDB      Progress photos only. They are the one thing here that
 *                  would blow the ~5 MB localStorage budget, and they are
 *                  also the one thing that must never leave the device.
 *
 * Nothing syncs. There is no account and no server. That is a feature: the
 * data is a body log with photographs in it.
 */

const KEY = "blueprint.state.v1";
const DB_NAME = "blueprint-photos";
const DB_STORE = "photos";

export const todayKey = (d = new Date()) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const dayOffset = (key, days) => {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + days);
  return todayKey(d);
};

export const daysBetween = (a, b) =>
  Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

function blankState() {
  return {
    v: 1,
    profile: { bodyweightKg: 75, wakeTime: "07:00", startedAt: todayKey() },
    active: null, // null means "not chosen yet", filled from DEFAULT_ACTIVE on first run
    log: {},
    measures: [],
    photos: [],
    bloods: [],
    experiments: [],
    reviews: [],
    theme: "auto",
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    return { ...blankState(), ...parsed, profile: { ...blankState().profile, ...parsed.profile } };
  } catch {
    return blankState();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    // A full quota should never silently eat a day's log.
    console.warn("Could not save", err);
    notifyQuota();
  }
}

let quotaHandler = null;
export const onQuotaError = (fn) => (quotaHandler = fn);
const notifyQuota = () => quotaHandler?.();

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Every mutation goes through here so persistence and repaint cannot drift. */
export function update(mutator) {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  persist();
  listeners.forEach((fn) => fn(state));
}

/* ------------------------------------------------------------- daily log */

export function dayLog(key = todayKey()) {
  return state.log[key] ?? {};
}

export function setEntry(habitId, value, key = todayKey()) {
  update((s) => {
    const day = { ...(s.log[key] ?? {}) };
    if (value === false || value === null || value === undefined || value === "") {
      delete day[habitId];
    } else {
      day[habitId] = value;
    }
    if (Object.keys(day).length === 0) delete s.log[key];
    else s.log[key] = day;
  });
}

export function toggleActive(habitId) {
  update((s) => {
    const set = new Set(s.active ?? []);
    set.has(habitId) ? set.delete(habitId) : set.add(habitId);
    s.active = [...set];
  });
}

/* ------------------------------------------------------------- measures */

export function addMeasure(entry) {
  update((s) => {
    // One measurement row per date. Re-measuring the same day corrects it
    // rather than adding a second point to the chart.
    const i = s.measures.findIndex((m) => m.date === entry.date);
    if (i >= 0) s.measures[i] = { ...s.measures[i], ...entry };
    else s.measures.push(entry);
    s.measures.sort((a, b) => a.date.localeCompare(b.date));
  });
}

export function removeMeasure(date) {
  update((s) => {
    s.measures = s.measures.filter((m) => m.date !== date);
  });
}

export function addBloods(entry) {
  update((s) => {
    s.bloods.push(entry);
    s.bloods.sort((a, b) => b.date.localeCompare(a.date));
  });
}

/* ----------------------------------------------------------- experiments */

export function addExperiment(exp) {
  update((s) => s.experiments.push(exp));
}

export function patchExperiment(id, patch) {
  update((s) => {
    const i = s.experiments.findIndex((e) => e.id === id);
    if (i >= 0) s.experiments[i] = { ...s.experiments[i], ...patch };
  });
}

export function removeExperiment(id) {
  update((s) => {
    s.experiments = s.experiments.filter((e) => e.id !== id);
  });
}

export function addReview(review) {
  update((s) => s.reviews.unshift(review));
}

export function setProfile(patch) {
  update((s) => Object.assign(s.profile, patch));
}

export function setTheme(theme) {
  update((s) => (s.theme = theme));
  applyTheme(theme);
}

export function applyTheme(theme = state.theme) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/* ---------------------------------------------------------------- photos */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Photos are downscaled before they are stored. A modern phone camera file is
 * 3 to 6 MB, and a progress photo needs to answer one question: has the shape
 * changed. 1280px on the long edge answers it at about 150 KB.
 */
export async function storePhoto(file, meta) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  await idb("readwrite", (store) => store.put(blob, id));
  update((s) => s.photos.push({ id, date: todayKey(), ...meta }));
  return id;
}

export const readPhoto = (id) => idb("readonly", (store) => store.get(id));

export async function deletePhoto(id) {
  await idb("readwrite", (store) => store.delete(id));
  update((s) => {
    s.photos = s.photos.filter((p) => p.id !== id);
  });
}

/* ---------------------------------------------------------------- export */

export async function exportAll() {
  const photos = {};
  for (const p of state.photos) {
    const blob = await readPhoto(p.id);
    if (blob) photos[p.id] = await blobToDataUrl(blob);
  }
  return JSON.stringify({ exportedAt: new Date().toISOString(), state, photos }, null, 2);
}

export async function importAll(json) {
  const parsed = JSON.parse(json);
  if (!parsed.state?.v) throw new Error("That file is not a Blueprint export.");
  for (const [id, dataUrl] of Object.entries(parsed.photos ?? {})) {
    await idb("readwrite", (store) => store.put(dataUrlToBlob(dataUrl), id));
  }
  state = { ...blankState(), ...parsed.state };
  persist();
  listeners.forEach((fn) => fn(state));
}

export async function wipeAll() {
  localStorage.removeItem(KEY);
  await idb("readwrite", (store) => store.clear());
  state = blankState();
  persist();
  listeners.forEach((fn) => fn(state));
}

const blobToDataUrl = (blob) =>
  new Promise((res) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.readAsDataURL(blob);
  });

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
