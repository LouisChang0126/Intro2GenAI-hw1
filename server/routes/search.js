const express = require('express');
const router = express.Router();

// GET /api/search?q=QUERY - 呼叫 DuckDuckGo API 取得真實搜尋結果
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: '缺少搜尋關鍵字' });

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=gen_ai_chat`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo API 錯誤: ${response.status}`);
    }

    const data = await response.json();
    const results = [];

    // 摘要文字
    if (data.AbstractText) {
      results.push({
        title: data.Heading || q,
        snippet: data.AbstractText,
        url: data.AbstractURL || '',
        source: data.AbstractSource || '',
      });
    }

    // 直接答案（如日期、換算等）
    if (data.Answer) {
      results.unshift({
        title: '直接答案',
        snippet: data.Answer,
        url: '',
        source: 'DuckDuckGo',
      });
    }

    // 相關主題
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= 6) break;
        // RelatedTopics 可能有 Topics 子列表
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (results.length >= 6) break;
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.substring(0, 80),
                snippet: sub.Text,
                url: sub.FirstURL,
                source: '',
              });
            }
          }
        } else if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 80),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: '',
          });
        }
      }
    }

    res.json({ query: q, results });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: `搜尋失敗: ${err.message}` });
  }
});

module.exports = router;
