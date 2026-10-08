#!/usr/bin/env python3
"""Fixed, metadata-only audit. Never opens config, DB, original, log or credential contents."""
import datetime, fcntl, json, os, pathlib, re, stat, subprocess, sys, time, http.client
BASE = pathlib.Path('/opt/nestlet')
EXPECTED_SHA = 'f738655ccab834d77d9204ebab25ab1e2a61d8ee'
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
class AuditRefused(Exception): pass

def command(args):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, timeout=8, env=ENV, check=False)
    if result.returncode or len(result.stdout) > 262144: raise AuditRefused('command_unavailable')
    return result.stdout.decode('utf-8', errors='strict').strip()

def utc(value):
    return datetime.datetime.fromtimestamp(value, datetime.timezone.utc).isoformat()

def capacity(path):
    info = os.statvfs(path)
    return {'total_bytes': info.f_blocks * info.f_frsize, 'free_bytes': info.f_bfree * info.f_frsize,
            'available_bytes': info.f_bavail * info.f_frsize, 'inodes_total': info.f_files, 'inodes_free': info.f_ffree}

def mount_id(descriptor):
    # Linux kernel descriptor metadata only; never a config, data or credential file.
    if not isinstance(descriptor,int) or descriptor<0:raise AuditRefused('mount_identity_refused')
    try:
        metadata=os.open('/proc/self/fdinfo/'+str(descriptor),os.O_RDONLY|os.O_NOFOLLOW)
        try:raw=os.read(metadata,8193)
        finally:os.close(metadata)
    except OSError:raise AuditRefused('mount_identity_refused') from None
    if len(raw)>8192:raise AuditRefused('mount_identity_refused')
    values=re.findall(rb'^mnt_id:[ \t]+([0-9]{1,20})$',raw,re.M)
    if len(values)!=1:raise AuditRefused('mount_identity_refused')
    return int(values[0])

def tree_metadata(path, *, max_entries=100000, seconds=15):
    """Data metadata only; kernel mount IDs exclude same-device bind mounts too."""
    deadline = time.monotonic() + seconds
    result = {'regular_files': 0, 'directories': 0, 'symlinks_skipped': 0, 'special_skipped': 0,
              'logical_bytes': 0, 'allocated_bytes': 0, 'partial': False}
    flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
    root_fd=os.open(path,flags);root_device=os.fstat(root_fd).st_dev
    try:root_mount=mount_id(root_fd)
    except Exception:os.close(root_fd);raise
    stack=[(root_fd,0)];seen=0
    try:
        while stack:
            descriptor,depth=stack.pop()
            try:
                if depth>16 or seen>=max_entries or time.monotonic()>deadline:
                    result['partial']=True;break
                with os.scandir(descriptor) as entries:
                    for entry in entries:
                        seen+=1
                        if seen>max_entries or time.monotonic()>deadline:
                            result['partial']=True;return result
                        info=entry.stat(follow_symlinks=False)
                        if stat.S_ISLNK(info.st_mode):result['symlinks_skipped']+=1
                        elif info.st_dev!=root_device:result['special_skipped']+=1
                        elif stat.S_ISDIR(info.st_mode):
                            if len(stack)>=128:result['partial']=True;continue
                            try:child=os.open(entry.name,flags,dir_fd=descriptor)
                            except OSError:result['partial']=True;continue
                            try:cross_mount=os.fstat(child).st_dev!=root_device or mount_id(child)!=root_mount
                            except Exception:os.close(child);raise
                            if cross_mount:os.close(child);result['special_skipped']+=1
                            else:result['directories']+=1;stack.append((child,depth+1))
                        elif stat.S_ISREG(info.st_mode):
                            node=os.open(entry.name,os.O_PATH|os.O_NOFOLLOW,dir_fd=descriptor)
                            try:
                                held=os.fstat(node)
                                if mount_id(node)!=root_mount or not stat.S_ISREG(held.st_mode):result['special_skipped']+=1;continue
                                result['regular_files']+=1;result['logical_bytes']+=held.st_size
                                result['allocated_bytes']+=held.st_blocks*512
                            finally:os.close(node)
                        else:result['special_skipped']+=1
            except (OSError,ValueError):result['partial']=True
            finally:os.close(descriptor)
    finally:
        for descriptor,_ in stack:os.close(descriptor)
    return result

def presence(path):
    try: info = os.lstat(path)
    except FileNotFoundError: return 'absent'
    except OSError: return 'unknown'
    if stat.S_ISLNK(info.st_mode): return 'symlink_not_followed'
    return 'present'

def category(name):
    lower = name.lower()
    if 'nestlet' in lower: return 'nestlet_specific'
    if any(value in lower for value in ['backup','restic','borg','rclone','duplicity','kopia']): return 'backup_candidate_not_attributed'
    if any(value in lower for value in ['prometheus','alertmanager','monit','netdata','zabbix','telegraf']): return 'monitor_candidate_not_attributed'
    return None

def schedules():
    result = {'inspection': 'unit_metadata_and_matching_cron_filenames_only', 'units': [], 'partial': False,
              'destinations': 'not_visible_without_config_contents', 'retention': 'not_visible_without_policy_contents',
              'recipients': 'not_visible_without_config_contents', 'user_crontabs': 'not_inspected'}
    try:
        lines = command(['systemctl','list-unit-files','--type=timer','--type=service','--no-legend','--no-pager']).splitlines()
        names = [line.split()[0] for line in lines if line.split() and category(line.split()[0])]
        result['partial'] = len(names) > 40
        for name in names[:40]:
            if not re.fullmatch(r'[A-Za-z0-9@_.:-]+\.(?:timer|service)', name): result['partial'] = True; continue
            try:
                raw = command(['systemctl','show','--no-pager',
                    '--property=LoadState,ActiveState,UnitFileState,LastTriggerUSec,NextElapseUSecRealtime,OnFailure', name])
                fields = dict(line.split('=',1) for line in raw.splitlines() if '=' in line)
                # Only known fixed states and timestamps can leave the host. Unit names and handlers stay private.
                item = {'label': category(name), 'kind': name.rsplit('.',1)[1],
                        'has_failure_handler': bool(fields.get('OnFailure'))}
                for key in ['LoadState','ActiveState','UnitFileState']:
                    value=fields.get(key,'unknown'); item[key]=value if value in ['loaded','active','inactive','failed','activating','deactivating','enabled','disabled','static','masked','indirect','generated','transient','not-found'] else 'unknown'
                for key in ['LastTriggerUSec','NextElapseUSecRealtime']:
                    value=fields.get(key,'')
                    item[key]=value if re.fullmatch(r'(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (?:UTC|[+-]\d{4})',value) else ('none' if not value else 'present_redacted')
                result['units'].append(item)
            except Exception: result['partial'] = True
    except Exception: result['unit_inventory'] = 'unavailable'; result['partial'] = True
    cron = {key: 0 for key in ['nestlet_specific','backup_candidate_not_attributed','monitor_candidate_not_attributed']}
    try:
        with os.scandir('/etc/cron.d') as entries:
            for index, entry in enumerate(entries):
                if index >= 2000: result['partial'] = True; break
                label=category(entry.name)
                if label and entry.is_file(follow_symlinks=False): cron[label] += 1
        result['cron_file_counts']=cron
    except OSError: result['cron_file_counts']='unavailable'
    return result

def main():
    if len(sys.argv) != 1 or os.geteuid() != 0: raise AuditRefused('identity_refused')
    for path in [BASE, BASE/'shared', BASE/'releases']:
        info=os.lstat(path)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700: raise AuditRefused('managed_directory_refused')
    if not (BASE/'current').is_symlink() or os.readlink(BASE/'current') != str(BASE/'releases'/EXPECTED_SHA): raise AuditRefused('release_identity_refused')
    lock=os.open(BASE/'.incremental-release.lock',os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode)!=0o600: raise AuditRefused('lease_refused')
        fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
        ids=command(DOCKER+['ps','-aq','--filter','label=com.docker.compose.project=nestlet']).splitlines()
        if len(ids)!=1 or not re.fullmatch(r'[a-f0-9]{12,64}',ids[0]): raise AuditRefused('runtime_identity_refused')
        fmt='{{.Config.Image}}\n{{.State.Status}}\n{{.State.Health.Status}}\n{{.HostConfig.ReadonlyRootfs}}\n{{.HostConfig.Memory}}\n{{.HostConfig.NanoCpus}}\n{{.HostConfig.PidsLimit}}\n{{.RestartCount}}'
        values=command(DOCKER+['inspect','--format',fmt,ids[0]]).splitlines()
        if len(values)!=8 or values[0] != 'nestlet:'+EXPECTED_SHA or values[1]!='running' or values[2]!='healthy' or values[3]!='true': raise AuditRefused('runtime_identity_refused')
        if not all(re.fullmatch(r'\d+',v) for v in values[4:]): raise AuditRefused('runtime_metadata_refused')
        volume=command(DOCKER+['volume','inspect','--format','{{.Name}}\n{{.Driver}}\n{{.Mountpoint}}\n{{index .Labels "com.nestlet.purpose"}}','nestlet_case_data']).splitlines()
        if len(volume)!=4 or volume[0]!='nestlet_case_data' or volume[1]!='local' or volume[3]!='private-case-storage': raise AuditRefused('volume_identity_refused')
        volume_path=pathlib.Path(volume[2])
        if volume_path != pathlib.Path('/var/lib/docker/volumes/nestlet_case_data/_data') or not stat.S_ISDIR(os.lstat(volume_path).st_mode): raise AuditRefused('volume_path_refused')
        report={'audit_version':1,'observed_at':utc(time.time()),'release_sha':EXPECTED_SHA,
                'runtime':{'running':True,'healthy':True,'read_only_root':True,'memory_limit_bytes':int(values[4]),'cpu_limit_nano':int(values[5]),'pids_limit':int(values[6]),'restart_count':int(values[7])},
                'managed_filesystem':capacity(BASE),'volume_filesystem':capacity(volume_path),'volume_usage':tree_metadata(volume_path),
                'database_contents':'not_read','configuration_contents':'not_read'}
        recovery=BASE/'recovery'
        report['recovery']={'presence':presence(recovery),'offsite_destination':'not_verified','retention_policy':'not_verified'}
        if report['recovery']['presence']=='present' and stat.S_ISDIR(os.lstat(recovery).st_mode):
            report['recovery']['same_filesystem_as_managed_root']=os.lstat(recovery).st_dev==os.lstat(BASE).st_dev
            report['recovery']['usage']=tree_metadata(recovery)
            times=[]
            with os.scandir(recovery) as entries:
                for index,entry in enumerate(entries):
                    if index>=2000: report['recovery']['partial']=True;break
                    info=entry.stat(follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode):times.append(info.st_mtime)
            report['recovery'].update(directory_count=len(times),oldest_directory_mtime=utc(min(times)) if times else None,newest_directory_mtime=utc(max(times)) if times else None)
        report['scheduling']=schedules()
        report['config_presence']={label:presence(path) for label,path in {
            'restic_system_directory':'/etc/restic','borg_system_directory':'/etc/borg','rclone_system_directory':'/etc/rclone',
            'prometheus_alertmanager':'/etc/prometheus/alertmanager.yml','standalone_alertmanager':'/etc/alertmanager/alertmanager.yml',
            'monit_system':'/etc/monit/monitrc','netdata_alert_config':'/etc/netdata/health_alarm_notify.conf','zabbix_agent':'/etc/zabbix/zabbix_agentd.conf'}.items()}
        connection=http.client.HTTPConnection('127.0.0.1',4173,timeout=3)
        try:
            connection.request('GET','/api/health');response=connection.getresponse()
            report['loopback_liveness']=response.status==200 and json.loads(response.read(1024))=={'ok':True}
        except Exception: report['loopback_liveness']=False
        finally: connection.close()
        print(json.dumps(report,sort_keys=True))
    finally: os.close(lock)

if __name__=='__main__':
    try: main()
    except Exception as error:
        code=str(error) if isinstance(error,AuditRefused) else 'inventory_unavailable'
        print(json.dumps({'audit_version':1,'complete':False,'error':code}));sys.exit(1)
