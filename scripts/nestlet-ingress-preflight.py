#!/usr/bin/env python3
"""DRAFT: read-only inspection through the authorized selected-host maintenance route.
No configuration output, certificate private keys, account keys, or account contacts.
"""
import hashlib,json,pathlib,re,shutil,subprocess,sys
D='nestlet.celerada.link'
def run(*args):
    return subprocess.run(args,text=True,capture_output=True,timeout=30)
def digest(b): return hashlib.sha256(b).hexdigest()
def main():
    report={'domain':D,'tools':{c:bool(shutil.which(c)) for c in ['nginx','certbot','openssl','python3','curl','dig']}}
    if not report['tools']['nginx']: print(json.dumps(report));sys.exit(1)
    p=run('nginx','-T')
    report['nginx_test_ok']=p.returncode==0
    if p.returncode: print(json.dumps(report));sys.exit(1)
    # Capture configuration in memory, never print it or stderr.
    report['nginx_dump_sha256']=digest(p.stdout.encode())
    report['nestlet_mentioned_in_loaded_configuration']=D in p.stdout or 'nestlet' in p.stdout.lower()
    report['include_style_candidates']=[label for label,x in [('conf.d','/etc/nginx/conf.d/*.conf'),('sites-enabled','/etc/nginx/sites-enabled/*')] if re.search(r'^\s*include\s+'+re.escape(x)+r'\s*;',p.stdout,re.M)]
    report['default_config_source_present']='# configuration file /etc/nginx/nginx.conf:' in p.stdout
    report['running_nginx_service']=run('systemctl','is-active','nginx').stdout.strip()=='active'
    svc=run('systemctl','show','nginx','--property=ExecStart','--value')
    report['custom_config_argument_in_service']=bool(re.search(r'(?:^|\s)-[cp](?:\s|/)',svc.stdout))
    version=run('certbot','--version').stdout.strip() if report['tools']['certbot'] else ''
    report['certbot_version']=version if re.fullmatch(r'certbot [0-9]+(?:\.[0-9]+){1,3}',version) else None
    accounts=[]
    root=pathlib.Path('/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory')
    if root.is_dir():
        for d in sorted(root.iterdir()):
            if not d.is_dir() or not re.fullmatch('[a-f0-9]{32}',d.name):continue
            reg=d/'regr.json'
            status='unknown'; agreed=None
            if reg.is_file():
                try:
                    body=json.loads(reg.read_text()).get('body',{})
                    status=body.get('status','unknown');agreed=body.get('termsOfServiceAgreed')
                except (ValueError,OSError): pass
            accounts.append({'registration_present':reg.is_file(),'key_file_present':(d/'private_key.json').is_file(),'status':status if status in ['valid','deactivated','revoked'] else 'unknown','explicit_terms_agreement_flag':agreed is True})
    report['production_acme_accounts']={'count':len(accounts),'registration_and_key_present_count':sum(x['registration_present'] and x['key_file_present'] for x in accounts),'valid_status_count':sum(x['status']=='valid' for x in accounts),'explicit_terms_agreement_flag_count':sum(x['explicit_terms_agreement_flag'] for x in accounts)}
    report['account_caution']='Presence alone does not establish accepted current terms. Reuse only with verified prior acceptance; never register or auto-accept.'
    certs=[]
    root=pathlib.Path('/etc/letsencrypt/live')
    if root.is_dir() and report['tools']['openssl']:
        for d in sorted(root.iterdir()):
            leaf=d/'cert.pem';chain=d/'chain.pem'
            if not d.is_dir() or not leaf.is_file():continue
            covers=run('openssl','x509','-in',str(leaf),'-noout','-checkhost',D).returncode==0
            if not covers:continue
            valid=run('openssl','x509','-in',str(leaf),'-noout','-checkend','604800').returncode==0
            trusted=chain.is_file() and run('openssl','verify','-CApath','/etc/ssl/certs','-untrusted',str(chain),'-purpose','sslserver','-verify_hostname',D,str(leaf)).returncode==0
            certs.append({'covers_domain':covers,'at_least_7_days_remaining':valid,'chain_trusted_now':trusted,'fullchain_present':(d/'fullchain.pem').is_file(),'private_key_file_present':(d/'privkey.pem').is_file()})
    report['matching_existing_certificates']={'coverage_count':len(certs),'trusted_now_count':sum(x['chain_trusted_now'] for x in certs),'at_least_7_days_remaining_count':sum(x['at_least_7_days_remaining'] for x in certs),'usable_material_present_count':sum(x['chain_trusted_now'] and x['at_least_7_days_remaining'] and x['fullchain_present'] and x['private_key_file_present'] for x in certs)}
    report['renewal_timer_active']=run('systemctl','is-active','certbot.timer').stdout.strip()=='active'
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'preflight_complete':False,'error':'Read-only inspection failed; raw details withheld'}))
        sys.exit(1)
