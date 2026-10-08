"""Execute the actual embedded ciphertext-only backup against synthetic files."""
import pathlib, tempfile, subprocess, unittest, os, re, hashlib
HELPER=pathlib.Path(__file__).with_name('nestlet-upgrade-schema10.sh').read_text()
CODE=re.search(r"<<'PY_CIPHER'\n(.*?)\nPY_CIPHER",HELPER,re.S)[1]
class CipherBackup(unittest.TestCase):
 def run_case(self,kind):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);source=root/'provider-config';source.mkdir(mode=0o700);recovery=root/'recovery';recovery.mkdir(mode=0o700)
   secret=root/'secrets';secret.mkdir(mode=0o700);(secret/'provider-wrapping.key').write_bytes(b'synthetic-untouched-secret'*2)
   data=bytearray(4096);data[:16]=b'SQLite format 3\0';data[68:72]=(0x4e535043).to_bytes(4,'big');data[60:64]=(1).to_bytes(4,'big')
   if kind=='header':data[:4]=b'NOPE'
   if kind=='version':data[60:64]=(2).to_bytes(4,'big')
   if kind=='oversize':data.extend(b'x'*1048576)
   path=source/'provider-config.sqlite';path.write_bytes(data);path.chmod(0o600)
   if kind=='mode':path.chmod(0o644)
   if kind=='symlink':path.unlink();other=root/'outside';other.write_bytes(data);other.chmod(0o600);path.symlink_to(other)
   if kind=='broken-symlink':path.unlink();path.symlink_to(root/'missing')
   if kind=='hardlink':os.link(path,root/'linked')
   if kind in ['-wal','-shm','-journal','unexpected']:(source/(path.name+kind if kind.startswith('-') else kind)).write_bytes(b'synthetic')
   def snapshot(directory):return sorted((str(p.relative_to(directory)),p.lstat().st_mode,p.read_bytes()) for p in directory.rglob('*') if p.is_file())
   before=snapshot(source);secret_before=snapshot(secret)
   code=CODE.replace("'/opt/nestlet/provider-config'",repr(str(source)))
   if kind=='owner':
    code="import os,types\noriginal=os.fstat\ndef wrong(fd):\n i=original(fd);return types.SimpleNamespace(st_mode=i.st_mode,st_uid=9999,st_nlink=i.st_nlink,st_size=i.st_size)\nos.fstat=wrong\n"+code
   result=subprocess.run(['python3','-',str(recovery)],input=code,text=True,capture_output=True)
   self.assertEqual(snapshot(source),before);self.assertEqual(snapshot(secret),secret_before)
   if kind=='valid':
    self.assertEqual(result.returncode,0,result.stderr);out=recovery/'provider-ciphertext';self.assertEqual(out.stat().st_mode&0o777,0o700);self.assertEqual((out/path.name).stat().st_mode&0o777,0o600);self.assertEqual((out/path.name).read_bytes(),bytes(data));self.assertEqual(len(list(out.iterdir())),1)
   else:self.assertNotEqual(result.returncode,0,kind);self.assertFalse((recovery/'provider-ciphertext').exists())
   self.assertNotIn('synthetic',result.stdout+result.stderr)
 def test_copy(self):self.run_case('valid')
 def test_refusals(self):
  for kind in ['symlink','broken-symlink','hardlink','owner','mode','-wal','-shm','-journal','unexpected','header','version','oversize']:
   with self.subTest(kind=kind):self.run_case(kind)
 def test_no_key_read_and_durable_directories(self):
  self.assertNotIn('wrapping.key',CODE);self.assertIn('for directory in [out,out.parent]',CODE);self.assertIn('os.fsync(fd)',CODE)
if __name__=='__main__':unittest.main(verbosity=2)
