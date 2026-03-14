const express = require('express');
const router = express.Router();

// POST /api/chat - 代理 AI API 呼叫（SSE 串流）
router.post('/', async (req, res) => {
  try {
    const { apiKey, apiBaseUrl, model, messages, tools, stream } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: '請先設定 API Key' });
    }

    // 使用前端傳入的 base URL，預設 Groq
    const base = (apiBaseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const apiUrl = `${base}/chat/completions`;

    const requestBody = {
      model: model,
      messages,
      stream: stream !== false,
    };

    // 若有工具定義則加入
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('AI API error:', errorData);
      return res.status(response.status).json({
        error: `AI API 錯誤: ${response.status}`,
        details: errorData,
      });
    }

    if (requestBody.stream) {
      // SSE 串流回傳
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        console.error('Stream error:', streamError);
      } finally {
        res.end();
      }
    } else {
      // 非串流回傳
      const data = await response.json();
      res.json(data);
    }
  } catch (err) {
    console.error('Chat API error:', err);
    res.status(500).json({ error: '伺服器內部錯誤' });
  }
});

module.exports = router;
