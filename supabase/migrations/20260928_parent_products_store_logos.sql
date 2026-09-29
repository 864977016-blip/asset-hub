-- Requires PostgreSQL 15+ (column-specific ON DELETE SET NULL). Apply after 20260925.
begin;
-- Store parent products, product tags, transactional asset organization, and store logos.
-- Existing assets remain unclassified; no file or R2 object is copied.

create table public.parent_products (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete cascade,
 name text not null,
 manual_cover_asset_id uuid null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,store_id)
);
create unique index parent_products_store_name_key on public.parent_products(store_id,lower(btrim(name)));
create index parent_products_store_idx on public.parent_products(store_id,created_at desc);

create table public.product_tags (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index product_tags_name_key on public.product_tags(lower(btrim(name)));

create table public.parent_product_tags (
 parent_product_id uuid not null references public.parent_products(id) on delete cascade,
 product_tag_id uuid not null references public.product_tags(id) on delete cascade,
 primary key(parent_product_id,product_tag_id)
);

alter table public.store_assets add column parent_product_id uuid null;
alter table public.store_assets add constraint store_assets_parent_store_fk
 foreign key(parent_product_id,store_id) references public.parent_products(id,store_id) on delete set null (parent_product_id) deferrable initially deferred;
alter table public.store_assets add constraint store_assets_parent_cover_key unique(id,parent_product_id);
alter table public.parent_products add constraint parent_manual_cover_fk foreign key(manual_cover_asset_id,id)
 references public.store_assets(id,parent_product_id) on delete set null (manual_cover_asset_id) deferrable initially deferred;
create index store_assets_parent_idx on public.store_assets(parent_product_id,created_at desc) where parent_product_id is not null;

alter table public.stores add column logo_file_id uuid null references public.asset_files(id) on delete set null;

create trigger parent_products_updated_at before update on public.parent_products for each row execute function public.set_updated_at();
create trigger product_tags_updated_at before update on public.product_tags for each row execute function public.set_updated_at();

create function public.v4_parent_guard() returns trigger language plpgsql set search_path=public as $$ begin
 if tg_op='UPDATE' and (new.store_id<>old.store_id or new.created_by<>old.created_by) then raise exception 'permission denied' using errcode='42501'; end if;
 new.name=btrim(new.name);
 if new.name='' then raise exception '父体名称不能为空'; end if;
 if new.manual_cover_asset_id is not null and not exists(
  select 1 from public.store_assets a where a.id=new.manual_cover_asset_id and a.parent_product_id=new.id and a.store_id=new.store_id and exists(select 1 from public.asset_files f where f.store_asset_id=a.id and f.kind='image')
 ) then raise exception '代表图必须来自当前父体'; end if;
 return new;
end $$;
create trigger v4_parent_guard before insert or update on public.parent_products for each row execute function public.v4_parent_guard();

create function public.v4_product_tag_guard() returns trigger language plpgsql set search_path=public as $$ begin
 new.name=btrim(new.name); if new.name='' then raise exception '产品标签不能为空'; end if; return new;
end $$;
create trigger v4_product_tag_guard before insert or update on public.product_tags for each row execute function public.v4_product_tag_guard();

create function public.v4_asset_parent_changed() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if old.parent_product_id is distinct from new.parent_product_id then
  update public.parent_products set manual_cover_asset_id=null
   where manual_cover_asset_id=old.id and id is distinct from new.parent_product_id;
 end if;
 return new;
end $$;
create trigger v4_asset_parent_changed after update of parent_product_id on public.store_assets for each row execute function public.v4_asset_parent_changed();


alter table public.parent_products enable row level security;
alter table public.product_tags enable row level security;
alter table public.parent_product_tags enable row level security;
create policy "read parent products" on public.parent_products for select to authenticated using(true);
create policy "create own parent products" on public.parent_products for insert to authenticated with check(
 created_by=auth.uid() and exists(select 1 from public.stores s where s.id=store_id and s.archived_at is null)
);
create policy "owners and admins update parent products" on public.parent_products for update to authenticated using(created_by=auth.uid() or public.is_admin()) with check(created_by=auth.uid() or public.is_admin());
create policy "owners and admins delete parent products" on public.parent_products for delete to authenticated using(created_by=auth.uid() or public.is_admin());
create policy "read product tags" on public.product_tags for select to authenticated using(true);
create policy "members create product tags" on public.product_tags for insert to authenticated with check(true);
create policy "admins manage product tags" on public.product_tags for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins delete product tags" on public.product_tags for delete to authenticated using(public.is_admin());
create policy "read parent product tags" on public.parent_product_tags for select to authenticated using(true);
create policy "owners and admins manage parent product tags" on public.parent_product_tags for all to authenticated
 using(exists(select 1 from public.parent_products p where p.id=parent_product_id and (p.created_by=auth.uid() or public.is_admin())))
 with check(exists(select 1 from public.parent_products p where p.id=parent_product_id and (p.created_by=auth.uid() or public.is_admin())));
create policy "active members only" on public.parent_products as restrictive for all to authenticated using((select public.is_active_member())) with check((select public.is_active_member()));
create policy "active members only" on public.product_tags as restrictive for all to authenticated using((select public.is_active_member())) with check((select public.is_active_member()));
create policy "active members only" on public.parent_product_tags as restrictive for all to authenticated using((select public.is_active_member())) with check((select public.is_active_member()));

grant select,insert,update,delete on public.parent_products,public.product_tags,public.parent_product_tags to authenticated;

create function public.v4_save_parent(p_id uuid,p_store_id uuid,p_name text,p_tag_ids uuid[]) returns uuid language plpgsql security invoker set search_path=public as $$
declare target uuid; owner_id uuid; begin
 if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
 if btrim(coalesce(p_name,''))='' then raise exception '父体名称不能为空'; end if;
 if not exists(select 1 from public.stores where id=p_store_id and archived_at is null) then raise exception '店铺不存在或已归档'; end if;
 if exists(select 1 from unnest(coalesce(p_tag_ids,'{}')) t where not exists(select 1 from public.product_tags where id=t)) then raise exception '部分产品标签已失效'; end if;
 if p_id is null then
  insert into public.parent_products(store_id,name,created_by) values(p_store_id,btrim(p_name),auth.uid()) returning id into target;
 else
  select created_by into owner_id from public.parent_products where id=p_id and store_id=p_store_id for update;
  if owner_id is null then raise exception '这项内容已不存在'; end if;
  if owner_id<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
  update public.parent_products set name=btrim(p_name) where id=p_id; target=p_id;
 end if;
 delete from public.parent_product_tags where parent_product_id=target;
 insert into public.parent_product_tags select target,t from (select distinct unnest(coalesce(p_tag_ids,'{}')) t) x;
 return target;
exception when unique_violation then raise exception '当前店铺已有同名父体';
end $$;

create function public.v4_delete_parent(p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare owner_id uuid; begin
 if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
 select created_by into owner_id from public.parent_products where id=p_id for update;
 if owner_id is null then raise exception '这项内容已不存在'; end if;
 if owner_id<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 delete from public.parent_products where id=p_id;
end $$;

create function public.v4_set_parent_cover(p_id uuid,p_asset_id uuid) returns void language plpgsql security invoker set search_path=public as $$
declare p public.parent_products; begin
 if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
 select * into p from public.parent_products where id=p_id for update;
 if not found then raise exception '这项内容已不存在'; end if;
 if p.created_by<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 if p_asset_id is not null and not exists(select 1 from public.store_assets where id=p_asset_id and parent_product_id=p.id and store_id=p.store_id) then raise exception '代表图必须来自当前父体'; end if;
 update public.parent_products set manual_cover_asset_id=p_asset_id where id=p.id;
end $$;

create function public.v4_create_product_tag(p_name text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result public.product_tags; begin
 if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
 insert into public.product_tags(name) values(btrim(p_name)) returning * into result; return to_jsonb(result);
exception when unique_violation then select * into result from public.product_tags where lower(btrim(name))=lower(btrim(p_name)); return to_jsonb(result);
end $$;
create function public.v4_manage_product_tag(p_id uuid,p_name text default null,p_delete boolean default false) returns void language plpgsql security invoker set search_path=public as $$ begin
 if not public.is_active_member() or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 if p_delete then delete from public.product_tags where id=p_id; else update public.product_tags set name=btrim(p_name) where id=p_id; end if;
 if not found then raise exception '这项内容已不存在'; end if;
end $$;

create function public.v4_batch_store_assets(p_store_id uuid,p_asset_ids uuid[],p_operation text,p_parent_id uuid default null,p_category text default null,p_tag_ids uuid[] default '{}') returns integer language plpgsql security invoker set search_path=public as $$
declare ids uuid[]; total integer; editable integer; asset_id uuid; begin
 if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
 -- The raw limit only bounds request/unnest work. The supported business limit below is 100 distinct assets.
 if cardinality(p_asset_ids)>1000 then raise exception '批量请求过大'; end if;
 select coalesce(array_agg(distinct x),'{}') into ids from unnest(coalesce(p_asset_ids,'{}')) x;
 -- Duplicate IDs do not consume the business limit; every operation is capped at 100 distinct assets.
 total=cardinality(ids); if total=0 or total>100 then raise exception '批量操作数量必须为 1 至 100'; end if;
 perform 1 from public.store_assets where id=any(ids) order by id for update;
 if (select count(*) from public.store_assets where id=any(ids) and store_id=p_store_id)<>total then raise exception '素材不存在、已移动或不属于当前店铺'; end if;
 select count(*) into editable from public.store_assets where id=any(ids) and (created_by=auth.uid() or public.is_admin());
 if editable<>total then raise exception 'permission denied' using errcode='42501'; end if;
 if p_operation='set_parent' then
  if not exists(select 1 from public.parent_products where id=p_parent_id and store_id=p_store_id) then raise exception '父体不属于当前店铺'; end if;
  update public.store_assets set parent_product_id=p_parent_id where id=any(ids);
 elsif p_operation='clear_parent' then update public.store_assets set parent_product_id=null where id=any(ids);
 elsif p_operation='category' then
  if p_category is null or p_category not in('main','scene','a_plus','other') then raise exception '请选择有效分类'; end if;
  update public.store_assets set asset_category=p_category where id=any(ids);
 elsif p_operation in('add_tags','remove_tags') then
  if cardinality(coalesce(p_tag_ids,'{}'))=0 then raise exception '请选择标签'; end if;
  if exists(select 1 from unnest(coalesce(p_tag_ids,'{}')) t where not exists(select 1 from public.store_tags where id=t)) then raise exception '部分标签已失效'; end if;
  if p_operation='add_tags' then insert into public.store_asset_tags select a,t from unnest(ids) a cross join unnest(coalesce(p_tag_ids,'{}')) t on conflict do nothing;
  else delete from public.store_asset_tags where store_asset_id=any(ids) and tag_id=any(coalesce(p_tag_ids,'{}')); end if;
 elsif p_operation='delete' then foreach asset_id in array ids loop perform public.v1_delete_asset('store',asset_id,null); end loop;
 else raise exception '无效批量操作'; end if;
 return total;
end $$;

-- Replace the existing guards so logo references participate in the same deferred GC path.
create or replace function public.v1_gc_file(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare f public.asset_files; begin
 select * into f from public.asset_files where id=p_id for update; if not found then return; end if;
 if num_nonnulls(f.store_asset_id,f.shared_asset_id,f.store_id,f.handbook_note_id)>0 then return; end if;
 if exists(select 1 from public.handbook_note_images where asset_file_id=p_id) or exists(select 1 from public.stores where cover_file_id=p_id or logo_file_id=p_id) or exists(select 1 from public.shared_assets where preview_file_id=p_id) then return; end if;
 delete from public.asset_files where id=p_id;
end $$;
create or replace function public.v1_file_deleted() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if num_nonnulls(old.store_asset_id,old.shared_asset_id,old.store_id,old.handbook_note_id)>0 or exists(select 1 from public.handbook_note_images where asset_file_id=old.id) or exists(select 1 from public.stores where cover_file_id=old.id or logo_file_id=old.id) or exists(select 1 from public.shared_assets where preview_file_id=old.id) then raise exception '文件仍被引用，不能删除'; end if;
 perform pg_advisory_xact_lock(hashtext('r2-key'),hashtext(old.storage_key));
 if not exists(select 1 from public.inspirations where image_key=old.storage_key) then insert into public.r2_cleanup_queue(storage_key,requested_by) values(old.storage_key,auth.uid()) on conflict do nothing; end if; return old;
end $$;
create function public.v4_logo_removed() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if old.logo_file_id is not null and (tg_op='DELETE' or old.logo_file_id is distinct from new.logo_file_id) then
  update public.asset_files set store_id=null where id=old.logo_file_id and store_id=old.id;
  perform public.v1_gc_file(old.logo_file_id);
 end if; return new;
end $$;
create trigger v4_logo_removed after update of logo_file_id or delete on public.stores for each row execute function public.v4_logo_removed();


-- Logo metadata and its reference commit together; files have no residual store owner.
create function public.v4_set_store_logo(p_store_id uuid,p_file jsonb default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; safe_storage_key text; safe_original_name text; safe_mime_type text; safe_file_size bigint; safe_width integer; safe_height integer; begin
 if not public.is_active_member() or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 perform 1 from public.stores where id=p_store_id and archived_at is null for update;
 if not found then raise exception '这项内容已不存在'; end if;
 if p_file is not null then
  if jsonb_typeof(p_file)<>'object'
   or jsonb_typeof(p_file->'key') is distinct from 'string'
   or jsonb_typeof(p_file->'originalName') is distinct from 'string'
   or jsonb_typeof(p_file->'mimeType') is distinct from 'string'
   or btrim(coalesce(p_file->>'originalName',''))=''
   or coalesce(p_file->>'sizeBytes','')!~'^[0-9]+$'
   or coalesce(p_file->>'width','')!~'^[0-9]+$'
   or coalesce(p_file->>'height','')!~'^[0-9]+$'
  then raise exception '无效文件' using errcode='22023'; end if;
  safe_storage_key=p_file->>'key'; safe_original_name=btrim(p_file->>'originalName'); safe_mime_type=p_file->>'mimeType';
  if safe_storage_key not like 'stores/'||p_store_id::text||'/logo/%'
   or safe_storage_key='stores/'||p_store_id::text||'/logo/'
   or safe_mime_type<>'image/webp'
  then raise exception '无效文件' using errcode='22023'; end if;
  begin
   safe_file_size=(p_file->>'sizeBytes')::bigint;
   safe_width=(p_file->>'width')::integer;
   safe_height=(p_file->>'height')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
   raise exception '无效文件' using errcode='22023';
  end;
  if safe_file_size<=0 or safe_width<=0 or safe_height<=0 then raise exception '无效文件' using errcode='22023'; end if;
  insert into public.asset_files(original_name,storage_key,mime_type,size_bytes,width,height,kind,created_by)
  values(safe_original_name,safe_storage_key,safe_mime_type,safe_file_size,safe_width,safe_height,'image',auth.uid()) returning id into target;
 end if;
 update public.stores set logo_file_id=target where id=p_store_id;
 return target;
end $$;
-- Real counts and stable cover selection, independent of the client asset loading limit.
create function public.v4_parent_summaries(p_store_id uuid) returns table(id uuid,asset_count bigint,cover_file_id uuid)
language sql stable security invoker set search_path=public,pg_temp as $$
 select p.id,(select count(*) from public.store_assets a where a.parent_product_id=p.id and a.store_id=p.store_id),
 coalesce(
  (select af.id from public.store_assets a join public.asset_files af on af.store_asset_id=a.id and af.kind='image'
   where a.id=p.manual_cover_asset_id and a.parent_product_id=p.id and a.store_id=p.store_id
   order by af.created_at,af.id limit 1),
  (select af.id from public.store_assets a join public.asset_files af on af.store_asset_id=a.id and af.kind='image'
   where a.parent_product_id=p.id and a.store_id=p.store_id and a.asset_category='main'
   order by a.created_at desc,a.id desc,af.created_at,af.id limit 1),
  (select af.id from public.store_assets a join public.asset_files af on af.store_asset_id=a.id and af.kind='image'
   where a.parent_product_id=p.id and a.store_id=p.store_id
   order by a.created_at desc,a.id desc,af.created_at,af.id limit 1)
 )
 from public.parent_products p where p.store_id=p_store_id and public.is_active_member()
$$;
-- No trigger helper is callable as a client RPC.
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'v4_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop; end $$;
grant execute on function public.v4_save_parent(uuid,uuid,text,uuid[]),public.v4_delete_parent(uuid),public.v4_set_parent_cover(uuid,uuid),public.v4_create_product_tag(text),public.v4_manage_product_tag(uuid,text,boolean),public.v4_batch_store_assets(uuid,uuid[],text,uuid,text,uuid[]),public.v4_set_store_logo(uuid,jsonb),public.v4_parent_summaries(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
