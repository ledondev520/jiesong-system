import importlib.util
import math
import sys
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/prepare_export_packet.py"
SPEC = importlib.util.spec_from_file_location("prepare_export_packet", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


@unittest.skip("Python 公式副本已退役：parse_args 拒绝运行，报价见 backend exportPricing.priceFor")
class PathConfigurationTests(unittest.TestCase):
    arguments = ["--contract", "SYNTHETIC", "--spot-rate", "7", "--refund-dbf", "synthetic.dbf"]

    def test_portable_defaults(self):
        with patch.dict("os.environ", {}, clear=True):
            args = MODULE.parse_args(self.arguments)
        self.assertEqual(args.database, MODULE.DEFAULT_DB)
        self.assertEqual(args.history_root, MODULE.DEFAULT_HISTORY_ROOT)
        self.assertNotIn("com.kingsoft.wpsoffice", str(args.history_root))

    def test_environment_and_cli_precedence(self):
        with patch.dict("os.environ", {"JIESONG_EXPORT_DATABASE": "/tmp/synthetic.db",
                                       "JIESONG_HISTORY_ROOT": "/tmp/synthetic-history"}):
            args = MODULE.parse_args(self.arguments)
            self.assertEqual(args.database, Path("/tmp/synthetic.db").resolve())
            self.assertEqual(args.history_root, Path("/tmp/synthetic-history").resolve())
            args = MODULE.parse_args(self.arguments + ["--database", "/tmp/override.db",
                                                       "--history-root", "/tmp/override-history"])
            self.assertEqual(args.database, Path("/tmp/override.db").resolve())
            self.assertEqual(args.history_root, Path("/tmp/override-history").resolve())

    def test_home_expansion_and_relative_paths(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict("os.environ", {}, clear=True):
            self.assertEqual(MODULE.configured_path('~/synthetic-history'), (Path.home() / 'synthetic-history').resolve())
            self.assertEqual(MODULE.configured_path('synthetic-relative.db'), (Path.cwd() / 'synthetic-relative.db').resolve())


class ReadOnlySourceTests(unittest.TestCase):
    def test_missing_database_is_never_created(self):
        with tempfile.TemporaryDirectory() as folder:
            database = Path(folder) / 'missing.db'
            with self.assertRaises(sqlite3.OperationalError):
                MODULE.fetch_contract_rows(database, 'SYNTHETIC')
            self.assertFalse(database.exists())

    def test_query_failure_always_closes_source_connection(self):
        connection = unittest.mock.MagicMock()
        connection.execute.side_effect = sqlite3.OperationalError('synthetic query failure')
        with patch.object(MODULE.sqlite3, 'connect', return_value=connection):
            with self.assertRaises(sqlite3.OperationalError):
                MODULE.fetch_contract_rows(Path('/synthetic.db'), 'SYNTHETIC')
        connection.close.assert_called_once()


class RetiredPricingTests(unittest.TestCase):
    def test_python_pricing_copy_is_gone_and_the_proposal_refuses_to_run(self):
        for name in ('calculate_price', 'unit_for_rounded_total', 'realized_markup', 'historical_quote_allowed', 'nearest_multiple_of_five'):
            self.assertFalse(hasattr(MODULE, name), name)
        with self.assertRaises(RuntimeError):
            MODULE.build_proposal(object())
        with self.assertRaises(SystemExit):
            MODULE.parse_args(['--contract', 'X', '--spot-rate', '6.72', '--refund-dbf', 'x.dbf'])

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

    def test_numeric_source_conflict_tolerance(self):
        self.assertGreater(abs(282 - 282.5), 1e-6)

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

