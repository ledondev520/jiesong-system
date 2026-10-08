#!/usr/bin/env python3
"""Local-only bounded release safety tests. Never invokes SSH or Docker."""
import hashlib, importlib.util, pathlib, re, subprocess, tempfile, unittest, yaml
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prior',ROOT/'scripts/test-nestlet-upgrade-schema6.py')
prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
prior.SCRIPT=ROOT/'scripts/nestlet-update-schema6.sh';prior.TEXT=prior.SCRIPT.read_text();prior.OLD='0ad91847e8c04f379f071e76bf8c325f9bb12233'
TEXT=prior.TEXT
class UpdateSafety(unittest.TestCase):
    def test_unreviewed_input_refuses_before_host_access(self):
        for value in ['a'*40,prior.OLD,'UNREVIEWED','$(false)']:
            result=subprocess.run(['bash',str(prior.SCRIPT),value],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin'})
            self.assertNotEqual(result.returncode,0);self.assertEqual(result.stdout.strip(),'Draft or unreviewed release; deployment is disabled')
    def test_languages(self):
        subprocess.run(['bash','-n',str(prior.SCRIPT)],check=True)
        for name,code in re.findall(r"<<'(PY(?:_POINTER)?)'\n(.*?)\n\1",TEXT,re.S):compile(code,name,'exec')
        for code in re.findall(r"node --input-type=module -e '\n(.*?)'",TEXT,re.S):
            subprocess.run(['node','--input-type=module','--check'],input=code,text=True,check=True)
    def test_exact_workflow_and_transport_gates(self):
        text=(ROOT/'.github/workflows/deploy.yml').read_text();w=yaml.load(text,Loader=yaml.BaseLoader)
        self.assertEqual(set(w['on']),{'workflow_dispatch'});self.assertEqual(w['permissions'],{'contents':'read'})
        self.assertEqual(w['concurrency'],{'group':'nestlet-stage','cancel-in-progress':'false'})
        job=w['jobs']['upgrade'];self.assertNotIn('false &&',job['if']);self.assertIn('readonly REVIEWED_RELEASE_SHA=2e1354ef591975160885d9461910bf00f67742e8',text);self.assertIn("readonly REVIEWED_RELEASE_SHA='2e1354ef591975160885d9461910bf00f67742e8'",TEXT)
        for gate in ["github.repository == 'ledondev520/jiesong-system'","github.repository_owner == 'ledondev520'","github.actor == 'ledondev520'","github.ref == 'refs/heads/ops/nestlet-schema6-update-20261008'"]:self.assertIn(gate,job['if'])
        self.assertIn(hashlib.sha256(prior.SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-update-schema6.sh',text)
        run=job['steps'][-1]['run'];subprocess.run(['bash','-n'],input=run,text=True,check=True)
        for gate in ['StrictHostKeyChecking=yes','EXPECTED_HOST_SHA256','EXPECTED_HOST_FINGERPRINT','sha256sum --check --status']:self.assertIn(gate,run)
        result=subprocess.run(['bash','-c',run],env={'PATH':'/usr/bin:/bin','RELEASE_SHA':'a'*40},capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertIn('Release SHA does not match',result.stdout)
    def test_no_automatic_fallback_even_before_candidate(self):
        fn=prior.shell_function('rollback')
        for started in [0,1]:
            with tempfile.TemporaryDirectory() as root:
                calls=pathlib.Path(root)/'calls'
                code=f'''smoke_started=0; changed=1; candidate_started={started}; NEW_SHA=candidate
compose() {{ printf '%s\\n' "$*" >> {calls}; }}
'''+fn+'\ntrap rollback EXIT\nexit 42\n'
                result=subprocess.run(['bash','-c',code],capture_output=True,text=True)
                self.assertEqual(result.returncode,42);self.assertEqual(calls.read_text(),'candidate stop nestlet\n')
                self.assertIn('No automatic runtime fallback',result.stderr)
        self.assertNotIn('set_image_tag',fn);self.assertNotIn('restore',fn.replace('database restore',''))
    def test_copy_only_strict_preservation(self):
        self.assertIn('flock -n 9',TEXT);self.assertIn('assert.deepEqual(afterSchema,beforeSchema',TEXT)
        self.assertIn('Existing rows changed',TEXT);self.assertIn('"$(live_schema)" = 6',TEXT)
        self.assertNotIn('--output /source',TEXT)
        for name in ['rehearse_same_schema','rehearse_schema6_backup','rehearse_future_refusal','rehearse_predecessor_copy']:
            fn=prior.shell_function(name);self.assertNotIn('type=volume',fn);self.assertIn('--network none',fn)
            self.assertIn('>>"$RECOVERY_DIR/operations.log" 2>&1',fn)
            self.assertLess(TEXT.index(name+' ||'),TEXT.index('candidate_started=1'))
        validate=prior.shell_function('validate_release')
        for value in ['remote get-url origin','rev-parse HEAD','status --porcelain --untracked-files=all']:self.assertIn(value,validate)
        self.assertNotRegex(TEXT,r'\b(down|prune|volume rm)\b')
for name in ['test_compose_rejects_scope_expansion','test_atomic_tag_only_repair','test_compose_cannot_inherit_ambient_mail_or_provider_credentials','test_tag_edit_preserves_arbitrary_bytes_and_rejects_unsafe_files']:
    setattr(UpdateSafety,name,getattr(prior.ReleaseSafety,name))
if __name__=='__main__':unittest.main(verbosity=2)
