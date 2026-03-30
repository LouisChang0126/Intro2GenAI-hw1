const express = require('express');
const router = express.Router();
const db = require('../db');
const { embed } = require('../embedder');

// 檢查 pgvector 是否可用（查 message_embeddings 表是否存在）
async function isPgVectorReady() {
  try {
    await db.query('SELECT 1 FROM message_embeddings LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

// 模型描述 embedding 快取（key: description 文字, value: number[]）
// 伺服器重啟時清空，設定變更時由前端帶新描述觸發重算
const descriptionEmbeddingCache = new Map();

function cosineSimilarity(a, b) {
  // 向量已正規化（normalize: true），dot product = cosine similarity
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

async function getDescriptionEmbedding(description) {
  if (descriptionEmbeddingCache.has(description)) {
    return descriptionEmbeddingCache.get(description);
  }
  const vec = await embed(description);
  descriptionEmbeddingCache.set(description, vec);
  return vec;
}

// POST /api/vectors/store
// body: { text, role, sessionId }
// 使用本地模型產生 embedding 並儲存
router.post('/store', async (req, res) => {
  if (!await isPgVectorReady()) {
    return res.status(503).json({ error: 'pgvector 未啟用' });
  }
  try {
    const { text, role, sessionId } = req.body;
    if (!text) return res.status(400).json({ error: 'text 為必填' });

    const embedding = await embed(text);
    const vectorStr = `[${embedding.join(',')}]`;

    await db.query(
      `INSERT INTO message_embeddings (role, content_text, session_id, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [role || 'user', text, sessionId || null, vectorStr]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Vector store error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vectors/search-sessions
// body: { text, threshold=0.5, limit=3, excludeSessionId }
// pipeline：
//   1. 對 text 取 embedding
//   2. 找相似度 > threshold 的歷史訊息
//   3. 取 Top-limit 個不重複 session
//   4. 撈出每個 session 的完整訊息歷史
// 回傳：{ sessions: [{ sessionId, similarity, messages: [...] }] }
router.post('/search-sessions', async (req, res) => {
  if (!await isPgVectorReady()) {
    return res.json({ sessions: [] }); // 靜默降級，不噴錯
  }
  try {
    const { text, threshold = 0.5, limit = 3, excludeSessionId } = req.body;
    if (!text) return res.status(400).json({ error: 'text 為必填' });

    const embedding = await embed(text);
    const vectorStr = `[${embedding.join(',')}]`;

    // 找相似度 > threshold 的訊息，每個 session 只取最高分的那則
    let simQuery, simParams;
    if (excludeSessionId) {
      simQuery = `
        SELECT DISTINCT ON (session_id)
               session_id,
               1 - (embedding <=> $1::vector) AS similarity
        FROM message_embeddings
        WHERE session_id IS NOT NULL
          AND session_id::text != $2
          AND 1 - (embedding <=> $1::vector) >= $3
        ORDER BY session_id, similarity DESC
        LIMIT $4
      `;
      simParams = [vectorStr, excludeSessionId, threshold, limit * 3];
    } else {
      simQuery = `
        SELECT DISTINCT ON (session_id)
               session_id,
               1 - (embedding <=> $1::vector) AS similarity
        FROM message_embeddings
        WHERE session_id IS NOT NULL
          AND 1 - (embedding <=> $1::vector) >= $2
        ORDER BY session_id, similarity DESC
        LIMIT $3
      `;
      simParams = [vectorStr, threshold, limit * 3];
    }

    const simResult = await db.query(simQuery, simParams);

    // 依相似度排序取 Top-limit 個 session
    const topSessions = simResult.rows
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    if (topSessions.length === 0) {
      return res.json({ sessions: [] });
    }

    // 撈出每個 session 的完整訊息（只取 user + assistant，排除 tool/system）
    const sessions = await Promise.all(
      topSessions.map(async ({ session_id, similarity }) => {
        const msgResult = await db.query(
          `SELECT role, content, created_at
           FROM messages
           WHERE session_id = $1
             AND role IN ('user', 'assistant')
           ORDER BY created_at ASC`,
          [session_id]
        );
        return {
          sessionId: session_id,
          similarity: parseFloat(similarity),
          messages: msgResult.rows,
        };
      })
    );

    res.json({ sessions });
  } catch (err) {
    console.error('Vector search-sessions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vectors/route
// body: { text, models: [{ name, description }] }
// 用 embedding 相似度決定最適合的專家模型，不需要 LLM 呼叫
// 回傳：{ selectedModel, similarity, scores: [{ name, similarity }] }
router.post('/route', async (req, res) => {
  try {
    const { text, models } = req.body;
    if (!text || !models || models.length === 0) {
      return res.status(400).json({ error: 'text 與 models 為必填' });
    }

    const promptVec = await embed(text);

    const scores = await Promise.all(
      models.map(async ({ name, description, compareText }) => {
        // 優先用 compareText（模型名稱），向下相容 description，最終 fallback 到 name
        const textToEmbed = compareText || description || name;
        const descVec = await getDescriptionEmbedding(textToEmbed);
        const similarity = cosineSimilarity(promptVec, descVec);
        return { name, similarity };
      })
    );

    scores.sort((a, b) => b.similarity - a.similarity);
    const best = scores[0];

    console.log('[Router Embedding Scores]:', scores.map(s => `${s.name}: ${s.similarity.toFixed(4)}`).join(', '));
    console.log('[Router Selected]:', best.name, `(similarity: ${best.similarity.toFixed(4)})`);

    res.json({ selectedModel: best.name, similarity: best.similarity, scores });
  } catch (err) {
    console.error('Vector route error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
