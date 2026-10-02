/**
 * Today.
 *
 * The screen that has to work at 7am. Two rules shape it:
 *
 *   Graded habits are grouped by life area, because that is the order you
 *   actually do them in, and each row wears its tier so the weighting is
 *   never a secret.
 *
 *   Experimental habits sit in their own block at the bottom, under a heading
 *   that says they do not count. They are logged in full. They just cannot
 *   make a bad week look like a good one.
 */

import { BY_ID, GROUPS, TIERS, targetFor } from "../habits.js";
import { dayLog, dayOffset, setEntry, todayKey } from "../store.js";
import { adherence, dayScore, dueOn, isMet, weeksAtThree, history } from "../score.js";
import { h, icon, habitSheet, openSheet, fmtDate, empty, note } from "../ui.js";

let viewing = todayKey();

export function resetDay() {
  viewing = todayKey();
}

export function today(state, rerender) {
  const key = viewing;
  const log = state.log[key] ?? {};
  const bw = state.profile.bodyweightKg;
  const due = dueOn(state, key);
  const score = dayScore(state, key);

  const graded = due.filter((x) => TIERS[x.tier].scored);
  const trials = due.filter((x) => !TIERS[x.tier].scored);

  const view = h("div.view");
  view.append(dateStrip(key, rerender));

  if (due.length === 0) {
    view.append(
      h(
        "div.panel",
        empty(
          "circle-dashed",
          "Nothing switched on yet",
          "Open the Library and turn on the habits you are actually running. Twelve are on by default."
        )
      )
    );
    return view;
  }

  view.append(scorePanel(state, score, key));

  for (const group of GROUPS) {
    const rows = graded.filter((x) => x.group === group.id);
    if (!rows.length) continue;
    view.append(
      h(
        "section.block",
        h("h2", group.label),
        h("div.panel.rows", ...rows.map((habit) => habitRow(habit, log[habit.id], bw, key, rerender)))
      )
    );
  }

  if (trials.length) {
    view.append(
      h(
        "section.block",
        h("h2", "Tracked, not scored"),
        h(
          "p.lede",
          "The evidence for these does not hold up, or holds up for something other than what it is sold for. " +
            "They are logged so you can see what you did. They do not move the number above."
        ),
        h("div.panel.rows", ...trials.map((habit) => habitRow(habit, log[habit.id], bw, key, rerender)))
      )
    );
  }

  return view;
}

/* ------------------------------------------------------------------- */

function dateStrip(key, rerender) {
  const isToday = key === todayKey();
  const go = (delta) => () => {
    const next = dayOffset(key, delta);
    if (next > todayKey()) return;
    viewing = next;
    rerender();
  };

  return h(
    "div",
    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
    h("button.btn.quiet", { onclick: go(-1), "aria-label": "Previous day" }, icon("caret-left")),
    h(
      "div",
      { style: { textAlign: "center" } },
      h("div", { style: { fontSize: "14px", fontWeight: 600, letterSpacing: "-0.02em" } },
        isToday ? "Today" : fmtDate(key)),
      !isToday &&
        h("button.btn.quiet", { onclick: () => { viewing = todayKey(); rerender(); },
          style: { minHeight: "24px", fontSize: "12px" } }, "Back to today")
    ),
    h("button.btn.quiet", { onclick: go(1), disabled: isToday, "aria-label": "Next day" }, icon("caret-right"))
  );
}

function scorePanel(state, score, key) {
  const pct = score.pct ?? 0;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("class", "ring");
  ring.setAttribute("viewBox", "0 0 68 68");
  ring.innerHTML =
    `<circle class="track" cx="34" cy="34" r="${radius}"></circle>` +
    `<circle class="fill" cx="34" cy="34" r="${radius}" stroke-dasharray="${circumference}" ` +
    `stroke-dashoffset="${circumference * (1 - pct / 100)}"></circle>`;

  const d7 = adherence(state, 7);
  const d28 = adherence(state, 28);
  const weeks = weeksAtThree(state);

  return h(
    "div.panel",
    h(
      "div.score",
      ring,
      h(
        "div",
        h("div.score-figure", String(pct), h("sup", "%")),
        h(
          "div.score-label",
          `${score.earned} of ${score.possible} weighted points. ` +
            (score.tally.foundation[1]
              ? `Foundation ${score.tally.foundation[0]}/${score.tally.foundation[1]}.`
              : "")
        )
      )
    ),
    h(
      "dl.stats",
      h("div", h("dt", "7 day"), h("dd", d7 === null ? "-" : `${d7}%`)),
      h("div", h("dt", "28 day"), h("dd", d28 === null ? "-" : `${d28}%`)),
      h("div", h("dt", "Weeks at 3+"), h("dd", String(weeks)))
    ),
    sparkline(state, key)
  );
}

function sparkline(state, key) {
  const days = history(state, 28, key);
  return h(
    "div",
    h(
      "div.spark",
      ...days.map((d) =>
        h("span", {
          class: d.pct === null || !d.logged ? "off" : "",
          style: { height: `${Math.max(4, ((d.logged ? d.pct : 0) ?? 0) * 0.34 + 4)}px` },
          title: `${d.key}: ${d.logged ? (d.pct ?? 0) + "%" : "not logged"}`,
        })
      )
    ),
    h("div.axis", h("span", "28 days ago"), h("span", "now"))
  );
}

/* --------------------------------------------------------------- a row */

function habitRow(habit, entry, bw, key, rerender) {
  const met = isMet(habit, entry, bw);
  const target = targetFor(habit, bw);

  const row = h("div.hrow", {
    class: TIERS[habit.tier].scored ? "" : "experimental",
    "aria-pressed": met ? "true" : "false",
  });

  const tick = h("button.tick", {
    "aria-label": `${met ? "Undo" : "Complete"} ${habit.name}`,
    onclick: (e) => {
      e.stopPropagation();
      if (habit.input) openNumberSheet(habit, entry, bw, key, rerender);
      else {
        setEntry(habit.id, !met, key);
        rerender();
      }
    },
  }, icon("check"));

  const body = h(
    "button.hbody",
    {
      style: { background: "none", textAlign: "left", padding: 0 },
      onclick: () => (habit.input ? openNumberSheet(habit, entry, bw, key, rerender) : habitSheet(habit)),
    },
    h("div.hname", habit.name, habit.tier === "foundation" ? h("span.tier.foundation", "Core") : null),
    h("div.hsub", habit.input && target ? `Target ${target} ${habit.input.unit}` : habit.short)
  );

  row.append(tick, body);

  if (habit.input) {
    row.append(
      h(
        "div.hval",
        { class: entry === undefined ? "none" : "" },
        h("b", entry === undefined ? "-" : String(entry)),
        habit.input.unit
      )
    );
  }

  row.append(
    h("button.info", { "aria-label": `About ${habit.name}`, onclick: () => habitSheet(habit) }, icon("info"))
  );

  return row;
}

function openNumberSheet(habit, entry, bw, key, rerender) {
  const target = targetFor(habit, bw);
  let value = entry ?? "";

  openSheet((close) => {
    const input = h("input", {
      type: "number",
      inputmode: "decimal",
      step: habit.input.step ?? 1,
      min: 0,
      max: habit.input.max ?? 100000,
      value: String(value),
      id: `n-${habit.id}`,
    });

    const save = (raw) => {
      const n = Number(raw);
      setEntry(habit.id, Number.isFinite(n) && raw !== "" ? n : false, key);
      close();
      rerender();
    };

    const quick = [target, Math.round(target * 1.25), Math.round(target * 0.75)]
      .filter((n, i, arr) => n > 0 && arr.indexOf(n) === i)
      .sort((a, b) => a - b);

    return [
      h("h2", habit.name),
      h("div.meta", h("span.ev", `Floor ${target} ${habit.input.unit}`)),
      h(
        "div.field",
        { style: { marginTop: "14px" } },
        h("label", { for: `n-${habit.id}` }, `How much ${habit.input.unit === "steps" ? "" : "in " + habit.input.unit}`.trim()),
        input,
        h("div.help", habit.input.mode === "floor" ? "Clear the floor. Going far above it does not score higher." : "")
      ),
      h("div.chiprow", ...quick.map((n) => h("button.chip", { onclick: () => save(n) }, `${n} ${habit.input.unit}`))),
      h(
        "div.actions",
        h("button.btn.full", { onclick: () => save(input.value) }, icon("check"), "Save"),
        entry !== undefined &&
          h("button.btn.ghost.full", { onclick: () => save("") }, "Clear today"),
        h("button.btn.quiet", { onclick: () => { close(); habitSheet(habit); } }, "Why this habit")
      ),
    ];
  });
}
