-- ============================================================
-- Performance OS - Speech Practice Sessions
-- Isolated daily speech clarity habit logs.
-- Static drills/prompts live in frontend code; this table stores
-- only per-user accountability data.
-- ============================================================

CREATE TABLE IF NOT EXISTS speech_practice_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users NOT NULL,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_drills TEXT[] DEFAULT '{}',
  minutes          INTEGER NOT NULL DEFAULT 8 CHECK (minutes >= 0 AND minutes <= 180),
  clarity_rating   INTEGER CHECK (clarity_rating BETWEEN 1 AND 5),
  pace_rating      INTEGER CHECK (pace_rating BETWEEN 1 AND 5),
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE speech_practice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "speech_practice_sessions_own" ON speech_practice_sessions;
CREATE POLICY "speech_practice_sessions_own" ON speech_practice_sessions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_speech_practice_user_date
  ON speech_practice_sessions(user_id, date DESC);
