/**
 * Body.
 *
 * The feedback loop. Daily ticks tell you what you did; only this screen can
 * tell you whether it worked, which is why the app nags for a monthly waist
 * and a same-light photo rather than for another daily habit.
 *
 * Waist sits above weight on purpose. At the same BMI, South Asians carry
 * more abdominal and ectopic fat, so the scale flatters and the tape measure
 * does not.
 */

import { MEASURES, BLOODS } from "../habits.js";
import { addBloods, addMeasure, deletePhoto, readPhoto, removeMeasure, storePhoto, todayKey } from "../store.js";
import { measureOverdue } from "../score.js";
import { h, icon, openSheet, fmtShort, fmtDate, empty, note, uid } from "../ui.js";

export function body(state, rerender) {
  const view = h("div.view");

  view.append(
    h(
      "section.block",
      h("h2", "Waist at navel"),
      h("p.lede", "The best single number in this app. Measure it on the first of the month, same time of day, standing relaxed."),
      measurePanel(state, "waist", rerender)
    )
  );

  view.append(
    h(
      "section.block",
      h("h2", "Bodyweight"),
      h("p.lede", "A trend, not a verdict. NICE puts the increased-risk BMI threshold at 23 for South Asian adults, not 25."),
      measurePanel(state, "weight", rerender)
    )
  );

  view.append(photosSection(state, rerender));
  view.append(bloodsSection(state, rerender));

  return view;
}

/* ------------------------------------------------------------ measures */

function measurePanel(state, id, rerender) {
  const measure = MEASURES.find((m) => m.id === id);
  const points = state.measures.filter((m) => m[id] != null);
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const status = measureOverdue(state, id, "monthly");

  const panel = h("div.panel");

  if (!latest) {
    panel.append(
      empty(
        "ruler",
        `No ${measure.name.toLowerCase()} logged`,
        "One measurement now becomes the baseline everything later is compared against.",
        h("button.btn", { onclick: () => openMeasureSheet(state, id, rerender) }, icon("plus"), "Log the first one")
      )
    );
    return panel;
  }

  const delta = previous ? latest[id] - previous[id] : null;
  const over = measure.threshold && latest[id] >= measure.threshold.over;

  panel.append(
    h(
      "div.score",
      h(
        "div",
        { style: { flex: "1 1 auto" } },
        h(
          "div.score-figure",
          String(latest[id]),
          h("sup", measure.unit)
        ),
        h(
          "div.score-label",
          `${fmtDate(latest.date)}${
            delta === null ? "" : `. ${delta > 0 ? "Up" : delta < 0 ? "Down" : "No change"} ${Math.abs(delta).toFixed(1)} ${measure.unit} since last time`
          }`
        )
      ),
      h("button.btn.ghost", { onclick: () => openMeasureSheet(state, id, rerender) }, icon("plus"), "Log")
    )
  );

  if (points.length > 1) panel.append(lineChart(points, id, measure));

  if (over) {
    panel.append(
      h(
        "div",
        { style: { padding: "0 14px 14px" } },
        note(
          `${latest[id]} ${measure.unit} is at or above the ${measure.threshold.over} ${measure.unit} action threshold that the WHO and IDF set for Asian men. This is the number worth taking to a GP.`,
          "warn"
        )
      )
    );
  } else if (status.overdue) {
    panel.append(
      h(
        "div",
        { style: { padding: "0 14px 14px" } },
        note(`Last measured ${status.days} days ago. Monthly is the cadence that makes the chart mean anything.`)
      )
    );
  }

  return panel;
}

function lineChart(points, id, measure) {
  const values = points.map((p) => p[id]);
  const min = Math.min(...values, measure.threshold ? measure.threshold.over : Infinity);
  const max = Math.max(...values, measure.threshold ? measure.threshold.over : -Infinity);
  const pad = (max - min) * 0.18 || 1;
  const lo = min - pad;
  const hi = max + pad;

  const W = 300;
  const H = 130;
  const x = (i) => (points.length === 1 ? W / 2 : 10 + (i / (points.length - 1)) * (W - 20));
  const y = (v) => H - 16 - ((v - lo) / (hi - lo)) * (H - 34);

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[id]).toFixed(1)}`).join(" ");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "line");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${measure.name} over time, ${values.length} measurements`);

  let markup = "";
  if (measure.threshold) {
    const ty = y(measure.threshold.over).toFixed(1);
    markup += `<line class="threshold" x1="6" y1="${ty}" x2="${W - 6}" y2="${ty}"></line>`;
  }
  markup += `<path d="${path}"></path>`;
  markup += points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[id]).toFixed(1)}" r="2.5"></circle>`).join("");
  svg.innerHTML = markup;

  return h(
    "div",
    svg,
    h(
      "div.axis",
      h("span", fmtShort(points[0].date)),
      measure.threshold ? h("span", `threshold ${measure.threshold.over} ${measure.unit}`) : null,
      h("span", fmtShort(points[points.length - 1].date))
    )
  );
}

function openMeasureSheet(state, id, rerender) {
  const measure = MEASURES.find((m) => m.id === id);
  const last = [...state.measures].reverse().find((m) => m[id] != null);

  openSheet((close) => {
    const value = h("input", {
      type: "number",
      inputmode: "decimal",
      step: measure.step,
      value: last ? String(last[id]) : "",
      id: "m-value",
    });
    const date = h("input", { type: "date", value: todayKey(), max: todayKey(), id: "m-date" });
    const err = h("div.err");

    return [
      h("h2", measure.name),
      h("p", measure.why),
      h("div.source", measure.source),
      h(
        "div",
        { style: { marginTop: "20px" } },
        h("div.field", h("label", { for: "m-value" }, `Measurement in ${measure.unit}`), value, err),
        h("div.field", h("label", { for: "m-date" }, "Date"), date)
      ),
      h(
        "div.actions",
        h(
          "button.btn.full",
          {
            onclick: () => {
              const n = Number(value.value);
              if (!Number.isFinite(n) || n <= 0) {
                err.textContent = "Enter a number greater than zero.";
                return;
              }
              addMeasure({ date: date.value || todayKey(), [id]: n });
              close();
              rerender();
            },
          },
          icon("check"),
          "Save"
        ),
        last &&
          h(
            "button.btn.ghost.full",
            {
              onclick: () => {
                removeMeasure(last.date);
                close();
                rerender();
              },
            },
            icon("trash"),
            `Delete the ${fmtShort(last.date)} entry`
          )
      ),
    ];
  });
}

/* -------------------------------------------------------------- photos */

const POSES = ["Front", "Side", "Back", "Face"];

function photosSection(state, rerender) {
  const section = h(
    "section.block",
    h("h2", "Photos"),
    h(
      "p.lede",
      "Same spot, same light, same time of day. Compare against the first set, never against the mirror at 11pm. Photos stay on this device and are never uploaded."
    )
  );

  const panel = h("div.panel");

  if (!state.photos.length) {
    panel.append(
      empty("camera", "No photos yet", "Four shots today become the baseline. Front, side, back, face.", captureButton(rerender))
    );
  } else {
    const grid = h("div.thumbs");
    const recent = [...state.photos].reverse().slice(0, 12);
    for (const photo of recent) {
      const figure = h("figure", h("div.skel", { style: { width: "100%", height: "100%" } }));
      readPhoto(photo.id).then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const img = h("img", {
          src: url,
          alt: `${photo.pose ?? "Progress"} photo from ${fmtDate(photo.date)}`,
          loading: "lazy",
          onload: () => URL.revokeObjectURL(url),
        });
        figure.firstChild.replaceWith(img);
      });
      figure.append(h("figcaption", `${fmtShort(photo.date)}${photo.pose ? " " + photo.pose : ""}`));
      figure.onclick = () => openPhoto(photo, rerender);
      section.dataset.has = "1";
      grid.append(figure);
    }
    panel.append(grid, h("div", { style: { padding: "0 14px 14px" } }, captureButton(rerender, true)));
  }

  section.append(panel);
  return section;
}

function captureButton(rerender, ghost) {
  const input = h("input", {
    type: "file",
    accept: "image/*",
    capture: "environment",
    class: "hidden",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const pose = await askPose();
      if (pose === null) return;
      await storePhoto(file, { pose });
      rerender();
    },
  });

  const button = h(
    `button.btn${ghost ? ".ghost" : ""}.full`,
    { onclick: () => input.click() },
    icon("camera"),
    "Add a photo"
  );
  return h("div", button, input);
}

const askPose = () =>
  new Promise((resolve) => {
    openSheet((close) => [
      h("h2", "Which shot is this?"),
      h("p", "Labelling it means you can line up the same pose next month instead of guessing."),
      h(
        "div.actions",
        ...POSES.map((pose) =>
          h("button.btn.ghost.full", { onclick: () => { close(); resolve(pose); } }, pose)
        ),
        h("button.btn.quiet", { onclick: () => { close(); resolve(null); } }, "Cancel")
      ),
    ]);
  });

function openPhoto(photo, rerender) {
  openSheet((close) => {
    const wrap = h("div", { style: { borderRadius: "10px", overflow: "hidden", background: "var(--sunken)" } });
    readPhoto(photo.id).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      wrap.append(
        h("img", {
          src: url,
          alt: `${photo.pose ?? "Progress"} photo from ${fmtDate(photo.date)}`,
          style: { width: "100%", display: "block" },
          onload: () => URL.revokeObjectURL(url),
        })
      );
    });

    return [
      h("h2", `${photo.pose ?? "Photo"}, ${fmtDate(photo.date)}`),
      h("div", { style: { marginTop: "14px" } }, wrap),
      h(
        "div.actions",
        h(
          "button.btn.ghost.full",
          {
            onclick: async () => {
              await deletePhoto(photo.id);
              close();
              rerender();
            },
          },
          icon("trash"),
          "Delete this photo"
        )
      ),
    ];
  });
}

/* -------------------------------------------------------------- bloods */

function bloodsSection(state, rerender) {
  const latest = state.bloods[0];
  const days = latest ? Math.round((new Date() - new Date(latest.date + "T12:00:00")) / 86400000) : null;

  const panel = h("div.panel");

  if (!latest) {
    panel.append(
      h(
        "div",
        { style: { padding: "16px" } },
        h(
          "p",
          { style: { fontSize: "13.5px", color: "var(--text-2)", lineHeight: "1.6" } },
          "One appointment, then once a year. Ask for: " +
            BLOODS.map((b) => b.name).join(", ") +
            "."
        ),
        h(
          "div",
          { style: { marginTop: "14px" } },
          note(
            "Type 2 diabetes rates among South Asians in the UK run two to six times higher than in the white European population, and risk starts rising from about age 25 rather than 40. This is the panel that catches it early."
          )
        ),
        h(
          "div",
          { style: { marginTop: "14px" } },
          h("button.btn.full", { onclick: () => openBloodsSheet(rerender) }, icon("plus"), "Record a blood panel")
        )
      )
    );
  } else {
    panel.append(
      h(
        "div.score",
        h(
          "div",
          { style: { flex: "1 1 auto" } },
          h("div.score-figure", String(days), h("sup", "d")),
          h("div.score-label", `Since your last panel, taken ${fmtDate(latest.date)}.`)
        ),
        h("button.btn.ghost", { onclick: () => openBloodsSheet(rerender) }, icon("plus"), "New")
      )
    );
    if (latest.note) {
      panel.append(h("div", { style: { padding: "0 16px 16px" } }, h("p.lede", latest.note)));
    }
    if (days >= 365) {
      panel.append(h("div", { style: { padding: "0 14px 14px" } }, note("Over a year. Time to book the next one.", "warn")));
    }
  }

  return h(
    "section.block",
    h("h2", "Bloods"),
    h("p.lede", "The scoreboard the source material argues should outrank the mirror."),
    panel
  );
}

function openBloodsSheet(rerender) {
  openSheet((close) => {
    const date = h("input", { type: "date", value: todayKey(), max: todayKey(), id: "b-date" });
    const noteField = h("textarea", {
      id: "b-note",
      placeholder: "Results, flags, anything the GP said. Values are yours to keep here, not to interpret alone.",
    });

    return [
      h("h2", "Blood panel"),
      h(
        "div",
        { style: { marginTop: "16px" } },
        h("div.field", h("label", { for: "b-date" }, "Date taken"), date),
        h("div.field", h("label", { for: "b-note" }, "Notes"), noteField,
          h("div.help", "Ask about lipoprotein(a) once if there is early cardiovascular disease in the family. It is commonly raised in South Asian populations and you only need the test one time."))
      ),
      h(
        "div.actions",
        h(
          "button.btn.full",
          {
            onclick: () => {
              addBloods({ id: uid("bl"), date: date.value || todayKey(), note: noteField.value.trim() });
              close();
              rerender();
            },
          },
          icon("check"),
          "Save"
        )
      ),
    ];
  });
}
