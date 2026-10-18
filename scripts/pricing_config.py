"""Read the same strict JSON policy and schema as the backend, without loading .env."""
import hashlib
import json
import math
import os
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((PROJECT_ROOT / 'config/pricing.schema.json').read_text())
_OBSERVED = {}


def validate_pricing_config(value):
    if not isinstance(value, dict):
        raise ValueError('报价配置必须是完整 JSON 对象')
    if any(key not in SCHEMA['properties'] for key in value):
        raise ValueError('报价配置包含未知字段')
    config = {}
    for key in SCHEMA['required']:
        rule = SCHEMA['properties'][key]
        item = value.get(key)
        if rule['type'] == 'number':
            if type(item) not in (int, float) or not math.isfinite(item) or not rule['minimum'] <= item <= rule['maximum']:
                raise ValueError(f"报价配置 {key} 必须是 {rule['minimum']} 至 {rule['maximum']} 的有限数字")
        elif item not in rule['enum']:
            raise ValueError(f"报价配置 {key} 必须为 {' 或 '.join(rule['enum'])}")
        config[key] = item
    return config


def load_pricing_config(config_path=None):
    target = Path(config_path or os.environ.get('JIESONG_PRICING_CONFIG') or PROJECT_ROOT / 'config/pricing.json').expanduser().resolve()
    try:
        value = json.loads(target.read_text())
    except (OSError, ValueError):
        raise ValueError('报价配置文件无法读取或 JSON 格式无效') from None
    config = validate_pricing_config(value)
    revision = hashlib.sha256(json.dumps(config, separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    previous = _OBSERVED.get(target)
    if previous != revision:
        event = {'event': 'pricing_config_file_changed' if previous else 'pricing_config_loaded', 'revision': revision}
        if previous:
            event['previousRevision'] = previous
        print(json.dumps(event), file=sys.stderr)
        _OBSERVED[target] = revision
    return config
