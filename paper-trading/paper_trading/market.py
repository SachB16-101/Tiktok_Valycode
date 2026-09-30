"""Price, FX and asset data.

Order of preference for prices: Alpaca market data -> Finnhub quote.
Any ticker Alpaca can't price (error, rate limit, unknown) falls through to Finnhub.
GBP/USD comes from the ECB reference rate (frankfurter), or PTRADE_GBPUSD.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class MarketError(Exception):
    pass


def _get_json(url: str, headers: dict | None = None, timeout: float = 15) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "paper-trading-sim/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise MarketError(f"{url.split('?')[0]} returned HTTP {e.code}") from e
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        raise MarketError(f"{url.split('?')[0]} failed: {e}") from e


class AlpacaSource:
    name = "alpaca"

    def __init__(self, key: str, secret: str, feed: str = "iex",
                 data_url: str = "https://data.alpaca.markets",
                 trading_url: str = "https://paper-api.alpaca.markets"):
        self.headers = {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret}
        self.feed, self.data_url, self.trading_url = feed, data_url.rstrip("/"), trading_url.rstrip("/")

    def prices(self, tickers: list[str]) -> dict[str, float]:
        qs = urllib.parse.urlencode({"symbols": ",".join(tickers), "feed": self.feed})
        data = _get_json(f"{self.data_url}/v2/stocks/trades/latest?{qs}", self.headers)
        return {sym: float(t["p"]) for sym, t in (data.get("trades") or {}).items() if t and t.get("p")}

    def fractionable(self, ticker: str) -> bool | None:
        data = _get_json(f"{self.trading_url}/v2/assets/{urllib.parse.quote(ticker)}", self.headers)
        return bool(data["fractionable"]) if "fractionable" in data else None

    def asset_name(self, ticker: str) -> str | None:
        try:
            data = _get_json(f"{self.trading_url}/v2/assets/{urllib.parse.quote(ticker)}", self.headers)
            return data.get("name")
        except MarketError:
            return None


class FinnhubSource:
    name = "finnhub"

    def __init__(self, token: str, base: str = "https://finnhub.io/api/v1"):
        self.token, self.base = token, base.rstrip("/")

    def prices(self, tickers: list[str]) -> dict[str, float]:
        out = {}
        for i, t in enumerate(tickers):
            if i:
                time.sleep(0.25)  # free tier: ~60 calls/min, stay well under
            qs = urllib.parse.urlencode({"symbol": t, "token": self.token})
            try:
                c = _get_json(f"{self.base}/quote?{qs}").get("c")
            except MarketError:
                continue
            if c:  # Finnhub returns c=0 for unknown symbols
                out[t] = float(c)
        return out

    def fractionable(self, ticker: str) -> bool | None:
        return None

    def asset_name(self, ticker: str) -> str | None:
        return None


class OfflineSource:
    """Fixed prices from a JSON file: {"fx_gbpusd": 1.3, "prices": {"VOO": 500}}.
    For demos and tests only — set PTRADE_OFFLINE_PRICES to use it."""

    name = "offline"

    def __init__(self, path: Path):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        self._prices = {k.upper(): float(v) for k, v in data["prices"].items()}
        self.fx = data.get("fx_gbpusd")
        self._non_fractionable = {t.upper() for t in data.get("non_fractionable", [])}

    def prices(self, tickers: list[str]) -> dict[str, float]:
        return {t: self._prices[t] for t in tickers if t in self._prices}

    def fractionable(self, ticker: str) -> bool | None:
        return ticker not in self._non_fractionable

    def asset_name(self, ticker: str) -> str | None:
        return None


class Market:
    def __init__(self, sources: list, fx_override: float | None = None):
        if not sources:
            raise MarketError(
                "No price source configured. Set APCA_API_KEY_ID + APCA_API_SECRET_KEY "
                "(Alpaca paper keys) and/or FINNHUB_API_KEY in paper-trading/.env"
            )
        self.sources = sources
        self.fx_override = fx_override
        self.used: dict[str, str] = {}  # ticker -> source name, for reports

    def prices(self, tickers) -> dict[str, float]:
        wanted = sorted({t.upper() for t in tickers})
        got: dict[str, float] = {}
        errors = []
        for src in self.sources:
            missing = [t for t in wanted if t not in got]
            if not missing:
                break
            try:
                found = src.prices(missing)
            except MarketError as e:
                errors.append(f"{src.name}: {e}")
                continue
            for t, p in found.items():
                got[t] = p
                self.used[t] = src.name
        missing = [t for t in wanted if t not in got]
        if missing:
            detail = f" ({'; '.join(errors)})" if errors else ""
            raise MarketError(f"No price for {', '.join(missing)}{detail}")
        return got

    def fx_gbpusd(self) -> float:
        """USD per 1 GBP."""
        if self.fx_override:
            return float(self.fx_override)
        for src in self.sources:
            if getattr(src, "fx", None):
                return float(src.fx)
        errors = []
        for url in ("https://api.frankfurter.dev/v1/latest?base=GBP&symbols=USD",
                    "https://api.frankfurter.app/latest?from=GBP&to=USD"):
            try:
                return float(_get_json(url)["rates"]["USD"])
            except (MarketError, KeyError, TypeError, ValueError) as e:
                errors.append(str(e))
        raise MarketError("Could not fetch GBP/USD rate; set PTRADE_GBPUSD to override. " + "; ".join(errors))

    def fractionable(self, ticker: str) -> bool | None:
        for src in self.sources:
            try:
                val = src.fractionable(ticker)
            except MarketError:
                continue
            if val is not None:
                return val
        return None

    def asset_name(self, ticker: str) -> str | None:
        for src in self.sources:
            name = src.asset_name(ticker)
            if name:
                return name
        return None


def build_market() -> Market:
    offline = os.environ.get("PTRADE_OFFLINE_PRICES", "").strip()
    fx = os.environ.get("PTRADE_GBPUSD", "").strip()
    fx_override = float(fx) if fx else None
    if offline:
        return Market([OfflineSource(Path(offline).expanduser())], fx_override)
    sources: list = []
    key, secret = os.environ.get("APCA_API_KEY_ID", ""), os.environ.get("APCA_API_SECRET_KEY", "")
    if key and secret:
        sources.append(AlpacaSource(key, secret, feed=os.environ.get("APCA_DATA_FEED", "iex")))
    if os.environ.get("FINNHUB_API_KEY"):
        sources.append(FinnhubSource(os.environ["FINNHUB_API_KEY"]))
    return Market(sources, fx_override)
