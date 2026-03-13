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
app.use(express.json({ limit: '10mb' }));

// 靜態檔案
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/fork', require('./routes/fork'));
app.use('/api/chat', require('./routes/chat'));

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

// 啟動伺服器
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 伺服器已啟動: http://localhost:${PORT}`);
  });
});
