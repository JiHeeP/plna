-- 월간 목표 테이블
CREATE TABLE IF NOT EXISTS monthly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,  -- 'YYYY-MM' 형식 (예: '2026-02')
  text TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('career', 'identity', 'assets')),
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_monthly_goals_month ON monthly_goals(month);
