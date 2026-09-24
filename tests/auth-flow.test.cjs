const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test'),ts=require('typescript');
function load(file,overrides={},globals={}){
 const ctx={exports:{},URL,console,...globals,require(name){if(name in overrides)return overrides[name];if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name.startsWith('@/'))return load(name.slice(2)+'.ts',overrides,globals);if(name==='next/link')return 'a';return require(name)}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);return ctx.exports;
}
function nodes(tree,predicate){if(!tree||typeof tree!=='object')return[];return [...(predicate(tree)?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(c=>nodes(c,predicate))]}
function formHarness(file,name,auth,props={}){
 let index=0,tree;const state=[],location={origin:'https://team.example.test',href:''};
 const react={useState(v){const i=index++;state[i]??=v;return[state[i],value=>state[i]=value]}};
 const mod=load(file,{'react':react,'@/lib/supabase/client':{createClient:()=>({auth,rpc:auth.rpc||(async()=>({data:true,error:null}))})}},{location,window:{location},FormData:class{constructor(form){this.data=form.data}get(key){return this.data[key]}}});
 const render=()=>{index=0;tree=mod[name](props);return tree};render();
 return{render,location,text:()=>JSON.stringify(tree),async submit(data){const form={data,reset(){this.resetCalled=true}};await nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){},currentTarget:form});render();return form}};
}
test('auth validation and recovery redirect use the actual origin without raw provider errors',()=>{
 const f=load('lib/auth-flow.ts');assert.ok(f.emailError(''));assert.ok(f.emailError('bad'));assert.equal(f.emailError(' user@example.test '),'');assert.ok(f.passwordError('short','short'));assert.ok(f.passwordError('abcdefgh','abcdefgi'));
 assert.equal(f.recoveryUrl('https://team.example.test'),'https://team.example.test/auth/recovery');assert.equal(f.recoveryUrl('http://localhost:3000'),'http://localhost:3000/auth/recovery');
 assert.equal(f.authError({message:'internal secret'},'friendly'),'friendly');
 for(const p of ['/','/library','/shared','/stores','/workstations','/handbook','/handbook/prompts','/auth/anything'])assert.equal(f.isPublicAuthPath(p),false);
});
test('login preserves password sign-in, friendly errors and successful app redirect',async()=>{
 let error={code:'invalid_credentials',message:'raw'},calls=0;const h=formHarness('app/login/login-form.tsx','LoginForm',{signInWithPassword:async()=>{calls++;return{error}}});
 await h.submit({email:'bad',password:'password'});assert.equal(calls,0);
 await h.submit({email:'a@example.test',password:'password'});assert.ok(h.text().includes('邮箱或密码不正确'));assert.ok(!h.text().includes('raw'));
 error=null;await h.submit({email:'a@example.test',password:'password'});assert.equal(h.location.href,'/');assert.ok(h.text().includes('/forgot-password'));
});
test('forgot password requests real Supabase API with current-origin callback, pending and failure recovery',async()=>{
 let args,resolve;const h=formHarness('app/forgot-password/password-form.tsx','ForgotPasswordForm',{resetPasswordForEmail:async(...a)=>{args=a;return new Promise(r=>resolve=r)}});
 await h.submit({email:''});assert.equal(args,undefined);
 const first=h.submit({email:' a@example.test '});h.render();assert.ok(h.text().includes('发送中'));assert.equal(args[0],'a@example.test');assert.equal(args[1].redirectTo,'https://team.example.test/auth/recovery');resolve({error:{code:'over_email_send_rate_limit'}});await first;assert.ok(h.text().includes('请求过于频繁'));
 const second=h.submit({email:'a@example.test'});resolve({error:null});await second;assert.ok(h.text().includes('如果该邮箱对应已开通账号'));assert.ok(!h.text().includes('发送重置邮件'));
});
test('reset rejects mismatches, retains form on failure, updates through Supabase and logs out locally',async()=>{
 let calls=0,fail=true,scope;const h=formHarness('app/reset-password/password-form.tsx','ResetPasswordForm',{updateUser:async({password})=>{calls++;assert.equal(password,'new-password');return{error:fail?{code:'weak_password'}:null}},signOut:async options=>{scope=options.scope;return{error:null}}},{valid:true});
 await h.submit({password:'new-password',confirmation:'different'});assert.equal(calls,0);
 const failed=await h.submit({password:'new-password',confirmation:'new-password'});assert.ok(!failed.resetCalled);assert.ok(h.text().includes('密码不符合安全要求'));
 fail=false;const success=await h.submit({password:'new-password',confirmation:'new-password'});assert.equal(success.resetCalled,true);assert.equal(scope,'local');assert.ok(h.text().includes('密码已更新'));assert.ok(h.text().includes('/login'));
 const expired=formHarness('app/reset-password/password-form.tsx','ResetPasswordForm',{}, {valid:false});assert.equal(nodes(expired.render(),n=>n.type==='form').length,0);assert.ok(expired.text().includes('/forgot-password'));
});
test('callback exchanges a code once and redirects only to fixed local paths',async()=>{
 let calls=0;class Response{constructor(body,options){Object.assign(this,options)}}
 for(const [query,error,target] of [['?code=valid&next=https://evil.test',null,'/reset-password'],['?code=expired',{message:'private'},'/reset-password?error=invalid'],['?error=bad&code=valid',null,'/reset-password?error=invalid'],['',null,'/reset-password?error=invalid']]){
  const route=load('app/auth/recovery/route.ts',{'next/server':{NextResponse:Response},'@/lib/supabase/server':{createClient:async()=>({auth:{exchangeCodeForSession:async()=>{calls++;return{error}}}})}});
  const r=await route.GET({nextUrl:new URL('https://team.example.test/auth/recovery'+query)});assert.equal(r.headers.Location,target);assert.equal(r.headers['Cache-Control'],'no-store');
 }assert.equal(calls,2);
});
test('middleware permits exact recovery routes and keeps application pages authenticated',async()=>{
 let authenticated=false;const next={next:()=>({cookies:{set(){}}}),redirect:url=>({redirect:url.pathname})};
 const {middleware}=load('middleware.ts',{'next/server':{NextResponse:next},'@supabase/ssr':{createServerClient:()=>({rpc:async()=>({data:true,error:null}),auth:{getClaims:async()=>({data:authenticated?{claims:{sub:'u'}}:null})}})}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public'}}});
 const request=p=>{const url=new URL('https://team.example.test'+p);url.clone=()=>new URL(url);return{nextUrl:url,cookies:{getAll:()=>[]}}};
 for(const p of ['/login','/register','/auth/confirm','/forgot-password','/auth/recovery','/reset-password'])assert.ok(!(await middleware(request(p))).redirect);
 for(const p of ['/','/library','/shared','/stores','/workstations','/handbook','/handbook/prompts'])assert.equal((await middleware(request(p))).redirect,'/login');
 authenticated=true;assert.equal((await middleware(request('/login'))).redirect,'/');assert.ok(!(await middleware(request('/reset-password'))).redirect);assert.ok(!(await middleware(request('/'))).redirect);
});

test('registration sends only username and invitation metadata, never client role; email confirmation and failures are handled',async()=>{
 let args,fail=true;const auth={signUp:async value=>{args=value;return{data:{session:null},error:fail?{message:'database internal'}:null}}};
 const h=formHarness('app/register/register-form.tsx','RegisterForm',auth);assert.equal(nodes(h.render(),n=>n.type==='input').length,4);
 const fields={username:' Name ',email:'a@example.test',password:'valid-password',invite_code:'hm-'+ 'a'.repeat(24)};
 await h.submit({...fields,invite_code:''});assert.equal(args,undefined);
 await h.submit(fields);assert.ok(h.text().includes('注册失败'));assert.ok(!h.text().includes('database internal'));
 assert.equal(args.options.data.display_name,'Name');assert.equal(args.options.data.invite_code,'HM-'+ 'A'.repeat(24));assert.equal(args.options.data.role,undefined);assert.equal(args.options.emailRedirectTo,'https://team.example.test/auth/confirm');
 fail=false;await h.submit(fields);assert.ok(h.text().includes('确认邮件'));
 const immediate=formHarness('app/register/register-form.tsx','RegisterForm',{signUp:async()=>({data:{session:{access_token:'test'}},error:null})});await immediate.submit(fields);assert.equal(immediate.location.href,'/');
});
test('registration email callback is separate from recovery and has no open redirect',async()=>{
 class Response{constructor(body,options){Object.assign(this,options)}}
 for(const [query,error,target] of [['?code=valid&next=https://evil.test',null,'/'],['?code=bad',{message:'raw'},'/register?error=confirmation'],['',null,'/register?error=confirmation']]){
  const route=load('app/auth/confirm/route.ts',{'next/server':{NextResponse:Response},'@/lib/supabase/server':{createClient:async()=>({auth:{exchangeCodeForSession:async()=>({error})}})}});
  assert.equal((await route.GET({nextUrl:new URL('https://team.example.test/auth/confirm'+query)})).headers.Location,target);
 }
});

test('disabled or unverifiable account cannot enter after password login and local session is cleared',async()=>{
 for(const status of [{data:false,error:null},{data:null,error:{message:'missing migration'}}]){
  let signedOut=0;const h=formHarness('app/login/login-form.tsx','LoginForm',{signInWithPassword:async()=>({error:null}),rpc:async()=>status,signOut:async()=>{signedOut++;return{error:null}}});
  await h.submit({email:'a@example.test',password:'password'});assert.equal(h.location.href,'');assert.equal(signedOut,1);assert.ok(h.text().includes('账号不可用或已停用'));
 }
});

test('signOut waits for Supabase, disables the button, redirects only on success and surfaces safe failures',async()=>{
 let index=0,resolve,target='';const state=[];
 const {SignOutButton}=load('components/sign-out-button.tsx',{'react':{useState(v){const i=index++;if(state[i]===undefined)state[i]=v;return[state[i],v=>state[i]=v]}},'@/lib/supabase/client':{createClient:()=>({auth:{signOut:()=>new Promise(r=>resolve=r)}})}},{location:{replace:value=>target=value}});
 const render=()=>{index=0;return SignOutButton()};let tree=render();const first=nodes(tree,n=>n.type==='button')[0].props.onClick();tree=render();assert.equal(nodes(tree,n=>n.type==='button')[0].props.disabled,true);assert.equal(target,'');
 resolve({error:{message:'secret provider error'}});await first;tree=render();assert.ok(JSON.stringify(tree).includes('退出失败'));assert.ok(!JSON.stringify(tree).includes('secret provider'));assert.equal(target,'');
 const second=nodes(tree,n=>n.type==='button')[0].props.onClick();resolve({error:null});await second;assert.equal(target,'/login');
});

test('middleware denies stale disabled sessions, fails closed on status errors and protects pages after logout',async()=>{
 let claims=true,status={data:false,error:null};const next={next:()=>({cookies:{set(){}}}),redirect:url=>({redirect:url.pathname,search:url.search})};
 const {middleware}=load('middleware.ts',{'next/server':{NextResponse:next},'@supabase/ssr':{createServerClient:()=>({auth:{getClaims:async()=>({data:claims?{claims:{sub:'u'}}:null})},rpc:async()=>status})}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public'}}});
 const req=p=>{const url=new URL('https://example.test'+p);url.clone=()=>new URL(url);return{nextUrl:url,cookies:{getAll:()=>[]}}};
 const pages=['/','/members','/library','/shared','/stores','/stores/1','/workstations','/workstations/2','/handbook','/handbook/prompts','/api/media/1','/api/inspirations/1/image'];
 for(const p of pages){const response=await middleware(req(p));assert.equal(response.redirect,'/login');assert.equal(response.search,'?error=account-unavailable')}
 assert.ok(!(await middleware(req('/login'))).redirect);assert.ok(!(await middleware(req('/auth/recovery'))).redirect);
 status={data:null,error:{message:'offline'}};assert.equal((await middleware(req('/'))).redirect,'/login');
 claims=false;for(const p of pages)assert.equal((await middleware(req(p))).redirect,'/login');
});

test('server session rejects disabled/missing profiles before upload or member operations',async()=>{
 let profile={role:'member',is_disabled:true},rpcCalls=0,uploads=0;
 const query={select(){return query},eq(){return query},single:async()=>({data:profile,error:null})};
 const client={auth:{getUser:async()=>({data:{user:{id:'u'}}})},from:()=>query,rpc:async()=>{rpcCalls++;return{data:0,error:null}}};
 const mocks={'server-only':{},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/r2':{optimizeAndUploadImage:async()=>uploads++,removeObject:async()=>{}},'./user-error':{userError:()=>''},'next/cache':{revalidatePath(){}}};
 const {session}=load('lib/action-utils.ts',mocks);const actions=load('app/actions.ts',{...mocks,'@/lib/action-utils':{session}},{File,FormData});
 const members=load('app/member-actions.ts',{...mocks,'@/lib/action-utils':{session}});
 for(const value of [profile,null,{role:'admin',is_disabled:true},{role:'admin'}]){
  profile=value;await assert.rejects(session(),/账号不可用/);
  for(const method of ['createInspiration','createSharedAsset'])await assert.rejects(actions[method](new FormData()),/账号不可用/);
  await assert.rejects(actions.uploadStoreAsset('s',new FormData()),/账号不可用/);
  await assert.rejects(members.changeMemberStatus('x',true),/账号不可用/);
  await assert.rejects(members.handoverPrivatePrompts('x','y'),/账号不可用/);
 }
 assert.equal(uploads,0);assert.equal(rpcCalls,0);
 profile={role:'member',is_disabled:false};assert.equal((await session()).isAdmin,false);await assert.rejects(members.changeMemberStatus('x',true),/没有权限/);
 profile={role:'admin',is_disabled:false};await members.changeMemberStatus('x',true);await members.handoverPrivatePrompts('x','y');assert.equal(rpcCalls,2);
});

test('media handlers reject inactive accounts before reading R2 and serve active images without persistent caching',async()=>{
 class Response{constructor(body,options){this.body=body;Object.assign(this,options)}}
 for(const file of ['app/api/media/[fileId]/route.ts','app/api/inspirations/[id]/image/route.ts']){
  let active=false,read=0,lookups=0;const query={select(){return query},eq(){return query},maybeSingle:async()=>({data:{storage_key:'key',image_key:'key'}})};
  const route=load(file,{'next/server':{NextResponse:Response},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async()=>({data:active,error:null}),from(){lookups++;return query}})},'@/lib/r2':{readObject:async()=>{read++;return{bytes:new Uint8Array([1]),contentType:'image/webp'}}}});
  const context={params:Promise.resolve({id:'i',fileId:'f'})};assert.equal((await route.GET({},context)).status,403);assert.equal(read,0);assert.equal(lookups,0);
  active=true;const result=await route.GET({},context);assert.equal(read,1);assert.equal(result.headers['Cache-Control'],'private, no-store');
 }
});
