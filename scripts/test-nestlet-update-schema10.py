#!/usr/bin/env python3
"""Offline release guards. Never invokes SSH, Docker or production paths."""
import hashlib,importlib.util,pathlib,re,subprocess,tempfile,unittest,yaml
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prior',ROOT/'scripts/test-nestlet-upgrade-schema6.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
prior.SCRIPT=ROOT/'scripts/nestlet-update-schema10.sh';prior.TEXT=prior.SCRIPT.read_text();prior.OLD='1d6c2592118977455a29ed4e7d7c5b1153362d0c';TEXT=prior.TEXT
class Safety(unittest.TestCase):
 def test_disabled_entry(self):
  for sha in ['a'*40,prior.OLD,'UNREVIEWED','$(false)']:
   p=subprocess.run(['bash',str(prior.SCRIPT),sha],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin'});self.assertNotEqual(p.returncode,0);self.assertIn('deployment is disabled',p.stdout)
 def test_no_security_recreation(self):
  fn=prior.shell_function('verify_provider_security');self.assertIn('O_NOFOLLOW',fn);self.assertIn('info.st_size==32',fn)
  for term in ['urandom','mkdir','chown','chmod','O_CREAT','readFileSync']:self.assertNotIn(term,fn)
  self.assertNotIn('prepare_provider_security',TEXT);self.assertNotIn('os.urandom',TEXT)
 def test_languages(self):
  subprocess.run(['bash','-n',str(prior.SCRIPT)],check=True)
  for name,code in re.findall(r"<<'(PY[A-Z_]*)'\n(.*?)\n\1",TEXT,re.S):compile(code,name,'exec')
  for code in re.findall(r"node --input-type=module -e '\n(.*?)'",TEXT,re.S):subprocess.run(['node','--input-type=module','--check'],input=code,text=True,check=True)
 def test_workflow_pinned_and_bound(self):
  text=(ROOT/'.github/workflows/deploy.yml').read_text();w=yaml.load(text,Loader=yaml.BaseLoader);self.assertEqual(set(w['on']),{'workflow_dispatch'});self.assertEqual(w['permissions'],{'contents':'read'});self.assertNotIn('false &&',w['jobs']['upgrade']['if']);self.assertNotIn('security_action_approved',w['on']['workflow_dispatch']['inputs'])
  self.assertIn(hashlib.sha256(prior.SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-update-schema10.sh',text)
  for gate in ['StrictHostKeyChecking=yes','EXPECTED_HOST_SHA256','c5e988afdd8e2513b54e9b9f714246e90e45662e']:self.assertIn(gate,text)
  subprocess.run(['bash','-n'],input=w['jobs']['upgrade']['steps'][-1]['run'],text=True,check=True)
 def test_retention_precedes_stop(self):
  start=TEXT.index('preflight_telemetry_preservation() {');end=TEXT.index('\npreflight_telemetry_preservation ||',start);block=TEXT[start:end]
  self.assertIn('readOnly:true',block);self.assertIn('eventsGlobal',block);self.assertIn('3600000',block)
  for bad in ['DELETE','UPDATE','INSERT','openStorage']:self.assertNotIn(bad,block)
  self.assertLess(end,TEXT.index('changed=1'))
  with tempfile.TemporaryDirectory() as d:
   calls=pathlib.Path(d)/'calls';code=f'set -euo pipefail\nOLD_SHA=old\ncompose() {{ echo preflight >> {calls}; return 1; }}\nfail() {{ exit 42; }}\n'+TEXT[start:TEXT.index('# Verify the existing encrypted-store',end)]+f'\necho stop >> {calls}\necho backup >> {calls}\n'
   result=subprocess.run(['bash','-s'],input=code,text=True,capture_output=True);self.assertEqual(result.returncode,42);self.assertEqual(calls.read_text(),'preflight\n')
 def test_readiness_and_backup_order(self):
  self.assertLess(TEXT.index('check_provider_store || fail'),TEXT.index('changed=1'))
  self.assertLess(TEXT.index('compose "$OLD_SHA" stop nestlet'),TEXT.index('\nbackup_provider_ciphertext\n'))
  self.assertIn('store.available,true',TEXT);self.assertIn('store.load();store.close()',TEXT)
  self.assertIn('create_host_path: false',TEXT);self.assertIn('target: /run/nestlet-private/provider-wrapping.key\n        read_only: true',TEXT)
 def test_no_automatic_restore_or_fallback(self):
  fn=prior.shell_function('rollback')
  with tempfile.TemporaryDirectory() as d:
   calls=pathlib.Path(d)/'calls';code=f'smoke_started=0; changed=1; NEW_SHA=candidate\ncompose() {{ echo "$*" >> {calls}; }}\n'+fn+'\ntrap rollback EXIT\nexit 42\n';result=subprocess.run(['bash','-c',code],capture_output=True,text=True);self.assertEqual(result.returncode,42);self.assertEqual(calls.read_text(),'candidate stop nestlet\n');self.assertIn('No automatic runtime fallback',result.stderr)
  self.assertNotIn('set_image_tag',fn);self.assertNotRegex(TEXT,r'\b(down|prune|volume rm)\b')
 def test_current_enabled_state_is_preserved(self):
  self.assertIn('PREVIOUS_LIVE_ENABLED=$(python3',TEXT);self.assertIn('s["liveEnabled"]==(sys.argv[1]=="true")',TEXT)
  self.assertNotIn('environment_provider_present',TEXT)
 def test_exact_provider_mounts_before_downtime(self):
  import copy,json
  code=re.search(r"config --format json \| python3 -c '\n(.*?)\n'",TEXT,re.S).group(1)
  fixture={'services':{'nestlet':{'read_only':True,'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'ports':[{'host_ip':'127.0.0.1','published':'4173','target':4173}],'environment':{'NESTLET_DB_PATH':'/data/nestlet.sqlite','PUBLIC_ORIGIN':'https://nestlet.celerada.link','NESTLET_PROVIDER_CONFIG_PATH':'/provider-config/provider-config.sqlite','NESTLET_PROVIDER_WRAPPING_KEY_FILE':'/run/nestlet-private/provider-wrapping.key'},'volumes':[{'type':'volume','source':'case_data','target':'/data'},{'type':'bind','source':'/opt/nestlet/provider-config','target':'/provider-config','bind':{'create_host_path':False}},{'type':'bind','source':'/opt/nestlet/secrets/provider-wrapping.key','target':'/run/nestlet-private/provider-wrapping.key','read_only':True,'bind':{'create_host_path':False}}]}},'volumes':{'case_data':{'name':'nestlet_case_data','labels':{'com.nestlet.purpose':'private-case-storage'}}}}
  for kind in ['valid','omitted-false','omitted-unknown-version','absent-overlay-proof','key-rw','source','target','duplicate','create','missing','old-no-overlay']:
   value=copy.deepcopy(fixture);service=value['services']['nestlet'];mounts=service['volumes']
   if kind in ['omitted-false','omitted-unknown-version']:
    mounts[1]['bind']={};mounts[2]['bind']={}
   if kind=='key-rw':mounts[2]['read_only']=False
   if kind=='source':mounts[2]['source']='/opt/nestlet'
   if kind=='target':mounts[2]['target']='/etc'
   if kind=='duplicate':mounts[2]=copy.deepcopy(mounts[1])
   if kind=='create':mounts[2]['bind']['create_host_path']=True
   if kind=='missing':mounts.pop()
   if kind=='old-no-overlay':service['volumes']=mounts[:1];service['environment'].pop('NESTLET_PROVIDER_CONFIG_PATH')
   result=subprocess.run(['python3','-c',code,'new','new','unknown-version' if kind=='omitted-unknown-version' else '2.40.3+ds1-0ubuntu1~24.04.1','false' if kind=='absent-overlay-proof' else 'true'],input=json.dumps(value),text=True,capture_output=True);self.assertEqual(result.returncode==0,kind in ['valid','omitted-false'],kind)
 def test_explicit_false_overlay_is_verified_before_scope(self):
  fn=prior.shell_function('prepare_provider_overlay')
  # Adapt only the expected owner UID for this unprivileged synthetic filesystem.
  fn=fn.replace('i.st_uid==0','i.st_uid==os.geteuid()')
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'overlay.yml'
   code='set -euo pipefail\nprovider_overlay_verified=false\nPROVIDER_OVERLAY='+str(path)+'\n'+fn+'\nprepare_provider_overlay\ntest "$provider_overlay_verified" = true\n'
   self.assertNotEqual(subprocess.run(['bash','-s'],input=code,text=True,capture_output=True).returncode,0)
   original=re.search(r'expected=b"""(.*?)"""',fn,re.S)[1].encode();path.write_bytes(original);path.chmod(0o600)
   result=subprocess.run(['bash','-s'],input=code,text=True,capture_output=True);self.assertEqual(result.returncode,0,result.stderr)
   original=path.read_bytes();self.assertIn(b'create_host_path: false',original)
   self.assertEqual(subprocess.run(['bash','-s'],input=code,text=True,capture_output=True).returncode,0)
   path.write_bytes(original.replace(b'create_host_path: false',b'create_host_path: true'))
   result=subprocess.run(['bash','-s'],input=code,text=True,capture_output=True);self.assertNotEqual(result.returncode,0)
  self.assertIn("<<'PY_OVERLAY' || return 1",fn)
  self.assertLess(TEXT.index('prepare_provider_overlay\ncheck_compose_scope'),TEXT.index('compose "$NEW_SHA" build'))
 def test_provider_ciphertext_retention(self):
  code=re.search(r"<<'PY_PROVIDER_UNCHANGED'\n(.*?)\nPY_PROVIDER_UNCHANGED",TEXT,re.S)[1]
  for kind in ['absent','same','changed','unexpected-created']:
   with tempfile.TemporaryDirectory() as d:
    root=pathlib.Path(d);source=root/'provider.sqlite';backup=root/'provider-ciphertext/provider-config.sqlite'
    if kind!='absent':source.write_bytes(b'synthetic-ciphertext');source.chmod(0o600)
    if kind in ['same','changed']:backup.parent.mkdir(mode=0o700);backup.write_bytes(b'synthetic-ciphertext' if kind=='same' else b'changed');backup.chmod(0o600)
    # Local fixture owner stands in for host root on the separate backup file.
    adapted=code.replace('/opt/nestlet/provider-config/provider-config.sqlite',str(source)).replace('read_private(backup,0)','read_private(backup,os.geteuid())')
    result=subprocess.run(['python3','-',str(root)],input=adapted,text=True,capture_output=True);self.assertEqual(result.returncode==0,kind in ['absent','same'],kind)
 def test_recovery_code_exactly_embedded(self):
  embedded=TEXT.split("<<'JS_REHEARSAL'\n",1)[1].split('\nJS_REHEARSAL',1)[0];self.assertEqual(embedded,(ROOT/'scripts/schema10-recovery-rehearsal.mjs').read_text())
  for mode in ['same-schema','roundtrip','future','compatible']:self.assertIn('" '+mode+' --runtime /app',TEXT)
  self.assertLess(TEXT.index('rehearsal "$OLD_IMAGE_ID" compatible'),TEXT.index('candidate_started=1'))

for name in ['test_atomic_tag_only_repair','test_compose_cannot_inherit_ambient_mail_or_provider_credentials','test_tag_edit_preserves_arbitrary_bytes_and_rejects_unsafe_files']:
 setattr(Safety,name,getattr(prior.ReleaseSafety,name))
if __name__=='__main__':unittest.main(verbosity=2)
