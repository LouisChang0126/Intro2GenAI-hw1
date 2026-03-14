# AI Chat 🤖

一個類似 ChatGPT / Gemini 的 AI 聊天應用，使用原生 HTML、CSS、JavaScript 搭配 Node.js + Express + PostgreSQL 建構。

![Demo Screenshot](docs/screenshot.png)

## ✨ 功能特色

- **串流對話** — Server-Sent Events (SSE) 實現逐字打字機效果
- **思維折疊 (Thinking)** — 自動偵測 `<think>` 標籤，將 AI 思考過程收納至可展開的折疊面板
- **對話分支 (Fork)** — 在任意歷史訊息處建立分支對話，探索不同對話方向
- **MCP 工具調用** — 內建 Model Context Protocol 工具架構，AI 可自動呼叫本地工具
- **歷史紀錄管理** — 側邊欄顯示所有歷史對話，支援搜尋、刪除
- **自訂 API Key** — API Key 僅儲存於瀏覽器 `localStorage`，不經過伺服器
- **深色主題** — 精心設計的深色 UI，搭配平滑動畫與漸層效果
- **Markdown 渲染** — AI 回覆支援完整 Markdown 語法（程式碼區塊、表格、清單等）
- **響應式設計** — 支援桌面與行動裝置

## 🛠️ 技術架構

```
┌─────────────────────────────────────────────────┐
│  Frontend (public/)                             │
│  HTML + CSS + Vanilla JavaScript                │
│  marked.js (Markdown 渲染)                      │
├─────────────────────────────────────────────────┤
│  Backend (server/)                              │
│  Node.js + Express                              │
│  ├── /api/sessions   — 對話管理                  │
│  ├── /api/messages   — 訊息存取                  │
│  ├── /api/chat       — AI API 代理 (SSE 串流)    │
│  └── /api/fork       — 對話分支                  │
├─────────────────────────────────────────────────┤
│  Database                                       │
│  PostgreSQL (sessions + messages 表)             │
└─────────────────────────────────────────────────┘
```

## 📦 安裝與啟動

### 前置需求

- [Node.js](https://nodejs.org/) v18+
- [PostgreSQL](https://www.postgresql.org/) v14+

### 1. 建立資料庫

```sql
CREATE DATABASE gen_ai_chat_db;
CREATE USER gpt_ui WITH PASSWORD 'gpt_ui';
GRANT ALL PRIVILEGES ON DATABASE gen_ai_chat_db TO gpt_ui;
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 設定環境變數

編輯 `.env` 檔案：

```env
PORT=3000
DATABASE_URL=postgresql://gpt_ui:gpt_ui@localhost:5432/gen_ai_chat_db

# Slack Bot 設定（請在 https://api.slack.com/apps 建立 App 並取得 Bot Token）
# 需要的 OAuth Scopes: chat:write
SLACK_BOT_TOKEN=your-slack-bot-token-here
SLACK_DEFAULT_CHANNEL=#general
```

### 4. 啟動伺服器

```bash
node server/index.js
```

伺服器啟動後會自動初始化資料表，開啟瀏覽器前往 **http://localhost:3000** 即可使用。

## 📖 使用說明

1. **設定 API Key 與模型** — 點擊左下角齒輪圖示「設定」，輸入你的 API Key（與 Base URL，若使用 Groq 等相容服務）。點擊「載入 API 可用模型」即可自動獲取並新增模型。
2. **開始對話** — 在底部輸入框輸入訊息，按 Enter 送出（Shift+Enter 換行）。
3. **歷史紀錄** — 左側邊欄自動保存所有對話，點擊可切換。
4. **分支對話** — 將滑鼠移到任意 AI 的回覆訊息上，點擊「Fork」按鈕建立分支。
5. **MCP 工具** — 點擊右上角工具圖示查看可用工具，AI 會在需要時自動呼叫。

## 🔧 MCP 內建工具

| 工具 | 說明 |
|------|------|
| 🔍 `search_web` | 在網路上搜尋真實資訊（整合 Tavily Search API，專為 AI 優化） |
| 🧮 `calculate` | 計算數學表達式 |
| 🕐 `get_current_time` | 取得目前的日期和時間 |
| 💬 `send_slack_message` | 透過 Slack 傳送訊息到指定頻道 |

> **注意：** `search_web` 與 `send_slack_message` 需要在 `.env` 中正確設定對應的 `TAVILY_API_KEY` 與 `SLACK_BOT_TOKEN` 才能成功發送。

## 📁 專案結構

```
hw1/
├── public/                 # 前端靜態檔案
│   ├── index.html          # 主頁面
│   ├── style.css           # 深色主題樣式
│   └── app.js              # 核心前端邏輯
├── server/                 # 後端
│   ├── index.js            # Express 伺服器入口
│   ├── db.js               # PostgreSQL 連線
│   ├── schema.sql          # 資料庫 DDL
│   └── routes/
│       ├── sessions.js     # 對話 CRUD API
│       ├── messages.js     # 訊息 API
│       ├── chat.js         # AI 代理 (SSE)
│       ├── fork.js         # 分支對話 API
│       ├── models.js       # 動態取得 API 模型
│       ├── search.js       # DuckDuckGo 搜尋代理
│       └── slack.js        # Slack 傳訊代理
├── .env                    # 環境變數
├── package.json
└── README.md
```

## 📝 API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/sessions` | 取得所有對話清單 |
| `POST` | `/api/sessions` | 建立新對話 |
| `PUT` | `/api/sessions/:id` | 更新對話標題 |
| `DELETE` | `/api/sessions/:id` | 刪除對話 |
| `GET` | `/api/sessions/:id/messages` | 取得對話訊息 |
| `POST` | `/api/messages` | 儲存新訊息 |
| `POST` | `/api/chat` | AI 對話代理（SSE 串流） |
| `POST` | `/api/fork` | 分支對話 |
| `POST` | `/api/models` | 取得 API 支援的模型清單 |
| `GET` | `/api/search` | 搜尋真實網路資料 |
| `POST` | `/api/slack/send` | 發送 Slack 訊息 |
