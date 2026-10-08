import importlib.util, pathlib, tempfile, os, unittest, subprocess
p=pathlib.Path(__file__).with_name('nestlet-provider-bootstrap.py')
s=importlib.util.spec_from_file_location('bootstrap',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Bootstrap(unittest.TestCase):
 def fixture(self):
  t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);r=pathlib.Path(t.name);os.chmod(r,0o700);return r
 def test_initialize_reuse_without_reading_key(self):
  r=self.fixture();u=os.geteuid();m.prepare(r,u,u);key=r/'secrets/provider-wrapping.key';before=key.stat();m.prepare(r,u,u);self.assertEqual(key.stat().st_ino,before.st_ino);self.assertEqual(key.stat().st_size,32);self.assertEqual(key.stat().st_mode&0o777,0o400)
 def test_missing_key_with_existing_ciphertext_refuses(self):
  r=self.fixture();u=os.geteuid();(r/'provider-config').mkdir(mode=0o700);(r/'provider-config/provider-config.sqlite').write_bytes(b'synthetic');self.assertRaises(ValueError,m.prepare,r,u,u);self.assertFalse((r/'secrets/provider-wrapping.key').exists())
 def test_symlink_and_short_file_refuse(self):
  for kind in ['symlink','short','hardlink','mode']:
   r=self.fixture();u=os.geteuid();(r/'secrets').mkdir(mode=0o700);key=r/'secrets/provider-wrapping.key';target=r/'fixture';target.write_bytes(b'x'*32);target.chmod(0o400)
   if kind=='symlink':key.symlink_to(target)
   elif kind=='hardlink':os.link(target,key)
   else:key.write_bytes(b'x'*(1 if kind=='short' else 32));key.chmod(0o400 if kind=='short' else 0o644)
   with self.assertRaises((ValueError,OSError)):m.prepare(r,u,u)
 def test_no_approval_refuses_before_filesystem_action(self):
  v=subprocess.run(['python3',str(p)],capture_output=True,text=True);self.assertNotEqual(v.returncode,0);self.assertEqual(v.stdout,'')
if __name__=='__main__':unittest.main()
