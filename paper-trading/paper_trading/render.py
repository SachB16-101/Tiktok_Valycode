"""Markdown rendering. The same text goes to the terminal and into Obsidian."""

from __future__ import annotations

from .analytics import PanelRow
from .config import Config

MINUS = "-"


def gbp(x: float, signed: bool = False) -> str:
    if abs(x) < 0.005:
        x = 0.0
    sign = MINUS if x < 0 else ("+" if signed and x > 0 else "")
    return f"{sign}£{abs(x):,.2f}"


def usd(x: float) -> str:
    return f"${x:,.2f}"


def pct(x: float | None, signed: bool = True) -> str:
    if x is None:
        return "n/a"
    v = x * 100
    if abs(v) < 0.005:
        v = 0.0
    return f"{v:+.2f}%" if signed else f"{v:.2f}%"


def pp(x: float) -> str:
    v = x * 100
    if abs(v) < 0.005:
        v = 0.0
    return f"{v:+.2f} pp"


def qty(q: float) -> str:
    return f"{q:,.0f}" if q == int(q) else f"{q:,.6f}".rstrip("0")


def table(headers: list[str], rows: list[list[str]], align: str | None = None) -> str:
    align = align or ("l" + "r" * (len(headers) - 1))
    sep = ["---:" if a == "r" else "---" for a in align]
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(sep) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(lines)


def alloc_str(allocation: dict[str, float]) -> str:
    return ", ".join(f"{t} {w:g}%" for t, w in allocation.items())


def quote_block(text: str) -> str:
    return "\n".join("> " + line if line else ">" for line in text.strip().splitlines())


# ---------------------------------------------------------------- panels

def render_panel(rows: list[PanelRow], cfg: Config) -> str:
    if not rows:
        return "_No cycles run yet._"
    body = []
    for r in rows:
        body.append([
            r.portfolio.name, gbp(r.actual.book.contributed_gbp), gbp(r.actual.value_gbp),
            gbp(r.actual.return_gbp, True), pct(r.actual.return_pct),
            gbp(r.bench.value_gbp), pct(r.bench.return_pct),
            f"**{pp(r.gap_pct)}**", f"**{gbp(r.gap_gbp, True)}**",
        ])
    head = ["Portfolio", "Contributed", "Value", "Return £", "Return %",
            f"{cfg.benchmark} value", f"{cfg.benchmark} %", "Gap vs benchmark", "Gap £"]
    return table(head, body) + (
        "\n\n_Gap = your return minus a plain "
        f"{cfg.benchmark} (S&P 500) position that received identical contributions on the same dates, "
        "with the same fees. Positive means your choices beat just buying the index._"
    )


def render_scale(rows: list[PanelRow], cfg: Config) -> str:
    """Where portfolio size actually changes things: fees, share rounding, and how a fall feels."""
    if not rows:
        return ""
    body = []
    for r in rows:
        b = r.actual.book
        body.append([
            r.portfolio.name,
            f"{gbp(b.fees_gbp)} ({pct(b.fees_gbp / b.contributed_gbp if b.contributed_gbp else 0, False)})",
            gbp(r.actual.cash_gbp),
            pct(r.actual.cash_gbp / r.actual.value_gbp if r.actual.value_gbp else 0, False),
            gbp(-0.10 * r.actual.value_gbp), gbp(-0.30 * r.actual.value_gbp),
        ])
    notes = [
        table(["Portfolio", "Fees paid", "Uninvested cash", "Cash drag", "A 10% fall", "A 30% fall"], body),
        "",
        "_Percent returns should be near-identical across the three. Where they differ, it is because of "
        "fixed costs, minimum order sizes, or whole-share-only tickers leaving cash uninvested — "
        "those bite harder on small portfolios. The fall columns are the same percentage in very different "
        "pounds._",
    ]
    return "\n".join(notes)


def render_holdings(rows: list[PanelRow]) -> str:
    out = []
    for r in rows:
        body = [[h.ticker, qty(h.qty), usd(h.price_usd), gbp(h.value_gbp), gbp(h.cost_gbp),
                 gbp(h.gain_gbp, True), pct(h.gain_gbp / h.cost_gbp if h.cost_gbp else 0),
                 pct(h.weight, False)] for h in r.actual.holdings]
        if r.actual.cash_gbp >= 0.005:
            body.append(["Cash", "", "", gbp(r.actual.cash_gbp), "", "", "",
                         pct(r.actual.cash_gbp / r.actual.value_gbp, False)])
        out.append(f"#### {r.portfolio.name} / month\n\n" + table(
            ["Ticker", "Shares", "Price", "Value", "Cost", "Gain £", "Gain %", "Weight"], body))
    return "\n\n".join(out)


# ---------------------------------------------------------------- monthly review

def render_review(review: dict | None, cfg: Config) -> str:
    if not review:
        return "_First cycle — nothing to review yet._"
    lines = [
        f"Since the **{review['cycle']}** allocation ({alloc_str(review['allocation'])}), "
        f"that mix moved **{pct(review['allocation_move_pct'])}** vs **{pct(review['bench_move_pct'])}** "
        f"for {cfg.benchmark} (USD prices, before fees/FX). "
        f"GBP/USD went {review['fx_then']:.4f} → {review['fx_now']:.4f}.",
        "",
    ]
    j = review.get("journal")
    if j:
        lines += [f"**What you wrote at the time** ([[{review['cycle']} Decision]]):", "", quote_block(j["reasoning"]), ""]
        if j.get("expectation"):
            lines += ["**What you expected:**", "", quote_block(j["expectation"]), ""]
    for p in review["portfolios"]:
        name = p["portfolio"].name
        ch = p["value_now_gbp"] - p["value_then_gbp"]
        bch = p["bench_now_gbp"] - p["bench_then_gbp"]
        lines += [
            f"#### {name} / month",
            "",
            f"Portfolio {gbp(p['value_then_gbp'])} → {gbp(p['value_now_gbp'])} ({gbp(ch, True)}); "
            f"{cfg.benchmark} shadow {gbp(p['bench_then_gbp'])} → {gbp(p['bench_now_gbp'])} ({gbp(bch, True)}).",
            "",
            table(["Holding", "Price then", "Price now", "Move", "Value then", "Value now", "Change"],
                  [[h["ticker"], usd(h["price_then"]), usd(h["price_now"]), pct(h["move_pct"]),
                    gbp(h["value_then_gbp"]), gbp(h["value_now_gbp"]), gbp(h["change_gbp"], True)]
                   for h in p["holdings"]]),
            "",
        ]
        if p["bought"]:
            lines += ["That month's buys only: " + "; ".join(
                f"{b['ticker']} {pct(b['move_pct'])} ({gbp(b['change_gbp'], True)})" for b in p["bought"]), ""]
    return "\n".join(lines).rstrip()


def render_execution(record: dict, cfg: Config, preview: bool = False) -> str:
    fx = record["fx_gbpusd"]
    when = "Preview at current prices" if preview else f"Executed {record['executed_at']}"
    lines = [f"{when}, GBP/USD {fx:.4f}. Allocation: {alloc_str(record['allocation'])}.", ""]
    for p in cfg.portfolios:
        rec = record["portfolios"].get(p.id)
        if not rec:
            continue
        body = [[t["ticker"], qty(t["qty"]), usd(t["price_usd"]), usd(t["cost_usd"]),
                 "yes" if t["fractional"] else "whole shares only"] for t in rec["trades"]]
        lines += [
            f"#### {p.name} / month",
            "",
            f"{gbp(rec['contribution_gbp'])} in, FX fee {gbp(rec['fx_fee_gbp'])}, "
            f"{usd(rec['usd_available'])} available (incl. carried cash).",
            "",
            table(["Ticker", "Shares", "Price", "Cost", "Fractional"], body) if body else "_No buys._",
        ]
        for s in rec["skipped"]:
            lines.append(f"- ⚠️ **{s['ticker']} not bought** ({usd(s['target_usd'])} target): {s['reason']}. Stays as cash.")
        if rec["cash_usd_after"] >= 0.01:
            lines.append(f"- Uninvested cash carried to next month: {usd(rec['cash_usd_after'])}")
        lines.append("")
    return "\n".join(lines).rstrip()


# ---------------------------------------------------------------- journal

def render_journal_entry(entry: dict, cfg: Config) -> str:
    """Deterministic from the ledger entry, so `verify` can detect any edit in Obsidian."""
    alloc_rows = [[t, f"{w:g}%", cfg.universe.get(t, "")] for t, w in entry["allocation"].items()]
    bw = entry.get("benchmark_weight_pct", 0.0)
    return "\n".join([
        "---",
        "tags: [finance, investments, paper-trading, decision-journal]",
        f"cycle: {entry['cycle']}",
        f"created: {entry['created_at']}",
        "locked: true",
        f"sha256: {entry['sha256']}",
        "---",
        "",
        f"# {entry['cycle']} Decision",
        "",
        "> [!warning] Locked",
        "> Written before execution. This note is read-only and its hash is stored in the ledger — "
        "`ptrade verify` will flag any edit. Add later thoughts in a separate note.",
        "",
        "## Allocation",
        "",
        table(["Ticker", "Weight", "Note"], alloc_rows, "lrl"),
        "",
        f"{cfg.benchmark} (benchmark) share of this month: **{bw:g}%**"
        + ("" if bw >= 100 else f" — {100 - bw:g}% is a deliberate bet against simply buying the index."),
        "",
        "## Reasoning",
        "",
        entry["reasoning"],
        "",
        "## What I expect to happen",
        "",
        entry["expectation"] or "_Not recorded._",
        "",
        "## Outcome",
        "",
        f"See [[{entry['cycle']} Monthly Report]] and the journal table in [[Paper Trading Dashboard]].",
        "",
    ])


def render_outcomes(outcomes: list[dict], cfg: Config) -> str:
    if not outcomes:
        return "_No decisions yet._"
    body = []
    for o in reversed(outcomes):
        e = o["entry"]
        reason = e["reasoning"].strip().splitlines()[0]
        if len(reason) > 90:
            reason = reason[:87] + "…"
        if o["executed"]:
            body.append([f"[[{e['cycle']} Decision]]", alloc_str(e["allocation"]), reason,
                         pct(o["allocation_move_pct"]), pct(o["bench_move_pct"]), f"**{pp(o['gap_pct'])}**"])
        else:
            body.append([f"[[{e['cycle']} Decision]]", alloc_str(e["allocation"]), reason,
                         "not executed", "", ""])
    return table(["Decision", "Allocation", "Reasoning", "Since then", cfg.benchmark, "Gap"],
                 body, "lllrrr") + (
        "\n\n_Each row: the price move of that month's mix since it was bought, vs the benchmark over the "
        "same period. About 12 data points a year — too few to separate skill from luck. Read them for "
        "patterns in your reasoning, not as a scoreboard._")


# ---------------------------------------------------------------- vault documents

def render_monthly_report(record: dict, review: dict | None, rows: list[PanelRow], cfg: Config) -> str:
    c = record["cycle"]
    return "\n".join([
        "---",
        "tags: [finance, investments, paper-trading, monthly-report]",
        f"cycle: {c}",
        f"created: {record['executed_at']}",
        "---",
        "",
        f"# {c} Monthly Report",
        "",
        f"Decision: [[{c} Decision]] · Overview: [[Paper Trading Dashboard]]",
        "",
        "## 1. What last month's decisions did",
        "",
        render_review(review, cfg),
        "",
        "## 2. This month's buys",
        "",
        render_execution(record, cfg),
        "",
        "## 3. Benchmark panel (after this month's buys)",
        "",
        render_panel(rows, cfg),
        "",
        "## 4. What scale changes",
        "",
        render_scale(rows, cfg),
        "",
    ])


def render_dashboard(rows: list[PanelRow], outcomes: list[dict], ledger: dict, cfg: Config,
                     fx: float, generated_at: str, sources: dict[str, str]) -> str:
    cycles = [c["cycle"] for c in ledger["cycles"]]
    src = ", ".join(sorted(set(sources.values()))) or "n/a"
    return "\n".join([
        "---",
        "tags: [finance, investments, paper-trading, dashboard]",
        f"updated: {generated_at}",
        "---",
        "",
        "# Paper Trading Dashboard",
        "",
        f"_Updated {generated_at} · GBP/USD {fx:.4f} · prices from {src} · "
        f"{len(cycles)} cycle(s) run{'; last ' + cycles[-1] if cycles else ''}._",
        "",
        "> [!info] Principles",
        "> Saving comes first — this is practice with virtual money. Time in the market over timing it. "
        "Avoid *uncompensated* risk: concentration, fees, panic selling. Every decision is measured against "
        "simply buying the S&P 500.",
        "",
        "## Benchmark panel",
        "",
        render_panel(rows, cfg),
        "",
        "## What scale changes",
        "",
        render_scale(rows, cfg),
        "",
        "## Holdings",
        "",
        render_holdings(rows) or "_None yet._",
        "",
        "## Decision journal vs outcome",
        "",
        render_outcomes(outcomes, cfg),
        "",
        "## Monthly reports",
        "",
        "\n".join(f"- [[{c} Monthly Report]]" for c in reversed(cycles)) or "_None yet._",
        "",
    ])
