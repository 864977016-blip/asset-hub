-- Phase 3: image metadata, private R2-backed files, categories and shared tags.
alter table public.asset_files add column if not exists width integer;
alter table public.asset_files add column if not exists height integer;
alter table public.asset_files add column if not exists created_by uuid references public.profiles(id);
alter table public.store_assets add column if not exists asset_category text not null default 'other' check (asset_category in ('main','scene','a_plus','other'));
alter table public.shared_assets add column if not exists asset_type text not null default 'other';

alter table public.asset_files add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.asset_files drop constraint if exists asset_files_exactly_one_parent;
alter table public.asset_files add constraint asset_files_exactly_one_parent check (num_nonnulls(store_asset_id, shared_asset_id, store_id) = 1);

create table if not exists public.shared_asset_tags (
  shared_asset_id uuid not null references public.shared_assets(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (shared_asset_id, tag_id)
);
alter table public.shared_asset_tags enable row level security;
create policy "authenticated users read shared asset tags" on public.shared_asset_tags for select to authenticated using (true);
create policy "shared owners manage shared tags" on public.shared_asset_tags for all to authenticated using (public.is_admin() or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid())) with check (public.is_admin() or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid()));

drop policy if exists "asset owners manage files" on public.asset_files;
create policy "asset owners manage files" on public.asset_files for all to authenticated using (
  public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()) or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid()) or exists (select 1 from public.stores s where s.id = store_id and s.created_by = auth.uid())
) with check (
  public.is_admin() or exists (select 1 from public.store_assets a where a.id = store_asset_id and a.created_by = auth.uid()) or exists (select 1 from public.shared_assets a where a.id = shared_asset_id and a.created_by = auth.uid()) or exists (select 1 from public.stores s where s.id = store_id and s.created_by = auth.uid())
);
