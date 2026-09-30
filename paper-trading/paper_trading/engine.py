"""Allocation parsing and execution of a monthly cycle.

Phase 1 only ever *buys*: each month's contribution is split by that month's
allocation. Nothing already held is sold (time in the market, no churning).
"""

from __future__ import annotations

import math
import re
from datetime import datetime

from .config import Config
from .ledger import Book, journal_hash, now_iso, replay

ALLOC_RE = re.compile(r"([A-Za-z][A-Za-z0-9.\-]*)\s*[=:\s]\s*([0-9]+(?:\.[0-9]+)?)\s*%?")


def cycle_id(when: datetime) -> str:
    return when.strftime("%Y-%m")


def parse_allocation(text: str) -> dict[str, float]:
    """'VOO=60, TSLA=25, IONQ=15' -> {'VOO': 60.0, ...}. Must sum to 100."""
    cleaned = text.replace(",", " ").replace(";", " ").strip()
    pairs = ALLOC_RE.findall(cleaned)
    leftover = ALLOC_RE.sub("", cleaned).strip()
    if not pairs or leftover:
        raise ValueError("Write it as TICKER=PERCENT pairs, e.g. VOO=60, TSLA=40")
    alloc: dict[str, float] = {}
    for ticker, pct in pairs:
        t, p = ticker.upper(), float(pct)
        if t in alloc:
            raise ValueError(f"{t} appears twice")
        if p <= 0:
            raise ValueError(f"{t}: percentage must be above 0")
        alloc[t] = p
    total = sum(alloc.values())
    if abs(total - 100) > 0.01:
        raise ValueError(f"Percentages sum to {total:g}%, must be exactly 100%")
    return alloc


def buy_book(usd_available: float, weights: dict[str, float], prices: dict[str, float],
             fractionable: dict[str, bool], commission_usd: float, min_order_usd: float):
    """Split cash across weights. Returns (trades, skipped, leftover_usd)."""
    trades, skipped = [], []
    spent = 0.0
    for ticker, weight in weights.items():
        target = usd_available * weight / 100
        price = prices[ticker]
        spendable = target - commission_usd
        if spendable <= 0:
            skipped.append({"ticker": ticker, "target_usd": target, "reason": "commission exceeds order size"})
            continue
        if fractionable.get(ticker, True):
            if spendable < min_order_usd:
                skipped.append({"ticker": ticker, "target_usd": target,
                                "reason": f"below ${min_order_usd:g} minimum order"})
                continue
            qty = math.floor(spendable / price * 1e6) / 1e6
        else:
            qty = float(math.floor(spendable / price))
            if qty < 1:
                skipped.append({"ticker": ticker, "target_usd": target,
                                "reason": f"not fractionable; 1 share costs ${price:,.2f}"})
                continue
        if qty <= 0:
            skipped.append({"ticker": ticker, "target_usd": target, "reason": "rounds to zero shares"})
            continue
        cost = round(qty * price, 6)
        spent += cost + commission_usd
        trades.append({
            "ticker": ticker, "qty": qty, "price_usd": price, "cost_usd": cost,
            "commission_usd": commission_usd, "target_usd": round(target, 6),
            "fractional": bool(fractionable.get(ticker, True)),
        })
    return trades, skipped, usd_available - spent


def _value_gbp(holdings: dict[str, float], cash_usd: float, prices: dict[str, float], fx: float) -> float:
    return (sum(q * prices[t] for t, q in holdings.items()) + cash_usd) / fx


def _execute_side(book: Book, contribution_gbp: float, weights: dict[str, float], prices, fractionable,
                  fx: float, cfg: Config) -> dict:
    fx_fee_gbp = contribution_gbp * cfg.fx_fee_pct / 100
    usd_available = book.cash_usd + (contribution_gbp - fx_fee_gbp) * fx
    commission_usd = cfg.commission_gbp * fx
    trades, skipped, leftover = buy_book(usd_available, weights, prices, fractionable,
                                         commission_usd, cfg.min_order_usd)
    holdings = dict(book.holdings)
    for t in trades:
        holdings[t["ticker"]] = holdings.get(t["ticker"], 0.0) + t["qty"]
    return {
        "fx_fee_gbp": round(fx_fee_gbp, 6),
        "commission_gbp": round(sum(t["commission_usd"] for t in trades) / fx, 6),
        "usd_available": round(usd_available, 6),
        "trades": trades,
        "skipped": skipped,
        "cash_usd_after": round(leftover, 6),
        "value_gbp_after": round(_value_gbp(holdings, leftover, prices, fx), 6),
    }


def plan_cycle(ledger: dict, cfg: Config, cycle: str, allocation: dict[str, float],
               prices: dict[str, float], fx: float, fractionable: dict[str, bool]) -> dict:
    """Build the cycle record (not yet saved) for every portfolio and its benchmark shadow."""
    record = {
        "cycle": cycle,
        "executed_at": now_iso(),
        "fx_gbpusd": fx,
        "allocation": allocation,
        "prices": dict(sorted(prices.items())),
        "portfolios": {},
    }
    for p in cfg.portfolios:
        actual, bench = replay(ledger, p.id)
        side = _execute_side(actual, p.monthly_gbp, allocation, prices, fractionable, fx, cfg)
        side["contribution_gbp"] = p.monthly_gbp
        side["benchmark"] = _execute_side(bench, p.monthly_gbp, {cfg.benchmark: 100.0}, prices,
                                          fractionable, fx, cfg)
        record["portfolios"][p.id] = side
    return record


def make_journal_entry(cycle: str, allocation: dict[str, float], reasoning: str,
                       expectation: str, benchmark: str) -> dict:
    entry = {
        "cycle": cycle,
        "created_at": now_iso(),
        "allocation": allocation,
        "reasoning": reasoning.strip(),
        "expectation": expectation.strip(),
        "benchmark_weight_pct": allocation.get(benchmark, 0.0),
    }
    entry["sha256"] = journal_hash(entry)
    return entry
