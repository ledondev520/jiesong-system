#!/usr/bin/env python3
"""DRAFT: read-only inspection through the authorized selected-host maintenance route.
No configuration output, certificate private keys, account keys, or account contacts.
"""
import hashlib,json,os,pathlib,re,shutil,subprocess,sys
D='nestlet.celerada.link'
EXPECTED_NGINX_HASH='fa1948e97c6e437eaabb025e84660d46be60ee29c7be70283a84a3a509911831'
def run(*args):
    env=os.environ.copy();env['LC_ALL']='C'
    return subprocess.run(args,text=True,capture_output=True,timeout=30,env=env)
def hostname_matches(result):
    # Some OpenSSL releases report mismatch while returning zero. Require the
    # exact positive output, never merely a return code or substring 'match'.
    return result.returncode==0 and result.stdout.strip()==f'Hostname {D} does match certificate'
def digest(b): return hashlib.sha256(b).hexdigest()
def main():
    report={'domain':D,'tools':{c:bool(shutil.which(c)) for c in ['nginx','certbot','openssl','python3','curl','dig']}}
    if not report['tools']['nginx']: print(json.dumps(report));sys.exit(1)
    p=run('nginx','-T')
    report['nginx_test_ok']=p.returncode==0
    if p.returncode: print(json.dumps(report));sys.exit(1)
    # Capture configuration in memory, never print it or stderr.
    report['nginx_dump_sha256']=digest(p.stdout.encode())
    report['matches_previous_nginx_snapshot']=report['nginx_dump_sha256']==EXPECTED_NGINX_HASH
    report['nestlet_mentioned_in_loaded_configuration']=D in p.stdout or 'nestlet' in p.stdout.lower()
    report['include_style_candidates']=[label for label,x in [('conf.d','/etc/nginx/conf.d/*.conf'),('sites-enabled','/etc/nginx/sites-enabled/*')] if re.search(r'^\s*include\s+'+re.escape(x)+r'\s*;',p.stdout,re.M)]
    report['default_config_source_present']='# configuration file /etc/nginx/nginx.conf:' in p.stdout
    report['running_nginx_service']=run('systemctl','is-active','nginx').stdout.strip()=='active'
    svc=run('systemctl','show','nginx','--property=ExecStart','--value')
    report['custom_config_argument_in_service']=bool(re.search(r'(?:^|\s)-[cp](?:\s|/)',svc.stdout))
    version=run('certbot','--version').stdout.strip() if report['tools']['certbot'] else ''
    report['certbot_version']=version if re.fullmatch(r'certbot [0-9]+(?:\.[0-9]+){1,3}',version) else None
    accounts=[];local_account_ids=set()
    root=pathlib.Path('/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory')
    if root.is_dir():
        for d in sorted(root.iterdir()):
            if not d.is_dir() or not re.fullmatch('[a-f0-9]{32}',d.name):continue
            local_account_ids.add(d.name)
            reg=d/'regr.json'
            status='unknown'; agreed=None; prior_agreement=False; registration_uri_valid=False; parsed=False
            if reg.is_file():
                try:
                    registration=json.loads(reg.read_text());body=registration.get('body',{})
                    if not isinstance(body,dict):raise ValueError('Unexpected registration')
                    parsed=True
                    status=body.get('status','unknown');agreed=body.get('termsOfServiceAgreed')
                    prior_agreement=bool(body.get('agreement'))
                    registration_uri_valid=bool(re.fullmatch(r'https://acme-v02\.api\.letsencrypt\.org/acme/acct/[0-9]+',str(registration.get('uri',''))))
                except (ValueError,OSError): pass
            accounts.append({'registration_present':reg.is_file(),'key_file_present':(d/'private_key.json').is_file(),'status':status if status in ['valid','deactivated','revoked'] else 'unknown','explicit_terms_agreement_flag':agreed is True,'prior_agreement_reference':prior_agreement,'registration_uri_valid':registration_uri_valid,'parsed':parsed})
    report['production_acme_accounts']={'count':len(accounts),'registration_and_key_present_count':sum(x['registration_present'] and x['key_file_present'] for x in accounts),'valid_status_count':sum(x['status']=='valid' for x in accounts),'unknown_status_count':sum(x['status']=='unknown' for x in accounts),'explicitly_inactive_status_count':sum(x['status'] in ['deactivated','revoked'] for x in accounts),'explicit_terms_agreement_flag_count':sum(x['explicit_terms_agreement_flag'] for x in accounts),'prior_agreement_reference_count':sum(x['prior_agreement_reference'] for x in accounts),'production_registration_uri_count':sum(x['registration_uri_valid'] for x in accounts),'locally_reusable_candidate_count':sum(x['parsed'] and x['registration_uri_valid'] and x['key_file_present'] and x['status'] not in ['deactivated','revoked'] for x in accounts)}
    # Correlate existing renewal metadata with local accounts only in memory.
    # Do not print renewal names, account IDs, lineages, contacts, or raw values.
    linked_renewal_count=0
    renewal_root=pathlib.Path('/etc/letsencrypt/renewal')
    if renewal_root.is_dir():
        for renewal in renewal_root.glob('*.conf'):
            text=renewal.read_text()
            account=re.search(r'^\s*account\s*=\s*([a-f0-9]{32})\s*$',text,re.M)
            production=re.search(r'^\s*server\s*=\s*https://acme-v02\.api\.letsencrypt\.org/directory\s*$',text,re.M)
            if account and production and account.group(1) in local_account_ids:linked_renewal_count+=1
    report['production_acme_accounts']['existing_renewal_references_count']=linked_renewal_count
    report['account_caution']='Missing status or terms fields are unknown, not invalid. An existing registered production account is likely previously accepted and can be reused without a new acceptance step; stop only if the CA actually requires new terms/account creation. Local metadata cannot prove remote account usability.'
    certs=[];scanned_count=0;hostname_mismatch_count=0;hostname_indeterminate_count=0
    root=pathlib.Path('/etc/letsencrypt/live')
    if root.is_dir() and report['tools']['openssl']:
        for d in sorted(root.iterdir()):
            leaf=d/'cert.pem';chain=d/'chain.pem'
            if not d.is_dir() or not leaf.is_file():continue
            scanned_count+=1
            match=run('openssl','x509','-in',str(leaf),'-noout','-checkhost',D)
            covers=hostname_matches(match)
            if not covers:
                if match.stdout.strip()==f'Hostname {D} does NOT match certificate':hostname_mismatch_count+=1
                else:hostname_indeterminate_count+=1
                continue
            valid=run('openssl','x509','-in',str(leaf),'-noout','-checkend','604800').returncode==0
            trusted=chain.is_file() and run('openssl','verify','-CApath','/etc/ssl/certs','-untrusted',str(chain),'-purpose','sslserver','-verify_hostname',D,str(leaf)).returncode==0
            certs.append({'covers_domain':covers,'at_least_7_days_remaining':valid,'chain_trusted_now':trusted,'fullchain_present':(d/'fullchain.pem').is_file(),'private_key_file_present':(d/'privkey.pem').is_file()})
    report['matching_existing_certificates']={'scanned_count':scanned_count,'explicit_mismatch_count':hostname_mismatch_count,'indeterminate_match_count':hostname_indeterminate_count,'coverage_count':len(certs),'trusted_now_count':sum(x['chain_trusted_now'] for x in certs),'at_least_7_days_remaining_count':sum(x['at_least_7_days_remaining'] for x in certs),'usable_material_present_count':sum(x['chain_trusted_now'] and x['at_least_7_days_remaining'] and x['fullchain_present'] and x['private_key_file_present'] for x in certs)}
    report['renewal_timer_active']=run('systemctl','is-active','certbot.timer').stdout.strip()=='active'
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'preflight_complete':False,'error':'Read-only inspection failed; raw details withheld'}))
        sys.exit(1)
