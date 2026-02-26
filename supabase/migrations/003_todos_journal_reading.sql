-- 1. 매일의 할 일 체크리스트
CREATE TABLE IF NOT EXISTS daily_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_todos_date ON daily_todos(date);

-- 2. 하루 일기 (한 일, 보완점, 잘한 일)
CREATE TABLE IF NOT EXISTS daily_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  accomplishments TEXT NOT NULL DEFAULT '',
  to_improve TEXT NOT NULL DEFAULT '',
  went_well TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_journals_date ON daily_journals(date);

-- 3. 습관에 '책 읽기' 추가
INSERT INTO daily_habits (name, name_en, category, sort_order) VALUES
  ('책 읽기', 'reading', 'identity', 7);
