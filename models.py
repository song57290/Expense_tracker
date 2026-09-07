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
    # 초기화 직전 남은 소액 잔액을 사용자가 "전환"해 다음 초기화 금액에 더해 받도록
    # 보관해두는 값 — 다른 계좌로 옮기는 게 아니라 같은 카드에 누적됨.
    point_carryover = db.Column(db.Integer, nullable=False, default=0)

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
