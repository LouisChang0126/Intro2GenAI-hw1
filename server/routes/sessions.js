const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/sessions - 取得所有對話
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM sessions ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    res.status(500).json({ error: '無法取得對話清單' });
  }
});

// POST /api/sessions - 建立新對話
router.post('/', async (req, res) => {
  try {
    const { title } = req.body;
    const result = await db.query(
      'INSERT INTO sessions (title) VALUES ($1) RETURNING *',
      [title || '新對話']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: '無法建立對話' });
  }
});

// PUT /api/sessions/:id - 更新對話標題
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const result = await db.query(
      'UPDATE sessions SET title = $1 WHERE id = $2 RETURNING *',
      [title, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '對話不存在' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating session:', err);
    res.status(500).json({ error: '無法更新對話' });
  }
});

// DELETE /api/sessions/:id - 刪除對話
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM sessions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: '無法刪除對話' });
  }
});

module.exports = router;
