-- Add height, age, gender to body_metrics (needed for Mifflin-St Jeor BMR)
-- These change rarely; latest non-null value is used in engine
ALTER TABLE body_metrics
  ADD COLUMN IF NOT EXISTS height DECIMAL(5,2),  -- cm (e.g. 178.5)
  ADD COLUMN IF NOT EXISTS age    INTEGER,        -- years at time of log
  ADD COLUMN IF NOT EXISTS gender TEXT            -- 'male' | 'female'
    CHECK (gender IN ('male', 'female'));
