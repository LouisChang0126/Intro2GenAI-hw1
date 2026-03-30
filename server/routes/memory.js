const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/memory/get?key=xxx  (key 為空則返回全部記憶)
router.get('/get', async (req, res) => {
    try {
        const { key, user_id = 'default_user' } = req.query;
        let result;
        if (key && key.trim() !== '') {
            result = await db.query(
                'SELECT key, content, updated_at FROM memories WHERE user_id = $1 AND key = $2',
                [user_id, key.trim()]
            );
        } else {
            result = await db.query(
                'SELECT key, content, updated_at FROM memories WHERE user_id = $1 ORDER BY updated_at DESC',
                [user_id]
            );
        }
        res.json({ memories: result.rows });
    } catch (err) {
        console.error('Memory get error:', err);
        res.status(500).json({ error: '讀取記憶失敗' });
    }
});

// POST /api/memory/set  body: { key, content, user_id? }
router.post('/set', async (req, res) => {
    try {
        const { key, content, user_id = 'default_user' } = req.body;
        if (!key || !content) {
            return res.status(400).json({ error: 'key 與 content 為必填欄位' });
        }
        await db.query(
            `INSERT INTO memories (user_id, key, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, key)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
            [user_id, key.trim(), content]
        );
        res.json({ success: true, key, message: '記憶已儲存' });
    } catch (err) {
        console.error('Memory set error:', err);
        res.status(500).json({ error: '儲存記憶失敗' });
    }
});

module.exports = router;