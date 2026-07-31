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
| 알림 | Web Push API (VAPID) + FCM (Firebase Cloud Messaging) |
| 네이티브 앱 | Capacitor (Android APK, gaegyebu.fly.dev 원격 로드) |
| 위젯 | Android AppWidgetProvider (4종 위젯, WidgetConfigActivity) |
| 드래그 | @dnd-kit/core (카테고리 순서 변경) |
| 캘린더 | FullCalendar (@fullcalendar/react) |
| 차트 | Chart.js |

---

# 구조

```
Expense_tracker/
├─ app.py               ← Flask REST API 서버 (전체 엔드포인트)
├─ models.py            ← DB 테이블 (User / Transaction / Category / Card /
│                          Savings / SavingsDeposit / Investment / Budget /
│                          SalaryConfig / BudgetAllocation / FixedExpense /
│                          Notice / HelpItem / AppConfig / LoanRepayment /
│                          Routine / RoutineItem)
├─ requirements.txt
├─ Dockerfile           ← Fly.io 빌드 (Node 빌드 → Python 서빙)
├─ fly.toml
├─ deploy.bat           ← fly deploy 단축 스크립트
│
├─ frontend/
│   ├─ index.html
│   ├─ vite.config.js
│   ├─ package.json
│   ├─ src/
│   │   ├─ main.jsx                  ← React 진입점
│   │   ├─ App.jsx                   ← 라우팅, 인증 상태
│   │   ├─ api.js                    ← fetch 래퍼 (401 시 로그인 리다이렉트)
│   │   ├─ utils.js                  ← fmt / fmtDate / bankColor / bankLogo 등 유틸
│   │   ├─ index.css                 ← 전역 스타일, 반응형 미디어쿼리, CSS 변수 토큰
│   │   ├─ config/
│   │   │   ├─ updateNotice.js       ← 인앱 업데이트 공지 (버전·날짜·항목·VERSION_HISTORY)
│   │   │   └─ helpContent.js        ← 설정 탭 도움말 내용 (탭별 설명)
│   │   ├─ components/
│   │   │   ├─ Layout.jsx            ← 네비바 + 바텀탭 + 좌우 스와이프 제스처
│   │   │   ├─ Navbar.jsx            ← 상단 그라데이션 바 (닉네임의 가계부)
│   │   │   ├─ BottomNav.jsx         ← 하단 탭 바 (홈/예산/캘린더/통계/월급/설정)
│   │   │   ├─ Sidebar.jsx           ← PC 사이드 드로어 + 알림 토글 + 드럼 시간 피커
│   │   │   ├─ NotifySheet.jsx       ← 알림 바텀시트
│   │   │   ├─ UpdateNoticeModal.jsx ← 인앱 업데이트 공지 바텀시트 모달
│   │   │   ├─ TxItem.jsx            ← 내역 항목 공통 컴포넌트 (카드배지·카테고리이모지·금액)
│   │   │   ├─ SwipeItem.jsx         ← 스와이프 삭제·수정 공통 컴포넌트 (홈·캘린더 공유)
│   │   │   ├─ CategoryPicker.jsx    ← 카테고리 선택 커스텀 바텀시트
│   │   │   ├─ CardPicker.jsx        ← 카드/계좌 선택 커스텀 바텀시트
│   │   │   ├─ DatePickerSheet.jsx   ← 커스텀 날짜 피커 팝업 (달력 그리드 + 연도 드럼)
│   │   │   ├─ TransferPicker.jsx    ← 계좌 이체 보내는·받는 계좌 선택 바텀시트
│   │   │   └─ YearDrum.jsx          ← 연도 드럼 스크롤 피커 (캘린더·통계·DatePickerSheet 공유)
│   │   └─ pages/
│   │       ├─ Home.jsx              ← 홈 (이번달 내역 목록, 스와이프 삭제·수정, 루틴 칩)
│   │       ├─ Budget.jsx            ← 예산 (카드·예적금·청약·투자 잔고, 실적 추적, 연결 계좌)
│   │       ├─ Calendar.jsx          ← 캘린더 (FullCalendar, 날짜 팝업, 월별 내역 목록)
│   │       ├─ Stats.jsx             ← 통계 (도넛 차트, 월별 막대 차트, 자산 추이)
│   │       ├─ Salary.jsx            ← 월급 (월급 설정, 카테고리 예산 배분, 고정 지출·자동 등록)
│   │       ├─ Categories.jsx        ← 카테고리 목록 (드래그 순서, 실적·통계 제외 설정)
│   │       ├─ Settings.jsx          ← 설정 (편의기능, 포트폴리오 PDF, 도움말, 공지, 보안)
│   │       ├─ Edit.jsx              ← 내역 수정 (거래 편집 폼)
│   │       └─ Login.jsx             ← 로그인 / 회원가입 / 비밀번호 찾기
│   │
│   └─ android/                      ← Capacitor Android 프로젝트 (Android Studio로 열기)
│       └─ app/src/main/
│           ├─ AndroidManifest.xml          ← 액티비티·리시버·권한 선언
│           ├─ java/com/gaegyebu/app/
│           │   ├─ MainActivity.java        ← Capacitor 앱 진입점, FCM 채널 생성
│           │   ├─ WidgetConfigActivity.java← 위젯 설정 화면 (테마·모양 선택, 실시간 미리보기)
│           │   ├─ WidgetTheme.java         ← 위젯 테마/모양 상수 및 SharedPreferences 헬퍼
│           │   ├─ WidgetDataPlugin.java    ← JS↔Java 브릿지 (위젯 데이터 전달)
│           │   ├─ CompactWidget.java       ← 3×1 간편 위젯 (잔액·수입·지출)
│           │   ├─ BudgetWidget.java        ← 2×2 예산 링 위젯 (링 그래프)
│           │   ├─ DashboardWidget.java     ← 4×2 대시보드 위젯 (막대 그래프)
│           │   └─ TodayWidget.java         ← 3×2 오늘 지출 위젯
│           └─ res/
│               ├─ layout/
│               │   ├─ activity_widget_config.xml ← 위젯 설정 화면 레이아웃
│               │   ├─ widget_compact.xml          ← 간편 위젯 레이아웃
│               │   ├─ widget_budget.xml           ← 예산 위젯 레이아웃
│               │   ├─ widget_dashboard.xml        ← 대시보드 위젯 레이아웃
│               │   └─ widget_today.xml            ← 오늘 위젯 레이아웃
│               ├─ xml/
│               │   ├─ widget_compact_info.xml     ← 간편 위젯 메타데이터 (크기·업데이트 주기)
│               │   ├─ widget_budget_info.xml      ← 예산 위젯 메타데이터
│               │   ├─ widget_dashboard_info.xml   ← 대시보드 위젯 메타데이터
│               │   └─ widget_today_info.xml       ← 오늘 위젯 메타데이터
│               ├─ values/
│               │   ├─ config_colors.xml           ← 위젯 설정 화면 라이트모드 색상
│               │   └─ styles.xml                  ← AppTheme.NoActionBar (DayNight 테마)
│               └─ values-night/
│                   └─ config_colors.xml           ← 위젯 설정 화면 다크모드 색상 오버라이드
│
├─ static/
│   ├─ manifest.json    ← PWA 매니페스트
│   ├─ sw.js            ← 서비스 워커 (푸시 알림 수신)
│   ├─ push.js          ← 푸시 구독 등록 로직
│   ├─ prefetch.js      ← 리소스 프리페치
│   └─ cards/           ← 은행 로고 이미지 26종 (포트폴리오 PDF용)
│
├─ templates/           ← 엑셀·문자 가져오기 Jinja2 페이지 (Flask 직접 렌더링)
│   ├─ import_base.html          ← 공통 베이스 템플릿 (상단바·CSS 변수·다크모드)
│   ├─ import_categorize.html   ← 행별 카테고리·카드 선택 화면
│   ├─ import_map.html          ← 컬럼 매핑 화면
│   └─ import_text_preview.html ← SMS 파싱 미리보기 화면
│
└─ instance/
      └─ expense.db    ← 로컬 SQLite DB
```

---

# 탭 구성

| 탭 | 경로 | 설명 |
|---|---|---|
| 홈 | `/` | 이번달 내역 목록, 지출/수입 탭 분리, 스와이프 삭제·수정, 카테고리별 지출, 루틴 칩 |
| 예산 | `/budget` | 카드·예적금·청약·투자 잔고 및 실적 추적, 연결 계좌 |
| 캘린더 | `/calendar` | 월별 캘린더, 날짜 클릭 상세 팝업, 수입/지출 점 도트 |
| 통계 | `/stats` | 도넛 차트, 월별 막대 차트(지출/수입/전체), 자산 추이, 통계 제외 필터링 |
| 월급 | `/salary` | 월급 설정, 카테고리별 예산 배분, 고정 지출·자동 등록 |
| 설정 | `/settings` | 포트폴리오 PDF, 도움말, 업데이트 내역, 카테고리 관리, 루틴 관리, 공지사항, 보안 |

---

# 배포

```bash
cd C:\Users\song5\Expense_tracker
fly deploy
```

또는 `deploy.bat` 더블클릭.

Dockerfile 내에서 npm build가 자동 실행됨 — 별도 빌드 불필요.

---

# 🛠 기능별 수정 가이드

어떤 기능을 고치려면 어느 파일을 열어야 하는지 정리.

---

## 업데이트 내역 (인앱 팝업)

**수정 파일:** `frontend/src/config/updateNotice.js`

| 항목 | 코드 위치 |
|---|---|
| 현재 버전 번호 | `export const CURRENT_VERSION = 'ver X.XX'` |
| 업데이트 날짜 | `export const UPDATE_DATE = '20XX년 X월 X일'` |
| 이번 버전 내용 | `export const UPDATES = [...]` |
| 이전 버전 기록 | `export const VERSION_HISTORY = [...]` 맨 앞에 추가 |

버전이 바뀌면 배포 후 앱을 열 때 자동으로 팝업됨.

UPDATES / VERSION_HISTORY 항목 구조:
```js
{
  section: '📊 통계',
  items: [
    { tag: 'new', title: '기능 이름', desc: '설명\n— 줄바꿈은 \\n으로' },
    { tag: 'imp', title: '개선 사항', desc: '...' },
    { tag: 'fix', title: '버그 수정', desc: '...' },
  ]
}
```

| tag | 배지 색상 |
|---|---|
| `new` | 보라 (신기능) |
| `imp` | 파랑 (개선) |
| `fix` | 분홍 (버그수정) |

> 앱 내 편집도 가능: 설정 탭 → 🆕 업데이트 내역 → 우상단 편집 버튼 (관리자 계정만)

---

## 도움말

**수정 파일:** `frontend/src/config/helpContent.js`

탭별 도움말 텍스트가 배열로 정의되어 있음. 각 항목은 `{ icon, title, desc }` 형태.

> 앱 내 편집도 가능: 설정 탭 → ❓ 도움말 → 항목 오른쪽 편집 버튼 (관리자 계정만)

---

## 설정 탭 UI

**수정 파일:** `frontend/src/pages/Settings.jsx`

| 기능 | 위치 (grep 키워드) |
|---|---|
| 편의 기능 (화면 테마 + 피드백) | `편의 기능` |
| 업데이트 내역 버튼 | `showUpdateNotice` |
| 포트폴리오 PDF 버튼 | `포트폴리오` |
| 도움말 카드 | `helpItem` |
| 공지사항 카드 | `notices` |
| 카테고리 관리 링크 | `/categories` |
| 루틴 관리 링크 | `/routines` |
| 보안 섹션 (닉네임·비밀번호·탈퇴) | `securityOpen` |

---

## 홈 탭 내역 추가 / 목록

**수정 파일:** `frontend/src/pages/Home.jsx`

| 기능 | 위치 |
|---|---|
| 내역 추가 바텀시트 | `showAdd` state |
| 루틴 칩 행 | `routines` 렌더링 부분 |
| 날짜별 그룹화 목록 | `groupedTxs` 로직 |
| 카테고리별 지출 목록 | `catStats` 렌더링 |
| 실적 바 카드 목록 | `perfCards` 렌더링 |

---

## 내역 공통 컴포넌트

**수정 파일:** `frontend/src/components/TxItem.jsx`

홈·캘린더 양쪽에서 공유하는 내역 한 줄 표시 컴포넌트.
- 카드 배지, 카테고리 이모지, 실적제외·통계제외 배지, 금액 색상

**수정 파일:** `frontend/src/components/SwipeItem.jsx`

스와이프 삭제·수정 래퍼. 홈·캘린더 공유.
- 왼쪽 스와이프 → 삭제, 오른쪽 스와이프 → 수정

---

## 카테고리 선택 바텀시트

**수정 파일:** `frontend/src/components/CategoryPicker.jsx`

내역 추가·수정·고정지출·루틴 등 카테고리 선택 시 열리는 커스텀 바텀시트.

---

## 카드/계좌 선택 바텀시트

**수정 파일:** `frontend/src/components/CardPicker.jsx`

내역 추가·수정·고정지출 등 카드 선택 시 열리는 커스텀 바텀시트.

---

## 날짜 피커

**수정 파일:** `frontend/src/components/DatePickerSheet.jsx`

홈·캘린더·수정·예산 탭의 날짜 입력에 사용하는 커스텀 달력 팝업.

**수정 파일:** `frontend/src/components/YearDrum.jsx`

연도 드럼 스크롤 피커. DatePickerSheet·통계·PC 사이드바 알림 시간 공유.

---

## 스와이프 탭 내비게이션

**수정 파일:** `frontend/src/components/Layout.jsx`

- 탭 이동 감지 로직 (`touchstart` / `touchend` 핸들러)
- `swipe-nav-zone`: 하단 빈 공간에서 스와이프 시 탭 이동
- 화면 끝 80px 내 시작 → 탭 이동 / 중앙 시작 → 아이템 스와이프

---

## 상단 네비바

**수정 파일:** `frontend/src/components/Navbar.jsx`

- 상단 그라데이션 바, 닉네임 표시, 검색 아이콘

---

## 하단 탭바

**수정 파일:** `frontend/src/components/BottomNav.jsx`

- 탭 아이콘·레이블·경로 목록
- 탭 추가 시 여기에 항목 추가 + `App.jsx`에 `<Route>` 추가

---

## 전역 스타일 / 다크모드

**수정 파일:** `frontend/src/index.css`

- CSS 변수 토큰: `--bg-card`, `--text-primary`, `--border-light` 등
- 라이트 기본값 → `@media (prefers-color-scheme: dark)` 오버라이드 → `[data-theme]` 수동 오버라이드
- 새 색상 변수 추가 시 라이트·다크 양쪽 다 정의해야 함

---

## Flask API 엔드포인트

**수정 파일:** `app.py`

모든 REST API가 한 파일에 있음. 엔드포인트 검색은 `@app.route` 기준으로 grep.

**수정 파일:** `models.py`

DB 테이블 정의. 컬럼 추가 시 모델에 추가 후 `db.create_all()` (자동 실행됨).

---

## Android 위젯 — 데이터 흐름

```
React (JS) → WidgetDataPlugin.java → SharedPreferences("gaegyebu_widget")
                                    ← CompactWidget / BudgetWidget / DashboardWidget / TodayWidget 읽어서 표시
```

**JS에서 위젯 데이터 업데이트하는 곳:** `frontend/src/pages/Home.jsx`
- `window.WidgetData?.update(...)` 호출

**브릿지:** `frontend/android/app/src/main/java/com/gaegyebu/app/WidgetDataPlugin.java`
- JS에서 넘어온 데이터를 SharedPreferences에 저장
- 저장 키: `month`, `income`, `expense`, `balance`, `budget`, `updated`

---

## Android 위젯 — 각 위젯 수정

| 위젯 | Java 파일 | 레이아웃 XML | 메타데이터 XML |
|---|---|---|---|
| 3×1 간편 | `CompactWidget.java` | `res/layout/widget_compact.xml` | `res/xml/widget_compact_info.xml` |
| 2×2 예산 링 | `BudgetWidget.java` | `res/layout/widget_budget.xml` | `res/xml/widget_budget_info.xml` |
| 4×2 대시보드 | `DashboardWidget.java` | `res/layout/widget_dashboard.xml` | `res/xml/widget_dashboard_info.xml` |
| 3×2 오늘 지출 | `TodayWidget.java` | `res/layout/widget_today.xml` | `res/xml/widget_today_info.xml` |

**위젯 크기·업데이트 주기 변경:** 각 `widget_*_info.xml`의 `minWidth`, `minHeight`, `updatePeriodMillis` 수정

**위젯 레이아웃 변경:** 각 `widget_*.xml` 수정 → Java에서 `RemoteViews`로 바인딩하는 ID도 함께 수정

**위젯 배경색·테마 로직:** `WidgetTheme.java`
- `isDark()`, `primary()`, `income()`, `expense()` 등 색상 헬퍼

---

## Android 위젯 설정 화면

사용자가 홈 화면에서 위젯 추가 시 자동으로 열리는 설정 화면.

**수정 파일:** `WidgetConfigActivity.java`

| 기능 | 메서드 |
|---|---|
| 화면 진입, 위젯 타입 감지 | `onCreate()` → `AppWidgetManager.getAppWidgetInfo()` |
| 미리보기 업데이트 | `updatePreview()` — 위젯 레이아웃 inflate 후 실제 데이터 바인딩 |
| 테마 선택 체크 표시 | `updateThemeChecks()` |
| 모양 선택 체크 표시 | `updateShapeChecks()` |
| 저장 후 위젯 갱신 | `save()` |

**수정 파일:** `res/layout/activity_widget_config.xml`
- 위젯 설정 화면 전체 레이아웃

**수정 파일:** `res/values/config_colors.xml` (라이트), `res/values-night/config_colors.xml` (다크)
- `config_bg`, `config_text`, `config_hint`, `config_divider`, `config_cancel` 색상

**다크/라이트 테마 적용 방법:**
- `AndroidManifest.xml`에서 `WidgetConfigActivity`에 `android:theme="@style/AppTheme.NoActionBar"` 적용
- `styles.xml`의 `AppTheme.NoActionBar`가 `Theme.AppCompat.DayNight.NoActionBar` 상속
- 상태바 아이콘 색상: `WidgetConfigActivity.onCreate()`에서 `WindowInsetsControllerCompat.setAppearanceLightStatusBars()` 호출

---

## Android 위젯 — 새 위젯 추가하는 방법

1. **Java 파일 생성:** `XXXWidget.java` — `AppWidgetProvider` 상속, `updateWidget()` 구현
2. **레이아웃 XML 생성:** `res/layout/widget_xxx.xml`
3. **메타데이터 XML 생성:** `res/xml/widget_xxx_info.xml` — `configure` 속성에 `WidgetConfigActivity` 지정
4. **Manifest 등록:** `AndroidManifest.xml`에 `<receiver>` 추가
5. **설정 미리보기 추가:** `WidgetConfigActivity.java`의 `updatePreview()` — `widgetClass.contains("XXX")` 조건 분기 추가
6. **저장 시 갱신 추가:** `save()` 메서드에 `XXXWidget.updateWidget(...)` 분기 추가

---

## Android 앱 빌드 / APK

```
Android Studio에서 frontend/android/ 폴더 열기
→ Build > Generate Signed APK
```

위젯·네이티브 기능 변경 시 APK 재빌드·재설치 필요.
JS/React 변경만 있으면 `fly deploy` 만으로 자동 반영됨 (원격 로드 방식).

---

## 인앱 업데이트 공지 수정 방법

**앱 안에서 직접 편집 가능** (관리자 계정 `song57290@gmail.com` 로그인 필요)

1. 설정 탭 → 🆕 업데이트 내역 버튼 클릭
2. 모달 우상단 **편집** 버튼 클릭
3. 버전·날짜 입력, UPDATES JSON 수정 후 저장

버전 규칙:

| 변경 규모 | 예시 |
|---|---|
| 대형 업데이트 (새 탭, 전면 개편) | `ver 3.0` |
| 기능 추가 (몇 가지 새 기능) | `ver 2.30` |
| 버그 수정·소소한 개선 | `ver 2.22` |

---

## 도움말 내용 수정 방법

**앱 안에서 직접 편집 가능** (관리자 계정 `song57290@gmail.com` 로그인 필요)

1. 설정 탭 → ❓ 도움말 섹션 펼치기
2. 수정할 탭 항목 오른쪽 **편집** 버튼 클릭
3. 이모지·탭이름·설명 수정 후 저장

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

## 2026-07-02

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

## 2026-07-03 — 포트폴리오 PDF 전면 개선

| # | 내용 |
|---|------|
| 33 | 포트폴리오 PDF 섹션 헤더 — 보라색(`#f0eaff`) 배경 + 테두리 카드 박스 |
| 34 | 자산 추이 % 표시 수정 — 전월 자산이 0원일 때 `(신규)` 표시 (0÷0 오류 방지) |
| 35 | PDF 비율 바 수정 — CSS `width:%` 대신 픽셀 기반으로 교체하여 인쇄 시 렌더링 보장 |
| 36 | 자산 구성 컬러 범례 추가 — 각 자산 유형별 색상 사각형(SVG) + 금액 + 비율 + 진행 바 세로 배치 |
| 37 | 실제 은행 로고 적용 — 카드/예적금 패널에서 🏦 이모티콘 → `/static/cards/*.png` 이미지로 교체 (26개 은행 자동 감지) |
| 38 | 범례 색상 SVG 교체 — CSS `background` 대신 SVG `<rect fill>` 사용으로 PDF 저장 시 색상 유지 |
| 39 | `print-color-adjust: exact` 추가 — CSS 배경색도 인쇄 시 강제 적용 |
| 40 | 섹션 선택 UI 개선 — 체크박스 → 보라색 칩 버튼 |
| 41 | PDF 저장 버튼 추가 — 미리보기 페이지 우상단 고정 보라색 "⬇ PDF 저장" 버튼 |
| 42 | 카드 예산 진행 바 라벨 — `0` → `0원` 표시 |
| 43 | PDF 내 은행 로고 절대 URL 처리 — `window.location.origin` 기반 절대 경로 |
| 44 | 포트폴리오 미리보기 방식 변경 — 자동 인쇄 제거, 사용자가 미리보기 확인 후 수동 저장 |
| 45 | `app.py` `api_portfolio_pdf` 전면 재작성 — `buildPortfolioHTML`과 동일한 CSS/구조로 통일 |

## 2026-07-04

| # | 내용 |
|---|------|
| 46 | 카드 URL 저장 버그 수정 — PUT `/api/cards/<id>` 및 GET `/api/budget` 응답에 `url` 필드 누락 수정 |
| 47 | 카드 혜택 링크 위치 변경 — 하단 별도 줄 → 카드 이름 옆 밑줄 "혜택" 링크로 변경 |
| 48 | 공지사항 기능 추가 — 설정 탭에 공지사항 카드 추가 (작성/삭제는 관리자만 가능) |
| 49 | 앱 실행 시 공지 팝업 — 새 공지가 있으면 팝업 표시 |
| 50 | 설정 보안 탭 — 닉네임·비밀번호·로그아웃·회원탈퇴를 🔒 보안 섹션 안에 접기/펼치기로 통합 |
| 51 | 비밀번호 찾기 이메일 발송 — Gmail SMTP로 인증번호 이메일 발송 |

## 2026-07-05

| # | 내용 |
|---|------|
| 52 | 엑셀 가져오기 카테고리 선택 단계 추가 |
| 53 | 엑셀 가져오기 오류 항목 상세 표시 |
| 54 | 엑셀 가져오기 일괄 적용 버튼 |
| 55 | 엑셀 가져오기 카드 선택 |
| 56 | 홈 내역 목록 이번 달 필터링 |
| 57 | 자산별 잔고 이번 달 기준 수정 |
| 58 | 마우스 스와이프 지원 추가 |
| 59 | 카테고리 PC 드래그 순서 변경 — MouseSensor 추가 |
| 60 | 카테고리 수정 강조 효과 — 그림자 + 보라색 텍스트 |
| 61 | 카테고리 드래그 중 수정/삭제 패널 숨김 |
| 62 | 카테고리 추가 폼 한 줄 레이아웃 |
| 63 | 카테고리 이모지 placeholder 적용 |
| 64 | 문자 붙여넣기 카테고리 순서 수정 |
| 65 | iOS 홈 인디케이터 safe-area 처리 |
| 66 | 엑셀 탭 React 상태 전환 |
| 67 | 엑셀 양식 다운로드 버튼 오른쪽 정렬 |
| 68 | 파일 선택 버튼 스타일 개선 |
| 69 | 사이드바 "목록" → "카테고리" 레이블 수정 |
| 70 | 도움말 내용 최신화 |
| 71 | TWA Android 패키지 설정 |
| 72 | manifest.json 보강 |

## 2026-07-06

| # | 내용 |
|---|------|
| 73 | 통계 월별 추이 — 지출/수입 토글 추가 |
| 74 | 통계 날짜 범위 피커 — 커스텀 년/월 피커로 교체 |
| 75 | 통계 바 차트 너비 — 비율 기반으로 전환 |
| 76 | 총 자산 추이 전월 대비 — breakdown 칩으로 표시 |
| 77 | 자산 상세 모달 — 월별 변화액 클릭 시 세부 변화 칩 |
| 78 | 자산 상세 모달 — 최고/최저 뱃지 위치 개선 |
| 79 | 카테고리별 지출 범례 — 3열 그리드, 원형 도트 |
| 80 | 예산 카드 수정 — 색상 구간 % 기준 직접 변경 가능 |
| 81 | 공지사항 수정 기능 — 관리자 수정 버튼 추가 |
| 82 | 하단 바 보라색 제거 |
| 83 | 도움말 최신화 |
| 84 | 청약 간소화 |

## 2026-07-07

| # | 내용 |
|---|------|
| 85 | 통계 월별 추이 — 전체 모드 추가 |
| 86 | 통계 월별 추이 — 월 사이 세로 구분선 추가 |
| 87 | 홈탭 카테고리 지출 — 금액·% 독립 열 우측 정렬 |
| 88 | 포트폴리오 PDF — 자산 구성 항목 금액 내림차순 |
| 89 | 포트폴리오 PDF — 자산 구성에서 카드잔고 제외 |
| 90 | 포트폴리오 PDF — 카드 달성률 바 색상 파란색 그라데이션 |
| 91 | 포트폴리오 PDF — 거래내역 섹션 기본 OFF |
| 92 | 인앱 업데이트 공지 — UpdateNoticeModal 바텀시트 추가 |
| 93 | 설정 탭 전체 애니메이션 추가 |
| 94 | 업데이트 공지 config 분리 — `updateNotice.js` |
| 95 | 업데이트 공지 버전 형식 변경 — 날짜 형식 → 버전 번호 |
| 96 | 도움말 config 분리 — `helpContent.js` |
| 97 | DB 모델 추가 — `HelpItem`, `AppConfig` |
| 98 | 도움말 인앱 편집 |
| 99 | 업데이트 공지 인앱 편집 |
| 100 | 업데이트 공지 편집 태그 힌트 |
| 101 | 월급 관리 탭 신설 |
| 102 | DB 모델 추가 — `SalaryConfig`, `BudgetAllocation`, `FixedExpense` |
| 103 | 월급 관리 API 추가 |
| 104 | 하단 내비 카테고리 탭 → 월급 탭으로 교체 |
| 105 | 포트폴리오 카드·계좌 색상 변경 — 보라색 그라데이션 |
| 106 | 투자 1주당 평단가·현재가 표시 |
| 107 | 해외주식 투자 편집 폼 수정 |
| 108 | 투자 카드 항목 순서 변경 |
| 109 | 설정 탭 카테고리 관리 버튼 추가 |

## 2026-07-09

| # | 내용 |
|---|------|
| 110 | 청약 추가 입금 기능 |
| 111 | DB 모델 추가 — `SavingsDeposit` |
| 112 | 고정 지출 자동 등록 |
| 113 | DB 컬럼 추가 — `FixedExpense`에 `auto_register`, `tx_type`, `tx_card` |
| 114 | 월급 입력 UX 개선 — 콤마 자동 삽입, 단위 suffix |
| 115 | 청약 납입일 푸시 알림 |
| 116 | DB 컬럼 추가 — `Savings`에 `notify_day` |
| 117 | 예산 배분 원화 입력 |
| 118 | 예산 배분 카테고리 선택형 |
| 119 | 적금·청약 자동이체 등록 |
| 120 | 자동이체 고정 지출 연동 |
| 121 | 청약 이자 지원 |
| 122 | 이율 입력 UX 개선 |
| 123 | 업데이트 내역 버전 분리 — `VERSION_HISTORY` 배열 추가 |
| 124 | 업데이트 모달 이전 버전 접기/펼치기 |
| 125 | 업데이트 모달 자동 팝업 수정 |

## 2026-07-10 — ver 2.24

| # | 내용 |
|---|------|
| 126 | 카드 실적 제외 (거래별) |
| 127 | 카드 실적 제외 (카테고리별) |
| 128 | 카드 실적 자동 감지 |
| 129 | DB 컬럼 추가 — `Transaction`, `Category`에 `exclude_perf` |
| 130 | 대출·빚 음수 잔고 지원 |
| 131 | ISA 일반형·서민형 세금 구분 |
| 132 | ISA 예금·적금 안내 문구 |
| 133 | 기존 ISA 서브타입 마이그레이션 |
| 134 | 투자 계좌 종류 추가 |
| 135 | DB 컬럼 추가 — `Investment`에 `account_type` |
| 136 | 포트폴리오 해외주식 금액 버그 수정 |
| 137 | 통계 자산 구성 대출 표시 |
| 138 | 통계 자산 구성 현금 표시 |
| 139 | 포트폴리오 PDF 자산 구성 개선 |
| 140 | 연결 계좌 기능 |
| 141 | 연결 카드 잔고 계산 |
| 142 | 연결 카드 UI |
| 143 | 연결 계좌 추가 폼 |
| 144 | 이중 계산 방지 |
| 145 | 도움말 업데이트 (ver2.24b) |
| 146 | 업데이트 내역 업데이트 (ver 2.24b) |

## 2026-07-11 — ver 2.25

| # | 내용 |
|---|------|
| 147 | 통계 제외 기능 (거래별) |
| 148 | 통계 제외 기능 (카테고리별) |
| 149 | DB 컬럼 추가 — `Transaction`, `Category`에 `exclude_stats` |
| 150 | 통계 탭 자동 필터링 |
| 151 | 포트폴리오 PDF OOM 수정 |
| 152 | 도움말·업데이트 내역 업데이트 |
| 153 | 청약 납입 회차 수정 |
| 154 | 청약 일시정지 |

## 2026-07-11 — ver 2.26 ~ 2.29

| # | 내용 |
|---|------|
| 155 | 청약 납입 회차 수동 설정 |
| 156 | 청약·적금 일시정지 |
| 157 | 정부 지원금 반영 |
| 158 | 실적제외·통계제외 배지 위치 개선 |
| 159 | 캘린더 월별 내역 목록 추가 |
| 160 | 홈 내역 목록 날짜 그룹화 |
| 161 | 대출 카드 실적 제외 버그 수정 |
| 162 | 대출 잔고 입력 개선 |
| 163 | 월급 탭 예산 배분 순서 드래그 |
| 164 | 포트폴리오 순자산 표시 |
| 165 | 포트폴리오 자산 구성 통장잔고 제외 |
| 166 | 청약 경과 기간 표시 수정 |
| 167 | 거래 필터 헬퍼 모듈화 |
| 168 | 캘린더·홈 내역 스타일 통일 (`TxItem` 추출) |
| 169 | 캘린더·홈 통계제외 필터링 |
| 170 | 통계 탭 자산 구성 바 클릭 → 예산 탭 이동 |
| 171 | 통계 탭 도넛 차트 툴팁 불투명 배경 |
| 172 | 실적제외·통계제외 배지 줄바꿈 |

## 2026-07-15 — ver 2.30

| # | 내용 |
|---|------|
| 173 | 월급 탭 하단 여백 감소 |
| 174 | 탭 이동 시 스크롤 상단 복귀 |
| 175 | 푸시 알림 권한 팝업 중복 방지 |
| 176 | 알림 차단 상태 안내 |
| 177 | 구독 중복 방지 |
| 178 | 푸시 전송 TTL 설정 |
| 179 | 알림 클릭 시 TWA 앱 포커스 |
| 180 | 알림 badge 아이콘 추가 |
| 181 | 캘린더 날짜 팝업 "+ 추가" 버튼 |
| 182 | 업데이트 내역 팝업 로그인 조건 수정 |
| 183 | 캘린더 내역 추가 바텀시트 — 직접 입력/문자 가져오기 탭 분리 |
| 184 | 업데이트 내역 JS 버전 기준 팝업 |

## 2026-07-18 — ver 2.31

| # | 내용 |
|---|------|
| 185 | Capacitor 네이티브 안드로이드 앱 |
| 186 | FCM 푸시 알림 |
| 187 | HIGH importance 알림 채널 |
| 188 | FCM/Web Push 중복 방지 |
| 189 | 앱 아이콘 교체 |
| 190 | 상태바 safe-area 처리 |
| 191 | StatusBar 플러그인 설정 |
| 192 | 업데이트 내역 "다시 안보기" 버튼 |
| 193 | 자동이체 건너뛰기 저장 |
| 194 | 자동이체 내역명 띄어쓰기 수정 |
| 195 | gitignore 보완 |

## 2026-07-19 — ver 2.32 ~ 2.33

| # | 내용 |
|---|------|
| 196 | 시스템 다크모드 지원 — CSS 변수 토큰 시스템 구축, DayNight 테마 전환 |
| 197 | 자동이체 팝업 카드·계좌 선택 |
| 198 | 캘린더 날짜 숫자 다크모드 수정 |
| 199 | 화면 테마 설정 — 라이트 / 다크 / 시스템 3-way 선택 |
| 200 | 커스텀 CategoryPicker 바텀시트 |
| 201 | 커스텀 CardPicker 바텀시트 |
| 202 | 캘린더 월별 내역 목록 스와이프 수정·삭제 |
| 203 | SwipeItem 공통 컴포넌트 분리 |
| 204 | 상태바 다이나믹 색상·스타일 |

## 2026-07-20 — ver 2.34 ~ 2.35

| # | 내용 |
|---|------|
| 205 | 커스텀 날짜 피커 전 탭 통일 — `DatePickerSheet.jsx` |
| 206 | `YearDrum.jsx` 공유 컴포넌트 |
| 207 | 날짜 피커 팝업 화면 중앙 배치 |
| 208 | 통계 탭 월 클릭 바로 이동 |
| 209 | PC 사이드바 알림 시간 드럼 피커 |
| 210 | 업데이트 내역 모달 편집 중 실시간 미리보기 |
| 211 | 서버 재시작 시 update_notice DB 덮어쓰기 버그 수정 |
| 212 | 업데이트 내역 desc 줄바꿈 지원 |
| 213 | 적금 납입일 알림 추가 |

## 2026-07-25 — ver 2.36 ~ 2.37

| # | 내용 |
|---|------|
| 214 | 계좌 이체 카테고리 기본 제공 |
| 215 | `TransferPicker.jsx` 신규 컴포넌트 |
| 216 | 수정 탭 CategoryPicker·CardPicker 적용 |
| 217 | 카테고리별 기본 실적·통계 제외 설정 |
| 218 | 계좌 이체 피커 레이아웃 개선 |
| 219 | 카테고리 수정 폼 인라인 표시 |
| 220 | 업데이트 내역 DB 자동 갱신 |

## 2026-07-26 — ver 2.38 ~ 2.40

| # | 내용 |
|---|------|
| 221 | 대출 일부 상환 기능 |
| 222 | 대출 잔액 자동 반영 |
| 223 | LoanRepayment 모델 추가 |
| 224 | 대출 카드 전용 정보 표시 |
| 225 | 대출 상환 현황 바 추가 |
| 226 | 대출 카드 이자율 필드 추가 |
| 227 | 포트폴리오 PDF 대출 카드 분리 |
| 228 | 내역 시간 기록 및 표시 |
| 229 | 캘린더 기본 정렬 과거순으로 변경 |
| 230 | 캘린더 내역 꾹 누르기 → 수정/삭제 팝업 |
| 231 | 캘린더 카드별 필터 |
| 232 | 홈탭 실적바 카드 숨기기 |
| 233 | 루틴 칩으로 빠른 내역 추가 |
| 234 | 한 루틴에 여러 카테고리 |
| 235 | 반복 패턴 자동 감지·등록 추천 |
| 236 | 루틴 관리 페이지 |

## 2026-07-27 — ver 2.41

| # | 내용 |
|---|------|
| 237 | 대출 상환 시 출금 계좌 선택 |
| 238 | 업데이트 내역 "1주일 안보기" 체크박스 |
| 239 | 대출 상환 폼 날짜 2줄 표시 수정 |
| 240 | 키보드 열릴 때 하단 탭바 고정 |

## 2026-07-28 — ver 2.42

| # | 내용 |
|---|------|
| 241 | 적금 추가 입금 기능 |
| 242 | 문자·엑셀 가져오기 커스텀 UI |
| 243 | 월급 탭 고정 지출 카테고리·카드 바텀시트 |
| 244 | 안드로이드 PWA 뒤로가기 버튼 수정 |

## 2026-07-29 — ver 2.43

| # | 내용 |
|---|------|
| 245 | 가져오기 상단바 홈탭과 통일 — `import_base.html` 공통 베이스 템플릿 |
| 246 | 문자 가져오기 전체 선택 위치·스타일 개선 |

## 2026-07-29 — ver 2.44

| # | 내용 |
|---|------|
| 247 | Android 하드웨어 뒤로가기 전면 수정 |
| 248 | 뒤로가기 시트 닫기 |
| 249 | 업데이트 공지 로컬 버전 내용 표시 수정 |
| 250 | iOS 스타일 상단 네비게이션 |

## 2026-07-30 — ver 2.45

| # | 내용 |
|---|------|
| 251 | 카테고리 관리 UI 개선 |
| 252 | 카테고리 삭제 확인 커스텀 모달 |
| 253 | 내역 수정 삭제 확인 커스텀 모달 |
| 254 | 스플래시 스크린 표시 개선 |
| 255 | 도움말 설정 탭 루틴 관리 항목 추가 |

## 2026-07-30 — ver 2.46

| # | 내용 |
|---|------|
| 256 | 스플래시 배경색 파란색(`#6c8fef`) 계열로 변경 |
| 257 | 루틴 삭제 확인 커스텀 모달 — 기본 `confirm()` 대신 커스텀 다이얼로그 |
| 258 | 설정 탭 UI 정리 — 불필요한 섹션 제거 및 레이아웃 정비 |

## 2026-07-30 — ver 2.47

| # | 내용 |
|---|------|
| 259 | 내역 검색 기능 — 키워드·카테고리·타입·날짜 범위·금액 범위 필터 지원, 결과에서 수정 화면 바로 이동 |
| 260 | 영수증 사진 첨부 — 내역 수정 화면에서 카메라·갤러리로 사진 첨부, 썸네일 미리보기, 검색 결과 배지 |
| 261 | 통계 전월 대비 — 카테고리별 전월 대비 지출 변화 가로 바 비교 |
| 262 | Android 홈 위젯 4종 추가 — 간편(3×1) / 예산 링(2×2) / 대시보드(4×2) / 오늘 지출(3×2) |
| 263 | WidgetConfigActivity — 위젯 추가 시 배경 색상·모양 설정 화면 |
| 264 | WidgetTheme / WidgetDataPlugin — 위젯 테마 시스템 및 JS↔Java 데이터 브릿지 |

## 2026-07-31 — ver 2.48

| # | 내용 |
|---|------|
| 265 | 위젯 설정 화면 다크/라이트 모드 지원 — 시스템 테마 자동 반영, `AppCompatActivity` + `Theme.AppCompat.DayNight.NoActionBar` |
| 266 | 위젯 설정 화면 상태바 아이콘 수정 — 라이트 모드에서 상태바 아이콘이 흰색으로 보이지 않던 문제 수정 (`WindowInsetsControllerCompat.setAppearanceLightStatusBars`) |
| 267 | 위젯 설정 화면 상태바 가림 수정 — `android:fitsSystemWindows="true"` + `WindowCompat.setDecorFitsSystemWindows(false)` |
| 268 | 위젯 미리보기 실제 레이아웃 반영 — `LayoutInflater`로 실제 위젯 XML inflate, 타입별 크기 동적 조정, 실제 데이터(수입·지출·예산) 바인딩 |
| 269 | 위젯 설정 저장/취소 버튼 위치 변경 — 저장 왼쪽, 취소 오른쪽 |
| 270 | 설정 탭 편의 기능 통합 — 화면 테마 + 피드백(진동·터치음)을 "⚙️ 편의 기능" 하나의 카드로 통합 |
| 271 | 설정 탭 데이터 백업/복원 제거 — 서버 계정에 저장되므로 불필요 |

---

# 브랜치 관리

```bash
git add <파일들>
git commit -m "커밋_메시지_언더스코어로"
git push
```
