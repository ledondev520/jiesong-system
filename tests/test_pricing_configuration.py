import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('pricing_configuration_target', ROOT / 'scripts/prepare_export_packet.py')
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
DEFAULTS = json.loads((ROOT / 'config/pricing.json').read_text())


class SharedPricingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.target = Path(self.directory.name) / 'pricing.json'
        self.env = patch.dict(os.environ, {'JIESONG_PRICING_CONFIG': str(self.target)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.write(DEFAULTS)

    def write(self, config):
        self.target.write_text(json.dumps(config))

    def args(self, extra=None):
        return MODULE.parse_args(['--contract', 'SYNTHETIC', '--spot-rate', '6.8', '--export-date', '2026-10-18', '--refund-dbf', '/tmp/unused.dbf'] + (extra or []))

    def proposal(self, refund):
        args = self.args()
        rows = [{'customsName': '合成商品', 'hsCode': '9405110000', 'quantity': 10, 'purchaseCost': 6600, 'specification': '合成规格', 'unit': '件', 'boxes': 1, 'grossWeight': 10, 'netWeight': 9, 'volume': 1}]
        record = MODULE.RefundRecord('9405110000', '合成商品', refund, '20260101', '20261231', 'SYNTHETIC')
        with patch.object(MODULE, 'fetch_contract_rows', return_value=({'contractNo': 'SYNTHETIC'}, rows)), patch.object(MODULE, 'scan_historical_quotes', return_value=[]), patch.object(MODULE, 'lookup_refund_rate', return_value=record):
            return MODULE.build_proposal(args)

    def test_each_parameter_and_multiplier_mode(self):
        for change, refund, unit in [({}, 13, 130), ({}, 0, 110), ({'exchangeAdjustment': -0.1}, 13, 128), ({'refundableMarkup': 0.4}, 13, 140), ({'noRefundMarkup': 0.2}, 0, 120), ({'mode': 'multiplier'}, 0, 130), ({'mode': 'multiplier', 'multiplier': 1.5}, 0, 150), ({'multiplier': 1.5}, 13, 130)]:
            with self.subTest(change=change, refund=refund):
                self.write({**DEFAULTS, **change})
                result = self.proposal(refund)
                self.assertEqual(result['rows'][0]['pricing']['unit_price_usd'], unit)
                self.assertEqual(result['priced_total_usd'], unit * 10)

    def test_invalid_files_and_parameters_are_refused(self):
        for key, value in [('exchangeAdjustment', -3), ('refundableMarkup', 1.01), ('noRefundMarkup', -0.01), ('multiplier', 0), ('mode', 'guess'), ('multiplier', True), ('exchangeAdjustment', float('nan'))]:
            with self.subTest(key=key):
                self.write({**DEFAULTS, key: value})
                with self.assertRaises(SystemExit) as error:
                    self.args()
                self.assertEqual(error.exception.code, 2)
        self.target.write_text('{bad')
        with self.assertRaises(SystemExit): self.args()
        self.target.unlink()
        with self.assertRaises(SystemExit): self.args()

    def test_cli_cannot_create_another_pricing_source(self):
        self.assertEqual(self.args(['--fx-buffer', '0.2']).fx_buffer, 0.2)
        for option, value in [('--fx-buffer', '0.1'), ('--refundable-markup', '0.4'), ('--no-refund-markup', '0.2'), ('--history-markup-tolerance', 'nan'), ('--spot-rate', 'inf')]:
            with self.subTest(option=option):
                with self.assertRaises(SystemExit) as error: self.args([option, value])
                self.assertEqual(error.exception.code, 2)

    def test_multiplier_history_uses_multiplier_target_even_for_zero_refund(self):
        self.write({**DEFAULTS, 'mode': 'multiplier'})
        args = self.args()
        for unit, expected in [(130, True), (110, False), (150, False)]:
            allowed, _ = MODULE.historical_quote_allowed(unit, 10, 6.6, 6600, 0, args.no_refund_markup, args.refundable_markup, mode=args.pricing_mode)
            self.assertEqual(allowed, expected)
