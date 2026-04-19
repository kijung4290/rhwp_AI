import { executeHwpCtlActions } from '@/hwpctl/ai-bridge';

type AiMode =
  | 'general'
  | 'table'
  | 'format'
  | 'write'
  | 'report-draft'
  | 'report-outline'
  | 'rewrite-selection'
  | 'continue-selection'
  | 'fill-template';

type AiDialogOptions = {
  prompt?: string;
  mode?: AiMode;
  contextText?: string;
};

type AiSettings = { aiApiKey?: string; aiModel?: string };
type AiAction = Record<string, unknown>;
type ModePresentation = {
  title: string;
  hint: string;
  placeholder: string;
};

const SYSTEM_PROMPT = `You are an AI assistant for editing HWP documents in rhwp.

Return the answer as a JSON array wrapped in a \`\`\`json code block.
You may add one short Korean sentence before the JSON block, but no extra prose.

Supported actions:
- replace-selection: { "type": "replace-selection", "text": string }
- insert-text: { "type": "insert-text", "text": string }
- insert-paragraph: { "type": "insert-paragraph" }
- insert-page-break: { "type": "insert-page-break" }
- insert-tab: { "type": "insert-tab" }
- char-shape: { "type": "char-shape", "bold"?: boolean, "italic"?: boolean, "underline"?: boolean, "fontSize"?: number, "fontName"?: string, "textColor"?: string }
- para-shape: { "type": "para-shape", "align"?: number, "lineSpacing"?: number, "spaceBefore"?: number, "spaceAfter"?: number, "indentLeft"?: number, "indentRight"?: number, "firstLineIndent"?: number }
- write-table: { "type": "write-table", "rows": number, "cols": number, "cells": [{ "row": number, "col": number, "text": string }] }
- write-formatted-text: { "type": "write-formatted-text", "text": string, "format"?: object, "paraFormat"?: object }
- write-bullet-list: { "type": "write-bullet-list", "items": string[] }
- write-numbered-list: { "type": "write-numbered-list", "items": string[] }

Rules:
1. Cell coordinates are zero-based.
2. Use write-table when the user asks to create a new table.
3. Use replace-selection only when the request is about rewriting or replacing the selected block.
4. For report requests, prefer a clear structure such as title, background, status, issues, plan, and conclusion.
5. For outline requests, prefer write-numbered-list or short numbered paragraphs rather than a dense text block.
6. Use practical formatting only when it improves readability immediately.
7. Keep the actions ready to apply in the current document without further editing.`;

const MODE_META: Record<AiMode, ModePresentation> = {
  general: {
    title: 'AI 문서 도우미',
    hint: '문서 초안 작성, 선택 내용 수정, 보고서 정리, 양식 채우기를 한 번에 처리할 수 있습니다.',
    placeholder: '예: 현재 내용을 보고서 형식으로 정리해줘',
  },
  table: {
    title: 'AI 표 작성',
    hint: '행과 열이 있는 표를 만들고 예시 데이터까지 채우는 요청에 적합합니다.',
    placeholder: '예: 5행 4열 표를 만들고 항목, 목표, 실적, 비고를 채워줘',
  },
  format: {
    title: 'AI 서식 정리',
    hint: '현재 문단이나 커서 위치 기준으로 정렬, 줄간격, 강조 같은 서식을 정리합니다.',
    placeholder: '예: 현재 문단을 보고서 본문처럼 양쪽 정렬과 줄간격 160%로 맞춰줘',
  },
  write: {
    title: 'AI 문서 초안',
    hint: '회의록, 공지, 안내문처럼 일반 문서를 빠르게 초안 작성할 때 사용합니다.',
    placeholder: '예: 회의록 초안을 작성해줘',
  },
  'report-draft': {
    title: 'AI 보고서 초안',
    hint: '보고서 구조에 맞춰 제목, 배경, 현황, 문제점, 추진 계획, 결론을 정리합니다.',
    placeholder: '예: 현재 메모를 업무보고서 형식으로 정리해줘',
  },
  'report-outline': {
    title: 'AI 번호 개요',
    hint: '복잡한 메모를 1. 2. 3. 번호 개요 형식으로 압축해 정리합니다.',
    placeholder: '예: 현재 내용을 번호 개요로 바꿔줘',
  },
  'rewrite-selection': {
    title: 'AI 선택 내용 수정',
    hint: '선택한 문장을 더 자연스럽고 정확한 표현으로 다듬습니다.',
    placeholder: '예: 선택한 내용을 공문체로 다듬어줘',
  },
  'continue-selection': {
    title: 'AI 선택 내용 이어쓰기',
    hint: '선택한 내용의 문맥을 유지하면서 다음 문단까지 자연스럽게 이어 씁니다.',
    placeholder: '예: 선택한 내용을 바탕으로 결론까지 이어서 작성해줘',
  },
  'fill-template': {
    title: 'AI 양식 채우기',
    hint: '현재 양식의 제목과 구조를 유지하면서 필요한 내용을 채워 넣습니다.',
    placeholder: '예: 현재 양식에 분기 실적 내용을 채워줘',
  },
};

export class InlineAiDialog {
  private overlay: HTMLDivElement | null = null;
  private titleEl!: HTMLDivElement;
  private hintEl!: HTMLDivElement;
  private promptInput!: HTMLTextAreaElement;
  private contextInfo!: HTMLDivElement;
  private resultText!: HTMLDivElement;
  private jsonText!: HTMLPreElement;
  private statusText!: HTMLDivElement;
  private generateButton!: HTMLButtonElement;
  private applyButton!: HTMLButtonElement;
  private currentMode: AiMode = 'general';
  private currentContent = '';
  private contextText = '';

  open(options: AiDialogOptions = {}) {
    this.currentMode = options.mode || 'general';
    this.contextText = (options.contextText || '').trim();
    this.ensureBuilt();
    this.currentContent = '';

    const meta = MODE_META[this.currentMode];
    this.titleEl.textContent = meta.title;
    this.hintEl.textContent = meta.hint;
    this.promptInput.placeholder = meta.placeholder;
    this.promptInput.value = options.prompt || getDefaultPrompt(this.currentMode);
    this.resultText.textContent = '';
    this.jsonText.textContent = '';
    this.statusText.textContent = '';
    this.applyButton.disabled = true;
    this.contextInfo.textContent = this.contextText
      ? `문서 컨텍스트\n${truncateText(this.contextText, 260)}`
      : '현재 커서 위치 또는 문서의 문맥을 기준으로 AI 작업을 수행합니다.';

    if (!this.overlay?.isConnected) {
      document.body.appendChild(this.overlay!);
    }

    queueMicrotask(() => this.promptInput.focus());
  }

  private ensureBuilt() {
    if (this.overlay) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15, 23, 42, 0.28)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';

    const panel = document.createElement('div');
    panel.style.width = 'min(760px, calc(100vw - 48px))';
    panel.style.maxHeight = 'calc(100vh - 48px)';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '12px';
    panel.style.padding = '18px';
    panel.style.borderRadius = '14px';
    panel.style.background = '#ffffff';
    panel.style.boxShadow = '0 28px 70px rgba(15, 23, 42, 0.25)';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.justifyContent = 'space-between';

    this.titleEl = document.createElement('div');
    this.titleEl.style.fontSize = '18px';
    this.titleEl.style.fontWeight = '700';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '닫기';
    closeButton.style.border = 'none';
    closeButton.style.background = '#eef2ff';
    closeButton.style.color = '#1e293b';
    closeButton.style.padding = '8px 12px';
    closeButton.style.borderRadius = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.addEventListener('click', () => this.close());

    titleRow.appendChild(this.titleEl);
    titleRow.appendChild(closeButton);

    this.hintEl = document.createElement('div');
    this.hintEl.style.fontSize = '13px';
    this.hintEl.style.color = '#475569';

    this.contextInfo = document.createElement('div');
    this.contextInfo.style.padding = '10px 12px';
    this.contextInfo.style.borderRadius = '10px';
    this.contextInfo.style.background = '#f8fafc';
    this.contextInfo.style.border = '1px solid #e2e8f0';
    this.contextInfo.style.color = '#334155';
    this.contextInfo.style.fontSize = '12px';
    this.contextInfo.style.whiteSpace = 'pre-wrap';

    this.promptInput = document.createElement('textarea');
    this.promptInput.rows = 5;
    this.promptInput.style.width = '100%';
    this.promptInput.style.resize = 'vertical';
    this.promptInput.style.padding = '14px';
    this.promptInput.style.borderRadius = '12px';
    this.promptInput.style.border = '1px solid #cbd5e1';
    this.promptInput.style.fontSize = '14px';
    this.promptInput.style.lineHeight = '1.5';
    this.promptInput.style.boxSizing = 'border-box';

    this.statusText = document.createElement('div');
    this.statusText.style.minHeight = '20px';
    this.statusText.style.fontSize = '13px';
    this.statusText.style.color = '#334155';

    const resultWrap = document.createElement('div');
    resultWrap.style.display = 'grid';
    resultWrap.style.gridTemplateColumns = '1fr';
    resultWrap.style.gap = '10px';
    resultWrap.style.minHeight = '220px';

    this.resultText = document.createElement('div');
    this.resultText.style.padding = '14px';
    this.resultText.style.border = '1px solid #e2e8f0';
    this.resultText.style.borderRadius = '12px';
    this.resultText.style.background = '#f8fafc';
    this.resultText.style.whiteSpace = 'pre-wrap';
    this.resultText.style.overflow = 'auto';

    this.jsonText = document.createElement('pre');
    this.jsonText.style.margin = '0';
    this.jsonText.style.padding = '14px';
    this.jsonText.style.border = '1px solid #e2e8f0';
    this.jsonText.style.borderRadius = '12px';
    this.jsonText.style.background = '#0f172a';
    this.jsonText.style.color = '#e2e8f0';
    this.jsonText.style.whiteSpace = 'pre-wrap';
    this.jsonText.style.overflow = 'auto';
    this.jsonText.style.maxHeight = '240px';

    resultWrap.appendChild(this.resultText);
    resultWrap.appendChild(this.jsonText);

    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.justifyContent = 'flex-end';
    buttonRow.style.gap = '10px';

    this.generateButton = document.createElement('button');
    this.generateButton.type = 'button';
    this.generateButton.textContent = '생성';
    this.generateButton.style.padding = '10px 16px';
    this.generateButton.style.border = 'none';
    this.generateButton.style.borderRadius = '10px';
    this.generateButton.style.background = '#2563eb';
    this.generateButton.style.color = '#ffffff';
    this.generateButton.style.cursor = 'pointer';
    this.generateButton.addEventListener('click', () => void this.handleGenerate());

    this.applyButton = document.createElement('button');
    this.applyButton.type = 'button';
    this.applyButton.textContent = '문서에 적용';
    this.applyButton.style.padding = '10px 16px';
    this.applyButton.style.border = 'none';
    this.applyButton.style.borderRadius = '10px';
    this.applyButton.style.background = '#0f766e';
    this.applyButton.style.color = '#ffffff';
    this.applyButton.style.cursor = 'pointer';
    this.applyButton.disabled = true;
    this.applyButton.addEventListener('click', () => this.handleApply());

    buttonRow.appendChild(this.generateButton);
    buttonRow.appendChild(this.applyButton);

    panel.appendChild(titleRow);
    panel.appendChild(this.hintEl);
    panel.appendChild(this.contextInfo);
    panel.appendChild(this.promptInput);
    panel.appendChild(this.statusText);
    panel.appendChild(resultWrap);
    panel.appendChild(buttonRow);
    overlay.appendChild(panel);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        this.close();
      }
    });

    this.promptInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }

      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.handleGenerate();
      }
    });

    this.overlay = overlay;
  }

  private close() {
    this.overlay?.remove();
  }

  private async handleGenerate() {
    const input = this.promptInput.value.trim();
    if (!input) {
      this.setStatus('요청 내용을 입력해 주세요.', true);
      return;
    }

    const settings = await this.getSettings();
    if (!settings.aiApiKey) {
      this.setStatus('OpenAI API 키가 설정되어 있지 않습니다. 확장 프로그램 설정에서 먼저 입력해 주세요.', true);
      return;
    }

    this.generateButton.disabled = true;
    this.applyButton.disabled = true;
    this.resultText.textContent = '';
    this.jsonText.textContent = '';
    this.setStatus('AI 생성 중입니다...', false);

    try {
      const response = await this.sendRuntimeMessage({
        type: 'ai-chat',
        apiKey: settings.aiApiKey,
        model: settings.aiModel || 'gpt-4o',
        messages: buildPromptMessages(input, this.currentMode, this.contextText),
        temperature: 0.4,
      });

      if (response?.error) {
        this.setStatus(String(response.error), true);
        return;
      }

      this.currentContent = String(response?.content || '');
      const { text, jsonBlocks } = extractJsonBlocks(this.currentContent);
      const actions = parseAiResponse(this.currentContent);

      this.resultText.textContent = text || '(설명 텍스트 없음)';
      this.jsonText.textContent = jsonBlocks.join('\n\n') || this.currentContent;
      this.applyButton.disabled = actions.length === 0;

      if (actions.length === 0) {
        this.setStatus('생성은 완료됐지만 적용 가능한 JSON 액션을 찾지 못했습니다.', true);
        return;
      }

      this.setStatus('생성이 완료됐습니다. 내용을 확인한 뒤 문서에 적용해 주세요.', false);
    } catch (error: any) {
      this.setStatus(error?.message || 'AI 요청 중 오류가 발생했습니다.', true);
    } finally {
      this.generateButton.disabled = false;
    }
  }

  private handleApply() {
    const actions = parseAiResponse(this.currentContent);
    if (actions.length === 0) {
      this.setStatus('적용할 JSON 액션을 찾지 못했습니다.', true);
      return;
    }

    const results = executeHwpCtlActions(actions);
    const successCount = results.filter((result) => result.success).length;
    const failCount = results.length - successCount;

    if (failCount > 0) {
      const firstFailure = results.find((result) => !result.success);
      this.setStatus(
        `적용 완료: ${successCount}개 성공, ${failCount}개 실패. ${firstFailure?.message || ''}`.trim(),
        true,
      );
      return;
    }

    this.setStatus(`적용 완료: ${successCount}개 액션을 문서에 반영했습니다.`, false);
  }

  private async getSettings(): Promise<AiSettings> {
    return (await this.sendRuntimeMessage({ type: 'get-settings' }).catch(() => ({}))) as AiSettings;
  }

  private sendRuntimeMessage(message: Record<string, unknown>) {
    return new Promise<any>((resolve, reject) => {
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

  private setStatus(message: string, isError: boolean) {
    this.statusText.textContent = message;
    this.statusText.style.color = isError ? '#b91c1c' : '#334155';
  }
}

function getDefaultPrompt(mode: AiMode) {
  switch (mode) {
    case 'table':
      return '5행 4열 표를 만들어줘. 헤더와 예시 데이터도 함께 채워줘.';
    case 'format':
      return '현재 문단을 보고서 본문처럼 양쪽 정렬과 줄간격 160%로 정리해줘.';
    case 'write':
      return '회의록 초안을 작성해줘. 제목, 일시, 참석자, 주요 논의, 결론을 포함해줘.';
    case 'report-draft':
      return '현재 내용을 보고서 형식으로 정리해줘. 제목, 배경, 현황, 문제점, 추진 계획, 결론 순서로 작성해줘.';
    case 'report-outline':
      return '현재 내용을 1. 2. 3. 번호 개요 형식으로 정리해줘. 각 항목은 짧고 명확하게 써줘.';
    case 'rewrite-selection':
      return '선택한 내용을 더 자연스럽고 정확하게 다듬어줘.';
    case 'continue-selection':
      return '선택한 내용을 바탕으로 자연스럽게 이어서 완성해줘.';
    case 'fill-template':
      return '현재 양식의 구조를 유지하면서 필요한 내용을 채워줘.';
    default:
      return '';
  }
}

function buildPromptMessages(input: string, mode: AiMode, contextText: string) {
  const contextBlock = contextText ? `Document context:\n"""\n${contextText}\n"""` : 'Document context: (none)';

  if (mode === 'table') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nCreate a table for this request and return a write-table action: ${input}`,
      },
    ];
  }

  if (mode === 'format') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nApply formatting at the current cursor location or current paragraph: ${input}`,
      },
    ];
  }

  if (mode === 'write') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nDraft normal document content for this request with insert-text and insert-paragraph actions: ${input}`,
      },
    ];
  }

  if (mode === 'report-draft') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nWrite this as a structured report. Prefer title, background, status, issues, plan, and conclusion. Use write-formatted-text for headings and numbered or bullet lists when helpful. Request: ${input}`,
      },
    ];
  }

  if (mode === 'report-outline') {
    const replaceInstruction = contextText
      ? 'Return a replace-selection action or a short sequence of numbered paragraphs that can replace the current selected block.'
      : 'Return a write-numbered-list action.';
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nTurn the content into a clean numbered outline for a report or meeting document. ${replaceInstruction} Request: ${input}`,
      },
    ];
  }

  if (mode === 'rewrite-selection') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nRewrite the selected content according to this request. Return a replace-selection action only. Request: ${input}`,
      },
    ];
  }

  if (mode === 'continue-selection') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nContinue or complete the selected content. Keep the original selected text at the beginning and extend it naturally. Return a replace-selection action. Request: ${input}`,
      },
    ];
  }

  if (mode === 'fill-template') {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n\nFill the document template or format shown in the context according to this request. Preserve headings, labels, and structure when appropriate. If the selected block should be replaced, return replace-selection. Otherwise use insert-text and insert-paragraph actions. Request: ${input}`,
      },
    ];
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${contextBlock}\n\nUser request: ${input}` },
  ];
}

function extractJsonBlocks(content: string) {
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }

  return {
    text: content.replace(jsonBlockRegex, '').trim(),
    jsonBlocks: blocks,
  };
}

function parseAiResponse(text: string): AiAction[] {
  const actions: AiAction[] = [];
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    appendParsedActions(actions, match[1]);
  }

  if (actions.length === 0) {
    appendParsedActions(actions, text);
  }

  return actions;
}

function appendParsedActions(actions: AiAction[], raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      actions.push(...parsed);
      return;
    }

    if (Array.isArray((parsed as { actions?: AiAction[] }).actions)) {
      actions.push(...(parsed as { actions: AiAction[] }).actions);
      return;
    }

    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      actions.push(parsed as AiAction);
    }
  } catch {
    // Ignore invalid JSON fragments.
  }
}

function truncateText(text: string, limit: number) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}...`;
}
