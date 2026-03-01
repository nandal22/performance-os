-- Goal progress logs: record actual values logged against a goal over time
CREATE TABLE IF NOT EXISTS goal_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  goal_id    UUID REFERENCES goals ON DELETE CASCADE NOT NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  value      DECIMAL(10,2) NOT NULL,
  reps       INTEGER,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE goal_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goal_logs_own" ON goal_logs;
CREATE POLICY "goal_logs_own" ON goal_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
