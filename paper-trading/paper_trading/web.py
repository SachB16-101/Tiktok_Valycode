"""Local browser interface: `python -m paper_trading ui`.

Serves one page on 127.0.0.1 only. Uses the same workflow functions as the
command line, so the journal-before-execution rule and vault writes are identical.
"""

from __future__ import annotations

import json
import secrets
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import ledger as L
from .analytics import journal_outcomes, last_cycle_review, panel, tickers_needed
from .config import Config, load_config, save_universe
from .engine import cycle_id, parse_allocation
from .market import MarketError, build_market
from .workflow import (dashboard_path, execute, journal_path, lock_journal, preview, report_path)

STATIC = Path(__file__).resolve().parent / "static"
TOKEN = secrets.token_urlsafe(24)  # stops other websites posting to this local server
WRITE_LOCK = threading.Lock()


# ---------------------------------------------------------------- serialisers

def _panel_json(rows) -> list[dict]:
    out = []
    for r in rows:
        a, b = r.actual, r.bench
        out.append({
            "id": r.portfolio.id, "name": r.portfolio.name, "monthly_gbp": r.portfolio.monthly_gbp,
            "contributed_gbp": a.book.contributed_gbp, "value_gbp": a.value_gbp,
            "return_gbp": a.return_gbp, "return_pct": a.return_pct,
            "bench_value_gbp": b.value_gbp, "bench_return_pct": b.return_pct,
            "gap_pct": r.gap_pct, "gap_gbp": r.gap_gbp,
            "fees_gbp": a.book.fees_gbp, "cash_gbp": a.cash_gbp, "months": a.book.months,
            "holdings": [{"ticker": h.ticker, "qty": h.qty, "price_usd": h.price_usd,
                          "value_gbp": h.value_gbp, "cost_gbp": h.cost_gbp, "gain_gbp": h.gain_gbp,
                          "weight": h.weight} for h in a.holdings],
        })
    return out


def _review_json(review: dict | None) -> dict | None:
    if not review:
        return None
    out = dict(review)
    out["portfolios"] = [{**p, "portfolio": p["portfolio"].name} for p in review["portfolios"]]
    return out


def _plan_json(record: dict, cfg: Config) -> list[dict]:
    fx = record["fx_gbpusd"]
    out = []
    for p in cfg.portfolios:
        rec = record["portfolios"].get(p.id)
        if not rec:
            continue
        out.append({
            "name": p.name, "contribution_gbp": rec["contribution_gbp"], "fx_fee_gbp": rec["fx_fee_gbp"],
            "usd_available": rec["usd_available"], "cash_usd_after": rec["cash_usd_after"],
            "trades": [{**t, "cost_gbp": t["cost_usd"] / fx} for t in rec["trades"]],
            "skipped": rec["skipped"],
        })
    return out


def build_state() -> dict:
    cfg = load_config()
    ledger = L.load(cfg.ledger_path)
    cycle = cycle_id(datetime.now())
    pending = L.journal_for(ledger, cycle)
    state = {
        "cycle": cycle,
        "already_run": L.cycle_record(ledger, cycle) is not None,
        "pending": pending if pending and not L.cycle_record(ledger, cycle) else None,
        "benchmark": cfg.benchmark,
        "universe": [{"ticker": t, "note": n} for t, n in cfg.universe.items()],
        "portfolios": [{"id": p.id, "name": p.name, "monthly_gbp": p.monthly_gbp} for p in cfg.portfolios],
        "fx_fee_pct": cfg.fx_fee_pct,
        "vault_folder": str(cfg.folder),
        "vault_is_fallback": cfg.vault_is_fallback,
        "cycles": [c["cycle"] for c in ledger["cycles"]],
        "error": None,
    }
    try:
        market = build_market()
        prices = market.prices(tickers_needed(ledger, cfg))
        fx = market.fx_gbpusd()
    except MarketError as e:
        state["error"] = str(e)
        return state
    try:  # prices for the picker are nice-to-have; one bad ticker shouldn't blank the page
        universe_prices = market.prices(cfg.universe)
    except MarketError:
        universe_prices = {}
    state.update({
        "fx": fx,
        "prices": {**universe_prices, **prices},
        "sources": market.used,
        "panel": _panel_json(panel(ledger, cfg, prices, fx)),
        "review": _review_json(last_cycle_review(ledger, cfg, prices, fx)),
        "outcomes": journal_outcomes(ledger, cfg, prices),
    })
    return state


def add_tickers(cfg: Config, market, tickers) -> list[str]:
    added = []
    for t in tickers:
        if t not in cfg.universe:
            market.prices([t])  # fails loudly if nothing can price it
            cfg.universe[t] = market.asset_name(t) or ""
            added.append(t)
    if added:
        save_universe(cfg)
    return added


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "PaperTrading/1.0"

    def log_message(self, fmt, *args):  # keep the PowerShell window quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, data) -> None:
        self._send(code, json.dumps(data, default=str).encode("utf-8"), "application/json")

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            html = (STATIC / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", TOKEN)
            return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
        if self.path == "/api/state":
            try:
                return self._json(200, build_state())
            except Exception as e:  # surface anything unexpected in the page, not a blank screen
                return self._json(500, {"error": f"{type(e).__name__}: {e}"})
        self._send(404, b"Not found", "text/plain")

    def do_POST(self):
        if self.headers.get("X-Token") != TOKEN:
            return self._json(403, {"error": "Bad token — reload the page."})
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            handler = {"/api/preview": self.api_preview, "/api/execute": self.api_execute,
                       "/api/universe": self.api_universe}.get(self.path)
            if not handler:
                return self._json(404, {"error": "Unknown endpoint"})
            return self._json(200, handler(body))
        except (ValueError, MarketError, FileExistsError) as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})

    @staticmethod
    def _allocation(body) -> dict[str, float]:
        alloc = body.get("allocation") or {}
        return parse_allocation(", ".join(f"{t}={float(w):g}" for t, w in alloc.items() if float(w) > 0))

    def api_preview(self, body):
        cfg = load_config()
        ledger = L.load(cfg.ledger_path)
        market = build_market()
        allocation = self._allocation(body)
        plan, unknown = preview(ledger, cfg, market, cycle_id(datetime.now()), allocation)
        return {"plan": _plan_json(plan, cfg), "fx": plan["fx_gbpusd"], "unknown_fractionable": unknown}

    def api_execute(self, body):
        with WRITE_LOCK:
            cfg = load_config()
            ledger = L.load(cfg.ledger_path)
            market = build_market()
            cycle = cycle_id(datetime.now())
            if L.cycle_record(ledger, cycle):
                raise ValueError(f"{cycle} has already been run")
            if not L.journal_for(ledger, cycle):
                allocation = self._allocation(body)
                add_tickers(cfg, market, allocation)
                lock_journal(cfg, ledger, cycle, allocation, body.get("reasoning", ""), body.get("expectation", ""))
            result = execute(cfg, ledger, market, cycle)
            return {
                "plan": _plan_json(result["record"], cfg),
                "journal": str(journal_path(cfg, cycle)),
                "report": str(report_path(cfg, cycle)),
                "dashboard": str(dashboard_path(cfg)),
            }

    def api_universe(self, body):
        with WRITE_LOCK:
            cfg = load_config()
            ticker = str(body.get("ticker", "")).strip().upper()
            if not ticker:
                raise ValueError("Enter a ticker")
            if body.get("action") == "remove":
                if ticker == cfg.benchmark:
                    raise ValueError(f"{ticker} is the benchmark and can't be removed")
                cfg.universe.pop(ticker, None)
                save_universe(cfg)
                return {"removed": ticker}
            added = add_tickers(cfg, build_market(), [ticker])
            return {"added": added, "note": cfg.universe.get(ticker, "")}


def serve(port: int = 8765, open_browser: bool = True) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Paper Trading is running at {url}")
    print("Keep this window open while you use it. Press Ctrl+C to stop.")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
