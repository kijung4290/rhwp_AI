// AI 응답 → HwpCtrl 액션 파서
// OpenAI Chat Completions의 구조화된 JSON 응답을 파싱하여
// rhwp HwpCtl 호환 액션 시퀀스로 변환한다.

/**
 * AI 응답에서 JSON 명령 블록을 추출한다.
 * ```json ... ``` 형식과 순수 JSON 모두 지원.
 * @param {string} text - AI 응답 텍스트
 * @returns {Array<object>} 파싱된 액션 배열
 */
export function parseAiResponse(text) {
  const actions = [];

  // ```json ... ``` 블록 추출
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let match;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        actions.push(...parsed);
      } else if (parsed.actions && Array.isArray(parsed.actions)) {
        actions.push(...parsed.actions);
      } else if (parsed.type) {
        actions.push(parsed);
      }
    } catch {}
  }

  // JSON 블록이 없으면 전체 텍스트에서 JSON 찾기
  if (actions.length === 0) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        actions.push(...parsed);
      } else if (parsed.actions && Array.isArray(parsed.actions)) {
        actions.push(...parsed.actions);
      } else if (parsed.type) {
        actions.push(parsed);
      }
    } catch {}
  }

  return actions;
}

/**
 * 액션을 HwpCtl 메서드 호출로 변환한다.
 * @param {object} action - AI 액션 객체
 * @param {object} hwpCtrl - HwpCtrl 인스턴스
 * @returns {{ success: boolean, message: string }}
 */
export function executeAction(action, hwpCtrl) {
  if (!hwpCtrl) {
    return { success: false, message: 'HwpCtrl이 초기화되지 않았습니다.' };
  }

  const executor = actionExecutors[action.type];
  if (!executor) {
    return { success: false, message: `알 수 없는 액션: ${action.type}` };
  }

  try {
    return executor(action, hwpCtrl);
  } catch (err) {
    return { success: false, message: `실행 오류: ${err.message}` };
  }
}

/**
 * 액션 시퀀스를 순차적으로 실행한다.
 * @param {Array<object>} actions - 액션 배열
 * @param {object} hwpCtrl - HwpCtrl 인스턴스
 * @returns {Array<{ success: boolean, message: string, action: object }>}
 */
export function executeActions(actions, hwpCtrl) {
  return actions.map(action => {
    const result = executeAction(action, hwpCtrl);
    return { ...result, action };
  });
}

// ─── 액션 실행기 ───

const actionExecutors = {
  // ─── 표 (Table) ───

  'table-create': createTable,
  'table-set-cell-text': setCellText,
  'table-merge-cells': mergeCells,
  'table-set-cell-style': setCellStyle,
  'table-insert-row': insertTableRow,
  'table-insert-column': insertTableColumn,
  'table-set-formula': setCellFormula,

  // ─── 텍스트 삽입 ───

  'insert-text': insertText,
  'insert-paragraph': insertParagraph,
  'insert-page-break': insertPageBreak,
  'insert-tab': insertTab,

  // ─── 글자 서식 ───

  'char-shape': applyCharShape,
  'para-shape': applyParaShape,

  // ─── 복합 액션 (편의) ───

  'write-table': writeTable,
  'write-formatted-text': writeFormattedText,
  'write-bullet-list': writeBulletList,
  'write-numbered-list': writeNumberedList,
};

function createTable(action, hwpCtrl) {
  const act = hwpCtrl.CreateAction('TableCreate');
  const set = act.CreateSet();
  set.Item('Rows', action.rows || 2);
  set.Item('Cols', action.cols || 2);

  if (action.colWidth) {
    set.Item('ColWidth', action.colWidth);
  }
  if (action.rowHeight) {
    set.Item('RowHeight', action.rowHeight);
  }
  if (action.borderType !== undefined) {
    set.Item('BorderType', action.borderType);
  }

  act.Execute(set);
  return { success: true, message: `표 생성: ${action.rows || 2}행 × ${action.cols || 2}열` };
}

function setCellText(action, hwpCtrl) {
  hwpCtrl.SetCellText(
    action.list || 0,
    action.para || 0,
    action.pos || 0,
    action.row || 0,
    action.col || 0,
    action.text || ''
  );
  return { success: true, message: `셀 (${action.row},${action.col}) 텍스트 설정` };
}

function mergeCells(action, hwpCtrl) {
  hwpCtrl.mergeTableCells(action.startRow, action.startCol, action.endRow, action.endCol);
  return { success: true, message: `셀 병합: (${action.startRow},${action.startCol})-(${action.endRow},${action.endCol})` };
}

function setCellStyle(action, hwpCtrl) {
  // CellBorderFill 액션 사용
  const act = hwpCtrl.CreateAction('CellBorderFill');
  const set = act.CreateSet();
  if (action.bold) set.Item('Bold', 1);
  if (action.align) set.Item('Align', action.align);
  if (action.backgroundColor) set.Item('BackgroundColor', action.backgroundColor);
  act.Execute(set);
  return { success: true, message: '셀 서식 적용' };
}

function insertTableRow(action, hwpCtrl) {
  const act = hwpCtrl.CreateAction('TableInsertRowColumn');
  const set = act.CreateSet();
  set.Item('Type', 0); // 0 = row
  act.Execute(set);
  return { success: true, message: '표 행 삽입' };
}

function insertTableColumn(action, hwpCtrl) {
  const act = hwpCtrl.CreateAction('TableInsertRowColumn');
  const set = act.CreateSet();
  set.Item('Type', 1); // 1 = column
  act.Execute(set);
  return { success: true, message: '표 열 삽입' };
}

function setCellFormula(action, hwpCtrl) {
  hwpCtrl.EvaluateFormula(
    action.list || 0,
    action.para || 0,
    action.pos || 0,
    action.row || 0,
    action.col || 0,
    action.formula || ''
  );
  return { success: true, message: `셀 수식 설정: ${action.formula}` };
}

function insertText(action, hwpCtrl) {
  hwpCtrl.InsertText(action.text || '');
  return { success: true, message: `텍스트 삽입: "${(action.text || '').substring(0, 30)}${(action.text || '').length > 30 ? '...' : ''}"` };
}

function insertParagraph(action, hwpCtrl) {
  hwpCtrl.Run('BreakPara');
  return { success: true, message: '문단 나누기' };
}

function insertPageBreak(action, hwpCtrl) {
  hwpCtrl.Run('BreakPage');
  return { success: true, message: '쪽 나누기' };
}

function insertTab(action, hwpCtrl) {
  hwpCtrl.Run('Tab');
  return { success: true, message: '탭 삽입' };
}

function applyCharShape(action, hwpCtrl) {
  const act = hwpCtrl.CreateAction('CharShape');
  const set = act.CreateSet();

  if (action.bold !== undefined) set.Item('Bold', action.bold ? 1 : 0);
  if (action.italic !== undefined) set.Item('Italic', action.italic ? 1 : 0);
  if (action.underline !== undefined) set.Item('Underline', action.underline ? 1 : 0);
  if (action.strikeout !== undefined) set.Item('Strikeout', action.strikeout ? 1 : 0);
  if (action.fontSize) set.Item('FontSize', action.fontSize);
  if (action.fontName) set.Item('FontName', action.fontName);
  if (action.textColor) set.Item('TextColor', action.textColor);
  if (action.superscript) set.Item('Superscript', 1);
  if (action.subscript) set.Item('Subscript', 1);

  act.Execute(set);
  return { success: true, message: '글자 서식 적용' };
}

function applyParaShape(action, hwpCtrl) {
  const act = hwpCtrl.CreateAction('ParagraphShape');
  const set = act.CreateSet();

  if (action.align !== undefined) set.Item('Align', action.align);
  if (action.lineSpacing !== undefined) set.Item('LineSpacing', action.lineSpacing);
  if (action.spaceBefore !== undefined) set.Item('SpaceBefore', action.spaceBefore);
  if (action.spaceAfter !== undefined) set.Item('SpaceAfter', action.spaceAfter);
  if (action.indentLeft !== undefined) set.Item('IndentLeft', action.indentLeft);
  if (action.indentRight !== undefined) set.Item('IndentRight', action.indentRight);
  if (action.firstLineIndent !== undefined) set.Item('FirstLineIndent', action.firstLineIndent);

  act.Execute(set);
  return { success: true, message: '문단 서식 적용' };
}

// ─── 복합 액션 ───

function writeTable(action, hwpCtrl) {
  // 1. 표 생성
  const rows = action.rows || 2;
  const cols = action.cols || 2;
  const createResult = createTable({ ...action, type: 'table-create', rows, cols }, hwpCtrl);
  if (!createResult.success) return createResult;

  // 2. 헤더 볼드
  if (action.header && action.headerBold !== false) {
    const headerRow = action.headerRow || 0;
    // 첫 행 헤더 셀에 볼드 적용은 텍스트 설정 후에 수행
  }

  // 3. 셀 텍스트 채우기
  if (action.cells && Array.isArray(action.cells)) {
    for (const cell of action.cells) {
      setCellText({
        type: 'table-set-cell-text',
        row: cell.row,
        col: cell.col,
        text: cell.text || '',
      }, hwpCtrl);
    }
  }

  // 4. 헤더 볼드 적용 (셀 텍스트 이후)
  if (action.header) {
    for (let c = 0; c < cols; c++) {
      applyCharShape({ type: 'char-shape', bold: true }, hwpCtrl);
    }
  }

  return { success: true, message: `표 작성 완료: ${rows}행 × ${cols}열` };
}

function writeFormattedText(action, hwpCtrl) {
  // 1. 글자 서식 적용
  if (action.format) {
    applyCharShape({ ...action.format, type: 'char-shape' }, hwpCtrl);
  }

  // 2. 문단 서식 적용
  if (action.paraFormat) {
    applyParaShape({ ...action.paraFormat, type: 'para-shape' }, hwpCtrl);
  }

  // 3. 텍스트 삽입
  if (action.text) {
    hwpCtrl.InsertText(action.text);
  }

  return { success: true, message: '서식 텍스트 작성 완료' };
}

function writeBulletList(action, hwpCtrl) {
  const items = action.items || [];
  for (let i = 0; i < items.length; i++) {
    hwpCtrl.InsertText(`• ${items[i]}`);
    if (i < items.length - 1) {
      hwpCtrl.Run('BreakPara');
    }
  }
  return { success: true, message: `글머리 기호 목록: ${items.length}항목` };
}

function writeNumberedList(action, hwpCtrl) {
  const items = action.items || [];
  for (let i = 0; i < items.length; i++) {
    hwpCtrl.InsertText(`${i + 1}. ${items[i]}`);
    if (i < items.length - 1) {
      hwpCtrl.Run('BreakPara');
    }
  }
  return { success: true, message: `번호 매기기 목록: ${items.length}항목` };
}