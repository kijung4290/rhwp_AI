const SYSTEM_PROMPT = `You are an AI assistant for editing HWP documents in rhwp.

Return the answer as a JSON array wrapped in a \`\`\`json code block.
You may add one short Korean sentence before the JSON block, but no extra prose.

Supported actions:
- "table-create": { "type": "table-create", "rows": number, "cols": number, "colWidth"?: number, "rowHeight"?: number, "borderType"?: number }
- "table-set-cell-text": { "type": "table-set-cell-text", "row": number, "col": number, "text": string }
- "table-merge-cells": { "type": "table-merge-cells", "startRow": number, "startCol": number, "endRow": number, "endCol": number }
- "table-insert-row": { "type": "table-insert-row", "row"?: number, "below"?: boolean }
- "table-insert-column": { "type": "table-insert-column", "col"?: number, "right"?: boolean }
- "table-set-formula": { "type": "table-set-formula", "row": number, "col": number, "formula": string }
- "insert-text": { "type": "insert-text", "text": string }
- "insert-paragraph": { "type": "insert-paragraph" }
- "insert-page-break": { "type": "insert-page-break" }
- "insert-tab": { "type": "insert-tab" }
- "char-shape": { "type": "char-shape", "bold"?: boolean, "italic"?: boolean, "underline"?: boolean, "strikeout"?: boolean, "fontSize"?: number, "fontName"?: string, "textColor"?: string, "superscript"?: boolean, "subscript"?: boolean }
- "para-shape": { "type": "para-shape", "align"?: number, "lineSpacing"?: number, "spaceBefore"?: number, "spaceAfter"?: number, "indentLeft"?: number, "indentRight"?: number, "firstLineIndent"?: number }
- "write-table": { "type": "write-table", "rows": number, "cols": number, "cells": [{ "row": number, "col": number, "text": string }], "header"?: boolean, "headerBold"?: boolean }
- "write-formatted-text": { "type": "write-formatted-text", "text": string, "format"?: { "bold"?: boolean, "italic"?: boolean, "underline"?: boolean }, "paraFormat"?: { "align"?: number, "lineSpacing"?: number, "spaceBefore"?: number, "spaceAfter"?: number } }
- "write-bullet-list": { "type": "write-bullet-list", "items": string[] }
- "write-numbered-list": { "type": "write-numbered-list", "items": string[] }

Guidance:
1. Use zero-based row and column coordinates.
2. Prefer "write-table" for creating a new table from scratch.
3. For report drafting, prefer a clear structure such as title, background, current status, issues, plan, and conclusion.
4. For outline requests, prefer "write-numbered-list" or numbered paragraphs rather than a plain block of text.
5. Use "write-formatted-text" for headings or emphasis, and keep formatting practical.
6. Keep the actions ready to apply immediately in the current document.
7. Always return valid JSON inside a \`\`\`json block.`;

function createMessages(instruction, example) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: instruction },
  ];

  if (example) {
    messages.push({ role: 'assistant', content: example });
  }

  return { messages };
}

export const PROMPTS = {
  system: SYSTEM_PROMPT,

  createTable: (description) =>
    createMessages(
      `Create a table for this request: ${description}\n\nReturn a write-table action.`,
      '```json\n[\n  {\n    "type": "write-table",\n    "rows": 3,\n    "cols": 4,\n    "header": true,\n    "headerBold": true,\n    "cells": [\n      { "row": 0, "col": 0, "text": "항목" },\n      { "row": 0, "col": 1, "text": "1분기" },\n      { "row": 0, "col": 2, "text": "2분기" },\n      { "row": 0, "col": 3, "text": "비고" },\n      { "row": 1, "col": 0, "text": "매출" },\n      { "row": 2, "col": 0, "text": "영업이익" }\n    ]\n  }\n]\n```',
    ),

  formatDocument: (description) =>
    createMessages(
      `Apply formatting near the current cursor or paragraph: ${description}\n\nReturn char-shape and/or para-shape actions only.`,
    ),

  writeText: (description) =>
    createMessages(
      `Draft document content for this request: ${description}\n\nUse insert-text, insert-paragraph, and write-formatted-text actions in document order.`,
    ),

  writeReport: (description) =>
    createMessages(
      `Write this as a structured report document: ${description}\n\nPrefer a title, short section headings, numbered or bullet lists when helpful, and concise report-style paragraphs.`,
      '```json\n[\n  {\n    "type": "write-formatted-text",\n    "text": "업무 추진 보고",\n    "format": { "bold": true },\n    "paraFormat": { "align": 1, "spaceAfter": 12 }\n  },\n  { "type": "insert-paragraph" },\n  {\n    "type": "write-numbered-list",\n    "items": [\n      "배경: 사업 추진 필요성과 목적 정리",\n      "현황: 현재 진행 상태와 주요 수치 정리",\n      "문제점: 확인된 이슈와 원인 정리",\n      "추진 계획: 다음 단계 일정과 담당자 정리",\n      "결론: 요청 사항과 기대 효과 정리"\n    ]\n  }\n]\n```',
    ),

  writeOutline: (description) =>
    createMessages(
      `Turn this into a clean numbered outline for a report or meeting document: ${description}\n\nPrefer write-numbered-list. Keep each item short and scannable.`,
      '```json\n[\n  {\n    "type": "write-numbered-list",\n    "items": [\n      "배경",\n      "현황",\n      "문제점",\n      "개선 방안",\n      "추진 일정"\n    ]\n  }\n]\n```',
    ),

  general: (userInput) =>
    createMessages(`User request: ${userInput}`),
};

export const SUGGESTIONS = [
  {
    id: 'table',
    icon: '▦',
    labelKo: '표 만들기',
    labelEn: 'Create Table',
    prompt: '분기별 실적을 정리하는 4열 표를 만들어줘. 항목, 목표, 실적, 비고를 포함해줘.',
    keywords: ['table', '표', '셀', '행', '열'],
    promptBuilder: 'createTable',
  },
  {
    id: 'format',
    icon: 'Aa',
    labelKo: '서식 정리',
    labelEn: 'Format',
    prompt: '현재 문단을 보고서 본문처럼 정리해줘. 양쪽 정렬, 줄간격 160%, 문단 아래 간격을 적용해줘.',
    keywords: ['format', 'bold', 'align', 'style', '서식', '정렬', '강조', '글씨'],
    promptBuilder: 'formatDocument',
  },
  {
    id: 'write',
    icon: '✍',
    labelKo: '문서 작성',
    labelEn: 'Write',
    prompt: '회의록 초안을 작성해줘. 제목, 일시, 참석자, 주요 논의, 결론 항목을 포함해줘.',
    keywords: ['write', 'draft', 'text', '문서', '작성', '초안', '회의록'],
    promptBuilder: 'writeText',
  },
  {
    id: 'report',
    icon: '📄',
    labelKo: '보고서 초안',
    labelEn: 'Report Draft',
    prompt: '현재 내용을 보고서 형식으로 정리해줘. 제목, 배경, 현황, 문제점, 추진 계획, 결론 순서로 작성해줘.',
    keywords: ['report', '보고서', '기안', '품의', '요약 보고', '업무보고'],
    promptBuilder: 'writeReport',
  },
  {
    id: 'outline',
    icon: '1.',
    labelKo: '번호 개요',
    labelEn: 'Numbered Outline',
    prompt: '현재 내용을 1. 2. 3. 번호 개요 형식으로 정리해줘. 각 항목은 짧고 명확하게 써줘.',
    keywords: ['outline', 'agenda', 'number', 'list', '개요', '번호', '목차', '순서'],
    promptBuilder: 'writeOutline',
  },
];
