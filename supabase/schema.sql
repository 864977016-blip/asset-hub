-- Asset Hub V1 canonical schema. Run once in Supabase SQL Editor on a new project.
-- Cloudflare R2 is intentionally deferred to Phase 3; this stores metadata only.
create extension if not exists pgcrypto;
create type public.member_role as enum ('admin', 'member');
create type public.asset_file_kind as enum ('image', 'psd', 'ai', 'pdf', 'zip', 'other');
create type public.activity_target as enum ('inspiration', 'store_asset', 'store', 'workstation');
create type public.tag_group as enum ('space', 'style', 'product', 'usage', 'other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null, role public.member_role not null default 'member', avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workstations (
  id smallint primary key check (id between 1 and 8), current_user_name text, note text,
  updated_at timestamptz not null default now()
);
insert into public.workstations (id) values (1),(2),(3),(4),(5),(6),(7),(8);
create table public.stores (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, description text,
  cover_file_id uuid, created_by uuid references public.profiles(id), archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inspirations (
  id uuid primary key default gen_random_uuid(), title text, image_key text not null, image_url text not null,
  thumbnail_key text, source_url text, source_name text, note text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.store_assets (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete restrict,
  workstation_id smallint references public.workstations(id), title text not null, description text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.asset_files (
  id uuid primary key default gen_random_uuid(), store_asset_id uuid not null references public.store_assets(id) on delete cascade,
  original_name text not null, storage_key text not null unique, thumbnail_key text, mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0), kind public.asset_file_kind not null, created_at timestamptz not null default now()
);
alter table public.stores add constraint stores_cover_file_fk foreign key (cover_file_id) references public.asset_files(id) on delete set null;
create table public.tags (
  id uuid primary key default gen_random_uuid(), name text not null unique, group_name public.tag_group not null default 'other',
  color text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inspiration_tags (inspiration_id uuid references public.inspirations(id) on delete cascade, tag_id uuid references public.tags(id) on delete cascade, primary key (inspiration_id, tag_id));
create table public.store_asset_tags (store_asset_id uuid references public.store_assets(id) on delete cascade, tag_id uuid references public.tags(id) on delete cascade, primary key (store_asset_id, tag_id));
create table public.activities (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), target_type public.activity_target not null, target_id uuid, action text not null, created_at timestamptz not null default now());
create index inspirations_created_at_idx on public.inspirations (created_at desc);
create index store_assets_store_id_idx on public.store_assets (store_id, updated_at desc);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger stores_updated_at before update on public.stores for each row execute procedure public.set_updated_at();
create trigger inspirations_updated_at before update on public.inspirations for each row execute procedure public.set_updated_at();
create trigger store_assets_updated_at before update on public.store_assets for each row execute procedure public.set_updated_at();
create trigger tags_updated_at before update on public.tags for each row execute procedure public.set_updated_at();
create trigger workstations_updated_at before update on public.workstations for each row execute procedure public.set_updated_at();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;
create or replace function public.prevent_role_escalation() returns trigger language plpgsql security definer set search_path = public as $$ begin if new.role is distinct from old.role and current_user <> 'postgres' and not public.is_admin() then raise exception 'Only an administrator can change roles'; end if; return new; end; $$;
create trigger profiles_role_guard before update on public.profiles for each row execute procedure public.prevent_role_escalation();

alter table public.profiles enable row level security; alter table public.stores enable row level security; alter table public.inspirations enable row level security; alter table public.store_assets enable row level security; alter table public.asset_files enable row level security; alter table public.tags enable row level security; alter table public.inspiration_tags enable row level security; alter table public.store_asset_tags enable row level security; alter table public.workstations enable row level security; alter table public.activities enable row level security;
create policy "authenticated profiles are visible" on public.profiles for select to authenticated using (true);
create policy "members update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read active stores" on public.stores for select to authenticated using (archived_at is null);
create policy "admins create stores" on public.stores for insert to authenticated with check (public.is_admin());
create policy "admins update stores" on public.stores for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No stores delete policy: deletion is safe archival through UPDATE, never physical deletion.
create policy "authenticated users read inspirations" on public.inspirations for select to authenticated using (true);
create policy "members create inspirations" on public.inspirations for insert to authenticated with check (created_by = auth.uid());
create policy "owners and admins update inspirations" on public.inspirations for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "owners and admins delete inspirations" on public.inspirations for delete to authenticated using (created_by = auth.uid() or public.is_admin());
create policy "authenticated users read store assets" on public.store_assets for select to authenticated using (true);
create policy "members create store assets" on public.store_assets for insert to authenticated with check (created_by = auth.uid());
create policy "owners and admins update store assets" on public.store_assets for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "owners and admins delete store assets" on public.store_assets for delete to authenticated using (created_by = auth.uid() or public.is_admin());
create policy "authenticated users read files" on public.asset_files for select to authenticated using (true);
create policy "asset owners manage files" on public.asset_files for all to authenticated using (public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()));
create policy "authenticated users read tags" on public.tags for select to authenticated using (true);
create policy "admins manage tags" on public.tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read inspiration tags" on public.inspiration_tags for select to authenticated using (true);
create policy "inspiration owners manage tags" on public.inspiration_tags for all to authenticated using (public.is_admin() or exists (select 1 from public.inspirations i where i.id = inspiration_id and i.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.inspirations i where i.id = inspiration_id and i.created_by = auth.uid()));
create policy "authenticated users read store asset tags" on public.store_asset_tags for select to authenticated using (true);
create policy "asset owners manage asset tags" on public.store_asset_tags for all to authenticated using (public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()));
create policy "authenticated users read workstations" on public.workstations for select to authenticated using (true);
create policy "admins update workstations" on public.workstations for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read activities" on public.activities for select to authenticated using (true);
create policy "authenticated users write own activities" on public.activities for insert to authenticated with check (actor_id = auth.uid());

insert into public.tags (name, group_name, color) values ('室内空间','space','#A27B5C'),('建筑','space','#6C7A89'),('极简','style','#111111'),('粗野主义','style','#665A48'),('家居','product','#A86B43'),('美妆','product','#D66C8F'),('主图','usage','#FF6B00'),('A+ 页面','usage','#D98324') on conflict (name) do nothing;

-- Shared materials extension: for existing projects, run supabase/migrations/20260919_shared_assets.sql.
alter table public.inspirations add column if not exists source_domain text;
create table if not exists public.shared_assets (
  id uuid primary key default gen_random_uuid(), title text not null, description text, preview_file_id uuid,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.shared_asset_stores (shared_asset_id uuid not null references public.shared_assets(id) on delete cascade, store_id uuid not null references public.stores(id) on delete restrict, primary key (shared_asset_id, store_id));
create table if not exists public.shared_asset_workstations (shared_asset_id uuid not null references public.shared_assets(id) on delete cascade, workstation_id smallint not null references public.workstations(id), primary key (shared_asset_id, workstation_id));
create table if not exists public.store_asset_workstations (store_asset_id uuid not null references public.store_assets(id) on delete cascade, workstation_id smallint not null references public.workstations(id), primary key (store_asset_id, workstation_id));
