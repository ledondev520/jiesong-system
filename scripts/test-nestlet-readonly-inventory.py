#!/usr/bin/env python3
"""Offline only: no SSH, Docker, systemd, live inventory or secrets."""
import importlib.util,pathlib,tempfile,unittest,os,json,hashlib,subprocess,yaml
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts/nestlet-readonly-inventory.py'
spec=importlib.util.spec_from_file_location('inventory',SCRIPT);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InventorySafety(unittest.TestCase):
 def test_no_data_read_symlinks_or_names(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);(root/'private-customer-name').write_bytes(b'NEVER READ THIS SECRET');(root/'sub').mkdir();(root/'sub'/'another-private-name').write_bytes(b'ab')
   (root/'escape').symlink_to('/etc');(root/'sub'/'loop').symlink_to(root)
   with patch('builtins.open',side_effect=AssertionError('No regular file reads')):
    result=m.tree_metadata(root)
   self.assertEqual(result['regular_files'],2);self.assertEqual(result['logical_bytes'],24);self.assertEqual(result['symlinks_skipped'],2)
   self.assertFalse(result['partial']);self.assertNotIn('private-customer',json.dumps(result));self.assertNotIn('SECRET',json.dumps(result))
   self.assertTrue(m.tree_metadata(root,max_entries=1)['partial'])
 def test_symlink_root_refuses(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);(root/'link').symlink_to('/etc')
   with self.assertRaises(OSError):m.tree_metadata(root/'link')
 def test_same_device_mount_boundaries_are_skipped(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);(root/'inside').write_bytes(b'abc');(root/'bound-dir').mkdir();(root/'bound-dir'/'private').write_bytes(b'outside');(root/'bound-file').write_bytes(b'outside')
   forbidden={os.stat(root/'bound-dir').st_ino,os.stat(root/'bound-file').st_ino}
   with patch.object(m,'mount_id',side_effect=lambda fd:2 if os.fstat(fd).st_ino in forbidden else 1):result=m.tree_metadata(root)
   self.assertEqual(result['regular_files'],1);self.assertEqual(result['logical_bytes'],3);self.assertEqual(result['special_skipped'],2)
 def test_mount_parser_is_bounded_and_unambiguous(self):
  descriptor=os.open('/tmp',os.O_RDONLY|os.O_DIRECTORY)
  try:
   for value in [b'no mount id',b'mnt_id: 1\nmnt_id: 2\n',b'x'*8193,b'mnt_id: secret-value\n']:
    with patch.object(m.os,'read',return_value=value):
     with self.assertRaises(m.AuditRefused):m.mount_id(descriptor)
   with patch.object(m.os,'read',side_effect=PermissionError):
    with self.assertRaises(m.AuditRefused):m.mount_id(descriptor)
  finally:os.close(descriptor)
 def test_unknown_mount_identity_refuses(self):
  with tempfile.TemporaryDirectory() as temp,patch.object(m,'mount_id',side_effect=m.AuditRefused('mount_identity_refused')):
   with self.assertRaises(m.AuditRefused):m.tree_metadata(temp)
 def test_presence_is_metadata_only(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);(root/'secret.env').write_text('secret');(root/'link').symlink_to(root/'secret.env')
   with patch('builtins.open',side_effect=AssertionError('No content reads')):
    self.assertEqual(m.presence(root/'secret.env'),'present');self.assertEqual(m.presence(root/'missing'),'absent');self.assertEqual(m.presence(root/'link'),'symlink_not_followed')
 def test_schedules_redact_and_do_not_read_commands(self):
  calls=[]
  def command(args):
   calls.append(args)
   if 'list-unit-files' in args:return 'nestlet-backup-private@example.service enabled\nrestic-private.timer enabled\nssh.service enabled'
   return 'LoadState=loaded\nActiveState=active\nUnitFileState=enabled\nLastTriggerUSec=Thu 2026-10-08 14:00:00 UTC\nNextElapseUSecRealtime=SECRET@example.com\nOnFailure=secret-destination@customer.service\nExecStart=DO NOT EMIT\nEnvironment=SECRET'
  with patch.object(m,'command',side_effect=command),patch.object(m.os,'scandir',side_effect=FileNotFoundError),patch('builtins.open',side_effect=AssertionError('No config reads')):
   result=m.schedules()
  output=json.dumps(result);self.assertNotIn('SECRET',output);self.assertNotIn('customer',output);self.assertNotIn('private@',output);self.assertNotIn('ExecStart',output)
  self.assertEqual(len(result['units']),2);self.assertTrue(result['units'][0]['has_failure_handler']);self.assertIn('not_visible',result['recipients'])
  self.assertTrue(all('cat' not in args and '--property=ExecStart' not in args for args in calls))
 def test_workflow_is_readonly_and_transport_pinned(self):
  text=(ROOT/'.github/workflows/qa.yml').read_text();w=yaml.load(text,Loader=yaml.BaseLoader)
  self.assertEqual(set(w['on']),{'workflow_dispatch'});self.assertEqual(w['permissions'],{'contents':'read'});self.assertEqual(w['concurrency']['group'],'nestlet-stage')
  self.assertEqual(set(w['jobs']),{'audit'});job=w['jobs']['audit'];self.assertEqual(job['environment'],'staging')
  for v in ['ops/nestlet-readonly-audit-20261008',"github.actor == 'ledondev520'","github.repository == 'ledondev520/jiesong-system'"]:self.assertIn(v,job['if'])
  run=job['steps'][-1]['run'];self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-readonly-inventory.py',run)
  for v in ['StrictHostKeyChecking=yes','EXPECTED_HOST_SHA256','EXPECTED_HOST_FINGERPRINT','exec python3 -','exec sudo -n python3 -']:self.assertIn(v,run)
  self.assertNotIn('nestlet-update',run);self.assertNotIn('bash -s',run);subprocess.run(['bash','-n'],input=run,text=True,check=True)
 def test_script_has_no_mutating_or_broad_reads(self):
  text=SCRIPT.read_text()
  for v in ['docker exec',"'compose'",'systemctl restart','crontab -l','read_text(','read_bytes(','runtime.env','os.environ','os.remove','os.unlink','os.mkdir','O_WRONLY','O_RDWR','O_CREAT']:
   self.assertNotIn(v,text)
  self.assertIn('fcntl.LOCK_SH|fcntl.LOCK_NB',text);self.assertIn('os.O_RDONLY|os.O_NOFOLLOW',text);self.assertIn('os.O_DIRECTORY|os.O_NOFOLLOW',text)
 def test_complete_audit_mocked_has_only_allowlisted_metadata(self):
  import io,contextlib
  with tempfile.TemporaryDirectory() as temp:
   base=pathlib.Path(temp)
   for name in ['shared','releases']:(base/name).mkdir(mode=0o700)
   base.chmod(0o700);(base/'.incremental-release.lock').write_bytes(b'');(base/'.incremental-release.lock').chmod(0o600)
   (base/'current').symlink_to(base/'releases'/m.EXPECTED_SHA)
   real_lstat=os.lstat;real_fstat=os.fstat
   def rooted(info):
    values=list(info);values[4]=0;return os.stat_result(values)
   def lstat(path):
    if str(path)=='/var/lib/docker/volumes/nestlet_case_data/_data':return rooted(real_lstat(base))
    return rooted(real_lstat(path))
   calls=[]
   def command(args):
    calls.append(args)
    if 'ps' in args:return 'a'*12
    if 'volume' in args:return 'nestlet_case_data\nlocal\n/var/lib/docker/volumes/nestlet_case_data/_data\nprivate-case-storage'
    if 'inspect' in args:return 'nestlet:'+m.EXPECTED_SHA+'\nrunning\nhealthy\ntrue\n805306368\n1000000000\n96\n0'
    raise AssertionError('Unexpected command')
   class HTTP:
    status=200
    def __init__(self,host,port,timeout):assert (host,port,timeout)==('127.0.0.1',4173,3)
    def request(self,method,path):assert (method,path)==('GET','/api/health')
    def getresponse(self):return self
    def read(self,count):assert count==1024;return b'{"ok":true}'
    def close(self):pass
   output=io.StringIO()
   with patch.object(m,'BASE',base),patch.object(m.os,'geteuid',return_value=0),patch.object(m.os,'lstat',side_effect=lstat),patch.object(m.os,'fstat',side_effect=lambda fd:rooted(real_fstat(fd))),patch.object(m,'command',side_effect=command),patch.object(m,'capacity',return_value={'available_bytes':12345}),patch.object(m,'tree_metadata',return_value={'regular_files':4,'partial':False}),patch.object(m,'presence',return_value='absent'),patch.object(m,'schedules',return_value={'recipients':'not_visible'}),patch.object(m.http.client,'HTTPConnection',HTTP),patch.object(m.sys,'argv',['inventory']),patch('builtins.open',side_effect=AssertionError('No file content reads')),contextlib.redirect_stdout(output):
    m.main()
   report=json.loads(output.getvalue());self.assertTrue(report['loopback_liveness']);self.assertEqual(report['release_sha'],m.EXPECTED_SHA)
   self.assertNotIn(str(base),output.getvalue());self.assertNotIn('/var/lib/docker',output.getvalue());self.assertEqual(len(calls),3)
 def test_identity_fails_before_commands(self):
  with patch.object(m.os,'geteuid',return_value=1000),patch.object(m,'command',side_effect=AssertionError('No command before gate')),patch.object(m.sys,'argv',['inventory']):
   with self.assertRaises(m.AuditRefused):m.main()
if __name__=='__main__':unittest.main(verbosity=2)
