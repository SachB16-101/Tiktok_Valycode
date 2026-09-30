# Paper Trading Simulator

Practise allocation decisions against real prices with virtual money, keep a locked decision
journal, and measure every choice against simply buying the S&P 500. Everything is written into
your Obsidian vault as markdown.

- Three parallel portfolios: **£100, £500, £1,000 a month**, same allocation for all three
- Real prices from **Alpaca** (paper account keys), falling back to **Finnhub**
- **Benchmark panel**: each portfolio vs a VOO position that received identical contributions,
  with absolute return, % return and the **gap vs benchmark**
- **Decision journal**: written before each allocation, then locked (read-only + SHA-256)
- **What scale changes**: fees, uninvested cash from whole-share-only tickers, and what a 10% or
  30% fall means in pounds for each portfolio

Python 3.10+, standard library only: nothing to `pip install`.

## Setup (once, on your own computer)

```bash
git clone <this repo> && cd <repo>/paper-trading
cp .env.example .env        # then fill it in (see below)
./ptrade init               # creates the vault folders + ledger, tests your keys
```

In `.env`:

1. `OBSIDIAN_VAULT_PATH`: the full path to your vault folder (the one containing `.obsidian/`).
   Notes go into `Finances/Investments/Paper Trading/` inside it.
2. `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`: from <https://app.alpaca.markets>. Switch to the
   **Paper** account, then generate API keys.
3. Optional `FINNHUB_API_KEY` (free at <https://finnhub.io>) as a fallback.

Want to try it before getting keys? `PTRADE_OFFLINE_PRICES=sample/offline-prices.json ./ptrade month --dry-run --alloc "VOO=70, TSLA=30"`

On Windows, run `python -m paper_trading <command>` from this folder instead of `./ptrade`.

## Monthly cycle

At the start of each month:

```bash
./ptrade month
```

1. **Reports** what last month's decisions did, per portfolio and per holding, with the
   reasoning you wrote at the time quoted beside the result
2. **Asks** for this month's allocation, e.g. `VOO=60, TSLA=20, IONQ=10, BOTZ=10` (must sum to 100)
3. **Previews** the buys, flagging anything a small portfolio can't afford (e.g. a $100
   leveraged-ETF share that can't be bought fractionally)
4. **Asks for your reasoning** and what you expect, then locks the journal entry
5. **Executes** at current prices (fractional where allowed) and writes the report + dashboard

Or ask Claude Code, *"run this month's paper trading cycle"*. `CLAUDE.md` tells it the
workflow, and it will ask you for the reasoning rather than write it.

## Other commands

| Command | What it does |
| --- | --- |
| `./ptrade report` | Returns breakdown vs benchmark right now (`--write` also refreshes the dashboard note) |
| `./ptrade journal [--full]` | Every locked decision beside what it has done since |
| `./ptrade quote TSLA IONQ` | Current price and whether it can be bought fractionally |
| `./ptrade universe add RKLB --note "Rocket Lab"` | Add tickers (any allocation ticker is also added automatically) |
| `./ptrade universe remove QBTS` | Remove from the list (holdings stay) |
| `./ptrade verify [--restore]` | Confirm no journal entry has been edited since it was locked |

## What lands in the vault

```
Finances/Investments/Paper Trading/
├── Paper Trading Dashboard.md        ← panel, holdings, journal vs outcome, links
├── Journal/2026-10 Decision.md       ← locked, read-only
├── Reports/2026-10 Monthly Report.md ← review → buys → benchmark panel → scale
└── data/ledger.json                  ← source of truth (every trade, every entry)
```

The ledger sits in the vault so it syncs and is backed up with your notes. Set
`PTRADE_DATA_DIR` to keep it somewhere else.

## How the numbers work

- **FX**: contributions are GBP, converted at the daily ECB rate minus `fx_fee_pct` (0.15% by
  default, roughly a UK platform's FX fee). Values are reported in GBP at today's rate, so
  currency moves hit your portfolio and the benchmark equally.
- **Buys only.** Each month's money is split by that month's allocation; nothing is sold. This
  matches "time in the market" and keeps the journal honest.
- **Fractional shares** when Alpaca marks the asset fractionable (min $1 order). Otherwise whole
  shares only, and anything left over carries forward as cash and is invested the next month.
  This is the main reason the three portfolios' percentage returns can differ.
- **Benchmark shadow**: pays the same fees and buys VOO with the same money at the same moment.
- **Gap vs benchmark** = your % return minus the benchmark's % return (percentage points), and
  in £ the difference in current value.

Settings like fees, portfolios and benchmark live in `config.json`.

## Why this runs locally, not through the Alpaca account

The Alpaca paper account is used for **market data and asset info**, not for placing orders.
The app keeps its own ledger instead, because one Alpaca account can't hold three separate
portfolios plus three benchmark shadows, and it can't take GBP contributions. The prices are the
same ones a live order would see.

## Tests

```bash
python3 -m unittest discover -s tests
```
