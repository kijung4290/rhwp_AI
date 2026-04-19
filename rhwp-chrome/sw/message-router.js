// Content Script/Viiewer/사이드패널 ↔ Service Worker 메시지 라우팅
// - Content Script에서 파일 열기 요청
// - 뷰어 탭에서 파일 fetch 요청 (CORS 우회)
// - AI 프록시 요청 (OpenAI API 호출)
// - 설정 조회/저장

import { openViewer } from './viewer-launcher.js';
import { extractThumbnailFromUrl } from './thumbnail-extractor.js';
import { handleAiMessage } from './ai-proxy.js';

async function resolveTargetTabId(message, sender) {
  if (typeof message.tabId === 'number' && message.tabId > 0) {
    return message.tabId;
  }

  if (typeof sender.tab?.id === 'number' && sender.tab.id > 0) {
    return sender.tab.id;
  }

  if (sender.url) {
    const matchingTabs = await chrome.tabs.query({ url: sender.url });
    const matchingTab = matchingTabs.find((tab) => typeof tab.id === 'number' && tab.id > 0);
    if (matchingTab?.id) {
      return matchingTab.id;
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (typeof activeTab?.id === 'number' && activeTab.id > 0) {
    return activeTab.id;
  }

  return null;
}

/**
 * 메시지 라우터를 설정한다.
 */
export function setupMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = messageHandlers[message.type];
    if (handler) {
      const result = handler(message, sender);
      if (result instanceof Promise) {
        result.then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
      }
      sendResponse(result);
    }

    // AI 메시지는 ai-* 접두어로 라우팅
    if (message.type && message.type.startsWith('ai-')) {
      const result = handleAiMessage(message, sender);
      if (result instanceof Promise) {
        result.then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true;
      }
      sendResponse(result);
    }
  });
}

const messageHandlers = {
  /**
   * Content Script → Service Worker: HWP 파일 열기 요청
   */
  'open-hwp': (message) => {
    openViewer({ url: message.url, filename: message.filename });
    return { ok: true };
  },

  /**
   * 뷰어 탭 → Service Worker: CORS 우회 파일 fetch
   * Service Worker의 fetch는 host_permissions에 의해 CORS 제한 없음
   */
  'fetch-file': async (message) => {
    try {
      const response = await fetch(message.url);
      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }
      const buffer = await response.arrayBuffer();
      return { data: Array.from(new Uint8Array(buffer)) };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Content Script → Service Worker: HWP 썸네일 추출
   */
  'extract-thumbnail': async (message) => {
    try {
      const result = await extractThumbnailFromUrl(message.url);
      return result || { error: 'PrvImage not found' };
    } catch (err) {
      return { error: err.message };
    }
  },

  /**
   * Content Script/사이드패널 → Service Worker: 설정 조회
   */
  'get-settings': async () => {
    const settings = await chrome.storage.sync.get({
      autoOpen: true,
      showBadges: true,
      hoverPreview: true,
      aiModel: 'gpt-4o',
      aiApiKey: '',
    });
    return settings;
  },

  /**
   * 사이드패널/options → Service Worker: AI 설정 저장
   */
  'save-ai-settings': async (message) => {
    const { aiModel, aiApiKey } = message;
    await chrome.storage.sync.set({ aiModel, aiApiKey });
    return { ok: true };
  },

  /**
   * 뷰어 탭 → Service Worker: AI 사이드패널 열기
   * chrome.sidePanel.open()은 Service Worker에서만 호출 가능
   */
  'ai-open-panel': async (message, sender) => {
    const prompt = message.prompt;
    if (prompt) {
      await chrome.storage.local.set({ pendingAiPrompt: prompt });
    }
    const tabId = await resolveTargetTabId(message, sender);
    if (tabId && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId });
    } else {
      // fallback: 탭 정보가 없으면 활성 탭에서 열기
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && chrome.sidePanel) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    }
    return { ok: true };
  },
};
