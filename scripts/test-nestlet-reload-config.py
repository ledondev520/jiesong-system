#!/usr/bin/env python3
"""No host access: reload scope, syntax, metadata-only lease and public flags."""
import hashlib,json,os,re,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts/nestlet-reload-config.sh';TEXT=SCRIPT.read_text()
SHA='2fc15f216714d0331a82456edb1d97b9f76f8498'
class ReloadSafety(unittest.TestCase):
    def test_syntax(self):
        subprocess.run(['bash','-n',str(SCRIPT)],check=True)
        for tag,code in re.findall(r"<<'(PY_[A-Z]+)'\n(.*?)\n\1",TEXT,re.S): compile(code,tag,'exec')
        for code in re.findall(r"python3 -c '\n(.*?)\n'",TEXT,re.S): compile(code,'metadata-parser','exec')
        js=re.search(r"node --input-type=module -e '\n(.*?)'",TEXT,re.S).group(1)
        r=subprocess.run(['node','--input-type=module','--check'],input=js,text=True,capture_output=True)
        self.assertEqual(r.returncode,0,r.stderr)
    def test_gate_before_host_access(self):
        for args in [[],[SHA],['a'*40,'operator-setup-finished'],[SHA,'still-editing']]:
            r=subprocess.run(['bash',str(SCRIPT),*args],capture_output=True,text=True)
            self.assertEqual(r.returncode,1);self.assertIn('completed setup lease',r.stdout)
    def test_metadata_only_and_detects_atomic_replacement(self):
        code=re.search(r"<<'PY_META'\n(.*?)\nPY_META",TEXT,re.S).group(1)
        self.assertNotRegex(code,r'\b(open|read|read_bytes|read_text|hashlib)\s*\(')
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'synthetic.env';p.write_text('SYNTHETIC=public-test\n');p.chmod(0o600)
            def metadata(): return subprocess.run(['python3','-c',code,str(p)],capture_output=True,text=True)
            before=metadata();self.assertEqual(before.returncode,0)
            replacement=Path(d)/'replacement';replacement.write_text('SYNTHETIC=public-test\n');replacement.chmod(0o600);os.replace(replacement,p)
            self.assertNotEqual(before.stdout,metadata().stdout)
            p.chmod(0o644);self.assertNotEqual(metadata().returncode,0)
    def test_public_flags_fail_closed(self):
        code=re.search(r"<<'PY_AUTH'\n(.*?)\nPY_AUTH",TEXT,re.S).group(1)
        for auth in ['True','False','None']:
            fake='''import urllib.request,json,io
class Response(io.StringIO):
 status=200
def fake(url,timeout):
 return Response(json.dumps({'ok':True} if url.endswith('/api/health') else {'authConfigured':AUTH,'authenticated':False,'caseStorageEnabled':True}))
urllib.request.urlopen=fake
'''.replace('AUTH',auth)
            r=subprocess.run(['python3','-c',fake+code],capture_output=True,text=True)
            self.assertEqual(r.returncode==0,auth=='True')
            if auth!='True': self.assertEqual(r.stdout,'')
    def test_only_recreate_and_no_secret_reads(self):
        self.assertEqual(TEXT.count('compose up '),1)
        self.assertIn('up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 90 nestlet',TEXT)
        self.assertNotIn('set_image_tag',TEXT);self.assertNotIn('config --format',TEXT)
        self.assertNotIn('.Config.Env',TEXT);self.assertNotIn('docker logs',TEXT)
        self.assertNotRegex(TEXT,r'\b(cp|sed|rm|git clone|git fetch|volume rm|down --volumes)\b')
        self.assertIn('PRAGMA user_version',TEXT)
        self.assertNotRegex(TEXT,r'PRAGMA user_version\s*=')
    def test_workflow_transport_and_digest(self):
        w=(ROOT/'.github/workflows/deploy.yml').read_text()
        self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-reload-config.sh',w)
        for value in ['group: nestlet-stage','ops/nestlet-config-reload-20261007','OPERATOR_SETUP_COMPLETE','EXPECTED_HOST_SHA256','StrictHostKeyChecking=yes','environment: staging']: self.assertIn(value,w)
        self.assertEqual(w.count('$RELEASE_SHA operator-setup-finished'),2)
if __name__=='__main__': unittest.main(verbosity=2)
