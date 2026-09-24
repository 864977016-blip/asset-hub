-- Apply after the two pending account migrations. No team records are moved.
begin;

alter table public.profiles add column is_disabled boolean not null default false;

-- Look up current DB state, never JWT metadata. Definer avoids recursive profiles RLS.
create function public.is_active_member() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where id=auth.uid() and not is_disabled)
$$;
revoke all on function public.is_active_member() from public,anon;
grant execute on function public.is_active_member() to authenticated;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not is_disabled)
$$;

-- RESTRICTIVE is ANDed with all existing policies, including private ownership.
-- Explicit inventory avoids changing unrelated tables/extensions.
do $$ declare t text; begin
 foreach t in array array['profiles','stores','inspirations','store_assets','shared_assets',
 'asset_files','tags','store_tags','prompt_tags','inspiration_tags','store_asset_tags',
 'shared_asset_tags','shared_asset_stores','shared_asset_workstations','store_asset_workstations',
 'workstations','activities','prompts','prompt_tag_relations','prompt_favorites',
 'handbook_products','handbook_notes','handbook_note_images','r2_cleanup_queue','team_invitations'] loop
  execute format('create policy "active members only" on public.%I as restrictive for all to authenticated using ((select public.is_active_member())) with check ((select public.is_active_member()))',t);
 end loop;
end $$;

create function public.v3_profile_status_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.is_disabled is distinct from old.is_disabled and not public.is_admin() then
  raise exception 'permission denied' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.v3_profile_status_guard() from public,anon,authenticated;
create trigger guard_profile_status before update on public.profiles for each row execute function public.v3_profile_status_guard();

-- Keep the original atomic counter; now only ACTIVE admins contribute.
create or replace function public.v2_track_admin_count() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare delta integer:=0;
begin
 if tg_op='TRUNCATE' then raise exception 'LAST_ADMIN_REQUIRED' using errcode='P0001'; end if;
 if tg_op<>'INSERT' and old.role='admin' and not old.is_disabled then delta:=delta-1; end if;
 if tg_op<>'DELETE' and new.role='admin' and not new.is_disabled then delta:=delta+1; end if;
 if delta<>0 then
  begin
   update public.team_admin_guard set admin_count=admin_count+delta where singleton;
   if not found then raise exception 'ADMIN_GUARD_MISSING'; end if;
  exception when check_violation then raise exception 'LAST_ADMIN_REQUIRED' using errcode='P0001'; end;
 end if;
 return null;
end $$;

create function public.v3_set_member_status(p_id uuid,p_disabled boolean) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 if p_disabled is null then raise exception 'INVALID_STATUS'; end if;
 update public.profiles set is_disabled=p_disabled where id=p_id;
 if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
end $$;
revoke all on function public.v3_set_member_status(uuid,boolean) from public,anon;
grant execute on function public.v3_set_member_status(uuid,boolean) to authenticated;

create function public.v3_list_members() returns table(id uuid,display_name text,email text,role public.member_role,is_disabled boolean,pending_private_count bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 return query select p.id,p.display_name,u.email::text,p.role,p.is_disabled,
  case when p.is_disabled then (select count(*) from public.prompts x where x.created_by=p.id and x.visibility='private') else 0::bigint end
  from public.profiles p join auth.users u on u.id=p.id order by p.created_at,p.id;
end $$;
revoke all on function public.v3_list_members() from public,anon;
grant execute on function public.v3_list_members() to authenticated;

-- The sole ownership exception is the dedicated definer RPC below. A client
-- cannot imitate current_user via metadata or SET_CONFIG; normal admin writes
-- continue to be blocked, and no policy grants admins private prompt contents.
create or replace function public.v1_prompt_creator_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.created_by<>old.created_by then
  if current_user<>pg_get_userbyid((select proowner from pg_proc where oid='public.v3_handover_private_prompts(uuid,uuid)'::regprocedure))
   or not public.is_admin() or old.visibility<>'private' or new.visibility<>'private'
   or new.content is distinct from old.content
   or not exists(select 1 from public.profiles where id=old.created_by and is_disabled)
   or not exists(select 1 from public.profiles where id=new.created_by and not is_disabled)
  then raise exception 'permission denied' using errcode='42501'; end if;
 end if;
 return new;
end $$;

create function public.v3_handover_private_prompts(p_source uuid,p_recipient uuid) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare transferred bigint;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 -- Serialize with status changes and other handovers; deterministic lock order.
 perform id from public.profiles where id in (p_source,p_recipient,auth.uid()) order by id for update;
 if not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_source and is_disabled) then raise exception 'SOURCE_NOT_DISABLED'; end if;
 if not exists(select 1 from public.profiles where id=p_recipient and not is_disabled) then raise exception 'RECIPIENT_NOT_ACTIVE'; end if;
 update public.prompts set created_by=p_recipient where created_by=p_source and visibility='private';
 get diagnostics transferred=row_count;
 return transferred;
end $$;
revoke all on function public.v3_handover_private_prompts(uuid,uuid) from public,anon;
grant execute on function public.v3_handover_private_prompts(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
