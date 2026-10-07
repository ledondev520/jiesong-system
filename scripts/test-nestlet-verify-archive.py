#!/usr/bin/env python3
"""Local trusted public archives + synthetic faults only. No host/Docker/network use."""
import contextlib
import copy
import hashlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/workspace/scratch/2443643f679f/nestlet-schema5-final-source')
spec = importlib.util.spec_from_file_location('archive_gate', ROOT/'scripts/nestlet-verify-archive.py')
gate = importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
ARCHIVE, RUNTIME = gate.manifests()


class ArchiveGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive_bytes = subprocess.check_output(['git','-C',str(SOURCE),'archive',gate.COMMIT])

    def source_fixture(self, private_modes=True):
        temp = tempfile.TemporaryDirectory(prefix='nestlet-gate-source-');self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        with tarfile.open(fileobj=io.BytesIO(self.archive_bytes)) as source:
            source.extractall(root, filter='data')
        root.chmod(0o700)
        if private_modes:
            for path in root.rglob('*'):
                if path.is_dir():path.chmod(0o700)
                else:path.chmod(0o700 if path.stat().st_mode&0o111 else 0o600)
        return root

    def verify(self, root):
        gate.verify_archive(root, ARCHIVE, os.geteuid())

    def test_full_exact_archive_accepts_git_and_private_umask_modes(self):
        for private in [False, True]:
            root=self.source_fixture(private)
            before={str(path.relative_to(root)):(path.read_bytes(),stat.S_IMODE(path.stat().st_mode)) for path in root.rglob('*') if path.is_file()}
            self.verify(root)
            after={str(path.relative_to(root)):(path.read_bytes(),stat.S_IMODE(path.stat().st_mode)) for path in root.rglob('*') if path.is_file()}
            self.assertEqual(after,before)

    def test_extra_private_file_or_directory_refuses_before_any_file_reads(self):
        for is_directory in [False,True]:
            root=self.source_fixture();path=root/('PRIVATE_SENTINEL_DIR' if is_directory else '.env')
            if is_directory:path.mkdir(mode=0o700)
            else:path.write_text('SYNTHETIC_PRIVATE_SENTINEL_DO_NOT_READ')
            with patch.object(gate.os,'read',side_effect=AssertionError('content read before full inventory rejection')):
                with self.assertRaises(RuntimeError):self.verify(root)
            self.assertTrue(path.exists())

    def test_tamper_missing_hardlink_fifo_and_symlink_fail_closed(self):
        for case in ['tamper','missing','hardlink','fifo','symlink']:
            root=self.source_fixture();path=root/'auth.js'
            if case=='tamper':
                data=path.read_bytes();path.write_bytes(b'X'+data[1:])
            elif case=='missing':path.unlink()
            elif case=='hardlink':
                path.unlink();os.link(root/'storage.js',path)
            elif case=='fifo':path.unlink();os.mkfifo(path,0o600)
            else:
                path.unlink();path.symlink_to(root/'storage.js')
            with self.assertRaises((RuntimeError,OSError)):self.verify(root)

    def test_writable_and_executable_mode_changes_fail(self):
        for location,mode in [('auth.js',0o666),('auth.js',0o700),('public',0o777)]:
            root=self.source_fixture();(root/location).chmod(mode)
            with self.assertRaises(RuntimeError):self.verify(root)

    def test_root_symlink_and_swapped_directory_fail_no_follow(self):
        root=self.source_fixture();parent=Path(tempfile.mkdtemp(prefix='nestlet-gate-link-'));self.addCleanup(lambda:shutil.rmtree(parent))
        alias=parent/'archive';alias.symlink_to(root,target_is_directory=True)
        with self.assertRaises(OSError):self.verify(alias)
        original=gate.hash_archive_file;changed=False
        def swap(root_fd,entry,before_files,before_dirs,uid):
            nonlocal changed
            if not changed:
                changed=True
                (root/'public').rename(root/'public-moved')
                (root/'public').symlink_to(root/'public-moved',target_is_directory=True)
            return original(root_fd,entry,before_files,before_dirs,uid)
        with patch.object(gate,'hash_archive_file',swap),self.assertRaises((OSError,RuntimeError)):self.verify(root)

    def test_changes_after_hashing_are_caught_by_final_inventory(self):
        root=self.source_fixture();original=gate.hash_archive_file;changed=False
        def alter(root_fd,entry,before_files,before_dirs,uid):
            nonlocal changed
            result=original(root_fd,entry,before_files,before_dirs,uid)
            if not changed:
                changed=True
                path=root/entry['path'];data=path.read_bytes();path.write_bytes(data[:-1]+bytes([data[-1]^1]))
            return result
        with patch.object(gate,'hash_archive_file',alter),self.assertRaises(RuntimeError):self.verify(root)

    def test_manifest_tampering_and_unknown_expected_paths_refused(self):
        with self.assertRaises(RuntimeError):gate.load_manifest(gate.ARCHIVE_MANIFEST_TEXT+' ',gate.ARCHIVE_MANIFEST_SHA256,'nestlet-trusted-git-tree-manifest',315,9465233)
        data=json.loads(gate.ARCHIVE_MANIFEST_TEXT);data['files'][0]['path']='../outside'
        text=json.dumps(data)
        with self.assertRaises(RuntimeError):gate.load_manifest(text,hashlib.sha256(text.encode()).hexdigest(),'nestlet-trusted-git-tree-manifest',315,9465233)

    def runtime_fixture(self):
        source=self.source_fixture();temp=tempfile.TemporaryDirectory(prefix='nestlet-gate-runtime-');self.addCleanup(temp.cleanup);root=Path(temp.name)
        for entry in RUNTIME['files']:
            path=root/entry['path'];path.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
            shutil.copyfile(source/entry['path'],path);path.chmod(0o755 if entry['gitMode']=='100755' else 0o644)
        # Explicitly outside raw source-copy proof; these contents are never read.
        (root/'node_modules').mkdir();(root/'node_modules'/'PRIVATE_SENTINEL').write_text('not read')
        (root/'public'/'next').mkdir();(root/'public'/'next'/'generated.js').write_text('not source-equivalent')
        return root

    def runtime_check(self,root):
        return subprocess.run(['node','--input-type=module','-e',gate.runtime_program(str(root),os.geteuid()),json.dumps(RUNTIME)],capture_output=True,text=True)

    def test_literal_runtime_copy_set_passes_and_does_not_claim_generated_bytes(self):
        root=self.runtime_fixture();before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
        result=self.runtime_check(root)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout,'PASS\n')
        self.assertEqual(before,{p:p.read_bytes() for p in root.rglob('*') if p.is_file()})
        self.assertEqual(RUNTIME['fileCount'],31)
        self.assertNotIn('package-lock.json',{e['path'] for e in RUNTIME['files']})
        self.assertNotIn('agent-library-tools.js',{e['path'] for e in RUNTIME['files']})

    def test_runtime_tamper_link_parent_link_and_mode_refused(self):
        for failure in ['tamper','file-link','parent-link','mode']:
            root=self.runtime_fixture();path=root/'auth.js'
            if failure=='tamper':path.write_bytes(b'X'+path.read_bytes()[1:])
            elif failure=='file-link':path.unlink();path.symlink_to(root/'storage.js')
            elif failure=='parent-link':(root/'public').rename(root/'moved');(root/'public').symlink_to(root/'moved')
            else:path.chmod(0o666)
            result=self.runtime_check(root)
            self.assertNotEqual(result.returncode,0);self.assertEqual(result.stdout,'')

    def test_external_output_is_only_generic_pass_fail(self):
        for failure in [RuntimeError('PRIVATE_SENTINEL_PATH_HASH_VALUE'),KeyboardInterrupt()]:
            out,err=io.StringIO(),io.StringIO()
            with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
                code=gate.emit_gate(lambda:(_ for _ in ()).throw(failure))
            self.assertEqual(code,1);self.assertEqual(out.getvalue(),'Nestlet verification failed.\n');self.assertEqual(err.getvalue(),'')
        out=io.StringIO()
        with contextlib.redirect_stdout(out):code=gate.emit_gate(lambda:None)
        self.assertEqual(code,0);self.assertEqual(out.getvalue(),'Nestlet verification passed.\n')

    def managed_fixture(self):
        temp=tempfile.TemporaryDirectory(prefix='nestlet-managed-gate-');self.addCleanup(temp.cleanup);base=Path(temp.name)
        (base/'releases').mkdir(mode=0o700);(base/'shared').mkdir(mode=0o700)
        archive=base/'releases'/gate.COMMIT;shutil.copytree(self.source_fixture(),archive)
        marker=base/'.nestlet-managed';marker.write_bytes(b'nestlet-managed-stage-v1\n');marker.chmod(0o600)
        lock=base/'.incremental-release.lock';lock.write_bytes(b'');lock.chmod(0o600)
        (base/'current').symlink_to(archive)
        return base,archive,lock

    def test_marker_is_private_bounded_nofollow_and_detects_swap(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);marker=root/'marker';marker.write_bytes(b'nestlet-managed-stage-v1\n');marker.chmod(0o600)
            gate.verify_marker(marker,os.geteuid())
            original_read=gate.os.read;calls=[]
            def swap(fd,n):
                calls.append(n);value=original_read(fd,n)
                replacement=root/'replacement';replacement.write_text('PRIVATE_SENTINEL_NEVER_READ');replacement.chmod(0o600);replacement.replace(marker)
                return value
            with patch.object(gate.os,'read',swap),self.assertRaises(RuntimeError):gate.verify_marker(marker,os.geteuid())
            self.assertEqual(calls,[65])
            marker.unlink();marker.symlink_to(root/'PRIVATE_SENTINEL_TARGET')
            with patch.object(gate.os,'read',side_effect=AssertionError('must not read link')),self.assertRaises(OSError):gate.verify_marker(marker,os.geteuid())
            marker.unlink();marker.write_bytes(b'x'*65);marker.chmod(0o600)
            with patch.object(gate.os,'read',side_effect=AssertionError('must reject oversized marker before read')),self.assertRaises(RuntimeError):gate.verify_marker(marker,os.geteuid())
            marker.write_bytes(b'nestlet-managed-stage-v1');marker.chmod(0o644)
            with self.assertRaises(RuntimeError):gate.verify_marker(marker,os.geteuid())

    def test_root_replacement_after_final_scan_is_rejected(self):
        root=self.source_fixture();old=root.with_name(root.name+'-moved');self.addCleanup(lambda:shutil.rmtree(old,ignore_errors=True))
        original=gate.enumerate_archive;count=0
        def change_after_scan(*args):
            nonlocal count
            result=original(*args);count+=1
            if count==2:root.rename(old);root.mkdir(mode=0o700)
            return result
        with patch.object(gate,'enumerate_archive',change_after_scan),self.assertRaises(RuntimeError):self.verify(root)

    def test_inherited_exclusive_lease_is_validated_and_retained(self):
        base,archive,lock=self.managed_fixture();fd=os.open(lock,os.O_RDWR)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch.object(gate,'BASE',base),patch.object(gate,'ARCHIVE',archive):gate.verify_host(mode='archive',lease_fd=fd)
            other=os.open(lock,os.O_RDONLY)
            try:
                with self.assertRaises(BlockingIOError):fcntl.flock(other,fcntl.LOCK_EX|fcntl.LOCK_NB)
                with patch.object(gate,'BASE',base),patch.object(gate,'ARCHIVE',archive),self.assertRaises(BlockingIOError):gate.verify_host(mode='archive')
            finally:os.close(other)
            self.assertEqual(lock.read_bytes(),b'')
        finally:os.close(fd)
        wrong=base/'wrong-lock';wrong.write_bytes(b'');wrong.chmod(0o600);fd=os.open(wrong,os.O_RDWR)
        try:
            with patch.object(gate,'BASE',base),patch.object(gate,'ARCHIVE',archive),self.assertRaises(RuntimeError):gate.verify_host(mode='archive',lease_fd=fd)
        finally:os.close(fd)

    def test_real_shell_fd9_handoff_keeps_exclusive_lease(self):
        base,archive,lock=self.managed_fixture()
        source=(ROOT/'scripts/nestlet-verify-archive.py').read_text().replace("BASE = Path('/opt/nestlet')",'BASE = Path('+repr(str(base))+')').replace('sys.exit(emit_gate(verify_host))', "sys.exit(emit_gate(lambda: verify_host(mode='archive', lease_fd=9)))")
        shell='set -euo pipefail\numask 077\nexec 9>"'+str(lock)+'"\nflock -n 9\npython3 - <<\'PY_TEST\'\n'+source+'\nPY_TEST\nif flock -n "'+str(lock)+'" true; then exit 90; fi\n'
        result=subprocess.run(['bash','-c',shell],text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(result.stdout,'Nestlet verification passed.\n')

    def test_literal_current_pointer_is_not_silently_normalized(self):
        base,archive,lock=self.managed_fixture();(base/'current').unlink();(base/'current').symlink_to('releases/'+gate.COMMIT)
        with patch.object(gate,'BASE',base),patch.object(gate,'ARCHIVE',archive),self.assertRaises(RuntimeError):gate.verify_host(mode='archive')

    def test_runtime_rejects_app_tmpfs_and_retains_approved_hardening(self):
        image='sha256:'+'a'*64
        item={'image':'nestlet:'+gate.COMMIT,'imageId':image,'project':'nestlet','service':'nestlet','running':True,'health':'healthy','readOnly':True,'workingDir':'/app','command':['node','server.js'],'user':'node','ports':{'4173/tcp':[{'HostIp':'127.0.0.1','HostPort':'4173'}]},'mounts':[{'Type':'volume','Name':'nestlet_case_data','Destination':'/data','RW':True}],'tmpfs':{'/tmp':'rw,noexec'},'privileged':False,'capDrop':['ALL'],'capAdd':None,'security':['no-new-privileges:true']}
        volume={'Name':'nestlet_case_data','Driver':'local','Options':None,'Labels':{'com.docker.compose.project':'nestlet','com.docker.compose.volume':'case_data','com.nestlet.purpose':'private-case-storage'}}
        def command(args):
            if args[:3]==['docker','ps','-aq']:return 'a'*12
            if args[:2]==['docker','inspect']:return json.dumps(item)
            if args[:3]==['docker','volume','inspect']:return json.dumps(volume)
            if args[:3]==['docker','image','inspect']:return image
            raise AssertionError('Unexpected command')
        with patch.object(gate,'command',command):self.assertEqual(gate.inspect_runtime(),('a'*12,image))
        original=copy.deepcopy(item)
        for change in ['tmpfs-config','tmpfs-mount','privileged','cap-add','security']:
            item=copy.deepcopy(original)
            if change=='tmpfs-config':item['tmpfs']['/app']='rw'
            elif change=='tmpfs-mount':item['mounts'].append({'Type':'tmpfs','Destination':'/app'})
            elif change=='privileged':item['privileged']=True
            elif change=='cap-add':item['capAdd']=['SYS_ADMIN']
            else:item['security']=[]
            with patch.object(gate,'command',command),self.assertRaises(RuntimeError):gate.inspect_runtime()

    def test_host_commands_do_not_print_environments_or_source_results(self):
        text=(ROOT/'scripts/nestlet-verify-archive.py').read_text()
        self.assertNotIn('.Config.Env',text)
        self.assertNotIn('docker run',text)
        self.assertNotIn('runtime.env',text)
        self.assertIn('stderr=subprocess.DEVNULL',text)
        self.assertNotIn('DatabaseSync',gate.HEADER_GATE)
        self.assertNotIn('console.log(JSON.stringify',gate.HEADER_GATE)


if __name__=='__main__':unittest.main(verbosity=2)
