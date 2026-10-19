import contextlib
import copy
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = json.loads((ROOT / 'tests/fixtures/pricing-readiness-defaults.json').read_text())


class PricingVerifierTests(unittest.TestCase):
    def verify(self, mutation=None, empty_consumer=None):
        services = []
        for name, pricing in EXPECTED.items():
            services.append({'name': name, 'readiness': {
                'profitRate': 1.3, 'pricingMode': 'tiered',
                'effectiveExchangeRate': pricing['effectiveExchangeRate'],
                'lines': [{**pricing, 'pricingFormula': f"purchaseCostCny × {pricing['pricingProfitRate']} ÷ effectiveExchangeRate ÷ quantity（整数单价或总额尾数 0/5 凑整）"}],
            }})
        after = copy.deepcopy(services)
        if mutation:
            mutation(after)

        def output(command, **kwargs):
            if command[-1] == 'packet' or command[0] == 'python3':
                data = [{'name': name, 'unchanged': True} for name in EXPECTED]
                consumer = 'packet' if command[-1] == 'packet' else 'python'
                if consumer == empty_consumer:
                    data = []
            else:
                data = services if command[-1] == '/synthetic-before' else after
            return subprocess.CompletedProcess(command, 0, json.dumps(data).encode(), b'')

        with tempfile.TemporaryDirectory() as directory:
            argv = ['verify_pricing_defaults.py', '--baseline-root', '/synthetic-before', '--evidence', directory]
            with patch.object(sys, 'argv', argv), patch('subprocess.run', side_effect=output), contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(ROOT / 'scripts/verify_pricing_defaults.py'), run_name='__main__')
            return json.loads((Path(directory) / 'receipt.json').read_text())

    def test_valid_readiness_prices_and_metadata_pass(self):
        self.assertTrue(self.verify()['readiness']['nonPricingFieldsEqual'])

    def test_rejects_identically_empty_packet_or_python_snapshots(self):
        for consumer in ['packet', 'python']:
            with self.subTest(consumer=consumer), self.assertRaisesRegex(AssertionError, 'Synthetic .* cases differ'):
                self.verify(empty_consumer=consumer)

    def test_rejects_missing_or_wrong_recommendations_and_formula_metadata(self):
        mutations = [
            lambda rows: rows[0]['readiness']['lines'][0].update(recommendedUnitPriceUsd=None),
            lambda rows: rows[0]['readiness']['lines'][0].update(recommendedUnitPriceUsd=999),
            lambda rows: rows[0]['readiness']['lines'][0].pop('recommendedUnitPriceUsd'),
            lambda rows: rows[0]['readiness']['lines'][0].update(pricingProfitRate=4),
            lambda rows: rows[0]['readiness']['lines'][0].update(pricingFormula='wrong formula'),
            lambda rows: rows[0]['readiness'].update(pricingMode='multiplier'),
            lambda rows: rows[0]['readiness'].update(profitRate=4),
            lambda rows: rows[0]['readiness'].update(effectiveExchangeRate=100),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaisesRegex(AssertionError, 'Readiness pricing'):
                self.verify(mutation)
