#!/usr/bin/env python3
"""Local-only safety tests. No Docker, SSH, deployment or private inputs."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/nestlet-upgrade-schema4.sh'
TEXT = SCRIPT.read_text()
OLD = '2fc15f216714d0331a82456edb1d97b9f76f8498'
NEW = 'a' * 40


def shell_function(name):
    return re.search(r'^' + name + r'\(\) \{\n.*?^\}', TEXT, re.M | re.S).group()


class ReleaseSafety(unittest.TestCase):
    def test_bash_syntax_and_embedded_languages(self):
        subprocess.run(['bash', '-n', str(SCRIPT)], check=True)
        python_blocks = re.findall(r"<<'(PY(?:_POINTER)?)'\n(.*?)\n\1", TEXT, re.S)
        self.assertEqual(len(python_blocks), 3)
        for name, code in python_blocks:
            compile(code, name, 'exec')
        js_blocks = re.findall(r"node --input-type=module -e '\n(.*?)'", TEXT, re.S)
        self.assertEqual(len(js_blocks), 4)
        for code in js_blocks:
            result = subprocess.run(['node', '--input-type=module', '--check'], input=code, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_draft_refuses_before_any_host_access(self):
        result = subprocess.run(['bash', str(SCRIPT), NEW], text=True, capture_output=True, env={'PATH': '/usr/bin:/bin'})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'Draft or unreviewed release; deployment is disabled')
        self.assertNotIn('managed', result.stderr)

    def test_workflow_pin_and_scope(self):
        workflow = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest() + '  scripts/nestlet-upgrade-schema4.sh', workflow)
        self.assertIn("github.ref == 'refs/heads/ops/nestlet-incremental-20261007'", workflow)
        self.assertIn('workflow_dispatch:', workflow)
        self.assertNotRegex(workflow, r'^  (push|pull_request):')
        self.assertNotIn('nestlet-enable-sqlite.sh', workflow)
        self.assertNotRegex(TEXT, r'\b(down|prune|volume rm)\b')
        self.assertIn('readonly OLD_SHA=\'' + OLD + '\'', TEXT)

    def test_compose_rejects_scope_expansion(self):
        code = re.search(r"config --format json \| python3 -c '\n(.*?)\n'", TEXT, re.S).group(1)
        compose = {'services': {'nestlet': {'read_only': True, 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'], 'ports': [{'host_ip':'127.0.0.1','published':'4173','target':4173}], 'environment': {'NESTLET_DB_PATH':'/data/nestlet.sqlite'}, 'volumes': [{'type':'volume','source':'case_data','target':'/data'}]}}, 'volumes': {'case_data': {'name':'nestlet_case_data','labels': {'com.nestlet.purpose':'private-case-storage'}}}}
        variants = [compose]
        for change in ['service', 'port', 'bind', 'volume', 'privilege']:
            value = copy.deepcopy(compose)
            if change == 'service': value['services']['other'] = {}
            if change == 'port': value['services']['nestlet']['ports'][0]['host_ip'] = '0.0.0.0'
            if change == 'bind': value['services']['nestlet']['volumes'][0]['type'] = 'bind'
            if change == 'volume': value['volumes']['case_data']['name'] = 'other'
            if change == 'privilege': value['services']['nestlet']['security_opt'] = []
            variants.append(value)
        for index, value in enumerate(variants):
            result = subprocess.run(['python3', '-c', code], input=json.dumps(value), text=True, capture_output=True)
            self.assertEqual(result.returncode == 0, index == 0)

    def test_atomic_tag_only_repair(self):
        with tempfile.TemporaryDirectory() as directory:
            envfile = Path(directory) / 'runtime.env'
            original = f'PUBLIC_ORIGIN=https://synthetic.invalid\nNESTLET_IMAGE_TAG={OLD}\nSYNTHETIC_UNRELATED_VALUE=retain-exactly\n'
            envfile.write_text(original); envfile.chmod(0o600)
            prefix = 'set -euo pipefail\numask 077\nENVFILE=' + str(envfile) + '\n' + shell_function('set_image_tag') + '\n'
            def run(before, after):
                return subprocess.run(['bash', '-c', prefix + f'set_image_tag "{before}" "{after}"'], capture_output=True, text=True)
            self.assertEqual(run(OLD, NEW).returncode, 0)
            self.assertEqual(envfile.read_text(), original.replace(OLD, NEW))
            # Interruption after tag change, before container recreation.
            self.assertEqual(run(OLD + ',' + NEW, OLD).returncode, 0)
            self.assertEqual(envfile.read_text(), original)
            self.assertEqual(envfile.stat().st_mode & 0o777, 0o600)
            # Never overwrite another maintenance writer's unexpected image tag.
            envfile.write_text(original.replace(OLD, 'b'*40))
            self.assertNotEqual(run(OLD + ',' + NEW, OLD).returncode, 0)
            self.assertIn('b'*40, envfile.read_text())

    def simulate_failure(self, schema, stop_ok=True):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'calls'
            script = f'''set -euo pipefail
OLD_SHA={OLD}; NEW_SHA={NEW}; OLD_RELEASE=old; NEW_RELEASE=new
smoke_started=0; changed=1; LOG={log}
compose() {{ echo "compose $*" >>"$LOG"; {'return 0' if stop_ok else 'return 1'}; }}
live_schema() {{ echo {schema}; }}
set_image_tag() {{ echo "tag $*" >>"$LOG"; }}
check_container() {{ echo "container $*" >>"$LOG"; }}
check_persistent_mount() {{ echo "mount $*" >>"$LOG"; }}
check_http() {{ echo http >>"$LOG"; }}
switch_pointer() {{ echo "pointer $*" >>"$LOG"; }}
{shell_function('rollback')}
trap rollback EXIT
exit 42
'''
            result = subprocess.run(['bash', '-c', script], text=True, capture_output=True)
            return result, log.read_text()

    def test_stopped_schema3_recovers_without_restore(self):
        result, calls = self.simulate_failure(3)
        self.assertEqual(result.returncode, 42)
        self.assertIn(f'compose {NEW} stop nestlet', calls)
        self.assertIn(f'compose {OLD} up -d --no-build --pull never --wait --wait-timeout 90 nestlet', calls)
        self.assertIn(f'mount {OLD} 3', calls)
        self.assertNotIn('restore', calls)
        self.assertIn('never restored or replaced', result.stderr)

    def test_schema4_and_unknown_never_restart_old_binary(self):
        for schema in [4, 0, 99]:
            result, calls = self.simulate_failure(schema)
            self.assertEqual(result.returncode, 42)
            self.assertNotIn(' up ', calls)
            self.assertNotIn('tag ', calls)
            self.assertIn('NOT restarted', result.stderr)

    def test_failed_stop_never_restarts_old_binary(self):
        result, calls = self.simulate_failure(3, stop_ok=False)
        self.assertEqual(result.returncode, 42)
        self.assertNotIn(' up ', calls)
        self.assertNotIn('tag ', calls)


if __name__ == '__main__':
    unittest.main(verbosity=2)
