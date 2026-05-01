create table public.page_posts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  unique (page_id, post_id)
);

create index page_posts_page_id_idx on public.page_posts(page_id);
create index page_posts_post_id_idx on public.page_posts(post_id);

alter table public.page_posts enable row level security;

create policy "page_posts_select_all"
  on public.page_posts for select
  to authenticated
  using (true);

create policy "page_posts_insert_admin"
  on public.page_posts for insert
  to authenticated
  with check (
    auth.uid() = shared_by
    and exists (
      select 1 from public.pages p
      where p.id = page_id and p.admin_id = auth.uid()
    )
  );

create policy "page_posts_delete_owner_or_admin"
  on public.page_posts for delete
  to authenticated
  using (
    auth.uid() = shared_by
    or exists (
      select 1 from public.pages p
      where p.id = page_id and p.admin_id = auth.uid()
    )
  );