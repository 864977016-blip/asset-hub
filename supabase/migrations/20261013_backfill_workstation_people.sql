-- One-time historical attribution by current workstation name. Existing links remain untouched.
begin;

-- Serialize this backfill with personnel creation/rename, without changing team RLS.
lock table public.production_people in share row exclusive mode;

create temp table _workstation_people_names on commit drop as
select id as workstation_id, nullif(btrim(current_user_name), '') as name
from public.workstations;

-- The lock plus DISTINCT/NOT EXISTS prevents concurrent runs from creating duplicate names.
insert into public.production_people (name)
select distinct w.name from _workstation_people_names w
where w.name is not null
  and not exists (select 1 from public.production_people p where btrim(p.name) = w.name);

create temp table _workstation_people_map on commit drop as
select w.workstation_id, w.name, count(p.id)::int as person_count,
       (array_agg(p.id order by p.created_at, p.id) filter (where p.id is not null))[1] as person_id
from _workstation_people_names w
left join public.production_people p on btrim(p.name) = w.name
group by w.workstation_id, w.name;

-- SQL Editor notices identify skipped workstations without adding a permanent audit table.
do $$
declare issue record;
begin
  for issue in select workstation_id, name, person_count from _workstation_people_map
               where name is null or person_count <> 1 order by workstation_id
  loop
    raise notice 'workstation % skipped: name=%, person matches=%',
      issue.workstation_id, coalesce(issue.name, '<empty>'), issue.person_count;
  end loop;
end $$;

insert into public.store_asset_production_people (store_asset_id, production_person_id)
select distinct j.store_asset_id, m.person_id
from public.store_asset_workstations j
join _workstation_people_map m on m.workstation_id = j.workstation_id
where m.person_count = 1
on conflict (store_asset_id, production_person_id) do nothing;

insert into public.shared_asset_production_people (shared_asset_id, production_person_id)
select distinct j.shared_asset_id, m.person_id
from public.shared_asset_workstations j
join _workstation_people_map m on m.workstation_id = j.workstation_id
where m.person_count = 1
on conflict (shared_asset_id, production_person_id) do nothing;

-- Display the actual skipped mappings before committing.
select workstation_id, name, person_count from _workstation_people_map
where name is null or person_count <> 1 order by workstation_id;

commit;
