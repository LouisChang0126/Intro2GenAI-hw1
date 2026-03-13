# 網頁版 AI 對話介面開發 TODO

## 專案概述

開發一個類似 ChatGPT / Gemini 的 AI 聊天應用，包含前端（原生 HTML, CSS, JavaScript）與輕量級後端（Node.js + Express + PostgreSQL）。具備側邊欄歷史紀錄、自訂 API Key（前端狀態管理）、連續對話、對話分支（Fork）、模型思維折疊功能（Thinking），以及 MCP (Model Context Protocol) 工具調用基礎架構。

## 階段一：資料庫與後端 API 建立 (Node.js & PostgreSQL)

* 初始化 Node.js 專案並安裝必要的套件（如 `express`, `pg`, `cors`, `dotenv`）。
* 在本地 PostgreSQL 建立資料庫（例如 `ai_chat_db`）。
* 設計並建立資料表結構：
* `sessions` 表：儲存對話 Session ID、標題、建立時間。
* `messages` 表：儲存單筆訊息，包含 ID、Session ID、角色（user/assistant）、內容（純文字或 JSON 格式以包含思維過程）、時間戳記。


* 實作 RESTful API 路由：
* `GET /api/sessions`：取得所有對話歷史清單。
* `GET /api/sessions/:id/messages`：取得特定對話的所有訊息。
* `POST /api/sessions`：建立新對話。
* `POST /api/messages`：將新訊息存入資料庫。
* `POST /api/fork`：複製指定的對話上下文並建立新 Session。



## 階段二：前端基礎 UI 佈局 (HTML & CSS)

* 建立前端基礎檔案：`index.html`, `style.css`, `app.js`。
* 實作全螢幕的 Flexbox 或 Grid 版面，劃分為「左側可收闔邊欄」與「右側主對話區」。
* 實作左側邊欄的「收闔/展開」切換按鈕，並加入平滑的 CSS 轉場動畫，上方保留「新增對話」按鈕。
* 右側主區塊分為頂部導覽列、中央滾動對話區，以及底部的輸入框區域。
* 底部輸入框需支援多行輸入（Textarea 自動長高）與 Enter 送出（Shift+Enter 換行）。
* 實作設定 Modal（彈出視窗），提供輸入與儲存 API Key 的欄位（API Key 僅存於前端 `localStorage`，不進資料庫）。
* **新增 UI 元件：** 為模型的「思維過程（Thinking）」設計折疊面板樣式（可使用 `<details>` 和 `<summary>` 標籤，或自訂 CSS 展開/收起動畫），預設為收起狀態，外觀應類似 Gemini 或 DeepSeek 的思考區塊。

## 階段三：狀態管理與資料庫串接 (JavaScript)

* 建立狀態管理物件，儲存目前的 API Key（從 `localStorage` 讀取）、當前開啟的對話 Session ID。
* 網頁載入時，呼叫後端 API (`GET /api/sessions`) 獲取歷史對話並渲染在左側邊欄。
* 點擊邊欄歷史紀錄時，呼叫後端 API 獲取該對話的歷史訊息，並渲染至右側中央區塊。
* 在設定 Modal 中綁定事件，讓使用者可以儲存 API Key。

## 階段四：核心對話功能與思維折疊 (JavaScript)

* 實作發送訊息邏輯：將使用者輸入顯示於畫面，並發送 API 請求給 AI 模型。
* 實作串流解析（Server-Sent Events / Streaming），讓 AI 回覆能像打字機一樣逐字顯示。
* **實作 Thinking 解析邏輯：** * 在解析串流資料時，判斷是否處於「思考中」狀態（例如偵測 `<think>` 標籤，或解析 API 回傳的 specific reasoning payload）。
* 將屬於「思考過程」的文字渲染進剛剛設計的折疊面板（`<details>`）中。
* 將屬於「正式回覆」的文字渲染在折疊面板下方的普通訊息區塊。


* 對話完成後，將完整的上下文（包含使用者的提問、AI 的思考過程與正式回覆）透過 `POST /api/messages` 寫入本地 PostgreSQL 資料庫。

## 階段五：進階功能 - 分支對話 (Fork)

* 在每一則歷史訊息旁，添加一個隱藏（Hover 時顯示）的「Fork 此對話」按鈕。
* 實作 Fork 邏輯：點擊按鈕後，將該筆訊息 ID 與目前的 Session ID 發送給後端 `POST /api/fork` API。
* 後端在資料庫中複製從第一則到該指定訊息的所有紀錄，綁定到新的 Session ID 並回傳。
* 前端接收到新 Session ID 後，在左側邊欄生成一筆新的歷史紀錄，並自動跳轉載入該新對話。

## 階段六：進階功能 - MCP 調用基礎架構

* 實作前端的「工具調用註冊表」，定義可用的 MCP 工具清單（例如：取得天氣、搜尋等假資料函數）。
* 在呼叫 AI API 時，將工具清單依照 API 規範夾帶入請求中。
* 攔截 AI 的回覆：判斷回覆類型是「一般文字」還是「工具調用請求（Tool Call）」。
* 若為工具調用，前端需暫停文字渲染，執行對應的本地 JavaScript 函數，並將執行結果作為 `tool_message` 再次發送給 AI。
* 在對話介面中，針對 MCP 工具調用的過程設計特殊的 UI 提示（例如：「⚙️ 正在呼叫搜尋工具...」），並將此系統狀態的改變也妥善紀錄進資料庫中（可選）。


### 可以參考
https://github.com/open-webui/open-webui
但open-webui偏複雜，這個專案不用這麼複雜