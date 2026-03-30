const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 靜態檔案
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/fork', require('./routes/fork'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/search', require('./routes/search'));
app.use('/api/slack', require('./routes/slack'));
app.use('/api/models', require('./routes/models'));
app.use('/api/vectors', require('./routes/vectors'));

// 初始化資料庫
async function initDB() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await db.query(schema);
    console.log('✅ 資料庫初始化完成');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.message);
    console.log('請確認 PostgreSQL 是否正在執行，並已建立 gen_ai_chat_db 資料庫。');
    process.exit(1);
  }
}

// 初始化 pgvector（獨立 try/catch，失敗不影響主服務）
async function initVectors() {
  try {
    // 1. 啟用擴充
    await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // 2. 若舊表維度不是 384 則刪掉重建
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_attribute pa
          JOIN pg_class pc ON pa.attrelid = pc.oid
          JOIN pg_type pt ON pa.atttypid = pt.oid
          WHERE pc.relname = 'message_embeddings'
            AND pa.attname = 'embedding'
            AND pt.typname = 'vector'
            AND pa.atttypmod != 384
        ) THEN
          DROP TABLE IF EXISTS message_embeddings;
        END IF;
      END $$
    `);

    // 3. 建表
    await db.query(`
      CREATE TABLE IF NOT EXISTS message_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role VARCHAR(20) NOT NULL,
        content_text TEXT NOT NULL,
        session_id UUID,
        embedding vector(384),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // 4. HNSW 索引
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_message_embeddings_hnsw
        ON message_embeddings USING hnsw (embedding vector_cosine_ops)
    `);

    // 5. 確認版本
    const ext = await db.query(`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    const version = ext.rows[0]?.extversion || '?';
    const idx = await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_message_embeddings_hnsw'`);
    console.log(`✅ pgvector v${version} 已啟用，向量語意搜尋功能正常。`);
    console.log(`   - message_embeddings 表：OK`);
    console.log(`   - HNSW 索引：${idx.rows.length > 0 ? 'OK' : '未建立（搜尋仍可用，但效能較低）'}`);
  } catch (err) {
    console.warn('⚠️  pgvector 未安裝或初始化失敗，向量功能將停用。');
    console.warn(`   原因：${err.message}`);
    console.warn('   安裝方式：https://github.com/pgvector/pgvector');
  }
}

// 啟動伺服器
initDB().then(async () => {
  await initVectors();
  app.listen(PORT, () => {
    console.log(`🚀 伺服器已啟動: http://localhost:${PORT}`);
  });
});
