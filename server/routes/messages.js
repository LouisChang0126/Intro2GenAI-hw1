const express = require('express');
const router = express.Router();
const db = require('../db');


// POST /api/messages - 儲存新訊息
router.post('/', async (req, res) => {
  try {
    const { session_id, role, content, thinking, tool_call_id, tool_calls, attachments } = req.body;
    const result = await db.query(
      `INSERT INTO messages (session_id, role, content, thinking, tool_call_id, tool_calls, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        session_id,
        role,
        content,
        thinking || null,
        tool_call_id || null,
        tool_calls ? JSON.stringify(tool_calls) : null,
        attachments ? JSON.stringify(attachments) : null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving message:', err);
    res.status(500).json({ error: '無法儲存訊息' });
  }
});

module.exports = router;
