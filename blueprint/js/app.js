/**
 * Shell and router.
 *
 * Full repaint on every state change. The largest screen is about 400 nodes,
 * which is well inside a frame, and it removes a whole class of bug where the
 * view and the log disagree about what you ticked.
 */

import { DEFAULT_ACTIVE } from "./habits.js";
import { applyTheme, getState, onQuotaError, subscribe, todayKey, update } from "./store.js";
import { h, icon, openSheet, fmtDate, clear } from "./ui.js";
import { today, resetDay } from "./views/today.js";
import { body } from "./views/body.js";
import { trials } from "./views/trials.js";
import { library } from "./views/library.js";
import { settings, reviewDue } from "./views/settings.js";

const TABS = [
  { id: "today", label: "Today", icon: "calendar-check", render: today },
  { id: "body", label: "Body", icon: "ruler", render: body },
  { id: "trials", label: "Trials", icon: "flask", render: trials },
  { id: "library", label: "Library", icon: "books", render: library },
];

const ROUTES = [...TABS, { id: "settings", label: "Settings", icon: "gear", render: settings }];

let route = "today";

const main = document.getElementById("main");
const tabbar = document.getElementById("tabbar");
const titleEl = document.getElementById("title");
const dateEl = document.getElementById("date");
const gear = document.getElementById("gear");

function go(id) {
  route = id;
  if (id === "today") resetDay();
  window.scrollTo({ top: 0 });
  render();
}

function render() {
  const state = getState();
  const current = ROUTES.find((r) => r.id === route) ?? ROUTES[0];

  titleEl.textContent = current.id === "today" ? "Blueprint" : current.label;
  dateEl.textContent = current.id === "today" ? fmtDate(todayKey()) : "";
  gear.setAttribute("aria-pressed", route === "settings" ? "true" : "false");

  clear(main);
  const view = current.render(state, render);

  // The review prompt belongs where you will see it, not buried in settings.
  if (current.id === "today") {
    const { due, since } = reviewDue(state);
    if (due) {
      view.insertBefore(
        h(
          "button.panel",
          {
            style: { display: "block", width: "100%", textAlign: "left", padding: "14px 16px" },
            onclick: () => go("settings"),
          },
          h("div", { style: { fontSize: "14px", fontWeight: 600, letterSpacing: "-0.02em" } }, "Four week review is due"),
          h(
            "div",
            { style: { fontSize: "13px", color: "var(--text-2)", marginTop: "3px", lineHeight: "1.5" } },
            `${since} days since the last one. Compare the photos, then change one thing.`
          )
        ),
        view.firstChild?.nextSibling ?? null
      );
    }
  }

  main.append(view);
  paintTabs();
}

function paintTabs() {
  clear(tabbar);
  for (const tab of TABS) {
    tabbar.append(
      h(
        "button",
        {
          role: "tab",
          "aria-selected": route === tab.id ? "true" : "false",
          onclick: () => go(tab.id),
        },
        icon(tab.icon),
        h("span", tab.label)
      )
    );
  }
}

/* ---------------------------------------------------------------- boot */

function boot() {
  const state = getState();

  // First run: switch on the default set rather than opening to an empty list.
  if (state.active === null) {
    update((s) => {
      s.active = [...DEFAULT_ACTIVE];
    });
  }

  applyTheme();

  onQuotaError(() =>
    openSheet(() => [
      h("h2", "Storage is full"),
      h(
        "p",
        "This device will not accept any more data. Export your log from Settings, then delete some photos to free space. Photos are much larger than everything else combined."
      ),
    ])
  );

  gear.addEventListener("click", () => go(route === "settings" ? "today" : "settings"));

  subscribe(() => {});
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline caching is a bonus. The app runs fine without it.
    });
  }
}

boot();
