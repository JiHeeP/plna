-- conversation_topics에 상세 메모(content) 컬럼 추가
ALTER TABLE conversation_topics
ADD COLUMN IF NOT EXISTS content TEXT;
