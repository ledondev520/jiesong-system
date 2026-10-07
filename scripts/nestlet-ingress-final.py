#!/usr/bin/env python3
"""DRAFT. Existing-account certificate issuance is an explicit separate stage.
No installs, account creation, terms acceptance, DNS edits, or app changes.
Authorized deployment stages: http, issue, https, rollback. Run as root.
See /tmp/nestlet-ingress-plan.md before adapting or dispatching.
"""
import argparse,configparser,hashlib,json,os,pathlib,re,socket,subprocess,sys,tempfile,time,urllib.request
D='nestlet.celerada.link'; WEB=pathlib.Path('/var/www/nestlet-acme'); STATE=pathlib.Path('/var/lib/nestlet-ingress'); MANIFEST=STATE/'manifest.json'
P=argparse.ArgumentParser();P.add_argument('operation',choices=['http','issue','https','rollback']);P.add_argument('--approved',action='store_true');P.add_argument('--host-sha256',required=True);P.add_argument('--preflight-sha256');P.add_argument('--include',choices=['conf.d','sites-enabled']);P.add_argument('--certificate-lineage');P.add_argument('--external-challenge-verified',action='store_true');a=P.parse_args()
def stop(msg):raise RuntimeError(msg)
def run(*args):
    env=os.environ.copy();env['LC_ALL']='C'
    return subprocess.run(args,capture_output=True,text=True,timeout=30,env=env,stdin=subprocess.DEVNULL)
def sha(b):return hashlib.sha256(b).hexdigest()
def check(command,message):
    p=run(*command)
    if p.returncode:stop(message+' (raw output withheld)')
    return p.stdout

def secure_parent(p):
    for q in [p,*p.parents]:
        if q.is_symlink():stop('Symlink in managed path')
        if q.exists() and (q.stat().st_uid!=0 or q.stat().st_mode & 0o022):stop('Unsafe path ownership or writable parent')
def write_new(p,b,mode=0o644):
    secure_parent(p.parent)
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as f:
        # O_EXCL established task ownership; set only this newly-created file.
        # Inherited umask must not make the public ACME probe unreadable.
        os.fchmod(f.fileno(),mode)
        f.write(b);f.flush();os.fsync(f.fileno())
def create_public_directory(p):
    # mkdir must succeed exclusively before permissions may be set.
    p.mkdir(mode=0o755)
    fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fchmod(fd,0o755)
    finally:os.close(fd)
def atomic_owned_replace(p,b,expected):
    if p.is_symlink() or not p.is_file() or sha(p.read_bytes())!=expected:stop('Managed file changed; refusing overwrite')
    tmp=p.with_name(p.name+'.nestlet-new')
    write_new(tmp,b,p.stat().st_mode & 0o777)
    os.replace(tmp,p)
def snapshot(text):
    files=re.findall(r'^# configuration file (.+):$',text,re.M)
    return {f:sha(pathlib.Path(f).read_bytes()) for f in files if f!=str(conf)}
def unchanged(m):
    # Check both original file contents and newly included files / removed includes.
    text=check(['nginx','-T'],'Nginx configuration validation failed')
    if snapshot(text)!=m['original_sources']:stop('Unrelated Nginx configuration changed; require a new review')
def save(m):
    data=json.dumps(m,indent=2).encode()
    if MANIFEST.exists():atomic_owned_replace(MANIFEST,data,sha(MANIFEST.read_bytes()))
    else:write_new(MANIFEST,data,0o600)
    os.chmod(MANIFEST,0o600)
def dns_gate():
    if not re.fullmatch('[a-f0-9]{64}',a.host_sha256):stop('Invalid selected-address digest')
    addresses={x[4][0] for x in socket.getaddrinfo(D,80,type=socket.SOCK_STREAM)}
    if not addresses or any(':' in ip or sha(ip.encode())!=a.host_sha256 for ip in addresses):stop('DNS is absent, mismatched, multiple-target, or has unreviewed IPv6')
    # Parent must additionally verify authoritative/public DNS from outside this host.
def app_gate():
    pinned='b431ea59405cbbf9ab6ec9945010f66f655b1781'
    ids=check(['docker','ps','-q','--filter','label=com.docker.compose.project=nestlet'],'Cannot inspect Nestlet container').split()
    if len(ids)!=1:stop('Expected exactly one running Nestlet container')
    fmt='{{json .Config.Image}}|{{json .HostConfig.PortBindings}}|{{json .State.Health.Status}}|{{json .HostConfig.ReadonlyRootfs}}'
    fields=check(['docker','inspect','--format',fmt,ids[0]],'Cannot inspect pinned Nestlet state').strip().split('|')
    if len(fields)!=4:stop('Unexpected container inspection result')
    image,ports,health,readonly=map(json.loads,fields)
    if image!='nestlet:'+pinned or ports!={'4173/tcp':[{'HostIp':'127.0.0.1','HostPort':'4173'}]} or health!='healthy' or readonly is not True:stop('Pinned healthy loopback-only app invariant failed')
    status=json.load(urllib.request.urlopen('http://127.0.0.1:4173/api/status',timeout=10))
    if any(status.get(k) is not False for k in ['authConfigured','authenticated','liveEnabled']):stop('Expected unconfigured/fail-closed application state changed')
def reload_checked():
    check(['nginx','-t'],'Nginx validation failed; no reload performed')
    check(['systemctl','reload','nginx'],'Graceful Nginx reload failed')
    check(['systemctl','is-active','nginx'],'Nginx service inactive after reload')
def http():return f'''# nestlet-ingress-v1: dedicated task-owned vhost
server {{
    listen 80;
    server_name {D};
    location ^~ /.well-known/acme-challenge/ {{
        root {WEB};
        default_type text/plain;
        try_files $uri =404;
    }}
    location / {{ return 503; }}
}}
'''.encode()
def https(lineage):return http().decode().replace('location / { return 503; }',f'location / {{ return 308 https://{D}$request_uri; }}').encode()+f'''
server {{
    listen 443 ssl;
    server_name {D};
    ssl_certificate {lineage}/fullchain.pem;
    ssl_certificate_key {lineage}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 25m;
    location / {{
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host {D};
        proxy_set_header X-Forwarded-Host {D};
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;
    }}
}}
'''.encode()
LINEAGE='/etc/letsencrypt/live/nestlet-ingress'
HOOK=STATE/'renew-deploy.py'
PROBE=WEB/'.well-known/acme-challenge/nestlet-readiness'
PROBE_TEXT=b'nestlet-acme-ready:b431ea59405cbbf9ab6ec9945010f66f655b1781\n'
HOOK_BYTES=b'#!/usr/bin/python3\n"""Task-scoped Certbot deploy hook; never logs certificate/account details."""\nimport hashlib,json,os,pathlib,subprocess,sys\ntry:\n    state=pathlib.Path(\'/var/lib/nestlet-ingress/manifest.json\')\n    if os.environ.get(\'RENEWED_LINEAGE\')!=\'/etc/letsencrypt/live/nestlet-ingress\':sys.exit(0)\n    if state.is_symlink() or state.stat().st_uid!=0 or state.stat().st_mode & 0o077:raise RuntimeError()\n    m=json.loads(state.read_text())\n    # Issuance before HTTPS activation and deliberate ingress rollback need no reload.\n    if m.get(\'phase\')!=\'https\':sys.exit(0)\n    if m.get(\'config\') not in [\'/etc/nginx/conf.d/nestlet.conf\',\'/etc/nginx/sites-enabled/nestlet.conf\']:raise RuntimeError()\n    conf=pathlib.Path(m[\'config\'])\n    if conf.is_symlink() or conf.stat().st_uid!=0 or conf.stat().st_mode & 0o022:raise RuntimeError()\n    if hashlib.sha256(conf.read_bytes()).hexdigest()!=m[\'config_sha256\']:raise RuntimeError()\n    for command in [[\'/usr/sbin/nginx\',\'-t\'],[\'/usr/bin/systemctl\',\'reload\',\'nginx\'],[\'/usr/bin/systemctl\',\'is-active\',\'nginx\']]:\n        if subprocess.run(command,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30).returncode:raise RuntimeError()\nexcept Exception:\n    print(\'Nestlet certificate reload hook failed; inspect privately before retry.\',file=sys.stderr)\n    sys.exit(1)\n'

def issue(m):
    dns_gate();app_gate()
    if m['phase']!='http' or not a.external_challenge_verified:stop('Issuance requires HTTP stage and successful external challenge probe')
    check(['systemctl','is-active','certbot.timer'],'Existing certificate renewal timer is not active')
    for path in [pathlib.Path(LINEAGE),pathlib.Path('/etc/letsencrypt/archive/nestlet-ingress'),pathlib.Path('/etc/letsencrypt/renewal/nestlet-ingress.conf'),HOOK]:
        if path.exists() or path.is_symlink():stop('Unexpected existing dedicated certificate or hook; inspect instead of overwriting')
    root=pathlib.Path('/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory')
    candidates=[]
    for d in root.iterdir():
        if not d.is_dir() or not re.fullmatch('[a-f0-9]{32}',d.name):continue
        reg=d/'regr.json';key=d/'private_key.json'
        if not reg.is_file() or not key.is_file():continue
        registration=json.loads(reg.read_text());body=registration.get('body',{})
        if body.get('status') in ['deactivated','revoked']:continue
        if not re.fullmatch(r'https://acme-v02\.api\.letsencrypt\.org/acme/acct/[0-9]+',str(registration.get('uri',''))):continue
        candidates.append(d.name)
    if len(candidates)!=1:stop('Expected one reusable existing production account; no account will be created')
    if not PROBE.is_file() or PROBE.is_symlink() or PROBE.read_bytes()!=PROBE_TEXT:stop('Challenge probe changed')
    # Install only a new task-owned hook, referenced only by this new lineage.
    write_new(HOOK,HOOK_BYTES,0o700)
    m['renew_hook_sha256']=sha(HOOK_BYTES);save(m)
    env=os.environ.copy();env['LC_ALL']='C'
    command=['certbot','certonly','--config','/dev/null','--non-interactive','--server','https://acme-v02.api.letsencrypt.org/directory','--account',candidates[0],'--no-directory-hooks','--webroot','--webroot-path',str(WEB),'--cert-name','nestlet-ingress','--domain',D,'--deploy-hook',str(HOOK)]
    # No --agree-tos, registration flags, installer plugin, global hook edits,
    # remote shell heredocs, or inherited stdin. Output may contain identifiers.
    result=subprocess.run(command,capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=300,env=env)
    if result.returncode:stop('Existing-account issuance failed; inspect redacted status, never auto-register or auto-accept terms')
    trusted(LINEAGE)
    renewal=pathlib.Path('/etc/letsencrypt/renewal/nestlet-ingress.conf')
    parser=configparser.ConfigParser(interpolation=None,strict=False)
    parser.read_string('[lineage]\n'+renewal.read_text())
    params=parser['renewalparams']
    if params.get('account')!=candidates[0] or params.get('authenticator')!='webroot' or params.get('server')!='https://acme-v02.api.letsencrypt.org/directory' or params.get('renew_hook')!=str(HOOK):stop('New lineage renewal settings need private review')
    webroot=params.get('webroot_path','').strip().rstrip(',').strip()
    if webroot!=str(WEB):stop('New lineage renewal webroot differs')
    m['phase']='certificate-ready';m['certificate_lineage']=LINEAGE;save(m)
    print('Dedicated certificate obtained with existing account; task-scoped renewal hook recorded and existing timer active. No new account or terms acceptance.')

def trusted(lineage):
    if not re.fullmatch(r'/etc/letsencrypt/live/[A-Za-z0-9_.-]+',lineage):stop('Certificate lineage is outside approved standard location')
    for f in ['cert.pem','chain.pem','fullchain.pem','privkey.pem']:
        if not pathlib.Path(lineage,f).is_file():stop('Certificate material missing')
    match=check(['openssl','x509','-in',lineage+'/cert.pem','-noout','-checkhost',D],'Certificate does not cover domain')
    if match.strip()!=f'Hostname {D} does match certificate':stop('Certificate hostname is not an explicit positive match')
    check(['openssl','x509','-in',lineage+'/cert.pem','-noout','-checkend','604800'],'Certificate expires within seven days')
    check(['openssl','verify','-CApath','/etc/ssl/certs','-untrusted',lineage+'/chain.pem','-purpose','sslserver','-verify_hostname',D,lineage+'/cert.pem'],'Certificate chain/hostname invalid')
try:
    if os.geteuid()!=0 or not a.approved:stop('Explicitly authorized root operation required')
    os.environ['DOCKER_HOST']='unix:///var/run/docker.sock'
    os.environ.pop('DOCKER_CONTEXT',None)
    for p in [STATE,WEB]:secure_parent(p)
    if a.operation=='http':
        dns_gate();app_gate()
        if not a.include or not a.preflight_sha256:stop('Reviewed include and preflight digest required')
        conf=pathlib.Path('/etc/nginx')/a.include/'nestlet.conf'
        secure_parent(conf)
        if any(p.exists() or p.is_symlink() for p in [STATE,WEB,conf]):stop('Unexpected existing Nestlet state/config/webroot; no changes')
        text=check(['nginx','-T'],'Existing Nginx invalid')
        if sha(text.encode())!=a.preflight_sha256:stop('Configuration differs from reviewed preflight')
        if 'nestlet' in text.lower():stop('Existing Nestlet configuration detected')
        expected='/etc/nginx/conf.d/*.conf' if a.include=='conf.d' else '/etc/nginx/sites-enabled/*'
        if not re.search(r'^\s*include\s+'+re.escape(expected)+r'\s*;',text,re.M):stop('Reviewed include absent')
        check(['systemctl','is-active','nginx'],'Existing Nginx not active')
        # No new directories under existing application paths, no credential reads.
        STATE.mkdir(mode=0o700)
        m={'version':1,'config':str(conf),'host_sha256':a.host_sha256,'original_sources':snapshot(text),'phase':'preparing','config_sha256':None,'created_dirs':[]}
        save(m)
        for d in [WEB,WEB/'.well-known',WEB/'.well-known/acme-challenge']:
            create_public_directory(d);m['created_dirs'].append(str(d));save(m)
        write_new(PROBE,PROBE_TEXT)
        m['probe_sha256']=sha(PROBE_TEXT);save(m)
        payload=http();write_new(conf,payload);m['config_sha256']=sha(payload);save(m)
        try:reload_checked()
        except Exception:
            if conf.is_file() and sha(conf.read_bytes())==m['config_sha256']:conf.unlink();m['config_sha256']=None;save(m)
            reload_checked();raise
        m['phase']='http';save(m)
        print('ACME-only HTTP installed; all other HTTP returns 503. No certificate issued. Verify challenge reachability externally before issuance.')
    else:
        if not MANIFEST.is_file() or MANIFEST.is_symlink():stop('Managed manifest missing')
        m=json.loads(MANIFEST.read_text());conf=pathlib.Path(m['config'])
        if str(conf) not in ['/etc/nginx/conf.d/nestlet.conf','/etc/nginx/sites-enabled/nestlet.conf'] or m['version']!=1 or m['host_sha256']!=a.host_sha256:stop('Manifest identity mismatch')
        secure_parent(conf);unchanged(m)
        if m['config_sha256'] and (conf.is_symlink() or not conf.is_file() or sha(conf.read_bytes())!=m['config_sha256']):stop('Task-owned configuration changed; stopping')
        if a.operation=='issue':
            issue(m)
        elif a.operation=='rollback':
            previous=conf.read_bytes() if m['config_sha256'] else None
            if previous:conf.unlink()
            try:reload_checked()
            except Exception:
                if previous:write_new(conf,previous);reload_checked()
                raise
            # Delete only empty directories created here. Never traverse/remove certificates or app data.
            m['config_sha256']=None;m['phase']='rolled-back';save(m)
            if PROBE.is_file() and not PROBE.is_symlink() and sha(PROBE.read_bytes())==m.get('probe_sha256'):PROBE.unlink()
            for d in reversed(m['created_dirs']):
                if d not in [str(WEB),str(WEB/'.well-known'),str(WEB/'.well-known/acme-challenge')]:stop('Unexpected directory in manifest')
                try:pathlib.Path(d).rmdir()
                except OSError:pass
            print('Only the task-created vhost was removed; Nginx validated and gracefully reloaded. Certificate lineage, application, and audit manifest retained.')
        else:
            dns_gate();app_gate()
            if m['phase']!='certificate-ready' or a.certificate_lineage!=LINEAGE:stop('HTTPS requires completed dedicated certificate stage')
            if not HOOK.is_file() or HOOK.is_symlink() or sha(HOOK.read_bytes())!=m.get('renew_hook_sha256'):stop('Dedicated renewal hook changed')
            trusted(a.certificate_lineage)
            previous=conf.read_bytes();payload=https(a.certificate_lineage)
            atomic_owned_replace(conf,payload,m['config_sha256'])
            try:
                reload_checked()
                # SNI and normal certificate trust verification, pinned loopback transport only.
                for i in range(10):
                    r=run('curl','--fail','--silent','--show-error','--noproxy','*','--connect-timeout','3','--max-time','10','--resolve',D+':443:127.0.0.1','https://'+D+'/api/health')
                    if r.returncode==0 and json.loads(r.stdout)=={'ok':True}:break
                    time.sleep(1)
                else:stop('Trusted local HTTPS health check failed')
            except Exception:
                atomic_owned_replace(conf,previous,sha(payload));reload_checked();raise
            m['config_sha256']=sha(payload);m['phase']='https';save(m)
            # Exercise the same scoped deploy hook without a staging ACME account.
            env=os.environ.copy();env['RENEWED_LINEAGE']=LINEAGE;env['RENEWED_DOMAINS']=D
            probe=subprocess.run([str(HOOK)],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=100,env=env)
            if probe.returncode:stop('HTTPS is active but scoped renewal reload verification failed')
            check(['systemctl','is-active','certbot.timer'],'HTTPS active but existing renewal timer inactive')
            print('Trusted local HTTPS verified; external trusted HTTPS and existing-site continuity must still be checked. Operator password remains unset.')
except Exception as e:
    # Do not emit raw subprocess output, host addresses, configs, or API bodies.
    print('STOP: '+str(e) if isinstance(e,RuntimeError) else 'STOP: '+type(e).__name__+'; review private host state before retry')
    sys.exit(1)
