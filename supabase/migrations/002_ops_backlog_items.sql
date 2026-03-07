-- Ops backlog items for conversation/night-log ingestion
CREATE TABLE IF NOT EXISTS ops_backlog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'night-log',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'promoted', 'done', 'dropped')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, text)
);

CREATE INDEX IF NOT EXISTS idx_ops_backlog_items_date ON ops_backlog_items(date);
