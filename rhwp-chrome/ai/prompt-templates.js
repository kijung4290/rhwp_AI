// 프롬프트 템플릿 — 사용자 입력을 구조화된 AI 프롬프트로 변환
// 각 템플릿은 system 프롬프트와 예시 응답 형식을 포함한다.

const SYSTEM_PROMPT = `당신은 HWP(한글 문서) 편집 어시스턴트입니다. 사용자의 요청을 분석하여 rhwp HwpCtl 호환 JSON 액션 시퀀스를 생성하세요.

## 사용 가능한 액션 타입

### 표 (Table)
- "table-create": { type, rows, cols, colWidth?, rowHeight?, borderType? } — 표 생성
- "table-set-cell-text": { type, row, col, text } — 셀 텍스트 설정
- "table-merge-cells": { type, startRow, startCol, endRow, endCol } — 셀 병합
- "table-insert-row": { type } — 행 삽입
- "table-insert-column": { type } — 열 삽입
- "table-set-formula": { type, row, col, formula } — 셀 수식 (예: "SUM(A1:A5)")

### 텍스트
- "insert-text": { type, text } — 텍스트 삽입
- "insert-paragraph": { type } — 문단 나누기 (Enter)
- "insert-page-break": { type } — 쪽 나누기

### 글자 서식
- "char-shape": { type, bold?, italic?, underline?, strikeout?, fontSize?, fontName?, textColor?, superscript?, subscript? }

### 문단 서식
- "para-shape": { type, align?, lineSpacing?, spaceBefore?, spaceAfter?, indentLeft?, indentRight?, firstLineIndent? }
  - align: 0=Left, 1=Center, 2=Right, 3=Justify, 4=Distribute

### 복합 액션 (편의)
- "write-table": { type, rows, cols, cells: [{ row, col, text }], header?, headerBold? }
- "write-formatted-text": { type, text, format?: { bold?, italic?, fontSize?, fontName? }, paraFormat?: { align?, lineSpacing? } }
- "write-bullet-list": { type, items: string[] }
- "write-numbered-list": { type, items: string[] }

## 응답 규칙
1. 반드시 JSON 배열 형식으로만 응답하세요.
2. 각 액션은 type 필드를 반드시 포함해야 합니다.
3. 한국어 텍스트를 사용하세요.
4. 셀 좌표는 0부터 시작합니다.
5. fontSize는 pt 단위입니다.
6. lineSpacing은 % (예: 160 = 160%).
7. 표의 첫 행은 보통 헤더이므로 볼드 적용을 권장합니다.
8. 응답은 \`\`\`json 블록으로 감싸세요.`;

export const PROMPTS = {
  system: SYSTEM_PROMPT,

  createTable: (description) => ({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `다음 표를 만들어주세요: ${description}\n\nwrite-table 액션으로 응답하세요.` },
      { role: 'assistant', content: '```json\n[\n  {\n    "type": "write-table",\n    "rows": 3,\n    "cols": 4,\n    "cells": [\n      { "row": 0, "col": 0, "text": "항목" },\n      { "row": 0, "col": 1, "text": "1분기" },\n      { "row": 0, "col": 2, "text": "2분기" },\n      { "row": 0, "col": 3, "text": "합계" },\n      { "row": 1, "col": 0, "text": "매출" },\n      { "row": 1, "col": 3, "text": "" },\n      { "row": 2, "col": 0, "text": "영업이익" },\n      { "row": 2, "col": 3, "text": "" }\n    ],\n    "header": true,\n    "headerBold": true\n  }\n]\n```' },
    ],
  }),

  formatDocument: (description) => ({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `현재 커서 위치의 텍스트에 다음 서식을 적용해주세요: ${description}\n\nchar-shape 및/또는 para-shape 액션으로 응답하세요.` },
    ],
  }),

  writeText: (description) => ({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `다음 내용을 문서에 작성해주세요: ${description}\n\ninsert-text, insert-paragraph, write-formatted-text 등의 액션으로 응답하세요. 문단 구조를 포함하세요.` },
    ],
  }),

  general: (userInput) => ({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userInput },
    ],
  }),
};

// 사이드패널 제안 버튼 목록
export const SUGGESTIONS = [
  { id: 'table', icon: '⊞', labelKo: '표 만들기', labelEn: 'Create Table', prompt: '세금 계산서 양식 표를 만들어주세요. 5행 4열로, 헤더에 품목, 단가, 수량, 금액을 넣고 샘플 데이터를 채워주세요.' },
  { id: 'format', icon: 'Aa', labelKo: '서식 적용', labelEn: 'Apply Format', prompt: '현재 문단을 가운데 정렬하고 글자 크기를 14pt, 줄간격 160%로 설정해주세요.' },
  { id: 'write', icon: '✎', labelKo: '글 작성', labelEn: 'Write Text', prompt: '회의록 양식을 작성해주세요. 제목, 날짜, 참석자, 안건, 결론 항목을 포함하세요.' },
];