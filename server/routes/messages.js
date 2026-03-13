const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/sessions/:id/messages - 取得指定對話的所有訊息
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: '無法取得訊息' });
  }
});

// POST /api/messages - 儲存新訊息
router.post('/', async (req, res) => {
  try {
    const { session_id, role, content, thinking, tool_call_id, tool_calls } = req.body;
    const result = await db.query(
      `INSERT INTO messages (session_id, role, content, thinking, tool_call_id, tool_calls)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [session_id, role, content, thinking || null, tool_call_id || null, tool_calls ? JSON.stringify(tool_calls) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving message:', err);
    res.status(500).json({ error: '無法儲存訊息' });
  }
});

module.exports = router;
