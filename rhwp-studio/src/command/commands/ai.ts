import type { CommandDef, CommandServices } from '../types';
import { InlineAiDialog } from '@/ui/inline-ai-dialog';

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
    mode?:
      | 'general'
      | 'table'
      | 'format'
      | 'write'
      | 'rewrite-selection'
      | 'continue-selection'
      | 'fill-template';
    contextText?: string;
  },
) {
  getDialog(services).open(options);
}

function getSelectionText(services: CommandServices) {
  return services.getInputHandler()?.getSelectedText().trim() || '';
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
        prompt: '5행 4열 일정표를 만들어줘. 헤더와 예시 데이터도 채워줘.',
      });
    },
  },
  {
    id: 'ai:format-text',
    label: 'AI로 서식 적용',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      openInlineAi(services, {
        mode: 'format',
        prompt: '현재 문단을 가운데 정렬하고 글자 크기를 14pt로 바꿔줘.',
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
        prompt: '회의록 초안을 작성해줘. 제목, 일시, 참석자, 회의 내용, 결론을 포함해줘.',
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
        prompt: '현재 양식을 유지하면서 내가 요청하는 내용으로 채워줘.',
        contextText: getTemplateContext(services),
      });
    },
  },
];
