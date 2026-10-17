-- Independent production identities; workstation occupants remain unchanged.
create table public.production_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

create trigger production_people_updated_at before update on public.production_people
for each row execute function public.set_updated_at();

create table public.store_asset_production_people (
  store_asset_id uuid not null references public.store_assets(id) on delete cascade,
  production_person_id uuid not null references public.production_people(id) on delete restrict,
  primary key (store_asset_id, production_person_id)
);
create index store_asset_production_people_person_idx on public.store_asset_production_people(production_person_id);

create table public.shared_asset_production_people (
  shared_asset_id uuid not null references public.shared_assets(id) on delete cascade,
  production_person_id uuid not null references public.production_people(id) on delete restrict,
  primary key (shared_asset_id, production_person_id)
);
create index shared_asset_production_people_person_idx on public.shared_asset_production_people(production_person_id);

alter table public.production_people enable row level security;
alter table public.store_asset_production_people enable row level security;
alter table public.shared_asset_production_people enable row level security;

create policy "active members read production people" on public.production_people
for select to authenticated using ((select public.is_active_member()));
create policy "admins create production people" on public.production_people
for insert to authenticated with check ((select public.is_admin()));
create policy "admins update production people" on public.production_people
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "active members read store asset people" on public.store_asset_production_people
for select to authenticated using (
  (select public.is_active_member()) and
  exists (select 1 from public.store_assets where id = store_asset_id)
);
create policy "owners and admins add store asset people" on public.store_asset_production_people
for insert to authenticated with check (
  (select public.is_active_member()) and
  exists (select 1 from public.store_assets where id = store_asset_id and (created_by = auth.uid() or public.is_admin())) and
  exists (select 1 from public.production_people where id = production_person_id and disabled_at is null)
);
create policy "owners and admins remove store asset people" on public.store_asset_production_people
for delete to authenticated using (
  (select public.is_active_member()) and
  exists (select 1 from public.store_assets where id = store_asset_id and (created_by = auth.uid() or public.is_admin()))
);

create policy "active members read shared asset people" on public.shared_asset_production_people
for select to authenticated using (
  (select public.is_active_member()) and
  exists (select 1 from public.shared_assets where id = shared_asset_id)
);
create policy "owners and admins add shared asset people" on public.shared_asset_production_people
for insert to authenticated with check (
  (select public.is_active_member()) and
  exists (select 1 from public.shared_assets where id = shared_asset_id and (created_by = auth.uid() or public.is_admin())) and
  exists (select 1 from public.production_people where id = production_person_id and disabled_at is null)
);
create policy "owners and admins remove shared asset people" on public.shared_asset_production_people
for delete to authenticated using (
  (select public.is_active_member()) and
  exists (select 1 from public.shared_assets where id = shared_asset_id and (created_by = auth.uid() or public.is_admin()))
);

grant select, insert(name), update(name, disabled_at) on public.production_people to authenticated;
grant select, insert, delete on public.store_asset_production_people, public.shared_asset_production_people to authenticated;
