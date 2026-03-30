## 🛠️ Feature 1: 長期記憶 (Long-term Memory)
**概念：** 透過 MCP 工具與 PostgreSQL，賦予 AI 跨對話儲存與讀取使用者偏好、事實的能力。

### 資料庫 (`server/schema.sql`)
- [ ] 建立新的資料表 `memories`：
  ```sql
  CREATE TABLE IF NOT EXISTS memories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) DEFAULT 'default_user',
      key VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE UNIQUE INDEX idx_memories_key ON memories(user_id, key);
  ```

### 後端 API (`server/routes/memory.js` & `server/index.js`)
- [ ] 新增 `server/routes/memory.js`，實作 `/get` 與 `/set` 端點，透過 `server/db.js` 對 `memories` 進行 CRUD。
- [ ] 在 `server/index.js` 中註冊路由：`app.use('/api/memory', require('./routes/memory'));`。

### 前端工具 (`public/app.js`)
- [ ] 在 `mcpTools` 陣列中新增兩個工具：
  1. `store_memory`: 接收 `key` 與 `content`，呼叫 `/api/memory/set` 儲存或更新記憶（例如使用者的名字、開發偏好）。
  2. `retrieve_memory`: 接收 `key`（若空則搜尋全部），呼叫 `/api/memory/get` 提取記憶。
- [ ] 修改初始化或發送訊息的流程，能在對話開始前（或以 System Prompt 形式）自動讀取重要的總結記憶，讓 AI 具備基礎背景知識。

---

## 👁️‍🗨️ Feature 2: 多模態支援與智慧模型路由 (Multimodal & Auto Routing)
**概念：** 重新設計模型設定機制，支援配置「多組」模型。第一組作為「預設模型（大腦）」，負責判斷使用者的 Prompt（包含圖片解析、程式碼或一般問答），並根據其他模型的「模型描述」，自動把任務指派給最適合的模型進行回答。

### 2.1 設定介面與資料結構重構 (`public/index.html`, `public/style.css`, `public/app.js`)
- [ ] **移除舊 UI**：移除上方導覽列 (`.top-bar`) 的 `#modelSelect` 下拉選單。
- [ ] **重構設定 Modal**：將原本單一的 API Key / Base URL 設定，改為「動態新增多組模型資料」的列表 UI。
- [ ] **資料結構設計**：每組模型設定需包含以下欄位：
  - `API Key`
  - `API Base URL`
  - `模型清單` (點擊按鈕從 API 獲取可用模型，並用 `<select>` **下拉選單讓使用者只能單選一個**)
  - `模型描述` (Textarea，讓使用者填寫該模型的專長，例如 "擅長處理圖片" 或 "擅長複雜程式碼")
- [ ] **預設模型限制**：
  - 列表的**第一筆**必須固定標題為「🌟 預設模型 (Router)」。
  - 「預設模型」**不需要且隱藏** `模型描述` 欄位（因為它是負責分派任務的人）。
  - 其他動態新增的模型必須強制填寫 `模型描述`。
- [ ] **LocalStorage**：將儲存結構改為陣列格式 `[{ isDefault: true, apiKey, apiBaseUrl, selectedModel }, { isDefault: false, apiKey, apiBaseUrl, selectedModel, description }, ...]`。

### 2.2 多模態上傳 UI 與資料庫 (`public/index.html`, `server/schema.sql`)
- [ ] **資料庫**：在 `messages` 資料表新增 `attachments JSONB` 欄位。
- [ ] **UI**：在輸入框 (`.input-wrapper`) 旁加入「上傳圖片」按鈕 (`<input type="file" accept="image/*" multiple>`)，並在輸入框上方加入圖片預覽區。
- [ ] **前端讀取**：選擇圖片後，使用 `FileReader` 將圖片轉為 Base64 字串暫存。

### 2.3 智慧路由與多模態發送邏輯 (`public/app.js`, `server/routes/chat.js`)
- [ ] **重構 `sendMessage()` 與 `streamAIResponse()`**：
  - 若有圖片，將 `userMessage.content` 轉為 OpenAI Vision 陣列格式：`[{ "type": "text", "text": "..." }, { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }]`。
- [ ] **實作 Two-Step 路由邏輯 (於 `app.js`)**：
  1. **Step 1 (Routing)**：當使用者送出訊息後，前端先在背景呼叫 `/api/chat` (設定 `stream: false`)，使用「**預設模型**」的配置。
     - *System Prompt 給預設模型*："你是一個智慧路由。請根據使用者的輸入（如果有圖片請考量視覺需求），從以下模型清單選擇最適合的 1 個模型。只能輸出該模型名稱，不要有其他廢話。可用模型：[模型A名稱: 模型A描述], [模型B名稱: 模型B描述]..."。
     - 解析出預設模型選擇的「目標模型名稱」。
  2. **Step 2 (Generation)**：取得目標模型後，使用該**目標模型**對應的 `API Key`, `Base URL` 與 `Model Name`，攜帶原本的歷史紀錄與 Prompt（若有圖片則攜帶 Vision 陣列），再次呼叫 `/api/chat` (設定 `stream: true`) 開始生成回覆。
- [ ] **UI 標示回答者**：在渲染 AI 回覆氣泡 (`renderMessageHtml` 與 `appendStreamingMessageToDOM`) 時，在角色標籤旁動態顯示是哪個模型回答的，例如：`✨ AI (回答者: claude-3-5-sonnet)`。

---

## 🚨 Vibe Coding 開發規範與限制
1. **技術棧限制**：嚴格使用 Vanilla JS（不可使用 React/Vue）、Node.js (Express) 以及 `pg` 模組撰寫原生 SQL。
2. **向下相容性**：確保舊有資料庫中 `content` 為純字串的歷史訊息，在加入 Vision 陣列格式後不會導致前端渲染崩潰。
3. **優雅降級**：如果路由失敗，預設回退使用「預設模型」親自回答；如果目標模型不支援圖片卻被分派到圖片，需妥善 Catch Error 並透過 `showToast` 提示使用者。
4. **UI 風格統一**：設定介面的多組模型列表請沿用 `style.css` 的深色質感（使用 `var(--bg-tertiary)`, `var(--border-color)` 等變數設計卡片式佈局）。