"""Run full proposals from a selected Git version using synthetic source adapters."""
import importlib.util
import json
from pathlib import Path
import sys
from unittest.mock import patch

root = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('pricing_snapshot_target', root / 'scripts/prepare_export_packet.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
fixtures = json.loads((Path(__file__).parent / 'fixtures/pricing-synthetic.json').read_text())
results = []
for case in fixtures:
    contract = case['contract']
    item = contract['packingItems'][0]
    rows = [{**item, 'customsName': item['product']['customsName'], 'hsCode': item['product'].get('hsCode'),
             'declaration': item['product'].get('declaration')}]
    refund_rate = case['readinessOptions']['hsRecords'][0]['refundRate'] if case['readinessOptions']['hsRecords'] else None
    refund = module.RefundRecord('9405110000', '合成商品', refund_rate, '20260101', '20261231', 'SYNTHETIC') if refund_rate is not None else None
    history = [module.HistoricalQuote(q['contractNo'], q['productName'], q['specification'], item['quantity'], q['unitPriceUsd'], q['unitPriceUsd'] * item['quantity'], 'synthetic.xlsx', 1) for q in case['historicalQuotes']]
    args = module.parse_args(['--contract', contract['contractNo'], '--spot-rate', str(contract['exchangeRate']), '--export-date', '2026-10-18', '--refund-dbf', '/tmp/unused-synthetic.dbf'])
    with patch.object(module, 'fetch_contract_rows', return_value=({'contractNo': contract['contractNo']}, rows)), patch.object(module, 'lookup_refund_rate', return_value=refund), patch.object(module, 'scan_historical_quotes', return_value=history):
        try:
            result = module.build_proposal(args)
        except ValueError as error:
            result = {'error': str(error)}
    results.append({'name': case['name'], 'proposal': result})
print(json.dumps(results, ensure_ascii=False, indent=2, allow_nan=False))
