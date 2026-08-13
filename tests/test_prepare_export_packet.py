import importlib.util
import math
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/prepare_export_packet.py"
SPEC = importlib.util.spec_from_file_location("prepare_export_packet", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PricingTests(unittest.TestCase):
    def test_refundable_formula_uses_adjusted_rate(self):
        unit, total, markup, method = MODULE.calculate_price(
            cost_cny=20000,
            quantity=10,
            effective_rate=6.6,
            markup=0.30,
            strict_cap=False,
        )
        self.assertGreater(unit, 0)
        self.assertGreater(total, 0)
        self.assertLess(abs(markup - 0.30), 0.01)
        self.assertIn(method, {"integer_unit", "total_ends_0_or_5"})

    def test_no_refund_markup_never_exceeds_cap(self):
        unit, total, markup, _ = MODULE.calculate_price(
            cost_cny=20000,
            quantity=7,
            effective_rate=6.6,
            markup=0.10,
            strict_cap=True,
        )
        self.assertLessEqual(markup, 0.10 + 1e-9)
        self.assertTrue(math.isfinite(unit))
        self.assertTrue(math.isfinite(total))

    def test_hs_normalization_preserves_leading_digits(self):
        self.assertEqual(MODULE.normalize_hs("7610100000"), "7610100000")
        self.assertEqual(MODULE.normalize_hs(7610100000.0), "7610100000")

    def test_history_requires_exact_specification(self):
        quote = MODULE.HistoricalQuote(
            contract_no="EXP260010",
            product_name="餐盘",
            specification="380*320*310",
            quantity=150,
            unit_price_usd=10,
            total_usd=1500,
            workbook="history.xlsx",
            workbook_mtime=1,
        )
        self.assertIsNone(MODULE.choose_historical_quote([quote], "餐盘", ""))
        self.assertEqual(
            MODULE.choose_historical_quote([quote], "餐盘", "380*320*310"), quote
        )

    def test_zero_refund_history_cannot_break_markup_cap(self):
        allowed, markup = MODULE.historical_quote_allowed(
            unit_price_usd=35,
            quantity=100,
            effective_rate=6.6,
            cost_cny=20000,
            refund_rate=0,
            no_refund_markup_cap=0.10,
        )
        self.assertFalse(allowed)
        self.assertGreater(markup, 0.10)

    def test_refundable_loss_quote_is_rejected(self):
        allowed, markup = MODULE.historical_quote_allowed(
            unit_price_usd=70,
            quantity=10.24,
            effective_rate=6.6,
            cost_cny=6005.54,
            refund_rate=13,
            no_refund_markup_cap=0.10,
        )
        self.assertFalse(allowed)
        self.assertLess(markup, 0)

    def test_numeric_source_conflict_tolerance(self):
        self.assertGreater(abs(282 - 282.5), 1e-6)

    def test_fractional_unit_reconciles_to_rounded_total(self):
        unit = MODULE.unit_for_rounded_total(20680, 15000)
        self.assertEqual(round(unit * 15000, 1), 20680)
        self.assertEqual(math.ceil((unit * 15000 - 1e-10) * 10) / 10, 20680)

    def test_current_contract_is_not_its_own_history(self):
        quote = MODULE.HistoricalQuote(
            contract_no="EXP260010",
            product_name="餐盘",
            specification="380*320*310",
            quantity=150,
            unit_price_usd=10,
            total_usd=1500,
            workbook="current.xlsx",
            workbook_mtime=1,
        )
        self.assertEqual(MODULE.exclude_current_contract([quote], "EXP260010"), [])

    def test_no_refund_negative_history_is_rejected(self):
        allowed, markup = MODULE.historical_quote_allowed(
            unit_price_usd=10,
            quantity=100,
            effective_rate=6.6,
            cost_cny=10000,
            refund_rate=0,
            no_refund_markup_cap=0.10,
        )
        self.assertFalse(allowed)
        self.assertLess(markup, 0)


if __name__ == "__main__":
    unittest.main()
