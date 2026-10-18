"""Verify preserved packet/Python defaults and report accepted readiness changes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


parser = argparse.ArgumentParser()
parser.add_argument('--baseline-root', type=Path, required=True)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)
(args.evidence / 'receipt.json').unlink(missing_ok=True)
commands = {
    'services': ['node', str(ROOT / 'scripts/pricing_snapshot.cjs')],
    'packet': ['node', str(ROOT / 'scripts/pricing_snapshot.cjs')],
    'python': ['python3', str(ROOT / 'tests/pricing_snapshot.py')],
}
env = {**os.environ, 'NODE_ENV': 'test', 'JWT_SECRET': 'test-only-jwt-secret-for-ci-123456'}
env.pop('JIESONG_PRICING_CONFIG', None)
receipt = {'baselineRoot': str(args.baseline_root.resolve()), 'comparisons': []}
snapshots = {}
for name, command in commands.items():
    outputs = []
    for label, root in [('before', args.baseline_root.resolve()), ('after', ROOT)]:
        selector = ['packet'] if name == 'packet' else []
        completed = subprocess.run(command + [str(root)] + selector, cwd=ROOT, env=env, capture_output=True, check=True)
        (args.evidence / f'{label}-{name}.json').write_bytes(completed.stdout)
        (args.evidence / f'{label}-{name}.stderr.log').write_bytes(completed.stderr)
        outputs.append(completed.stdout)
    before, after = [json.loads(output) for output in outputs]
    snapshots[name] = (before, after)
    if name == 'services':
        continue
    receipt['comparisons'].append({'consumer': name, 'syntheticCases': len(before), 'completeJsonEqual': before == after,
                                   'bytesEqual': outputs[0] == outputs[1],
                                   'beforeSha256': hashlib.sha256(outputs[0]).hexdigest(),
                                   'afterSha256': hashlib.sha256(outputs[1]).hexdigest()})

fixtures = json.loads((ROOT / 'tests/fixtures/pricing-synthetic.json').read_text())
expected_readiness = json.loads((ROOT / 'tests/fixtures/pricing-readiness-defaults.json').read_text())
expected_names = [fixture['name'] for fixture in fixtures]
for consumer, pair in snapshots.items():
    require(all([row['name'] for row in snapshot] == expected_names for snapshot in pair),
            f'Synthetic {consumer} cases differ')
old_services, new_services = snapshots['services']
require(len(old_services) == len(new_services) == len(fixtures) == len(expected_readiness) == 27, 'Synthetic case count differs')
require(all(row['completeJsonEqual'] and row['bytesEqual'] for row in receipt['comparisons']), 'Default pricing regression differs')
line_pricing_keys = {'recommendedUnitPriceUsd', 'pricingFormula', 'pricingProfitRate', 'effectiveExchangeRate'}
root_pricing_keys = {'profitRate', 'pricingMode', 'effectiveExchangeRate'}
rows = []
for fixture, old, new in zip(fixtures, old_services, new_services):
    require(fixture['name'] == old['name'] == new['name'], 'Synthetic case order differs')
    old_readiness, new_readiness = old['readiness'], new['readiness']
    for readiness in (old_readiness, new_readiness):
        require(len(readiness['lines']) == 1, f"Readiness line count differs: {fixture['name']}")
    old_line, new_line = old_readiness['lines'][0], new_readiness['lines'][0]
    expected = expected_readiness[fixture['name']]
    expected_line = {
        **expected,
        'pricingFormula': f"purchaseCostCny × {expected['pricingProfitRate']} ÷ effectiveExchangeRate ÷ quantity（整数单价或总额尾数 0/5 凑整）",
    }
    require(all(key in new_line and new_line[key] == value for key, value in expected_line.items()),
            f"Readiness pricing differs: {fixture['name']}")
    require(new_readiness.get('profitRate') == 1.3 and new_readiness.get('pricingMode') == 'tiered'
            and new_readiness.get('effectiveExchangeRate') == expected['effectiveExchangeRate'],
            f"Readiness pricing summary differs: {fixture['name']}")
    old_other = {key: value for key, value in old_readiness.items() if key not in root_pricing_keys | {'lines'}}
    new_other = {key: value for key, value in new_readiness.items() if key not in root_pricing_keys | {'lines'}}
    require(old_other == new_other, f"Readiness summary or issues changed: {fixture['name']}")
    require({key: value for key, value in old_line.items() if key not in line_pricing_keys}
            == {key: value for key, value in new_line.items() if key not in line_pricing_keys}, fixture['name'])
    item = fixture['contract']['packingItems'][0]
    records = fixture['readinessOptions']['hsRecords']
    rows.append({'name': fixture['name'], 'purchaseCostCny': item['purchaseCost'],
                 'quantity': item['quantity'], 'spotRate': fixture['contract']['exchangeRate'],
                 'refundRate': records[0]['refundRate'] if records else None,
                 'before': old_line['recommendedUnitPriceUsd'],
                 'after': new_line['recommendedUnitPriceUsd']})

def display(value):
    return 'null' if value is None else str(value)

table = ['| 合成输入 | 成本 CNY | 数量 | 现汇 | 退税率 % | readiness 旧→新 USD/件 |',
         '| --- | --- | --- | --- | --- | --- |']
for row in rows:
    table.append(f"| {row['name']} | {display(row['purchaseCostCny'])} | {row['quantity']} | {row['spotRate']} | "
                 f"{display(row['refundRate'])} | {display(row['before'])}→{display(row['after'])} |")
(args.evidence / 'readiness-price-changes.md').write_text('\n'.join(table) + '\n')
(args.evidence / 'readiness-price-changes.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
receipt['readiness'] = {'syntheticCases': len(rows), 'changedPrices': sum(row['before'] != row['after'] for row in rows),
                        'pricingFieldsMatchAcceptedDefaults': True,
                        'nonPricingFieldsEqual': True, 'priceTable': 'readiness-price-changes.md'}
(args.evidence / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
