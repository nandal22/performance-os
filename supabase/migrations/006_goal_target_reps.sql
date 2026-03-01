-- Add target_reps to goals for lift-type goals (e.g. "100kg × 3")
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_reps INTEGER;
