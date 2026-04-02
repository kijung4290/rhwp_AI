# Changelog

## [0.5.0] - 2026-04-02

### 추가

- HWPX TabDef 파싱: hp:switch 구조, 2× 스케일, fill_type 매핑 (#13)
- 탭 리더 채울 모양 12종 SVG/Canvas 렌더링 (#13)
- 밑줄/취소선 13종 렌더링: 물결선, 이중물결선 포함 (#16)
- HWPX 글상자(사각형) 파싱: curSz/fillBrush/lineShape (#15)
- IR 비교 도구: `rhwp ir-diff` CLI 명령 (#18)
- CSS 디자인 토큰: 색상/타이포그래피/간격 30개 변수 (#22)
- 모바일 반응형 레이아웃: 태블릿/모바일/터치/인쇄 대응 (#22)
- iOS IME 한글 조합: contentEditable div + afterEdit 디바운스
- 글상자 내부 표/그림 렌더링 (#24, #25)

### 수정

- 페이지네이션 부동소수점 누적 오차 0.5px 톨러런스 (#14)
- HWPX 탭 문자 UTF-16 8 code unit 매핑 (#17)
- ParaShape lineSpacing Fixed/SpaceOnly/Minimum 2× 스케일 (#18)
- shape 배경 pattern_type 판정: >=0 → >0 (#16)
- 글상자 기본 treat_as_char=true (#2)
- iOS Canvas 최대 크기 64MP 제한 DPR 자동 조절
- 폭 맞춤/쪽 맞춤 줌: pageInfo 이중 변환 제거
- 글상자 내부 표 너비 비례 축소 (#24)
- 개체묶음 자식 도형 크기 regression 수정 (#27)
- 바탕쪽 탭 리더 렌더링 억제 — 고스트 라인 제거 (#28)
- Canvas 이중선 종류 반전 + 간격 과도 수정 (#28)

## [0.4.0] - 2026-03-31

### 수정

- Fixed 줄간격 TAC 표의 pagination overflow 수정 (#9)
- 비-TAC 어울림 그림의 pagination 높이 반영 (#10)
- TAC 표 line_end 보정에서 ls 이중 추가 제거 (#10)
- HWPX 하이퍼링크 필드의 char_shape 매핑 수정 (#11)
- HWPX 표 속성 UI 바인딩: table.common 필드 직접 사용
- 문단 간격 UI 바인딩: 원본 HWPUNIT 값 사용 (/2.0 제거)
- TAC 표 혼합 문단의 pagination 높이 이중 계산 수정 (#19)
- 강제 줄넘김(Shift+Enter) 후 TAC 표의 ComposedLine 분리 (#20)
- composer: LINE_SEG lh에 표 높이가 포함된 텍스트 줄을 th로 보정

## [0.3.0] - 2026-03-30

### 수정

- HWPX switch/case 네임스페이스 분기 처리 (문단 간격/줄간격 정확도 개선)
- 고정값 줄간격에서 TAC 표와 문단의 병행 배치 지원

## [0.2.0] - 2026-03-30

### 수정

- 셀 내 TAC 이미지가 수평으로 나열되던 문제 수정 (LINE_SEG 기반 수직 배치)
- 비-TAC 그림(어울림 배치) 높이가 후속 요소에 미반영되던 문제 수정

### 추가

- cellzoneList 셀 영역 배경 지원 (이미지/단색/그라데이션, HWP+HWPX)
- imgBrush mode="TOTAL" 파싱 지원

## [0.1.0] - 2026-03-29

### 추가

- HWP/HWPX 파일 읽기 전용 뷰어 (CustomReadonlyEditorProvider)
- Canvas 2D 기반 문서 렌더링 (WASM)
- 가상 스크롤 (on-demand 페이지 렌더링/해제)
- Ctrl+마우스 휠 줌 (0.25x ~ 3.0x, 커서 앵커 기준)
- 상태 표시줄 UI (페이지 네비게이션 + 줌 컨트롤)
- 문서 내 이미지 지연 재렌더링
