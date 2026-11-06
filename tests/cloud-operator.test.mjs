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
 print('peer/protocol/enrollment/concurrency/disconnect/death/custody/cutoff passed')
finally:shutil.rmtree(root)
`;
test('Linux kernel peer credentials and durable competing-process admission', { timeout: 20000 }, () => {
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
