-- PLNA 데이터베이스 스키마
-- Supabase SQL Editor에서 실행하세요

-- 1. 확언 (선언문)
CREATE TABLE IF NOT EXISTS affirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  pillar TEXT NOT NULL DEFAULT 'general' CHECK (pillar IN ('career', 'identity', 'assets', 'general')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 습관 정의
CREATE TABLE IF NOT EXISTS daily_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('career', 'identity', 'assets', 'health')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 습관 기록
CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES daily_habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(habit_id, date)
);

-- 4. 대화 기록
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  partner TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  went_well TEXT NOT NULL DEFAULT '',
  to_improve TEXT NOT NULL DEFAULT '',
  is_imported BOOLEAN NOT NULL DEFAULT false,
  source_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. 만능대화소재
CREATE TABLE IF NOT EXISTS conversation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  category TEXT,
  used_count INT NOT NULL DEFAULT 0,
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. 장기 이정표
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('career', 'identity', 'assets')),
  timeframe TEXT NOT NULL CHECK (timeframe IN ('6month', '1year', '3year', '5year', '10year')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'abandoned')),
  target_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. 수치 목표
CREATE TABLE IF NOT EXISTS numeric_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '개',
  target_value NUMERIC NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('career', 'identity', 'assets')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 수치 기록
CREATE TABLE IF NOT EXISTS numeric_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES numeric_targets(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  value NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. 카카오 토큰 (Phase 4)
CREATE TABLE IF NOT EXISTS kakao_tokens (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT,
  refresh_token TEXT,
  access_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. 알림 설정 (Phase 4)
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  message_template TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversations(date);
CREATE INDEX IF NOT EXISTS idx_numeric_logs_target_date ON numeric_logs(target_id, date);
