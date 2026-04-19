// 컨텍스트 메뉴 관리
// - HWP/HWPX 링크 우클릭 → "rhwp로 열기"
// - 편집 영역 우클릭 → AI 표 생성/서식/글작성

import { openViewer } from './viewer-launcher.js';

const MENU_ID = 'rhwp-open-link';
const MENU_AI_TABLE = 'rhwp-ai-table';
const MENU_AI_FORMAT = 'rhwp-ai-format';
const MENU_AI_WRITE = 'rhwp-ai-write';

/**
 * 컨텍스트 메뉴를 등록한다.
 * chrome.runtime.onInstalled 에서 호출.
 */
export function setupContextMenus() {
  // 기존 메뉴 제거 후 재등록 (업데이트 시 중복 방지)
  chrome.contextMenus.removeAll(() => {
    // HWP 링크 열기
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage('contextMenuOpen'),
      contexts: ['link'],
      targetUrlPatterns: [
        '*://*/*.hwp',
        '*://*/*.hwp?*',
        '*://*/*.hwpx',
        '*://*/*.hwpx?*'
      ]
    });

    // AI 어시스턴트 — 표 생성
    chrome.contextMenus.create({
      id: MENU_AI_TABLE,
      title: chrome.i18n.getMessage('aiContextCreateTable') || '표 생성 (AI)',
      contexts: ['page'],
      documentUrlPatterns: [`chrome-extension://${chrome.runtime.id}/*`]
    });

    // AI 어시스턴트 — 서식 적용
    chrome.contextMenus.create({
      id: MENU_AI_FORMAT,
      title: chrome.i18n.getMessage('aiContextFormat') || '서식 적용 (AI)',
      contexts: ['page'],
      documentUrlPatterns: [`chrome-extension://${chrome.runtime.id}/*`]
    });

    // AI 어시스턴트 — 글 작성
    chrome.contextMenus.create({
      id: MENU_AI_WRITE,
      title: chrome.i18n.getMessage('aiContextWrite') || '글 작성 (AI)',
      contexts: ['page'],
      documentUrlPatterns: [`chrome-extension://${chrome.runtime.id}/*`]
    });
  });

  chrome.contextMenus.onClicked.addListener(handleMenuClick);
}

const PROMPTS = {
  [MENU_AI_TABLE]: '세금 계산서 양식 표를 만들어주세요. 5행 4열, 헤더 포함.',
  [MENU_AI_FORMAT]: '선택한 텍스트를 가운데 정렬하고 글자 크기 14pt, 줄간격 160%로 설정해주세요.',
  [MENU_AI_WRITE]: '회의록 양식을 작성해주세요. 제목, 날짜, 참석자, 안건, 결론 항목을 포함하세요.',
};

function handleMenuClick(info, tab) {
  if (info.menuItemId === MENU_ID && info.linkUrl) {
    openViewer({ url: info.linkUrl });
    return;
  }

  // AI 컨텍스트 메뉴 — 프롬프트 저장 후 사이드패널 열기
  if ([MENU_AI_TABLE, MENU_AI_FORMAT, MENU_AI_WRITE].includes(info.menuItemId)) {
    // Service Worker에서는 chrome.storage.local.set 사용 가능
    chrome.storage.local.set({ pendingAiPrompt: PROMPTS[info.menuItemId] }, () => {
      if (tab?.id && chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id });
      }
    });
  }
}
