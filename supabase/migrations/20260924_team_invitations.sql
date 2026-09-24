-- Apply AFTER 20260923_profile_role_guard.sql. Does not modify existing users.
begin;

do $$ begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.prevent_role_escalation()') and not prosecdef) then
  raise exception 'Apply 20260923_profile_role_guard.sql first';
 end if;
end $$;

create table public.team_invitations (
 id uuid primary key default gen_random_uuid(),
 code_hash bytea not null unique,
 code_hint text not null,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null,
 expires_at timestamptz not null,
 check (expires_at = created_at + interval '24 hours')
);
alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from public, anon, authenticated;
grant select(id,code_hint,created_by,created_at,expires_at) on public.team_invitations to authenticated;
create policy "admins read active invitations" on public.team_invitations
 for select to authenticated using(public.is_admin() and expires_at>statement_timestamp());

create function public.v2_create_invitation() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare code text; issued timestamptz:=clock_timestamp(); row_id uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 -- 96 random bits, rather than a short code whose stored hash is easily guessed.
 code:='HM-'||upper(substr(encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),1,24));
 insert into public.team_invitations(code_hash,code_hint,created_by,created_at,expires_at)
 values(sha256(convert_to(code,'UTF8')),'HM-…'||right(code,6),auth.uid(),issued,issued+interval '24 hours') returning id into row_id;
 return jsonb_build_object('id',row_id,'code',code,'createdAt',issued,'expiresAt',issued+interval '24 hours');
end $$;
revoke all on function public.v2_create_invitation() from public,anon;
grant execute on function public.v2_create_invitation() to authenticated;

-- Enforce admission before Auth persists a user; every signup path hits this.
-- Do not expose a public "validate code" oracle or store the raw code in metadata.
create function public.v2_require_invitation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare code text:=upper(btrim(coalesce(new.raw_user_meta_data->>'invite_code','')));
 username text:=btrim(coalesce(new.raw_user_meta_data->>'display_name',''));
begin
 if code !~ '^HM-[0-9A-F]{24}$' or not exists(
  select 1 from public.team_invitations where code_hash=sha256(convert_to(code,'UTF8')) and expires_at>clock_timestamp()
 ) then raise exception 'INVITATION_INVALID' using errcode='P0001'; end if;
 if length(username)<1 or length(username)>80 then raise exception 'USERNAME_INVALID' using errcode='P0001'; end if;
 new.raw_user_meta_data:=(coalesce(new.raw_user_meta_data,'{}'::jsonb)-'invite_code'-'role')||jsonb_build_object('display_name',username);
 return new;
end $$;
revoke all on function public.v2_require_invitation() from public,anon,authenticated;
create trigger require_team_invitation before insert on auth.users for each row execute function public.v2_require_invitation();

-- Auth copies the original signup metadata into identity_data independently of
-- auth.users. Remove the credential there too, and from later metadata updates.
create function public.v2_strip_invitation_metadata() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_table_name='identities' then
  new.identity_data:=new.identity_data-'invite_code';
 else
  new.raw_user_meta_data:=new.raw_user_meta_data-'invite_code';
 end if;
 return new;
end $$;
revoke all on function public.v2_strip_invitation_metadata() from public,anon,authenticated;
create trigger strip_user_invitation_metadata before update of raw_user_meta_data on auth.users for each row execute function public.v2_strip_invitation_metadata();
create trigger strip_identity_invitation_metadata before insert or update of identity_data on auth.identities for each row execute function public.v2_strip_invitation_metadata();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.profiles(id,display_name,role) values(new.id,new.raw_user_meta_data->>'display_name','member');
 return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

-- One shared counter row serializes admin count changes even across different
-- profile rows. CHECK rejects the second concurrent demotion/deletion to zero.
create table public.team_admin_guard (
 singleton boolean primary key default true check(singleton),
 admin_count integer not null check(admin_count>=1)
);
insert into public.team_admin_guard(singleton,admin_count) select true,count(*) from public.profiles where role='admin';
alter table public.team_admin_guard enable row level security;
revoke all on public.team_admin_guard from public,anon,authenticated;

create function public.v2_track_admin_count() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare delta integer:=0;
begin
 if tg_op='TRUNCATE' then raise exception 'LAST_ADMIN_REQUIRED' using errcode='P0001'; end if;
 if tg_op<>'INSERT' and old.role='admin' then delta:=delta-1; end if;
 if tg_op<>'DELETE' and new.role='admin' then delta:=delta+1; end if;
 if delta<>0 then
  begin
   update public.team_admin_guard set admin_count=admin_count+delta where singleton;
   if not found then raise exception 'ADMIN_GUARD_MISSING'; end if;
  exception when check_violation then raise exception 'LAST_ADMIN_REQUIRED' using errcode='P0001'; end;
 end if;
 return null;
end $$;
revoke all on function public.v2_track_admin_count() from public,anon,authenticated;
create trigger maintain_team_admin_count after insert or update or delete on public.profiles for each row execute function public.v2_track_admin_count();
create trigger prevent_team_profile_truncate before truncate on public.profiles for each statement execute function public.v2_track_admin_count();

create function public.v2_set_member_role(p_id uuid,p_role public.member_role) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 if p_role is null then raise exception 'INVALID_ROLE'; end if;
 update public.profiles set role=p_role where id=p_id;
 if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
end $$;
revoke all on function public.v2_set_member_role(uuid,public.member_role) from public,anon;
grant execute on function public.v2_set_member_role(uuid,public.member_role) to authenticated;

-- Only administrators can read Auth email addresses; no Auth table grants.
create function public.v2_list_members() returns table(id uuid,display_name text,email text,role public.member_role)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'permission denied' using errcode='42501'; end if;
 return query select p.id,p.display_name,u.email::text,p.role from public.profiles p join auth.users u on u.id=p.id order by p.created_at,p.id;
end $$;
revoke all on function public.v2_list_members() from public,anon;
grant execute on function public.v2_list_members() to authenticated;

-- Deployment readiness only; reveals no invitation values or membership data.
create function public.v2_registration_ready() returns boolean language sql security invoker set search_path=public,pg_temp as $$ select true $$;
revoke all on function public.v2_registration_ready() from public;
grant execute on function public.v2_registration_ready() to anon,authenticated;

notify pgrst,'reload schema';
commit;
