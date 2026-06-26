CREATE TABLE IF NOT EXISTS agents (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL UNIQUE,
  agent_slug TEXT NOT NULL UNIQUE,
  agent_name TEXT NOT NULL,
  assessment_url TEXT NOT NULL,
  is_seeded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

INSERT OR IGNORE INTO agents (
  user_id,
  email,
  password,
  name,
  agent_id,
  agent_slug,
  agent_name,
  assessment_url,
  is_seeded,
  created_at,
  updated_at
) VALUES (
  'agent-richardo',
  'richard.badlisan@gmail.com',
  'richardo',
  'Richard B',
  'richardo',
  'richardo',
  'Richard B',
  'https://assess.lablibre.com/richardo',
  1,
  '2026-06-26T00:00:00.000Z',
  '2026-06-26T00:00:00.000Z'
);
