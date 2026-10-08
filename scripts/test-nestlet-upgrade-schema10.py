#!/usr/bin/env python3
"""Offline release guards. Never invokes SSH, Docker or production paths."""
import hashlib,importlib.util,pathlib,re,subprocess,tempfile,unittest,yaml
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prior',ROOT/'scripts/test-nestlet-upgrade-schema6.py');prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
prior.SCRIPT=ROOT/'scripts/nestlet-upgrade-schema10.sh';prior.TEXT=prior.SCRIPT.read_text();prior.OLD='f738655ccab834d77d9204ebab25ab1e2a61d8ee';TEXT=prior.TEXT
class Safety(unittest.TestCase):
 def test_disabled_entry(self):
  for sha in ['a'*40,prior.OLD,'UNREVIEWED','$(false)']:
   p=subprocess.run(['bash',str(prior.SCRIPT),sha],capture_output=True,text=True,env={'PATH':'/usr/bin:/bin'});self.assertNotEqual(p.returncode,0);self.assertIn('deployment is disabled',p.stdout)
 def test_specific_security_gate(self):
  code=TEXT.replace('UNREVIEWED_SCHEMA10_DURABLE_TARGET','a'*40)
  for flag in ['', 'false','true;id']:
   p=subprocess.run(['bash','-s','--','a'*40,flag],input=code,capture_output=True,text=True,env={'PATH':'/usr/bin:/bin'});self.assertNotEqual(p.returncode,0);self.assertIn('Specific host security action approval',p.stdout)
 def test_languages(self):
  subprocess.run(['bash','-n',str(prior.SCRIPT)],check=True)
  for name,code in re.findall(r"<<'(PY[A-Z_]*)'\n(.*?)\n\1",TEXT,re.S):compile(code,name,'exec')
  for code in re.findall(r"node --input-type=module -e '\n(.*?)'",TEXT,re.S):subprocess.run(['node','--input-type=module','--check'],input=code,text=True,check=True)
 def test_workflow_disabled_and_bound(self):
  text=(ROOT/'.github/workflows/deploy.yml').read_text();w=yaml.load(text,Loader=yaml.BaseLoader);self.assertEqual(set(w['on']),{'workflow_dispatch'});self.assertEqual(w['permissions'],{'contents':'read'});self.assertIn('false &&',w['jobs']['upgrade']['if']);self.assertEqual(w['on']['workflow_dispatch']['inputs']['security_action_approved']['default'],'false')
  self.assertIn(hashlib.sha256(prior.SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-upgrade-schema10.sh',text)
  for gate in ['StrictHostKeyChecking=yes','EXPECTED_HOST_SHA256','UNREVIEWED_SCHEMA10_DURABLE_TARGET','SECURITY_ACTION_APPROVED']:self.assertIn(gate,text)
  subprocess.run(['bash','-n'],input=w['jobs']['upgrade']['steps'][-1]['run'],text=True,check=True)
 def test_retention_precedes_stop(self):
  start=TEXT.index('preflight_telemetry_preservation() {');end=TEXT.index('\npreflight_telemetry_preservation ||',start);block=TEXT[start:end]
  self.assertIn('readOnly:true',block);self.assertIn('eventsGlobal',block);self.assertIn('3600000',block)
  for bad in ['DELETE','UPDATE','INSERT','openStorage']:self.assertNotIn(bad,block)
  self.assertLess(end,TEXT.index('changed=1'))
  with tempfile.TemporaryDirectory() as d:
   calls=pathlib.Path(d)/'calls';code=f'set -euo pipefail\nOLD_SHA=old\ncompose() {{ echo preflight >> {calls}; return 1; }}\nfail() {{ exit 42; }}\n'+TEXT[start:TEXT.index('# Compare only effective',end)]+f'\necho stop >> {calls}\necho backup >> {calls}\n'
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
 def test_provider_metadata_outputs_only_named_booleans(self):
  import json
  start=TEXT.index('# Compare only effective');part=TEXT[start:TEXT.index('# This new route',start)];code=re.search(r"python3 -c '\n(.*?)\n'",part,re.S).group(1)
  secret='synthetic-never-emit-provider-value'
  for present,enabled,current,passed in [(True,True,True,True),(True,False,False,True),(False,False,False,False),(True,True,False,False)]:
   prefix='import urllib.request,io\nurllib.request.urlopen=lambda *a,**k:io.BytesIO('+repr(json.dumps({'liveEnabled':current}).encode())+')\n'
   data={'services':{'nestlet':{'environment':{'DEEPSEEK_API_KEY':secret if present else '', 'ENABLE_LIVE_AI':'true' if enabled else 'false'}}}}
   result=subprocess.run(['python3','-c',prefix+code],input=json.dumps(data),text=True,capture_output=True);self.assertEqual(result.returncode==0,passed);self.assertNotIn(secret,result.stdout+result.stderr)
   self.assertEqual(json.loads(result.stdout),{'environment_provider_present':present,'environment_live_enabled':enabled and present,'current_live_enabled':current})
  self.assertLess(start,TEXT.index('git clone --quiet'));self.assertLess(start,TEXT.index('prepare_provider_security\n'))
 def test_exact_provider_mounts_before_downtime(self):
  import copy,json
  code=re.search(r"config --format json \| python3 -c '\n(.*?)\n'",TEXT,re.S).group(1)
  fixture={'services':{'nestlet':{'read_only':True,'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'ports':[{'host_ip':'127.0.0.1','published':'4173','target':4173}],'environment':{'NESTLET_DB_PATH':'/data/nestlet.sqlite','PUBLIC_ORIGIN':'https://nestlet.celerada.link','NESTLET_PROVIDER_CONFIG_PATH':'/provider-config/provider-config.sqlite','NESTLET_PROVIDER_WRAPPING_KEY_FILE':'/run/nestlet-private/provider-wrapping.key'},'volumes':[{'type':'volume','source':'case_data','target':'/data'},{'type':'bind','source':'/opt/nestlet/provider-config','target':'/provider-config','bind':{'create_host_path':False}},{'type':'bind','source':'/opt/nestlet/secrets/provider-wrapping.key','target':'/run/nestlet-private/provider-wrapping.key','read_only':True,'bind':{'create_host_path':False}}]}},'volumes':{'case_data':{'name':'nestlet_case_data','labels':{'com.nestlet.purpose':'private-case-storage'}}}}
  for kind in ['valid','key-rw','source','target','duplicate','create','missing','old-no-overlay']:
   value=copy.deepcopy(fixture);service=value['services']['nestlet'];mounts=service['volumes']
   if kind=='key-rw':mounts[2]['read_only']=False
   if kind=='source':mounts[2]['source']='/opt/nestlet'
   if kind=='target':mounts[2]['target']='/etc'
   if kind=='duplicate':mounts[2]=copy.deepcopy(mounts[1])
   if kind=='create':mounts[2]['bind']['create_host_path']=True
   if kind=='missing':mounts.pop()
   if kind=='old-no-overlay':service['volumes']=mounts[:1];service['environment'].pop('NESTLET_PROVIDER_CONFIG_PATH')
   result=subprocess.run(['python3','-c',code,'new','new'],input=json.dumps(value),text=True,capture_output=True);self.assertEqual(result.returncode==0,kind=='valid',kind)
 def test_recovery_code_exactly_embedded(self):
  embedded=TEXT.split("<<'JS_REHEARSAL'\n",1)[1].split('\nJS_REHEARSAL',1)[0];self.assertEqual(embedded,(ROOT/'scripts/schema10-recovery-rehearsal.mjs').read_text())
  for mode in ['migration','roundtrip','historical','future','predecessor']:self.assertIn('" '+mode+' --runtime /app',TEXT)
  self.assertLess(TEXT.index('rehearsal "$OLD_IMAGE_ID" predecessor'),TEXT.index('candidate_started=1'))
 def test_bootstrap_code_exactly_embedded(self):
  embedded=TEXT.split("<<'PY_BOOTSTRAP'\n",1)[1].split('\nPY_BOOTSTRAP',1)[0];self.assertEqual(embedded,(ROOT/'scripts/nestlet-provider-bootstrap.py').read_text())
for name in ['test_compose_rejects_scope_expansion','test_atomic_tag_only_repair','test_compose_cannot_inherit_ambient_mail_or_provider_credentials','test_tag_edit_preserves_arbitrary_bytes_and_rejects_unsafe_files']:
 setattr(Safety,name,getattr(prior.ReleaseSafety,name))
if __name__=='__main__':unittest.main(verbosity=2)
