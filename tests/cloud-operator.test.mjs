import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const python = String.raw`
import importlib.machinery, importlib.util, pathlib, tempfile, os, pwd, json, socket, threading, multiprocessing, time, shutil
loader=importlib.machinery.SourceFileLoader('operator_module', 'deploy/deskdrop-operator')
spec=importlib.util.spec_from_loader(loader.name,loader); m=importlib.util.module_from_spec(spec); loader.exec_module(m)
multiprocessing.set_start_method('fork')
base=pathlib.Path.home()/'.cache'; base.mkdir(exist_ok=True)
root=pathlib.Path(tempfile.mkdtemp(prefix='deskdrop-protocol-',dir=base)); os.chmod(root,0o700)
c=m.Custody(root,os.getuid())
try:
 account=pwd.getpwuid(os.getuid())
 assert account.pw_uid != 0, 'Run protocol test as an unprivileged OS user'
 enrollment={'installation':m.INSTALLATION,'uid':os.getuid(),'username':account.pw_name,'subject':'synthetic-oslogin-subject','verified':True}
 path=root/'enrollment.json'; path.write_text(json.dumps(enrollment)); path.chmod(0o600)
 for raw in [b'{"action":"trigger","uid":0}', b'{"action":"trigger","action":"status"}', b'{"action":"shell"}', b'x'*129, b'{"action":"trigger","path":"/tmp/x"}']:
  try: m.parse_request(raw); raise AssertionError('request accepted')
  except (ValueError,TypeError): pass
 os.environ['USER']='root'; os.environ['SUDO_USER']='root'
 assert m.authorize(c,os.getuid())=='synthetic-oslogin-subject'
 try: m.authorize(c,os.getuid()+1); raise AssertionError('wrong actor accepted')
 except PermissionError: pass
 enrollment['username']='not-the-kernel-account'; path.write_text(json.dumps(enrollment))
 try: m.authorize(c,os.getuid()); raise AssertionError('mapping accepted')
 except PermissionError: pass
 enrollment['username']=account.pw_name; path.write_text(json.dumps(enrollment))
 broker=m.Broker(c,lambda:True,'synthetic-boot',lambda:1000)
 left,right=socket.socketpair(); assert m.peer_uid(left)==os.getuid(); left.close(); right.close()
 def request(action,disconnect=False):
  left,right=socket.socketpair(); t=threading.Thread(target=broker.connection,args=(right,)); t.start()
  left.sendall(json.dumps({'action':action}).encode()); left.shutdown(socket.SHUT_WR)
  if disconnect: left.close(); t.join(); return
  result=json.loads(left.recv(4096)); left.close(); t.join(); return result
 request('trigger',True)
 first=m.lease(c); assert first['phase']=='admitted'
 assert request('trigger')['status']=='busy'
 assert request('recover')['status']=='joined'; assert m.lease(c)['recoverRequested']
 assert m.Broker(c,lambda:True,'new-boot',lambda:999999).request(b'{"action":"trigger"}',os.getuid())['status']=='busy'
 (root/'lease.json').unlink()
 gate=multiprocessing.Event(); queue=multiprocessing.Queue()
 def contender():
  gate.wait()
  try: queue.put(broker.request(b'{"action":"trigger"}',os.getuid())['status'])
  except BlockingIOError: queue.put('busy')
 children=[multiprocessing.Process(target=contender) for _ in range(8)]
 for p in children:p.start()
 gate.set()
 values=[queue.get(timeout=5) for p in children]
 for p in children:p.join(5); assert p.exitcode==0
 assert values.count('accepted')==1 and values.count('busy')==7,values
 old=m.lease(c)
 assert request('recover')['run']==old['run']
 assert request('recover')['run']==old['run']
 old=m.lease(c)
 endpoint=str(root/'operator.sock')
 daemon=multiprocessing.Process(target=broker.serve,args=(endpoint,)); daemon.start()
 try:
  for _ in range(100):
   if pathlib.Path(endpoint).exists():break
   time.sleep(0.01)
  with socket.socket(socket.AF_UNIX) as client:
   client.settimeout(2); client.connect(endpoint); client.sendall(b'{"action":"recover"}'); client.shutdown(socket.SHUT_WR)
   assert json.loads(client.recv(4096))['status']=='joined'
  assert m.lease(c)['recoverRequested']
 finally:daemon.kill(); daemon.join(5)
 old=m.lease(c)
 restarted=multiprocessing.Process(target=broker.serve,args=(endpoint,)); restarted.start()
 try:
  time.sleep(0.05)
  with socket.socket(socket.AF_UNIX) as client:
   client.settimeout(2); client.connect(endpoint); client.sendall(b'{"action":"trigger"}'); client.shutdown(socket.SHUT_WR)
   assert json.loads(client.recv(4096))['status']=='busy'
  assert m.lease(c)==old
 finally:restarted.kill(); restarted.join(5)
 locked=multiprocessing.Event()
 def owner():
  with c.locked(): locked.set(); time.sleep(60)
 child=multiprocessing.Process(target=owner); child.start(); assert locked.wait(5); child.kill(); child.join(5)
 assert child.exitcode<0
 with c.locked(): assert m.lease(c)==old
 assert request('trigger')['status']=='busy'
 for mode in [0o644,0o666]:
  (root/'lease.json').chmod(mode)
  try:m.lease(c); raise AssertionError('unsafe mode accepted')
  except ValueError:pass
 (root/'lease.json').chmod(0o600)
 (root/'lease.json').unlink(); (root/'lease.json').symlink_to(path)
 try:m.lease(c); raise AssertionError('symlink accepted')
 except OSError:pass
 (root/'lease.json').unlink(); os.link(path,root/'lease.json')
 try:m.lease(c); raise AssertionError('hardlink accepted')
 except ValueError:pass
 (root/'lease.json').unlink(); (root/'lease.json').write_text('{'); (root/'lease.json').chmod(0o600)
 assert request('trigger')['status']=='denied-or-reconciliation-required'
 (root/'lease.json').unlink()
 closed=m.Broker(c,lambda:False,'boot',lambda:1000)
 try:closed.request(b'{"action":"trigger"}',os.getuid()); raise AssertionError('unready admission')
 except ValueError:pass
 cutoff=m.Broker(c,lambda:True,'boot',lambda:m.CUTOFF)
 try:cutoff.request(b'{"action":"trigger"}',os.getuid()); raise AssertionError('late admission')
 except ValueError:pass
 c.save({'schema':1,'installation':m.INSTALLATION,'run':'11111111-1111-4111-8111-111111111111','actor':'synthetic','boot':'old','started':1000,'deadline':1360,'phase':'complete','recoverRequested':False})
 rollback=m.Broker(c,lambda:True,'new',lambda:999)
 try:rollback.request(b'{"action":"trigger"}',os.getuid()); raise AssertionError('clock rollback admission')
 except ValueError:pass
 # Exercise actual broker sockets while a separate supervisor process is blocked.
 (root/'lease.json').unlink()
 m.time.time=lambda:1000
 h=m.Host(c,{},'synthetic-boot');h.mark(True)
 broker.readiness=h.ready;broker.reserve=h.reserve_cycle
 entered=multiprocessing.Event();release=multiprocessing.Event();seen=multiprocessing.Event()
 def inspect_worker():
  worker=m.Host(c,{},'synthetic-boot')
  def invoke(mode):
   assert mode=='inspect';entered.set();assert release.wait(5)
   return {'status':'ready'}
  worker.invoke=invoke;worker.cycle(True)
 worker=multiprocessing.Process(target=inspect_worker);worker.start()
 try:
  assert entered.wait(3)
  assert request('status')['admission']=='ready', 'long inspect blocks valid readiness'
  competing=multiprocessing.Event();answers=multiprocessing.Queue()
  def submit():
   competing.wait();answers.put(request('trigger'))
  clients=[multiprocessing.Process(target=submit) for _ in range(8)]
  for client in clients:client.start()
  competing.set()
  replies=[answers.get(timeout=3) for _ in clients]
  for client in clients:client.join(3);assert client.exitcode==0
  assert sum(r['status']=='accepted' for r in replies)==1,replies
  assert sum(r['status']=='busy' for r in replies)==7,replies
  assert request('trigger')['status']=='busy'
  assert request('recover')['status']=='joined'
  saved=m.lease(c);assert saved['recoverRequested']
  release.set();worker.join(3);assert worker.exitcode==0
  assert m.lease(c)==saved, 'inspection overwrote concurrent admission'
 finally:
  release.set()
  if worker.is_alive():worker.kill()
  worker.join(3);assert not worker.is_alive()
 # A real lock conflict must never falsely acknowledge recovery.
 saved['recoverRequested']=False;c.save(saved)
 with c.locked():
  assert request('recover')['status']!='joined'
 assert not m.lease(c)['recoverRequested']
 entered.clear();release.clear()
 def active_worker():
  worker=m.Host(c,{},'synthetic-boot')
  def invoke(mode):
   if mode=='trigger':
    entered.set();assert release.wait(5)
    assert m.lease(c)['recoverRequested'];seen.set()
   return {'status':'restored','run':saved['run']} if mode=='recover' else {'status':'ready'}
  worker.invoke=invoke;worker.cycle(True)
 worker=multiprocessing.Process(target=active_worker);worker.start()
 try:
  assert entered.wait(3)
  assert request('status')['phase']=='recovering'
  assert request('trigger')['status']=='busy'
  request('recover',True)
  assert m.lease(c)['recoverRequested'], 'disconnected recovery not persisted'
  assert request('recover')['status']=='joined'
  # Resource operations cannot overlap even though the journal lock is free.
  try:h.cycle(True);raise AssertionError('overlapping worker')
  except BlockingIOError:pass
  release.set();worker.join(3);assert worker.exitcode==0 and seen.is_set()
  result=m.lease(c);assert result['run']==saved['run'] and result['recoverRequested'] and result['phase']=='complete'
 finally:
  release.set()
  if worker.is_alive():worker.kill()
  worker.join(3);assert not worker.is_alive()
 assert c.read('runs.json')['reserved']==1
 h.mark(True);m.time.time=lambda:1006
 assert request('status')['admission']=='closed'
 assert request('trigger')['status']=='denied-or-reconciliation-required'
 m.time.time=lambda:1000
 enrollment['uid']=os.getuid()+1;c.save(enrollment,'enrollment.json')
 assert request('recover')['status']=='denied-or-reconciliation-required'
 enrollment['uid']=os.getuid();c.save(enrollment,'enrollment.json')
 h.mark(True)
 def failed(mode):raise TimeoutError()
 h.invoke=failed
 try:h.cycle();raise AssertionError('failed inspection accepted')
 except TimeoutError:pass
 assert not h.ready()
 print('peer/protocol/enrollment/concurrency/disconnect/death/custody/cutoff passed')
finally:shutil.rmtree(root)
`;
test('Linux kernel peer credentials and durable competing-process admission', { timeout: 20000, skip: process.platform !== 'linux' ? 'Linux SO_PEERCRED protocol requires kernel peer credentials; exercised on Linux CI/native Verify' : false }, () => {
  const result = spawnSync('python3', ['-B', '-c', python], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message, stderr: result.stderr }));
  assert.match(result.stdout, /passed/);
});
test('public helper rejects service modes, shell and extra arguments', () => {
  for (const args of [['--serve'], ['trigger', '--target', 'other'], ['sh']]) {
    const result = spawnSync('python3', ['-B', 'deploy/deskdrop-operator', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
  }
});

test('root supervisor modes authenticate OS Login, fence stale worker and always invoke recovery after lost worker',()=>{
 const code=String.raw`
import importlib.machinery,importlib.util,pathlib,tempfile,os,json,shutil
loader=importlib.machinery.SourceFileLoader('operator_module','deploy/deskdrop-operator');spec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)
username='synthetic'; uid=1234
profile={'loginProfiles':[{'name':'mahesh@coderabbit.ai','posixAccounts':[{'username':username,'uid':str(uid),'operatingSystemType':'LINUX'}]}]}
assert m.oslogin_mapping(username,uid,lambda p:profile)=='mahesh@coderabbit.ai'
for value in [{'loginProfiles':[]},{'loginProfiles':[{'name':'wrong','posixAccounts':[]}]},{'loginProfiles':[{'name':'mahesh@coderabbit.ai','posixAccounts':[{'username':username,'uid':'999'}]}]}]:
 try:m.oslogin_mapping(username,uid,lambda p:value);raise AssertionError('mapping accepted')
 except PermissionError:pass
root=pathlib.Path(tempfile.mkdtemp(prefix='trigger-host-',dir=pathlib.Path.home()/'.cache'));root.chmod(0o700)
c=m.Custody(root,os.getuid());calls=[]
try:
 h=m.Host(c,{},'new-boot');h.invoke=lambda mode:(calls.append(mode) or {'status':'ready'})
 r={'schema':1,'installation':m.INSTALLATION,'run':'11111111-1111-4111-8111-111111111111','actor':'synthetic','boot':'old-boot','started':1000,'deadline':1360,'phase':'admitted','recoverRequested':False}
 c.save(r);h.cycle(allow_trigger=True)
 assert calls==['recover'],calls
 assert m.lease(c)['phase']=='uncertain';assert c.read('ready.json')['ready'] is False
 calls.clear()
 def invoke(mode):
  calls.append(mode)
  return {'status':'restored','run':r['run']} if mode=='recover' else {'status':'ready'}
 h.invoke=invoke;h.cycle();assert calls==['recover','inspect'];assert m.lease(c)['phase']=='complete';assert h.ready()
 c.save({'boot':'old-boot','ready':True,'updated':int(m.time.time())},'ready.json');assert not h.ready()
 for i in range(3):h.reserve_cycle()
 try:h.reserve_cycle();raise AssertionError('fourth admission')
 except ValueError:pass
 assert c.read('runs.json')['reserved']==3
 # Unknown worker outcome is independently followed by recovery, even with caller absent.
 m.time.time=lambda:1000
 r.update(boot='new-boot',phase='admitted');c.save(r);calls.clear()
 def killed(mode):
  calls.append(mode)
  if mode=='trigger':raise TimeoutError()
  return {'status':'restored','run':r['run']} if mode=='recover' else {'status':'ready'}
 h.invoke=killed;h.cycle(allow_trigger=True);assert calls==['trigger','recover','inspect'];assert m.lease(c)['phase']=='complete'
 print('OS Login/boot/cycle limit/killed worker recovery passed')
finally:shutil.rmtree(root)
`;
 const r=spawnSync('python3',['-B','-c',code],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/passed/);
});

test('killed actual supervisor retains reservation and replacement recovers before fresh admission',()=>{
 const code=String.raw`
import importlib.machinery,importlib.util,pathlib,tempfile,os,json,shutil,multiprocessing,time
loader=importlib.machinery.SourceFileLoader('operator_module','deploy/deskdrop-operator');spec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)
multiprocessing.set_start_method('fork');root=pathlib.Path(tempfile.mkdtemp(prefix='trigger-death-',dir=pathlib.Path.home()/'.cache'));root.chmod(0o700);c=m.Custody(root,os.getuid())
r={'schema':1,'installation':m.INSTALLATION,'run':'11111111-1111-4111-8111-111111111111','actor':'synthetic','boot':'boot-one','started':1000,'deadline':1360,'phase':'admitted','recoverRequested':False};c.save(r)
entered=multiprocessing.Event();m.time.time=lambda:1000
other=multiprocessing.Process(target=time.sleep,args=(30,));other.start()
def supervisor():
 h=m.Host(c,{},'boot-one')
 def invoke(mode):
  assert mode=='trigger';entered.set();time.sleep(30)
 h.invoke=invoke;h.cycle(allow_trigger=True)
p=multiprocessing.Process(target=supervisor);p.start()
try:
 assert entered.wait(3);p.kill();p.join(3);assert p.exitcode<0
 assert m.lease(c)['phase']=='recovering' and not c.read('ready.json')['ready']
 calls=[];h=m.Host(c,{},'boot-two')
 h.invoke=lambda mode:(calls.append(mode) or ({'status':'restored','run':r['run']} if mode=='recover' else {'status':'ready'}))
 h.cycle(allow_trigger=True)
 assert calls==['recover','inspect'] and m.lease(c)['phase']=='complete' and h.ready()
 assert other.is_alive()
 print('killed supervisor/new boot/exclusive recovery/unrelated child passed')
finally:
 if p.is_alive():p.kill();p.join(3)
 other.terminate();other.join(3);shutil.rmtree(root)
`;
 const r=spawnSync('python3',['-B','-c',code],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/passed/);
});

test('actual trigger maintenance flock permits recurrence and excludes management until owner death',()=>{
 const code=String.raw`
import importlib.machinery,importlib.util,tempfile,pathlib,os,fcntl,multiprocessing,time,shutil
loader=importlib.machinery.SourceFileLoader('operator_module','deploy/deskdrop-operator');spec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)
multiprocessing.set_start_method('fork');root=pathlib.Path(tempfile.mkdtemp(dir=pathlib.Path.home()/'.cache'));root.chmod(0o700);ready=multiprocessing.Event()
def trigger():
 with m.management_lock(root,os.getuid()):ready.set();time.sleep(30)
p=multiprocessing.Process(target=trigger);p.start()
try:
 assert ready.wait(3)
 with open(root/'lifecycle.lock','w') as f:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  with m.management_lock(root,os.getuid()):raise AssertionError('management overlapped trigger')
 except BlockingIOError:pass
 p.kill();p.join(3)
 with m.management_lock(root,os.getuid()):pass
 print('maintenance exclusion and recurring lifecycle coexistence passed')
finally:
 if p.is_alive():p.kill();p.join(3)
 shutil.rmtree(root)
`;
 const result=spawnSync('python3',['-B','-c',code],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/passed/);
});

test('unknown parent installer blocks admission but allows runtime-only recovery',()=>{
 const code=String.raw`
import importlib.machinery,importlib.util,json
loader=importlib.machinery.SourceFileLoader('operator_module','deploy/deskdrop-operator');spec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)
c={'owner':'cloud_owner:'+'a'*32,'source':'b'*40,'bundleHash':'c'*64};m.installed=lambda:c;calls=[]
def command(args,**kw):
 calls.append(args)
 if args[:3]==['/usr/bin/docker','container','ls']:return 'deskdrop-cloud-installer'
 if args[:2]==['/usr/bin/docker','run']:
  assert 'DESKDROP_SUPPRESSION_BLOCKED=1' in args and args[-1]=='recover'
  return json.dumps({'status':'reconciliation-required'})
 assert args==['/opt/deskdrop/bootstrap.sh','verify'],args
 return ''
h=m.Host(None,c,'boot',command)
try:h.invoke('inspect');raise AssertionError('installer overlapped admission')
except ValueError:pass
assert not any('run' in a for a in calls)
assert h.invoke('recover')['status']=='reconciliation-required'
assert not any('management-refresh' in a for a in calls)
print('parent installer blocks provider actions without blocking restoration worker')
`;
 const r=spawnSync('python3',['-B','-c',code],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/restoration worker/);
});

test('supervisor cadence uses real custody and processes with prompt durable wake and bounded proof/backoff',()=>{
 const code=String.raw`
import importlib.machinery,importlib.util,pathlib,tempfile,os,shutil,multiprocessing,contextlib,json
loader=importlib.machinery.SourceFileLoader('operator_module','deploy/deskdrop-operator');spec=importlib.util.spec_from_loader(loader.name,loader);m=importlib.util.module_from_spec(spec);loader.exec_module(m)
multiprocessing.set_start_method('fork')
root=pathlib.Path(tempfile.mkdtemp(dir=pathlib.Path.home()/'.cache'));root.chmod(0o700);c=m.Custody(root,os.getuid())
clock=[1000];m.time.time=lambda:clock[0]
config={'owner':'synthetic-owner','source':'a'*40};m.installed=lambda:config
health={'healthy':True,'owner':config['owner'],'source':config['source'],'updated':1000000};m.protected_read=lambda p:json.dumps(health)
h=m.Host(c,config,'boot');calls=[]
h.invoke=lambda mode:(calls.append(mode) or {'status':'ready'})
s=m.Schedule(h,lambda:clock[0]);guard=contextlib.nullcontext
try:
 assert s.step(guard);assert calls==['inspect']
 for i in range(1,30):
  clock[0]=1000+i;assert not s.step(guard)
 assert calls==['inspect'] and h.admission_ready()
 clock[0]=1030;assert s.step(guard);assert calls==['inspect','inspect']
 # Slow healthy inspection runs in an actual owned process while admission stays usable.
 entered=multiprocessing.Event();release=multiprocessing.Event();seen=multiprocessing.Event()
 def worker():
  worker=m.Host(c,config,'boot')
  def invoke(mode):
   assert mode=='inspect';entered.set();assert release.wait(4);return {'status':'ready'}
  worker.invoke=invoke;worker.cycle(True)
 p=multiprocessing.Process(target=worker);p.start()
 try:
  assert entered.wait(3);clock[0]=1040;health['updated']=1040000
  assert not h.ready() and h.admission_ready()
  broker=m.Broker(c,h.admission_ready,'boot',lambda:clock[0],authenticate=lambda c,u:'synthetic',reserve=h.reserve_cycle)
  admitted=broker.request(b'{"action":"trigger"}',os.getuid());assert admitted['status']=='accepted'
  assert broker.request(b'{"action":"trigger"}',os.getuid())['status']=='busy'
  release.set();p.join(3);assert p.exitcode==0
  assert m.lease(c)['run']==admitted['run'] and m.lease(c)['phase']=='admitted'
 finally:
  release.set()
  if p.is_alive():p.kill()
  p.join(3)
 # Admission wakes the scheduler before its next idle deadline, and an active
 # worker observes the recovery flag written by a separate caller.
 entered.clear();release.clear()
 def running():
  def invoke(mode):
   calls.append(mode)
   if mode=='trigger':
    entered.set();assert release.wait(4);assert m.lease(c)['recoverRequested'];seen.set()
   return {'status':'reconciliation-required'}
  h.invoke=invoke
  assert s.step(guard)
 p=multiprocessing.Process(target=running);p.start()
 try:
  assert entered.wait(3)
  assert broker.request(b'{"action":"recover"}',os.getuid())['status']=='joined'
  assert m.lease(c)['recoverRequested']
  release.set();p.join(3);assert p.exitcode==0 and seen.is_set()
  assert m.lease(c)['phase']=='uncertain' and m.lease(c)['recoverRequested']
 finally:
  release.set()
  if p.is_alive():p.kill()
  p.join(3)
 # Repeated uncertainty still attempts restoration, but never every second.
 calls.clear();h.invoke=lambda mode:(calls.append(mode) or {'status':'reconciliation-required'})
 assert s.step(guard);assert calls==['recover']
 for delay in [15,30,60,60]:
  prior=len(calls);deadline=s.next
  clock[0]=deadline-1;assert not s.step(guard);assert len(calls)==prior
  clock[0]=deadline;assert s.step(guard);assert len(calls)==prior+1 and calls[-1]=='recover'
  assert s.next-clock[0]<=60
 # A first explicit recovery request interrupts backoff; repeated joined calls do not storm.
 r=m.lease(c);r['recoverRequested']=False;c.save(r);s.observed=(r['run'],False)
 assert broker.request(b'{"action":"recover"}',os.getuid())['status']=='joined'
 assert s.step(guard);prior=len(calls)
 assert broker.request(b'{"action":"recover"}',os.getuid())['status']=='joined'
 assert not s.step(guard) and len(calls)==prior
 r['phase']='complete';c.save(r);h.mark(True);health['updated']=int(clock[0]*1000)
 assert h.admission_ready()
 clock[0]+=121;health['updated']=int(clock[0]*1000);assert not h.admission_ready()
 h.mark(True);health['updated']-=65001;assert not h.admission_ready()
 health['updated']=int(clock[0]*1000);health['healthy']=False;assert not h.admission_ready()
 health['healthy']=True;m.installed=lambda:{};assert not h.admission_ready()
 assert c.read('runs.json')['reserved']==1
 print('cadence/slow-proof/process/wake/backoff/restoration/stale/source passed')
finally:shutil.rmtree(root)
`;
 const r=spawnSync('python3',['-B','-c',code],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/passed/);
});

test('actual recovery service polls without launching an idle controller storm',()=>{
 const code=String.raw`import sys,subprocess,pathlib,tempfile,os,shutil,contextlib,time
clock=[1000];time.time=lambda:clock[0];time.monotonic=lambda:clock[0]
g={'__name__':'fixture'}
source=pathlib.Path('deploy/deskdrop-operator').read_text()
exec(compile(source,'operator','exec'),g)
root=pathlib.Path(tempfile.mkdtemp(dir=pathlib.Path.home()/'.cache'));root.chmod(0o700)
c=g['Custody'](root,os.getuid());calls=[]
g['Custody']=lambda:c;g['installed']=lambda:{};g['os'].getuid=lambda:0;g['management_lock']=contextlib.nullcontext;g['signal'].signal=lambda *a:None
g['Host'].invoke=lambda self,mode:(calls.append(mode) or {'status':'ready'})
class Done(BaseException):pass
def sleep(seconds):
 clock[0]+=seconds
 if clock[0]>=1010:raise Done()
g['time'].sleep=sleep
try:
 try:g['service_main']('recovery')
 except Done:pass
 print({'inspections_in_ten_idle_seconds':len(calls),'calls':calls})
 assert calls==['inspect'], 'idle secret/controller storm'
finally:shutil.rmtree(root)
`;
 const r=spawnSync('python3',['-B','-c',code],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
