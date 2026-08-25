/**
 * Trials.
 *
 * The answer to "but he has case studies". A case study is the weakest
 * evidence there is: self-selected, self-reported, uncontrolled, and
 * photographed by the person selling the outcome. You cannot run a controlled
 * trial on yourself, but you can fix the four things that make a personal
 * result worth anything:
 *
 *   1. A baseline recorded before you start, and locked afterwards.
 *   2. An endpoint written down in advance, so the goalposts cannot move.
 *   3. A fixed duration, so it ends whether or not you like the answer.
 *   4. Adherence measured alongside the result, because "it did not work"
 *      and "I did it nine times" are different findings.
 *
 * Run one at a time. Change five things and you learn nothing about any of
 * them, which is the one-variable rule the review screen also enforces.
 */

import { BY_ID, HABITS, TIERS } from "../habits.js";
import { addExperiment, dayOffset, daysBetween, patchExperiment, removeExperiment, storePhoto, readPhoto, todayKey } from "../store.js";
import { experimentAdherence } from "../score.js";
import { h, icon, openSheet, fmtDate, fmtShort, empty, note, uid, habitSheet } from "../ui.js";

const DURATIONS = [
  { weeks: 8, label: "8 weeks", hint: "Enough for skin and sleep changes" },
  { weeks: 12, label: "12 weeks", hint: "Enough for body composition" },
  { weeks: 16, label: "16 weeks", hint: "The minimum honest window for a structural claim" },
];

export function trials(state, rerender) {
  const view = h("div.view");
  const running = state.experiments.filter((e) => e.status === "running");
  const done = state.experiments.filter((e) => e.status !== "running");

  view.append(
    h(
      "section.block",
      h("h2", "Trials"),
      h(
        "p.lede",
        "Take any habit whose evidence does not hold up, and find out whether it works on you. " +
          "Baseline locked before you start, endpoint written down in advance, adherence reported with the result."
      ),
      h("button.btn.full", { onclick: () => openNewTrial(state, rerender) }, icon("flask"), "Start a trial")
    )
  );

  if (running.length > 1) {
    view.append(
      note(
        `${running.length} trials running at once. Whatever happens, you will not know which one caused it. One at a time is the whole method.`,
        "warn"
      )
    );
  }

  if (running.length) {
    view.append(
      h("section.block", h("h2", "Running"), h("div.panel.rows", ...running.map((e) => trialRow(state, e, rerender))))
    );
  }

  if (done.length) {
    view.append(
      h("section.block", h("h2", "Finished"), h("div.panel.rows", ...done.map((e) => trialRow(state, e, rerender))))
    );
  }

  if (!running.length && !done.length) {
    view.append(
      h(
        "div.panel",
        empty(
          "flask",
          "No trials yet",
          "Thumbpulling, mewing, hard gum, cold showers. Pick the one you most want to be true and give it a fair test."
        )
      )
    );
  }

  return view;
}

function trialRow(state, exp, rerender) {
  const habit = BY_ID[exp.habitId];
  const adherence = experimentAdherence(state, exp);
  const elapsed = daysBetween(exp.startDate, todayKey());
  const total = daysBetween(exp.startDate, exp.endDate);
  const finished = todayKey() >= exp.endDate;

  return h(
    "button.hrow",
    { onclick: () => openTrial(state, exp, rerender) },
    h(
      "div.hbody",
      h("div.hname", habit?.name ?? exp.habitId,
        exp.status === "complete" ? h("span.tier.compounding", verdictWord(exp.result?.verdict)) : null),
      h(
        "div.hsub",
        exp.status === "running"
          ? finished
            ? "Ready to close out"
            : `Day ${Math.max(1, elapsed + 1)} of ${total + 1}, ${adherence.pct}% adherence`
          : `${fmtShort(exp.startDate)} to ${fmtShort(exp.endDate)}, ${exp.result?.adherencePct ?? adherence.pct}% adherence`
      )
    ),
    h(
      "div.hval",
      exp.status === "running"
        ? h("b", finished ? "Due" : `${Math.max(0, total - elapsed)}d`)
        : h("b", verdictWord(exp.result?.verdict))
    ),
    icon("caret-right", "info")
  );
}

const verdictWord = (v) => (v === "yes" ? "Worked" : v === "no" ? "No effect" : v === "unclear" ? "Unclear" : "Open");

/* ----------------------------------------------------------- new trial */

function openNewTrial(state, rerender) {
  const candidates = HABITS.filter((x) => !TIERS[x.tier].scored || x.evidence === "contested");
  const alreadyRunning = new Set(
    state.experiments.filter((e) => e.status === "running").map((e) => e.habitId)
  );

  openSheet((close) => [
    h("h2", "What are you testing?"),
    h(
      "p",
      "These are the habits whose stated mechanism does not hold up, or holds up for something other than what it is sold for. A trial is how you find out what it does for you."
    ),
    h(
      "div.panel.rows",
      { style: { marginTop: "16px" } },
      ...candidates.map((habit) =>
        h(
          "button.hrow",
          {
            disabled: alreadyRunning.has(habit.id),
            onclick: () => {
              close();
              openTrialSetup(habit, state, rerender);
            },
          },
          h(
            "div.hbody",
            h("div.hname", habit.name),
            h("div.hsub", alreadyRunning.has(habit.id) ? "Already running" : habit.short)
          ),
          icon("caret-right", "info")
        )
      )
    ),
  ]);
}

function openTrialSetup(habit, state, rerender) {
  let weeks = 12;

  openSheet((close) => {
    const question = h("textarea", {
      id: "t-q",
      value: habit.claim ?? `Does ${habit.name.toLowerCase()} do anything measurable for me?`,
    });
    const endpoint = h("textarea", {
      id: "t-e",
      placeholder: suggestEndpoint(habit),
    });
    const baselineNote = h("textarea", {
      id: "t-b",
      placeholder: "Where you are starting from, in your own words. Be specific enough that you cannot argue with it later.",
    });
    const err = h("div.err");

    const durationRow = h(
      "div.chiprow",
      ...DURATIONS.map((d) =>
        h(
          "button.chip",
          {
            "aria-pressed": d.weeks === weeks ? "true" : "false",
            onclick: (e) => {
              weeks = d.weeks;
              [...durationRow.children].forEach((c) =>
                c.setAttribute("aria-pressed", c === e.currentTarget ? "true" : "false")
              );
              hint.textContent = d.hint;
            },
          },
          d.label
        )
      )
    );
    const hint = h("div.help", DURATIONS.find((d) => d.weeks === weeks).hint);

    return [
      h("h2", habit.name),
      h("div.meta", h("span.tier.experimental", "Experimental"), h("span.ev", "The claim, tested")),

      habit.counter && h("div.claim.counter", h("div.who", "What the evidence says now"), h("p", habit.counter)),

      h(
        "div",
        { style: { marginTop: "20px" } },
        h("div.field", h("label", { for: "t-q" }, "The claim you are testing"), question),
        h(
          "div.field",
          h("label", { for: "t-e" }, "What would count as it working"),
          endpoint,
          h(
            "div.help",
            "Write this before you start. An endpoint decided afterwards is how every before-and-after on the internet gets made."
          ),
          err
        ),
        h("div.field", h("label", {}, "How long"), durationRow, hint),
        h(
          "div.field",
          h("label", { for: "t-b" }, "Baseline"),
          baselineNote,
          h("div.help", "Locked once the trial starts. Add baseline photos on the Body screen today, in the light you can reproduce.")
        )
      ),

      habit.caution && h("div.caution", h("strong", "Caution. "), habit.caution),

      h(
        "div.actions",
        h(
          "button.btn.full",
          {
            onclick: () => {
              if (!endpoint.value.trim()) {
                err.textContent = "An endpoint is the one field that cannot be skipped. Without it the trial cannot fail.";
                endpoint.focus();
                return;
              }
              const start = todayKey();
              addExperiment({
                id: uid("ex"),
                habitId: habit.id,
                question: question.value.trim(),
                endpoint: endpoint.value.trim(),
                weeks,
                startDate: start,
                endDate: dayOffset(start, weeks * 7),
                baseline: {
                  note: baselineNote.value.trim(),
                  waist: latestWaist(state),
                  recordedAt: start,
                },
                status: "running",
              });
              close();
              rerender();
            },
          },
          icon("flask"),
          "Lock the baseline and start"
        ),
        h("button.btn.quiet", { onclick: () => { close(); habitSheet(habit); } }, "Read the evidence first")
      ),
    ];
  });
}

function suggestEndpoint(habit) {
  if (habit.group === "face")
    return "For example: side-profile photo in the same light shows a change a friend can pick out blind, at 16 weeks.";
  if (habit.id === "cold-shower") return "For example: I feel better in the two hours after, on most days I do it.";
  return "For example: a change I can point to in a photo or a number, not a feeling I have on the day.";
}

const latestWaist = (state) => {
  const last = [...state.measures].reverse().find((m) => m.waist != null);
  return last?.waist ?? null;
};

/* ---------------------------------------------------------- open trial */

function openTrial(state, exp, rerender) {
  const habit = BY_ID[exp.habitId];
  const adherence = experimentAdherence(state, exp);
  const finished = todayKey() >= exp.endDate;

  openSheet((close) => {
    const parts = [
      h("h2", habit?.name ?? exp.habitId),
      h(
        "div.meta",
        h("span.ev", `${fmtShort(exp.startDate)} to ${fmtShort(exp.endDate)}`),
        h("span.ev", `${adherence.pct}% adherence`)
      ),
      h("div.claim", h("div.who", "Testing"), h("p", exp.question)),
      h("div.claim.counter", h("div.who", "Endpoint, set in advance"), h("p", exp.endpoint)),
    ];

    if (exp.baseline?.note || exp.baseline?.waist != null) {
      parts.push(
        h(
          "div.claim",
          h("div.who", `Baseline, locked ${fmtShort(exp.baseline.recordedAt ?? exp.startDate)}`),
          h(
            "p",
            [exp.baseline.note, exp.baseline.waist != null ? `Waist ${exp.baseline.waist} cm.` : null]
              .filter(Boolean)
              .join(" ")
          )
        )
      );
    }

    if (exp.status === "running") {
      parts.push(
        h(
          "div",
          { style: { marginTop: "16px" } },
          note(
            `Logged on ${adherence.hit} of ${adherence.seen} days so far. Whatever the result, it is only worth as much as this number.`
          )
        )
      );

      parts.push(
        h(
          "div.actions",
          finished
            ? h("button.btn.full", { onclick: () => { close(); openCloseOut(state, exp, rerender); } }, icon("seal-check"), "Close it out")
            : h(
                "button.btn.ghost.full",
                { disabled: true },
                icon("clock"),
                `${daysBetween(todayKey(), exp.endDate)} days to go`
              ),
          h(
            "button.btn.quiet",
            {
              onclick: () => {
                patchExperiment(exp.id, { status: "abandoned", result: { verdict: "unclear", note: "Stopped early.", adherencePct: adherence.pct } });
                close();
                rerender();
              },
            },
            "Stop early"
          )
        )
      );
    } else {
      parts.push(
        h("div.claim", h("div.who", `Result, ${verdictWord(exp.result?.verdict).toLowerCase()}`), h("p", exp.result?.note || "No note recorded.")),
        h(
          "div.actions",
          h("button.btn.ghost.full", { onclick: () => { removeExperiment(exp.id); close(); rerender(); } }, icon("trash"), "Delete this trial")
        )
      );
    }

    return parts;
  });
}

function openCloseOut(state, exp, rerender) {
  const habit = BY_ID[exp.habitId];
  const adherence = experimentAdherence(state, exp);
  let verdict = null;

  openSheet((close) => {
    const noteField = h("textarea", { id: "r-note", placeholder: "What actually changed, against the endpoint you wrote at the start." });
    const err = h("div.err");

    const row = h(
      "div.chiprow",
      ...[
        ["yes", "It worked"],
        ["no", "No effect"],
        ["unclear", "Cannot tell"],
      ].map(([value, label]) =>
        h(
          "button.chip",
          {
            onclick: (e) => {
              verdict = value;
              [...row.children].forEach((c) => c.setAttribute("aria-pressed", c === e.currentTarget ? "true" : "false"));
            },
          },
          label
        )
      )
    );

    return [
      h("h2", "Close out the trial"),
      h("div.claim.counter", h("div.who", "The endpoint you set on day one"), h("p", exp.endpoint)),
      adherence.pct < 70
        ? h(
            "div.caution",
            h("strong", "Low adherence. "),
            `You logged this on ${adherence.hit} of ${adherence.seen} days. That is not enough to call it either way, and saying so is a more useful result than pretending otherwise.`
          )
        : null,
      h(
        "div",
        { style: { marginTop: "18px" } },
        h("div.field", h("label", {}, "Against that endpoint"), row, err),
        h("div.field", h("label", { for: "r-note" }, "What changed"), noteField)
      ),
      h(
        "div.actions",
        h(
          "button.btn.full",
          {
            onclick: () => {
              if (!verdict) {
                err.textContent = "Pick one. Cannot tell is a legitimate answer.";
                return;
              }
              patchExperiment(exp.id, {
                status: "complete",
                result: {
                  verdict,
                  note: noteField.value.trim(),
                  adherencePct: adherence.pct,
                  closedAt: todayKey(),
                  waist: latestWaist(state),
                },
              });
              close();
              rerender();
            },
          },
          icon("seal-check"),
          "Record the result"
        )
      ),
    ];
  });
}
