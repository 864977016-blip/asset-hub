-- Atomic metadata and relation edits; existing workstation links remain part of the current edit form.
begin;

create function public.v5_update_store_asset(
  p_id uuid, p_category text, p_change_parent boolean, p_parent_id uuid,
  p_tag_ids uuid[], p_workstation_ids smallint[], p_person_ids uuid[]
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare asset record;
begin
  if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
  select store_id,created_by into asset from public.store_assets where id=p_id for update;
  if not found or (asset.created_by<>auth.uid() and not public.is_admin()) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if p_category is null or p_category not in ('main','scene','a_plus','other') then
    raise exception 'invalid category' using errcode='22023';
  end if;
  if exists(select 1 from unnest(coalesce(p_workstation_ids,'{}'::smallint[])) x
            where x is null or not exists(select 1 from public.workstations w where w.id=x)) then
    raise exception 'invalid workstation' using errcode='22023';
  end if;
  if p_tag_ids is not null and exists(select 1 from unnest(p_tag_ids) x
            where x is null or not exists(select 1 from public.store_tags t where t.id=x)) then
    raise exception 'invalid tag' using errcode='22023';
  end if;
  if p_person_ids is not null and exists(select 1 from unnest(p_person_ids) x
            where x is null or not exists(select 1 from public.production_people p where p.id=x and
              (p.disabled_at is null or exists(select 1 from public.store_asset_production_people r
                where r.store_asset_id=p_id and r.production_person_id=x)))) then
    raise exception 'invalid production person' using errcode='22023';
  end if;

  update public.store_assets set asset_category=p_category,
    parent_product_id=case when p_change_parent then p_parent_id else parent_product_id end
  where id=p_id;
  if p_tag_ids is not null then
    delete from public.store_asset_tags where store_asset_id=p_id and not (tag_id=any(p_tag_ids));
    insert into public.store_asset_tags(store_asset_id,tag_id)
      select p_id,x from (select distinct unnest(p_tag_ids) x) selected on conflict do nothing;
  end if;
  delete from public.store_asset_workstations where store_asset_id=p_id
    and not (workstation_id=any(coalesce(p_workstation_ids,'{}'::smallint[])));
  insert into public.store_asset_workstations(store_asset_id,workstation_id)
    select p_id,x from (select distinct unnest(coalesce(p_workstation_ids,'{}'::smallint[])) x) selected on conflict do nothing;
  if p_person_ids is not null then
    delete from public.store_asset_production_people where store_asset_id=p_id and not (production_person_id=any(p_person_ids));
    insert into public.store_asset_production_people(store_asset_id,production_person_id)
      select p_id,x from (select distinct unnest(p_person_ids) x) selected
      where not exists(select 1 from public.store_asset_production_people r where r.store_asset_id=p_id and r.production_person_id=x)
      on conflict do nothing;
  end if;
  return asset.store_id;
end $$;

create function public.v5_update_shared_asset(
  p_id uuid, p_description text, p_store_ids uuid[],
  p_workstation_ids smallint[], p_person_ids uuid[]
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare owner_id uuid;
begin
  if not public.is_active_member() then raise exception 'permission denied' using errcode='42501'; end if;
  select created_by into owner_id from public.shared_assets where id=p_id for update;
  if not found or (owner_id<>auth.uid() and not public.is_admin()) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if exists(select 1 from unnest(coalesce(p_store_ids,'{}'::uuid[])) x
            where x is null or not exists(select 1 from public.stores s where s.id=x and
              (s.archived_at is null or exists(select 1 from public.shared_asset_stores r
                where r.shared_asset_id=p_id and r.store_id=x)))) then
    raise exception 'invalid store' using errcode='22023';
  end if;
  if exists(select 1 from unnest(coalesce(p_workstation_ids,'{}'::smallint[])) x
            where x is null or not exists(select 1 from public.workstations w where w.id=x)) then
    raise exception 'invalid workstation' using errcode='22023';
  end if;
  if p_person_ids is not null and exists(select 1 from unnest(p_person_ids) x
            where x is null or not exists(select 1 from public.production_people p where p.id=x and
              (p.disabled_at is null or exists(select 1 from public.shared_asset_production_people r
                where r.shared_asset_id=p_id and r.production_person_id=x)))) then
    raise exception 'invalid production person' using errcode='22023';
  end if;

  update public.shared_assets set description=p_description where id=p_id;
  -- Archived historical stores remain linked even when absent from the edit form.
  delete from public.shared_asset_stores r where r.shared_asset_id=p_id
    and not (r.store_id=any(coalesce(p_store_ids,'{}'::uuid[])))
    and not exists(select 1 from public.stores s where s.id=r.store_id and s.archived_at is not null);
  insert into public.shared_asset_stores(shared_asset_id,store_id)
    select p_id,x from (select distinct unnest(coalesce(p_store_ids,'{}'::uuid[])) x) selected on conflict do nothing;
  delete from public.shared_asset_workstations where shared_asset_id=p_id
    and not (workstation_id=any(coalesce(p_workstation_ids,'{}'::smallint[])));
  insert into public.shared_asset_workstations(shared_asset_id,workstation_id)
    select p_id,x from (select distinct unnest(coalesce(p_workstation_ids,'{}'::smallint[])) x) selected on conflict do nothing;
  if p_person_ids is not null then
    delete from public.shared_asset_production_people where shared_asset_id=p_id and not (production_person_id=any(p_person_ids));
    insert into public.shared_asset_production_people(shared_asset_id,production_person_id)
      select p_id,x from (select distinct unnest(p_person_ids) x) selected
      where not exists(select 1 from public.shared_asset_production_people r where r.shared_asset_id=p_id and r.production_person_id=x)
      on conflict do nothing;
  end if;
end $$;

revoke all on function public.v5_update_store_asset(uuid,text,boolean,uuid,uuid[],smallint[],uuid[]),
  public.v5_update_shared_asset(uuid,text,uuid[],smallint[],uuid[]) from public,anon,authenticated;
grant execute on function public.v5_update_store_asset(uuid,text,boolean,uuid,uuid[],smallint[],uuid[]),
  public.v5_update_shared_asset(uuid,text,uuid[],smallint[],uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
