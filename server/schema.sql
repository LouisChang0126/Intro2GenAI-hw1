-- 建立資料庫（需要手動執行）
-- CREATE DATABASE gen_ai_chat_db;

-- 啟用 UUID 擴充
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 對話 Sessions 表
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL DEFAULT '新對話',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 訊息 Messages 表
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content TEXT NOT NULL,
    thinking TEXT,
    tool_call_id VARCHAR(255),
    tool_calls JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 多模態附件欄位（若不存在則新增）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='messages' AND column_name='attachments'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachments JSONB;
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

