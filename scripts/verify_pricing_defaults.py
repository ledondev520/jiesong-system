"""Compare complete synthetic pricing output against a pristine Git export."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline-root', type=Path, required=True)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)
commands = {
    'services': ['node', str(ROOT / 'scripts/pricing_snapshot.cjs')],
    'python': ['python3', str(ROOT / 'tests/pricing_snapshot.py')],
}
env = {**os.environ, 'NODE_ENV': 'test', 'JWT_SECRET': 'test-only-jwt-secret-for-ci-123456'}
env.pop('JIESONG_PRICING_CONFIG', None)
receipt = {'baselineRoot': str(args.baseline_root.resolve()), 'comparisons': []}
for name, command in commands.items():
    outputs = []
    for label, root in [('before', args.baseline_root.resolve()), ('after', ROOT)]:
        completed = subprocess.run(command + [str(root)], cwd=ROOT, env=env, capture_output=True, check=True)
        (args.evidence / f'{label}-{name}.json').write_bytes(completed.stdout)
        (args.evidence / f'{label}-{name}.stderr.log').write_bytes(completed.stderr)
        outputs.append(completed.stdout)
    before, after = [json.loads(output) for output in outputs]
    receipt['comparisons'].append({'consumer': name, 'syntheticCases': len(before), 'completeJsonEqual': before == after,
                                   'bytesEqual': outputs[0] == outputs[1],
                                   'beforeSha256': hashlib.sha256(outputs[0]).hexdigest(),
                                   'afterSha256': hashlib.sha256(outputs[1]).hexdigest()})
(args.evidence / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
assert all(row['completeJsonEqual'] and row['bytesEqual'] for row in receipt['comparisons']), 'Default pricing regression differs'
print(json.dumps(receipt, indent=2))
