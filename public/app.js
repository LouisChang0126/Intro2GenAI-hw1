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
      name: 'get_weather',
      description: '取得指定城市的天氣資訊',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名稱，例如：台北' },
        },
        required: ['city'],
      },
    },
    icon: '🌤️',
    handler: async (args) => {
      const weathers = ['晴天 ☀️ 28°C', '多雲 ⛅ 24°C', '陰天 ☁️ 20°C', '小雨 🌧️ 18°C', '雷陣雨 ⛈️ 22°C'];
      const weather = weathers[Math.floor(Math.random() * weathers.length)];
      return JSON.stringify({ city: args.city, weather, humidity: `${50 + Math.floor(Math.random() * 40)}%`, updated: new Date().toLocaleString('zh-TW') });
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: '在網路上搜尋資訊',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜尋關鍵字' },
        },
        required: ['query'],
      },
    },
    icon: '🔍',
    handler: async (args) => {
      return JSON.stringify({
        query: args.query,
        results: [
          { title: `${args.query} - 維基百科`, url: `https://zh.wikipedia.org/wiki/${args.query}`, snippet: `關於 ${args.query} 的詳細介紹...` },
          { title: `${args.query} 的最新資訊`, url: `https://example.com/${args.query}`, snippet: `最新的 ${args.query} 相關新聞和資料...` },
          { title: `如何了解 ${args.query}`, url: `https://example.com/learn/${args.query}`, snippet: `完整的 ${args.query} 學習指南...` },
        ],
      });
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
        // 安全的數學計算（僅允許基本運算）
        const sanitized = args.expression.replace(/[^0-9+\-*/().%\s]/g, '');
        const result = Function('"use strict"; return (' + sanitized + ')')();
        return JSON.stringify({ expression: args.expression, result: result });
      } catch (e) {
        return JSON.stringify({ expression: args.expression, error: '無法計算此表達式' });
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
  modelNameInput: $('#modelNameInput'),
  btnAddModel: $('#btnAddModel'),
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
  dom.btnAddModel.addEventListener('click', addModelFromInput);
  dom.modelNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addModelFromInput(); }
  });

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
function addModelFromInput() {
  const name = dom.modelNameInput.value.trim();
  if (!name) return;
  if (state.models.includes(name)) {
    showToast('模型已存在', 'error');
    return;
  }
  state.models.push(name);
  localStorage.setItem('models', JSON.stringify(state.models));
  dom.modelNameInput.value = '';
  renderModelTags();
  renderModelSelect();
  showToast(`已新增模型：${name}`);
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
    dom.welcomeScreen.classList.add('hidden');
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
  dom.messagesContainer.innerHTML = state.messages
    .map((msg, idx) => renderMessageHtml(msg, idx))
    .join('');
  scrollToBottom();
}

function renderMessageHtml(msg, index) {
  const roleLabel = msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI' : msg.role;
  const roleIcon = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '✨' : '🔧';

  let thinkingHtml = '';
  if (msg.thinking) {
    thinkingHtml = `
      <details class="thinking-block">
        <summary>💭 思考過程</summary>
        <div class="thinking-content">${renderMarkdown(msg.thinking)}</div>
      </details>
    `;
  }

  let toolCallsHtml = '';
  if (msg.tool_calls) {
    const toolCalls = typeof msg.tool_calls === 'string' ? JSON.parse(msg.tool_calls) : msg.tool_calls;
    toolCallsHtml = toolCalls
      .map(
        (tc) => `
        <div class="tool-call-block">
          <div class="tool-call-header">⚙️ 呼叫工具：${escapeHtml(tc.function?.name || tc.name || 'unknown')}</div>
          <div class="tool-call-result">${escapeHtml(JSON.stringify(tc.function?.arguments || tc.arguments, null, 2))}</div>
        </div>
      `
      )
      .join('');
  }

  const contentHtml = msg.role === 'tool'
    ? `<div class="tool-call-block"><div class="tool-call-header">📋 工具回傳結果</div><div class="tool-call-result">${escapeHtml(msg.content)}</div></div>`
    : renderMarkdown(msg.content);

  return `
    <div class="message ${msg.role}" data-id="${msg.id}" data-index="${index}">
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
      <div class="message-role">${roleIcon} ${roleLabel}</div>
      ${thinkingHtml}
      ${toolCallsHtml}
      <div class="message-content">${contentHtml}</div>
    </div>
  `;
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

async function streamAIResponse() {
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
      updateStreamingMessage(assistantMessage);

      // 儲存 assistant 訊息
      await saveMessageToDB(assistantMessage);

      // 執行工具調用
      await executeToolCalls(collectedToolCalls, msgIndex);
      return; // executeToolCalls 會遞迴呼叫 streamAIResponse
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
async function executeToolCalls(toolCalls, assistantMsgIndex) {
  for (const tc of toolCalls) {
    const toolName = tc.function.name;
    const toolDef = mcpTools.find((t) => t.function.name === toolName);

    // 顯示工具調用進度
    appendToolCallProgress(toolName, tc.function.arguments);
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

    // 更新工具進度 UI
    updateToolCallResult(toolName, result);

    // 儲存到資料庫
    await saveMessageToDB(toolMessage);
  }

  // 再次呼叫 AI 處理工具結果
  await streamAIResponse();
}

function appendToolCallProgress(toolName, args) {
  const container = dom.messagesContainer;
  const toolDef = mcpTools.find((t) => t.function.name === toolName);
  const icon = toolDef?.icon || '⚙️';

  const div = document.createElement('div');
  div.className = 'message tool-progress';
  div.id = `tool-progress-${toolName}`;
  div.innerHTML = `
    <div class="tool-call-block">
      <div class="tool-call-header">
        ${icon} 正在呼叫工具：${escapeHtml(toolName)}
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
      <div class="tool-call-result">${escapeHtml(args)}</div>
    </div>
  `;
  container.appendChild(div);
}

function updateToolCallResult(toolName, result) {
  const el = document.getElementById(`tool-progress-${toolName}`);
  if (el) {
    const header = el.querySelector('.tool-call-header');
    const toolDef = mcpTools.find((t) => t.function.name === toolName);
    const icon = toolDef?.icon || '⚙️';
    header.innerHTML = `${icon} 工具回傳：${escapeHtml(toolName)} ✅`;

    const resultEl = el.querySelector('.tool-call-result');
    try {
      resultEl.textContent = JSON.stringify(JSON.parse(result), null, 2);
    } catch {
      resultEl.textContent = result;
    }
  }
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

  // 更新 tool_calls
  if (msg.tool_calls) {
    let toolHtml = msg.tool_calls
      .map(
        (tc) => `
        <div class="tool-call-block">
          <div class="tool-call-header">⚙️ 呼叫工具：${escapeHtml(tc.function?.name || '')}</div>
        </div>
      `
      )
      .join('');
    contentEl.innerHTML = toolHtml + contentEl.innerHTML;
  }
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
    const newSession = await res.json();
    state.sessions.unshift(newSession);
    renderSessions();
    selectSession(newSession.id);
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
