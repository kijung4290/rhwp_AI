import type { CommandDef } from '../types';
import { PageSetupDialog } from '@/ui/page-setup-dialog';
import { AboutDialog } from '@/ui/about-dialog';
import { showConfirm } from '@/ui/confirm-dialog';
import { showSaveAs } from '@/ui/save-as-dialog';
import { jsPDF } from 'jspdf';

// File System Access API (Chrome/Edge)
declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
}

export const fileCommands: CommandDef[] = [
  {
    id: 'file:new-doc',
    label: '새로 만들기',
    icon: 'icon-new-doc',
    shortcutLabel: 'Alt+N',
    canExecute: () => true,
    async execute(services) {
      const ctx = services.getContext();
      if (ctx.hasDocument) {
        const ok = await showConfirm(
          '새로 만들기',
          '현재 문서를 닫고 새 문서를 만드시겠습니까?\n저장하지 않은 내용은 사라집니다.',
        );
        if (!ok) return;
      }
      services.eventBus.emit('create-new-document');
    },
  },
  {
    id: 'file:open',
    label: '열기',
    execute() {
      document.getElementById('file-input')?.click();
    },
  },
  {
    id: 'file:save',
    label: '저장',
    icon: 'icon-save',
    shortcutLabel: 'Ctrl+S',
    canExecute: (ctx) => ctx.hasDocument,
    async execute(services) {
      try {
        const saveName = services.wasm.fileName;
        const baseName = saveName.replace(/\.hwp$/i, '').replace(/\.hwpx$/i, '');
        
        const hwpBytes = services.wasm.exportHwp();
        const hwpBlob = new Blob([hwpBytes as unknown as BlobPart], { type: 'application/x-hwp' });

        if ('showSaveFilePicker' in window) {
          try {
            const handle = await window.showSaveFilePicker!({
              suggestedName: saveName,
              types: [
                { description: 'HWP 문서', accept: { 'application/x-hwp': ['.hwp'] } },
                { description: 'PDF 문서', accept: { 'application/pdf': ['.pdf'] } },
                { description: '이미지 (JPEG)', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
                { description: '이미지 (PNG)', accept: { 'image/png': ['.png'] } }
              ],
            });
            
            const fileExt = handle.name.split('.').pop()?.toLowerCase();
            let outputBlob: Blob = hwpBlob;
            const statusEl = document.getElementById('sb-message');
            const origStatus = statusEl?.textContent || '';
            
            if (fileExt === 'pdf' || fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'png') {
                if (statusEl) statusEl.textContent = '파일 변환 준비 중...';
                
                const wasm = services.wasm;
                const pageCount = wasm.pageCount;
                
                if (fileExt === 'pdf') {
                   const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                   for (let i = 0; i < pageCount; i++) {
                       if (statusEl) statusEl.textContent = `PDF 생성 중... (${i + 1}/${pageCount})`;
                       const svgString = wasm.renderPageSvg(i);
                       const pageInfo = wasm.getPageInfo(i);
                       const width = pageInfo.width;
                       const height = pageInfo.height;
                       
                       const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                       const svgUrl = URL.createObjectURL(svgBlob);
                       
                       await new Promise<void>((resolve, reject) => {
                           const img = new Image();
                           img.onload = () => {
                               const canvas = document.createElement('canvas');
                               const scale = 2; // 고해상도
                               canvas.width = width * scale;
                               canvas.height = height * scale;
                               const ctx = canvas.getContext('2d');
                               if (ctx) {
                                   ctx.fillStyle = '#ffffff';
                                   ctx.fillRect(0, 0, canvas.width, canvas.height);
                                   ctx.scale(scale, scale);
                                   ctx.drawImage(img, 0, 0, width, height);
                                   const imgData = canvas.toDataURL('image/jpeg', 0.95);
                                   
                                   const widthMm = width * 25.4 / 96;
                                   const heightMm = height * 25.4 / 96;
                                   
                                   if (i === 0) doc.deletePage(1); // 기본 생성되는 빈 페이지 삭제
                                   doc.addPage([widthMm, heightMm], widthMm > heightMm ? 'l' : 'p');
                                   doc.addImage(imgData, 'JPEG', 0, 0, widthMm, heightMm);
                               }
                               URL.revokeObjectURL(svgUrl);
                               resolve();
                           };
                           img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error('Image render failed')); };
                           img.src = svgUrl;
                       });
                       await new Promise(r => setTimeout(r, 0)); // UI 갱신을 위해 스레드 양보
                   }
                   outputBlob = doc.output('blob');
                } else {
                    // PNG/JPG의 경우 첫 번째 페이지만 출력
                    if (statusEl) statusEl.textContent = `이미지 생성 중...`;
                    const svgString = wasm.renderPageSvg(0);
                    const pageInfo = wasm.getPageInfo(0);
                    const width = pageInfo.width;
                    const height = pageInfo.height;
                    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                    const svgUrl = URL.createObjectURL(svgBlob);
                    
                    outputBlob = await new Promise<Blob>((resolve, reject) => {
                       const img = new Image();
                       img.onload = () => {
                           const canvas = document.createElement('canvas');
                           const scale = 2;
                           canvas.width = width * scale;
                           canvas.height = height * scale;
                           const ctx = canvas.getContext('2d');
                           if (ctx) {
                               ctx.fillStyle = '#ffffff';
                               ctx.fillRect(0, 0, canvas.width, canvas.height);
                               ctx.scale(scale, scale);
                               ctx.drawImage(img, 0, 0, width, height);
                               
                               canvas.toBlob((b) => {
                                   if (b) resolve(b);
                                   else reject(new Error('Blob generation failed'));
                               }, fileExt === 'png' ? 'image/png' : 'image/jpeg', 0.95);
                           } else {
                               reject(new Error('Canvas context failed'));
                           }
                           URL.revokeObjectURL(svgUrl);
                       };
                       img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(); };
                       img.src = svgUrl;
                    });
                }
                
                if (statusEl) statusEl.textContent = origStatus;
            }

            const writable = await handle.createWritable();
            await writable.write(outputBlob);
            await writable.close();
            
            if (fileExt === 'hwp') {
                services.wasm.fileName = handle.name;
            }
            
            console.log(`[file:save] ${handle.name} saved.`);
            return;
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            console.warn('[file:save] File System Access API 실패, 폴백:', e);
          }
        }

        // 폴백 (기본 동작)
        let downloadName = saveName;
        if (services.wasm.isNewDocument) {
          const result = await showSaveAs(baseName);
          if (!result) return;
          downloadName = result;
          services.wasm.fileName = downloadName;
        }

        const url = URL.createObjectURL(hwpBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[file:save] 저장 실패:', msg);
        alert(`파일 저장에 실패했습니다:\n${msg}`);
      }
    },
  },
  {
    id: 'file:page-setup',
    label: '편집 용지',
    icon: 'icon-page-setup',
    shortcutLabel: 'F7',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
      const dialog = new PageSetupDialog(services.wasm, services.eventBus, 0);
      dialog.show();
    },
  },
  {
    id: 'file:print',
    label: '인쇄',
    icon: 'icon-print',
    shortcutLabel: 'Ctrl+P',
    canExecute: (ctx) => ctx.hasDocument,
    async execute(services) {
      const wasm = services.wasm;
      const pageCount = wasm.pageCount;
      if (pageCount === 0) return;

      // 진행률 표시
      const statusEl = document.getElementById('sb-message');
      const origStatus = statusEl?.textContent || '';

      try {
        // SVG 페이지 생성
        const svgPages: string[] = [];
        for (let i = 0; i < pageCount; i++) {
          if (statusEl) statusEl.textContent = `인쇄 준비 중... (${i + 1}/${pageCount})`;
          const svg = wasm.renderPageSvg(i);
          svgPages.push(svg);
          // UI 갱신을 위한 양보
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // 첫 페이지 정보로 용지 크기 결정
        const pageInfo = wasm.getPageInfo(0);
        const widthMm = Math.round(pageInfo.width * 25.4 / 96);
        const heightMm = Math.round(pageInfo.height * 25.4 / 96);

        // 인쇄 전용 창 생성
        const printWin = window.open('', '_blank');
        if (!printWin) {
          alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
          return;
        }

        printWin.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${wasm.fileName} — 인쇄</title>
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  .page { page-break-after: always; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .page svg { width: 100%; height: 100%; }
  @media screen {
    body { background: #e5e7eb; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
    .page { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #1e293b; color: #fff; padding: 8px 16px; display: flex; align-items: center; gap: 12px; font: 14px sans-serif; z-index: 100; }
    .print-bar button { padding: 6px 16px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .print-bar button:hover { background: #1d4ed8; }
    body { padding-top: 56px; }
  }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
<div class="print-bar">
  <button id="print-btn">인쇄</button>
  <button id="close-btn" style="background:#475569">닫기</button>
  <span>${wasm.fileName} — ${pageCount}페이지</span>
</div>
${svgPages.map(svg => `<div class="page">${svg}</div>`).join('\n')}

</body>
</html>`);
        printWin.document.close();

        // CSP 안전: DOM API로 이벤트 바인딩 (인라인 스크립트 사용 안 함)
        printWin.document.getElementById('print-btn')?.addEventListener('click', () => {
          printWin.print();
        });
        printWin.document.getElementById('close-btn')?.addEventListener('click', () => {
          printWin.close();
        });

        if (statusEl) statusEl.textContent = origStatus;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[file:print]', msg);
        if (statusEl) statusEl.textContent = `인쇄 실패: ${msg}`;
      }
    },
  },
  {
    id: 'file:about',
    label: '제품 정보',
    icon: 'icon-help',
    execute() {
      new AboutDialog().show();
    },
  },
];
