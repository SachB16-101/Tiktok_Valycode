"""The ledger is the source of truth: every cycle's trades and every journal entry.

Holdings are never stored directly — they're rebuilt by replaying cycles, so the
numbers in any report can always be traced back to individual trades.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

JOURNAL_HASH_FIELDS = ("cycle", "created_at", "allocation", "reasoning", "expectation")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def empty_ledger() -> dict:
    return {"version": 1, "created_at": now_iso(), "cycles": [], "journal": []}


def load(path: Path) -> dict:
    if not path.exists():
        return empty_ledger()
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, ledger: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def journal_hash(entry: dict) -> str:
    payload = {k: entry.get(k) for k in JOURNAL_HASH_FIELDS}
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def journal_for(ledger: dict, cycle: str) -> dict | None:
    return next((j for j in ledger["journal"] if j["cycle"] == cycle), None)


def cycle_record(ledger: dict, cycle: str) -> dict | None:
    return next((c for c in ledger["cycles"] if c["cycle"] == cycle), None)


@dataclass
class Book:
    """One side of a comparison: the real portfolio or its S&P 500 shadow."""

    holdings: dict[str, float] = field(default_factory=dict)
    cost_gbp: dict[str, float] = field(default_factory=dict)
    cash_usd: float = 0.0
    contributed_gbp: float = 0.0
    fees_gbp: float = 0.0
    months: int = 0

    def apply(self, side: dict, contribution_gbp: float, fx: float) -> None:
        self.contributed_gbp += contribution_gbp
        self.fees_gbp += side["fx_fee_gbp"] + side["commission_gbp"]
        for t in side["trades"]:
            self.holdings[t["ticker"]] = self.holdings.get(t["ticker"], 0.0) + t["qty"]
            self.cost_gbp[t["ticker"]] = self.cost_gbp.get(t["ticker"], 0.0) + t["cost_usd"] / fx
        self.cash_usd = side["cash_usd_after"]
        self.months += 1


def replay(ledger: dict, portfolio_id: str, upto: str | None = None) -> tuple[Book, Book]:
    """Rebuild (portfolio, benchmark) books from cycles, optionally up to and including `upto`."""
    actual, bench = Book(), Book()
    for c in ledger["cycles"]:
        rec = c["portfolios"].get(portfolio_id)
        if rec:
            actual.apply(rec, rec["contribution_gbp"], c["fx_gbpusd"])
            bench.apply(rec["benchmark"], rec["contribution_gbp"], c["fx_gbpusd"])
        if upto and c["cycle"] == upto:
            break
    return actual, bench
