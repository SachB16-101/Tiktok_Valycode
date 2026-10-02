/**
 * Library.
 *
 * Every habit in the corpus, what tier it sits in, and why. This is the
 * screen that makes the app defensible: nothing is on the daily list without
 * a reason you can read, and the unproven items are labelled as unproven
 * rather than quietly mixed in.
 *
 * Filtering is by tier rather than by body part, because the tier is the
 * thing most habit trackers hide.
 */

import { EVIDENCE, GROUPS, HABITS, TIERS } from "../habits.js";
import { toggleActive } from "../store.js";
import { habitAdherence } from "../score.js";
import { h, icon, habitSheet, tierBadge, empty } from "../ui.js";

let filter = "all";
let query = "";

const FILTERS = [
  ["all", "All"],
  ["foundation", "Foundation"],
  ["compounding", "Compounding"],
  ["experimental", "Experimental"],
  ["on", "Switched on"],
];

export function library(state, rerender) {
  const active = new Set(state.active ?? []);
  const view = h("div.view");

  const search = h("input", {
    type: "text",
    value: query,
    placeholder: "Search habits",
    "aria-label": "Search habits",
    oninput: (e) => {
      query = e.target.value;
      const at = e.target.selectionStart;
      rerender();
      const next = document.querySelector('input[aria-label="Search habits"]');
      next?.focus();
      next?.setSelectionRange(at, at);
    },
  });

  view.append(
    h(
      "section.block",
      h("h2", "Library"),
      h(
        "p.lede",
        `${HABITS.length} habits. ${active.size} switched on. Tier decides how much a habit is worth in the daily score, ` +
          "and experimental habits are worth nothing on purpose."
      ),
      search,
      h(
        "div.chiprow",
        { style: { marginTop: "12px" } },
        ...FILTERS.map(([id, label]) =>
          h(
            "button.chip",
            {
              "aria-pressed": filter === id ? "true" : "false",
              onclick: () => {
                filter = id;
                rerender();
              },
            },
            label
          )
        )
      )
    )
  );

  const matches = HABITS.filter((habit) => {
    if (filter === "on" && !active.has(habit.id)) return false;
    if (filter !== "all" && filter !== "on" && habit.tier !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      habit.name.toLowerCase().includes(q) ||
      habit.short.toLowerCase().includes(q) ||
      (habit.why ?? habit.claim ?? "").toLowerCase().includes(q)
    );
  });

  if (!matches.length) {
    view.append(h("div.panel", empty("books", "Nothing matches", "Try a different filter or clear the search.")));
    return view;
  }

  for (const group of GROUPS) {
    const rows = matches.filter((x) => x.group === group.id);
    if (!rows.length) continue;
    view.append(
      h(
        "section.block",
        h("h2", group.label),
        h("div.panel.rows", ...rows.map((habit) => libraryRow(state, habit, active.has(habit.id), rerender)))
      )
    );
  }

  return view;
}

function libraryRow(state, habit, on, rerender) {
  const stats = on ? habitAdherence(state, habit.id, 28) : null;

  return h(
    "div.hrow",
    { class: TIERS[habit.tier].scored ? "" : "experimental" },
    h(
      "button.hbody",
      {
        style: { background: "none", textAlign: "left", padding: 0 },
        onclick: () =>
          habitSheet(habit, [
            h(
              "button.btn.full",
              {
                onclick: (e) => {
                  toggleActive(habit.id);
                  e.target.closest(".sheet")?.previousSibling?.click();
                  rerender();
                },
              },
              icon(on ? "x" : "plus"),
              on ? "Switch off" : "Switch on"
            ),
          ]),
      },
      h("div.hname", habit.name, tierBadge(habit.tier)),
      h(
        "div.hsub",
        stats ? `${EVIDENCE[habit.evidence].label}. ${stats.pct}% over 28 days` : `${EVIDENCE[habit.evidence].label}. ${habit.short}`
      )
    ),
    h(
      "button.toggle",
      {
        "aria-pressed": on ? "true" : "false",
        "aria-label": `${on ? "Switch off" : "Switch on"} ${habit.name}`,
        onclick: () => {
          toggleActive(habit.id);
          rerender();
        },
      },
      h("i")
    )
  );
}
