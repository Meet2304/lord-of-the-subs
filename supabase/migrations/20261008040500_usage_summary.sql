create or replace function public.usage_summary(start_at timestamptz, end_at timestamptz)
returns table (
  provider text,
  model text,
  events bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    usage_events.provider,
    usage_events.model,
    count(*)::bigint,
    coalesce(sum(usage_events.input_tokens), 0)::bigint,
    coalesce(sum(usage_events.output_tokens), 0)::bigint,
    coalesce(sum(usage_events.cache_read_tokens), 0)::bigint,
    coalesce(sum(usage_events.cache_write_tokens), 0)::bigint
  from public.usage_events
  where usage_events.user_id = (select auth.uid())
    and usage_events.occurred_at >= start_at
    and usage_events.occurred_at < end_at
  group by usage_events.provider, usage_events.model;
$$;

revoke all on function public.usage_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.usage_summary(timestamptz, timestamptz) to authenticated;
