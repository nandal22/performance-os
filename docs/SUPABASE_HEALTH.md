# Supabase Health Checks

The Settings tab shows a lightweight tracker data health card using normal app permissions. It counts rows visible to the signed-in user and estimates Free-plan runway from those rows. It is intentionally approximate because browser clients should not receive admin database metrics.

Supabase Free currently includes `500 MB` database size and `1 GB` file storage. Use the SQL below in the Supabase SQL editor when you want exact project-level numbers.

## Exact Storage

```sql
select
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_database_size(current_database())                 as database_bytes;
```

```sql
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) as total_size,
  pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)                 as total_bytes
from pg_stat_user_tables
where schemaname = 'public'
order by total_bytes desc;
```

## Tracker Rows

```sql
select 'activities' as table_name, count(*) as rows from public.activities
union all select 'strength_sets', count(*) from public.strength_sets
union all select 'exercises', count(*) from public.exercises
union all select 'cardio_metrics', count(*) from public.cardio_metrics
union all select 'body_metrics', count(*) from public.body_metrics
union all select 'calorie_logs', count(*) from public.calorie_logs
union all select 'daily_steps', count(*) from public.daily_steps
union all select 'quick_foods', count(*) from public.quick_foods
union all select 'guided_workout_drafts', count(*) from public.guided_workout_drafts
order by rows desc;
```

## Cache Hit Ratio

```sql
select
  sum(heap_blks_hit)  as heap_blks_hit,
  sum(heap_blks_read) as heap_blks_read,
  round(
    100 * sum(heap_blks_hit)::numeric /
    nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0),
    2
  ) as cache_hit_percent
from pg_statio_user_tables;
```

## Slow Queries

`pg_stat_statements` must be enabled for this query to return rows.

```sql
select
  calls,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2)  as mean_ms,
  rows,
  left(query, 240)                   as query_sample
from pg_stat_statements
order by mean_exec_time desc
limit 20;
```

## Practical Projection

For this tracker, nearly everything is text/numeric rows: activities, sets, food logs, quick foods, steps, and body metrics. Media is loaded from external URLs and cached in the browser, not uploaded into Supabase Storage. That means the database limit is the meaningful Free-plan constraint, and the file storage limit should stay near zero unless the app later adds photo/video uploads.

At a heavy personal-use pace, even `100` logged rows per day is still likely years of runway before `500 MB`, because each row is small and indexed. The exact SQL above is the source of truth when the app gets large enough for this to matter.
