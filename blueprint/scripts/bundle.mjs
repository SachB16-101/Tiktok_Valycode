/**
 * Single-file build.
 *
 * Inlines the stylesheet, the fonts as data URIs, and every ES module into one
 * self-contained HTML file. Two reasons this exists:
 *
 *   1. It opens straight off the disk. The dev version needs an http origin
 *      because ES modules and service workers both refuse to load from
 *      file://, which makes "just send me the app" impossible.
 *   2. It can be hosted anywhere that serves a single static file.
 *
 * This is a derived artifact, not a fork. Everything is read from the same
 * source files the dev server uses, so the two cannot drift.
 *
 *   node blueprint/scripts/bundle.mjs
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFile(join(root, p), "utf8");

/* Module order is dependency order. There is no resolver here on purpose:
   the graph is ten files deep and hand-ordering it is honest and debuggable. */
const MODULES = [
  "js/habits.js",
  "js/store.js",
  "js/score.js",
  "js/ui.js",
  "js/views/today.js",
  "js/views/body.js",
  "js/views/trials.js",
  "js/views/library.js",
  "js/views/settings.js",
  "js/app.js",
];

const FONTS = [
  ["fonts/space-grotesk-latin-wght-normal.woff2", "space-grotesk-latin-wght-normal.woff2"],
  ["fonts/ibm-plex-mono-latin-400-normal.woff2", "ibm-plex-mono-latin-400-normal.woff2"],
  ["fonts/ibm-plex-mono-latin-500-normal.woff2", "ibm-plex-mono-latin-500-normal.woff2"],
  ["fonts/ibm-plex-mono-latin-600-normal.woff2", "ibm-plex-mono-latin-600-normal.woff2"],
];

/* ------------------------------------------------------------------ css */

let css = await read("styles.css");
for (const [path, name] of FONTS) {
  const b64 = (await readFile(join(root, path))).toString("base64");
  css = css.replaceAll(`url("fonts/${name}")`, `url("data:font/woff2;base64,${b64}")`);
}
if (css.includes('url("fonts/')) throw new Error("A font reference was left unresolved.");

/* ------------------------------------------------------------------- js */

const IMPORT = /^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm;
const EXPORT = /^(\s*)export\s+(?=(const|let|var|function|async function|class)\b)/gm;

const declared = new Map();
// Anchored at column zero: every top-level declaration in this codebase is
// unindented, so this matches exactly those and skips nested ones.
const NAME = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

let js = "";
for (const path of MODULES) {
  const src = await read(path);

  // Catch a name collision now, loudly, rather than as a runtime shadowing bug.
  for (const match of src.matchAll(NAME)) {
    const name = match[1];
    if (declared.has(name)) {
      throw new Error(`Duplicate top-level name "${name}" in ${path}, already declared in ${declared.get(name)}.`);
    }
    declared.set(name, path);
  }

  js += `\n/* ---- ${path} ---- */\n` + src.replace(IMPORT, "").replace(EXPORT, "$1");
}

// The bundle carries no separate sw.js, so drop the registration rather than
// letting it 404 on every load.
js = js.replace(/if \("serviceWorker" in navigator\) \{[\s\S]*?\n  \}/, "/* service worker omitted from the single-file build */");
if (js.includes("serviceWorker.register")) throw new Error("Service worker registration was not removed.");

/* ----------------------------------------------------------------- html */

let html = await read("index.html");
const sprite = html.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" style="display:none"[\s\S]*?<\/svg>/)[0];
const title = "Blueprint";

const head = `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <meta name="theme-color" content="#f3f5f2" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0b0d0a" media="(prefers-color-scheme: dark)" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Blueprint" />
    <style>${css}</style>`;

const bodyInner = `
    ${sprite}
    <div class="shell">
      <header class="topbar">
        <div>
          <h1 id="title">Blueprint</h1>
          <span class="date" id="date"></span>
        </div>
        <button class="btn quiet" id="gear" aria-label="Settings">
          <svg aria-hidden="true" style="width: 20px; height: 20px"><use href="#i-gear"></use></svg>
        </button>
      </header>
      <main id="main"></main>
    </div>
    <nav class="tabbar" id="tabbar" role="tablist" aria-label="Sections"></nav>
    <script>
      try {
        var saved = JSON.parse(localStorage.getItem("blueprint.state.v1") || "{}").theme;
        if (saved && saved !== "auto") document.documentElement.setAttribute("data-theme", saved);
      } catch (e) {}
    </script>
    <script>
      (function () {
        "use strict";
${js}
      })();
    </script>`;

await mkdir(join(root, "dist"), { recursive: true });

await writeFile(
  join(root, "dist/blueprint.html"),
  `<!doctype html>\n<html lang="en">\n  <head>${head}\n  </head>\n  <body>${bodyInner}\n  </body>\n</html>\n`
);

// The hosted variant is wrapped in its own document shell by the host, so it
// ships as body content with the title and styles at the top.
await writeFile(
  join(root, "dist/blueprint.page.html"),
  `<title>${title}</title>\n<style>${css}</style>${bodyInner}\n`
);

const size = (await readFile(join(root, "dist/blueprint.html"))).length;
console.log(`dist/blueprint.html      ${(size / 1024).toFixed(0)} KB`);
console.log(`dist/blueprint.page.html (hosted variant)`);
console.log(`${MODULES.length} modules, ${declared.size} top-level names, no collisions`);
