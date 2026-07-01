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

- **캘린더, 통계, 목록, 설정**: 화면 어디서든 스와이프 → 탭 이동
- **홈, 예산**: 스와이프 삭제 아이템이 있어 구분
  - 화면 끝 80px 내 시작 → 탭 이동 (시각적 드래그 애니메이션)
  - 중앙에서 시작 → 45% 이상 쓸면 탭 이동, 미만이면 아이템 스와이프

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

---

# 브랜치 관리

```bash
git add <파일들>
git commit -m "커밋_메시지_언더스코어로"
git push
```
