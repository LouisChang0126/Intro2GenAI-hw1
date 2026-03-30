// 本地 Embedding 模型（all-MiniLM-L6-v2，384 維）
// 第一次呼叫會自動下載模型（~25MB），之後從快取載入

let _embedder = null;

async function getEmbedder() {
  if (_embedder) return _embedder;
  const { pipeline, env } = await import('@xenova/transformers');
  // 關閉遠端模型查詢，僅從快取/HuggingFace 下載
  env.allowRemoteModels = true;
  console.log('🔄 載入本地 embedding 模型（首次需下載 ~25MB）...');
  _embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✅ Embedding 模型載入完成（all-MiniLM-L6-v2，384 維）');
  return _embedder;
}

async function embed(text) {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

module.exports = { embed, getEmbedder };
