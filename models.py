from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    nickname = db.Column(db.String(50), nullable=True)
    reset_code = db.Column(db.String(6), nullable=True)
    reset_expires = db.Column(db.DateTime, nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(10), nullable=False)
    type = db.Column(db.String(10), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    card = db.Column(db.String(50), nullable=True)
    user_id = db.Column(db.Integer, nullable=True)
    exclude_perf = db.Column(db.Boolean, nullable=False, default=False)
    exclude_stats = db.Column(db.Boolean, nullable=False, default=False)
    time = db.Column(db.String(5), nullable=True)
    has_receipt = db.Column(db.Boolean, nullable=False, default=False)
    cashback = db.Column(db.Integer, nullable=False, default=0)
    exclude_cashback = db.Column(db.Boolean, nullable=False, default=False)
    # 포인트 카드 지출 전용 — 'carryover'면 이 거래가 전환(이월)해둔 포인트에서 차감된
    # 것, None/''이면 이번 주기 포인트에서 차감(기본값)
    point_pool = db.Column(db.String(20), nullable=True)
    # 이 거래의 캐시백이 카드의 어떤 CashbackRule로 계산됐는지 — 일/월 한도를 셀 때
    # "이 규칙으로 이미 얼마나 썼는지"를 과거 거래에서 되짚어보려면 필요하다.
    # 규칙이 없는 카드(기존 고정비율 cashback_type/rate)는 항상 null.
    cashback_rule_id = db.Column(db.Integer, nullable=True)
    # 자동 계산(고정비율/규칙) 대신 사용자가 캐시백 금액을 직접 입력했는지 — true면
    # 수정 폼을 다시 열었을 때도 자동 재계산하지 않고 그 값을 그대로 보여준다.
    cashback_manual = db.Column(db.Boolean, nullable=False, default=False)

class Budget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.String(7), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, nullable=True)

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    icon = db.Column(db.String(10), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    cat_type = db.Column(db.String(10), nullable=False, default='expense')
    user_id = db.Column(db.Integer, nullable=True)
    exclude_perf = db.Column(db.Boolean, nullable=False, default=False)
    exclude_stats = db.Column(db.Boolean, nullable=False, default=False)

class Card(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    monthly_target = db.Column(db.Integer, nullable=False)
    url = db.Column(db.String(500), nullable=True)
    tier1 = db.Column(db.Integer, nullable=True, server_default='20')
    tier2 = db.Column(db.Integer, nullable=True, server_default='50')
    tier3 = db.Column(db.Integer, nullable=True, server_default='80')
    account_balance = db.Column(db.Integer, nullable=False, default=0)
    balance_since = db.Column(db.String(10), nullable=True)
    user_id = db.Column(db.Integer, nullable=True)
    linked_account_id = db.Column(db.Integer, nullable=True)
    interest_rate = db.Column(db.Float, nullable=True)
    cashback_type = db.Column(db.String(10), nullable=True)  # None/'' = off, 'payment', 'charge'
    cashback_rate = db.Column(db.Float, nullable=True)  # percent
    has_custom_icon = db.Column(db.Boolean, nullable=False, default=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    # 복지 포인트처럼 잔고를 이월하지 않고 매달 정해진 날짜에 고정 금액으로 리셋하는 카드용.
    # point_reset_day가 null이면 평소처럼(이월) 동작 — 완전히 별개의 선택적 기능.
    point_reset_day = db.Column(db.Integer, nullable=True)
    point_reset_amount = db.Column(db.Integer, nullable=True)
    point_reset_last_date = db.Column(db.String(10), nullable=True)
    # "전환하기"로 따로 떼어둔 포인트의 누적 총량 — 리셋이 지나가도 사라지지 않고
    # 그대로 남아, "전환된 포인트에서 차감" 토글을 켠 지출로만 줄어든다.
    point_carryover = db.Column(db.Integer, nullable=False, default=0)
    # point_carryover 중 "지난 리셋 시점에 이미 있던 만큼"의 스냅샷 — 이번 주기에
    # 새로 전환한 금액(point_carryover - 이 값)만 이번 충전액에서 빼서 보여줘야,
    # 리셋 전부터 있던 전환 포인트가 새 충전액까지 깎아먹지 않는다. _point_balance() 참고.
    point_carryover_baseline = db.Column(db.Integer, nullable=False, default=0)
    # 여러 CashbackRule을 합쳐서 한 달에 받을 수 있는 캐시백 총액의 상한(예: "전월실적
    # 20~50만원 구간은 Life 서비스 통합 월 2만원"). 전월실적 구간 자체는 추적하지 않고
    # 사용자가 매달 바뀔 때 직접 갱신 — null이면 통합 한도 없음(규칙별 한도만 적용).
    cashback_monthly_cap = db.Column(db.Integer, nullable=True)

class CashbackRule(db.Model):
    # 카드 하나에 여러 개 — "배달의민족 5%, 일 1회 최대 1천원, 월 5회 최대 5천원" 같은
    # 가맹점/카테고리별 캐시백 규칙 한 줄. 카드에 이 규칙이 하나라도 있으면 _compute_cashback은
    # cashback_type/cashback_rate(고정비율) 대신 이 규칙들로 계산한다.
    id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, nullable=True)
    name = db.Column(db.String(50), nullable=False)  # 화면에 보여줄 규칙 이름 (예: "편의점 20%")
    # 거래 설명(가맹점명)에 이 중 하나라도 포함되면 매칭 — 쉼표로 여러 개(OR)
    keywords = db.Column(db.String(300), nullable=False)
    rate = db.Column(db.Float, nullable=False)  # percent
    daily_cap = db.Column(db.Integer, nullable=True)
    daily_count_cap = db.Column(db.Integer, nullable=True)
    monthly_cap = db.Column(db.Integer, nullable=True)
    monthly_count_cap = db.Column(db.Integer, nullable=True)
    position = db.Column(db.Integer, nullable=False, default=0)

class Savings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    stype = db.Column(db.String(10), nullable=False, default='예금')
    bank = db.Column(db.String(50), nullable=False, default='')
    name = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Integer, nullable=False, default=0)
    interest_rate = db.Column(db.Float, nullable=False, default=0.0)
    interest_type = db.Column(db.String(10), nullable=False, default='단리')
    tax_type = db.Column(db.String(10), nullable=False, default='일반과세')
    start_date = db.Column(db.String(10), nullable=False)
    end_date = db.Column(db.String(10), nullable=False)
    notify_day = db.Column(db.Integer, nullable=True)
    auto_tx = db.Column(db.Boolean, nullable=False, default=False)
    auto_tx_day = db.Column(db.Integer, nullable=True)
    auto_tx_card = db.Column(db.String(50), nullable=True, default='')
    # 자동이체일이 주말이면 다음/이전 영업일 중 어느 쪽으로 조정할지 — 'next'(기본) 또는 'prev'
    weekend_adjust = db.Column(db.String(10), nullable=False, default='next')
    # 통계 탭 자산 구성·자산 추이 등 집계에서 이 항목을 제외할지
    exclude_stats = db.Column(db.Boolean, nullable=False, default=False)
    manual_count = db.Column(db.Integer, nullable=True)
    is_paused = db.Column(db.Boolean, nullable=False, default=False)
    bonus_amount = db.Column(db.Integer, nullable=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    # 가입 시 초기 금액을 특정 계좌에서 가져온 경우, 그 계좌에서 자동 생성된
    # 출금 거래의 id — 이 예·적금이 삭제되면 그 거래도 함께 삭제하기 위함
    withdraw_transaction_id = db.Column(db.Integer, nullable=True)

class Notice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    app = db.Column(db.String(20), nullable=False, default='gaegyebu')
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False)

class SalaryConfig(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Integer, nullable=False, default=0)
    pay_day = db.Column(db.Integer, nullable=True)

class BudgetAllocation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    category_name = db.Column(db.String(50), nullable=False)
    percent = db.Column(db.Float, nullable=False, default=0)
    monthly_limit = db.Column(db.Integer, nullable=True)

class FixedExpense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Integer, nullable=False, default=0)
    day_of_month = db.Column(db.Integer, nullable=True)
    category = db.Column(db.String(50), nullable=True, default='')
    auto_register = db.Column(db.Boolean, nullable=False, default=False)
    auto_silent = db.Column(db.Boolean, nullable=False, default=False)
    tx_type = db.Column(db.String(20), nullable=False, default='expense')
    tx_card = db.Column(db.String(50), nullable=True, default='')

class SavingsDeposit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    savings_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Integer, nullable=False, default=0)
    date = db.Column(db.String(10), nullable=False)
    memo = db.Column(db.String(100), nullable=True, default='')

class HelpItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    icon = db.Column(db.String(10), nullable=False, default='')
    title = db.Column(db.String(50), nullable=False)
    desc = db.Column(db.Text, nullable=False, default='')
    position = db.Column(db.Integer, nullable=False, default=0)

class AppConfig(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Text, nullable=False)

class LoanRepayment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    date = db.Column(db.String(10), nullable=False)
    memo = db.Column(db.String(100), nullable=True, default='')
    transaction_id = db.Column(db.Integer, nullable=True)

class Investment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    itype = db.Column(db.String(20), nullable=False, default='국내주식')
    name = db.Column(db.String(100), nullable=False)
    ticker = db.Column(db.String(30), nullable=True, default='')
    quantity = db.Column(db.Float, nullable=False, default=0)
    avg_price = db.Column(db.Float, nullable=False, default=0)
    current_price = db.Column(db.Float, nullable=True)
    exchange_rate = db.Column(db.Float, nullable=True)
    memo = db.Column(db.String(200), nullable=True, default='')
    price_updated_at = db.Column(db.DateTime, nullable=True)
    account_type = db.Column(db.String(20), nullable=False, default='일반')
    position = db.Column(db.Integer, nullable=False, default=0)
    # 통계 탭 자산 구성·자산 추이 등 집계에서 이 항목을 제외할지
    exclude_stats = db.Column(db.Boolean, nullable=False, default=False)

class Routine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(50), nullable=False)
    icon = db.Column(db.String(10), nullable=True, default='')
    card = db.Column(db.String(50), nullable=True, default='')
    position = db.Column(db.Integer, nullable=False, default=0)

class RoutineItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    cat_type = db.Column(db.String(10), nullable=False, default='expense')
    exclude_card_perf = db.Column(db.Boolean, nullable=False, default=False)
    exclude_stats = db.Column(db.Boolean, nullable=False, default=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    description = db.Column(db.String(200), nullable=True, default='')
    card = db.Column(db.String(50), nullable=True, default='')
    exclude_cashback = db.Column(db.Boolean, nullable=False, default=False)

class SavingsGoal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    target_amount = db.Column(db.Integer, nullable=False, default=0)
    target_date = db.Column(db.String(10), nullable=True)
    # 예·적금 계좌에 연결하면 그 계좌 잔액(Savings.amount)이 진행률이 된다(자동) —
    # 비워두면 manual_amount를 직접 입력/추가해서 진행률을 관리한다(수동).
    savings_id = db.Column(db.Integer, nullable=True)
    manual_amount = db.Column(db.Integer, nullable=False, default=0)
    position = db.Column(db.Integer, nullable=False, default=0)

class Mood(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    date = db.Column(db.String(10), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    memo = db.Column(db.String(200), nullable=True, default='')
    created_at = db.Column(db.DateTime, nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False)
    __table_args__ = (db.UniqueConstraint('user_id', 'date', name='uq_mood_user_date'),)
