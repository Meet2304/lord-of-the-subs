-- Applied to the lord-of-the-subs project (lskthkcuiabrrmaxvccy).

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  provider text not null check (provider in ('anthropic', 'openai', 'cursor')),
  surface text not null,
  model text not null,
  occurred_at timestamptz not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  source text not null,
  confidence text not null default 'exact' check (confidence in ('exact', 'partial')),
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index usage_events_user_occurred_idx
  on public.usage_events (user_id, occurred_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'cursor')),
  label text not null,
  amount_cents integer not null check (amount_cents >= 0),
  cadence text not null check (cadence in ('monthly', 'annual')),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index subscriptions_user_idx on public.subscriptions (user_id);

alter table public.usage_events enable row level security;
alter table public.subscriptions enable row level security;

create policy "usage_events_owner"
  on public.usage_events
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "subscriptions_owner"
  on public.subscriptions
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.usage_events from anon, public;
revoke all on public.subscriptions from anon, public;
grant select, insert, update, delete on public.usage_events to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
