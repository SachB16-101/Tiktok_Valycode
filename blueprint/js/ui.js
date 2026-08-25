/**
 * DOM helpers and the shared sheet.
 *
 * No framework. The app has five screens and one modal, and a hyperscript
 * helper plus full repaints on state change is both fast enough and far
 * easier to read than a hand-rolled diff. Repaint cost is a few hundred
 * nodes.
 */

import { TIERS, EVIDENCE } from "./habits.js";

/** h("div.klass", {props}, ...children) */
export function h(spec, props, ...kids) {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");

  if (props && (props.nodeType || typeof props !== "object" || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = [node.className, value].filter(Boolean).join(" ");
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key in node && key !== "list" && typeof value !== "boolean") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }

  for (const kid of kids.flat(3)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** Phosphor symbol from the vendored sprite. Never a hand-drawn path. */
export function icon(name, extra) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (extra) svg.setAttribute("class", extra);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

export const clear = (node) => {
  while (node.firstChild) node.firstChild.remove();
  return node;
};

/* --------------------------------------------------------------- format */

export const fmtDate = (key) =>
  new Date(key + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export const fmtShort = (key) =>
  new Date(key + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const fmtNum = (value, digits = 0) =>
  value === null || value === undefined || Number.isNaN(value) ? "-" : Number(value).toFixed(digits);

export const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ---------------------------------------------------------------- sheet */

let closeCurrent = null;

export function openSheet(build) {
  closeSheet();

  const scrim = h("div.scrim", { onclick: closeSheet });
  const sheet = h("div.sheet", { role: "dialog", "aria-modal": "true" }, h("div.grabber"));
  sheet.append(...[build(closeSheet)].flat().filter(Boolean));

  document.body.append(scrim, sheet);
  document.body.style.overflow = "hidden";

  const onKey = (e) => e.key === "Escape" && closeSheet();
  document.addEventListener("keydown", onKey);

  // Focus the sheet itself so screen readers and keyboards land inside it.
  sheet.tabIndex = -1;
  sheet.focus({ preventScroll: true });

  closeCurrent = () => {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
    sheet.remove();
    document.body.style.overflow = "";
    closeCurrent = null;
  };
  return closeSheet;
}

export function closeSheet() {
  closeCurrent?.();
}

/* --------------------------------------------------------------- badges */

export const tierBadge = (tier) => h(`span.tier.${tier}`, TIERS[tier].label);

export const evidenceLabel = (evidence) => h("span.ev", EVIDENCE[evidence].label);

export function note(text, kind) {
  return h(
    `div.note${kind ? "." + kind : ""}`,
    icon(kind === "warn" ? "warning" : "info"),
    h("span", text)
  );
}

export function empty(iconName, title, body, action) {
  return h("div.empty", icon(iconName), h("h3", title), h("p", body), action);
}

/**
 * The habit detail sheet. For a graded habit it shows why it earns its place.
 * For an unproven one it shows the claim and the counter-evidence next to each
 * other, because the argument is the content.
 */
export function habitSheet(habit, extras = []) {
  return openSheet(() => [
    h("h2", habit.name),
    h("div.meta", tierBadge(habit.tier), evidenceLabel(habit.evidence)),

    habit.why && h("p", habit.why),

    habit.claim &&
      h("div.claim", h("div.who", "The claim"), h("p", habit.claim)),
    habit.counter &&
      h("div.claim.counter", h("div.who", "What the evidence says"), h("p", habit.counter)),

    habit.caution && h("div.caution", h("strong", "Caution. "), habit.caution),

    habit.source && h("div.source", habit.source),

    extras.length ? h("div.actions", ...extras) : null,
  ]);
}
