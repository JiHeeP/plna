-- 기본 습관 데이터
INSERT INTO daily_habits (name, name_en, category, sort_order) VALUES
  ('기상', 'wake_up', 'health', 1),
  ('운동 30분', 'exercise', 'health', 2),
  ('명상 5분', 'meditation', 'health', 3),
  ('연구대회 2시간', 'research', 'career', 4),
  ('코딩', 'coding', 'assets', 5),
  ('대화 기록', 'conversation_log', 'identity', 6),
  ('책 읽기', 'reading', 'identity', 7);

-- 확언 (선언문에서 가져온 것)
INSERT INTO affirmations (text, pillar) VALUES
  ('내 생에 단 하루뿐인 오늘이 시작되었습니다.', 'general'),
  ('나는 불행보다 행복을 선택합니다.', 'general'),
  ('나는 있는 그대로의 나를 받아들이고 인정합니다.', 'identity'),
  ('나는 나만의 속도대로 조용히, 그러나 분명히 나아가고 있습니다.', 'general'),
  ('나는 예상치 못한 순간에도 나의 중심을 지킵니다.', 'general'),
  ('나는 눈 앞에 있는 사람이 나처럼 소중한 사람임을 잊지 않습니다.', 'identity'),
  ('나는 작지만 단단한 걸음을 내딛으며 오늘을 시작하겠습니다.', 'general');

-- 선언문
INSERT INTO affirmations (text, pillar) VALUES
  ('증명하는 실력가로 연구대회 1등급을 받았습니다.', 'career'),
  ('나다운 내가 되어 대화가 더이상 두렵지 않습니다.', 'identity'),
  ('이름을 떠올리면 아는 강사가 되었습니다.', 'assets'),
  ('베스트 드라이버가 되어, 좋은 곳을 다니며 힐링할 수 있었습니다.', 'general');

-- 장기 이정표: 커리어
INSERT INTO milestones (title, pillar, timeframe, status) VALUES
  ('바이브코딩 앱 2종', 'career', '6month', 'in_progress'),
  ('연구대회 입상', 'career', '6month', 'in_progress'),
  ('학생 학력 유의미한 변화', 'career', '6month', 'not_started'),
  ('사회정서학습 분야 도전', 'career', '1year', 'not_started'),
  ('인성연구대회', 'career', '1year', 'not_started'),
  ('장학사 시험 도전', 'career', '3year', 'not_started'),
  ('우수 모델 전국 학교 보급', 'career', '5year', 'not_started'),
  ('소신 있는 교육 행정가', 'career', '10year', 'not_started');

-- 장기 이정표: 나다운 나
INSERT INTO milestones (title, pillar, timeframe, status) VALUES
  ('만능대화소재 30개 누적', 'identity', '6month', 'in_progress'),
  ('스몰토크 수업 매주 참여', 'identity', '6month', 'not_started'),
  ('한달 1회 낯선 모임', 'identity', '6month', 'not_started'),
  ('만능대화소재 60개 누적', 'identity', '1year', 'not_started'),
  ('한달 2회 낯선 모임', 'identity', '1year', 'not_started'),
  ('블로그→온라인 책 쓰기', 'identity', '3year', 'not_started'),
  ('내향인 무료 워크숍', 'identity', '5year', 'not_started'),
  ('내향인 유료 워크숍', 'identity', '10year', 'not_started');

-- 장기 이정표: 자산
INSERT INTO milestones (title, pillar, timeframe, status) VALUES
  ('지샘 강의 2개', 'assets', '6month', 'not_started'),
  ('블로그 주 2회', 'assets', '6month', 'in_progress'),
  ('이웃 250명', 'assets', '6month', 'in_progress'),
  ('지샘 강의 3개', 'assets', '1year', 'not_started'),
  ('이웃 500명', 'assets', '1year', 'not_started'),
  ('월 70만원 부수입', 'assets', '1year', 'not_started'),
  ('갈아타기 아파트 임장', 'assets', '3year', 'not_started'),
  ('연구대회 컨설팅', 'assets', '3year', 'not_started'),
  ('순자산 5억', 'assets', '3year', 'not_started'),
  ('상급지 갈아타기', 'assets', '5year', 'not_started'),
  ('순자산 7억', 'assets', '5year', 'not_started'),
  ('순자산 12억', 'assets', '10year', 'not_started');

-- 수치 목표
INSERT INTO numeric_targets (name, unit, target_value, pillar) VALUES
  ('블로그 이웃', '명', 500, 'assets'),
  ('만능대화소재', '개', 60, 'identity'),
  ('교육용 도구', '개', 12, 'assets'),
  ('월 부수입', '만원', 70, 'assets'),
  ('버피 10분', '개', 150, 'identity'),
  ('낯선 모임', '회', 12, 'identity');

-- 알림 설정 (기본값)
INSERT INTO notification_settings (type, cron_expression, message_template, is_active) VALUES
  ('morning_affirmation', '0 22 * * *', '좋은 아침! 오늘의 확언을 확인하세요.', false),
  ('evening_conversation', '0 13 * * *', '오늘 하루 대화를 기록해보세요.', false);
