ALTER TABLE leads ADD COLUMN call_done_at TEXT;
ALTER TABLE leads ADD COLUMN new_business_at TEXT;

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  agent_id TEXT,
  selected_product_id TEXT NOT NULL,
  selected_riders_json TEXT NOT NULL DEFAULT '[]',
  coverage_snapshot_json TEXT,
  match_reasoning_snapshot_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  viewed_at TEXT,
  accepted_at TEXT,
  client_acceptance_json TEXT,
  public_share_token TEXT NOT NULL UNIQUE,
  booking_json TEXT,
  booking_sent_at TEXT,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_public_share_token ON proposals(public_share_token);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at);
