# 나의 가계부

```
https://expense-tracker-ajeegq.fly.dev/   ← 배포 주소 (PC 꺼도 24시간 작동)
http://127.0.0.1:5000/                    ← 로컬 개발용
```

---

# 기술 스택

| 구분 | 내용 |
|---|---|
| 프론트엔드 | React 18 + Vite (SPA), react-router-dom v6 |
| 백엔드 | Flask + SQLAlchemy + SQLite |
| 배포 | Fly.io (Docker) |
| 인증 | 이메일 + 비밀번호 (Flask session, werkzeug PBKDF2) |
| 알림 | Web Push API (VAPID), Service Worker |
| 드래그 | @dnd-kit/core (카테고리 순서 변경) |
| 캘린더 | FullCalendar (@fullcalendar/react) |
| 차트 | Chart.js |

---

# 구조

```
Expense_tracker/
├─ app.py               ← Flask REST API 서버
├─ models.py            ← DB 테이블 (User / Transaction / Budget / Category / Card)
├─ requirements.txt
├─ Dockerfile           ← Fly.io 빌드 (Node 빌드 → Python 서빙)
├─ fly.toml
├─ deploy.bat           ← fly deploy 단축 스크립트
│
├─ frontend/
│   ├─ src/
│   │   ├─ App.jsx                  ← 라우팅, 인증 상태
│   │   ├─ api.js                   ← fetch 래퍼 (401 시 로그인 리다이렉트)
│   │   ├─ utils.js                 ← 숫자 포맷, 날짜 포맷, bankLogo
│   │   ├─ index.css                ← 전역 스타일, 반응형 미디어쿼리
│   │   ├─ components/
│   │   │   ├─ Layout.jsx           ← 네비바 + 바텀탭 + 스와이프 제스처
│   │   │   ├─ Navbar.jsx           ← 상단 그라데이션 바 (닉네임의 가계부)
│   │   │   ├─ BottomNav.jsx        ← 하단 탭 바 (예산/캘린더/통계/목록/설정)
│   │   │   ├─ Sidebar.jsx          ← PC 사이드 드로어 + 알림 토글
│   │   │   └─ NotifySheet.jsx      ← 알림 바텀시트
│   │   └─ pages/
│   │       ├─ Home.jsx             ← 홈 (내역 목록, 스와이프 삭제)
│   │       ├─ Budget.jsx           ← 예산 (카드 관리, 실적 추적)
│   │       ├─ Calendar.jsx         ← 캘린더 (날짜 클릭 팝업, 년/월 피커)
│   │       ├─ Stats.jsx            ← 통계 (도넛/막대 차트)
│   │       ├─ Categories.jsx       ← 카테고리 목록 (드래그 순서)
│   │       ├─ Settings.jsx         ← 설정 (로그아웃)
│   │       ├─ Edit.jsx             ← 내역 수정
│   │       └─ Login.jsx            ← 로그인 / 회원가입 / 비밀번호 찾기
│   └─ dist/                        ← 빌드 결과물 (Flask가 서빙)
│
└─ instance/
      └── expense.db    ← 로컬 SQLite DB
```

---

# 탭 구성

| 탭 | 경로 | 설명 |
|---|---|---|
| 홈 | `/` | 월별 내역 목록, 지출/수입 탭 분리, 스와이프 삭제 |
| 예산 | `/budget` | 카드별 잔고·실적 추적, 카드 추가/수정/삭제 |
| 캘린더 | `/calendar` | 월별 캘린더, 날짜 클릭 상세 팝업, 수입/지출 점 도트 |
| 통계 | `/stats` | 도넛 차트, 월별 막대 차트, 카테고리별 지출 |
| 목록 | `/categories` | 카테고리 관리, 드래그 순서 변경 |
| 설정 | `/settings` | 로그아웃 |

---

# 배포

```bash
cd C:\Users\song5\Expense_tracker
fly deploy
```

또는 `deploy.bat` 더블클릭.

Dockerfile 내에서 npm build가 자동 실행됨 — 별도 빌드 불필요.

---

# 인증 구조

- 다중 사용자: 각자 계정 생성, 데이터 완전 분리 (user_id 필터링)
- 세션: Flask session (HTTPOnly, SameSite=Lax, 30일 유지)
- 비밀번호: PBKDF2 해시 (werkzeug)
- 비밀번호 찾기: 이메일 입력 → 6자리 코드 화면 표시 → 코드 입력 → 새 비밀번호 설정

---

# 스와이프 내비게이션 구조

탭 간 좌우 스와이프로 이동 (Layout.jsx 네이티브 touch 리스너):

- **하단 빈 공간 (swipe-nav-zone)**: 모든 탭에서 컨텐츠 아래 90px 빈 공간을 스와이프 → 탭 이동
- **캘린더, 통계, 설정**: 화면 어디서든 스와이프 → 탭 이동
- **홈, 예산, 목록**: 스와이프 아이템이 있어 구분
  - 화면 끝 80px 내 시작 → 탭 이동
  - 중앙에서 시작 → 아이템 스와이프 (수정/삭제)

## 스와이프 아이템 동작

| 탭 | 스와이프 동작 |
|---|---|
| 홈 | 내역 항목: 왼쪽으로 → 삭제, 오른쪽으로 → 수정 |
| 예산 | 카드: 왼쪽으로 → 삭제, 오른쪽으로 → 수정 |
| 목록 | 카테고리: 왼쪽으로 → 삭제, 오른쪽으로 → 수정 편집 폼 열기 |

---

# 업데이트 이력

## React SPA 전환 이전 (레거시 Jinja2 템플릿 시절)

| # | 내용 |
|---|------|
| 1 | 엑셀 가져오기 — `.xlsx`/`.xls` 업로드 → 컬럼 매핑 → 일괄 등록 |
| 2 | 문자 붙여넣기 가져오기 — SMS 자동 파싱 → 미리보기 → 등록 |
| 3 | 카드 자동 인식 — SMS에서 카드명 슬라이딩 윈도우 매칭 |
| 4 | 카드별 실적 관리 — 월 목표 금액, 3단계 구간(tier) 설정, 프로그레스바 |
| 5 | 카테고리 지출/수입 분리, 드래그 순서 변경 |
| 6 | PWA 푸시 알림 — 매일 정해진 시간에 가계부 작성 알림 |
| 7 | Fly.io 클라우드 배포 |

## React SPA 전환 후

| # | 내용 |
|---|------|
| 8 | React 18 + Vite SPA로 전면 재작성, Flask JSON REST API |
| 9 | react-router-dom v6 SPA 라우팅, 페이지 슬라이드 애니메이션 |
| 10 | 탭 간 좌우 스와이프 제스처 내비게이션 |
| 11 | 바텀 탭: 예산/캘린더/통계/목록/설정 |
| 12 | 카드 관리를 예산 탭으로 통합, AddSheet 바텀시트로 카드 추가 |
| 13 | FullCalendar 연동 — 날짜 클릭 팝업 (수입/지출 점 도트, 상세 목록) |
| 14 | 캘린더 년/월 피커 — 클릭으로 년도 그리드/월 그리드 선택 |
| 15 | 캘린더 요일 색상 — 월~금 검정, 토 파랑, 일 빨강 |
| 16 | 다중 사용자 인증 — 이메일+비밀번호 회원가입/로그인, 데이터 완전 분리 |
| 17 | 비밀번호 찾기 — 이메일 입력 → 6자리 코드 → 새 비밀번호 |
| 18 | Galaxy Z Fold 펼쳤을 때 양 옆 여백 추가 (480–991px 구간) |
| 19 | PC 레이아웃 최대 너비 제한 + 중앙 정렬 |
| 20 | iOS 스타일 알림 토글 + 시간 설정 (Sidebar) |

## 최근 변경 (2026-07-02)

| # | 내용 |
|---|------|
| 21 | 회원가입 닉네임 필드 추가 — 상단 "닉네임의 가계부"로 표시 (Navbar, Sidebar) |
| 22 | PC 최대 너비 확장 860px → 1100px (여백 약 절반으로 감소) |
| 23 | 예산 카드 추가 시트 — 추가하기 버튼이 하단 탭바에 가려지던 문제 수정 |
| 24 | 스와이프 내비게이션 개선 — 목록 탭 DnD TouchSensor 제거 (touch 이벤트 간섭 해결) |
| 25 | 스와이프 내비게이션 개선 — 예산/홈 itemSwipe silent tracking (45% 임계값) |
| 26 | 스와이프 엣지 감지 범위 50px → 80px |
| 27 | 로그인 화면 아래로 스크롤 방지 (position: fixed) |
| 28 | 설정 탭 — 닉네임 변경 기능 추가 |
| 29 | 설정 탭 — 회원 탈퇴 기능 추가 (이메일 확인 후 전체 데이터 삭제) |
| 30 | 스와이프 감지 개선 — 세로 움직임 허용 범위 확대, 탭 이동 임계값 28%/35%로 하향 |
| 31 | 카테고리 탭 — 스와이프로 수정/삭제 (왼쪽: 삭제, 오른쪽: 수정) |
| 32 | 탭 이동 스와이프 — 하단 빈 공간(swipe-nav-zone) 에서 스와이프 시 탭 이동 가능 (카드와 충돌 없음) |

## 최근 변경 (2026-07-03) — 포트폴리오 PDF 전면 개선

| # | 내용 |
|---|------|
| 33 | 포트폴리오 PDF 섹션 헤더 — 보라색(`#f0eaff`) 배경 + 테두리 카드 박스(`border:1.5px solid #e0d0fd; border-radius:14px`) |
| 34 | 자산 추이 % 표시 수정 — 전월 자산이 0원일 때 `(신규)` 표시 (0÷0 오류 방지) |
| 35 | PDF 비율 바 수정 — CSS `width:%` 대신 픽셀 기반(`100px` 컨테이너)으로 교체하여 인쇄 시 렌더링 보장 |
| 36 | 자산 구성 컬러 범례 추가 — 각 자산 유형별 색상 사각형(SVG) + 금액 + 비율 + 진행 바 세로 배치 |
| 37 | 실제 은행 로고 적용 — 카드/예적금 패널에서 🏦 이모티콘 → `/static/cards/*.png` 이미지로 교체 (26개 은행 자동 감지) |
| 38 | 범례 색상 SVG 교체 — CSS `background` 대신 SVG `<rect fill>` 사용으로 PDF 저장 시 색상 유지 |
| 39 | `print-color-adjust: exact` 추가 — CSS 배경색도 인쇄 시 강제 적용 |
| 40 | 섹션 선택 UI 개선 — 체크박스 → 보라색 칩 버튼 (선택 시 `#f0eaff` 배경 + 체크마크) |
| 41 | PDF 저장 버튼 추가 — 미리보기 페이지 우상단 고정 보라색 "⬇ PDF 저장" 버튼 (인쇄 시 자동 숨김) |
| 42 | 카드 예산 진행 바 라벨 — `0` → `0원` 표시 |
| 43 | PDF 내 은행 로고 절대 URL 처리 — `window.location.origin` 기반 절대 경로로 about:blank 환경에서도 이미지 로드 보장 |
| 44 | 포트폴리오 미리보기 방식 변경 — 자동 인쇄 제거, 사용자가 미리보기 확인 후 PDF 저장 버튼으로 수동 저장 |
| 45 | `app.py` `api_portfolio_pdf` 전면 재작성 — `buildPortfolioHTML`과 동일한 CSS/구조로 통일 (shell 뽑기·앱 뽑기 디자인 일치) |

---

# 브랜치 관리

```bash
git add <파일들>
git commit -m "커밋_메시지_언더스코어로"
git push
```
