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


if __name__ == "__main__":
    unittest.main()
