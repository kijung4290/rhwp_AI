// rhwp AI side panel
// - Sends prompts through the service worker
// - Renders streamed responses
// - Applies parsed actions to the active viewer tab

import { parseAiResponse } from './command-parser.js';
import { PROMPTS, SUGGESTIONS } from './prompt-templates.js';

const $ = (id) => document.getElementById(id);

let chatHistory = [];
let isGenerating = false;
let currentAiContent = '';
let currentRequestId = null;
let lastMessageEl = null;

async function init() {
  const lang = navigator.language.startsWith('ko') ? 'ko' : 'en';
  applyLocale(lang);

  $('panelTitle').textContent = chrome.i18n.getMessage('aiSidePanelTitle');
  $('sugTable').textContent = chrome.i18n.getMessage('aiSuggestionTable');
  $('sugFormat').textContent = chrome.i18n.getMessage('aiSuggestionFormat');
  $('sugWrite').textContent = chrome.i18n.getMessage('aiSuggestionWrite');
  $('sendLabel').textContent = chrome.i18n.getMessage('aiSend');
  $('cancelLabel').textContent = chrome.i18n.getMessage('aiCancel');
  $('executeLabel').textContent = lang === 'ko' ? '적용' : 'Apply';
  $('userInput').placeholder = chrome.i18n.getMessage('aiPlaceholder');

  const settingsBtn = $('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  await refreshApiKeyWarning(lang);

  document.querySelectorAll('.suggestion-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const suggestion = SUGGESTIONS.find((item) => item.id === button.dataset.suggestion);
      if (!suggestion) return;
      $('userInput').value = suggestion.prompt;
      handleSend();
    });
  });

  $('sendBtn').addEventListener('click', handleSend);
  $('cancelBtn').addEventListener('click', handleCancel);
  $('executeBtn').addEventListener('click', handleExecute);

  $('userInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  $('userInput').addEventListener('input', () => {
    $('sendBtn').disabled = !$('userInput').value.trim() || isGenerating;
  });

  chrome.runtime.onMessage.addListener(handleStreamMessage);

  await checkPendingPrompt();
  $('userInput').focus();
}

function applyLocale(lang) {
  document.documentElement.lang = lang;
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function getSettings() {
  const response = await sendRuntimeMessage({ type: 'get-settings' }).catch(() => null);
  return response || { aiModel: 'gpt-4o', aiApiKey: '' };
}

async function refreshApiKeyWarning(lang) {
  const settings = await getSettings();
  const warning = $('apiKeyWarning');
  if (!settings.aiApiKey) {
    warning.style.display = 'flex';
    $('warningText').textContent = chrome.i18n.getMessage('aiErrorNoKey');
    $('openSettings').textContent = lang === 'ko' ? '설정 열기' : 'Open Settings';
  } else {
    warning.style.display = 'none';
  }
}

async function handleSend() {
  const input = $('userInput').value.trim();
  if (!input || isGenerating) return;

  const settings = await getSettings();
  if (!settings.aiApiKey) {
    addMessage('error', chrome.i18n.getMessage('aiErrorNoKey'));
    await refreshApiKeyWarning(document.documentElement.lang || 'en');
    return;
  }

  addMessage('user', input);
  $('userInput').value = '';
  $('sendBtn').disabled = true;

  chatHistory.push({ role: 'user', content: input });

  const promptData = determinePrompt(input);
  currentRequestId = createRequestId();
  currentAiContent = '';
  lastMessageEl = null;
  isGenerating = true;
  showTyping();
  showCancel();

  try {
    const response = await sendRuntimeMessage({
      type: 'ai-chat-stream',
      requestId: currentRequestId,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      messages: promptData.messages,
      temperature: 0.7,
    });

    if (response?.error) {
      if (response.error !== 'cancelled') {
        addMessage('error', response.error);
      }
      resetGenerationState();
      return;
    }

    if (response?.content && !currentAiContent) {
      currentAiContent = response.content;
      finalizeAiMessage(response.content);
    }
  } catch (error) {
    resetGenerationState();
    addMessage('error', error.message || chrome.i18n.getMessage('aiErrorNetwork'));
  }
}

function handleCancel() {
  sendRuntimeMessage({ type: 'ai-cancel' }).catch(() => {});
  resetGenerationState();

  if (currentAiContent) {
    chatHistory.push({ role: 'assistant', content: currentAiContent });
    renderAiMessage(currentAiContent);
    showExecuteIfActions();
  }
}

function handleStreamMessage(message) {
  if (!message || !message.type) return;
  if (message.requestId && currentRequestId && message.requestId !== currentRequestId) return;

  if (message.type === 'ai-stream-delta') {
    currentAiContent = message.fullContent || currentAiContent;
    if (!lastMessageEl) {
      hideTyping();
      lastMessageEl = addMessageRaw('ai');
    }
    renderStreaming(lastMessageEl, currentAiContent);
    return;
  }

  if (message.type === 'ai-stream-done') {
    finalizeAiMessage(message.content || '');
  }
}

function finalizeAiMessage(content) {
  hideTyping();
  hideCancel();
  isGenerating = false;
  currentAiContent = content;
  chatHistory.push({ role: 'assistant', content });

  if (lastMessageEl) {
    renderStreaming(lastMessageEl, content);
  } else {
    renderAiMessage(content);
  }

  lastMessageEl = null;
  currentRequestId = null;
  showExecuteIfActions();
}

function resetGenerationState() {
  hideTyping();
  hideCancel();
  isGenerating = false;
  currentRequestId = null;
  lastMessageEl = null;
}

function determinePrompt(input) {
  const lower = input.toLowerCase();

  if (
    lower.includes('table') ||
    lower.includes('표') ||
    lower.includes('셀') ||
    lower.includes('행') ||
    lower.includes('열')
  ) {
    return PROMPTS.createTable(input);
  }

  if (
    lower.includes('format') ||
    lower.includes('bold') ||
    lower.includes('align') ||
    lower.includes('정렬') ||
    lower.includes('서식') ||
    lower.includes('굵게') ||
    lower.includes('글자')
  ) {
    return PROMPTS.formatDocument(input);
  }

  if (
    lower.includes('write') ||
    lower.includes('text') ||
    lower.includes('문서') ||
    lower.includes('작성') ||
    lower.includes('초안') ||
    lower.includes('문안')
  ) {
    return PROMPTS.writeText(input);
  }

  return PROMPTS.general(input);
}

async function findViewerTab() {
  const viewerUrl = chrome.runtime.getURL('viewer.html');
  const allTabs = await chrome.tabs.query({});
  return allTabs.find((tab) => tab.id && tab.url && tab.url.startsWith(viewerUrl)) || null;
}

async function handleExecute() {
  const actions = parseAiResponse(currentAiContent);
  if (actions.length === 0) {
    addMessage('error', 'AI 응답에서 실행 가능한 JSON 명령을 찾지 못했습니다.');
    return;
  }

  const viewerTab = await findViewerTab();
  if (!viewerTab?.id) {
    addMessage('error', '열려 있는 rhwp 문서를 찾지 못했습니다. 먼저 문서를 연 뒤 다시 시도하세요.');
    return;
  }

  try {
    const response = await sendRuntimeMessage({
      type: 'execute-hwpctl-actions',
      targetTabId: viewerTab.id,
      actions,
    });

    const results = Array.isArray(response?.results) ? response.results : [];
    if (results.length === 0) {
      addMessage('error', response?.message || '문서 적용 결과를 받지 못했습니다.');
      return;
    }

    const successCount = results.filter((result) => result?.success).length;
    const failCount = results.length - successCount;
    addMessage('system', `적용 완료: ${successCount}개 성공${failCount > 0 ? `, ${failCount}개 실패` : ''}`);

    if (failCount > 0) {
      results
        .filter((result) => !result?.success)
        .forEach((result) => addMessage('error', result.message || '알 수 없는 오류'));
    }

    $('executeBtn').style.display = 'none';
    currentAiContent = '';
  } catch (error) {
    addMessage('error', `문서 적용 실패: ${error.message || error}`);
  }
}

function addMessage(type, content) {
  const container = $('chatMessages');
  const msgEl = document.createElement('div');
  msgEl.className = `message message-${type}`;

  const label = document.createElement('div');
  label.className = 'message-label';
  if (type === 'user') label.textContent = 'Me';
  else if (type === 'ai') label.textContent = 'AI';
  else if (type === 'error') label.textContent = '!';
  else label.textContent = 'i';
  msgEl.appendChild(label);

  const contentEl = document.createElement('div');
  contentEl.textContent = content;
  msgEl.appendChild(contentEl);

  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  return msgEl;
}

function addMessageRaw(type) {
  const container = $('chatMessages');
  const msgEl = document.createElement('div');
  msgEl.className = `message message-${type}`;

  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = 'AI';
  msgEl.appendChild(label);

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  msgEl.appendChild(contentEl);

  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  return msgEl;
}

function renderAiMessage(content) {
  const { text, jsonBlocks } = extractJsonBlocks(content);
  const msgEl = addMessage('ai', text);

  for (const block of jsonBlocks) {
    const pre = document.createElement('div');
    pre.className = 'json-block';
    pre.textContent = block;
    msgEl.appendChild(pre);
  }
}

function renderStreaming(msgEl, content) {
  const contentEl = msgEl.querySelector('.message-content');
  if (!contentEl) return;

  const { text, jsonBlocks } = extractJsonBlocks(content);
  contentEl.textContent = text;

  msgEl.querySelectorAll('.json-block').forEach((element) => element.remove());

  for (const block of jsonBlocks) {
    const pre = document.createElement('div');
    pre.className = 'json-block';
    pre.textContent = block;
    msgEl.appendChild(pre);
  }

  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}

function extractJsonBlocks(content) {
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  const blocks = [];
  let text = content;
  let match;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }

  text = text.replace(jsonBlockRegex, '').trim();
  return { text, jsonBlocks: blocks };
}

function showTyping() {
  const existing = document.querySelector('.typing-indicator');
  if (existing) return;

  const container = $('chatMessages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator message-ai';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  document.querySelector('.typing-indicator')?.remove();
}

function showCancel() {
  $('cancelBtn').style.display = 'inline-flex';
  $('sendBtn').style.display = 'none';
}

function hideCancel() {
  $('cancelBtn').style.display = 'none';
  $('sendBtn').style.display = 'inline-flex';
}

function showExecuteIfActions() {
  const actions = parseAiResponse(currentAiContent);
  if (actions.length > 0) {
    $('executeBtn').style.display = 'inline-flex';
  }
}

async function checkPendingPrompt() {
  try {
    const data = await chrome.storage.local.get('pendingAiPrompt');
    if (!data.pendingAiPrompt) return;

    $('userInput').value = data.pendingAiPrompt;
    await chrome.storage.local.remove('pendingAiPrompt');
    $('sendBtn').disabled = false;
    handleSend();
  } catch {
    // Ignore transient storage errors.
  }
}

window.addEventListener('focus', async () => {
  if (!isGenerating && !$('userInput').value.trim()) {
    await checkPendingPrompt();
  }
});

init();
