begin;

-- Only this checked conversion may carry disabled historical people to the new asset.
-- Direct relation INSERT remains governed by the existing active-person RLS policy.
create or replace function public.v1_move_asset(p_kind text,p_id uuid,p_store_ids uuid[],p_category text,p_tag_ids uuid[],p_workstation_ids smallint[],p_note text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare a record; target uuid; f uuid; begin
 if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
 -- With definer rights, reproduce the invoker's active-store/workstation checks explicitly.
 if exists(select 1 from unnest(p_store_ids) x where x is null or not exists(select 1 from public.stores s where s.id=x and s.archived_at is null)) then raise exception '目标店铺不存在或已归档'; end if;
 if exists(select 1 from unnest(p_workstation_ids) x where x is null or not exists(select 1 from public.workstations w where w.id=x)) then raise exception '工作站无效'; end if;
 if p_kind='store' then
  select * into a from public.store_assets where id=p_id for update;
  if not found then raise exception '这项内容已不存在'; end if;
  if a.created_by<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
  insert into public.shared_assets(id,title,description,created_by) values(p_id,a.title,nullif(btrim(p_note),''),auth.uid()) returning id into target;
  insert into public.shared_asset_stores select target,x from (select distinct unnest(p_store_ids) x) t;
  insert into public.shared_asset_workstations select target,x from (select distinct unnest(p_workstation_ids) x) t;
  insert into public.shared_asset_production_people(shared_asset_id,production_person_id)
    select target,production_person_id from public.store_asset_production_people where store_asset_id=p_id
    on conflict (shared_asset_id,production_person_id) do nothing;
  update public.asset_files set store_asset_id=null,shared_asset_id=target where store_asset_id=p_id;
  select id into f from public.asset_files where shared_asset_id=target order by created_at limit 1;
  if f is null then raise exception '原素材缺少图片'; end if;
  update public.shared_assets set preview_file_id=f where id=target;
  delete from public.store_assets where id=p_id;
 elsif p_kind='shared' then
  if cardinality(p_store_ids)<>1 or p_category not in ('main','scene','a_plus','other') then raise exception '请选择目标店铺和分类'; end if;
  if exists(select 1 from unnest(p_tag_ids) x where x is null or not exists(select 1 from public.store_tags t where t.id=x)) then raise exception '标签无效'; end if;
  select * into a from public.shared_assets where id=p_id for update;
  if not found then raise exception '这项内容已不存在'; end if;
  if a.created_by<>auth.uid() and not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
  insert into public.store_assets(id,store_id,title,asset_category,created_by) values(p_id,p_store_ids[1],a.title,p_category,auth.uid()) returning id into target;
  insert into public.store_asset_tags select target,x from (select distinct unnest(p_tag_ids) x) t;
  insert into public.store_asset_workstations select target,x from (select distinct unnest(p_workstation_ids) x) t;
  insert into public.store_asset_production_people(store_asset_id,production_person_id)
    select target,production_person_id from public.shared_asset_production_people where shared_asset_id=p_id
    on conflict (store_asset_id,production_person_id) do nothing;
  update public.asset_files set shared_asset_id=null,store_asset_id=target where shared_asset_id=p_id;
  if not found then raise exception '原素材缺少图片'; end if;
  delete from public.shared_assets where id=p_id;
 else raise exception '无效素材类型'; end if;
 return target;
end $$;

-- Replacing the deployed function must retain the trusted SQL Editor owner.
do $$ begin
 if (select pg_get_userbyid(proowner) from pg_proc
     where oid='public.v1_move_asset(text,uuid,uuid[],text,uuid[],smallint[],text)'::regprocedure) <> 'postgres' then
   raise exception 'v1_move_asset must be owned by postgres';
 end if;
end $$;
revoke all on function public.v1_move_asset(text,uuid,uuid[],text,uuid[],smallint[],text) from public,anon,authenticated,service_role;
grant execute on function public.v1_move_asset(text,uuid,uuid[],text,uuid[],smallint[],text) to authenticated;
notify pgrst, 'reload schema';
commit;
