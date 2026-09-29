// Opt-in only: never apply the new migration without explicit permission. No network/database URL is used.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const {test:nodeTest,before,after}=require('node:test');
const enabled=process.env.RUN_PARENT_DATABASE_TESTS==='1';
const test=(name,fn)=>nodeTest(name,{skip:enabled?false:'New migration execution not authorized; set RUN_PARENT_DATABASE_TESTS=1 only for disposable local PGlite'},fn);
let db,shop,other;const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',ADMIN='10000000-0000-0000-0000-000000000003';
const q=(sql,args=[])=>db.query(sql,args);const one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
async function as(id){await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`)}
before(async()=>{if(!enabled)return;db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(fs.readFileSync('supabase/schema.sql','utf8').split('-- Shared materials extension')[0].replace('create extension if not exists pgcrypto;',''));
 for(const name of ['20260919_shared_assets.sql','20260919_r2_image_assets.sql','20260921_inspiration_details_activities.sql','20260921_archived_asset_store_read.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into auth.users values('${A}','a@test','{}'),('${B}','b@test','{}'),('${ADMIN}','admin@test','{}');update profiles set role='admin' where id='${ADMIN}';`);
 await db.exec('create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,identity_data jsonb)');
 for(const name of ['20260923_v1_closeout.sql','20260923_profile_role_guard.sql','20260924_team_invitations.sql','20260925_member_lifecycle.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec(fs.readFileSync("supabase/migrations/20260928_parent_products_store_logos.sql","utf8"));
 await as(ADMIN);shop=await one("insert into stores(name,slug,created_by) values('AMOISE','amoise',auth.uid()) returning id");other=await one("insert into stores(name,slug,created_by) values('FGU','fgu',auth.uid()) returning id");
});
after(async()=>{await db?.close()});
const parent=async(store=shop,name='Parent '+crypto.randomUUID())=>one("select v4_save_parent(null,$1,$2,'{}')",[store,name]);
async function asset(owner=A,store=shop,p=null,category='other',date='2026-01-01'){
 await as(owner);const id=await one("insert into store_assets(store_id,title,created_by,parent_product_id,asset_category,created_at) values($1,'fixture',auth.uid(),$2,$3,$4) returning id",[store,p,category,date]);
 const f=await one("insert into asset_files(store_asset_id,original_name,storage_key,mime_type,size_bytes,kind,created_by) values($1,'fixture.png',$2,'image/webp',10,'image',auth.uid()) returning id",[id,'fixture/'+id]);return {id,f};
}
const batch=(ids,op,p=null,category=null,tags=[],store=shop)=>one('select v4_batch_store_assets($1,$2::uuid[],$3,$4,$5,$6::uuid[])',[store,ids,op,p,category,tags]);
const cover=p=>one('select cover_file_id from v4_parent_summaries($1) where id=$2',[shop,p]);

test('DB: parent ownership, same-store constraint, direct writes and deletion retain foreign-owned assets/files',async()=>{
 await as(A);const p=await parent();await q("select v4_save_parent($1,$2,'Renamed','{}')",[p,shop]);
 await as(B);await assert.rejects(q("select v4_save_parent($1,$2,'Denied','{}')",[p,shop]));await assert.rejects(q('select v4_delete_parent($1)',[p]));
 const a=await asset(B,shop,p);await assert.rejects(asset(B,other,p));
 await as(A);await q('select v4_delete_parent($1)',[p]);assert.equal(await one('select parent_product_id from store_assets where id=$1',[a.id]),null);assert.equal(await one('select count(*)::int from asset_files where id=$1',[a.f]),1);
 await as(ADMIN);const another=await parent();await as(A);await assert.rejects(q("update parent_products set created_by=auth.uid() where id=$1 returning id",[another]).then(r=>{if(!r.rows.length)throw Error('denied')}));
});
test('DB: product tags reuse, multi-tags, admin rename/delete and all existing pools remain separate',async()=>{
 await as(A);const t=await one("select to_jsonb(v4_create_product_tag('  Product fixture  '))"),same=await one("select to_jsonb(v4_create_product_tag('product fixture'))"),t2=await one("select to_jsonb(v4_create_product_tag('Second product'))");assert.equal(t.id,same.id);
 const p=await parent();await q("select v4_save_parent($1,$2,'Tagged',$3)",[p,shop,[t.id,t2.id]]);assert.equal(await one('select count(*)::int from parent_product_tags where parent_product_id=$1',[p]),2);
 await assert.rejects(q("select v4_manage_product_tag($1,'Denied',false)",[t.id]));
 for(const table of ['tags','store_tags','prompt_tags'])assert.equal(await one('select count(*)::int from '+table+' where id=$1',[t.id]),0);
 await as(ADMIN);await q("select v4_manage_product_tag($1,'Renamed product',false)",[t.id]);await q('select v4_manage_product_tag($1,null,true)',[t.id]);assert.equal(await one('select count(*)::int from parent_product_tags where parent_product_id=$1',[p]),1);
});
test('DB: automatic cover prefers main then created_at, metadata does not reorder, manual restores and invalidates',async()=>{
 await as(A);const p=await parent(),empty=await parent();assert.equal(await cover(p),null);
 const fallback=await asset(A,shop,p,'other','2026-03-01');assert.equal(await cover(p),fallback.f);
 const first=await asset(A,shop,p,'main','2026-01-01'),last=await asset(A,shop,p,'main','2026-02-01');assert.equal(await cover(p),last.f);
 await q("update store_assets set description='metadata' where id=$1",[first.id]);assert.equal(await cover(p),last.f);
 await q('select v4_set_parent_cover($1,$2)',[p,fallback.id]);assert.equal(await cover(p),fallback.f);await q('select v4_set_parent_cover($1,null)',[p]);assert.equal(await cover(p),last.f);
 await assert.rejects(q('select v4_set_parent_cover($1,$2)',[empty,last.id]));
 await q('select v4_set_parent_cover($1,$2)',[p,last.id]);await q('update store_assets set parent_product_id=null where id=$1',[last.id]);assert.equal(await one('select manual_cover_asset_id from parent_products where id=$1',[p]),null);assert.equal(await cover(p),first.f);
 await q('select v4_set_parent_cover($1,$2)',[p,first.id]);await q("select v1_delete_asset('store',$1,null)",[first.id]);assert.equal(await cover(p),fallback.f);
});
test('DB: store/shared conversion clears manual cover and preserves file, return defaults unclassified',async()=>{
 await as(A);const p=await parent(),a=await asset(A,shop,p);await q('select v4_set_parent_cover($1,$2)',[p,a.id]);
 await q("select v1_move_asset('store',$1,$2,'other','{}','{}','')",[a.id,[shop]]);assert.equal(await one('select manual_cover_asset_id from parent_products where id=$1',[p]),null);assert.equal(await one('select shared_asset_id from asset_files where id=$1',[a.f]),a.id);
 await assert.rejects(batch([a.id],'set_parent',p));await q("select v1_move_asset('shared',$1,$2,'main','{}','{}','')",[a.id,[shop]]);assert.equal(await one('select parent_product_id from store_assets where id=$1',[a.id]),null);assert.equal(await one('select store_asset_id from asset_files where id=$1',[a.f]),a.id);
});
test('DB: all batch operations, duplicate IDs and append/remove semantics, cleanup on delete',async()=>{
 await as(A);const p=await parent(),a=await asset(),b=await asset();
 assert.equal(await batch([a.id,a.id,b.id],'set_parent',p),2);assert.equal(await batch([a.id,b.id],'clear_parent'),2);await batch([a.id,b.id],'category',null,'scene');
 const t=(await one("select v1_create_tag('store','Batch tag')")).id,keep=(await one("select v1_create_tag('store','Keep tag')")).id;
 await batch([a.id,b.id],'add_tags',null,null,[keep]);await batch([a.id,b.id],'add_tags',null,null,[t,t]);await batch([a.id,b.id],'remove_tags',null,null,[t]);assert.equal(await one('select count(*)::int from store_asset_tags where store_asset_id=$1',[a.id]),1);
 await batch([a.id,b.id],'delete');assert.equal(await one('select count(*)::int from asset_files where id=any($1)',[[a.f,b.f]]),0);assert.equal(await one('select count(*)::int from r2_cleanup_queue where storage_key=any($1)',[['fixture/'+a.id,'fixture/'+b.id]]),2);
});
test('DB: unauthorized, cross-store, missing and oversized batches fail wholly',async()=>{
 const own=await asset(),foreign=await asset(B),elsewhere=await asset(A,other);await as(A);
 for(const ids of [[own.id,foreign.id],[own.id,elsewhere.id],[own.id,'00000000-0000-0000-0000-000000000099']]){await assert.rejects(batch(ids,'category',null,'main'));assert.equal(await one('select asset_category from store_assets where id=$1',[own.id]),'other');}
 await assert.rejects(batch(Array.from({length:101},()=>crypto.randomUUID()),'delete'));await assert.rejects(batch([],'delete'));await assert.rejects(batch([own.id],'category',null,null));
 await as(ADMIN);assert.equal(await batch([own.id,foreign.id],'category',null,'main'),2);
});
test('DB: logo commits its reference atomically, GC protects current file and cleans replaced/removed files',async()=>{
 await as(A);await assert.rejects(q('select v4_set_store_logo($1,null)',[shop]));await as(ADMIN);
 const file=()=>({key:'stores/'+shop+'/logo/'+crypto.randomUUID()+'.webp',originalName:'logo.png',mimeType:'image/webp',sizeBytes:10,width:80,height:80});
 const x=file(),f=await one('select v4_set_store_logo($1,$2)',[shop,x]);assert.equal(await one('select store_id from asset_files where id=$1',[f]),null);assert.equal(await one('select logo_file_id from stores where id=$1',[shop]),f);
 await assert.rejects(q('delete from asset_files where id=$1',[f]));const y=file(),g=await one('select v4_set_store_logo($1,$2)',[shop,y]);assert.equal(await one('select count(*)::int from asset_files where id=$1',[f]),0);assert.equal(await one('select count(*)::int from r2_cleanup_queue where storage_key=$1',[x.key]),1);
 await q('select v4_set_store_logo($1,null)',[shop]);assert.equal(await one('select count(*)::int from asset_files where id=$1',[g]),0);assert.equal(await one('select logo_file_id from stores where id=$1',[shop]),null);
});
test('DB: disabled member old JWT is denied by new tables and RPCs',async()=>{
 await as(ADMIN);await q('select v3_set_member_status($1,true)',[B]);await as(B);
 for(const table of ['parent_products','product_tags','parent_product_tags'])assert.equal(await one('select count(*)::int from '+table),0);
 await assert.rejects(parent());await assert.rejects(q("select v4_create_product_tag('disabled')"));await assert.rejects(batch(['00000000-0000-0000-0000-000000000001'],'delete'));
 await as(ADMIN);await q('select v3_set_member_status($1,false)',[B]);
});
