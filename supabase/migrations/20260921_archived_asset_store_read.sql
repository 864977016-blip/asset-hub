-- Keep historical asset ownership visible after a store is archived.
-- Existing active-store reads and all write policies remain unchanged.
-- Only archived stores still referenced by an asset become readable.
drop policy if exists "authenticated users read archived asset stores" on public.stores;
create policy "authenticated users read archived asset stores"
on public.stores for select to authenticated
using (
  archived_at is not null
  and (
    exists (select 1 from public.store_assets a where a.store_id = stores.id)
    or exists (select 1 from public.shared_asset_stores a where a.store_id = stores.id)
  )
);
