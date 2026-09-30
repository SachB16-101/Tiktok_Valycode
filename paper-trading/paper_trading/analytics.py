"""Valuations, benchmark gaps, last-month review and journal outcomes."""

from __future__ import annotations

from dataclasses import dataclass

from .config import Config, Portfolio
from .ledger import Book, cycle_record, journal_for, replay


@dataclass
class Holding:
    ticker: str
    qty: float
    price_usd: float
    value_gbp: float
    cost_gbp: float
    weight: float

    @property
    def gain_gbp(self) -> float:
        return self.value_gbp - self.cost_gbp


@dataclass
class Valuation:
    book: Book
    value_gbp: float
    cash_gbp: float
    holdings: list[Holding]

    @property
    def return_gbp(self) -> float:
        return self.value_gbp - self.book.contributed_gbp

    @property
    def return_pct(self) -> float:
        c = self.book.contributed_gbp
        return self.return_gbp / c if c else 0.0


def value_book(book: Book, prices: dict[str, float], fx: float) -> Valuation:
    rows = []
    for t, q in sorted(book.holdings.items()):
        rows.append(Holding(t, q, prices[t], q * prices[t] / fx, book.cost_gbp.get(t, 0.0), 0.0))
    cash_gbp = book.cash_usd / fx
    total = sum(h.value_gbp for h in rows) + cash_gbp
    for h in rows:
        h.weight = h.value_gbp / total if total else 0.0
    rows.sort(key=lambda h: -h.value_gbp)
    return Valuation(book, total, cash_gbp, rows)


@dataclass
class PanelRow:
    portfolio: Portfolio
    actual: Valuation
    bench: Valuation

    @property
    def gap_pct(self) -> float:
        """Percentage-point gap vs the S&P 500 shadow. Positive = beating it."""
        return self.actual.return_pct - self.bench.return_pct

    @property
    def gap_gbp(self) -> float:
        return self.actual.value_gbp - self.bench.value_gbp


def held_tickers(ledger: dict) -> set[str]:
    out = set()
    for c in ledger["cycles"]:
        for rec in c["portfolios"].values():
            out.update(t["ticker"] for t in rec["trades"])
            out.update(t["ticker"] for t in rec["benchmark"]["trades"])
    return out


def panel(ledger: dict, cfg: Config, prices: dict[str, float], fx: float) -> list[PanelRow]:
    rows = []
    for p in cfg.portfolios:
        actual, bench = replay(ledger, p.id)
        if actual.months == 0:
            continue
        rows.append(PanelRow(p, value_book(actual, prices, fx), value_book(bench, prices, fx)))
    return rows


def last_cycle_review(ledger: dict, cfg: Config, prices: dict[str, float], fx: float) -> dict | None:
    """What has happened since the most recent executed cycle."""
    if not ledger["cycles"]:
        return None
    prev = ledger["cycles"][-1]
    then_prices, then_fx = prev["prices"], prev["fx_gbpusd"]
    portfolios = []
    for p in cfg.portfolios:
        rec = prev["portfolios"].get(p.id)
        if not rec:
            continue
        actual, bench = replay(ledger, p.id, upto=prev["cycle"])
        holdings = []
        for t, q in sorted(actual.holdings.items()):
            v_then, v_now = q * then_prices[t] / then_fx, q * prices[t] / fx
            holdings.append({
                "ticker": t, "price_then": then_prices[t], "price_now": prices[t],
                "move_pct": prices[t] / then_prices[t] - 1,
                "value_then_gbp": v_then, "value_now_gbp": v_now, "change_gbp": v_now - v_then,
            })
        holdings.sort(key=lambda h: -h["value_now_gbp"])
        bought = []
        for t in rec["trades"]:
            bought.append({
                "ticker": t["ticker"], "qty": t["qty"], "price_then": t["price_usd"],
                "price_now": prices[t["ticker"]], "move_pct": prices[t["ticker"]] / t["price_usd"] - 1,
                "change_gbp": t["qty"] * prices[t["ticker"]] / fx - t["cost_usd"] / then_fx,
            })
        now_actual = value_book(actual, prices, fx).value_gbp
        now_bench = value_book(bench, prices, fx).value_gbp
        portfolios.append({
            "portfolio": p,
            "value_then_gbp": rec["value_gbp_after"], "value_now_gbp": now_actual,
            "bench_then_gbp": rec["benchmark"]["value_gbp_after"], "bench_now_gbp": now_bench,
            "holdings": holdings, "bought": bought,
        })
    return {
        "cycle": prev["cycle"],
        "executed_at": prev["executed_at"],
        "fx_then": then_fx, "fx_now": fx,
        "allocation": prev["allocation"],
        "allocation_move_pct": allocation_move(prev["allocation"], then_prices, prices),
        "bench_move_pct": prices[cfg.benchmark] / then_prices[cfg.benchmark] - 1
        if cfg.benchmark in then_prices else None,
        "journal": journal_for(ledger, prev["cycle"]),
        "portfolios": portfolios,
    }


def allocation_move(allocation: dict[str, float], then: dict[str, float], now: dict[str, float]) -> float:
    """Weighted USD price move of one month's allocation (ignores fees and FX, same as the benchmark move)."""
    return sum(w / 100 * (now[t] / then[t] - 1) for t, w in allocation.items())


def journal_outcomes(ledger: dict, cfg: Config, prices: dict[str, float]) -> list[dict]:
    """Every locked decision next to what its allocation has done since."""
    out = []
    for entry in ledger["journal"]:
        c = cycle_record(ledger, entry["cycle"])
        row = {"entry": entry, "executed": c is not None}
        if c:
            then = c["prices"]
            row["per_ticker"] = [
                {"ticker": t, "weight": w, "price_then": then[t], "price_now": prices[t],
                 "move_pct": prices[t] / then[t] - 1}
                for t, w in entry["allocation"].items()
            ]
            row["allocation_move_pct"] = allocation_move(entry["allocation"], then, prices)
            row["bench_move_pct"] = prices[cfg.benchmark] / then[cfg.benchmark] - 1
            row["gap_pct"] = row["allocation_move_pct"] - row["bench_move_pct"]
        out.append(row)
    return out


def tickers_needed(ledger: dict, cfg: Config, extra=()) -> set[str]:
    return held_tickers(ledger) | {cfg.benchmark} | {t for j in ledger["journal"] for t in j["allocation"]} | set(extra)
