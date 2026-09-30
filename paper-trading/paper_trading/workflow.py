"""The monthly cycle and the vault writes, independent of how input is collected."""

from __future__ import annotations

import os
import stat
from pathlib import Path

from . import ledger as L
from .analytics import journal_outcomes, last_cycle_review, panel, tickers_needed
from .config import Config
from .engine import make_journal_entry, plan_cycle
from .market import Market
from .render import render_dashboard, render_journal_entry, render_monthly_report


# ---------------------------------------------------------------- vault paths & writes

def journal_path(cfg: Config, cycle: str) -> Path:
    return cfg.folder / "Journal" / f"{cycle} Decision.md"


def report_path(cfg: Config, cycle: str) -> Path:
    return cfg.folder / "Reports" / f"{cycle} Monthly Report.md"


def dashboard_path(cfg: Config) -> Path:
    return cfg.folder / "Paper Trading Dashboard.md"


def write_note(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not os.access(path, os.W_OK):
        path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
    path.write_text(text, encoding="utf-8")


def write_locked(path: Path, text: str) -> None:
    """Create a note once and make it read-only. Never overwrites."""
    if path.exists():
        raise FileExistsError(f"{path} already exists — journal entries are never overwritten")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)


# ---------------------------------------------------------------- cycle steps

def fractionable_map(cfg: Config, market: Market, tickers) -> tuple[dict[str, bool], list[str]]:
    """Returns (map, tickers whose status is unknown and assumed fractionable)."""
    out, unknown = {}, []
    for t in sorted(set(tickers)):
        if t in cfg.non_fractionable:
            out[t] = False
            continue
        val = market.fractionable(t)
        if val is None:
            unknown.append(t)
            val = True
        out[t] = val
    return out, unknown


def preview(ledger: dict, cfg: Config, market: Market, cycle: str, allocation: dict[str, float]):
    """Dry run at current prices: what would be bought, nothing saved."""
    prices = market.prices(tickers_needed(ledger, cfg, allocation))
    fx = market.fx_gbpusd()
    frac, unknown = fractionable_map(cfg, market, set(allocation) | {cfg.benchmark})
    return plan_cycle(ledger, cfg, cycle, allocation, prices, fx, frac), unknown


def lock_journal(cfg: Config, ledger: dict, cycle: str, allocation: dict[str, float],
                 reasoning: str, expectation: str) -> dict:
    """Step 3: record reasoning BEFORE anything is executed."""
    if not reasoning.strip():
        raise ValueError("Reasoning is required before an allocation can be executed")
    if L.journal_for(ledger, cycle):
        raise ValueError(f"A journal entry for {cycle} is already locked")
    entry = make_journal_entry(cycle, allocation, reasoning, expectation, cfg.benchmark)
    entry["vault_file"] = str(journal_path(cfg, cycle).relative_to(cfg.vault_path))
    ledger["journal"].append(entry)
    L.save(cfg.ledger_path, ledger)
    write_locked(journal_path(cfg, cycle), render_journal_entry(entry, cfg))
    return entry


def execute(cfg: Config, ledger: dict, market: Market, cycle: str) -> dict:
    """Step 4: buy at current prices using the locked allocation, then write report + dashboard."""
    entry = L.journal_for(ledger, cycle)
    if not entry:
        raise ValueError(f"No locked journal entry for {cycle}; reasoning must come first")
    if L.cycle_record(ledger, cycle):
        raise ValueError(f"{cycle} has already been executed")
    allocation = entry["allocation"]

    prices = market.prices(tickers_needed(ledger, cfg, allocation))
    fx = market.fx_gbpusd()
    review = last_cycle_review(ledger, cfg, prices, fx)  # before this month's buys land
    frac, unknown = fractionable_map(cfg, market, set(allocation) | {cfg.benchmark})

    record = plan_cycle(ledger, cfg, cycle, allocation, prices, fx, frac)
    record["fractionable"] = frac
    record["price_sources"] = {t: market.used.get(t, "") for t in prices}
    ledger["cycles"].append(record)
    L.save(cfg.ledger_path, ledger)

    rows = panel(ledger, cfg, prices, fx)
    write_note(report_path(cfg, cycle), render_monthly_report(record, review, rows, cfg))
    write_dashboard(cfg, ledger, market, prices, fx)
    return {"record": record, "review": review, "rows": rows, "unknown_fractionable": unknown}


def write_dashboard(cfg: Config, ledger: dict, market: Market, prices=None, fx=None) -> Path:
    if prices is None:
        prices = market.prices(tickers_needed(ledger, cfg))
    if fx is None:
        fx = market.fx_gbpusd()
    text = render_dashboard(panel(ledger, cfg, prices, fx), journal_outcomes(ledger, cfg, prices),
                            ledger, cfg, fx, L.now_iso(), market.used)
    path = dashboard_path(cfg)
    write_note(path, text)
    return path


def verify(cfg: Config, ledger: dict, restore: bool = False) -> list[str]:
    """Check every journal entry is untouched, in the ledger and in the vault."""
    problems = []
    for entry in ledger["journal"]:
        c = entry["cycle"]
        if L.journal_hash(entry) != entry["sha256"]:
            problems.append(f"{c}: ledger entry was edited after locking (hash mismatch)")
        path = journal_path(cfg, c)
        expected = render_journal_entry(entry, cfg)
        if not path.exists():
            if restore:
                write_locked(path, expected)
                problems.append(f"{c}: vault note was missing — restored from ledger")
            else:
                problems.append(f"{c}: vault note missing ({path}); run `verify --restore`")
        elif path.read_text(encoding="utf-8") != expected:
            problems.append(f"{c}: vault note was edited after locking ({path})")
    return problems
