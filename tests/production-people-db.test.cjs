const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('production people preserve history and enforce active admin and asset-owner permissions', async () => {
 const db = new PGlite();
 const admin = '10000000-0000-0000-0000-000000000011';
 const owner = '10000000-0000-0000-0000-000000000012';
 const other = '10000000-0000-0000-0000-000000000013';
 const run = (sql, args = []) => db.query(sql, args);
 const one = async (sql, args = []) => Object.values((await run(sql, args)).rows[0])[0];
 const as = id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`);
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8').split('-- Shared materials extension')[0].replace('create extension if not exists pgcrypto;',''));
  for (const name of ['20260919_shared_assets.sql','20260919_r2_image_assets.sql','20260921_inspiration_details_activities.sql','20260921_archived_asset_store_read.sql'])
   await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec(`grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated;
   insert into auth.users values('${admin}','admin@test','{}'),('${owner}','owner@test','{}'),('${other}','other@test','{}');
   update profiles set role='admin' where id='${admin}';
   create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,identity_data jsonb);`);
  for (const name of ['20260923_v1_closeout.sql','20260923_profile_role_guard.sql','20260924_team_invitations.sql','20260925_member_lifecycle.sql','20260928_parent_products_store_logos.sql','20261012_production_people.sql'])
   await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));

  await as(admin);
  const person = await one("insert into production_people(name) values('设计师') returning id");
  const store = await one("insert into stores(name,slug,created_by) values('Fixture','fixture',auth.uid()) returning id");
  await as(owner);
  await assert.rejects(run("insert into production_people(name) values('Denied')"));
  assert.equal((await run("update production_people set name='Denied' where id=$1 returning id",[person])).rows.length,0);
  const storeAsset = await one("insert into store_assets(store_id,title,created_by) values($1,'Image',auth.uid()) returning id",[store]);
  const secondAsset = await one("insert into store_assets(store_id,title,created_by) values($1,'Second',auth.uid()) returning id",[store]);
  const sharedAsset = await one("insert into shared_assets(title,created_by) values('Shared',auth.uid()) returning id");
  await run('insert into store_asset_production_people values($1,$2)',[storeAsset,person]);
  await run('insert into shared_asset_production_people values($1,$2)',[sharedAsset,person]);
  await assert.rejects(run('insert into store_asset_production_people values($1,$2)',[storeAsset,person]));
  await as(other);
  assert.equal((await run('delete from store_asset_production_people where store_asset_id=$1 returning store_asset_id',[storeAsset])).rows.length,0);
  await assert.rejects(run('insert into shared_asset_production_people values($1,$2)',[sharedAsset,person]));
  await as(admin);
  await run('update production_people set disabled_at=now() where id=$1',[person]);
  assert.equal(await one('select count(*)::int from store_asset_production_people where production_person_id=$1',[person]),1);
  await assert.rejects(run('delete from production_people where id=$1',[person]));
  await as(owner);
  await assert.rejects(run('insert into store_asset_production_people values($1,$2)',[secondAsset,person]));
  await as(admin);
  await run('update profiles set is_disabled=true where id=$1',[owner]);
  await as(owner);
  assert.equal(await one('select count(*)::int from production_people'),0);
  assert.equal(await one('select count(*)::int from store_asset_production_people'),0);
 } finally { await db.close(); }
});
