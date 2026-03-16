/* ============================================
   AI Chat Application - Core Frontend Logic
   ============================================ */

// ============ 狀態管理 ============
const state = {
  apiKey: localStorage.getItem('apiKey') || '',
  apiBaseUrl: localStorage.getItem('apiBaseUrl') || '',
  models: JSON.parse(localStorage.getItem('models') || '[]'),
  currentSessionId: null,
  messages: [],
  sessions: [],
  isStreaming: false,
  abortController: null,
};

// ============ MCP 工具註冊表 ============
const mcpTools = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '在網路上搜尋真實資訊，適合查詢最新新聞、事實、知識等',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜尋關鍵字或問題，建議使用英文以獲得更好結果' },
        },
        required: ['query'],
      },
    },
    icon: '🔍',
    handler: async (args) => {
      try {
        // 防呆：LLM 偶爾會傳遞空字串
        if (!args.query || args.query.trim() === '') {
          return JSON.stringify({ error: '搜尋失敗：關鍵字不能為空。請重新調用並提供具體的搜尋關鍵字。' });
        }

        const res = await fetch(`/api/search?q=${encodeURIComponent(args.query)}`);
        const data = await res.json();

        if (!res.ok) {
          // 將 API 錯誤轉化為 LLM 讀得懂的提示
          return JSON.stringify({ error: `搜尋 API 發生錯誤 (${res.status}): ${data.error || '未知錯誤'}。請稍後再試或換個關鍵字。` });
        }
        return JSON.stringify(data);
      } catch (e) {
        return JSON.stringify({ error: `網路請求失敗: ${e.message}。這可能是系統網路問題，請告知用戶無法執行搜尋。` });
      }
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '計算數學表達式',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '數學表達式，例如：2 + 3 * 4' },
        },
        required: ['expression'],
      },
    },
    icon: '🧮',
    handler: async (args) => {
      try {
        const expr = args.expression;

        // 1. 檢查是否包含英文字母 (LLM 常犯錯誤：塞入 Math.pow 或變數)
        if (/[a-zA-Z]/.test(expr)) {
          return JSON.stringify({ error: `計算失敗：你傳入了 '${expr}'。請勿使用英文字母、變數或 Math 函數，只能使用純數字與基本運算符 (+ - * / %)。` });
        }

        // 2. 檢查不支援的運算符號 (LLM 常犯錯誤：使用 ^ 符號表示次方)
        if (expr.includes('^')) {
          return JSON.stringify({ error: `計算失敗：不支援 '^' 符號。若是次方計算，請自行將算式展開 (例如 2^3 改為 2 * 2 * 2)。` });
        }

        // 3. 嚴格過濾非法字元並比對 (避免無聲錯誤)
        const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
        if (expr.replace(/\s/g, '') !== sanitized.replace(/\s/g, '')) {
          return JSON.stringify({ error: `計算失敗：包含無法識別的字元。請修正你的數學表達式 '${expr}'。` });
        }

        const result = Function('"use strict"; return (' + sanitized + ')')();

        // 4. 處理除以零或無效計算
        if (!isFinite(result)) {
          return JSON.stringify({ error: '計算失敗：結果為無窮大或非有效數字（請檢查是否除以零）。' });
        }

        return JSON.stringify({ expression: args.expression, result: result });
      } catch (e) {
        return JSON.stringify({ error: `無法計算此表達式 '${args.expression}'，語法錯誤：${e.message}。請檢查括號是否對稱或運算符是否正確。` });
      }
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '取得目前的日期和時間',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    icon: '🕐',
    handler: async () => {
      const now = new Date();
      return JSON.stringify({
        datetime: now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        timezone: 'Asia/Taipei',
        unix: Math.floor(now.getTime() / 1000),
      });
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_slack_message',
      description: '透過 Slack 傳送訊息到指定頻道。如果未指定頻道，會發送到預設頻道。',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '要發送的訊息內容' },
          channel: { type: 'string', description: '頻道名稱，例如：#general 或 #random（可選，不可留空）' },
        },
        required: ['message'],
      },
    },
    icon: '💬',
    handler: async (args) => {
      try {
        const res = await fetch('/api/slack/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: args.message, channel: args.channel }),
        });
        const data = await res.json();
        if (!res.ok) return JSON.stringify({ error: data.error || 'Slack 發送失敗' });
        return JSON.stringify({ success: true, message: data.message, channel: data.channel });
      } catch (e) {
        return JSON.stringify({ error: `發送失敗: ${e.message}` });
      }
    },
  },
];

// ============ DOM 元素 ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  sidebar: $('#sidebar'),
  sidebarToggle: $('#sidebarToggle'),
  sessionList: $('#sessionList'),
  btnNewChat: $('#btnNewChat'),
  searchInput: $('#searchInput'),
  chatArea: $('#chatArea'),
  welcomeScreen: $('#welcomeScreen'),
  messagesContainer: $('#messagesContainer'),
  messageInput: $('#messageInput'),
  btnSend: $('#btnSend'),
  btnStop: $('#btnStop'),
  topBarTitle: $('#topBarTitle'),
  modelSelect: $('#modelSelect'),
  // Settings Modal
  settingsModal: $('#settingsModal'),
  btnSettings: $('#btnSettings'),
  btnCloseSettings: $('#btnCloseSettings'),
  apiKeyInput: $('#apiKeyInput'),
  apiBaseUrlInput: $('#apiBaseUrlInput'),
  btnToggleApiKey: $('#btnToggleApiKey'),
  btnSaveSettings: $('#btnSaveSettings'),
  btnFetchModels: $('#btnFetchModels'),
  modelTags: $('#modelTags'),
  // Delete Confirm Modal
  deleteConfirmModal: $('#deleteConfirmModal'),
  btnConfirmDelete: $('#btnConfirmDelete'),
  btnCancelDelete: $('#btnCancelDelete'),
  // MCP Modal
  mcpModal: $('#mcpModal'),
  btnMcpTools: $('#btnMcpTools'),
  btnCloseMcp: $('#btnCloseMcp'),
  mcpToolList: $('#mcpToolList'),
};

// ============ 初始化 ============
async function init() {
  // marked.js 設定
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  bindEvents();
  loadSettings();
  renderMcpTools();
  await loadSessions();

  // 如果沒有任何模型，自動開設定多記用戶
  if (state.models.length === 0) {
    dom.settingsModal.classList.remove('hidden');
    showToast('請先在設定中新增模型，才能開始對話');
  } else {
    dom.messageInput.focus();
  }
}

// ============ 事件綁定 ============
function bindEvents() {
  // 側邊欄切換
  dom.sidebarToggle.addEventListener('click', toggleSidebar);

  // 新增對話
  dom.btnNewChat.addEventListener('click', () => createNewSession());

  // 搜尋
  dom.searchInput.addEventListener('input', filterSessions);

  // 訊息輸入
  dom.messageInput.addEventListener('keydown', handleInputKeydown);
  dom.messageInput.addEventListener('input', autoResizeTextarea);

  // 送出
  dom.btnSend.addEventListener('click', sendMessage);
  dom.btnStop.addEventListener('click', stopStreaming);

  // 設定
  dom.btnSettings.addEventListener('click', () => {
    loadSettingsToForm();
    dom.settingsModal.classList.remove('hidden');
  });
  dom.btnCloseSettings.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));
  dom.btnSaveSettings.addEventListener('click', saveSettings);
  dom.btnToggleApiKey.addEventListener('click', toggleApiKeyVisibility);

  // 模型新增
  dom.btnFetchModels.addEventListener('click', fetchModelsFromAPI);

  // MCP
  dom.btnMcpTools.addEventListener('click', () => dom.mcpModal.classList.remove('hidden'));
  dom.btnCloseMcp.addEventListener('click', () => dom.mcpModal.classList.add('hidden'));

  // Delete Confirm Modal
  dom.btnCancelDelete.addEventListener('click', () => dom.deleteConfirmModal.classList.add('hidden'));
  dom.deleteConfirmModal.addEventListener('click', (e) => {
    if (e.target === dom.deleteConfirmModal) dom.deleteConfirmModal.classList.add('hidden');
  });

  // Modal 背景關閉
  dom.settingsModal.addEventListener('click', (e) => {
    if (e.target === dom.settingsModal) dom.settingsModal.classList.add('hidden');
  });
  dom.mcpModal.addEventListener('click', (e) => {
    if (e.target === dom.mcpModal) dom.mcpModal.classList.add('hidden');
  });

  // 歡迎畫面建議
  $$('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dom.messageInput.value = chip.dataset.prompt;
      autoResizeTextarea();
      sendMessage();
    });
  });
}

// ============ 側邊欄 ============
function toggleSidebar() {
  dom.sidebar.classList.toggle('collapsed');
}

// ============ 設定 ============
function loadSettings() {
  // 將 state 讀入後渲染元件
  renderModelSelect();
}

function loadSettingsToForm() {
  dom.apiKeyInput.value = state.apiKey;
  dom.apiBaseUrlInput.value = state.apiBaseUrl;
  renderModelTags();
}

function saveSettings() {
  state.apiKey = dom.apiKeyInput.value.trim();
  state.apiBaseUrl = dom.apiBaseUrlInput.value.trim();
  // models 已在 addModel/removeModel 中即時儲存

  localStorage.setItem('apiKey', state.apiKey);
  localStorage.setItem('apiBaseUrl', state.apiBaseUrl);

  dom.settingsModal.classList.add('hidden');
  showToast('設定已儲存');

  if (state.models.length === 0) {
    showToast('請至少新增一個模型', 'error');
    return;
  }
}

function toggleApiKeyVisibility() {
  const input = dom.apiKeyInput;
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ============ 模型管理 ============
async function fetchModelsFromAPI() {
  const apiKey = dom.apiKeyInput.value.trim();
  const apiBaseUrl = dom.apiBaseUrlInput.value.trim();

  if (!apiKey) {
    showToast('請先填寫 API Key', 'error');
    return;
  }

  const originalText = dom.btnFetchModels.textContent;
  dom.btnFetchModels.textContent = '載入中...';
  dom.btnFetchModels.disabled = true;

  try {
    const res = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiBaseUrl }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '取得模型失敗');
    }

    if (data.models && data.models.length > 0) {
      state.models = data.models;
      localStorage.setItem('models', JSON.stringify(state.models));
      renderModelTags();
      renderModelSelect();
      showToast(`已載入 ${data.models.length} 個模型`);
    } else {
      showToast('API 未回傳任何模型', 'error');
    }
  } catch (err) {
    console.error('Fetch models error:', err);
    showToast(`載入失敗: ${err.message}`, 'error');
  } finally {
    dom.btnFetchModels.textContent = originalText;
    dom.btnFetchModels.disabled = false;
  }
}

function removeModel(name) {
  state.models = state.models.filter((m) => m !== name);
  localStorage.setItem('models', JSON.stringify(state.models));
  renderModelTags();
  renderModelSelect();
}

function renderModelSelect() {
  const select = dom.modelSelect;
  const currentVal = select.value;
  select.innerHTML = '';

  if (state.models.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = '等待模型加入';
    select.appendChild(opt);
    return;
  }

  state.models.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === currentVal) opt.selected = true;
    select.appendChild(opt);
  });

  // 如果之前選的不在新清單內，預設選第一個
  if (!state.models.includes(currentVal)) {
    select.value = state.models[0];
  }
}

function renderModelTags() {
  dom.modelTags.innerHTML = state.models
    .map(
      (name) => `
      <div class="model-tag">
        <span>${escapeHtml(name)}</span>
        <button class="btn-remove-model" onclick="removeModel('${escapeHtml(name)}')" title="移除">&times;</button>
      </div>
    `
    )
    .join('');
}

// ============ Sessions 管理 ============
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    state.sessions = await res.json();
    renderSessions();
  } catch (err) {
    console.error('載入對話失敗:', err);
  }
}

function renderSessions(filter = '') {
  const filtered = filter
    ? state.sessions.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()))
    : state.sessions;

  dom.sessionList.innerHTML = filtered
    .map(
      (session) => `
      <div class="session-item ${session.id === state.currentSessionId ? 'active' : ''}"
           data-id="${session.id}" onclick="selectSession('${session.id}')">
        <span class="session-title">${escapeHtml(session.title)}</span>
        <div class="session-actions">
          <button class="btn-delete-session" onclick="event.stopPropagation(); deleteSession('${session.id}')" title="刪除對話">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

function filterSessions() {
  renderSessions(dom.searchInput.value);
}

async function createNewSession() {
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新對話' }),
    });
    const session = await res.json();
    state.sessions.unshift(session);
    state.currentSessionId = session.id;
    state.messages = [];
    renderSessions();
    renderMessages();
    dom.welcomeScreen.classList.remove('hidden');
    dom.messageInput.focus();
    return session;
  } catch (err) {
    console.error('建立對話失敗:', err);
    showToast('建立對話失敗', 'error');
  }
}

async function selectSession(sessionId) {
  state.currentSessionId = sessionId;
  renderSessions();
  dom.welcomeScreen.classList.add('hidden');

  try {
    const res = await fetch(`/api/sessions/${sessionId}/messages`);
    state.messages = await res.json();
    renderMessages();
    if (state.messages.length === 0) {
      dom.welcomeScreen.classList.remove('hidden');
    }
    scrollToBottom();
  } catch (err) {
    console.error('載入訊息失敗:', err);
    showToast('載入訊息失敗', 'error');
  }

  // 手機版自動收闔側邊欄
  if (window.innerWidth <= 768) {
    dom.sidebar.classList.add('collapsed');
  }
}

async function deleteSession(sessionId) {
  // 顯示自訂確認 Modal  
  dom.deleteConfirmModal.classList.remove('hidden');

  return new Promise((resolve) => {
    // 移除舊的事件（防止重複綁定）
    const newConfirmBtn = dom.btnConfirmDelete.cloneNode(true);
    dom.btnConfirmDelete.replaceWith(newConfirmBtn);
    dom.deleteConfirmModal = $('#deleteConfirmModal');
    dom.btnConfirmDelete = $('#btnConfirmDelete');

    dom.btnConfirmDelete.addEventListener('click', async () => {
      dom.deleteConfirmModal.classList.add('hidden');
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        state.sessions = state.sessions.filter((s) => s.id !== sessionId);
        if (state.currentSessionId === sessionId) {
          state.currentSessionId = null;
          state.messages = [];
          dom.welcomeScreen.classList.remove('hidden');
          dom.messagesContainer.innerHTML = '';
          dom.topBarTitle.textContent = 'AI Chat';
        }
        renderSessions();
        showToast('對話已刪除');
      } catch (err) {
        console.error('刪除對話失敗:', err);
        showToast('刪除對話失敗', 'error');
      }
      resolve();
    }, { once: true });
  });
}

// ============ 訊息渲染 ============
function renderMessages() {
  dom.messagesContainer.innerHTML = '';

  if (state.messages.length === 0) {
    dom.welcomeScreen.classList.remove('hidden');
  } else {
    dom.welcomeScreen.classList.add('hidden');
  }

  let i = 0;
  while (i < state.messages.length) {
    const msg = state.messages[i];

    // tool 訊息已被配對到前一個 assistant tool_calls，跳過獨立渲染
    if (msg.role === 'tool') { i++; continue; }

    // assistant 含 tool_calls：配對後續 tool 訊息，合併為 details 區塊
    if (msg.role === 'assistant' && msg.tool_calls) {
      const toolCalls = typeof msg.tool_calls === 'string'
        ? JSON.parse(msg.tool_calls) : msg.tool_calls;

      // 若 assistant 有實際 content 或 thinking，先渲染文字泡泡
      if ((msg.content && msg.content.trim()) || msg.thinking) {
        appendMessageToDOM(msg, i);
      }

      // 收集後續 tool 結果
      const toolResultsMap = {};
      let j = i + 1;
      while (j < state.messages.length && state.messages[j].role === 'tool') {
        const tr = state.messages[j];
        if (tr.tool_call_id) toolResultsMap[tr.tool_call_id] = tr;
        j++;
      }

      // 每個 tool call 渲染合併 details
      toolCalls.forEach((tc) => {
        const toolResult = toolResultsMap[tc.id];
        appendMergedToolCallToDOM(tc, toolResult);
      });

      i = j;
      continue;
    }

    appendMessageToDOM(msg, i);
    i++;
  }
  scrollToBottom();
}

function renderMessageHtml(msg, index) {
  const roleLabel = msg.role === 'user' ? '你' : 'AI';
  const roleIcon = msg.role === 'user' ? '👤' : '✨';

  let thinkingHtml = '';
  if (msg.thinking) {
    thinkingHtml = `
      <details class="thinking-block">
        <summary>💭 思考過程</summary>
        <div class="thinking-content">${renderMarkdown(msg.thinking)}</div>
      </details>
    `;
  }

  // Fork 按鈕僅在有實際文字內容的 assistant 訊息顯示
  const showFork = msg.role === 'assistant' && msg.content && msg.content.trim();
  const forkHtml = showFork ? `
    <div class="message-actions">
      <button class="btn-fork" onclick="forkFromMessage('${msg.id}')" title="從此處分支對話">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <circle cx="18" cy="6" r="3"></circle>
          <path d="M6 9v6c0 3 6 6 9 6"></path>
          <line x1="6" y1="9" x2="6" y2="6"></line>
        </svg>
        Fork
      </button>
    </div>
  ` : '';

  return `
    <div class="message ${msg.role}" data-id="${msg.id}" data-index="${index}">
      ${forkHtml}
      <div class="message-role">${roleIcon} ${roleLabel}</div>
      ${thinkingHtml}
      <div class="message-content">${renderMarkdown(msg.content)}</div>
    </div>
  `;
}

// 渲染歷史工具調用（call + result 合併為一個 details）
function appendMergedToolCallToDOM(tc, toolResult) {
  const toolName = tc.function?.name || 'unknown';
  const toolDef = mcpTools.find((t) => t.function.name === toolName);
  const icon = toolDef?.icon || '⚙️';

  let argsDisplay = '';
  try { argsDisplay = JSON.stringify(JSON.parse(tc.function?.arguments || '{}'), null, 2); }
  catch { argsDisplay = tc.function?.arguments || ''; }

  let resultHtml = '';
  if (toolResult) {
    let resultDisplay = toolResult.content;
    try { resultDisplay = JSON.stringify(JSON.parse(toolResult.content), null, 2); } catch { }
    resultHtml = `
      <div class="tool-call-section-label">📤 回傳結果</div>
      <pre class="tool-call-result">${escapeHtml(resultDisplay)}</pre>
    `;
  }

  const details = document.createElement('details');
  details.className = 'tool-call-details';
  details.open = false;
  details.innerHTML = `
    <summary class="tool-call-summary">
      <span class="tool-call-status-icon">${toolResult ? '✅' : '⏳'}</span>
      ${icon} <strong>${escapeHtml(toolName)}</strong>
    </summary>
    <div class="tool-call-body">
      <div class="tool-call-section-label">📥 輸入參數</div>
      <pre class="tool-call-result">${escapeHtml(argsDisplay)}</pre>
      ${resultHtml}
    </div>
  `;
  dom.messagesContainer.appendChild(details);
}

// ============ 發送訊息 ============
function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea() {
  const textarea = dom.messageInput;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

async function sendMessage() {
  const content = dom.messageInput.value.trim();
  if (!content || state.isStreaming) return;

  if (!state.apiKey) {
    dom.settingsModal.classList.remove('hidden');
    showToast('請先設定 API Key');
    return;
  }

  // 如果沒有當前 session，先建立一個
  if (!state.currentSessionId) {
    const session = await createNewSession();
    if (!session) return;
  }

  // 清空輸入框
  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  dom.welcomeScreen.classList.add('hidden');

  // 新增使用者訊息
  const userMessage = { role: 'user', content, session_id: state.currentSessionId };
  state.messages.push(userMessage);
  appendMessageToDOM(userMessage, state.messages.length - 1);
  scrollToBottom();

  // 儲存使用者訊息到資料庫
  try {
    const saved = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userMessage),
    });
    const savedMsg = await saved.json();
    userMessage.id = savedMsg.id;
  } catch (err) {
    console.error('儲存訊息失敗:', err);
  }

  // 更新 session 標題（如果是第一則訊息）
  if (state.messages.length === 1) {
    const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    updateSessionTitle(state.currentSessionId, title);
  }

  // 呼叫 AI
  await streamAIResponse();
}

const MAX_TOOL_DEPTH = 10;

async function streamAIResponse(depth = 0) {
  // 防止無限遞迴工具調用
  if (depth > MAX_TOOL_DEPTH) {
    showToast(`工具調用層數達到上限（${MAX_TOOL_DEPTH}次），已自動停止`, 'error');
    return;
  }

  state.isStreaming = true;
  dom.btnSend.classList.add('hidden');
  dom.btnStop.classList.remove('hidden');

  // 準備訊息歷史
  const apiMessages = state.messages
    .filter((m) => ['user', 'assistant', 'tool', 'system'].includes(m.role))
    .map((m) => {
      const msg = { role: m.role, content: m.content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls) {
        msg.tool_calls = typeof m.tool_calls === 'string' ? JSON.parse(m.tool_calls) : m.tool_calls;
      }
      return msg;
    });

  // 取得工具定義
  const tools = mcpTools.map((t) => ({
    type: t.type,
    function: t.function,
  }));

  const model = dom.modelSelect.value;
  if (!model) {
    showToast('請先在設定中新增模型', 'error');
    state.isStreaming = false;
    dom.btnSend.classList.remove('hidden');
    dom.btnStop.classList.add('hidden');
    return;
  }

  // 建立 AI 訊息佔位
  const assistantMessage = {
    role: 'assistant',
    content: '',
    thinking: '',
    tool_calls: null,
    session_id: state.currentSessionId,
  };
  state.messages.push(assistantMessage);
  const msgIndex = state.messages.length - 1;

  // 新增 DOM 佔位
  appendStreamingMessageToDOM();
  scrollToBottom();

  state.abortController = new AbortController();

  try {
    const requestBody = {
      apiKey: state.apiKey,
      apiBaseUrl: state.apiBaseUrl || undefined,
      model,
      messages: apiMessages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    };

    // 禁止並行工具調用，防止一次生成過多 tool call
    if (tools.length > 0) {
      requestBody.parallel_tool_calls = false;
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: state.abortController.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `API 錯誤: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inThinking = false;
    let collectedToolCalls = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // 處理工具調用
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!collectedToolCalls[tc.index]) {
                  collectedToolCalls[tc.index] = {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  };
                }
                if (tc.id) collectedToolCalls[tc.index].id = tc.id;
                if (tc.function?.name) collectedToolCalls[tc.index].function.name += tc.function.name;
                if (tc.function?.arguments) collectedToolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
            continue;
          }

          // 處理內容
          const content = delta.content || '';
          if (!content) continue;

          // 偵測 <think> 標籤
          if (content.includes('<think>')) {
            inThinking = true;
            const afterTag = content.split('<think>')[1] || '';
            assistantMessage.thinking += afterTag;
          } else if (content.includes('</think>')) {
            inThinking = false;
            const beforeTag = content.split('</think>')[0] || '';
            assistantMessage.thinking += beforeTag;
          } else if (inThinking) {
            assistantMessage.thinking += content;
          } else {
            assistantMessage.content += content;
          }

          updateStreamingMessage(assistantMessage);
          scrollToBottom();
        } catch (parseErr) {
          // 解析錯誤忽略
        }
      }
    }

    // 處理工具調用
    if (collectedToolCalls.length > 0) {
      assistantMessage.tool_calls = collectedToolCalls;

      // 移除第一個 streaming 泡泡
      const oldStreaming = document.getElementById('streaming-message');
      if (oldStreaming) {
        if (assistantMessage.content.trim() || assistantMessage.thinking) {
          // 有 content/thinking → finalize 留下文字泡泡
          finalizeStreamingMessage(assistantMessage);
        } else {
          // 空泡泡 → 直接移除，工具調用由 details 塊表示
          oldStreaming.remove();
        }
      }

      await saveMessageToDB(assistantMessage);
      await executeToolCalls(collectedToolCalls, msgIndex, depth);
      return;
    }

    // 儲存 assistant 訊息
    const savedAssistant = await saveMessageToDB(assistantMessage);
    if (savedAssistant) assistantMessage.id = savedAssistant.id;

    // 最終渲染
    finalizeStreamingMessage(assistantMessage);
  } catch (err) {
    if (err.name === 'AbortError') {
      assistantMessage.content += '\n\n*(回覆已停止)*';
      finalizeStreamingMessage(assistantMessage);
    } else {
      console.error('串流錯誤:', err);
      removeStreamingMessage();
      state.messages.pop();
      showToast(`錯誤: ${err.message}`, 'error');
    }
  } finally {
    state.isStreaming = false;
    dom.btnSend.classList.remove('hidden');
    dom.btnStop.classList.add('hidden');
    state.abortController = null;
    dom.messageInput.focus();
  }
}

function stopStreaming() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

// ============ 工具調用 ============
async function executeToolCalls(toolCalls, assistantMsgIndex, depth = 0) {
  for (const tc of toolCalls) {
    const toolName = tc.function.name;
    const toolDef = mcpTools.find((t) => t.function.name === toolName);
    const callId = tc.id || `${toolName}_${Date.now()}`;

    // 顯示工具調用進度（可折疊）
    appendToolCallProgress(toolName, tc.function.arguments, callId);
    scrollToBottom();

    let result;
    if (toolDef && toolDef.handler) {
      try {
        const args = JSON.parse(tc.function.arguments);
        result = await toolDef.handler(args);
      } catch (e) {
        result = JSON.stringify({ error: `工具執行失敗: ${e.message}` });
      }
    } else {
      result = JSON.stringify({ error: `未找到工具: ${toolName}` });
    }

    // 新增 tool message
    const toolMessage = {
      role: 'tool',
      content: result,
      tool_call_id: tc.id,
      session_id: state.currentSessionId,
    };
    state.messages.push(toolMessage);

    // 更新工具進度 UI，完成後折疊
    updateToolCallResult(callId, toolName, result);

    // 儲存到資料庫
    await saveMessageToDB(toolMessage);
  }

  // 再次呼叫 AI 處理工具結果（傳遞深度+1）
  await streamAIResponse(depth + 1);
}

function appendToolCallProgress(toolName, args, callId) {
  const toolDef = mcpTools.find((t) => t.function.name === toolName);
  const icon = toolDef?.icon || '⚙️';

  let argsDisplay = args;
  try { argsDisplay = JSON.stringify(JSON.parse(args), null, 2); } catch { }

  // 工具調用 details 區塊（執行中展開）
  const details = document.createElement('details');
  details.className = 'tool-call-details';
  details.id = `tool-progress-${callId}`;
  details.open = true;
  details.innerHTML = `
    <summary class="tool-call-summary">
      <span class="tool-call-status-icon"><div class="thinking-spinner"></div></span>
      ${icon} <strong>${escapeHtml(toolName)}</strong>
    </summary>
    <div class="tool-call-body">
      <div class="tool-call-section-label">📥 輸入參數</div>
      <pre class="tool-call-result">${escapeHtml(argsDisplay)}</pre>
    </div>
  `;
  dom.messagesContainer.appendChild(details);

  // 執行中顯示「···」等待泡泡
  const waitDiv = document.createElement('div');
  waitDiv.className = 'message assistant tool-waiting';
  waitDiv.id = `tool-wait-${callId}`;
  waitDiv.innerHTML = `
    <div class="message-role">✨ AI</div>
    <div class="message-content">
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  dom.messagesContainer.appendChild(waitDiv);
}

function updateToolCallResult(callId, toolName, result) {
  // 移除「···」等待泡泡
  const waitEl = document.getElementById(`tool-wait-${callId}`);
  if (waitEl) waitEl.remove();

  const el = document.getElementById(`tool-progress-${callId}`);
  if (!el) return;

  const toolDef = mcpTools.find((t) => t.function.name === toolName);
  const icon = toolDef?.icon || '⚙️';

  // 將結果加入 body
  let resultDisplay = result;
  try { resultDisplay = JSON.stringify(JSON.parse(result), null, 2); } catch { }

  const body = el.querySelector('.tool-call-body');
  if (body) {
    const sec = document.createElement('div');
    sec.innerHTML = `
      <div class="tool-call-section-label" style="margin-top:8px">📤 回傳結果</div>
      <pre class="tool-call-result">${escapeHtml(resultDisplay)}</pre>
    `;
    body.appendChild(sec);
  }

  // 更新 summary 為完成狀態
  const summary = el.querySelector('.tool-call-summary');
  if (summary) {
    summary.innerHTML = `
      <span class="tool-call-status-icon">✅</span>
      ${icon} <strong>${escapeHtml(toolName)}</strong>
    `;
  }

  // 折疊
  el.open = false;
}

// ============ DOM 操作 ============
function appendMessageToDOM(msg, index) {
  const container = dom.messagesContainer;
  const html = renderMessageHtml(msg, index);
  container.insertAdjacentHTML('beforeend', html);
}

function appendStreamingMessageToDOM() {
  const container = dom.messagesContainer;
  const div = document.createElement('div');
  div.className = 'message assistant streaming';
  div.id = 'streaming-message';
  div.innerHTML = `
    <div class="message-role">✨ AI</div>
    <div class="thinking-wrapper"></div>
    <div class="message-content">
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  container.appendChild(div);
}

function updateStreamingMessage(msg) {
  const el = document.getElementById('streaming-message');
  if (!el) return;

  // 更新 thinking
  const thinkingWrapper = el.querySelector('.thinking-wrapper');
  if (msg.thinking) {
    thinkingWrapper.innerHTML = `
      <details class="thinking-block" open>
        <summary><div class="thinking-spinner"></div> 思考中...</summary>
        <div class="thinking-content">${renderMarkdown(msg.thinking)}</div>
      </details>
    `;
  }

  // 更新 content
  const contentEl = el.querySelector('.message-content');
  if (msg.content) {
    contentEl.innerHTML = renderMarkdown(msg.content);
  }
  // tool_calls 不在串流泡泡內顯示，由 appendToolCallProgress 處理
}

function finalizeStreamingMessage(msg) {
  const el = document.getElementById('streaming-message');
  if (!el) return;

  el.id = '';
  el.classList.remove('streaming');

  // 最終渲染 thinking
  const thinkingWrapper = el.querySelector('.thinking-wrapper');
  if (msg.thinking) {
    thinkingWrapper.innerHTML = `
      <details class="thinking-block">
        <summary>💭 思考過程</summary>
        <div class="thinking-content">${renderMarkdown(msg.thinking)}</div>
      </details>
    `;
  } else {
    thinkingWrapper.innerHTML = '';
  }

  // 最終渲染 content
  const contentEl = el.querySelector('.message-content');
  contentEl.innerHTML = renderMarkdown(msg.content);

  // 添加 Fork 按鈕
  if (msg.id) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    actionsDiv.innerHTML = `
      <button class="btn-fork" onclick="forkFromMessage('${msg.id}')" title="從此處分支對話">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <circle cx="18" cy="6" r="3"></circle>
          <path d="M6 9v6c0 3 6 6 9 6"></path>
          <line x1="6" y1="9" x2="6" y2="6"></line>
        </svg>
        Fork
      </button>
    `;
    el.insertBefore(actionsDiv, el.firstChild);
  }
}

function removeStreamingMessage() {
  const el = document.getElementById('streaming-message');
  if (el) el.remove();
}

// ============ Fork 功能 ============
async function forkFromMessage(messageId) {
  if (!state.currentSessionId) return;

  try {
    showToast('正在建立分支...');
    const res = await fetch('/api/fork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: state.currentSessionId,
        message_id: messageId,
      }),
    });

    const responseData = await res.json();
    if (!res.ok) {
      throw new Error(responseData.error || 'Server Error');
    }

    // 如果成功，responseData 就是 newSession
    state.sessions.unshift(responseData);
    renderSessions();
    selectSession(responseData.id);
    showToast('分支對話已建立');
  } catch (err) {
    console.error('Fork 失敗:', err);
    showToast('分支對話建立失敗', 'error');
  }
}

// ============ 工具函數 ============
async function saveMessageToDB(msg) {
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    return await res.json();
  } catch (err) {
    console.error('儲存訊息失敗:', err);
    return null;
  }
}

async function updateSessionTitle(sessionId, title) {
  try {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const session = state.sessions.find((s) => s.id === sessionId);
    if (session) session.title = title;
    renderSessions();
  } catch (err) {
    console.error('更新標題失敗:', err);
  }
}

function renderMarkdown(text) {
  if (!text) return '';
  try {
    if (typeof marked !== 'undefined') {
      return marked.parse(text);
    }
  } catch (e) {
    // fallback
  }
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
  });
}

function showToast(message, type = 'info') {
  // 移除已存在的 toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 24px;
    background: ${type === 'error' ? '#dc2626' : '#333'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-family: var(--font-sans);
    z-index: 200;
    animation: fadeIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function renderMcpTools() {
  dom.mcpToolList.innerHTML = mcpTools
    .map(
      (tool) => `
      <div class="mcp-tool-item">
        <span class="mcp-tool-icon">${tool.icon}</span>
        <div class="mcp-tool-info">
          <h3>${escapeHtml(tool.function.name)}</h3>
          <p>${escapeHtml(tool.function.description)}</p>
        </div>
      </div>
    `
    )
    .join('');
}

// ============ 啟動 ============
document.addEventListener('DOMContentLoaded', init);
