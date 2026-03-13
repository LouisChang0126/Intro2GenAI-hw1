const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/fork - 分支對話
router.post('/', async (req, res) => {
  try {
    const { session_id, message_id } = req.body;

    // 取得原始對話標題
    const sessionResult = await db.query('SELECT title FROM sessions WHERE id = $1', [session_id]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: '原始對話不存在' });
    }

    const originalTitle = sessionResult.rows[0].title;

    // 建立新 session
    const newSession = await db.query(
      'INSERT INTO sessions (title) VALUES ($1) RETURNING *',
      [`${originalTitle} (分支)`]
    );
    const newSessionId = newSession.rows[0].id;

    // 取得從第一筆到指定訊息的所有訊息
    const messagesResult = await db.query(
      `SELECT role, content, thinking, tool_call_id, tool_calls, created_at
       FROM messages
       WHERE session_id = $1 AND created_at <= (
         SELECT created_at FROM messages WHERE id = $2
       )
       ORDER BY created_at ASC`,
      [session_id, message_id]
    );

    // 複製所有訊息到新 session
    for (const msg of messagesResult.rows) {
      await db.query(
        `INSERT INTO messages (session_id, role, content, thinking, tool_call_id, tool_calls)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newSessionId, msg.role, msg.content, msg.thinking, msg.tool_call_id, msg.tool_calls]
      );
    }

    res.status(201).json(newSession.rows[0]);
  } catch (err) {
    console.error('Error forking session:', err);
    res.status(500).json({ error: '無法分支對話' });
  }
});

module.exports = router;
