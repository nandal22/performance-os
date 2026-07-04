-- Replace generic activity types (strength/cardio/sport/mobility/custom) with
-- the workout categories the user actually trains: Gym, Cult Session
-- (Burn/Strength/HRX), Swimming, Run.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS sub_type TEXT;

-- Drop the old check constraint before backfilling — it only allows the old
-- strength/cardio/sport/mobility/custom values, so writing the new category
-- names while it's still active fails with a check-constraint violation.
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;

-- Backfill existing rows into the new category set.
-- sport/mobility -> gym is a default judgment call; re-tag manually
-- afterward if any of those rows should be swimming/run instead.
UPDATE activities SET type = 'gym' WHERE type IN ('strength', 'custom', 'sport', 'mobility');
UPDATE activities SET type = 'run' WHERE type = 'cardio';

ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('gym', 'cult_session', 'swimming', 'run'));
ALTER TABLE activities ADD CONSTRAINT activities_sub_type_check
  CHECK (sub_type IS NULL OR sub_type IN ('burn', 'strength', 'hrx'));
