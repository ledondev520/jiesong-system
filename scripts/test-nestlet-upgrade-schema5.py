#!/usr/bin/env python3
"""Local-only safety tests. No Docker, SSH, deployment or private inputs."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/nestlet-upgrade-schema5.sh'
TEXT = SCRIPT.read_text()
OLD = '4d4c15315d80b5fb7e9f8c2f3f883b10c1121c40'
NEW = 'a' * 40


def shell_function(name):
    value = re.search(r'^' + name + r'\(\) \{\n.*?^\}', TEXT, re.M | re.S).group()
    return shell_function('edit_image_tag') + '\n' + value if name == 'set_image_tag' else value


class ReleaseSafety(unittest.TestCase):
    def test_reviewed_release_is_exact_green_merge_pin(self):
        self.assertIn("readonly REVIEWED_RELEASE_SHA='5335312fd53becaad4bfccace5c1f3e39c6bf4f2'", TEXT)
        self.assertIn('"$NEW_SHA" = "$REVIEWED_RELEASE_SHA"', TEXT)
        self.assertNotEqual(OLD, '5335312fd53becaad4bfccace5c1f3e39c6bf4f2')

    def test_bash_syntax_and_embedded_languages(self):
        subprocess.run(['bash', '-n', str(SCRIPT)], check=True)
        python_blocks = re.findall(r"<<'(PY(?:_POINTER)?)'\n(.*?)\n\1", TEXT, re.S)
        self.assertEqual(len(python_blocks), 3)
        for name, code in python_blocks:
            compile(code, name, 'exec')
        js_blocks = re.findall(r"node --input-type=module -e '\n(.*?)'", TEXT, re.S)
        self.assertEqual(len(js_blocks), 6)
        for code in js_blocks:
            result = subprocess.run(['node', '--input-type=module', '--check'], input=code, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_unreviewed_sha_refuses_before_any_host_access(self):
        result = subprocess.run(['bash', str(SCRIPT), NEW], text=True, capture_output=True, env={'PATH': '/usr/bin:/bin'})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'Draft or unreviewed release; deployment is disabled')
        self.assertNotIn('managed', result.stderr)

    def test_workflow_pin_and_scope(self):
        workflow = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest() + '  scripts/nestlet-upgrade-schema5.sh', workflow)
        self.assertIn("github.ref == 'refs/heads/ops/nestlet-schema5-email-release-20261007'", workflow)
        parsed = yaml.load(workflow, Loader=yaml.BaseLoader)
        self.assertEqual(set(parsed['on']), {'workflow_dispatch'})
        self.assertEqual(parsed['permissions'], {'contents': 'read'})
        self.assertEqual(parsed['concurrency']['group'], 'nestlet-stage')
        self.assertIn('ops/nestlet-schema5-email-release-20261007', parsed['jobs']['preflight']['if'])
        job = parsed['jobs']['preflight']
        self.assertEqual(job['environment'], 'staging')
        for guard in ["github.repository == 'ledondev520/jiesong-system'", "github.repository_owner == 'ledondev520'", "github.actor == 'ledondev520'"]:
            self.assertIn(guard, job['if'])
        step = job['steps'][-1]
        self.assertEqual(parsed['on']['workflow_dispatch']['inputs']['operation']['options'], ['upgrade', 'verify-predecessor', 'mail-proof', 'stream-proof'])
        for guard in ['[[ "$RELEASE_OPERATION" == upgrade || "$RELEASE_OPERATION" == verify-predecessor || "$RELEASE_OPERATION" == mail-proof || "$RELEASE_OPERATION" == stream-proof ]]', '[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]', '[[ "$EXPECTED_HOST_SHA256" =~ ^[a-f0-9]{64}$ ]]', '[[ "$observed" == "$EXPECTED_HOST_FINGERPRINT" ]]', 'StrictHostKeyChecking=yes', 'sha256sum --check --status']:
            self.assertIn(guard, step['run'])
        self.assertNotIn('StrictHostKeyChecking=no', step['run'])
        self.assertIn("flock -n 9", TEXT)
        self.assertIn('workflow_dispatch:', workflow)
        self.assertNotRegex(workflow, r'^  (push|pull_request):')
        self.assertNotIn('nestlet-enable-sqlite.sh', workflow)
        self.assertNotRegex(TEXT, r'\b(down|prune|volume rm)\b')
        self.assertIn('readonly OLD_SHA=\'' + OLD + '\'', TEXT)

    def test_compose_rejects_scope_expansion(self):
        code = re.search(r"config --format json \| python3 -c '\n(.*?)\n'", TEXT, re.S).group(1)
        compose = {'services': {'nestlet': {'read_only': True, 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'], 'ports': [{'host_ip':'127.0.0.1','published':'4173','target':4173}], 'environment': {'NESTLET_DB_PATH':'/data/nestlet.sqlite','PUBLIC_ORIGIN':'https://nestlet.celerada.link'}, 'volumes': [{'type':'volume','source':'case_data','target':'/data'}]}}, 'volumes': {'case_data': {'name':'nestlet_case_data','labels': {'com.nestlet.purpose':'private-case-storage'}}}}
        variants = [compose]
        for change in ['service', 'port', 'bind', 'volume', 'privilege', 'origin']:
            value = copy.deepcopy(compose)
            if change == 'service': value['services']['other'] = {}
            if change == 'port': value['services']['nestlet']['ports'][0]['host_ip'] = '0.0.0.0'
            if change == 'bind': value['services']['nestlet']['volumes'][0]['type'] = 'bind'
            if change == 'volume': value['volumes']['case_data']['name'] = 'other'
            if change == 'privilege': value['services']['nestlet']['security_opt'] = []
            if change == 'origin': value['services']['nestlet']['environment']['PUBLIC_ORIGIN'] = 'http://127.0.0.1:4173'
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

    def test_tag_edit_accepts_literal_dotenv_forms_and_preserves_all_other_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            envfile=Path(directory)/'runtime.env'
            prefix='set -euo pipefail\numask 077\nENVFILE='+str(envfile)+'\n'+shell_function('set_image_tag')+'\n'
            def run(before=OLD,after=NEW):
                return subprocess.run(['bash','-c',prefix+f'set_image_tag "{before}" "{after}"'],capture_output=True)
            forms=[b'NESTLET_IMAGE_TAG='+OLD.encode(),b' export NESTLET_IMAGE_TAG = "'+OLD.encode()+b'" # keep',
                   b"\texport\tNESTLET_IMAGE_TAG\t=\t'"+OLD.encode()+b"'\t# keep",b'NESTLET_IMAGE_TAG : '+OLD.encode()+b' # keep',
                   b'NESTLET_IMAGE_TAG="'+OLD.encode()+b'"#keep',b"NESTLET_IMAGE_TAG='"+OLD.encode()+b"'",b'NESTLET_IMAGE_TAG = '+OLD.encode()+b'  ']
            for ending in [b'\n',b'\r\n',b'']:
                for declaration in forms:
                    unrelated=b'# synthetic only\n#COMMENT=\"unterminated is comment\nUNCHANGED=\xff\x80literal\nMULTILINE=\'first\nNESTLET_IMAGE_TAG='+OLD.encode()+b"\nlast'\n"
                    original=unrelated+declaration+ending
                    envfile.write_bytes(original);envfile.chmod(0o600)
                    result=run();self.assertEqual(result.returncode,0,result.stderr)
                    self.assertEqual(envfile.read_bytes(),unrelated+declaration.replace(OLD.encode(),NEW.encode())+ending)
                    self.assertEqual(run(OLD+','+NEW,OLD).returncode,0)
                    self.assertEqual(envfile.read_bytes(),original)
                    inode=envfile.stat().st_ino
                    self.assertEqual(run(OLD,OLD).returncode,0)
                    self.assertEqual(envfile.stat().st_ino,inode)

    def test_tag_edit_rejects_ambiguous_malformed_and_unapproved_values(self):
        with tempfile.TemporaryDirectory() as directory:
            envfile=Path(directory)/'runtime.env'
            prefix='set -euo pipefail\numask 077\nENVFILE='+str(envfile)+'\n'+shell_function('set_image_tag')+'\n'
            good=b'NESTLET_IMAGE_TAG='+OLD.encode()+b'\n'
            values=[b'"'+OLD.encode()+b"'",OLD.encode()+b'#not-a-comment',OLD.encode()+b'\t#not-a-comment',b'${OTHER}',b'"${OTHER}"',b'$(command)',b'latest',b'b'*40,
                    b'"'+OLD.encode()+b'" suffix',b'"'+OLD.encode()+b'\n"',b"'"+OLD.encode()+b"'\x00",b'',b'"'+OLD.encode()+b'\\"']
            inputs=[b'NESTLET_IMAGE_TAG='+value+b'\n' for value in values]
            inputs += [good+b' export NESTLET_IMAGE_TAG="'+OLD.encode()+b'"\n',good+b'NESTLET_IMAGE_TAG: '+OLD.encode()+b'\n',
                       good+b'export NESTLET_IMAGE_TAG\n',good+b'UNRELATED="x" NESTLET_IMAGE_TAG='+OLD.encode()+b'\n',b"UNRELATED='\n"+good+b"'\n",b"UNRELATED='unterminated\n"+good]
            for original in inputs:
                envfile.write_bytes(original);envfile.chmod(0o600)
                result=subprocess.run(['bash','-c',prefix+f'set_image_tag "{OLD}" "{NEW}"'],capture_output=True)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(envfile.read_bytes(),original)
                self.assertNotIn(original,result.stdout+result.stderr)

    def test_reconcile_is_bounded_to_verified_predecessor_with_private_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);shared=base/'shared';shared.mkdir(mode=0o700)
            envfile=shared/'runtime.env';old_release=str(base/'releases'/OLD)
            (base/'current').symlink_to(old_release)
            lock=base/'.incremental-release.lock';lock.write_bytes(b'');lock.chmod(0o600)
            stale=b'b'*40
            original=b"UNCHANGED_LITERAL='$SYNTHETIC#value'\r\n export NESTLET_IMAGE_TAG = '"+stale+b"' # retain\r\n"
            envfile.write_bytes(original);envfile.chmod(0o600)
            prefix='set -euo pipefail\numask 077\n'+f'BASE={base}\nENVFILE={envfile}\nOLD_SHA={OLD}\nOLD_RELEASE={old_release}\n'
            prefix+='exec 9>"$BASE/.incremental-release.lock"\nflock -n 9\nfail() { exit 41; }\nverify_predecessor() { [ "$1" = runtime ]; }\ncheck_container() { [ "$1" = "$OLD_SHA" ]; }\ncheck_persistent_mount() { [ "$1 $2" = "$OLD_SHA 4" ]; }\ncheck_http() { :; }\n'
            prefix+=shell_function('edit_image_tag')+'\n'+shell_function('reconcile_current_image_tag')+'\n'
            result=subprocess.run(['bash','-c',prefix+'reconcile_current_image_tag'],capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(envfile.read_bytes(),original.replace(stale,OLD.encode()))
            receipts=list(shared.glob('.previous-image-tag-*'));self.assertEqual(len(receipts),1)
            self.assertEqual(receipts[0].read_bytes(),stale+b'\n');self.assertEqual(receipts[0].stat().st_mode&0o777,0o600)
            self.assertEqual(result.stdout+result.stderr,b'')
            self.assertEqual(subprocess.run(['bash','-c',prefix+'reconcile_current_image_tag'],capture_output=True).returncode,0)
            self.assertEqual(list(shared.glob('.previous-image-tag-*')),receipts)
            body=shell_function('reconcile_current_image_tag')
            self.assertLess(body.index('verify_predecessor runtime'),body.index('edit_image_tag'))
            self.assertLess(body.index('check_persistent_mount'),body.index('edit_image_tag'))
            self.assertEqual(TEXT.count('\nreconcile_current_image_tag\n'),1)
            self.assertIn('NESTLET_IMAGE_TAG="$sha"',shell_function('compose'))

    def test_reconcile_refuses_failed_proofs_bad_lease_and_malformed_tags_without_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);shared=base/'shared';shared.mkdir(mode=0o700)
            envfile=shared/'runtime.env';old_release=str(base/'releases'/OLD)
            pointer=base/'current';pointer.symlink_to(old_release)
            lock=base/'.incremental-release.lock';lock.write_bytes(b'');lock.chmod(0o600)
            other=base/'other-lock';other.write_bytes(b'');other.chmod(0o600)
            prefix='set -euo pipefail\numask 077\n'+f'BASE={base}\nENVFILE={envfile}\nOLD_SHA={OLD}\nOLD_RELEASE={old_release}\n'
            prefix+='fail() { exit 41; }\nverify_predecessor() { :; }\ncheck_container() { :; }\ncheck_persistent_mount() { :; }\ncheck_http() { :; }\n'
            prefix+=shell_function('edit_image_tag')+'\n'+shell_function('reconcile_current_image_tag')+'\n'
            good=b'NESTLET_IMAGE_TAG='+b'b'*40+b'\n'
            cases=[('pointer','',good),('source','verify_predecessor() { return 1; }\n',good),('runtime','check_container() { return 1; }\n',good),
                   ('schema','check_persistent_mount() { return 1; }\n',good),('health','check_http() { return 1; }\n',good),
                   ('started','candidate_started=1\n',good),('missing-lease','',good),('wrong-lease','exec 9>"$BASE/other-lock"\n',good),
                   ('busy-lease','',good),('duplicate','',good+good),('malformed','',b'NESTLET_IMAGE_TAG=${OTHER}\n')]
            for case,override,original in cases:
                envfile.write_bytes(original);envfile.chmod(0o600)
                if case=='pointer':pointer.unlink();pointer.symlink_to(str(base/'wrong'))
                lease='' if case=='missing-lease' else 'exec 9>"$BASE/.incremental-release.lock"\n'
                held=None
                if case=='busy-lease':held=lock.open('rb');fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
                try:result=subprocess.run(['bash','-c',prefix+lease+override+'reconcile_current_image_tag'],capture_output=True)
                finally:
                    if held:held.close()
                self.assertNotEqual(result.returncode,0,case)
                self.assertEqual(envfile.read_bytes(),original,case)
                self.assertEqual(list(shared.glob('.previous-image-tag-*')),[],case)
                self.assertNotIn(b'b'*40,result.stdout+result.stderr)
                if case=='pointer':pointer.unlink();pointer.symlink_to(old_release)

    def simulate_failure(self, schema, stop_ok=True, started=0, image_matches=True):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'calls'
            script = f'''set -euo pipefail
OLD_SHA={OLD}; NEW_SHA={NEW}; OLD_RELEASE=old; NEW_RELEASE=new
smoke_started=0; changed=1; LOG={log}
candidate_started={started}; OLD_IMAGE_ID=old-image
docker() {{ echo {"old-image" if image_matches else "different-image"}; }}
compose() {{ echo "compose $*" >>"$LOG"; {'return 0' if stop_ok else 'return 1'}; }}
live_schema() {{ echo {schema}; }}
set_image_tag() {{ echo "tag $*" >>"$LOG"; }}
validate_release() {{ echo "archive $*" >>"$LOG"; }}
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

    def test_precandidate_schema4_resumes_without_restore(self):
        result, calls = self.simulate_failure(4)
        self.assertEqual(result.returncode, 42)
        self.assertIn(f'compose {NEW} stop nestlet', calls)
        self.assertIn(f'compose {OLD} up -d --no-build --pull never --no-deps --wait --wait-timeout 90 nestlet', calls)
        self.assertIn(f'mount {OLD} 4', calls)
        self.assertNotIn('restore', calls)
        self.assertIn('never restored or replaced', result.stderr)

    def test_other_schema_and_unknown_never_restart_old_binary(self):
        for schema in [3, 0, 5, 99]:
            result, calls = self.simulate_failure(schema)
            self.assertEqual(result.returncode, 42)
            self.assertNotIn(' up ', calls)
            self.assertNotIn('tag ', calls)
            self.assertIn('NOT restarted', result.stderr)

    def test_failed_stop_never_restarts_old_binary(self):
        result, calls = self.simulate_failure(4, stop_ok=False)
        self.assertEqual(result.returncode, 42)
        self.assertNotIn(' up ', calls)
        self.assertNotIn('tag ', calls)


    def test_candidate_start_or_changed_old_image_forbids_schema4_restart(self):
        for options in [{'started': 1}, {'image_matches': False}]:
            result, calls = self.simulate_failure(4, **options)
            self.assertEqual(result.returncode, 42)
            self.assertNotIn(' up ', calls)
            self.assertNotIn('tag ', calls)
            self.assertIn('NOT restarted', result.stderr)

    def test_archive_proof_is_exact_local_verifier_and_new_release_stays_git_pinned(self):
        embedded = re.search(r"<<'PY_ARCHIVE'\n(.*?)\nPY_ARCHIVE", TEXT, re.S).group(1)
        expected = (ROOT / 'scripts/nestlet-verify-archive.py').read_text().replace('sys.exit(emit_gate(verify_host))', 'sys.exit(emit_gate(lambda: verify_host(mode=sys.argv[1], lease_fd=9)))').rstrip()
        self.assertEqual(embedded, expected)
        compile(embedded, 'archive verifier', 'exec')
        validate = shell_function('validate_release')
        self.assertIn('if [ "$sha" = "$OLD_SHA" ]; then', validate)
        self.assertIn('verify_predecessor archive', validate)
        self.assertIn('remote get-url origin', validate)
        self.assertIn('verify_predecessor runtime ||', TEXT)
        self.assertLess(TEXT.index('verify_predecessor runtime ||'), TEXT.index('compose "$NEW_SHA" build --pull'))
        self.assertIn('validate_release "$OLD_SHA" && set_image_tag', shell_function('rollback'))
        workflow = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertNotIn('inspect-release', workflow)
        self.assertNotIn('nestlet-release-identity.py', workflow)
        readonly = workflow.split('if [[ "$RELEASE_OPERATION" == verify-predecessor ]]; then', 1)[1].split('          else', 1)[0]
        self.assertIn('< scripts/nestlet-verify-archive.py', readonly)
        self.assertIn('exec python3 -', readonly)
        self.assertNotIn('bash -s', readonly)
        self.assertNotIn('nestlet-upgrade-schema5.sh', readonly)
        self.assertIn(hashlib.sha256((ROOT/'scripts/nestlet-verify-archive.py').read_bytes()).hexdigest()+'  scripts/nestlet-verify-archive.py', readonly)
        self.assertIn('assert s["environment"].get("PUBLIC_ORIGIN")=="https://nestlet.celerada.link"', TEXT)
        self.assertLess(TEXT.index('check_compose_scope "$NEW_SHA"'), TEXT.index('changed=1\ncompose "$OLD_SHA" stop nestlet'))

    def test_recovery_is_separate_private_and_precedes_candidate_start(self):
        self.assertIn('--mount "type=volume,source=$DATA_VOLUME,target=/source,readonly"', TEXT)
        self.assertIn('private_operation restore --input /recovery/schema4 --output /recovery/rehearsal', TEXT)
        self.assertIn('private_operation restore --input /recovery/schema4 --output /recovery/future-check', TEXT)
        self.assertNotIn('--output /source', TEXT)
        self.assertLess(TEXT.index("rehearse_migration ||"), TEXT.index('candidate_started=1'))
        self.assertLess(TEXT.index("rehearse_future_refusal ||"), TEXT.index('candidate_started=1'))
        self.assertLess(TEXT.index('candidate_started=1'), TEXT.index('up -d --no-build --pull never --no-deps --force-recreate'))
        for name in ['rehearse_migration', 'rehearse_future_refusal']:
            function = shell_function(name)
            self.assertNotIn('type=volume', function)
            self.assertIn('--network none', function)
            self.assertIn('>>"$RECOVERY_DIR/operations.log" 2>&1', function)
        self.assertIn('[ "$(live_schema)" = 4 ]', TEXT)
        self.assertIn('check_persistent_mount "$NEW_SHA" 5', TEXT)
        self.assertNotIn('check_compatibility_contract', TEXT)

    def test_compose_cannot_inherit_ambient_mail_or_provider_credentials(self):
        function = shell_function('compose')
        for name in ['PUBLIC_ORIGIN', 'NESTLET_OPERATOR_USERNAME', 'NESTLET_OPERATOR_PASSWORD_HASH',
                     'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'ENABLE_LIVE_AI',
                     'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
                     'ALIBABA_CLOUD_SECURITY_TOKEN', 'NESTLET_EMAIL_FROM']:
            self.assertIn('-u ' + name, function)
        self.assertIn('--env-file "$ENVFILE"', function)

    def test_tag_edit_preserves_arbitrary_bytes_and_rejects_unsafe_files(self):
        with tempfile.TemporaryDirectory() as directory:
            envfile = Path(directory) / 'runtime.env'
            prefix = 'set -euo pipefail\numask 077\nENVFILE=' + str(envfile) + '\n' + shell_function('set_image_tag') + '\n'
            def run():
                return subprocess.run(['bash', '-c', prefix + f'set_image_tag "{OLD}" "{NEW}"'], capture_output=True)
            for linebreak in [b'\n', b'\r\n']:
                original = linebreak.join([b'# synthetic only', b"UNCHANGED_LITERAL='$SYNTHETIC#\\value'", ('UNCHANGED_RELEASE_REFERENCE='+OLD).encode(), ('NESTLET_IMAGE_TAG='+OLD).encode(), b'FINAL_SYNTHETIC=unchanged'])
                envfile.write_bytes(original); envfile.chmod(0o600)
                self.assertEqual(run().returncode, 0)
                self.assertEqual(envfile.read_bytes(), original.replace(('NESTLET_IMAGE_TAG='+OLD).encode(), ('NESTLET_IMAGE_TAG='+NEW).encode()))
            original=('NESTLET_IMAGE_TAG='+OLD+'\n').encode()
            for bad in [original+original, original+b' export NESTLET_IMAGE_TAG=x\n', b'UNRELATED=yes\n', b'x'*65537]:
                envfile.write_bytes(bad);envfile.chmod(0o600)
                self.assertNotEqual(run().returncode, 0)
                self.assertEqual(envfile.read_bytes(), bad)
            envfile.write_bytes(original);envfile.chmod(0o644)
            self.assertNotEqual(run().returncode, 0)
            self.assertEqual(envfile.read_bytes(), original)
            envfile.chmod(0o600)
            linked=Path(directory)/'hardlink';linked.hardlink_to(envfile)
            self.assertNotEqual(run().returncode, 0)
            linked.unlink();envfile.rename(linked);envfile.symlink_to(linked)
            self.assertNotEqual(run().returncode, 0)
            self.assertEqual(linked.read_bytes(), original)


if __name__ == '__main__':
    unittest.main(verbosity=2)
