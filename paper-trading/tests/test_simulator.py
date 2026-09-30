import json
import os
import stat
import tempfile
import unittest
from pathlib import Path

from paper_trading import ledger as L
from paper_trading.analytics import journal_outcomes, last_cycle_review, panel
from paper_trading.config import load_config
from paper_trading.engine import buy_book, parse_allocation
from paper_trading.market import Market, OfflineSource
from paper_trading.workflow import execute, journal_path, lock_journal, report_path, verify, dashboard_path

ROOT = Path(__file__).resolve().parent.parent


def offline(tmp: Path, name: str, prices: dict, fx: float = 1.25, non_fractionable=()) -> Market:
    p = tmp / f"{name}.json"
    p.write_text(json.dumps({"fx_gbpusd": fx, "prices": prices, "non_fractionable": list(non_fractionable)}))
    return Market([OfflineSource(p)])


class ParseAllocationTest(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(parse_allocation("voo=60, TSLA=40"), {"VOO": 60.0, "TSLA": 40.0})
        self.assertEqual(parse_allocation("VOO:50 TSLA 25% IONQ=25"), {"VOO": 50.0, "TSLA": 25.0, "IONQ": 25.0})
        self.assertEqual(parse_allocation("BRK.B=100"), {"BRK.B": 100.0})

    def test_must_sum_to_100(self):
        with self.assertRaisesRegex(ValueError, "sum to 90"):
            parse_allocation("VOO=60, TSLA=30")

    def test_rejects_junk_and_duplicates(self):
        for bad in ("VOO", "VOO=60 TSLA", "VOO=50 VOO=50", "VOO=0 TSLA=100", ""):
            with self.assertRaises(ValueError, msg=bad):
                parse_allocation(bad)


class BuyBookTest(unittest.TestCase):
    def test_fractional_and_whole_share_limits(self):
        trades, skipped, left = buy_book(
            125.0, {"VOO": 50, "TQQQ": 50}, {"VOO": 500.0, "TQQQ": 80.0},
            {"VOO": True, "TQQQ": False}, commission_usd=0, min_order_usd=1)
        by = {t["ticker"]: t for t in trades}
        self.assertAlmostEqual(by["VOO"]["qty"], 0.125)
        self.assertNotIn("TQQQ", by)  # $62.50 can't buy one $80 share
        self.assertEqual(skipped[0]["ticker"], "TQQQ")
        self.assertAlmostEqual(left, 62.5)

    def test_whole_shares_bought_when_affordable(self):
        trades, _, left = buy_book(1250.0, {"TQQQ": 100}, {"TQQQ": 80.0}, {"TQQQ": False}, 0, 1)
        self.assertEqual(trades[0]["qty"], 15.0)
        self.assertAlmostEqual(left, 50.0)

    def test_min_order(self):
        trades, skipped, _ = buy_book(10.0, {"VOO": 95, "IONQ": 5}, {"VOO": 500, "IONQ": 40},
                                      {"VOO": True, "IONQ": True}, 0, 1)
        self.assertEqual([t["ticker"] for t in trades], ["VOO"])
        self.assertIn("minimum", skipped[0]["reason"])


class CycleTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.cfg = load_config(ROOT / "config.json", vault_path=self.vault)
        self.ledger = L.empty_ledger()

    def run_cycle(self, cycle, alloc, market, reasoning="Because index first."):
        lock_journal(self.cfg, self.ledger, cycle, parse_allocation(alloc), reasoning, "Expect noise.")
        return execute(self.cfg, self.ledger, market, cycle)

    def test_all_benchmark_matches_benchmark(self):
        m = offline(self.tmp, "a", {"VOO": 500.0})
        self.run_cycle("2026-10", "VOO=100", m)
        m2 = offline(self.tmp, "b", {"VOO": 550.0})
        rows = panel(self.ledger, self.cfg, m2.prices(["VOO"]), 1.25)
        self.assertEqual(len(rows), 3)
        for r in rows:
            self.assertAlmostEqual(r.gap_pct, 0.0, places=9)
            self.assertAlmostEqual(r.gap_gbp, 0.0, places=6)
            # 0.15% FX fee then a 10% rise
            self.assertAlmostEqual(r.actual.return_pct, 0.9985 * 1.10 - 1, places=6)

    def test_two_cycles_gap_review_and_scale_effects(self):
        m1 = offline(self.tmp, "m1", {"VOO": 500.0, "TSLA": 250.0, "TQQQ": 80.0}, non_fractionable=["TQQQ"])
        r1 = self.run_cycle("2026-10", "VOO=50, TSLA=30, TQQQ=20", m1)
        p100 = r1["record"]["portfolios"]["p100"]
        # £100 * 20% ≈ $25 can't buy a whole $80 TQQQ share; £1,000 can
        self.assertIn("TQQQ", [s["ticker"] for s in p100["skipped"]])
        self.assertIn("TQQQ", [t["ticker"] for t in r1["record"]["portfolios"]["p1000"]["trades"]])
        self.assertGreater(p100["cash_usd_after"], 20)

        m2 = offline(self.tmp, "m2", {"VOO": 510.0, "TSLA": 200.0, "TQQQ": 90.0}, non_fractionable=["TQQQ"])
        prices2 = m2.prices(["VOO", "TSLA", "TQQQ"])
        review = last_cycle_review(self.ledger, self.cfg, prices2, 1.25)
        self.assertEqual(review["cycle"], "2026-10")
        self.assertAlmostEqual(review["allocation_move_pct"], 0.5 * 0.02 + 0.3 * -0.2 + 0.2 * 0.125)
        self.assertEqual(review["journal"]["reasoning"], "Because index first.")

        r2 = self.run_cycle("2026-11", "VOO=100", m2)
        # carried cash gets deployed next month
        self.assertLess(r2["record"]["portfolios"]["p100"]["cash_usd_after"], 1e-3)
        rows = r2["rows"]
        for r in rows:
            self.assertEqual(r.actual.book.contributed_gbp, 2 * r.portfolio.monthly_gbp)
            self.assertLess(r.gap_pct, 0)  # TSLA fell 20%: behind the index
        report = report_path(self.cfg, "2026-11").read_text()
        self.assertIn("What last month's decisions did", report)
        self.assertIn("Because index first.", report)
        self.assertIn("Gap vs benchmark", dashboard_path(self.cfg).read_text())

        outcomes = journal_outcomes(self.ledger, self.cfg, prices2)
        self.assertEqual(len(outcomes), 2)
        self.assertAlmostEqual(outcomes[1]["gap_pct"], 0.0)

    def test_journal_locked_before_execution_and_tamper_detected(self):
        m = offline(self.tmp, "a", {"VOO": 500.0})
        with self.assertRaisesRegex(ValueError, "reasoning must come first"):
            execute(self.cfg, self.ledger, m, "2026-10")
        with self.assertRaisesRegex(ValueError, "required"):
            lock_journal(self.cfg, self.ledger, "2026-10", {"VOO": 100.0}, "  ", "")
        self.run_cycle("2026-10", "VOO=100", m)
        with self.assertRaisesRegex(ValueError, "already locked"):
            lock_journal(self.cfg, self.ledger, "2026-10", {"VOO": 100.0}, "again", "")
        with self.assertRaisesRegex(ValueError, "already been executed"):
            execute(self.cfg, self.ledger, m, "2026-10")

        note = journal_path(self.cfg, "2026-10")
        self.assertFalse(os.stat(note).st_mode & stat.S_IWUSR)
        self.assertEqual(verify(self.cfg, self.ledger), [])

        note.chmod(0o644)
        note.write_text(note.read_text().replace("Because index first.", "Hindsight edit."))
        self.assertIn("edited", verify(self.cfg, self.ledger)[0])

        self.ledger["journal"][0]["reasoning"] = "rewritten"
        self.assertTrue(any("hash mismatch" in p for p in verify(self.cfg, self.ledger)))

    def test_ledger_round_trip(self):
        m = offline(self.tmp, "a", {"VOO": 500.0, "TSLA": 250.0})
        self.run_cycle("2026-10", "VOO=70 TSLA=30", m)
        loaded = L.load(self.cfg.ledger_path)
        self.assertEqual(loaded["cycles"][0]["allocation"], {"VOO": 70.0, "TSLA": 30.0})
        self.assertEqual(L.journal_hash(loaded["journal"][0]), loaded["journal"][0]["sha256"])


if __name__ == "__main__":
    unittest.main()
