#!/usr/bin/env python3
"""Synthetic-only diagnostics tests. No Docker, SSH, production or provider access."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import yaml

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/nestlet-release-identity.py'
spec = importlib.util.spec_from_file_location('identity', SCRIPT)
identity = importlib.util.module_from_spec(spec);spec.loader.exec_module(identity)
OLD = 'c540c89862bbd4c5534b09e083f1db03de36eaac'
OTHER = '1' * 40
IMAGE = 'sha256:' + 'a' * 64


class IdentitySafety(unittest.TestCase):
    def fixture(self, relative=False):
        directory=tempfile.TemporaryDirectory();self.addCleanup(directory.cleanup)
        base=Path(directory.name)
        for path in [base/'releases',base/'shared',base/'releases'/OLD]:path.mkdir(mode=0o700)
        (base/'.nestlet-managed').write_text('nestlet-managed-stage-v1\n')
        lock=base/'.incremental-release.lock';lock.write_text('');lock.chmod(0o600)
        (base/'current').symlink_to('releases/'+OLD if relative else base/'releases'/OLD)
        item={'image':'nestlet:'+OLD,'imageId':IMAGE,'project':'nestlet','service':'nestlet','running':True,'health':'healthy','readOnly':True,'ports':{'4173/tcp':[{'HostIp':'127.0.0.1','HostPort':'4173'}]},'mounts':[{'Type':'volume','Name':'nestlet_case_data','Destination':'/data','RW':True}]}
        volume={'Name':'nestlet_case_data','Driver':'local','Options':None,'Labels':{'com.docker.compose.project':'nestlet','com.docker.compose.volume':'case_data','com.nestlet.purpose':'private-case-storage'}}
        calls=[]
        def command(args):
            calls.append(args)
            if args[0]=='git':
                self.assertEqual(args[1],'--no-optional-locks')
                if args[-3:]==['remote','get-url','origin']:return identity.REPO
                if args[-2:]==['rev-parse','HEAD']:return OLD
                if args[-3:]==['status','--porcelain','--untracked-files=all']:return ''
            if args[:3]==['docker','ps','-aq']:return 'a'*12
            if args[:2]==['docker','inspect']:return json.dumps(item)
            if args[:3]==['docker','volume','inspect']:return json.dumps(volume)
            if args[:3]==['docker','image','inspect']:return IMAGE
            if args[:2]==['docker','exec']:return json.dumps({'schemaVersion':4,'applicationIdentityValid':True})
            raise AssertionError('Unapproved command')
        return base,item,volume,calls,command

    def test_absolute_and_relative_return_only_allowlisted_receipt(self):
        for relative in [False,True]:
            base,item,volume,calls,command=self.fixture(relative)
            with patch.object(identity,'command',command):report=identity.report(base)
            self.assertEqual(report,{'inspectionComplete':True,'canonicalManagedTarget':True,'checkoutClean':True,'verifiedCurrentCommit':OLD,'pointerForm':'relative' if relative else 'absolute','imageCommitAgreement':True,'schemaVersion':4,'applicationIdentityValid':True,'healthy':True})
            self.assertNotIn(str(base),json.dumps(report))
            self.assertFalse(any('runtime.env' in str(call) for call in calls))
            self.assertTrue(all(not any(value in call for value in ['stop','start','up','run','build','rm','cp','mv']) for call in calls))
            self.assertEqual((base/'.incremental-release.lock').read_text(),'')

    def test_image_mismatch_and_unhealthy_are_reported_without_repair(self):
        base,item,volume,calls,command=self.fixture()
        item['image']='nestlet:'+OTHER;item['health']='unhealthy'
        with patch.object(identity,'command',command):report=identity.report(base)
        self.assertFalse(report['imageCommitAgreement']);self.assertFalse(report['healthy'])

    def test_stopped_container_has_unknown_schema_and_no_exec(self):
        base,item,volume,calls,command=self.fixture();item['running']=False
        with patch.object(identity,'command',command):report=identity.report(base)
        self.assertFalse(report['healthy']);self.assertIsNone(report['schemaVersion']);self.assertIsNone(report['applicationIdentityValid'])
        self.assertFalse(any(call[:2]==['docker','exec'] for call in calls))

    def test_unknown_or_busy_header_is_not_inferred_from_image(self):
        base,item,volume,calls,command=self.fixture()
        def fail_header(args):
            if args[:2]==['docker','exec']:raise RuntimeError('synthetic busy')
            return command(args)
        with patch.object(identity,'command',fail_header):report=identity.report(base)
        self.assertIsNone(report['schemaVersion']);self.assertIsNone(report['applicationIdentityValid'])

    def test_scope_escape_wrong_volume_and_missing_lock_fail_closed(self):
        base,item,volume,calls,command=self.fixture()
        item['mounts'][0]['Name']='unrelated'
        with patch.object(identity,'command',command),self.assertRaises(RuntimeError):identity.report(base)
        item['mounts'][0]['Name']='nestlet_case_data'
        (base/'current').unlink();(base/'current').symlink_to(base/'shared')
        with patch.object(identity,'command',command),self.assertRaises(RuntimeError):identity.report(base)
        (base/'current').unlink();(base/'current').symlink_to(base/'releases'/OLD)
        (base/'.incremental-release.lock').unlink()
        with patch.object(identity,'command',command),self.assertRaises(FileNotFoundError):identity.report(base)
        self.assertFalse((base/'.incremental-release.lock').exists())

    def test_partial_receipt_preserves_verified_source_and_safe_stage(self):
        base,item,volume,calls,command=self.fixture(relative=True)
        (base/'.incremental-release.lock').unlink()
        with patch.object(identity,'command',command),self.assertRaises(FileNotFoundError):identity.report(base)
        self.assertEqual(identity.STAGE,'maintenance-lock-open')
        self.assertEqual(identity.PARTIAL,{'pointerForm':'relative','canonicalManagedTarget':True,'managedDirectoryCommit':OLD,'originHostMatches':True,'originRepositoryMatches':True,'verifiedCurrentCommit':OLD,'checkoutClean':True})
        self.assertNotIn(str(base),json.dumps(identity.PARTIAL))
        base,item,volume,calls,command=self.fixture()
        def dirty(args):
            if args[-3:]==['status','--porcelain','--untracked-files=all']:return '?? private-file-name-that-must-not-be-output'
            return command(args)
        with patch.object(identity,'command',dirty),self.assertRaises(RuntimeError):identity.report(base)
        self.assertEqual(identity.STAGE,'current-checkout-clean')
        self.assertFalse(identity.PARTIAL['checkoutClean'])
        self.assertEqual(identity.PARTIAL['verifiedCurrentCommit'],OLD)
        self.assertNotIn('private-file-name',json.dumps(identity.PARTIAL))

    def test_origin_classification_is_redacted_and_never_relaxes_gate(self):
        for origin in ['https://github.com/ledondev520/nestlet.git', 'https://github.com/ledondev520/nestlet/', 'git@github.com:ledondev520/nestlet.git', 'ssh://git@github.com/ledondev520/nestlet.git', 'https://synthetic-user:synthetic-private@example.invalid/ledondev520/nestlet.git']:
            good='github.com' in origin
            self.assertEqual(identity.origin_classification(origin),(good,good))
        self.assertEqual(identity.origin_classification('https://github.com/unrelated/repository'),(True,False))
        base,item,volume,calls,command=self.fixture()
        def alternate(args):
            if args[-3:]==['remote','get-url','origin']:return 'https://synthetic-user:synthetic-private@github.com/ledondev520/nestlet/'
            return command(args)
        with patch.object(identity,'command',alternate),self.assertRaises(RuntimeError):identity.report(base)
        self.assertEqual(identity.STAGE,'current-repository-identity')
        self.assertEqual(identity.PARTIAL['managedDirectoryCommit'],OLD)
        self.assertTrue(identity.PARTIAL['originHostMatches']);self.assertTrue(identity.PARTIAL['originRepositoryMatches'])
        self.assertNotIn('verifiedCurrentCommit',identity.PARTIAL)
        self.assertNotIn('synthetic-private',json.dumps(identity.PARTIAL))

    def test_header_reads_metadata_without_sqlite_open_or_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);filename=root/'nestlet.sqlite'
            db=sqlite3.connect(filename);db.executescript('PRAGMA application_id=1314083916; PRAGMA user_version=4; CREATE TABLE synthetic(x);');db.close();filename.chmod(0o600)
            code=identity.HEADER_CHECK.replace('/data',directory)
            before=filename.read_bytes();names=sorted(os.listdir(root))
            result=subprocess.run(['node','--input-type=module','-e',code],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(json.loads(result.stdout),{'schemaVersion':4,'applicationIdentityValid':True})
            self.assertEqual(filename.read_bytes(),before);self.assertEqual(sorted(os.listdir(root)),names)
            db=sqlite3.connect(filename);db.execute('PRAGMA user_version=6;');db.close()
            result=subprocess.run(['node','--input-type=module','-e',code],capture_output=True,text=True)
            self.assertEqual(json.loads(result.stdout)['schemaVersion'],6)
            db=sqlite3.connect(filename);db.execute('PRAGMA journal_mode=WAL;');db.close()
            before=filename.read_bytes();names=sorted(os.listdir(root))
            result=subprocess.run(['node','--input-type=module','-e',code],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0);self.assertEqual(result.stdout,'')
            self.assertEqual(filename.read_bytes(),before);self.assertEqual(sorted(os.listdir(root)),names)
            self.assertNotIn('DatabaseSync',code)

    def test_workflow_preserves_dispatch_identity_and_separate_upgrade(self):
        workflow=(ROOT/'.github/workflows/deploy.yml').read_text();parsed=yaml.load(workflow,Loader=yaml.BaseLoader)
        self.assertEqual(set(parsed['on']),{'workflow_dispatch'})
        self.assertEqual(parsed['permissions'],{'contents':'read'})
        job=parsed['jobs']['preflight'];self.assertEqual(job['environment'],'staging')
        self.assertIn("github.ref == 'refs/heads/ops/nestlet-schema5-email-release-20261007'",job['if'])
        run=job['steps'][-1]['run'];self.assertIn('StrictHostKeyChecking=yes',run)
        self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-release-identity.py',run)
        self.assertIn('if [[ "$RELEASE_OPERATION" == upgrade ]]; then',run)
        self.assertIn('< scripts/nestlet-upgrade-schema5.sh',run)
        self.assertIn('< scripts/nestlet-release-identity.py',run)
        self.assertEqual(subprocess.run(['bash','-n'],input=run,text=True,capture_output=True).returncode,0)
        # The diagnostic operation must not change the release/migration script at all.
        committed=subprocess.check_output(['git','show','0a6d59b5b6186afb864875943674142b1080db96:scripts/nestlet-upgrade-schema5.sh'],cwd=ROOT)
        self.assertEqual((ROOT/'scripts/nestlet-upgrade-schema5.sh').read_bytes(),committed)


if __name__=='__main__':unittest.main(verbosity=2)
