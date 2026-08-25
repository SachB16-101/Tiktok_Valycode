/**
 * Settings, reviews, and the data you own.
 *
 * The review is the part that matters. Every four weeks the app asks what you
 * are changing, and lets you name exactly one thing. Changing five variables
 * at once is why most people cannot tell you which of their habits does
 * anything, and it is the difference between a tracker and a diary.
 */

import { HABITS } from "../habits.js";
import {
  addReview,
  daysBetween,
  exportAll,
  importAll,
  setProfile,
  setTheme,
  todayKey,
  wipeAll,
} from "../store.js";
import { adherence, weeklySessions } from "../score.js";
import { h, icon, openSheet, fmtDate, note, uid } from "../ui.js";

export function settings(state, rerender) {
  const view = h("div.view");

  view.append(reviewSection(state, rerender));
  view.append(profileSection(state, rerender));
  view.append(themeSection(state, rerender));
  view.append(dataSection(state, rerender));
  view.append(careSection());

  return view;
}

/* -------------------------------------------------------------- review */

export function reviewDue(state) {
  const last = state.reviews[0];
  const since = daysBetween(last?.date ?? state.profile.startedAt, todayKey());
  return { due: since >= 28, since };
}

function reviewSection(state, rerender) {
  const { due, since } = reviewDue(state);
  const panel = h("div.panel");

  panel.append(
    h(
      "div",
      { style: { padding: "16px" } },
      h(
        "p",
        { style: { fontSize: "13.5px", color: "var(--text-2)", lineHeight: "1.6" } },
        due
          ? `${since} days since your last review. Compare against your first photos and your first waist measurement, then change one thing.`
          : `Next review in ${28 - since} days. Until then, run what you have.`
      ),
      h(
        "div",
        { style: { marginTop: "14px" } },
        h(
          "button.btn.full",
          { onclick: () => openReview(state, rerender), disabled: !due },
          icon("arrow-counter-clockwise"),
          due ? "Run the review" : "Not due yet"
        )
      )
    )
  );

  if (state.reviews.length) {
    panel.append(
      h(
        "div.rows",
        { style: { borderTop: "1px solid var(--line)" } },
        ...state.reviews.slice(0, 6).map((review) =>
          h(
            "div.hrow",
            h(
              "div.hbody",
              h("div.hname", review.change),
              h("div.hsub", `${fmtDate(review.date)}. ${review.note || "No note"}`)
            )
          )
        )
      )
    );
  }

  return h(
    "section.block",
    h("h2", "Four week review"),
    h("p.lede", "One variable at a time. Not five."),
    panel
  );
}

function openReview(state, rerender) {
  let choice = null;

  openSheet((close) => {
    const d28 = adherence(state, 28);
    const sessions = weeklySessions(state, 4);
    const noteField = h("textarea", { id: "rv-note", placeholder: "What the photos and the tape measure actually show." });
    const change = h("input", { type: "text", id: "rv-change", placeholder: "The one thing you are changing" });
    const err = h("div.err");

    return [
      h("h2", "Four week review"),
      h(
        "dl.stats",
        { style: { border: "1px solid var(--line)", borderRadius: "var(--r-surface)", marginTop: "16px" } },
        h("div", h("dt", "28 day"), h("dd", d28 === null ? "-" : `${d28}%`)),
        h("div", h("dt", "Sessions"), h("dd", sessions.join(" "))),
        h("div", h("dt", "Trials"), h("dd", String(state.experiments.filter((e) => e.status === "running").length)))
      ),
      h(
        "p",
        { style: { marginTop: "16px" } },
        "Compare this month's photos against week one, not against the mirror. Then pick one variable."
      ),
      h(
        "div",
        { style: { marginTop: "16px" } },
        h("div.field", h("label", { for: "rv-change" }, "The one change"), change,
          h("div.help", "Add a habit, drop a habit, adjust a target, or start a trial. One of them."), err),
        h("div.field", h("label", { for: "rv-note" }, "What you are seeing"), noteField)
      ),
      h(
        "div.actions",
        h(
          "button.btn.full",
          {
            onclick: () => {
              if (!change.value.trim()) {
                err.textContent = "Name the change. If nothing is changing, write that.";
                return;
              }
              addReview({
                id: uid("rv"),
                date: todayKey(),
                change: change.value.trim(),
                note: noteField.value.trim(),
                adherence: d28,
              });
              close();
              rerender();
            },
          },
          icon("check"),
          "Log the review"
        )
      ),
    ];
  });
}

/* ------------------------------------------------------------- profile */

function profileSection(state, rerender) {
  const weight = h("input", {
    type: "number",
    inputmode: "decimal",
    step: 0.5,
    value: String(state.profile.bodyweightKg),
    id: "p-weight",
    onchange: (e) => {
      const n = Number(e.target.value);
      if (n > 25 && n < 300) {
        setProfile({ bodyweightKg: n });
        rerender();
      }
    },
  });

  const wake = h("input", {
    type: "time",
    value: state.profile.wakeTime,
    id: "p-wake",
    onchange: (e) => setProfile({ wakeTime: e.target.value }),
  });

  return h(
    "section.block",
    h("h2", "You"),
    h(
      "div.panel",
      { style: { padding: "16px" } },
      h(
        "div.field",
        h("label", { for: "p-weight" }, "Bodyweight in kg"),
        weight,
        h(
          "div.help",
          `Sets your protein floor at ${Math.round(state.profile.bodyweightKg * 2)} g and your fat floor at ${Math.round(
            state.profile.bodyweightKg * 0.8
          )} g.`
        )
      ),
      h(
        "div.field",
        { style: { marginBottom: 0 } },
        h("label", { for: "p-wake" }, "Wake time"),
        wake,
        h("div.help", "The keystone. Everything else keys off holding this, including at weekends.")
      )
    )
  );
}

function themeSection(state, rerender) {
  const options = [
    ["auto", "System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ];

  return h(
    "section.block",
    h("h2", "Appearance"),
    h(
      "div.panel",
      { style: { padding: "16px" } },
      h(
        "div.chiprow",
        ...options.map(([id, label]) =>
          h(
            "button.chip",
            {
              "aria-pressed": (state.theme ?? "auto") === id ? "true" : "false",
              onclick: () => {
                setTheme(id);
                rerender();
              },
            },
            label
          )
        )
      )
    )
  );
}

/* ---------------------------------------------------------------- data */

function dataSection(state, rerender) {
  const days = Object.keys(state.log).length;

  const importInput = h("input", {
    type: "file",
    accept: "application/json",
    class: "hidden",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importAll(await file.text());
        rerender();
      } catch (err) {
        openSheet(() => [h("h2", "Could not import"), h("p", err.message)]);
      }
    },
  });

  const download = async () => {
    const json = await exportAll();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = h("a", { href: url, download: `blueprint-${todayKey()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return h(
    "section.block",
    h("h2", "Your data"),
    h(
      "p.lede",
      `${days} days logged, ${state.photos.length} photos, ${state.measures.length} measurements. All of it lives on this device only. Nothing is uploaded and there is no account.`
    ),
    h(
      "div.panel",
      { style: { padding: "16px", display: "grid", gap: "10px" } },
      h("button.btn.ghost.full", { onclick: download }, icon("download-simple"), "Export everything"),
      h("button.btn.ghost.full", { onclick: () => importInput.click() }, icon("upload-simple"), "Import a backup"),
      importInput,
      h(
        "button.btn.danger.full",
        {
          onclick: () =>
            openSheet((close) => [
              h("h2", "Delete everything?"),
              h("p", "Every log, photo, measurement and trial on this device. There is no server copy, so this cannot be undone. Export first if you are unsure."),
              h(
                "div.actions",
                h(
                  "button.btn.danger.full",
                  {
                    onclick: async () => {
                      await wipeAll();
                      close();
                      rerender();
                    },
                  },
                  icon("trash"),
                  "Delete it all"
                ),
                h("button.btn.ghost.full", { onclick: close }, "Keep my data")
              ),
            ]),
        },
        icon("trash"),
        "Delete everything"
      )
    )
  );
}

/* ---------------------------------------------------------------- care */

function careSection() {
  return h(
    "section.block",
    h("h2", "Worth knowing"),
    h(
      "div.panel",
      { style: { padding: "16px", display: "grid", gap: "12px" } },
      note(
        "Nothing here is medical advice. Bloods, hair treatments and anything prescription need a GP or a dermatologist who can actually examine you."
      ),
      note(
        "If any of this starts feeling less like a project and more like a compulsion, checking, comparing, avoiding photos or social plans, that is worth talking to someone about. It is common enough in men that there is no novelty in it."
      ),
      h(
        "p",
        { style: { fontSize: "12.5px", color: "var(--text-3)", lineHeight: "1.6" } },
        "The strongest version of this is the one where the metric is your bloods, your lifts and how you feel at 30, and looking good is the side effect. That is not a softer goal. It is the one you will still be running in five years."
      )
    )
  );
}
