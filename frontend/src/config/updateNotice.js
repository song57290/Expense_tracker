// 버전 규칙:
//   x.0  → 대형 업데이트 (새 탭, 전면 개편 등)
//   x.x0 → 기능 추가 (몇 가지 새 기능)
//   x.xx → 버그 수정 · 소소한 개선
export const CURRENT_VERSION = 'ver 2.23'
export const UPDATE_DATE = '2026년 7월 9일'

export const UPDATES = [
  {
    section: '💰 월급 관리',
    items: [
      { tag: 'new', title: '예산 배분 원화 직접 입력', desc: '% 대신 원화 금액으로 입력, 월급 대비 % 자동 표시' },
      { tag: 'new', title: '예산 배분 카테고리 선택형', desc: '모든 카테고리 대신 예산 잡을 카테고리만 직접 선택해서 추가' },
      { tag: 'new', title: '고정 지출 자동 거래 등록', desc: '지정일에 앱 열면 확인 팝업 → 등록 시 거래 자동 기록' },
      { tag: 'imp', title: '월급 입력 UX 개선', desc: '금액 콤마 자동 삽입, 원·일 단위 suffix 표시' },
    ],
  },
  {
    section: '🏦 예금 · 적금 · 청약',
    items: [
      { tag: 'new', title: '청약 추가 입금', desc: '예산 탭 청약 카드에 추가 입금 내역 기록, 잔고 자동 합산' },
      { tag: 'new', title: '적금 · 청약 자동이체 등록', desc: '이체일 설정 시 해당 날짜에 앱 열면 확인 팝업으로 거래 자동 기록' },
      { tag: 'new', title: '청약 납입일 푸시 알림', desc: '설정한 날짜 오전 9시에 납입 알림 자동 발송 (알림 ON 필요)' },
      { tag: 'new', title: '청약 이자 지원', desc: '청약도 연 이율 · 단리/복리 · 세금 종류 설정 가능' },
      { tag: 'imp', title: '자동이체 고정 지출 연동', desc: '자동이체 설정한 적금·청약이 월급 탭 고정 지출에 자동 표시' },
    ],
  },
  {
    section: '💰 예산 · 투자',
    items: [
      { tag: 'fix', title: '해외주식 평단가 · 현재가 달러 표시', desc: '입력한 달러 값을 그대로 $XX.XX 형식으로 표시' },
      { tag: 'imp', title: '투자 카드 항목 순서 변경', desc: '매수금액 → 평가금액 → 수익 순서로 재배치' },
      { tag: 'new', title: '설정 탭에서 카테고리 관리', desc: '설정 → 카테고리 관리 버튼으로 접근' },
    ],
  },
]

export const VERSION_HISTORY = [
  {
    version: 'ver 2.22',
    date: '2026년 7월 7일',
    updates: [
      { section: '📊 통계', items: [
        { tag: 'new', title: '월별 추이 수입·지출 동시 보기', desc: '지출 / 수입 / 전체 모드 — 전체 선택 시 두 막대를 나란히 비교' },
        { tag: 'new', title: '월별 추이 전체 기간 보기 버튼', desc: '날짜 범위 옆 전체 버튼으로 첫 거래부터 현재까지 한 번에 확인' },
        { tag: 'imp', title: '월별 추이 세로 구분선 추가', desc: '월 간격을 더 명확히 구분할 수 있는 연한 세로선' },
        { tag: 'imp', title: '상세 내역 금액 오른쪽 정렬', desc: '지출 합계 열 정렬 개선으로 금액 비교가 편해짐' },
      ]},
      { section: '📄 포트폴리오 PDF', items: [
        { tag: 'imp', title: '자산 구성 금액 내림차순 정렬', desc: '도넛 차트와 목록 모두 큰 자산 순으로 표시' },
        { tag: 'imp', title: '자산 구성 카드잔고 제외', desc: '예금·적금·투자만 포함' },
        { tag: 'imp', title: '카드 달성률 바 색상 변경', desc: '노란색 → 파란색 그라데이션' },
        { tag: 'new', title: '거래내역 기본 비활성화', desc: '체크 시 최근 30건만 출력' },
      ]},
      { section: '🏠 홈 · 투자 · 설정', items: [
        { tag: 'new', title: '투자 현재가 자동 갱신', desc: '국내·해외 장 마감 후 현재가 자동 업데이트' },
        { tag: 'imp', title: '홈탭 카테고리 금액·비율 정렬', desc: '금액과 % 각각 독립 열로 정렬, 끝이 깔끔하게 정렬됨' },
        { tag: 'fix', title: '포트폴리오 카드 잔고 오류 수정', desc: '현재 잔고가 음수로 표시되던 계산 오류 해결' },
        { tag: 'imp', title: '설정 탭 애니메이션 추가', desc: '페이지 진입, 카드 호버, 섹션 펼침 등 전반적인 애니메이션 적용' },
      ]},
    ],
  },
]
