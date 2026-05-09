-- ============================================================
-- Performance OS - Drop unused goal and sleep tracking tables
-- Migration: 009_drop_unused_goal_sleep_tables.sql
-- ============================================================
-- Current tracker model keeps daily decisions in Home, Plan, Food,
-- Progress, Settings, and Body Metrics. Goal and sleep screens are no
-- longer routed, so remove their old storage surface.

DROP TABLE IF EXISTS public.goal_logs CASCADE;
DROP TABLE IF EXISTS public.goals CASCADE;
DROP TABLE IF EXISTS public.sleep_logs CASCADE;
