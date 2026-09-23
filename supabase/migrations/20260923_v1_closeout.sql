-- V1 closeout: one atomic, reviewable upgrade. Run once after the existing migrations.
-- This migration is not applied automatically. Review it before running in Supabase.
begin;
-- Existing asset IDs/files are preserved. scene remains the compatible DB value for 副图.
create table public.store_tags (id uuid primary key default gen_random_uuid(), name text not null, group_name public.tag_group not null default 'other', color text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
insert into public.store_tags(id,name,group_name,color) select distinct t.id,t.name,t.group_name,t.color from public.tags t join public.store_asset_tags r on r.tag_id=t.id;
alter table public.store_asset_tags drop constraint store_asset_tags_tag_id_fkey;
alter table public.store_asset_tags add constraint store_asset_tags_tag_id_fkey foreign key(tag_id) references public.store_tags(id) on delete cascade;
create table public.prompt_tags (id uuid primary key default gen_random_uuid(), name text not null, group_name public.tag_group not null default 'other', color text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.prompts (id uuid primary key default gen_random_uuid(), content text not null check(length(btrim(content))>0), visibility text not null default 'team' check(visibility in ('team','private')), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.prompt_tag_relations (prompt_id uuid references public.prompts(id) on delete cascade, tag_id uuid references public.prompt_tags(id) on delete cascade, primary key(prompt_id,tag_id));
create table public.prompt_favorites (prompt_id uuid references public.prompts(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, primary key(prompt_id,user_id));
create table public.handbook_products (id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name))>0), is_general boolean not null default false, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index handbook_product_name on public.handbook_products(lower(btrim(name)));
create unique index handbook_one_general on public.handbook_products(is_general) where is_general;
insert into public.handbook_products(name,is_general,sort_order) values ('通用规范',true,-1);
create table public.handbook_notes (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.handbook_products(id) on delete cascade, content text not null check(length(btrim(content))>0), sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.asset_files add column handbook_note_id uuid references public.handbook_notes(id) on delete set null;
alter table public.asset_files drop constraint asset_files_store_asset_id_fkey;
alter table public.asset_files add constraint asset_files_store_asset_id_fkey foreign key(store_asset_id) references public.store_assets(id) on delete set null;
alter table public.asset_files drop constraint asset_files_shared_asset_id_fkey;
alter table public.asset_files add constraint asset_files_shared_asset_id_fkey foreign key(shared_asset_id) references public.shared_assets(id) on delete set null;
alter table public.asset_files drop constraint asset_files_exactly_one_parent;
-- A file may temporarily lose its owner during deletion; deferred GC below retains
-- any file still referenced by a cover/preview/note, and queues truly unused files.
alter table public.asset_files add constraint asset_files_at_most_one_parent check(num_nonnulls(store_asset_id,shared_asset_id,store_id,handbook_note_id)<=1);
create table public.handbook_note_images (note_id uuid references public.handbook_notes(id) on delete cascade, asset_file_id uuid references public.asset_files(id) on delete restrict, sort_order integer not null default 0, primary key(note_id,asset_file_id));
create table public.r2_cleanup_queue (storage_key text primary key, requested_by uuid references public.profiles(id), created_at timestamptz not null default now(), completed_at timestamptz);
alter table public.r2_cleanup_queue enable row level security;
create policy "cleanup requester reads" on public.r2_cleanup_queue for select to authenticated using(requested_by=auth.uid() or public.is_admin());
create policy "cleanup requester marks completion" on public.r2_cleanup_queue for update to authenticated using(requested_by=auth.uid() or public.is_admin()) with check(requested_by=auth.uid() or public.is_admin());
-- Queue entries can only be created by DB cleanup triggers, never by a client.
revoke all on public.r2_cleanup_queue from anon, authenticated;
grant select on public.r2_cleanup_queue to authenticated;
grant update(completed_at) on public.r2_cleanup_queue to authenticated;

alter table public.store_tags enable row level security;
alter table public.prompt_tags enable row level security;
create policy "read store tags" on public.store_tags for select to authenticated using(true);
create policy "create store tags" on public.store_tags for insert to authenticated with check(true);
create policy "admin store tags" on public.store_tags for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read prompt tags" on public.prompt_tags for select to authenticated using(true);
create policy "create prompt tags" on public.prompt_tags for insert to authenticated with check(true);
create policy "admin prompt tags" on public.prompt_tags for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "members create inspiration tags" on public.tags for insert to authenticated with check(true);
alter table public.prompts enable row level security;
alter table public.prompt_tag_relations enable row level security;
alter table public.prompt_favorites enable row level security;
create policy "read allowed prompts" on public.prompts for select to authenticated using(visibility='team' or created_by=auth.uid());
create policy "create own prompts" on public.prompts for insert to authenticated with check(created_by=auth.uid());
create policy "edit allowed prompts" on public.prompts for update to authenticated using(created_by=auth.uid() or (visibility='team' and public.is_admin())) with check(created_by=auth.uid() or (visibility='team' and public.is_admin()));
create policy "delete allowed prompts" on public.prompts for delete to authenticated using(created_by=auth.uid() or (visibility='team' and public.is_admin()));
create policy "read allowed prompt tags" on public.prompt_tag_relations for select to authenticated using(exists(select 1 from public.prompts p where p.id=prompt_id));
create policy "manage allowed prompt tags" on public.prompt_tag_relations for all to authenticated using(exists(select 1 from public.prompts p where p.id=prompt_id and (p.created_by=auth.uid() or (p.visibility='team' and public.is_admin())))) with check(exists(select 1 from public.prompts p where p.id=prompt_id and (p.created_by=auth.uid() or (p.visibility='team' and public.is_admin()))));
create policy "read own visible favorites" on public.prompt_favorites for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.prompts p where p.id=prompt_id));
create policy "add own visible favorites" on public.prompt_favorites for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.prompts p where p.id=prompt_id));
create policy "remove own favorites" on public.prompt_favorites for delete to authenticated using(user_id=auth.uid());
-- A creator cannot be reassigned to turn an inaccessible private record into admin-owned data.
create function public.v1_prompt_creator_guard() returns trigger language plpgsql set search_path=public as $$ begin if new.created_by<>old.created_by then raise exception 'permission denied' using errcode='42501'; end if; return new; end $$;
create trigger prompt_creator_guard before update on public.prompts for each row execute function public.v1_prompt_creator_guard();
create trigger prompts_updated before update on public.prompts for each row execute function public.set_updated_at();

alter table public.handbook_products enable row level security;
alter table public.handbook_notes enable row level security;
alter table public.handbook_note_images enable row level security;
create policy "read handbook products" on public.handbook_products for select to authenticated using(true);
create policy "admin handbook products" on public.handbook_products for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read handbook notes" on public.handbook_notes for select to authenticated using(true);
create policy "admin handbook notes" on public.handbook_notes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read handbook images" on public.handbook_note_images for select to authenticated using(true);
create policy "admin handbook images" on public.handbook_note_images for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin handbook files" on public.asset_files for all to authenticated using(public.is_admin() and handbook_note_id is not null) with check(public.is_admin() and handbook_note_id is not null);
create function public.v1_general_guard() returns trigger language plpgsql set search_path=public as $$ begin
 if old.is_general or (tg_op='UPDATE' and new.is_general<>old.is_general) then raise exception '通用规范不可修改或删除'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger handbook_general_guard before update or delete on public.handbook_products for each row execute function public.v1_general_guard();
create trigger handbook_notes_updated before update on public.handbook_notes for each row execute function public.set_updated_at();
create trigger handbook_products_updated before update on public.handbook_products for each row execute function public.set_updated_at();
create index prompt_updated_idx on public.prompts(updated_at desc);
create index handbook_notes_order_idx on public.handbook_notes(product_id,sort_order);
-- Existing Supabase default grants are not assumed.
grant select,insert,update,delete on public.store_tags,public.prompt_tags,public.prompts,public.prompt_tag_relations,public.prompt_favorites,public.handbook_products,public.handbook_notes,public.handbook_note_images to authenticated;

create function public.v1_gc_file(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare f public.asset_files; begin
 select * into f from public.asset_files where id=p_id for update;
 if not found then return; end if;
 if num_nonnulls(f.store_asset_id,f.shared_asset_id,f.store_id,f.handbook_note_id)>0 then return; end if;
 if exists(select 1 from public.handbook_note_images where asset_file_id=p_id) or exists(select 1 from public.stores where cover_file_id=p_id) or exists(select 1 from public.shared_assets where preview_file_id=p_id) then return; end if;
 delete from public.asset_files where id=p_id;
end $$;
create function public.v1_file_deleted() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if num_nonnulls(old.store_asset_id,old.shared_asset_id,old.store_id,old.handbook_note_id)>0 or exists(select 1 from public.handbook_note_images where asset_file_id=old.id) or exists(select 1 from public.stores where cover_file_id=old.id) or exists(select 1 from public.shared_assets where preview_file_id=old.id) then raise exception '文件仍被引用，不能删除'; end if;
 perform pg_advisory_xact_lock(hashtext('r2-key'),hashtext(old.storage_key));
 if not exists(select 1 from public.inspirations where image_key=old.storage_key) then insert into public.r2_cleanup_queue(storage_key,requested_by) values(old.storage_key,auth.uid()) on conflict do nothing; end if;
 return old;
end $$;
create trigger v1_file_delete_guard before delete on public.asset_files for each row execute function public.v1_file_deleted();
create function public.v1_deferred_file_gc() returns trigger language plpgsql security definer set search_path=public as $$ begin perform public.v1_gc_file(new.id); return null; end $$;
create constraint trigger v1_file_gc after insert or update on public.asset_files deferrable initially deferred for each row execute function public.v1_deferred_file_gc();
create function public.v1_reference_removed() returns trigger language plpgsql security definer set search_path=public as $$ declare f uuid; begin
 if tg_table_name='handbook_note_images' then
  f=old.asset_file_id;
  update public.asset_files set handbook_note_id=null where id=f and handbook_note_id=old.note_id and not exists(select 1 from public.handbook_note_images where note_id=old.note_id and asset_file_id=f);
 elsif tg_table_name='stores' then f=old.cover_file_id;
 else f=old.preview_file_id; end if;
 if f is not null then perform public.v1_gc_file(f); end if; return null;
end $$;
create trigger v1_note_image_gc after delete on public.handbook_note_images for each row execute function public.v1_reference_removed();
create trigger v1_store_cover_gc after update of cover_file_id or delete on public.stores for each row execute function public.v1_reference_removed();
create trigger v1_shared_preview_gc after update of preview_file_id or delete on public.shared_assets for each row execute function public.v1_reference_removed();
create function public.v1_key_guard() returns trigger language plpgsql security definer set search_path=public as $$ declare k text; begin
 if tg_table_name='asset_files' then k=new.storage_key; else k=new.image_key; end if;
 perform pg_advisory_xact_lock(hashtext('r2-key'),hashtext(k));
 if exists(select 1 from public.r2_cleanup_queue where storage_key=k) then raise exception '该文件已进入清理流程'; end if; return new;
end $$;
create trigger v1_file_key before insert or update of storage_key on public.asset_files for each row execute function public.v1_key_guard();
create trigger v1_inspiration_key before insert or update of image_key on public.inspirations for each row execute function public.v1_key_guard();
create function public.v1_inspiration_deleted() returns trigger language plpgsql security definer set search_path=public as $$ begin
 perform pg_advisory_xact_lock(hashtext('r2-key'),hashtext(old.image_key));
 if not exists(select 1 from public.asset_files where storage_key=old.image_key) and not exists(select 1 from public.inspirations where image_key=old.image_key) then insert into public.r2_cleanup_queue(storage_key,requested_by) values(old.image_key,auth.uid()) on conflict do nothing; end if; return null;
end $$;
create trigger v1_inspiration_cleanup after delete on public.inspirations for each row execute function public.v1_inspiration_deleted();

create function public.v1_move_asset(p_kind text,p_id uuid,p_store_ids uuid[],p_category text,p_tag_ids uuid[],p_workstation_ids smallint[],p_note text) returns uuid language plpgsql security invoker set search_path=public as $$
declare a record; target uuid; f uuid; begin
 if auth.uid() is null then raise exception 'permission denied' using errcode='42501'; end if;
 if exists(select 1 from unnest(p_store_ids) x where not exists(select 1 from public.stores s where s.id=x and s.archived_at is null)) then raise exception '目标店铺不存在或已归档'; end if;
 if p_kind='store' then
  select * into a from public.store_assets where id=p_id for update;
  if not found then raise exception '这项内容已不存在'; end if;
  if a.created_by<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
  insert into public.shared_assets(id,title,description,created_by) values(p_id,a.title,nullif(btrim(p_note),''),auth.uid()) returning id into target;
  insert into public.shared_asset_stores select target,x from (select distinct unnest(p_store_ids) x) t;
  insert into public.shared_asset_workstations select target,x from (select distinct unnest(p_workstation_ids) x) t;
  update public.asset_files set store_asset_id=null,shared_asset_id=target where store_asset_id=p_id;
  select id into f from public.asset_files where shared_asset_id=target order by created_at limit 1;
  if f is null then raise exception '原素材缺少图片'; end if;
  update public.shared_assets set preview_file_id=f where id=target;
  delete from public.store_assets where id=p_id;
 elsif p_kind='shared' then
  if cardinality(p_store_ids)<>1 or p_category not in ('main','scene','a_plus','other') then raise exception '请选择目标店铺和分类'; end if;
  select * into a from public.shared_assets where id=p_id for update;
  if not found then raise exception '这项内容已不存在'; end if;
  if a.created_by<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
  insert into public.store_assets(id,store_id,title,asset_category,created_by) values(p_id,p_store_ids[1],a.title,p_category,auth.uid()) returning id into target;
  insert into public.store_asset_tags select target,x from (select distinct unnest(p_tag_ids) x) t;
  insert into public.store_asset_workstations select target,x from (select distinct unnest(p_workstation_ids) x) t;
  update public.asset_files set shared_asset_id=null,store_asset_id=target where shared_asset_id=p_id;
  if not found then raise exception '原素材缺少图片'; end if;
  delete from public.shared_assets where id=p_id;
 else raise exception '无效素材类型'; end if;
 return target;
end $$;
-- Team organization may remove a visible store association, never the asset itself.
-- Keep the existing owner/admin INSERT/UPDATE policy and asset DELETE policies.
-- Existing stores SELECT already exposes stores with shared_asset_stores links.
-- Do not query stores here: that archived-store policy refers back to this table.
create policy "members remove visible shared store associations" on public.shared_asset_stores
 for delete to authenticated using (
 auth.uid() is not null
 and exists(select 1 from public.shared_assets a where a.id=shared_asset_id)
 );
create function public.v1_delete_asset(p_kind text,p_id uuid,p_store_id uuid default null) returns void language plpgsql security invoker set search_path=public as $$ declare owner_id uuid; begin
 if auth.uid() is null then raise exception 'permission denied' using errcode='42501'; end if;
 if p_kind='shared' and p_store_id is not null then
  -- Do not lock/update the parent: its UPDATE policy is deliberately owner/admin.
  delete from public.shared_asset_stores where shared_asset_id=p_id and store_id=p_store_id;
  if not found then raise exception '这项关联已不存在或你目前没有权限执行此操作'; end if;
  return;
 end if;
 if p_kind='shared' then select created_by into owner_id from public.shared_assets where id=p_id for update;
 elsif p_kind='store' then select created_by into owner_id from public.store_assets where id=p_id for update;
 elsif p_kind='inspiration' then select created_by into owner_id from public.inspirations where id=p_id for update;
 else raise exception '无效素材类型'; end if;
 if owner_id is null then raise exception '这项内容已不存在'; end if;
 if owner_id<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 if p_kind='shared' then delete from public.shared_assets where id=p_id;
 elsif p_kind='store' then delete from public.store_assets where id=p_id;
 else delete from public.inspirations where id=p_id; end if;
end $$;

create function public.v1_tag_name_guard() returns trigger language plpgsql set search_path=public as $$ declare duplicate boolean; begin
 new.name=btrim(new.name); if new.name='' then raise exception '标签名称不能为空'; end if;
 perform pg_advisory_xact_lock(hashtext(tg_table_name),hashtext(lower(new.name)));
 execute format('select exists(select 1 from public.%I where lower(btrim(name))=lower($1) and id<>$2)',tg_table_name) into duplicate using new.name,new.id;
 if duplicate then raise exception '标签已存在' using errcode='23505'; end if; return new;
end $$;
create trigger v1_tag_name before insert or update of name on public.tags for each row execute function public.v1_tag_name_guard();
create trigger v1_store_tag_name before insert or update of name on public.store_tags for each row execute function public.v1_tag_name_guard();
create trigger v1_prompt_tag_name before insert or update of name on public.prompt_tags for each row execute function public.v1_tag_name_guard();
create function public.v1_create_tag(p_scope text,p_name text) returns jsonb language plpgsql security invoker set search_path=public as $$ declare tbl text; result jsonb; begin
 tbl=case p_scope when 'inspiration' then 'tags' when 'store' then 'store_tags' when 'prompt' then 'prompt_tags' end;
 if tbl is null or auth.uid() is null then raise exception 'permission denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(tbl),hashtext(lower(btrim(p_name))));
 execute format('select to_jsonb(t) from public.%I t where lower(btrim(name))=lower(btrim($1)) order by created_at limit 1',tbl) into result using p_name;
 if result is null then execute format('insert into public.%I(name) values(btrim($1)) returning to_jsonb(%I.*)',tbl,tbl) into result using p_name; end if;
 return result;
end $$;
create function public.v1_tag_usage(p_scope text,p_id uuid) returns bigint language plpgsql security definer set search_path=public as $$ declare n bigint; tbl text; begin
 if not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 tbl=case p_scope when 'inspiration' then 'inspiration_tags' when 'store' then 'store_asset_tags' when 'prompt' then 'prompt_tag_relations' end;
 if tbl is null then raise exception '无效标签类型'; end if;
 execute format('select count(*) from public.%I where tag_id=$1',tbl) into n using p_id; if p_scope='inspiration' then n=n+(select count(*) from public.shared_asset_tags where tag_id=p_id); end if; return n;
end $$;
create function public.v1_manage_tags(p_scope text,p_changes jsonb,p_deletes jsonb) returns void language plpgsql security invoker set search_path=public as $$ declare tbl text; rel text; r jsonb; n bigint; begin
 if not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 tbl=case p_scope when 'inspiration' then 'tags' when 'store' then 'store_tags' when 'prompt' then 'prompt_tags' end;
 rel=case p_scope when 'inspiration' then 'inspiration_tags' when 'store' then 'store_asset_tags' when 'prompt' then 'prompt_tag_relations' end;
 if tbl is null then raise exception '无效标签类型'; end if;
 execute format('lock table public.%I in share row exclusive mode',rel);
 if p_scope='inspiration' then lock table public.shared_asset_tags in share row exclusive mode; end if;
 for r in select * from jsonb_array_elements(p_deletes) loop
  n=public.v1_tag_usage(p_scope,(r->>'id')::uuid);
  if n<>(r->>'count')::bigint then raise exception '标签关联已变化，请重新确认'; end if;
  execute format('delete from public.%I where id=$1',tbl) using (r->>'id')::uuid;
 end loop;
 for r in select * from jsonb_array_elements(p_changes) loop
  if r->>'id' is null then perform public.v1_create_tag(p_scope,r->>'name');
  else execute format('update public.%I set name=$1 where id=$2',tbl) using r->>'name',(r->>'id')::uuid; end if;
 end loop;
end $$;

create function public.v1_save_prompt(p_id uuid,p_content text,p_visibility text,p_tags uuid[]) returns uuid language plpgsql security invoker set search_path=public as $$ declare target uuid; begin
 if p_id is null then insert into public.prompts(content,visibility,created_by) values(btrim(p_content),p_visibility,auth.uid()) returning id into target;
 else update public.prompts set content=btrim(p_content),visibility=p_visibility where id=p_id returning id into target;
 if target is null then raise exception '这项内容已不存在或没有权限'; end if; end if;
 delete from public.prompt_tag_relations where prompt_id=target;
 insert into public.prompt_tag_relations select target,x from (select distinct unnest(p_tags) x) t;
 return target;
end $$;
create function public.v1_handbook_product(p_action text,p_id uuid,p_name text default '') returns uuid language plpgsql security invoker set search_path=public as $$ declare target uuid; begin
 if not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('handbook_order'));
 if p_action='create' then insert into public.handbook_products(name,sort_order) values(btrim(p_name),coalesce((select max(sort_order)+1 from public.handbook_products),0)) returning id into target;
 elsif p_action='rename' then update public.handbook_products set name=btrim(p_name) where id=p_id returning id into target;
 elsif p_action='delete' then delete from public.handbook_products where id=p_id returning id into target;
 else raise exception '无效操作'; end if;
 if target is null then raise exception '这项内容已不存在'; end if; return target;
end $$;
create function public.v1_reorder(p_kind text,p_id uuid,p_direction integer) returns void language plpgsql security invoker set search_path=public as $$ declare ids uuid[]; idx integer; other integer; product uuid; begin
 if not public.is_admin() or p_direction not in (-1,1) then raise exception 'permission denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('handbook_order'));
 if p_kind='product' then select array_agg(id order by sort_order,created_at,id) into ids from public.handbook_products where not is_general;
 elsif p_kind='note' then select product_id into product from public.handbook_notes where id=p_id; select array_agg(id order by sort_order,created_at,id) into ids from public.handbook_notes where product_id=product;
 else raise exception '无效操作'; end if;
 idx=array_position(ids,p_id); other=idx+p_direction;
 if idx is null then raise exception '这项内容已不存在'; end if;
 if other<1 or other>cardinality(ids) then return; end if;
 ids[idx]=ids[other]; ids[other]=p_id;
 if p_kind='product' then update public.handbook_products p set sort_order=t.n from unnest(ids) with ordinality t(id,n) where p.id=t.id;
 else update public.handbook_notes p set sort_order=t.n from unnest(ids) with ordinality t(id,n) where p.id=t.id; end if;
end $$;
create function public.v1_save_note(p_id uuid,p_product uuid,p_content text,p_keep uuid[],p_files jsonb) returns uuid language plpgsql security invoker set search_path=public as $$ declare target uuid; img jsonb; f uuid; n integer=0; begin
 if not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('handbook_order'));
 if p_id is null then insert into public.handbook_notes(product_id,content,sort_order) values(p_product,btrim(p_content),coalesce((select max(sort_order)+1 from public.handbook_notes where product_id=p_product),0)) returning id into target;
 else update public.handbook_notes set content=btrim(p_content) where id=p_id and product_id=p_product returning id into target;
 if target is null then raise exception '这项内容已不存在'; end if; end if;
 -- Keep IDs can only refer to the current note's images, not arbitrary private files.
 if exists(select 1 from unnest(p_keep) k where not exists(select 1 from public.handbook_note_images where note_id=target and asset_file_id=k)) then raise exception '参考图片已变化'; end if;
 delete from public.handbook_note_images where note_id=target and not(asset_file_id=any(p_keep));
 foreach f in array p_keep loop update public.handbook_note_images set sort_order=n where note_id=target and asset_file_id=f; n=n+1; end loop;
 for img in select * from jsonb_array_elements(p_files) loop
  insert into public.asset_files(handbook_note_id,original_name,storage_key,mime_type,size_bytes,width,height,kind,created_by) values(target,img->>'originalName',img->>'key',img->>'mimeType',(img->>'sizeBytes')::bigint,(img->>'width')::integer,(img->>'height')::integer,'image',auth.uid()) returning id into f;
  insert into public.handbook_note_images values(target,f,n); n=n+1;
 end loop;
 return target;
end $$;
-- Internal SECURITY DEFINER functions only run via triggers; public RPCs are invoker/RLS.
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'v1_%' loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop; end $$;
grant execute on function public.v1_move_asset(text,uuid,uuid[],text,uuid[],smallint[],text),public.v1_delete_asset(text,uuid,uuid),public.v1_create_tag(text,text),public.v1_tag_usage(text,uuid),public.v1_manage_tags(text,jsonb,jsonb),public.v1_save_prompt(uuid,text,text,uuid[]),public.v1_handbook_product(text,uuid,text),public.v1_reorder(text,uuid,integer),public.v1_save_note(uuid,uuid,text,uuid[],jsonb) to authenticated;

create function public.v1_search_handbook_ids(p_query text) returns uuid[] language sql stable security invoker set search_path=public as $$
 select coalesce(array_agg(id),'{}'::uuid[]) from (select p.id from public.handbook_products p where length(btrim(p_query))>0 and (strpos(lower(p.name),lower(btrim(p_query)))>0 or exists(select 1 from public.handbook_notes n where n.product_id=p.id and strpos(lower(n.content),lower(btrim(p_query)))>0)) order by p.is_general desc,p.sort_order limit 6) t
$$;
create function public.v1_search_prompt_ids(p_query text) returns uuid[] language sql stable security invoker set search_path=public as $$
 select coalesce(array_agg(id),'{}'::uuid[]) from (select p.id from public.prompts p where length(btrim(p_query))>0 and (strpos(lower(p.content),lower(btrim(p_query)))>0 or exists(select 1 from public.prompt_tag_relations r join public.prompt_tags t on t.id=r.tag_id where r.prompt_id=p.id and strpos(lower(t.name),lower(btrim(p_query)))>0)) order by p.updated_at desc limit 6) t
$$;
revoke all on function public.v1_search_handbook_ids(text),public.v1_search_prompt_ids(text) from public,anon;
grant execute on function public.v1_search_handbook_ids(text),public.v1_search_prompt_ids(text) to authenticated;

notify pgrst, 'reload schema';
commit;
