-- 분기 목표 테이블
CREATE TABLE IF NOT EXISTS quarterly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter TEXT NOT NULL,  -- '2026-Q1' 형식
  text TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('career', 'identity', 'assets')),
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quarterly_goals_quarter ON quarterly_goals(quarter);

-- 하위목표 테이블
CREATE TABLE IF NOT EXISTS sub_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar TEXT NOT NULL CHECK (pillar IN ('career', 'identity', 'assets')),
  name TEXT NOT NULL,
  positioning TEXT,
  annual_target TEXT,
  quarterly_target TEXT,
  monthly_target TEXT,
  achievement_rate INT NOT NULL DEFAULT 0,
  retrospective TEXT,
  deadline TEXT,
  daily_practice TEXT,
  weekly_practice TEXT,
  monthly_practice TEXT,
  practice_time TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_goals_pillar ON sub_goals(pillar);
