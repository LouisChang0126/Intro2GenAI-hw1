const express = require('express');
const router = express.Router();

// GET /api/search?q=QUERY - 呼叫 Tavily API 取得最佳化給 AI 的搜尋結果
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: '缺少搜尋關鍵字' });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey === 'your-tavily-api-key-here') {
    return res.status(400).json({ error: '尚未設定 TAVILY_API_KEY。請先在 .env 檔案中填入你的 Tavily API Key。' });
  }

  try {
    const url = 'https://api.tavily.com/search';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: 'basic', // 可選 'basic' 或 'advanced'
        include_answer: false, // 我們主要需要回傳結果讓 LLM 閱讀
        include_images: false,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(10000), // 10秒逾時
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Tavily API 錯誤 (${response.status}): ${errorData.detail || '未知錯誤'}`);
    }

    const data = await response.json();
    
    // Tavily 回傳格式: { results: [ { title, url, content, score, ... }, ... ] }
    const results = (data.results || []).map(r => ({
      title: r.title || '無標題',
      url: r.url || '',
      snippet: r.content || ''
    }));

    if (results.length === 0) {
      results.push({
        title: '無搜尋結果',
        snippet: '無法找到相關的網頁結果。',
        url: ''
      });
    }

    res.json({ query: q, results });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: `搜尋失敗: ${err.message}` });
  }
});

module.exports = router;
