-- 주간 목표 테이블 (monthly_goals와 동일 구조, month → week)
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week TEXT NOT NULL,  -- 'YYYY-Www' 형식 (예: '2026-W10')
  text TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('career', 'identity', 'assets')),
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_goals_week ON weekly_goals(week);

-- 주간 회고 테이블 (대시보드 오른쪽 편집 칸)
CREATE TABLE IF NOT EXISTS weekly_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week TEXT NOT NULL UNIQUE,  -- 'YYYY-Www' 형식
  went_well TEXT NOT NULL DEFAULT '',
  to_improve TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reflections_week ON weekly_reflections(week);
