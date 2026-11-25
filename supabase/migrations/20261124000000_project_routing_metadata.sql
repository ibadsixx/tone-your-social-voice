-- Tone — deterministic multi-project routing metadata.
--
-- SOURCE ONLY. This migration has NOT been applied to any live database.
--
-- The existing registry shape can describe one active project per domain, but
-- cannot express which project owns a responsibility, which project is the
-- read/write destination, or which partition a project owns when several
-- projects share a domain. This migration adds only the metadata needed by
-- src/lib/supabase/routing.ts. It does not assign routing values: ownership is
-- intentionally left as explicit configuration so no rule is invented for
-- ambiguous domains.
--
-- The public view projects a fixed allow-list of columns. Service keys, JWT
-- secrets, management tokens and other private columns must never be added.

begin;

alter table public.infrastructure_projects
  add column if not exists responsibility text,
  add column if not exists operation_types text[] not null default '{}',
  add column if not exists read_destination text,
  add column if not exists write_destination text,
  add column if not exists partition_key text;

comment on column public.infrastructure_projects.responsibility is
  'Data responsibility owned by this project (for example: profiles, messages, group_members). Used with domain and operation type to select one project.';
comment on column public.infrastructure_projects.operation_types is
  'Operation types this project is allowed to serve: read, write, sync, auth.';
comment on column public.infrastructure_projects.read_destination is
  'project_key of the project that owns reads for this domain. Null means the project itself may be the read destination.';
comment on column public.infrastructure_projects.write_destination is
  'project_key of the project that owns writes/sync for this domain. Null means the project itself may be the write destination.';
comment on column public.infrastructure_projects.partition_key is
  'Ownership/partition value this project serves within a domain (for example a tenant or region key). When any project in a domain declares a partition key, the resolver requires an exact match; an empty value is not an implicit fallback.';

-- Destination values must name real registry projects. Keep the FKs nullable:
-- a project with no separate destination is its own read/write destination.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'infrastructure_projects_read_destination_fkey'
  ) then
    alter table public.infrastructure_projects
      add constraint infrastructure_projects_read_destination_fkey
      foreign key (read_destination)
      references public.infrastructure_projects (project_key)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'infrastructure_projects_write_destination_fkey'
  ) then
    alter table public.infrastructure_projects
      add constraint infrastructure_projects_write_destination_fkey
      foreign key (write_destination)
      references public.infrastructure_projects (project_key)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists infrastructure_projects_domain_status_priority_idx
  on public.infrastructure_projects (domain, status, priority);
create index if not exists infrastructure_projects_domain_responsibility_idx
  on public.infrastructure_projects (domain, responsibility)
  where responsibility is not null;
create index if not exists infrastructure_projects_domain_partition_idx
  on public.infrastructure_projects (domain, partition_key)
  where partition_key is not null;

-- The frontend reads only this view through the Infrastructure anon key.
-- The new columns are appended so an existing compatible view can be replaced.
create or replace view public.infrastructure_projects_public as
select
  p.project_key,
  p.domain,
  p.project_url,
  p.anon_key,
  p.status,
  p.priority,
  p.region,
  p.health_status,
  p.responsibility,
  p.operation_types,
  p.read_destination,
  p.write_destination,
  p.partition_key
from public.infrastructure_projects p;

grant select on public.infrastructure_projects_public to anon, authenticated;

commit;
