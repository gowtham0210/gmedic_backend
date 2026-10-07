"""Calls every GET endpoint on the running app (:3000) as the demo Super Admin, Receptionist and Doctor and
validates each response against openapispec.yaml.  Run: python scripts/check-api-contract.py"""
import yaml, json, urllib.request, http.cookiejar, copy
from jsonschema import Draft7Validator
d=yaml.safe_load(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','openapispec.yaml'),encoding='utf-8')); comps=d['components']['schemas']
B='http://localhost:3000'
def sess(role,ident,pw):
    o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    o.open(urllib.request.Request(B+'/api/auth/login',data=json.dumps({"role":role,"identifier":ident,"password":pw}).encode(),headers={'Content-Type':'application/json'})).read(); return o
S={'admin':sess('SUPER_ADMIN','admin@gmedic.app','GmedicAdmin@123'),'rec':sess('RECEPTIONIST','riya.sharma@sunrisegeneral.in','Gmedic@123'),'doc':sess('DOCTOR','doc101@sunrisegeneral.in','Gmedic@Doctor1')}
def resolve(n):
    if isinstance(n,dict):
        if '$ref' in n:
            ref=n['$ref'].split('/')[3:]; t=comps[ref[0]]
            for part in ref[1:]: t=t[part]
            return resolve(copy.deepcopy(t))
        out={k:resolve(v) for k,v in n.items()}
        if out.get('nullable') and 'type' in out: out['type']=[out['type'],'null']
        return out
    if isinstance(n,list): return [resolve(x) for x in n]
    return n
ID={'/api/admin/hospitals/{id}':'HSP001','/api/admin/hospitals/{id}/branches':'HSP001','/api/admin/hospitals/{id}/documents':'HSP001','/api/admin/hospitals/{id}/rates':'HSP001','/api/admin/doctors/{id}':'DOC101','/api/admin/appointments/{id}':'APT10544','/api/admin/patients/{id}':'PAT1001','/api/admin/support/{id}':'TKT1','/api/admin/disputes/{id}/notes':'DSP1',
 '/api/appointments/{id}':'APT10544','/api/doctors/{id}':'DOC101','/api/tokens/{id}':'TK10114','/api/doctor/appointments/{id}':'APT10549','/api/doctor/patients/{id}':'PAT1001'}
Q={'/api/tokens':'?date=2026-09-29','/api/tokens/eligible':'?date=2026-10-05','/api/doctor/queue':'?date=2026-10-03','/api/admin/patients/search':'?q=ra','/api/search':'?q=ra','/api/appointments':'?pageSize=100'}
SKIP_SUFFIX=('qr.png','qr.svg','qr-poster.svg','/documents/{docId}')
ok=bad=skipped=0
for p,v in d['paths'].items():
    o=v.get('get')
    if not o: continue
    if p.endswith(SKIP_SUFFIX) or p in ('/api/support/{id}','/api/doctor/support/{id}'): skipped+=1; continue
    tag=o['tags'][0]; who='admin' if tag.startswith('Admin') else 'rec' if tag=='Receptionist' else 'doc' if tag=='Doctor' else None
    if not who: continue
    url=p
    if '{' in p:
        if p not in ID: print('no sample id for',p); skipped+=1; continue
        url=p.replace('{id}',ID[p])
    url+=Q.get(p,'')
    data=json.loads(S[who].open(B+url).read())
    sch=o['responses']['200']['content']['application/json']['schema']
    errs=list(Draft7Validator(resolve(sch)).iter_errors(data))
    if errs: bad+=1; print('MISMATCH',p,errs[0].message[:130],list(errs[0].path)[:4])
    else: ok+=1
print(f'contract check over all GET endpoints: {ok} ok, {bad} mismatching, {skipped} skipped (files / ids)')
