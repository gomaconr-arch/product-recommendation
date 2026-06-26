CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  agent_slug TEXT,
  agent_name TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  age INTEGER,
  consent INTEGER NOT NULL DEFAULT 0,
  raw_assessment_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  matching_input_json TEXT NOT NULL,
  recommendation_result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE TABLE IF NOT EXISTS intake_logs (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  request_json TEXT,
  response_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendations_lead_id ON recommendations(lead_id);
CREATE INDEX IF NOT EXISTS idx_intake_logs_lead_id ON intake_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
