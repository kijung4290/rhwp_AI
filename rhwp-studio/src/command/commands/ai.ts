import type { CommandDef, CommandServices } from '../types';
import { InlineAiDialog } from '@/ui/inline-ai-dialog';

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

let dialog: InlineAiDialog | null = null;

function getDialog(_services: CommandServices) {
  if (!dialog) {
    dialog = new InlineAiDialog();
  }
  return dialog;
}

function openInlineAi(
  services: CommandServices,
  options: {
    prompt?: string;
    mode?: AiMode;
    contextText?: string;
  },
) {
  getDialog(services).open(options);
}

function getSelectionText(services: CommandServices) {
  return services.getInputHandler()?.getSelectedText().trim() || '';
}

function getCurrentParagraphText(services: CommandServices) {
  return services.getInputHandler()?.getCurrentParagraphText().trim() || '';
}

function getSelectionOrParagraphContext(services: CommandServices) {
  return getSelectionText(services) || getCurrentParagraphText(services);
}

function getTemplateContext(services: CommandServices) {
  const inputHandler = services.getInputHandler();
  return inputHandler?.getAiTemplateContext(2).trim() || inputHandler?.getCurrentParagraphText().trim() || '';
}

export const aiCommands: CommandDef[] = [
  {
    id: 'ai:open-panel',
    label: 'AI 도우미',
    shortcutLabel: 'Ctrl+Shift+A',
    canExecute: () => true,
    execute(services) {
      openInlineAi(services, { mode: 'general' });
    },
  },
  {
    id: 'ai:create-table',
    label: 'AI로 표 만들기',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'table',
        prompt: '5행 4열 표를 만들어줘. 헤더와 예시 데이터도 함께 채워줘.',
      });
    },
  },
  {
    id: 'ai:format-text',
    label: 'AI로 서식 정리',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'format',
        prompt: '현재 문단을 보고서 본문처럼 정리해줘. 양쪽 정렬과 줄간격 160%를 적용해줘.',
      });
    },
  },
  {
    id: 'ai:write-text',
    label: 'AI로 글 작성',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'write',
        prompt: '회의록 초안을 작성해줘. 제목, 일시, 참석자, 주요 논의, 결론을 포함해줘.',
      });
    },
  },
  {
    id: 'ai:write-report',
    label: 'AI로 보고서 초안 작성',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'report-draft',
        prompt: '현재 내용을 보고서 형식으로 정리해줘. 제목, 배경, 현황, 문제점, 추진 계획, 결론 순서로 작성해줘.',
        contextText: getSelectionOrParagraphContext(services),
      });
    },
  },
  {
    id: 'ai:report-outline',
    label: 'AI로 번호 개요 만들기',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'report-outline',
        prompt: '현재 내용을 1. 2. 3. 번호 개요 형식으로 정리해줘. 각 항목은 짧고 명확하게 써줘.',
        contextText: getSelectionOrParagraphContext(services),
      });
    },
  },
  {
    id: 'ai:rewrite-selection',
    label: 'AI로 선택 내용 수정',
    canExecute: (ctx) => ctx.hasDocument && ctx.hasSelection,
    execute(services) {
      openInlineAi(services, {
        mode: 'rewrite-selection',
        prompt: '선택한 내용을 더 자연스럽고 정확하게 다듬어줘.',
        contextText: getSelectionText(services),
      });
    },
  },
  {
    id: 'ai:complete-selection',
    label: 'AI로 선택 내용 이어쓰기',
    canExecute: (ctx) => ctx.hasDocument && ctx.hasSelection,
    execute(services) {
      openInlineAi(services, {
        mode: 'continue-selection',
        prompt: '선택한 내용을 바탕으로 자연스럽게 이어서 완성해줘.',
        contextText: getSelectionText(services),
      });
    },
  },
  {
    id: 'ai:fill-template',
    label: 'AI로 양식 채우기',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'fill-template',
        prompt: '현재 양식의 구조를 유지하면서 필요한 내용을 채워줘.',
        contextText: getTemplateContext(services),
      });
    },
  },
];
