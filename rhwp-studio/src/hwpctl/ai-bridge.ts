import { WasmBridge } from '@/core/wasm-bridge';
import type { DocumentPosition } from '@/core/types';
import type { InputHandler } from '@/engine/input-handler';
import { CommandDispatcher } from '@/command/dispatcher';
import { EventBus } from '@/core/event-bus';

let wasmRef: WasmBridge | null = null;
let inputHandlerRef: InputHandler | null = null;
let eventBusRef: EventBus | null = null;
let dispatcherRef: CommandDispatcher | null = null;

type Action = Record<string, unknown>;
type ActionResult = { success: boolean; message: string };
type TableContext = { section: number; parentPara: number; controlIdx: number; colCount: number };
type SelectionRange = { start: DocumentPosition; end: DocumentPosition };

export function setAiBridgeDeps(
  wasm: WasmBridge,
  inputHandler: InputHandler | null,
  eventBus: EventBus,
  dispatcher: CommandDispatcher,
) {
  wasmRef = wasm;
  inputHandlerRef = inputHandler;
  eventBusRef = eventBus;
  dispatcherRef = dispatcher;
  console.log('[ai-bridge] ready');
}

export function executeHwpCtlAction(action: Action): ActionResult {
  const result = executeSingleAction(action);
  if (result.success) {
    notifyDocumentChanged();
  }
  return result;
}

export function executeHwpCtlActions(actions: Action[]): ActionResult[] {
  const results = actions.map((action) => executeSingleAction(action));
  if (results.some((result) => result.success)) {
    notifyDocumentChanged();
  }
  return results;
}

function executeSingleAction(action: Action): ActionResult {
  const wasm = wasmRef;
  if (!wasm || wasm.pageCount === 0) {
    return { success: false, message: 'No document is open. Open an HWP/HWPX file first.' };
  }

  const executor = ACTION_EXECUTORS[String(action.type || '')];
  if (!executor) {
    return { success: false, message: `Unsupported action: ${String(action.type || '')}` };
  }

  try {
    return executor(action, wasm);
  } catch (error: any) {
    return { success: false, message: `Execution failed: ${error?.message || error}` };
  }
}

function notifyDocumentChanged() {
  inputHandlerRef?.activateWithCaretPosition();
  eventBusRef?.emit('document-changed');
  eventBusRef?.emit('command-state-changed');
}

function getActiveSelection(): SelectionRange | null {
  return inputHandlerRef?.getSelection() || null;
}

function getDocumentPosition(wasm: WasmBridge): DocumentPosition | null {
  return wasm.getCaretPosition() || inputHandlerRef?.getCursorPosition() || null;
}

function getBodyPosition(wasm: WasmBridge) {
  const pos = getDocumentPosition(wasm);
  return {
    section: pos?.sectionIndex ?? 0,
    paragraph: pos?.paragraphIndex ?? 0,
    charOffset: pos?.charOffset ?? 0,
  };
}

function getCurrentTableContext(wasm: WasmBridge): TableContext | null {
  const pos = getDocumentPosition(wasm);
  if (!pos || pos.parentParaIndex === undefined || pos.controlIndex === undefined) {
    return null;
  }

  const dims = wasm.getTableDimensions(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex);
  const colCount = Number(dims.colCount || 1);
  return {
    section: pos.sectionIndex,
    parentPara: pos.parentParaIndex,
    controlIdx: pos.controlIndex,
    colCount: Math.max(colCount, 1),
  };
}

function resolveTableContext(action: Action, wasm: WasmBridge): TableContext | null {
  if (
    action.section !== undefined &&
    action.parentPara !== undefined &&
    action.controlIdx !== undefined
  ) {
    const section = Number(action.section);
    const parentPara = Number(action.parentPara);
    const controlIdx = Number(action.controlIdx);
    const dims = wasm.getTableDimensions(section, parentPara, controlIdx);
    const colCount = Number(dims.colCount || 1);
    return {
      section,
      parentPara,
      controlIdx,
      colCount: Math.max(colCount, 1),
    };
  }

  return getCurrentTableContext(wasm);
}

function resolveCellTarget(action: Action, wasm: WasmBridge) {
  const context = resolveTableContext(action, wasm);
  if (!context) {
    return null;
  }

  const row = Number(action.row ?? 0);
  const col = Number(action.col ?? 0);
  const cellIdx = Number(action.cellIdx ?? row * context.colCount + col);
  const cellParaIdx = Number(action.cellParaIdx ?? 0);
  const charOffset = Number(action.charOffset ?? 0);

  return {
    ...context,
    row,
    col,
    cellIdx,
    cellParaIdx,
    charOffset,
  };
}

const ACTION_EXECUTORS: Record<string, (action: Action, wasm: WasmBridge) => ActionResult> = {
  'replace-selection': execReplaceSelection,
  'table-create': execTableCreate,
  'table-set-cell-text': execSetCellText,
  'table-merge-cells': execMergeCells,
  'table-insert-row': execTableInsertRow,
  'table-insert-column': execTableInsertColumn,
  'table-set-formula': execSetCellFormula,
  'insert-text': execInsertText,
  'insert-paragraph': execInsertParagraph,
  'insert-page-break': execInsertPageBreak,
  'insert-tab': execInsertTab,
  'char-shape': execCharShape,
  'para-shape': execParaShape,
  'write-table': execWriteTable,
  'write-formatted-text': execWriteFormattedText,
  'write-bullet-list': execWriteBulletList,
  'write-numbered-list': execWriteNumberedList,
};

function insertPlainText(
  wasm: WasmBridge,
  position: {
    section: number;
    paragraph: number;
    charOffset: number;
    parentPara?: number;
    controlIdx?: number;
    cellIdx?: number;
    cellParaIdx?: number;
  },
  text: string,
) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const inCell =
    position.parentPara !== undefined &&
    position.controlIdx !== undefined &&
    position.cellIdx !== undefined &&
    position.cellParaIdx !== undefined;

  let paragraph = position.paragraph;
  let charOffset = position.charOffset;
  let cellParaIdx = position.cellParaIdx ?? 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line) {
      if (inCell) {
        wasm.insertTextInCell(
          position.section,
          position.parentPara!,
          position.controlIdx!,
          position.cellIdx!,
          cellParaIdx,
          charOffset,
          line,
        );
      } else {
        wasm.insertText(position.section, paragraph, charOffset, line);
      }
      charOffset += line.length;
    }

    if (index < lines.length - 1) {
      if (inCell) {
        wasm.splitParagraphInCell(
          position.section,
          position.parentPara!,
          position.controlIdx!,
          position.cellIdx!,
          cellParaIdx,
          charOffset,
        );
        cellParaIdx += 1;
      } else {
        wasm.splitParagraph(position.section, paragraph, charOffset);
        paragraph += 1;
      }
      charOffset = 0;
    }
  }
}

function execReplaceSelection(action: Action, wasm: WasmBridge): ActionResult {
  const selection = getActiveSelection();
  if (!selection) {
    return { success: false, message: 'No active selection to replace.' };
  }

  const text = String(action.text ?? '');

  if (
    selection.start.parentParaIndex !== undefined &&
    selection.start.controlIndex !== undefined &&
    selection.start.cellIndex !== undefined &&
    selection.start.cellParaIndex !== undefined &&
    selection.end.cellParaIndex !== undefined
  ) {
    const result = wasm.deleteRangeInCell(
      selection.start.sectionIndex,
      selection.start.parentParaIndex,
      selection.start.controlIndex,
      selection.start.cellIndex,
      selection.start.cellParaIndex,
      selection.start.charOffset,
      selection.end.cellParaIndex,
      selection.end.charOffset,
    );

    if (!result.ok) {
      return { success: false, message: 'Failed to delete the selected cell text.' };
    }

    insertPlainText(wasm, {
      section: selection.start.sectionIndex,
      paragraph: selection.start.paragraphIndex,
      parentPara: selection.start.parentParaIndex,
      controlIdx: selection.start.controlIndex,
      cellIdx: selection.start.cellIndex,
      cellParaIdx: result.paraIdx,
      charOffset: result.charOffset,
    }, text);

    return { success: true, message: 'Replaced the selected cell text.' };
  }

  const result = wasm.deleteRange(
    selection.start.sectionIndex,
    selection.start.paragraphIndex,
    selection.start.charOffset,
    selection.end.paragraphIndex,
    selection.end.charOffset,
  );

  if (!result.ok) {
    return { success: false, message: 'Failed to delete the selected text.' };
  }

  insertPlainText(wasm, {
    section: selection.start.sectionIndex,
    paragraph: result.paraIdx,
    charOffset: result.charOffset,
  }, text);

  return { success: true, message: 'Replaced the selected text.' };
}

function execTableCreate(action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  const rows = Number(action.rows ?? 2);
  const cols = Number(action.cols ?? 2);
  wasm.createTable(pos.section, pos.paragraph, pos.charOffset, rows, cols);
  return { success: true, message: `Created a ${rows}x${cols} table.` };
}

function execSetCellText(action: Action, wasm: WasmBridge): ActionResult {
  const target = resolveCellTarget(action, wasm);
  if (!target) {
    return { success: false, message: 'Table target could not be resolved for table-set-cell-text.' };
  }

  const text = String(action.text ?? '');
  wasm.insertTextInCell(
    target.section,
    target.parentPara,
    target.controlIdx,
    target.cellIdx,
    target.cellParaIdx,
    target.charOffset,
    text,
  );
  return { success: true, message: `Updated cell (${target.row}, ${target.col}).` };
}

function execMergeCells(action: Action, wasm: WasmBridge): ActionResult {
  const context = resolveTableContext(action, wasm);
  if (!context) {
    return { success: false, message: 'Table target could not be resolved for table-merge-cells.' };
  }

  wasm.mergeTableCells(
    context.section,
    context.parentPara,
    context.controlIdx,
    Number(action.startRow ?? 0),
    Number(action.startCol ?? 0),
    Number(action.endRow ?? 0),
    Number(action.endCol ?? 0),
  );
  return { success: true, message: 'Merged table cells.' };
}

function execTableInsertRow(action: Action, wasm: WasmBridge): ActionResult {
  const context = resolveTableContext(action, wasm);
  if (!context) {
    return { success: false, message: 'Table target could not be resolved for table-insert-row.' };
  }

  const rowIdx = Number(action.row ?? 0);
  const below = Boolean(action.below ?? true);
  wasm.insertTableRow(context.section, context.parentPara, context.controlIdx, rowIdx, below);
  return { success: true, message: 'Inserted a table row.' };
}

function execTableInsertColumn(action: Action, wasm: WasmBridge): ActionResult {
  const context = resolveTableContext(action, wasm);
  if (!context) {
    return { success: false, message: 'Table target could not be resolved for table-insert-column.' };
  }

  const colIdx = Number(action.col ?? 0);
  const right = Boolean(action.right ?? true);
  wasm.insertTableColumn(context.section, context.parentPara, context.controlIdx, colIdx, right);
  return { success: true, message: 'Inserted a table column.' };
}

function execSetCellFormula(action: Action, wasm: WasmBridge): ActionResult {
  const target = resolveCellTarget(action, wasm);
  if (!target) {
    return { success: false, message: 'Table target could not be resolved for table-set-formula.' };
  }

  const formula = String(action.formula ?? '');
  wasm.evaluateTableFormula(
    target.section,
    target.parentPara,
    target.controlIdx,
    target.row,
    target.col,
    formula,
    true,
  );
  return { success: true, message: `Applied formula to cell (${target.row}, ${target.col}).` };
}

function execInsertText(action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  const text = String(action.text ?? '');
  wasm.insertText(pos.section, pos.paragraph, pos.charOffset, text);
  return { success: true, message: `Inserted text: "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"` };
}

function execInsertParagraph(_action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  wasm.splitParagraph(pos.section, pos.paragraph, pos.charOffset);
  return { success: true, message: 'Inserted a paragraph break.' };
}

function execInsertPageBreak(_action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  wasm.insertPageBreak(pos.section, pos.paragraph, pos.charOffset);
  return { success: true, message: 'Inserted a page break.' };
}

function execInsertTab(_action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  wasm.insertText(pos.section, pos.paragraph, pos.charOffset, '\t');
  return { success: true, message: 'Inserted a tab.' };
}

function execCharShape(action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  const props: Record<string, unknown> = {};

  if (action.bold !== undefined) props.bold = action.bold;
  if (action.italic !== undefined) props.italic = action.italic;
  if (action.underline !== undefined) props.underline = action.underline;
  if (action.strikeout !== undefined) props.strikeout = action.strikeout;
  if (action.fontSize !== undefined) props.fontSize = action.fontSize;
  if (action.fontName !== undefined) props.fontName = action.fontName;
  if (action.textColor !== undefined) props.textColor = action.textColor;
  if (action.superscript) props.superscript = true;
  if (action.subscript) props.subscript = true;

  wasm.applyCharFormat(pos.section, pos.paragraph, pos.charOffset, pos.charOffset + 1, JSON.stringify(props));
  return { success: true, message: 'Applied character formatting.' };
}

function execParaShape(action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  const props: Record<string, unknown> = {};

  if (action.align !== undefined) props.align = action.align;
  if (action.lineSpacing !== undefined) props.lineSpacing = action.lineSpacing;
  if (action.spaceBefore !== undefined) props.spaceBefore = action.spaceBefore;
  if (action.spaceAfter !== undefined) props.spaceAfter = action.spaceAfter;
  if (action.indentLeft !== undefined) props.indentLeft = action.indentLeft;
  if (action.indentRight !== undefined) props.indentRight = action.indentRight;
  if (action.firstLineIndent !== undefined) props.firstLineIndent = action.firstLineIndent;

  wasm.applyParaFormat(pos.section, pos.paragraph, JSON.stringify(props));
  return { success: true, message: 'Applied paragraph formatting.' };
}

function execWriteTable(action: Action, wasm: WasmBridge): ActionResult {
  const pos = getBodyPosition(wasm);
  const rows = Number(action.rows ?? 2);
  const cols = Number(action.cols ?? 2);
  const created = wasm.createTable(pos.section, pos.paragraph, pos.charOffset, rows, cols);
  const cells = Array.isArray(action.cells) ? (action.cells as Array<Record<string, unknown>>) : [];

  for (const cell of cells) {
    const row = Number(cell.row ?? 0);
    const col = Number(cell.col ?? 0);
    const cellIdx = row * cols + col;
    wasm.insertTextInCell(
      pos.section,
      created.paraIdx,
      created.controlIdx,
      cellIdx,
      0,
      0,
      String(cell.text ?? ''),
    );
  }

  return { success: true, message: `Created and filled a ${rows}x${cols} table.` };
}

function execWriteFormattedText(action: Action, wasm: WasmBridge): ActionResult {
  if (action.paraFormat && typeof action.paraFormat === 'object') {
    execParaShape(action.paraFormat as Action, wasm);
  }

  if (action.format && typeof action.format === 'object') {
    execCharShape(action.format as Action, wasm);
  }

  if (action.text !== undefined) {
    execInsertText({ type: 'insert-text', text: action.text }, wasm);
  }

  return { success: true, message: 'Inserted formatted text.' };
}

function execWriteBulletList(action: Action, wasm: WasmBridge): ActionResult {
  const items = Array.isArray(action.items) ? action.items.map((item) => String(item)) : [];
  for (let index = 0; index < items.length; index += 1) {
    execInsertText({ type: 'insert-text', text: `• ${items[index]}` }, wasm);
    if (index < items.length - 1) {
      execInsertParagraph({}, wasm);
    }
  }
  return { success: true, message: `Inserted ${items.length} bullet items.` };
}

function execWriteNumberedList(action: Action, wasm: WasmBridge): ActionResult {
  const items = Array.isArray(action.items) ? action.items.map((item) => String(item)) : [];
  for (let index = 0; index < items.length; index += 1) {
    execInsertText({ type: 'insert-text', text: `${index + 1}. ${items[index]}` }, wasm);
    if (index < items.length - 1) {
      execInsertParagraph({}, wasm);
    }
  }
  return { success: true, message: `Inserted ${items.length} numbered items.` };
}
