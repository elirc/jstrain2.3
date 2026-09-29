from pathlib import Path
import os,sys,json,subprocess,time,tempfile,urllib.request,urllib.error,hashlib,traceback,socket
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding='utf-8')
S=Path(__file__).resolve().parents[1];C=S/'.browser-checks';C.mkdir(exist_ok=True)
name=sys.argv[1];assert name.replace('-','').isalnum();out=C/name;out.mkdir(exist_ok=False)
runtime=Path(tempfile.mkdtemp(prefix='runtime-',dir=out)).resolve();db=runtime/'workspace.sqlite';env=os.environ.copy();env['WORKSPACE_DB_FILE']=str(db);env['NEXT_TELEMETRY_DISABLED']='1'
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
origin=f'http://127.0.0.1:{port}';env['WORKSPACE_ORIGIN']=origin
checks=[];errors=[];server=None;browser=None
def accept_dialog(dialog):
    """Accept any dialog the app raises so a check never blocks on a confirm."""
    dialog.accept()
def passed(label):
    """Record one named invariant as verified."""
    checks.append(label)
    print('PASS ' + label, flush=True)
def command(args):
    """Run a project script in the app directory and capture its output."""
    return subprocess.run(args, cwd=S, env=env, capture_output=True, text=True, encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW)
setup=command(['node','scripts/setup.mjs','--owner','Browser Learner']);assert setup.returncode==0,setup.stderr
token=setup.stdout.strip().splitlines()[-1];assert len(token)==64
before=hashlib.sha256(db.read_bytes()).hexdigest();again=command(['node','scripts/setup.mjs','--owner','Other']);assert again.returncode!=0;assert hashlib.sha256(db.read_bytes()).hexdigest()==before
passed('fresh CLI setup and repeat-setup refusal preserve database bytes')
def request(path,method='GET',body=None,revision=None,headers=None):
    h={'Authorization':'Bearer '+token};h.update(headers or {})
    if body is not None:h['Content-Type']='application/json'
    if revision:h['If-Match']='"'+revision+'"'
    req=urllib.request.Request(origin+path,data=None if body is None else json.dumps(body).encode(),method=method,headers=h)
    try:
        with urllib.request.urlopen(req,timeout=20) as r:return r.status,r.read(),dict(r.headers)
    except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
def accepted():
    """Read the accepted (committed) workspace: the invariant every check compares against."""
    code, data, _ = request('/api/workspace')
    assert code == 200, (code, data)
    return json.loads(data)
def login(page):
    page.goto(origin,wait_until='domcontentloaded');page.get_by_label('Owner token').fill(token);page.get_by_role('button',name='Open workspace',exact=True).click()
    try:expect(page.get_by_label('Page title',exact=True)).to_be_visible(timeout=30000)
    except Exception:
        (out/'login-failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');page.screenshot(path=str(out/'login-failure.png'),full_page=True);raise
def saved(page):expect(page.locator('.sync-toolbar [role=status]')).to_contain_text('Saved and accepted',timeout=20000)
def explicit_save(page):page.get_by_role('button',name='Save',exact=True).click();saved(page)
try:
    log=(out/'server.log').open('w',encoding='utf-8')
    server=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',str(port)],cwd=S,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
    (out/'process.json').write_text(json.dumps({'pid':server.pid,'port':port}),encoding='utf-8')
    deadline=time.time()+120
    while time.time()<deadline:
        if server.poll() is not None:raise RuntimeError('Next server exited; inspect server.log')
        try:
            if request('/api/workspace')[0]==200:break
        except (OSError,urllib.error.URLError):pass
        time.sleep(.5)
    else:raise RuntimeError('Server startup timed out')
    assert request('/api/workspace',headers={'Authorization':'Bearer wrong'})[0]==401
    assert request('/api/workspace',headers={'Origin':'https://example.invalid'})[0]==403
    assert request('/api/workspace?workspaceId=missing')[0]==404
    passed('actual Next HTTP authorization origin and workspace boundaries')
    with sync_playwright() as p:
        executable=os.environ.get('ASTRA_BROWSER_EXECUTABLE')
        browser=p.chromium.launch(executable_path=executable,headless=True)
        context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
        try:
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',accept_dialog)
            login(page);assert accepted()['state']['users'][0]['name']=='Browser Learner';passed('browser owner sign-in and initial accepted workspace')
            page.get_by_label('Page title',exact=True).fill('Browser CRUD course');explicit_save(page)
            root=accepted()['state']['pages'][0]['id'];assert accepted()['state']['pages'][0]['title']=='Browser CRUD course';passed('page edit accepted through UI and real SQLite')
            page.screenshot(path=str(out/'workspace-desktop.png'),full_page=True)
            page.reload();expect(page.get_by_label('Owner token')).to_be_visible();login(page);expect(page.get_by_label('Page title',exact=True)).to_have_value('Browser CRUD course');passed('reload requires token again and reads persisted content')
            # Existing root contains a starter database. All selectors are user-facing.
            database=page.get_by_role('region',name='Database Tasks',exact=True);expect(database).to_be_visible()
            database.get_by_text('Properties, views and filters',exact=True).click()
            database.get_by_label('New property name',exact=True).fill('Quantity');database.get_by_label('New property type',exact=True).select_option('number');database.get_by_role('button',name='Add property',exact=True).click()
            quantity=database.get_by_label('Quantity for row',exact=False).first;quantity.fill('0')
            database.get_by_label('New property name',exact=True).fill('Inspected');database.get_by_label('New property type',exact=True).select_option('checkbox');database.get_by_role('button',name='Add property',exact=True).click()
            explicit_save(page);state=accepted()['state'];block=next(block for block in state['blocksByPage'][root] if block['type']=='database');qty=next(prop['id'] for prop in block['props']['properties'] if prop['name']=='Quantity');inspected=next(prop['id'] for prop in block['props']['properties'] if prop['name']=='Inspected');assert block['props']['rows'][0]['values'][qty]==0;assert block['props']['rows'][0]['values'][inspected] is False;passed('typed number zero and checkbox false survive accepted save')
            database.get_by_role('button',name='Add record',exact=True).click();database.get_by_label('Quantity for row',exact=False).last.fill('10');explicit_save(page)
            database.get_by_label('Sort field',exact=True).select_option(qty);database.get_by_label('Sort direction',exact=True).select_option('desc');explicit_save(page);expect(database.get_by_label('Quantity for row',exact=False).first).to_have_value('10');passed('new record and numeric sort render through stored view settings')
            database.get_by_role('button',name='Board',exact=True).click();expect(database.get_by_role('heading',name='Unassigned (blank)',exact=True)).to_be_visible();database.get_by_role('button',name='Calendar',exact=True).click();expect(database.get_by_role('heading',name='No date',exact=True)).to_be_visible();database.get_by_role('button',name='Table',exact=True).click();explicit_save(page);passed('board and calendar retain unassigned and undated records')
            with page.expect_download() as event:page.get_by_role('button',name='Accepted MD',exact=True).click()
            event.value.save_as(str(out/'accepted.md'));assert 'Quantity' in (out/'accepted.md').read_text(encoding='utf-8');passed('authenticated accepted Markdown download includes table content')
            database.locator('tbody tr').first.get_by_role('button',name='Delete record',exact=True).click();explicit_save(page);expect(database.get_by_label('Quantity for row',exact=False)).to_have_count(1)
            database.locator('li').filter(has_text='Quantity (number)').get_by_role('button',name='Delete property',exact=True).click();explicit_save(page)
            current=next(item for item in accepted()['state']['blocksByPage'][root] if item['type']=='database')['props'];assert not any(prop['id']==qty for prop in current['properties']);assert all(qty not in row['values'] for row in current['rows']);assert current['views'][0]['sorts']==[];passed('record and referenced property deletion persist with view cleanup')
            page.get_by_role('button',name='Snapshot',exact=True).click();expect(page.locator('.version-row')).to_have_count(1,timeout=15000)
            page.get_by_label('Page title',exact=True).fill('Changed after snapshot');explicit_save(page);page.locator('.version-row').first.click();page.get_by_role('button',name='Restore this version',exact=True).click();expect(page.get_by_label('Page title',exact=True)).to_have_value('Browser CRUD course',timeout=15000);passed('snapshot capture and restore preserve actual page content')
            page.locator('.version-row').first.click();page.get_by_role('button',name='Delete this snapshot',exact=True).click();expect(page.locator('.version-row')).to_have_count(0,timeout=15000);passed('snapshot deletion removes history without deleting page')
            # Competing edits in two real tabs, no fake server response.
            other=context.new_page();other.on('pageerror',lambda e:errors.append(str(e)));other.on('dialog',accept_dialog);login(other)
            page.get_by_label('Page title',exact=True).fill('First tab accepted');explicit_save(page)
            other.get_by_label('Page title',exact=True).fill('Second tab retained');expect(other.locator('.sync-toolbar [role=status]')).to_contain_text('review-required',timeout=20000)
            assert accepted()['state']['pages'][0]['title']=='First tab accepted';expect(other.get_by_label('Page title',exact=True)).to_have_value('Second tab retained');passed('real two-tab stale write refused with local draft retained')
            page.get_by_label('Page title',exact=True).fill('First tab accepted again');explicit_save(page)
            retained=other.evaluate("""() => new Promise((resolve,reject)=>{const request=indexedDB.open('knowledge-workspace-drafts-v2');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readonly'),read=tx.objectStore('drafts').getAll();let value;read.onsuccess=()=>{value=read.result;};tx.oncomplete=()=>{db.close();resolve(value);};};})""")
            assert any(value['state']['pages'][0]['title']=='Second tab retained' for value in retained);passed('one tab acceptance does not clear another tab retained IndexedDB draft')
            other.get_by_role('button',name='Review latest',exact=True).click();review=other.get_by_role('region',name='Draft review',exact=True);expect(review).to_be_visible();review.get_by_role('radio',name='Your draft',exact=False).check();review.get_by_role('button',name='Accept reviewed draft',exact=True).click();other.get_by_role('button',name='Save',exact=True).click();saved(other);assert accepted()['state']['pages'][0]['title']=='Second tab retained';passed('explicit three-way conflict choice saved against latest revision')
            page.close();page=other
            # Abort only one outgoing write; this is a simulated network failure.
            def lose_write(route):
                if route.request.method=='PUT':route.abort('failed')
                else:route.continue_()
            page.route('**/api/workspace',lose_write)
            page.get_by_label('Page title',exact=True).fill('Offline retained title');expect(page.locator('.sync-toolbar [role=status]')).to_contain_text('review-required',timeout=20000)
            page.unroute('**/api/workspace',lose_write)
            # Sign-out awaits ordered IndexedDB persistence before discarding memory.
            page.get_by_role('button',name='Sign out',exact=True).click();expect(page.get_by_label('Owner token')).to_be_visible();login(page)
            recovery=page.get_by_role('region',name='Saved local draft',exact=True);expect(recovery).to_be_visible();page.get_by_role('button',name='Sign out',exact=True).click();expect(page.get_by_label('Owner token')).to_be_visible();login(page);expect(recovery).to_be_visible();passed('sign-out preserves a saved draft that has not been reviewed');recovery.get_by_role('button',name='Review saved draft',exact=True).click();expect(page.get_by_label('Page title',exact=True)).to_have_value('Offline retained title');page.get_by_role('button',name='Accept reviewed draft',exact=True).click();explicit_save(page);passed('simulated network failure retained in real IndexedDB across sign-out and reviewed recovery')
            page.get_by_role('button',name='Import Markdown',exact=True).click();page.get_by_label('Import page title',exact=True).fill('Imported code lesson');page.get_by_label('Markdown to import',exact=True).fill('```js\n  const count = 0;\n```');page.get_by_role('button',name='Import',exact=True).click();expect(page.get_by_label('Page title',exact=True)).to_have_value('Imported code lesson');expect(page.get_by_label('</> text',exact=True)).to_have_value('  const count = 0;');passed('authenticated Markdown import creates code block and selects new page')
            page.remove_listener('dialog',accept_dialog);page.once('dialog',lambda dialog:dialog.accept('Review this code'));page.get_by_role('button',name='Comment on block',exact=True).click();page.on('dialog',accept_dialog);explicit_save(page);expect(page.locator('.thread')).to_contain_text('Review this code')
            page.remove_listener('dialog',accept_dialog);page.once('dialog',lambda dialog:dialog.accept('Edited explanation'));page.get_by_role('button',name='Edit comment',exact=True).click();page.on('dialog',accept_dialog);explicit_save(page);expect(page.locator('.thread')).to_contain_text('Edited explanation');passed('comment creation and editing persist through the UI')
            page.remove_listener('dialog',accept_dialog);page.once('dialog',lambda dialog:dialog.accept('Reply with an example'));page.get_by_role('button',name='Reply',exact=True).click();page.on('dialog',accept_dialog);page.get_by_role('button',name='Resolve',exact=True).click();explicit_save(page);expect(page.get_by_role('button',name='Reopen',exact=True)).to_be_visible();passed('comment replies and resolution persist')
            page.get_by_role('button',name='Delete block',exact=True).click();explicit_save(page);expect(page.locator('.thread')).to_have_count(0);assert not accepted()['state']['comments'];passed('block deletion removes dependent thread and comments')
            page.get_by_role('button',name='Move page and descendants to trash',exact=True).click();explicit_save(page);page.get_by_role('button',name='Trash (',exact=False).click();trash=page.locator('.trash-item').filter(has_text='Imported code lesson');trash.get_by_role('button').click();explicit_save(page);expect(page.get_by_label('Page title',exact=True)).to_have_value('Imported code lesson');passed('page trash and restore persist and restore active selection')
            with page.expect_download() as event:page.get_by_role('button',name='Export accepted JSON',exact=True).click()
            event.value.save_as(str(out/'accepted.json'));exported=json.loads((out/'accepted.json').read_text(encoding='utf-8'));assert 'state' in exported;assert token not in json.dumps(exported);passed('accepted JSON export excludes owner credential')
            page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'workspace-mobile.png'),full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1');passed('390-pixel layout stays within viewport width')
            assert not errors,errors;passed('browser workflow has no uncaught page errors')
        except BaseException:
            try:
                (out/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');page.screenshot(path=str(out/'failure.png'),full_page=True)
            except Exception:pass
            raise
        browser.close();browser=None
    result={'passed':True,'checks':checks,'count':len(checks),'browser':'Chromium via Python Playwright','server':'Next production server with real temporary SQLite','limits':['One network failure was deliberately simulated by aborting a browser route.','No original database or private user content was opened.'],'screenshots':['workspace-desktop.png','workspace-mobile.png']}
except BaseException as error:
    if browser:
        try:page.screenshot(path=str(out/'failure.png'),full_page=True)
        except Exception:pass
    result={'passed':False,'checks':checks,'count':len(checks),'error':str(error),'traceback':traceback.format_exc(),'pageErrors':errors};raise
finally:
    if browser:
        try:browser.close()
        except Exception:pass
    if server and server.poll() is None:server.terminate();server.wait(timeout=30)
    if 'log' in globals():log.close()
    if 'result' in globals():(out/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
