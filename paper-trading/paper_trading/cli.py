"""ptrade — command line for the paper trading simulator."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from . import ledger as L
from .analytics import journal_outcomes, last_cycle_review, panel, tickers_needed
from .config import Config, load_config, load_dotenv, save_universe
from .engine import cycle_id, parse_allocation
from .market import Market, MarketError, build_market
from .render import (alloc_str, render_execution, render_holdings, render_outcomes, render_panel,
                     render_review, render_scale, usd)
from .workflow import (dashboard_path, execute, journal_path, lock_journal, preview, report_path,
                       verify, write_dashboard)


def _warn_vault(cfg: Config) -> None:
    if cfg.vault_is_fallback:
        print(f"⚠️  OBSIDIAN_VAULT_PATH is not set — writing to {cfg.vault_path} instead.\n"
              "   Set it in paper-trading/.env to write into your vault.\n", file=sys.stderr)


def _ask(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        raise SystemExit("\nAborted (no input).")


def _ask_multiline(label: str, required: bool) -> str:
    print(f"{label}\n(finish with an empty line)")
    lines: list[str] = []
    while True:
        line = _ask("  ")
        if line.strip():
            lines.append(line)
        elif lines or not required:
            return "\n".join(lines)
        else:
            print("  This one is required — write at least a sentence.")


def _ensure_universe(cfg: Config, market: Market, tickers) -> None:
    added = [t for t in tickers if t not in cfg.universe]
    for t in added:
        cfg.universe[t] = market.asset_name(t) or ""
    if added:
        save_universe(cfg)
        print(f"Added to universe: {', '.join(added)}")


# ---------------------------------------------------------------- commands

def cmd_init(cfg: Config, args) -> int:
    _warn_vault(cfg)
    cfg.folder.mkdir(parents=True, exist_ok=True)
    (cfg.folder / "Journal").mkdir(exist_ok=True)
    (cfg.folder / "Reports").mkdir(exist_ok=True)
    if not cfg.ledger_path.exists():
        L.save(cfg.ledger_path, L.empty_ledger())
        print(f"Created ledger: {cfg.ledger_path}")
    else:
        print(f"Ledger exists: {cfg.ledger_path}")
    print(f"Vault folder:  {cfg.folder}")
    try:
        market = build_market()
        prices = market.prices([cfg.benchmark])
        fx = market.fx_gbpusd()
        print(f"Prices OK:     {cfg.benchmark} {usd(prices[cfg.benchmark])} via {market.used[cfg.benchmark]}; "
              f"GBP/USD {fx:.4f}")
        frac = market.fractionable(cfg.benchmark)
        print(f"Asset data:    {'OK' if frac is not None else 'unavailable (Finnhub only — fractional status assumed)'}")
    except MarketError as e:
        print(f"⚠️  Market data not working yet: {e}")
        return 1
    return 0


def cmd_report(cfg: Config, args) -> int:
    ledger = L.load(cfg.ledger_path)
    market = build_market()
    prices = market.prices(tickers_needed(ledger, cfg))
    fx = market.fx_gbpusd()
    rows = panel(ledger, cfg, prices, fx)
    print(f"# Returns breakdown — {datetime.now():%Y-%m-%d %H:%M}  (GBP/USD {fx:.4f})\n")
    print("## Benchmark panel\n\n" + render_panel(rows, cfg) + "\n")
    print("## What scale changes\n\n" + render_scale(rows, cfg) + "\n")
    print("## Holdings\n\n" + (render_holdings(rows) or "_None yet._") + "\n")
    print("## Since the last allocation\n\n" + render_review(last_cycle_review(ledger, cfg, prices, fx), cfg) + "\n")
    if args.write:
        _warn_vault(cfg)
        print(f"Dashboard written: {write_dashboard(cfg, ledger, market, prices, fx)}")
    return 0


def cmd_journal(cfg: Config, args) -> int:
    ledger = L.load(cfg.ledger_path)
    market = build_market()
    prices = market.prices(tickers_needed(ledger, cfg))
    outcomes = journal_outcomes(ledger, cfg, prices)
    print(render_outcomes(outcomes, cfg))
    if args.full:
        for o in outcomes:
            e = o["entry"]
            print(f"\n---\n## {e['cycle']} — {alloc_str(e['allocation'])}\nLocked {e['created_at']}\n")
            print(e["reasoning"])
            if e.get("expectation"):
                print(f"\nExpected: {e['expectation']}")
            if o["executed"]:
                print("\nSince then: " + "; ".join(
                    f"{p['ticker']} {p['move_pct'] * 100:+.2f}%" for p in o["per_ticker"])
                      + f" | mix {o['allocation_move_pct'] * 100:+.2f}% vs {cfg.benchmark} "
                        f"{o['bench_move_pct'] * 100:+.2f}%")
    return 0


def cmd_month(cfg: Config, args) -> int:
    _warn_vault(cfg)
    now = datetime.now()
    cycle = cycle_id(now)
    ledger = L.load(cfg.ledger_path)
    market = build_market()
    interactive = sys.stdin.isatty() and not args.yes

    if L.cycle_record(ledger, cycle):
        print(f"{cycle} has already been run. See {report_path(cfg, cycle)}")
        print("Use `ptrade report` for a current breakdown.")
        return 1

    # 1. Report what last month's decisions did.
    prices = market.prices(tickers_needed(ledger, cfg))
    fx = market.fx_gbpusd()
    print(f"# Monthly cycle {cycle}\n\n## 1. What last month's decisions did\n")
    print(render_review(last_cycle_review(ledger, cfg, prices, fx), cfg))
    rows = panel(ledger, cfg, prices, fx)
    if rows:
        print("\n" + render_panel(rows, cfg))

    pending = L.journal_for(ledger, cycle)
    if pending:
        # Reasoning was locked earlier but execution didn't finish — the allocation can't change now.
        print(f"\nA locked journal entry for {cycle} exists but was never executed "
              f"({alloc_str(pending['allocation'])}). Executing it now.")
    else:
        # 2. Allocation.
        print("\n## 2. This month's allocation\n")
        print("Universe: " + ", ".join(cfg.universe) + "  (any other ticker is added automatically)")
        print("Contributions: " + ", ".join(p.name for p in cfg.portfolios) + " — same % split for all three.\n")
        if args.alloc:
            allocation = parse_allocation(args.alloc)
        elif interactive:
            while True:
                try:
                    allocation = parse_allocation(_ask("Allocation (e.g. VOO=60, TSLA=25, IONQ=15): "))
                    break
                except ValueError as e:
                    print(f"  {e}")
        else:
            print("Non-interactive run needs --alloc.", file=sys.stderr)
            return 2
        _ensure_universe(cfg, market, allocation)

        plan, unknown = preview(ledger, cfg, market, cycle, allocation)
        print("\nAt current prices this would buy:\n")
        print(render_execution(plan, cfg, preview=True))
        if unknown:
            print(f"\n(Fractional status unknown for {', '.join(unknown)} — assumed fractional. "
                  "Add Alpaca keys or list them under non_fractionable in config.json.)")
        if args.dry_run:
            print("\nDry run — nothing locked or bought.")
            return 0

        # 3. Reasoning, locked before execution.
        print("\n## 3. Decision journal (locked once saved — no editing afterwards)\n")
        reasoning = args.reasoning or (Path(args.reasoning_file).read_text(encoding="utf-8")
                                       if args.reasoning_file else "")
        expectation = args.expect or ""
        if not reasoning:
            if not interactive:
                print("Non-interactive run needs --reasoning or --reasoning-file. "
                      "The reasoning must be yours, written before execution.", file=sys.stderr)
                return 2
            reasoning = _ask_multiline("Why this allocation? What's the thesis, and what risk are you taking on purpose?", True)
            expectation = _ask_multiline("What do you expect to happen, and what would make you change your mind? (optional)", False)

        if interactive:
            if _ask(f"\nLock this journal entry and execute {alloc_str(allocation)}? [y/N] ").strip().lower() not in ("y", "yes"):
                print("Cancelled. Nothing saved.")
                return 1
        entry = lock_journal(cfg, ledger, cycle, allocation, reasoning, expectation)
        print(f"Journal locked: {journal_path(cfg, cycle)}  (sha256 {entry['sha256'][:12]}…)")

    if args.dry_run:
        print("\nDry run — nothing bought.")
        return 0

    # 4. Execute at current price.
    result = execute(cfg, ledger, market, cycle)
    print("\n## 4. Executed\n")
    print(render_execution(result["record"], cfg))
    print("\n## Benchmark panel\n\n" + render_panel(result["rows"], cfg))
    print(f"\nReport:    {report_path(cfg, cycle)}\nDashboard: {dashboard_path(cfg)}")
    return 0


def cmd_quote(cfg: Config, args) -> int:
    market = build_market()
    tickers = [t.upper() for t in args.tickers]
    prices = market.prices(tickers)
    for t in tickers:
        frac = market.fractionable(t)
        flag = {True: "fractional", False: "whole shares only", None: "fractional status unknown"}[frac]
        print(f"{t:8} {usd(prices[t]):>12}  via {market.used[t]:8} {flag}")
    print(f"GBP/USD  {market.fx_gbpusd():.4f}")
    return 0


def cmd_universe(cfg: Config, args) -> int:
    if args.action == "add":
        market = build_market()
        for t in (x.upper() for x in args.tickers):
            market.prices([t])  # fails loudly if nothing can price it
            cfg.universe[t] = args.note or cfg.universe.get(t) or market.asset_name(t) or ""
            print(f"Added {t}" + (f" — {cfg.universe[t]}" if cfg.universe[t] else ""))
        save_universe(cfg)
    elif args.action == "remove":
        for t in (x.upper() for x in args.tickers):
            if t == cfg.benchmark:
                print(f"{t} is the benchmark; not removed.")
                continue
            cfg.universe.pop(t, None)
            print(f"Removed {t} (existing holdings are unaffected)")
        save_universe(cfg)
    else:
        print(f"Benchmark: {cfg.benchmark}")
        for t, n in cfg.universe.items():
            print(f"  {t:8} {n}")
    return 0


def cmd_verify(cfg: Config, args) -> int:
    ledger = L.load(cfg.ledger_path)
    problems = verify(cfg, ledger, restore=args.restore)
    if not problems:
        print(f"All {len(ledger['journal'])} journal entries intact.")
        return 0
    for p in problems:
        print(f"⚠️  {p}")
    return 1


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="ptrade", description="Paper trading simulator with an Obsidian decision journal.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="create vault folders + ledger, check API keys").set_defaults(fn=cmd_init)

    r = sub.add_parser("report", help="returns breakdown vs benchmark (read-only)")
    r.add_argument("--write", action="store_true", help="also refresh the dashboard note in the vault")
    r.set_defaults(fn=cmd_report)

    m = sub.add_parser("month", help="run this month's cycle: review → allocate → journal → execute")
    m.add_argument("--alloc", help='e.g. "VOO=60, TSLA=25, IONQ=15" (must sum to 100)')
    m.add_argument("--reasoning", help="your reasoning (written by you, before execution)")
    m.add_argument("--reasoning-file", help="read reasoning from a file")
    m.add_argument("--expect", help="what you expect to happen (optional)")
    m.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    m.add_argument("--dry-run", action="store_true", help="show what would be bought; save nothing")
    m.set_defaults(fn=cmd_month)

    j = sub.add_parser("journal", help="every locked decision beside its outcome")
    j.add_argument("--full", action="store_true", help="print full reasoning for each entry")
    j.set_defaults(fn=cmd_journal)

    q = sub.add_parser("quote", help="current price + fractional status")
    q.add_argument("tickers", nargs="+")
    q.set_defaults(fn=cmd_quote)

    u = sub.add_parser("universe", help="list / add / remove tickers")
    u.add_argument("action", choices=["list", "add", "remove"], nargs="?", default="list")
    u.add_argument("tickers", nargs="*")
    u.add_argument("--note", help="description to store with an added ticker")
    u.set_defaults(fn=cmd_universe)

    v = sub.add_parser("verify", help="check no journal entry has been edited since locking")
    v.add_argument("--restore", action="store_true", help="recreate missing vault notes from the ledger")
    v.set_defaults(fn=cmd_verify)
    return ap


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = build_parser().parse_args(argv)
    cfg = load_config()
    try:
        return args.fn(cfg, args)
    except (MarketError, ValueError, FileExistsError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrupted. Nothing further saved.", file=sys.stderr)
        return 130
