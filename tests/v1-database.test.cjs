const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict'),{test,before,after}=require('node:test');
let db;const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',ADMIN='10000000-0000-0000-0000-000000000003';let shop,other;
const q=(sql,args=[])=>db.query(sql,args);const one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
async function as(id){await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`)}
before(async()=>{db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(fs.readFileSync('supabase/schema.sql','utf8').split('-- Shared materials extension')[0].replace('create extension if not exists pgcrypto;',''));
 for(const name of ['20260919_shared_assets.sql','20260919_r2_image_assets.sql','20260921_inspiration_details_activities.sql','20260921_archived_asset_store_read.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into auth.users values('${A}','a@test','{}'),('${B}','b@test','{}'),('${ADMIN}','admin@test','{}');update profiles set role='admin' where id='${ADMIN}';`);
 await db.exec('create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,identity_data jsonb)');
 for(const name of ['20260923_v1_closeout.sql','20260923_profile_role_guard.sql','20260924_team_invitations.sql','20260925_member_lifecycle.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 await as(ADMIN);shop=await one("insert into stores(name,slug,created_by) values('AMOISE','amoise',auth.uid()) returning id");other=await one("insert into stores(name,slug,created_by) values('FGU','fgu',auth.uid()) returning id");
});
after(async()=>{await db?.close()});
async function asset(kind='store'){await as(A);const id=kind==='store'?await one('insert into store_assets(store_id,title,created_by) values($1,\'fixture\',auth.uid()) returning id',[shop]):await one("insert into shared_assets(title,created_by) values('fixture',auth.uid()) returning id");const f=await one(`insert into asset_files(${kind==='store'?'store_asset_id':'shared_asset_id'},original_name,storage_key,mime_type,size_bytes,kind,created_by) values($1,'test.png',$2,'image/webp',10,'image',auth.uid()) returning id`,[id,'fixture/'+id]);if(kind==='shared')await q('update shared_assets set preview_file_id=$1 where id=$2',[f,id]);return{id,f}}
let prompt,pt;
test('new Auth users get member profiles regardless of metadata; members cannot promote themselves',async()=>{
 const id='10000000-0000-0000-0000-000000000099';await as(ADMIN);const invite=await one('select v2_create_invitation()');await db.exec('reset role');
 await q("insert into auth.users values($1,'new-member@example.test',$2::jsonb)",[id,JSON.stringify({display_name:'New member',role:'admin',invite_code:invite.code})]);
 await as(id);assert.equal(await one('select role from profiles where id=auth.uid()'),'member');
 await q("update profiles set display_name='Updated member' where id=auth.uid()");
 await assert.rejects(q("update profiles set role='admin' where id=auth.uid()"),/Only an administrator/);
 assert.equal(await one('select role from profiles where id=auth.uid()'),'member');
 await as(ADMIN);await q("update profiles set role='admin' where id=$1",[id]);assert.equal(await one('select role from profiles where id=$1',[id]),'admin');
 await q("update profiles set role='member' where id=$1",[id]);
});
test('prompt team, private, favorite and search RLS include no admin private exception',async()=>{
 await as(A);pt=(await one("select v1_create_tag('prompt','MJ')")).id;prompt=await one("select v1_save_prompt(null,'private-canary mirror','team',$1::uuid[])",['{'+pt+'}']);
 await as(B);assert.equal(await one('select count(*)::int from prompts where id=$1',[prompt]),1);await q('insert into prompt_favorites values($1,auth.uid())',[prompt]);await assert.rejects(q('update prompts set content=\'bad\' where id=$1 returning id',[prompt]).then(r=>{if(!r.rows.length)throw Error('denied')}),/denied/);
 await as(ADMIN);assert.equal(await one('select count(*)::int from prompts where id=$1',[prompt]),1);await q('update prompts set content=\'private-canary mirror edited\' where id=$1',[prompt]);
 await as(A);await q("select v1_save_prompt($1,'private-canary mirror','private',$2::uuid[])",[prompt,'{'+pt+'}']);
 for(const user of [B,ADMIN]){await as(user);assert.equal(await one('select count(*)::int from prompts where id=$1',[prompt]),0);assert.equal(await one('select count(*)::int from prompt_tag_relations where prompt_id=$1',[prompt]),0);assert.equal(await one('select count(*)::int from prompt_favorites where prompt_id=$1',[prompt]),0);assert.deepEqual(await one("select v1_search_prompt_ids('private-canary')"),[]);assert.deepEqual(await one("select v1_search_prompt_ids('MJ')"),[]);await assert.rejects(q("select v1_save_prompt($1,'steal','team','{}')",[prompt]));await assert.rejects(q('insert into prompt_favorites values($1,auth.uid()) on conflict do nothing',[prompt]));}
 await as(A);assert.equal(await one('select count(*)::int from prompts where id=$1',[prompt]),1);await q('delete from prompts where id=$1',[prompt]);await db.exec('reset role');assert.equal(await one('select count(*)::int from prompt_favorites where prompt_id=$1',[prompt]),0);
});
test('tag pools isolate IDs, duplicate names return existing tags, member cannot rename/delete and admin batches rollback',async()=>{
 await as(A);const i=(await one("select v1_create_tag('inspiration','  Fixture  ')")).id;const s=(await one("select v1_create_tag('store','Fixture')")).id;const p=(await one("select v1_create_tag('prompt','Fixture')")).id;assert.equal(new Set([i,s,p]).size,3);assert.equal((await one("select v1_create_tag('store','fixture')")).id,s);assert.equal((await q("update store_tags set name='bad' where id=$1 returning id",[s])).rows.length,0);assert.equal((await q('delete from store_tags where id=$1 returning id',[s])).rows.length,0);await assert.rejects(q("select v1_manage_tags('store','[]','[]')"));
 const a=await asset();await q('insert into store_asset_tags values($1,$2)',[a.id,s]);await assert.rejects(q('insert into store_asset_tags values($1,$2)',[a.id,i]));await as(ADMIN);assert.equal(Number(await one("select v1_tag_usage('store',$1)",[s])),1);await assert.rejects(q("select v1_manage_tags('store','[]',$1::jsonb)",[JSON.stringify([{id:s,count:0}])]));await q("select v1_manage_tags('store','[]',$1::jsonb)",[JSON.stringify([{id:s,count:1}])]);assert.equal(await one('select count(*)::int from store_assets where id=$1',[a.id]),1);assert.equal(await one('select count(*)::int from asset_files where id=$1',[a.f]),1);
});
test('bidirectional move keeps file ID/workstations, removes old tags and atomically rolls back invalid target',async()=>{
 const a=await asset();const tag=(await one("select v1_create_tag('store','move-tag')")).id;await q('insert into store_asset_tags values($1,$2)',[a.id,tag]);await q('insert into store_asset_workstations values($1,2)',[a.id]);const shared=await one("select v1_move_asset('store',$1,$2::uuid[],'other','{}','{2}','note')",[a.id,'{'+shop+','+other+'}']);assert.equal(await one('select count(*)::int from store_assets where id=$1',[a.id]),0);assert.equal(await one('select shared_asset_id from asset_files where id=$1',[a.f]),shared);assert.equal(await one('select count(*)::int from store_asset_tags where store_asset_id=$1',[a.id]),0);assert.equal(await one('select count(*)::int from shared_asset_stores where shared_asset_id=$1',[shared]),2);
 await assert.rejects(q("select v1_move_asset('shared',$1,$2::uuid[],'main','{ffffffff-ffff-ffff-ffff-ffffffffffff}','{2}','')",[shared,'{'+shop+'}']));assert.equal(await one('select shared_asset_id from asset_files where id=$1',[a.f]),shared);
 const dest=await one("select v1_move_asset('shared',$1,$2::uuid[],'scene',$3::uuid[],'{2}','')",[shared,'{'+shop+'}','{'+tag+'}']);assert.equal(await one('select store_asset_id from asset_files where id=$1',[a.f]),dest);assert.equal(await one('select count(*)::int from shared_assets where id=$1',[shared]),0);assert.equal(await one('select count(*)::int from shared_asset_stores where shared_asset_id=$1',[shared]),0);assert.equal(await one('select count(*)::int from store_asset_workstations where store_asset_id=$1',[dest]),1);assert.equal(await one('select count(*)::int from r2_cleanup_queue where storage_key=$1',['fixture/'+a.id]),0);
});
test('shared removal only touches the selected store; permanent delete queues unreferenced file',async()=>{
 const a=await asset('shared');await q('insert into shared_asset_stores values($1,$2),($1,$3)',[a.id,shop,other]);await q("select v1_delete_asset('shared',$1,$2)",[a.id,shop]);assert.equal(await one('select count(*)::int from shared_asset_stores where shared_asset_id=$1',[a.id]),1);assert.equal(await one('select count(*)::int from asset_files where id=$1',[a.f]),1);await q("select v1_delete_asset('shared',$1)",[a.id]);assert.equal(await one('select count(*)::int from shared_asset_stores where shared_asset_id=$1',[a.id]),0);assert.equal(await one('select count(*)::int from asset_files where id=$1',[a.f]),0);assert.equal(await one('select count(*)::int from r2_cleanup_queue where storage_key=$1',['fixture/'+a.id]),1);
});
test('another member can detach a shared store relation but cannot move, edit or permanently delete the asset',async()=>{
 const a=await asset('shared');await q('insert into shared_asset_stores values($1,$2),($1,$3)',[a.id,shop,other]);
 await as(B);await q("select v1_delete_asset('shared',$1,$2)",[a.id,shop]);
 assert.deepEqual((await q('select store_id from shared_asset_stores where shared_asset_id=$1',[a.id])).rows.map(r=>r.store_id),[other]);
 assert.equal(await one('select created_by from shared_assets where id=$1',[a.id]),A);
 assert.equal(await one('select shared_asset_id from asset_files where id=$1',[a.f]),a.id);
 assert.equal(await one('select count(*)::int from r2_cleanup_queue where storage_key=$1',['fixture/'+a.id]),0);
 await assert.rejects(q("select v1_delete_asset('shared',$1)",[a.id]));
 await assert.rejects(q("select v1_move_asset('shared',$1,$2::uuid[],'main','{}','{}','')",[a.id,'{'+shop+'}']));
 assert.equal((await q('delete from shared_assets where id=$1 returning id',[a.id])).rows.length,0);
 assert.equal((await q("update shared_assets set description='bad' where id=$1 returning id",[a.id])).rows.length,0);
 await assert.rejects(q('insert into shared_asset_stores values($1,$2)',[a.id,shop]));
 await assert.rejects(q("select v1_delete_asset('shared',$1,$2)",[a.id,shop]));
 // Direct requests receive the same narrowly scoped RLS permission as the RPC.
 assert.equal((await q('delete from shared_asset_stores where shared_asset_id=$1 and store_id=$2 returning store_id',[a.id,other])).rows.length,1);
 await as('');await assert.rejects(q("select v1_delete_asset('shared',$1,$2)",[a.id,other]));
 await as(ADMIN);await q("select v1_delete_asset('shared',$1)",[a.id]);
 assert.equal(await one('select count(*)::int from shared_assets where id=$1',[a.id]),0);
});
test('file referenced by another business survives owner deletion and is collected after final reference',async()=>{
 const a=await asset('shared');await as(ADMIN);await q('update stores set cover_file_id=$1 where id=$2',[a.f,other]);await as(A);await q("select v1_delete_asset('shared',$1)",[a.id]);assert.equal(await one('select count(*)::int from asset_files where id=$1',[a.f]),1);assert.equal(await one('select count(*)::int from r2_cleanup_queue where storage_key=$1',['fixture/'+a.id]),0);await as(ADMIN);await q('update stores set cover_file_id=null where id=$1',[other]);assert.equal(await one('select count(*)::int from asset_files where id=$1',[a.f]),0);
});
test('members cannot move/delete other owners assets or fabricate R2 cleanup jobs',async()=>{
 const a=await asset();await as(B);await assert.rejects(q("select v1_delete_asset('store',$1)",[a.id]));await assert.rejects(q("select v1_move_asset('store',$1,'{}','other','{}','{}','')",[a.id]));await assert.rejects(q("insert into r2_cleanup_queue(storage_key,requested_by) values('victim',auth.uid())"));await assert.rejects(q('select v1_gc_file($1)',[a.f]));assert.equal(await one('select count(*)::int from store_assets where id=$1',[a.id]),1);
});
test('handbook admin CRUD/order, immutable general, member read-only and full-context search',async()=>{
 await as(ADMIN);const general=await one('select id from handbook_products where is_general');await assert.rejects(q("select v1_handbook_product('rename',$1,'bad')",[general]));await assert.rejects(q("select v1_handbook_product('delete',$1)",[general]));const product=await one("select v1_handbook_product('create',null,'Mirror')");const n1=await one("select v1_save_note(null,$1,'first note','{}','[]')",[product]);const n2=await one("select v1_save_note(null,$1,'canary note','{}','[]')",[product]);await q("select v1_reorder('note',$1,-1)",[n2]);assert.equal(await one('select id from handbook_notes where product_id=$1 order by sort_order limit 1',[product]),n2);assert.deepEqual(await one("select v1_search_handbook_ids('canary')"),[product]);
 await as(B);assert.equal(await one('select count(*)::int from handbook_notes where product_id=$1',[product]),2);await assert.rejects(q("select v1_handbook_product('create',null,'bad')"));await assert.rejects(q("select v1_save_note($1,$2,'bad','{}','[]')",[n1,product]));await assert.rejects(q("select v1_reorder('note',$1,1)",[n1]));assert.equal((await q('delete from handbook_notes where id=$1 returning id',[n1])).rows.length,0);
 await as(ADMIN);await q("select v1_handbook_product('delete',$1)",[product]);assert.equal(await one('select count(*)::int from handbook_notes where product_id=$1',[product]),0);
});
test('note images retain shared file references, removing final note image queues cleanup',async()=>{
 await as(ADMIN);const p=await one("select v1_handbook_product('create',null,'Images')");const files=JSON.stringify([{key:'notes/test',originalName:'ref.png',mimeType:'image/webp',sizeBytes:2,width:1,height:1}]);const n1=await one("select v1_save_note(null,$1,'one','{}',$2::jsonb)",[p,files]);const f=await one('select asset_file_id from handbook_note_images where note_id=$1',[n1]);const n2=await one("select v1_save_note(null,$1,'two','{}','[]')",[p]);await q('insert into handbook_note_images values($1,$2,0)',[n2,f]);await q('delete from handbook_notes where id=$1',[n1]);assert.equal(await one('select count(*)::int from asset_files where id=$1',[f]),1);await q('delete from handbook_notes where id=$1',[n2]);assert.equal(await one('select count(*)::int from asset_files where id=$1',[f]),0);assert.equal(await one("select count(*)::int from r2_cleanup_queue where storage_key='notes/test'"),1);
});

test('invitation is hashed, lasts exactly 24h, cannot be read/generated/modified by a member',async()=>{
 await as(ADMIN);const invite=await one('select v2_create_invitation()');assert.match(invite.code,/^HM-[0-9A-F]{24}$/);assert.equal(Date.parse(invite.expiresAt)-Date.parse(invite.createdAt),86400000);
 assert.equal(await one('select count(id)::int from team_invitations where id=$1',[invite.id]),1);
 await assert.rejects(q('select code_hash from team_invitations'));
 await as(B);assert.equal(await one('select count(id)::int from team_invitations'),0);await assert.rejects(q('select v2_create_invitation()'));await assert.rejects(q('select * from v2_list_members()'));await assert.rejects(q('select * from team_admin_guard'));await assert.rejects(q('update team_invitations set expires_at=now()'));
 await db.exec('reset role;set role anon');await assert.rejects(q('select v2_create_invitation()'));assert.equal(await one('select v2_registration_ready()'),true);
 await db.exec('reset role');const hash=await one("select encode(code_hash,'hex') from team_invitations where id=$1",[invite.id]);assert.equal(hash,require('node:crypto').createHash('sha256').update(invite.code).digest('hex'));
});
test('Auth insert itself rejects missing, wrong and expired codes; reusable invitation always creates members',async()=>{
 await as(ADMIN);const invite=await one('select v2_create_invitation()'),expired=await one('select v2_create_invitation()');await db.exec('reset role');
 await q("update team_invitations set created_at='2020-01-01 00:00:00+00',expires_at='2020-01-02 00:00:00+00' where id=$1",[expired.id]);
 await db.exec('create role supabase_auth_admin;grant usage on schema auth to supabase_auth_admin;grant insert,select on auth.users to supabase_auth_admin;set role supabase_auth_admin');
 const before=await one('select count(*)::int from auth.users');
 const create=async(metadata)=>{const id=require('node:crypto').randomUUID();await q('insert into auth.users values($1,$2,$3::jsonb)',[id,id+'@example.test',JSON.stringify(metadata)]);return id};
 for(const code of [undefined,'HM-'+ '0'.repeat(24),expired.code])await assert.rejects(create({display_name:'New',invite_code:code}),/INVITATION_INVALID/);
 assert.equal(await one('select count(*)::int from auth.users'),before);
 const first=await create({display_name:'  First  ',role:'admin',invite_code:invite.code}),second=await create({display_name:'Second',invite_code:invite.code});
 await db.exec('reset role');for(const id of [first,second]){assert.equal(await one('select role from profiles where id=$1',[id]),'member');const meta=await one('select raw_user_meta_data from auth.users where id=$1',[id]);assert.equal(meta.invite_code,undefined);assert.equal(meta.role,undefined)}assert.equal(await one('select display_name from profiles where id=$1',[first]),'First');
 // GoTrue copies the original request metadata into the email identity as well.
 await q('insert into auth.identities(user_id,identity_data) values($1,$2::jsonb)',[first,JSON.stringify({email:'first@example.test',display_name:'First',invite_code:invite.code})]);
 const identity=await one('select identity_data from auth.identities where user_id=$1',[first]);assert.equal(identity.invite_code,undefined);assert.equal(identity.display_name,'First');
 await q('update auth.users set raw_user_meta_data=raw_user_meta_data||$2::jsonb where id=$1',[first,JSON.stringify({invite_code:invite.code})]);assert.equal((await one('select raw_user_meta_data from auth.users where id=$1',[first])).invite_code,undefined);
 await as(ADMIN);assert.equal(await one('select count(id)::int from team_invitations where id=$1',[expired.id]),0);
 const members=(await q('select * from v2_list_members()')).rows;assert.ok(members.some(m=>m.id===first&&m.email===first+'@example.test'));
});
test('role RPC and direct writes protect members and the last admin, including bulk changes and deletes',async()=>{
 await as(B);await assert.rejects(q("select v2_set_member_role($1,'admin')",[B]),/permission denied/);await assert.rejects(q("update profiles set role='admin' where id=$1",[B]),/Only an administrator/);
 assert.equal((await q("update profiles set role='member' where id=$1 returning id",[ADMIN])).rows.length,0);
 await as(ADMIN);await assert.rejects(q("select v2_set_member_role($1,'member')",[ADMIN]),/LAST_ADMIN_REQUIRED/);
 await q("select v2_set_member_role($1,'admin')",[B]);assert.equal(await one("select count(*)::int from profiles where role='admin'"),2);
 await db.exec('reset role');await assert.rejects(q("update profiles set role='member' where role='admin'"),/LAST_ADMIN_REQUIRED/);assert.equal(await one("select count(*)::int from profiles where role='admin'"),2);
 await as(B);await q("select v2_set_member_role($1,'member')",[ADMIN]);assert.equal(await one('select role from profiles where id=$1',[ADMIN]),'member');
 await assert.rejects(q('delete from profiles where id=$1',[B]),/LAST_ADMIN_REQUIRED/);
 await db.exec('reset role');await assert.rejects(q('delete from auth.users where id=$1',[B]),/LAST_ADMIN_REQUIRED/);
 await db.exec('reset role');await assert.rejects(q('truncate profiles cascade'),/LAST_ADMIN_REQUIRED/);assert.equal(await one('select admin_count from team_admin_guard'),1);
 await as(B);await q("select v2_set_member_role($1,'admin')",[ADMIN]);await as(ADMIN);await q("select v2_set_member_role($1,'member')",[B]);
 await db.exec('reset role');assert.equal(await one('select admin_count from team_admin_guard'),await one("select count(*)::int from profiles where role='admin'"));
});

test('disabled member stale JWT loses all business table reads/writes and RPC access without changing team history',async()=>{
 await as(A);const privateId=await one("select v1_save_prompt(null,'lifecycle-private','private','{}')");const teamId=await one("select v1_save_prompt(null,'lifecycle-team','team','{}')");
 const shared=await asset('shared'),store=await asset('store');await as(A);
 const inspiration=await one("insert into inspirations(title,image_url,image_key,created_by) values('lifecycle','https://example.test/image','lifecycle/image',auth.uid()) returning id");
 await q('insert into shared_asset_workstations values($1,2)',[shared.id]);await q('insert into store_asset_workstations values($1,2)',[store.id]);
 await db.exec('reset role');const tables=(await q("select tablename from pg_tables where schemaname='public' and tablename not in ('profiles','team_admin_guard') order by tablename")).rows.map(r=>r.tablename);
 const snapshots={};for(const table of tables)snapshots[table]=await one('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\') from '+table+' t');
 await as(B);await assert.rejects(q('select v3_set_member_status($1,true)',[A]),/permission denied/);await assert.rejects(q('update profiles set is_disabled=true where id=auth.uid()'),/permission denied/);
 await as(ADMIN);await q('select v3_set_member_status($1,true)',[A]);
 const members=(await q('select * from v3_list_members()')).rows;assert.equal(members.find(m=>m.id===A).pending_private_count,1);assert.equal(members.find(m=>m.id===A).is_disabled,true);assert.ok(!('content' in members[0]));
 // Same subject as the still-valid old JWT, no client logout required.
 await as(A);assert.equal(await one('select is_active_member()'),false);
 for(const table of [...tables,'profiles'])assert.equal(await one('select count(*)::int from '+table),0,table+' must deny stale sessions');
 await assert.rejects(q("select v1_save_prompt(null,'blocked','private','{}')"));await assert.rejects(q("select v1_create_tag('prompt','blocked')"));
 await assert.rejects(q("insert into inspirations(title,image_url,image_key,created_by) values('blocked','x','blocked',auth.uid())"));
 assert.equal((await q('update prompts set content=\'blocked\' where id=$1 returning id',[privateId])).rows.length,0);
 assert.equal((await q('delete from shared_assets where id=$1 returning id',[shared.id])).rows.length,0);
 assert.equal((await q('update profiles set is_disabled=false where id=auth.uid() returning id')).rows.length,0);
 for(const sql of ['select v2_create_invitation()','select * from v2_list_members()','select * from v3_list_members()',"select v1_tag_usage('prompt',null)"])await assert.rejects(q(sql));
 await assert.rejects(q("select v1_move_asset('store',$1,'{}','other','{}','{}','')",[store.id]));await assert.rejects(q("select v1_delete_asset('shared',$1)",[shared.id]));
 await as(B);assert.equal(await one('select count(*)::int from prompts where id=$1',[privateId]),0);assert.equal(await one('select created_by from prompts where id=$1',[teamId]),A);
 await as(ADMIN);assert.equal(await one('select count(*)::int from prompts where id=$1',[privateId]),0);
 await db.exec('reset role');for(const table of tables)assert.deepEqual(await one('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\') from '+table+' t'),snapshots[table],table+' is unchanged');
 assert.equal(await one('select created_by from inspirations where id=$1',[inspiration]),A);
 await as(ADMIN);await q('select v3_set_member_status($1,false)',[A]);await as(A);assert.equal(await one('select is_active_member()'),true);assert.equal(await one('select count(*)::int from prompts where id=$1',[privateId]),1);
});

test('active admin counter excludes disabled admins and prevents last active admin disable/demotion',async()=>{
 await as(ADMIN);await q("select v2_set_member_role($1,'admin')",[B]);await q('select v3_set_member_status($1,true)',[B]);
 await as(B);assert.equal(await one('select is_admin()'),false);await assert.rejects(q('select v3_set_member_status($1,false)',[B]));await assert.rejects(q('select v2_create_invitation()'));await assert.rejects(q("select v2_set_member_role($1,'admin')",[A]));
 await as(ADMIN);await assert.rejects(q('select v3_set_member_status($1,true)',[ADMIN]));await assert.rejects(q("select v2_set_member_role($1,'member')",[ADMIN]),/LAST_ADMIN_REQUIRED/);
 await db.exec('reset role');assert.equal(await one('select admin_count from team_admin_guard'),1);assert.equal(await one('select is_disabled from profiles where id=$1',[ADMIN]),false);
 await as(ADMIN);await q('select v3_set_member_status($1,false)',[B]);await as(B);await q('select v3_set_member_status($1,true)',[ADMIN]);
 await db.exec('reset role');assert.equal(await one('select admin_count from team_admin_guard'),1);
 await as(B);await q('select v3_set_member_status($1,false)',[ADMIN]);await as(ADMIN);await q("select v2_set_member_role($1,'member')",[B]);
});

test('private handover is admin-only, source must be disabled and recipient must be active',async()=>{
 await as(A);await assert.rejects(q('select v3_handover_private_prompts($1,$2)',[A,B]),/permission denied/);
 await as(ADMIN);await assert.rejects(q('select v3_handover_private_prompts($1,$2)',[A,B]),/SOURCE_NOT_DISABLED/);
 await q('select v3_set_member_status($1,true)',[A]);await q('select v3_set_member_status($1,true)',[B]);
 await assert.rejects(q('select v3_handover_private_prompts($1,$2)',[A,B]),/RECIPIENT_NOT_ACTIVE/);
 await assert.rejects(q('select v3_handover_private_prompts($1,$2)',[A,'10000000-0000-0000-0000-000000000088']),/RECIPIENT_NOT_ACTIVE/);
 await as(B);await assert.rejects(q('select v3_handover_private_prompts($1,$2)',[A,ADMIN]),/permission denied/);
 await as(ADMIN);await q('select v3_set_member_status($1,false)',[A]);await q('select v3_set_member_status($1,false)',[B]);
});

test('handover changes only private ownership, preserves tags/content/favorites and rolls back every row on failure',async()=>{
 await as(A);const tag=(await one("select v1_create_tag('prompt','handover-tag')")).id;
 const first=await one("select v1_save_prompt(null,'handover one','private',$1::uuid[])",['{'+tag+'}']);
 const second=await one("select v1_save_prompt(null,'handover two','private',$1::uuid[])",['{'+tag+'}']);
 const team=await one("select v1_save_prompt(null,'team stays','team','{}')");await q('insert into prompt_favorites values($1,auth.uid())',[first]);
 // Direct owner/admin writes may not bypass the dedicated handover path.
 await assert.rejects(q('update prompts set created_by=$1 where id=$2',[B,first]),/permission denied/);
 await as(ADMIN);await assert.rejects(q('update prompts set created_by=$1 where id=$2',[B,team]),/permission denied/);
 await q('select v3_set_member_status($1,true)',[A]);
 await db.exec('reset role');const before=(await q("select id,created_by,content,visibility,updated_at from prompts where created_by=$1 and visibility='private' order by id",[A])).rows;
 const favorites=(await q('select * from prompt_favorites order by prompt_id,user_id')).rows;
 // Fail after at least one UPDATE has occurred: statement trigger verifies rollback.
 await db.exec("create function public.test_handover_failure() returns trigger language plpgsql as $$begin raise exception 'simulated handover failure'; end$$;create trigger test_handover_failure after update on public.prompts for each statement execute function public.test_handover_failure()");
 await as(ADMIN);await assert.rejects(q('select v3_handover_private_prompts($1,$2)',[A,B]),/simulated handover failure/);
 await db.exec('reset role');assert.deepEqual((await q("select id,created_by,content,visibility,updated_at from prompts where created_by=$1 and visibility='private' order by id",[A])).rows,before);
 await db.exec('drop trigger test_handover_failure on public.prompts;drop function public.test_handover_failure()');
 await as(ADMIN);assert.equal(await one('select v3_handover_private_prompts($1,$2)',[A,B]),before.length);assert.equal(await one('select v3_handover_private_prompts($1,$2)',[A,B]),0);
 assert.equal((await q('select * from v3_list_members()')).rows.find(m=>m.id===A).pending_private_count,0);
 assert.equal(await one('select count(*)::int from prompts where id=$1',[first]),0);
 await as(B);assert.equal(await one('select created_by from prompts where id=$1',[first]),B);assert.equal(await one('select content from prompts where id=$1',[second]),'handover two');assert.equal(await one('select tag_id from prompt_tag_relations where prompt_id=$1',[first]),tag);
 assert.equal(await one('select created_by from prompts where id=$1',[team]),A);
 await db.exec('reset role');assert.deepEqual((await q('select * from prompt_favorites order by prompt_id,user_id')).rows,favorites);
 await as(ADMIN);await q('select v3_set_member_status($1,false)',[A]);await as(A);assert.equal(await one('select count(*)::int from prompts where id=$1',[first]),0);assert.equal(await one('select count(*)::int from prompt_favorites where prompt_id=$1',[first]),0);
});

test('every public business table has the restrictive active account policy enabled',async()=>{
 await db.exec('reset role');const tables=(await q("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname<>'team_admin_guard'")).rows;
 for(const table of tables){assert.equal(table.relrowsecurity,true,table.relname);assert.equal(await one("select count(*)::int from pg_policy where polrelid=$1::regclass and polname='active members only' and not polpermissive and polcmd='*'",[table.relname]),1,table.relname);}
});
