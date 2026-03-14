const express = require('express');
const router = express.Router();

// POST /api/models - 取得 API 支援的模型清單
router.post('/', async (req, res) => {
  try {
    const { apiKey, apiBaseUrl } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: '請先設定 API Key' });
    }

    const base = (apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiUrl = `${base}/models`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000), // 10秒 timeout
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fetch models error:', errorData);
      return res.status(response.status).json({
        error: `取得模型清單失敗: ${response.status}`,
        details: errorData,
      });
    }

    const data = await response.json();
    
    // 大多數相容 OpenAI 格式的 API 會回傳 { data: [ { id: 'model-id', ... }, ... ] }
    if (data && Array.isArray(data.data)) {
      const models = data.data.map(m => m.id);
      return res.json({ models });
    } 
    // fallback
    else if (Array.isArray(data)) {
      const models = data.map(m => m.id || m);
      return res.json({ models });
    } else {
      return res.status(500).json({ error: '無法解析模型清單格式' });
    }
  } catch (err) {
    console.error('Models API error:', err);
    res.status(500).json({ error: `伺服器連線錯誤: ${err.message}` });
  }
});

module.exports = router;
