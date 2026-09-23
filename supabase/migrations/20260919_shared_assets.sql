-- 火麦-素材共享：共享素材与多工作站定位迁移。
-- 可在 Supabase Dashboard → SQL Editor 直接执行；不会删除或重置任何现有数据。

create table if not exists public.shared_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  preview_file_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_asset_stores (
  shared_asset_id uuid not null references public.shared_assets(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  primary key (shared_asset_id, store_id)
);

create table if not exists public.shared_asset_workstations (
  shared_asset_id uuid not null references public.shared_assets(id) on delete cascade,
  workstation_id smallint not null references public.workstations(id),
  primary key (shared_asset_id, workstation_id)
);

-- Existing store_assets.workstation_id remains valid. This relation adds multiple source locations.
create table if not exists public.store_asset_workstations (
  store_asset_id uuid not null references public.store_assets(id) on delete cascade,
  workstation_id smallint not null references public.workstations(id),
  primary key (store_asset_id, workstation_id)
);
insert into public.store_asset_workstations (store_asset_id, workstation_id)
select id, workstation_id from public.store_assets where workstation_id is not null
on conflict do nothing;

-- Reuse asset_files for future shared-material preview images, while preserving every existing store file.
alter table public.asset_files add column if not exists shared_asset_id uuid references public.shared_assets(id) on delete cascade;
alter table public.asset_files alter column store_asset_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'asset_files_exactly_one_parent') then
    alter table public.asset_files add constraint asset_files_exactly_one_parent check (num_nonnulls(store_asset_id, shared_asset_id) = 1);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shared_assets_preview_file_fk') then
    alter table public.shared_assets add constraint shared_assets_preview_file_fk foreign key (preview_file_id) references public.asset_files(id) on delete set null;
  end if;
end $$;
alter table public.inspirations add column if not exists source_domain text;

alter table public.shared_assets enable row level security;
alter table public.shared_asset_stores enable row level security;
alter table public.shared_asset_workstations enable row level security;
alter table public.store_asset_workstations enable row level security;

drop policy if exists "authenticated users read shared assets" on public.shared_assets;
drop policy if exists "members create shared assets" on public.shared_assets;
drop policy if exists "owners and admins update shared assets" on public.shared_assets;
drop policy if exists "owners and admins delete shared assets" on public.shared_assets;
create policy "authenticated users read shared assets" on public.shared_assets for select to authenticated using (true);
create policy "members create shared assets" on public.shared_assets for insert to authenticated with check (created_by = auth.uid());
create policy "owners and admins update shared assets" on public.shared_assets for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "owners and admins delete shared assets" on public.shared_assets for delete to authenticated using (created_by = auth.uid() or public.is_admin());

create policy "authenticated users read shared asset stores" on public.shared_asset_stores for select to authenticated using (true);
create policy "shared owners manage applicable stores" on public.shared_asset_stores for all to authenticated using (public.is_admin() or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid()));
create policy "authenticated users read shared asset workstations" on public.shared_asset_workstations for select to authenticated using (true);
create policy "shared owners manage workstations" on public.shared_asset_workstations for all to authenticated using (public.is_admin() or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid()));
create policy "authenticated users read store asset workstations" on public.store_asset_workstations for select to authenticated using (true);
create policy "store asset owners manage workstations" on public.store_asset_workstations for all to authenticated using (public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()));

drop policy if exists "asset owners manage files" on public.asset_files;
create policy "asset owners manage files" on public.asset_files for all to authenticated using (
  public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()) or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid())
) with check (
  public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()) or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid())
);
