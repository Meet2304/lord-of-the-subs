-- Hourly totals for the dashboard, bucketed in the viewer's time zone.
-- Returns one JSON value so PostgREST's row cap cannot truncate a 90-day window.
-- Each bucket is [local_hour, provider, model, events, input, output,
-- cache_read, cache_write, reasoning, partial_events]; local_hour is
-- 'YYYY-MM-DDTHH'. `latest` is the newest occurred_at across all of the
-- caller's rows and uses usage_events_user_occurred_idx.

create or replace function public.usage_buckets(
  start_at timestamptz,
  end_at timestamptz,
  time_zone text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'latest',
    (
      select max(usage_events.occurred_at)
      from public.usage_events
      where usage_events.user_id = (select auth.uid())
    ),
    'buckets',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_array(
            b.local_hour,
            b.provider,
            b.model,
            b.events,
            b.input_tokens,
            b.output_tokens,
            b.cache_read_tokens,
            b.cache_write_tokens,
            b.reasoning_tokens,
            b.partial_events
          )
          order by b.local_hour, b.provider, b.model
        )
        from (
          select
            to_char(
              date_trunc('hour', usage_events.occurred_at at time zone time_zone),
              'YYYY-MM-DD"T"HH24'
            ) as local_hour,
            usage_events.provider,
            usage_events.model,
            count(*)::bigint as events,
            coalesce(sum(usage_events.input_tokens), 0)::bigint as input_tokens,
            coalesce(sum(usage_events.output_tokens), 0)::bigint as output_tokens,
            coalesce(sum(usage_events.cache_read_tokens), 0)::bigint as cache_read_tokens,
            coalesce(sum(usage_events.cache_write_tokens), 0)::bigint as cache_write_tokens,
            coalesce(sum(usage_events.reasoning_tokens), 0)::bigint as reasoning_tokens,
            count(*) filter (where usage_events.confidence = 'partial')::bigint as partial_events
          from public.usage_events
          where usage_events.user_id = (select auth.uid())
            and usage_events.occurred_at >= start_at
            and usage_events.occurred_at < end_at
          group by 1, usage_events.provider, usage_events.model
        ) as b
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.usage_buckets(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.usage_buckets(timestamptz, timestamptz, text) to authenticated;
