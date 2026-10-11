-- 습관 체크리스트: 운동 30분 -> 운동 150회, 뉴스 읽기 추가
UPDATE daily_habits SET name = '운동 150회' WHERE name_en = 'exercise';

INSERT INTO daily_habits (name, name_en, category, sort_order)
SELECT '뉴스 읽기', 'news', 'identity',
       COALESCE((SELECT MAX(sort_order) FROM daily_habits), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM daily_habits WHERE name_en = 'news');
