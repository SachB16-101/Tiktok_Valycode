# Paper Trading Simulator — instructions for Claude Code

A learning tool: three virtual portfolios (£100 / £500 / £1,000 a month) buying real-priced
US stocks, each measured against a plain S&P 500 (VOO) position fed identical contributions.
No real money is involved. Saving comes first; this is practice.

All commands run from this folder: `./ptrade <command>` (Python 3.10+, stdlib only, no install).

## The visual app

`./ptrade` with no command (or `Paper Trading.bat` on Windows) opens a local browser UI
(`paper_trading/web.py` + `paper_trading/static/index.html`, 127.0.0.1 only). It calls the same
`workflow.py` functions as the CLI, so the rules below apply to both.

## When the user asks for a returns breakdown

Run `./ptrade report` and summarise it. Lead with the **gap vs benchmark** for each portfolio —
that is the number that matters — then absolute £ and % return, then anything notable from
"What scale changes" (uninvested cash, whole-share limits, fees). Use `./ptrade report --write`
if they also want the Obsidian dashboard refreshed.

For "how have my decisions done?", run `./ptrade journal --full` and put each decision's
reasoning beside its outcome.

## Running the monthly cycle (start of each month)

1. `./ptrade report` — show the user what last month's decisions did. Quote their locked
   reasoning from last month next to the outcome.
2. Ask the user for this month's allocation: tickers and percentages summing to 100.
   Any ticker is allowed; new ones are added to the universe automatically.
3. Preview it: `./ptrade month --alloc "VOO=60, TSLA=40" --dry-run` (saves nothing)
   and point out any ticker that won't be bought in the smaller portfolios (whole-share-only
   tickers like leveraged ETFs) before they commit.
4. Ask the user for their reasoning and (optionally) what they expect to happen.
5. Execute with their words **verbatim**:
   `./ptrade month --alloc "..." --reasoning "..." --expect "..." --yes`
   (For long text, write it to a temp file and use `--reasoning-file`.)
6. Tell them where the report and dashboard were written.

## Rules

- **Never write, paraphrase, or "improve" the user's reasoning.** The journal exists to record
  *their* judgement before the outcome is known. If they haven't given reasoning, ask — don't
  run step 5.
- **Never edit or delete** journal notes (`Journal/*.md`) or `data/ledger.json`. Entries are
  locked by design and `./ptrade verify` checks their hashes. If the user wants to add
  hindsight, suggest a separate note that links to the locked one.
- Don't run `month` twice in one calendar month; the app refuses anyway.
- Don't present results as investment advice or predictions. With ~12 decisions a year there is
  nowhere near enough data to separate skill from luck — say so if they read too much into a
  good or bad month.
- API keys live in `.env` (gitignored). Never print them, commit them, or put them in notes.

## Where things are

| What | Where |
| --- | --- |
| Settings (universe, portfolios, fees, benchmark) | `config.json` |
| Secrets + vault path | `.env` (copy from `.env.example`) |
| Vault notes | `$OBSIDIAN_VAULT_PATH/Finances/Investments/Paper Trading/` |
| Ledger (source of truth) | `…/Paper Trading/data/ledger.json` (or `$PTRADE_DATA_DIR`) |
| Code | `paper_trading/` — `engine.py` (buys), `analytics.py` (returns, gaps), `render.py` (markdown), `workflow.py` (cycle + vault writes), `market.py` (Alpaca → Finnhub, FX) |
| Tests | `python3 -m unittest discover -s tests` |

## Model, in brief

- Contributions are in GBP, converted to USD at the ECB rate minus `fx_fee_pct`.
- Each month's cash is split by that month's allocation. Nothing is ever sold (Phase 1).
- Fractional shares where Alpaca says the asset is fractionable; otherwise whole shares only,
  and the remainder carries forward as cash into next month.
- The benchmark shadow pays the same fees and buys VOO with the same money on the same day.
- Values are shown in GBP at today's rate, so currency moves affect both sides equally.

## Phase 2 (not built yet)

Behavioural feedback once there's history: chasing last month's winner, concentrating after a
win, drifting from the benchmark without a stated reason. The ledger already stores everything
needed (allocations, prices at decision time, reasoning, benchmark weight per month).
