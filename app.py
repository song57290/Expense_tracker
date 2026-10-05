from flask import Flask, render_template, request, redirect, url_for, send_from_directory, send_file, jsonify, abort, session
from functools import wraps

from sqlalchemy import func
from models import db, InvestYear, InvestSnapshot, Transaction, Budget, Category, Card, User, Savings, Investment, Notice, HelpItem, AppConfig, SalaryConfig, BudgetAllocation, FixedExpense, SavingsDeposit, LoanRepayment, Routine, RoutineItem, Mood, SavingsGoal, CashbackRule, InvestAccount, InvestmentTrade
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import openpyxl
import xlrd
from io import BytesIO
import tempfile, json, os, re, base64, random, smtplib, threading
try:
    from PIL import Image as PILImage
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

DATA_DIR = os.environ.get('DATA_DIR', '/data')
RECEIPTS_DIR = os.path.join(DATA_DIR, 'receipts')
os.makedirs(RECEIPTS_DIR, exist_ok=True)
CARD_ICONS_DIR = os.path.join(DATA_DIR, 'card_icons')
os.makedirs(CARD_ICONS_DIR, exist_ok=True)
# The server runs on a small (256MB) VM. Pillow decodes a full pixel buffer before
# any resize happens, so a large photo (a phone camera shot easily runs 4000x3000+)
# can spike memory enough to OOM-kill the whole gunicorn worker — not a catchable
# Python exception, just a 502 with no server-side error to log. Reject oversized
# uploads up front instead of finding out via a crash.
_MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024
_MAX_IMAGE_PIXELS = 20_000_000
from email.mime.text import MIMEText

_listing_cache = {}
_listing_ts = {}

def _get_stock_listing(market):
    import time, FinanceDataReader as fdr
    now = time.time()
    if market not in _listing_cache or now - _listing_ts.get(market, 0) > 86400:
        _listing_cache[market] = fdr.StockListing(market)
        _listing_ts[market] = now
    return _listing_cache[market]

app = Flask(__name__)
_DATA_DIR_ENV = os.environ.get('DATA_DIR', '')
if _DATA_DIR_ENV:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(_DATA_DIR_ENV, 'expense.db')
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expense.db'
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-me-in-prod-2026x')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
db.init_app(app)

# ── Auth helpers ──────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

def _seed_user_categories(uid):
    if Category.query.filter_by(user_id=uid).first():
        return
    defaults_expense = [('식사','🍚'),('간식','🍪'),('쇼핑','🛍️'),('자동차','🚗'),('교통','🚌'),('의료','💊'),('기타','📦')]
    defaults_income = [('급여','💰'),('부업','💼'),('용돈','🎁'),('이자','🏦'),('기타수입','📥')]
    for i, (name, icon) in enumerate(defaults_expense):
        db.session.add(Category(name=name, icon=icon, position=i, cat_type='expense', user_id=uid))
    for i, (name, icon) in enumerate(defaults_income):
        db.session.add(Category(name=name, icon=icon, position=len(defaults_expense)+i, cat_type='income', user_id=uid))
    db.session.add(Category(name='계좌 이체', icon='🔄', position=len(defaults_expense)+len(defaults_income),
                            cat_type='expense', user_id=uid, exclude_perf=True, exclude_stats=True))
    db.session.commit()

# ── Template filters ──────────────────────────────────────────────────────────

@app.template_filter('bank_color')
def bank_color_filter(card_name):
    if not card_name:
        return 'background:#6c757d;color:white;'
    mappings = [
        ('신한', '#0046A0', 'white'), ('KB', '#FFB800', '#333'), ('국민', '#FFB800', '#333'),
        ('농협', '#009900', 'white'), ('NH', '#009900', 'white'), ('하나', '#009A8C', 'white'),
        ('우리', '#0069C8', 'white'), ('기업', '#005BB5', 'white'), ('IBK', '#005BB5', 'white'),
        ('카카오', '#FAE100', '#333'), ('토스', '#0064FF', 'white'), ('케이뱅크', '#00B4B4', 'white'),
        ('K뱅크', '#00B4B4', 'white'), ('SC', '#1B5DA0', 'white'), ('제일', '#1B5DA0', 'white'),
        ('씨티', '#003087', 'white'), ('iM', '#E8182C', 'white'), ('IM', '#E8182C', 'white'),
        ('수협', '#009ABF', 'white'), ('KDB', '#003087', 'white'), ('산업', '#003087', 'white'),
        ('BNK', '#0057A8', 'white'), ('부산', '#0057A8', 'white'), ('우체국', '#D40511', 'white'),
        ('SBI', '#E8391D', 'white'), ('신협', '#005BAB', 'white'), ('BC', '#D60B2F', 'white'),
        ('현대', '#1A1A1A', 'white'), ('롯데', '#CC0000', 'white'), ('삼성', '#005BAB', 'white'),
    ]
    for keyword, bg, fg in mappings:
        if keyword in card_name:
            return f'background:{bg};color:{fg};'
    return 'background:#6c757d;color:white;'

@app.template_filter('bank_logo')
def bank_logo_filter(card_name):
    mappings = [
        ('신한', '/static/cards/sinhanbank.png'), ('KB', '/static/cards/kbbank.png'),
        ('국민', '/static/cards/kbbank.png'), ('농협', '/static/cards/nhbank.png'),
        ('NH', '/static/cards/nhbank.png'), ('하나', '/static/cards/hanabank.png'),
        ('우리', '/static/cards/wooribank.png'), ('기업', '/static/cards/ibkbank.png'),
        ('IBK', '/static/cards/ibkbank.png'), ('카카오', '/static/cards/kakaobank.png'),
        ('토스', '/static/cards/tossbank.png'), ('케이뱅크', '/static/cards/kbank.png'),
        ('K뱅크', '/static/cards/kbank.png'), ('SC', '/static/cards/scbank.png'),
        ('제일', '/static/cards/scbank.png'), ('씨티', '/static/cards/citibank.png'),
        ('citi', '/static/cards/citibank.png'), ('IM', '/static/cards/imbank.png'),
        ('iM', '/static/cards/imbank.png'), ('수협', '/static/cards/suhyupbank.png'),
        ('KDB', '/static/cards/kdbbank.png'), ('산업', '/static/cards/kdbbank.png'),
        ('BNK', '/static/cards/bnkbank.png'), ('부산', '/static/cards/bnkbank.png'),
        ('우체국', '/static/cards/epostbank.png'), ('SBI', '/static/cards/sbibank.png'),
        ('신협', '/static/cards/cubank.png'), ('BC', '/static/banks/bccard.png'),
        ('현대', '/static/banks/hyundaicard.png'), ('롯데', '/static/banks/lottecard.png'),
        ('삼성', '/static/banks/samsungcard.png'),
    ]
    for keyword, path in mappings:
        if keyword in card_name:
            return path
    return None

# ── DB init ───────────────────────────────────────────────────────────────────

with app.app_context():
    db.create_all()
    from sqlalchemy import text
    # routine 테이블이 구 스키마(category NOT NULL)이면 드롭 후 재생성
    try:
        with db.engine.connect() as conn:
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(routine)")).fetchall()]
            if 'category' in cols:
                conn.execute(text("DROP TABLE IF EXISTS routine_item"))
                conn.execute(text("DROP TABLE IF EXISTS routine"))
                conn.commit()
    except Exception:
        pass
    db.create_all()
    # 컬럼 마이그레이션: icon, exclude_card_perf, exclude_stats
    try:
        with db.engine.connect() as conn:
            r_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(routine)")).fetchall()]
            if 'icon' not in r_cols:
                conn.execute(text("ALTER TABLE routine ADD COLUMN icon VARCHAR(10) DEFAULT ''"))
            ri_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(routine_item)")).fetchall()]
            if 'exclude_card_perf' not in ri_cols:
                conn.execute(text("ALTER TABLE routine_item ADD COLUMN exclude_card_perf BOOLEAN NOT NULL DEFAULT 0"))
            if 'exclude_stats' not in ri_cols:
                conn.execute(text("ALTER TABLE routine_item ADD COLUMN exclude_stats BOOLEAN NOT NULL DEFAULT 0"))
            if 'description' not in ri_cols:
                conn.execute(text("ALTER TABLE routine_item ADD COLUMN description VARCHAR(200) DEFAULT ''"))
            if 'card' not in ri_cols:
                conn.execute(text("ALTER TABLE routine_item ADD COLUMN card VARCHAR(50) DEFAULT ''"))
            if 'exclude_cashback' not in ri_cols:
                conn.execute(text("ALTER TABLE routine_item ADD COLUMN exclude_cashback BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
    except Exception:
        pass
    for col, default in [('tier1', 20), ('tier2', 50), ('tier3', 80)]:
        try:
            with db.engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE card ADD COLUMN {col} INTEGER DEFAULT {default}"))
                conn.commit()
        except Exception:
            pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN interest_type VARCHAR(10) NOT NULL DEFAULT '단리'"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN tax_type VARCHAR(10) NOT NULL DEFAULT '일반과세'"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN notify_day INTEGER"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN auto_tx BOOLEAN DEFAULT 0"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN auto_tx_day INTEGER"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings_goal ADD COLUMN savings_ids VARCHAR(300)"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN auto_tx_card VARCHAR(50) DEFAULT ''"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN manual_count INTEGER"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE savings ADD COLUMN bonus_amount INTEGER"))
            conn.commit()
    except Exception:
        pass
    db.create_all()  # creates loan_repayment table if not exists
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE investment ADD COLUMN exchange_rate FLOAT"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE category ADD COLUMN position INTEGER DEFAULT 0"))
            conn.commit()
        cats = Category.query.order_by(Category.id).all()
        for i, c in enumerate(cats):
            c.position = i
        db.session.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE category ADD COLUMN cat_type VARCHAR(10) DEFAULT 'expense'"))
            conn.commit()
    except Exception:
        pass
    try:
        with db.engine.connect() as conn:
            conn.execute(text("ALTER TABLE card ADD COLUMN account_balance INTEGER DEFAULT 0"))
            conn.commit()
    except Exception:
        pass
    # user_id column migration ("transaction" must be quoted — SQLite reserved word)
    for table_name in ['"transaction"', 'card', 'category', 'budget']:
        try:
            with db.engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN user_id INTEGER DEFAULT 1"))
                conn.commit()
        except Exception:
            pass
    for col in ['reset_code VARCHAR(6)', 'reset_expires DATETIME', 'nickname VARCHAR(50)']:
        try:
            with db.engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE user ADD COLUMN {col}"))
                conn.commit()
        except Exception:
            pass
    for _sql in [
        "ALTER TABLE loan_repayment ADD COLUMN transaction_id INTEGER",
        "ALTER TABLE fixed_expense ADD COLUMN auto_register BOOLEAN DEFAULT 0",
        "ALTER TABLE fixed_expense ADD COLUMN tx_type VARCHAR(20) DEFAULT 'expense'",
        "ALTER TABLE fixed_expense ADD COLUMN tx_card VARCHAR(50) DEFAULT ''",
        'ALTER TABLE "transaction" ADD COLUMN exclude_perf BOOLEAN NOT NULL DEFAULT 0',
        "ALTER TABLE category ADD COLUMN exclude_perf BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE investment ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT '일반'",
        "ALTER TABLE investment ADD COLUMN account_id INTEGER",
        "ALTER TABLE invest_account ADD COLUMN cash FLOAT NOT NULL DEFAULT 0",
        "ALTER TABLE invest_account ADD COLUMN cash_set BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE invest_account ADD COLUMN broker VARCHAR(30)",
        "ALTER TABLE invest_account ADD COLUMN has_custom_icon BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE invest_account ADD COLUMN broker_name VARCHAR(60)",
        "ALTER TABLE investment_trade ADD COLUMN fee FLOAT NOT NULL DEFAULT 0",
        "ALTER TABLE invest_account ADD COLUMN opened_at VARCHAR(10)",
        "ALTER TABLE invest_account ADD COLUMN principal FLOAT",
        "ALTER TABLE card ADD COLUMN linked_account_id INTEGER",
        'ALTER TABLE "transaction" ADD COLUMN exclude_stats BOOLEAN NOT NULL DEFAULT 0',
        "ALTER TABLE category ADD COLUMN exclude_stats BOOLEAN NOT NULL DEFAULT 0",
        'ALTER TABLE "transaction" ADD COLUMN time VARCHAR(5)',
        'ALTER TABLE card ADD COLUMN interest_rate FLOAT',
        'ALTER TABLE "transaction" ADD COLUMN has_receipt BOOLEAN NOT NULL DEFAULT 0',
        'ALTER TABLE budget_allocation ADD COLUMN monthly_limit INTEGER',
        'ALTER TABLE fixed_expense ADD COLUMN auto_silent BOOLEAN NOT NULL DEFAULT 0',
        'ALTER TABLE card ADD COLUMN balance_since VARCHAR(10)',
        'ALTER TABLE card ADD COLUMN cashback_type VARCHAR(10)',
        'ALTER TABLE card ADD COLUMN cashback_rate FLOAT',
        'ALTER TABLE "transaction" ADD COLUMN cashback INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE card ADD COLUMN has_custom_icon BOOLEAN NOT NULL DEFAULT 0',
        'ALTER TABLE card ADD COLUMN position INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE card ADD COLUMN point_reset_day INTEGER',
        'ALTER TABLE card ADD COLUMN point_reset_amount INTEGER',
        'ALTER TABLE card ADD COLUMN point_reset_last_date VARCHAR(10)',
        'ALTER TABLE card ADD COLUMN point_carryover INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE card ADD COLUMN point_carryover_baseline INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE card ADD COLUMN cashback_monthly_cap INTEGER',
        'ALTER TABLE cashback_rule ADD COLUMN prev_month_min INTEGER',
        'ALTER TABLE "transaction" ADD COLUMN cashback_rule_id INTEGER',
        'ALTER TABLE "transaction" ADD COLUMN cashback_manual BOOLEAN NOT NULL DEFAULT 0',
        'ALTER TABLE savings ADD COLUMN position INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE savings ADD COLUMN withdraw_transaction_id INTEGER',
        "ALTER TABLE savings ADD COLUMN weekend_adjust VARCHAR(10) NOT NULL DEFAULT 'next'",
        'ALTER TABLE savings ADD COLUMN exclude_stats BOOLEAN NOT NULL DEFAULT 0',
        'ALTER TABLE investment ADD COLUMN exclude_stats BOOLEAN NOT NULL DEFAULT 0',
        'ALTER TABLE investment ADD COLUMN position INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "transaction" ADD COLUMN exclude_cashback BOOLEAN NOT NULL DEFAULT 0',
        "ALTER TABLE notice ADD COLUMN app VARCHAR(20) NOT NULL DEFAULT 'gaegyebu'",
        'ALTER TABLE "transaction" ADD COLUMN point_pool VARCHAR(20)',
        'ALTER TABLE card ADD COLUMN point_converted_cycle INTEGER NOT NULL DEFAULT 0',
    ]:
        try:
            with db.engine.connect() as conn:
                conn.execute(text(_sql)); conn.commit()
            if 'point_converted_cycle' in _sql:
                # 새 컬럼을 처음 만든 배포에서만 기존 값을 옮긴다 (이후 재시작 때는 건너뜀)
                with db.engine.connect() as conn:
                    conn.execute(text('UPDATE card SET point_converted_cycle = MAX(0, point_carryover - point_carryover_baseline)')); conn.commit()
        except Exception:
            pass
    db.create_all()
    # seed categories for user 1 (existing data owner)
    _seed_user_categories(1)

    # seed / upgrade help items
    _help_version = 'ver2.96'
    _help_defaults = [
        ('🏠', '홈', '내역을 빠르게 추가하고 이번 달 현황을 확인합니다.\n\n• 항목 오른쪽 스와이프 → 수정, 왼쪽 스와이프 → 삭제 (PC는 드래그)\n• 자주 쓰는 지출은 루틴 칩 탭 한 번으로 추가 (루틴 편집은 설정 → 루틴 관리)\n• 카드별 실적바로 이번 달 사용액 확인\n• 우측 상단 눈 아이콘 → 금액 가리기(항목별 선택 가능)\n• 문자 붙여넣기·엑셀 업로드로 내역 한 번에 가져오기'),
        ('💳', '예산', '은행별 잔고 · 예·적금 · 저축 목표 · 투자를 4개 카드로 보여주고, 탭하면 상세 화면으로 확대됩니다.\n\n• 🎯 저축 목표: 예·적금 계좌에 자동 연동하거나 직접 금액 입력, 목표일 D-day 확인\n• 자산 추가에서 카드/은행·포인트·현금·대출 등록, 대출은 잔고를 음수로 관리\n• 여러 카드를 한 계좌에 연결해 잔고 공유 가능\n• 그리드 상단 눈 아이콘 → 항목별(은행별 잔고/예·적금/저축 목표/투자) 금액 가리기'),
        ('📅', '캘린더', '날짜별 내역을 달력으로 확인합니다.\n\n• 설날·추석 등 공휴일은 일요일처럼 빨간 글씨로 표시(안드로이드 앱은 폰에 동기화된 공휴일 캘린더 연동, 웹은 자동 계산 — 날짜 눌러서 어떤 공휴일인지도 확인 가능)\n• 날짜를 꾹 눌러 드래그하면 여러 날짜에 같은 내역 한 번에 추가\n• 필터 버튼으로 정렬·통장 잔고 표시·시간 표시·은행/카드별 필터링'),
        ('📊', '통계', '지출과 자산 흐름을 차트로 분석합니다.\n\n• 도넛 차트 조각을 탭하면 이름·금액·비율이 차트 아래에 표시(나머지 조각은 톤 다운)\n• 월별 추이(수입/지출/전체), 자산 구성, 총 자산 추이, 전월 대비 카테고리 비교\n• 각 섹션 상단 눈 아이콘으로 금액 가리기'),
        ('💰', '월급', '월급 기준으로 예산을 계획하고 고정 지출을 관리합니다.\n\n• 예산 배분: 카테고리별 월 한도 설정, 80% 이상 지출 시 경고\n• 고정 지출: 구독·보험 등 반복 지출 등록, 자동 등록 ON 시 지정일에 팝업 없이 자동 기록\n• 자동이체 설정한 예·적금·청약도 고정 지출 탭에 자동 표시'),
        ('🏷️', '카테고리', '지출·수입 카테고리를 관리합니다 (설정 → 카테고리 관리).\n\n• 항목 오른쪽 스와이프 → 수정, 왼쪽 스와이프 → 삭제\n• ⠿ 핸들 드래그로 순서 변경\n• "카드 실적에서 제외" 설정 시 해당 카테고리 내역이 카드 실적 집계에서 자동 제외'),
        ('📋', '루틴', '자주 쓰는 지출·수입 조합을 저장해두고 홈 탭에서 칩 한 번으로 추가합니다 (설정 → 루틴 관리).\n\n• 여러 카테고리를 묶어 등록, 항목마다 카드·설명을 미리 지정 가능\n• 항목별로 캐시백 제외 등 옵션 미리 설정\n• 최근 반복된 지출은 자동 감지되어 루틴 등록을 추천'),
        ('🔍', '내역 검색', '상단 네비바 🔍 아이콘에서 키워드로 내역을 검색합니다.\n\n• 카테고리·지출/수입 유형·날짜 범위·금액 범위로 필터링\n• 검색 결과를 탭하면 바로 수정 화면으로 이동'),
        ('📱', '홈 화면 위젯', '안드로이드 홈 화면에 위젯을 추가해 앱을 안 열어도 현황을 확인합니다.\n\n• 간편 · 예산 · 오늘 지출 · 지출 추이 · 이번 주 · 저축 목표, 총 6종\n• 위젯을 길게 눌러 배경색·글자 크기 조정, 예산/저축 목표 위젯은 그래프 크기도 별도 조정 가능'),
        ('⚙️', '설정', '앱 환경을 설정합니다.\n\n• 🆕 업데이트 내역: 최근 업데이트 내용과 이전 버전 기록 확인\n• 📋 루틴 관리, 🏷️ 카테고리 관리\n• 포트폴리오 PDF 출력\n• 🔒 보안: 닉네임·비밀번호 변경, 로그아웃, 회원 탈퇴'),
        ('📄', '포트폴리오 PDF', '나의 자산 현황을 PDF 파일로 저장합니다.\n\n• 설정 → 포트폴리오 PDF 출력 → 포함할 항목 선택 후 출력\n• 자산 구성(대출 차감 순자산), 이달 수입·지출(통계 제외 내역 자동 제외) 포함\n• 거래내역은 선택 시에만 최근 30건 포함'),
    ]
    _help_v_cfg = AppConfig.query.get('help_version')
    if _help_v_cfg is None or _help_v_cfg.value != _help_version:
        HelpItem.query.delete()
        for i, (icon, title, desc) in enumerate(_help_defaults):
            db.session.add(HelpItem(icon=icon, title=title, desc=desc, position=i))
        if _help_v_cfg:
            _help_v_cfg.value = _help_version
        else:
            db.session.add(AppConfig(key='help_version', value=_help_version))
        db.session.commit()

    # apk version registry — bumped in code each native release; the in-app
    # update prompt (AppUpdateModal) reads this via GET /api/app-version.
    # build_date is set by hand to when that APK was actually built (not the
    # server's restart date) — it's what makes the downloaded filename below
    # distinguishable from the previous release.
    _apk_version_code = 131
    _apk_version_name = 'ver 2.97'
    _apk_build_date = '2026-10-01'
    _apk_notice = None
    _apk_value = json.dumps({'version_code': _apk_version_code, 'version_name': _apk_version_name,
                              'url': '/download/gaegyebu-latest.apk', 'notice': _apk_notice,
                              'build_date': _apk_build_date}, ensure_ascii=False)
    _apk_cfg = AppConfig.query.get('apk_version')
    if _apk_cfg is None:
        db.session.add(AppConfig(key='apk_version', value=_apk_value))
        db.session.commit()
    elif _apk_cfg.value != _apk_value:
        _apk_cfg.value = _apk_value
        db.session.commit()

    # 푸룹(Life OS) apk version registry — gaegyebu처럼 숫자를 이 파일에 직접 박아두면
    # 푸룹 쪽 app.json 버전과 매번 따로 손으로 맞춰야 해서, 대신 Life OS 세션이
    # releases/puroop-latest.apk와 함께 놓아둘 releases/puroop-version.json
    # (예: {"version_code": 3, "version_name": "1.0.0"})을 그대로 읽어온다 —
    # 푸룹 쪽에서 이미 관리 중인 버전 표기를 그대로 가져다 쓰는 것. 그 파일이 아직
    # 없으면(첫 배포 전) 등록 자체를 건너뛰어 "푸룹 설치" 버튼이 계속 숨겨진 채로 둔다.
    _puroop_version_json = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'releases', 'puroop-version.json')
    if os.path.exists(_puroop_version_json):
        with open(_puroop_version_json, encoding='utf-8') as f:
            _puroop_info = json.load(f)
        _puroop_value = json.dumps({'version_code': int(_puroop_info.get('version_code') or 0),
                                     'version_name': _puroop_info.get('version_name') or '',
                                     'url': '/download/puroop-latest.apk'}, ensure_ascii=False)
    else:
        _puroop_value = None
    _puroop_cfg = AppConfig.query.get('puroop_apk_version')
    if _puroop_value is not None:
        if _puroop_cfg is None:
            db.session.add(AppConfig(key='puroop_apk_version', value=_puroop_value))
            db.session.commit()
        elif _puroop_cfg.value != _puroop_value:
            _puroop_cfg.value = _puroop_value
            db.session.commit()

    # one-time fix: reset price_updated_at for 해외주식 so auto-fetch re-runs
    # (previous version stored current_price in KRW; new version stores in USD)
    if AppConfig.query.get('fix_overseas_price_unit') is None:
        from models import Investment as _Inv
        _fixed = _Inv.query.filter_by(itype='해외주식').all()
        for _inv in _fixed:
            _inv.price_updated_at = None
        db.session.add(AppConfig(key='fix_overseas_price_unit', value='done'))
        db.session.commit()

    # one-time: seed 계좌 이체 category for all users
    if AppConfig.query.get('seed_account_transfer_cat') is None:
        for _u in User.query.all():
            if not Category.query.filter_by(user_id=_u.id, name='계좌 이체').first():
                _max_pos = db.session.query(db.func.max(Category.position)).filter_by(user_id=_u.id).scalar() or 0
                db.session.add(Category(user_id=_u.id, name='계좌 이체', icon='🔄',
                                        cat_type='expense', position=_max_pos + 1,
                                        exclude_perf=True, exclude_stats=True))
        db.session.add(AppConfig(key='seed_account_transfer_cat', value='done'))
        db.session.commit()

    # seed / upgrade update notice config
    _notice_v = 'ver 2.39'
    _notice = {
        'version': _notice_v,
        'date': '2026년 7월 26일',
        'updates': [
            {'section': '📅 캘린더 개선', 'items': [
                {'tag': 'new', 'title': '내역 꾹 누르기 → 수정·삭제', 'desc': '날짜 클릭 팝업과 월별 목록 모두에서 내역을 꾹 누르면 수정·삭제 바텀시트 표시\n— 스와이프 없이 빠르게 접근 가능'},
                {'tag': 'new', 'title': '카드별 필터', 'desc': '월별 내역 목록 위에 가로 스크롤 칩 행 추가\n— 해당 달에 사용한 카드별로 내역 필터링 가능'},
            ]},
            {'section': '🏠 홈 탭 개선', 'items': [
                {'tag': 'new', 'title': '실적바 카드 숨기기', 'desc': '카드명을 꾹 누르면 숨기기 확인 팝업 표시\n— 목돈 계좌 등 실적이 필요 없는 카드 숨기기 가능, 재시작 후에도 유지되며 하단 링크로 복원'},
                {'tag': 'new', 'title': '카드 내역 최신순·과거순 정렬', 'desc': '카드 실적바 클릭 시 나오는 내역 시트에 최신순 / 과거순 토글 버튼 추가'},
            ]},
        ]
    }
    existing = AppConfig.query.get('update_notice')
    if existing is None:
        db.session.add(AppConfig(key='update_notice', value=json.dumps(_notice, ensure_ascii=False)))
        db.session.commit()
    else:
        try:
            stored = json.loads(existing.value)
            if stored.get('version') != _notice_v:
                existing.value = json.dumps(_notice, ensure_ascii=False)
                db.session.commit()
        except Exception:
            pass

# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route('/api/me')
def api_me():
    uid = session.get('user_id')
    if not uid:
        return jsonify({'user': None})
    user = User.query.get(uid)
    if not user:
        session.pop('user_id', None)
        return jsonify({'user': None})
    return jsonify({'user': {'id': user.id, 'email': user.email, 'nickname': user.nickname, 'is_admin': user.email == ADMIN_EMAIL}})

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    nickname = data.get('nickname', '').strip()
    if not email or not password or len(password) < 6:
        return jsonify({'error': '이메일과 비밀번호(6자 이상)를 입력하세요'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': '이미 사용 중인 이메일입니다'}), 400
    user = User(email=email, nickname=nickname or None)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    _seed_user_categories(user.id)
    session.permanent = bool(data.get('remember', True))
    session['user_id'] = user.id
    return jsonify({'ok': True, 'email': user.email, 'nickname': user.nickname})

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'error': '이메일 또는 비밀번호가 올바르지 않습니다'}), 401
    session.permanent = bool(data.get('remember', True))
    session['user_id'] = user.id
    return jsonify({'ok': True, 'email': user.email, 'nickname': user.nickname})

def send_reset_email(to_email, code):
    mail_user = os.environ.get('MAIL_USER', '')
    mail_pass = os.environ.get('MAIL_PASSWORD', '')
    if not mail_user or not mail_pass:
        raise RuntimeError('이메일 설정이 되어 있지 않습니다')
    msg = MIMEText(f'인증번호: {code}\n\n30분 이내에 입력해주세요.', 'plain', 'utf-8')
    msg['Subject'] = '[나의 가계부] 비밀번호 재설정 인증번호'
    msg['From'] = mail_user
    msg['To'] = to_email
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
        s.login(mail_user, mail_pass)
        s.sendmail(mail_user, to_email, msg.as_string())

@app.route('/api/reset-request', methods=['POST'])
def api_reset_request():
    email = (request.json or {}).get('email', '').strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': '등록된 이메일이 없습니다'}), 404
    code = '%06d' % random.randint(0, 999999)
    user.reset_code = code
    user.reset_expires = datetime.now() + timedelta(minutes=30)
    db.session.commit()
    try:
        send_reset_email(email, code)
    except Exception as e:
        return jsonify({'error': f'이메일 발송에 실패했습니다: {str(e)}'}), 500
    return jsonify({'ok': True})

@app.route('/api/reset-confirm', methods=['POST'])
def api_reset_confirm():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    code = data.get('code', '')
    new_pw = data.get('password', '')
    user = User.query.filter_by(email=email).first()
    if not user or user.reset_code != code or not user.reset_expires or datetime.now() > user.reset_expires:
        return jsonify({'error': '코드가 잘못되었거나 만료되었습니다 (30분)'}), 400
    if len(new_pw) < 6:
        return jsonify({'error': '비밀번호는 6자 이상이어야 합니다'}), 400
    user.set_password(new_pw)
    user.reset_code = None
    user.reset_expires = None
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('user_id', None)
    return jsonify({'ok': True})

@app.route('/api/update-nickname', methods=['POST'])
@login_required
def api_update_nickname():
    nickname = (request.json or {}).get('nickname', '').strip()
    user = User.query.get(session['user_id'])
    user.nickname = nickname or None
    db.session.commit()
    return jsonify({'ok': True, 'nickname': user.nickname})

@app.route('/api/change-password', methods=['POST'])
@login_required
def api_change_password():
    data = request.json or {}
    current_pw = data.get('current_password', '')
    new_pw = data.get('new_password', '')
    if not current_pw or not new_pw:
        return jsonify({'error': '비밀번호를 입력하세요'}), 400
    if len(new_pw) < 6:
        return jsonify({'error': '새 비밀번호는 6자 이상이어야 합니다'}), 400
    user = User.query.get(session['user_id'])
    if not user.check_password(current_pw):
        return jsonify({'error': '현재 비밀번호가 올바르지 않습니다'}), 400
    user.set_password(new_pw)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/delete-account', methods=['POST'])
@login_required
def api_delete_account():
    uid = session['user_id']
    from sqlalchemy import text as _text
    with db.engine.connect() as conn:
        conn.execute(_text('DELETE FROM "transaction" WHERE user_id = :uid'), {'uid': uid})
        conn.commit()
    Budget.query.filter_by(user_id=uid).delete()
    Category.query.filter_by(user_id=uid).delete()
    Card.query.filter_by(user_id=uid).delete()
    user = User.query.get(uid)
    db.session.delete(user)
    db.session.commit()
    session.pop('user_id', None)
    return jsonify({'ok': True})

# ── Transaction filter helpers ───────────────────────────────────────────────

def _is_stats_tx(tx, excl_cats=frozenset()):
    return not tx.exclude_stats and tx.category not in excl_cats

def _is_perf_tx(tx, excl_cats=frozenset()):
    return not tx.exclude_perf and tx.category not in excl_cats

def _since_balance(tx_date, since):
    # since=None means the card has no recorded baseline date yet (legacy data) — count everything.
    return since is None or tx_date >= since

def _net_amount(tx):
    # Effective balance/perf contribution of a transaction once its card's cashback
    # is applied: payment-type cashback shrinks an expense's net cost, charge-type
    # bonus grows an income's net deposit. Both are stored in tx.cashback at write
    # time (see _compute_cashback) so downstream sums never need to look the card up.
    cashback = tx.cashback or 0
    return tx.amount - cashback if tx.type == 'expense' else tx.amount + cashback

def _is_account_expense(tx):
    # "전환된 포인트에서 차감" 지출은 계좌(이번 주기 충전) 잔고에서 빼지 않고 전환 포인트에서만 뺀다
    return tx.type == 'expense' and tx.point_pool != 'carryover'

def _point_balance(card, all_txs):
    # 포인트 카드의 "지금 쓸 수 있는 포인트" — account_balance(건드리지 않는 원본 anchor)
    # + 이번 주기 수입 - 지출 - 이번 주기에 "새로" 전환한 금액. point_carryover는 리셋이
    # 지나가도 안 비워지고 그대로 누적되므로(_apply_point_resets), 전체 point_carryover를
    # 매번 빼면 지난 주기에 이미 떼어둔 전환 포인트가 이번에 새로 충전된 금액까지 또
    # 깎아버린다 — point_carryover_baseline(마지막 리셋 시점의 스냅샷)을 뺀 "이번 주기
    # 순증분"만 빼야 한다. 포인트는 성격상 마이너스가 될 수 없으므로 0 아래로는 내려가지
    # 않게 막는다. /api/budget, /api/home, 포인트 전환/직접수정 엔드포인트가 전부 이 함수
    # 하나로 계산해야 서로 다른 값이 안 보인다.
    card_txs = [tx for tx in all_txs if tx.card == card.name]
    inc = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
    exp = sum(_net_amount(tx) for tx in card_txs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
    return max(0, (card.account_balance or 0) + inc - exp - (card.point_converted_cycle or 0))

def _effective_budget_amount(uid, month):
    # 이번 달에 예산을 따로 입력 안 했으면 0원이 아니라, 가장 최근에 설정해둔 이전 달
    # 예산을 그대로 이어서 보여준다 — 매달 새로 입력할 필요 없이 사용자가 직접 바꿀
    # 때까지는 마지막 설정값이 계속 유지된다.
    budget = Budget.query.filter_by(month=month, user_id=uid).first()
    if budget:
        return budget.amount
    prev = Budget.query.filter(Budget.user_id == uid, Budget.month < month).order_by(Budget.month.desc()).first()
    return prev.amount if prev else 0

def _compute_cashback(uid, card_name, tx_type, amount, exclude=False, description='', date=None, exclude_tx_id=None):
    """Returns (cashback_amount, matched_rule_id). 카드에 CashbackRule이 하나라도
    등록돼 있으면 그 규칙들로 계산하고(가맹점명 매칭 + 일/월 한도 + 카드 통합 월 한도),
    없으면 기존의 카드 단위 고정 비율(cashback_type/cashback_rate)로 계산한다 — 실제
    카드사들의 캐시백이 "결제 금액의 X%" 단순 비율인 경우도 많지만, 가맹점마다 비율과
    한도가 다 다른 카드(배달의민족 5%, 편의점 20% 등)도 있어 두 방식을 같이 지원한다."""
    if exclude or not card_name or tx_type not in ('income', 'expense'):
        return 0, None
    card = Card.query.filter_by(user_id=uid, name=card_name).first()
    if not card:
        return 0, None
    rules = CashbackRule.query.filter_by(card_id=card.id).order_by(CashbackRule.position, CashbackRule.id).all()
    if rules:
        # 규칙 기반 캐시백은 결제(지출)에만 적용 — 실제 카드 캐시백도 결제 기준이고,
        # "충전 시 적립"류는 여기서 다루지 않는다.
        if tx_type != 'expense':
            return 0, None
        date = date or datetime.now(_KST).strftime('%Y-%m-%d')
        desc_lower = (description or '').lower()
        matched = None
        prev_month = (datetime.strptime(date[:7] + '-01', '%Y-%m-%d').replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
        prev_spend = None
        for r in rules:
            keywords = [k.strip().lower() for k in (r.keywords or '').split(',') if k.strip()]
            if not any(k in desc_lower for k in keywords):
                continue
            if r.prev_month_min:
                if prev_spend is None:
                    prev_spend = sum(t.amount for t in Transaction.query.filter_by(user_id=uid, card=card_name, type='expense').all() if t.date.startswith(prev_month))
                if prev_spend < r.prev_month_min:
                    continue
            matched = r
            break
        if not matched:
            return 0, None
        cb = int(amount * matched.rate / 100)
        if cb <= 0:
            return 0, None
        day_str, month_str = date[:10], date[:7]
        rule_txs = Transaction.query.filter_by(user_id=uid, card=card_name, cashback_rule_id=matched.id).all()
        if exclude_tx_id:
            rule_txs = [t for t in rule_txs if t.id != exclude_tx_id]
        day_txs = [t for t in rule_txs if t.date == day_str]
        month_txs = [t for t in rule_txs if t.date.startswith(month_str)]
        if matched.daily_count_cap is not None and len(day_txs) >= matched.daily_count_cap:
            cb = 0
        if matched.daily_cap is not None:
            cb = min(cb, max(0, matched.daily_cap - sum(t.cashback or 0 for t in day_txs)))
        if matched.monthly_count_cap is not None and len(month_txs) >= matched.monthly_count_cap:
            cb = 0
        if matched.monthly_cap is not None:
            cb = min(cb, max(0, matched.monthly_cap - sum(t.cashback or 0 for t in month_txs)))
        if cb > 0 and card.cashback_monthly_cap is not None:
            card_txs = Transaction.query.filter_by(user_id=uid, card=card_name).filter(
                Transaction.cashback_rule_id.isnot(None), Transaction.date.like(f'{month_str}%')).all()
            if exclude_tx_id:
                card_txs = [t for t in card_txs if t.id != exclude_tx_id]
            overall_used = sum(t.cashback or 0 for t in card_txs)
            cb = min(cb, max(0, card.cashback_monthly_cap - overall_used))
        return cb, matched.id
    if not card.cashback_type or not card.cashback_rate:
        return 0, None
    if (card.cashback_type == 'payment' and tx_type == 'expense') or \
       (card.cashback_type == 'charge' and tx_type == 'income'):
        return int(amount * card.cashback_rate / 100), None
    return 0, None

# 매년 날짜가 고정인 공휴일(월, 일) — frontend/src/holidaySync.js의 FIXED_HOLIDAYS와 동일
_FIXED_HOLIDAYS_MD = {(1, 1), (3, 1), (5, 5), (6, 6), (8, 15), (10, 3), (10, 9), (12, 25)}
# 음력 명절 등 연도별 공휴일 — frontend/src/holidaySync.js의 LUNAR_HOLIDAYS_BY_YEAR와 동일하게
# 유지해야 함(새해가 되면 그 해 날짜 추가 필요)
_LUNAR_HOLIDAYS_BY_YEAR = {
    2026: {
        '2026-02-16', '2026-02-17', '2026-02-18',  # 설날 연휴
        '2026-03-02',  # 삼일절 대체공휴일
        '2026-05-24', '2026-05-25',  # 부처님오신날 + 대체공휴일
        '2026-08-17',  # 광복절 대체공휴일
        '2026-09-24', '2026-09-25', '2026-09-26',  # 추석 연휴
        '2026-10-05',  # 개천절 대체공휴일
    },
}

def _is_korean_holiday(d):
    if (d.month, d.day) in _FIXED_HOLIDAYS_MD:
        return True
    return d.isoformat() in _LUNAR_HOLIDAYS_BY_YEAR.get(d.year, ())

def _is_business_day(d):
    return d.weekday() < 5 and not _is_korean_holiday(d)

def _effective_point_reset_date(year, month, day):
    """The nominal reset day, pulled back to the preceding business day if it lands on a
    weekend or public holiday — matches how most companies actually pay out benefit points."""
    import calendar as _calendar
    from datetime import date as _date
    day = min(day, _calendar.monthrange(year, month)[1])
    d = _date(year, month, day)
    while not _is_business_day(d):
        d -= timedelta(days=1)
    return d

def _effective_withdrawal_date(year, month, day, direction='next'):
    """The nominal auto-transfer day, adjusted off a weekend/public holiday per the caller's
    preference — 'next'(default) pushes forward to the next business day (money being
    withdrawn typically goes out on the next business day, not early), 'prev' pulls
    back to the preceding business day instead, matching the point-reset convention."""
    import calendar as _calendar
    from datetime import date as _date
    day = min(day, _calendar.monthrange(year, month)[1])
    d = _date(year, month, day)
    step = -1 if direction == 'prev' else 1
    while not _is_business_day(d):
        d += timedelta(days=step)
    return d

def _apply_point_resets():
    """Runs daily: any card with point_reset_day set gets its balance snapped to
    point_reset_amount on its (weekend-adjusted) reset day, discarding whatever was
    left — a monthly allowance, not a carried-over balance. Independent of every
    other card's normal carry-forward behavior.
    point_carryover(전환해둔 포인트)는 여기서 account_balance에 합쳐버리지 않고
    그대로 둔다 — 합쳐버리면 "충전된 포인트"와 "전환한 포인트"가 한 숫자로
    뭉개져서 화면에 더 이상 구분해서 보여줄 수가 없다. 대신 point_carryover_baseline을
    지금 point_carryover 값으로 찍어둬서, _point_balance()가 "이번 주기에 새로 전환한
    금액"만 새 충전액에서 빼고 지난 주기부터 있던 전환 포인트는 건드리지 않게 한다."""
    with app.app_context():
        today = datetime.now(_KST).date()
        cards = Card.query.filter(Card.point_reset_day.isnot(None)).all()
        changed = False
        for card in cards:
            effective = _effective_point_reset_date(today.year, today.month, card.point_reset_day)
            eff_str = effective.strftime('%Y-%m-%d')
            if today == effective and card.point_reset_last_date != eff_str:
                card.account_balance = card.point_reset_amount or 0
                card.point_converted_cycle = 0
                card.balance_since = eff_str
                card.point_reset_last_date = eff_str
                changed = True
        if changed:
            db.session.commit()

def _running_balances_for_user(uid):
    """{transaction_id: balance_after_tx} for every transaction tied to a non-loan
    card, walking that card's (or its linked account's) ledger in chronological order
    starting from its account_balance as of balance_since."""
    cards = Card.query.filter_by(user_id=uid).all()
    all_txs = Transaction.query.filter_by(user_id=uid).order_by(
        Transaction.date, Transaction.time, Transaction.id).all()

    linked_names = {}
    for c in cards:
        if c.linked_account_id:
            linked_names.setdefault(c.linked_account_id, []).append(c.name)

    result = {}
    for card in cards:
        if card.linked_account_id:
            continue  # covered together with its parent account below
        if (card.account_balance or 0) < 0:
            continue  # loan cards don't track a running balance this way
        names = {card.name} | set(linked_names.get(card.id, []))
        group_txs = [tx for tx in all_txs if tx.card in names and _since_balance(tx.date, card.balance_since)]
        running = card.account_balance or 0
        for tx in group_txs:
            running += _net_amount(tx) if tx.type == 'income' else -_net_amount(tx)
            result[tx.id] = running
    return result

# ── Savings helper ───────────────────────────────────────────────────────────

def _savings_stats(s, extra_deposit=0):
    from datetime import date as _date
    today = _date.today()
    if s.stype == '청약':
        try:
            start = datetime.strptime(s.start_date, '%Y-%m-%d').date()
        except Exception:
            start = today
        months_elapsed_auto = max(0, (today.year - start.year) * 12 + (today.month - start.month) + 1)
        manual_count = getattr(s, 'manual_count', None)
        months_elapsed = manual_count if manual_count is not None else months_elapsed_auto
        current_paid = s.amount * months_elapsed + extra_deposit
        rate = s.interest_rate or 0
        itype = getattr(s, 'interest_type', '단리') or '단리'
        tax_type = getattr(s, 'tax_type', '비과세') or '비과세'
        n = max(1, months_elapsed)
        r_m = rate / 100 / 12
        if rate > 0:
            if itype == '복리' and r_m > 0:
                interest = int(s.amount * (1 + r_m) * ((1 + r_m) ** n - 1) / r_m) - current_paid
            else:
                interest = int(s.amount * r_m * n * (n + 1) / 2)
        else:
            interest = 0
        if tax_type == '비과세':
            tax = 0
        elif tax_type == '세금우대':
            income_tax = (int(interest * 0.09) // 10) * 10
            tax = income_tax + (int(income_tax * 0.1) // 10) * 10
        elif tax_type.startswith('ISA') or tax_type == 'ISA':
            threshold = 4_000_000 if tax_type == 'ISA(서민형)' else 2_000_000
            taxable = max(0, interest - threshold)
            income_tax = (int(taxable * 0.09) // 10) * 10
            tax = income_tax + (int(income_tax * 0.1) // 10) * 10
        else:
            income_tax = (int(interest * 0.14) // 10) * 10
            tax = income_tax + (int(income_tax * 0.1) // 10) * 10
        interest_after_tax = interest - tax
        return {
            'id': s.id, 'stype': s.stype, 'bank': s.bank, 'name': s.name,
            'amount': s.amount, 'interest_rate': rate, 'interest_type': itype,
            'tax_type': tax_type,
            'start_date': s.start_date, 'end_date': '',
            'months_total': None, 'months_elapsed': months_elapsed,
            'months_elapsed_auto': months_elapsed_auto,
            'progress': 0, 'd_day': None,
            'total_paid': current_paid, 'current_paid': current_paid,
            'interest': interest, 'maturity_amount': current_paid + interest_after_tax,
            'interest_after_tax': interest_after_tax, 'maturity_after_tax': current_paid + interest_after_tax,
            'extra_deposit': extra_deposit,
            'notify_day': getattr(s, 'notify_day', None),
            'auto_tx': bool(getattr(s, 'auto_tx', False)),
            'auto_tx_day': getattr(s, 'auto_tx_day', None),
            'auto_tx_card': getattr(s, 'auto_tx_card', '') or '',
            'weekend_adjust': getattr(s, 'weekend_adjust', 'next') or 'next',
            'exclude_stats': bool(getattr(s, 'exclude_stats', False)),
            'manual_count': manual_count,
            'is_paused': bool(getattr(s, 'is_paused', False)),
        }
    try:
        start = datetime.strptime(s.start_date, '%Y-%m-%d').date()
        end = datetime.strptime(s.end_date, '%Y-%m-%d').date()
    except Exception:
        start = today; end = today
    months_total = max(1, (end.year - start.year) * 12 + (end.month - start.month))
    months_elapsed_auto = max(0, min(months_total, (today.year - start.year) * 12 + (today.month - start.month)))
    _manual_count = getattr(s, 'manual_count', None)
    months_elapsed = _manual_count if _manual_count is not None else months_elapsed_auto
    days_total = max(1, (end - start).days)
    days_elapsed = max(0, min(days_total, (today - start).days)) if _manual_count is None else int(_manual_count / months_total * days_total)
    progress = min(100.0, round(days_elapsed / days_total * 100, 1))
    d_day = (end - today).days
    rate = s.interest_rate or 0
    itype = getattr(s, 'interest_type', '단리') or '단리'
    tax_type = getattr(s, 'tax_type', '일반과세') or '일반과세'
    if s.stype == '예금':
        total_paid = s.amount
        current_paid = s.amount
        if itype == '복리':
            interest = int(s.amount * (1 + rate / 100 / 12) ** months_total) - s.amount
        else:
            interest = int(s.amount * rate / 100 * days_total / 365)
        maturity_amount = s.amount + interest
    else:  # 적금, 청약
        total_paid = s.amount * months_total
        current_paid = s.amount * months_elapsed
        bonus_amount = getattr(s, 'bonus_amount', None) or 0
        bonus_total = bonus_amount * months_total if bonus_amount else 0
        bonus_current = bonus_amount * months_elapsed if bonus_amount else 0
        n = months_total
        r_m = rate / 100 / 12
        if itype == '복리' and r_m > 0:
            interest = int(s.amount * (1 + r_m) * ((1 + r_m) ** n - 1) / r_m) - total_paid
        else:
            # 적금 단리: 월납입액 × 월이율 × n(n+1)/2
            interest = int(s.amount * r_m * n * (n + 1) / 2)
        maturity_amount = total_paid + bonus_total + interest
    # 세금: 이자소득세(14%) 원 미만 절사 → 지방소득세 = 이자소득세의 10% 원 미만 절사
    if tax_type == '비과세':
        tax = 0
    elif tax_type == '세금우대':
        income_tax = (int(interest * 0.09) // 10) * 10
        tax = income_tax + (int(income_tax * 0.1) // 10) * 10
    elif tax_type.startswith('ISA') or tax_type == 'ISA':
        threshold = 4_000_000 if tax_type == 'ISA(서민형)' else 2_000_000
        taxable = max(0, interest - threshold)
        income_tax = (int(taxable * 0.09) // 10) * 10
        tax = income_tax + (int(income_tax * 0.1) // 10) * 10
    else:
        income_tax = (int(interest * 0.14) // 10) * 10
        tax = income_tax + (int(income_tax * 0.1) // 10) * 10
    interest_after_tax = interest - tax
    principal = s.amount if s.stype == '예금' else total_paid
    maturity_after_tax = principal + interest_after_tax + (bonus_total if s.stype != '예금' else 0)
    return {
        'id': s.id, 'stype': s.stype, 'bank': s.bank, 'name': s.name,
        'amount': s.amount, 'interest_rate': rate, 'interest_type': itype,
        'tax_type': tax_type,
        'start_date': s.start_date, 'end_date': s.end_date,
        'months_total': months_total, 'months_elapsed': months_elapsed,
        'months_elapsed_auto': months_elapsed_auto,
        'progress': progress, 'd_day': d_day,
        'total_paid': total_paid, 'current_paid': current_paid,
        'interest': interest, 'maturity_amount': maturity_amount,
        'interest_after_tax': interest_after_tax, 'maturity_after_tax': maturity_after_tax,
        'notify_day': getattr(s, 'notify_day', None),
        'auto_tx': bool(getattr(s, 'auto_tx', False)),
        'auto_tx_day': getattr(s, 'auto_tx_day', None),
        'auto_tx_card': getattr(s, 'auto_tx_card', '') or '',
        'weekend_adjust': getattr(s, 'weekend_adjust', 'next') or 'next',
        'exclude_stats': bool(getattr(s, 'exclude_stats', False)),
        'manual_count': _manual_count,
        'is_paused': bool(getattr(s, 'is_paused', False)),
        'bonus_amount': getattr(s, 'bonus_amount', None) or 0,
        'bonus_total': bonus_total if s.stype != '예금' else 0,
        'bonus_current': bonus_current if s.stype != '예금' else 0,
    }

_KST = timezone(timedelta(hours=9))

def _last_market_close(market):
    now = datetime.now(_KST)
    if market == 'KR':
        for delta in range(8):
            d = now.date() - timedelta(days=delta)
            if d.weekday() < 5:
                dt = datetime(d.year, d.month, d.day, 15, 30, tzinfo=_KST)
                if dt <= now:
                    return dt
    elif market == 'US':
        for delta in range(8):
            avail_date = now.date() - timedelta(days=delta)
            avail_dt = datetime(avail_date.year, avail_date.month, avail_date.day, 6, 0, tzinfo=_KST)
            if avail_dt > now:
                continue
            us_trade_day = avail_date - timedelta(days=1)
            if us_trade_day.weekday() < 5:
                return avail_dt
    return now - timedelta(days=30)

def _inv_market(inv):
    if inv.itype == '국내주식':
        return 'KR'
    if inv.itype == '해외주식':
        return 'US'
    if inv.itype == 'ETF':
        t = (inv.ticker or '').strip().upper()
        if t.endswith('.KS') or t.endswith('.KQ') or t.replace('.', '').isdigit():
            return 'KR'
        return 'US'
    return None

def _needs_price_update(inv):
    market = _inv_market(inv)
    if market is None or not (inv.ticker or '').strip():
        return False
    if inv.price_updated_at is None:
        return True
    last = inv.price_updated_at.replace(tzinfo=timezone.utc).astimezone(_KST)
    return last < _last_market_close(market)

_PRICE_FETCH_TIMEOUT = 20  # seconds — bounds the background fetch, doesn't block any request

def _auto_fetch_investment_prices(inv_list):
    # Fires the actual fetch on a background thread so /api/budget returns immediately
    # with whatever prices are already cached — previously this awaited the external
    # price API inline and could stall the budget tab's first load for seconds.
    todo_ids = [inv.id for inv in inv_list if _needs_price_update(inv) and (inv.ticker or '').strip()]
    if not todo_ids:
        return
    threading.Thread(target=_fetch_investment_prices_bg, args=(todo_ids,), daemon=True).start()

def _fetch_investment_prices_bg(todo_ids):
    with app.app_context():
        todo = Investment.query.filter(Investment.id.in_(todo_ids)).all()
        if not todo:
            return
        _fetch_investment_prices_sync(todo)

def _fetch_investment_prices_sync(todo):
    from concurrent.futures import ThreadPoolExecutor, wait
    from datetime import date, timedelta
    import FinanceDataReader as fdr

    start = (date.today() - timedelta(days=7)).strftime('%Y-%m-%d')

    def fetch_fx():
        try:
            fx = fdr.DataReader('USD/KRW', start)
            if not fx.empty:
                return float(fx['Close'].iloc[-1])
        except Exception:
            pass
        return None

    def fetch_price(inv):
        market = _inv_market(inv)
        try:
            t = (inv.ticker or '').strip()
            if market == 'KR':
                t_clean = t.replace('.KS', '').replace('.KQ', '')
                df = fdr.DataReader(t_clean, start)
            elif market == 'US':
                df = fdr.DataReader(t, start)
            else:
                return inv.id, None, market
            if df.empty:
                return inv.id, None, market
            price = float(df['Close'].iloc[-1])
            return inv.id, price, market
        except Exception:
            return inv.id, None, market

    id_map = {inv.id: inv for inv in todo}
    # Don't use ThreadPoolExecutor as a context manager here: __exit__ calls
    # shutdown(wait=True), which would block on stragglers past our timeout anyway.
    ex = ThreadPoolExecutor(max_workers=min(4, len(todo) + 1))
    try:
        fx_future = ex.submit(fetch_fx)
        price_futures = {ex.submit(fetch_price, inv): inv.id for inv in todo}
        done, _not_done = wait([fx_future] + list(price_futures), timeout=_PRICE_FETCH_TIMEOUT)
    finally:
        ex.shutdown(wait=False)

    usd_krw = 1380
    if fx_future in done:
        fx_result = fx_future.result()
        if fx_result is not None:
            usd_krw = fx_result

    changed = False
    for f in done:
        if f is fx_future:
            continue
        inv_id, price, market = f.result()
        if price is not None:
            inv = id_map[inv_id]
            inv.current_price = price
            # US stocks: store in USD (same unit as avg_price). KR stocks: store in KRW.
            if market == 'US':
                inv.exchange_rate = usd_krw
            inv.price_updated_at = datetime.utcnow()
            changed = True
    if changed:
        db.session.commit()

def _invest_account_list(uid, stats_list):
    # 투자 계좌 잔고 = 계좌에 든 종목들의 현재 평가금액 합 + 예수금
    accts = InvestAccount.query.filter_by(user_id=uid).order_by(InvestAccount.position, InvestAccount.id).all()
    out = []
    for a in accts:
        held = [st for st in stats_list if st.get('account_id') == a.id]
        holdings_value = sum(st['current_value'] for st in held)
        out.append({
            'id': a.id, 'name': a.name, 'broker': a.broker or '', 'broker_name': a.broker_name or '',
            'has_custom_icon': bool(a.has_custom_icon), 'icon_v': _acct_icon_version(a),
            'cash': int(a.cash or 0),
            'cash_set': bool(a.cash_set),
            'broker': a.broker or '',
            'holdings_value': holdings_value,
            'balance': holdings_value + (int(a.cash or 0) if a.cash_set else 0),
            'purchase_value': sum(st['purchase_value'] for st in held),
            'holding_count': len(held),
        })
    return out

def _inv_realized(inv_id):
    # 매도 금액 누계 (원화 환산)
    sells = InvestmentTrade.query.filter_by(investment_id=inv_id, side='sell').all()
    return int(sum(t.quantity * t.price * (t.exchange_rate or 1) - (t.fee or 0) for t in sells))

def _investment_stats(inv):
    qty = inv.quantity or 0
    avg = inv.avg_price or 0
    cur = inv.current_price if inv.current_price is not None else avg
    fx = inv.exchange_rate or None
    if inv.itype == '해외주식' and fx:
        purchase_value = int(qty * avg * fx)
        current_value = int(qty * cur * fx)
    else:
        purchase_value = int(qty * avg)
        current_value = int(qty * cur)
    profit = current_value - purchase_value
    profit_pct = round(profit / purchase_value * 100, 2) if purchase_value else 0
    updated_at = None
    if inv.price_updated_at:
        updated_at = inv.price_updated_at.replace(tzinfo=timezone.utc).astimezone(_KST).strftime('%m.%d %H:%M')
    return {
        'id': inv.id, 'itype': inv.itype, 'name': inv.name,
        'ticker': inv.ticker or '', 'quantity': qty,
        'avg_price': avg, 'current_price': cur,
        'exchange_rate': fx,
        'purchase_value': purchase_value, 'current_value': current_value,
        'profit': profit, 'profit_pct': profit_pct,
        'memo': inv.memo or '',
        'account_type': getattr(inv, 'account_type', '일반') or '일반',
        'price_updated_at': updated_at,
        'exclude_stats': bool(getattr(inv, 'exclude_stats', False)),
        'account_id': inv.account_id,
        'realized_sales': _inv_realized(inv.id),
    }

# ── JSON API routes ───────────────────────────────────────────────────────────

@app.route('/api/home')
@login_required
def api_home():
    uid = session['user_id']
    current_month = datetime.now(_KST).strftime('%Y-%m')
    transactions = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.desc()).all()
    month_txs = [tx for tx in transactions if tx.date.startswith(current_month)]

    income_total = sum(tx.amount for tx in month_txs if tx.type == 'income' and _is_stats_tx(tx))
    expense_total = sum(tx.amount for tx in month_txs if tx.type == 'expense' and _is_stats_tx(tx))

    budget_amount = _effective_budget_amount(uid, current_month)

    cards = Card.query.filter_by(user_id=uid).all()
    expense_cats = Category.query.filter_by(user_id=uid, cat_type='expense').order_by(Category.position, Category.id).all()
    income_cats = Category.query.filter_by(user_id=uid, cat_type='income').order_by(Category.position, Category.id).all()
    excl_cats = {c.name for c in expense_cats if c.exclude_perf}
    excl_stat_cats = {c.name for c in (expense_cats + income_cats) if c.exclude_stats}
    card_stats = []
    for card in cards:
        spent = sum(_net_amount(tx) for tx in month_txs
                    if tx.type == 'expense' and tx.card == card.name
                    and _is_perf_tx(tx, excl_cats))
        card_stats.append({
            'name': card.name,
            'target': card.monthly_target,
            'spent': spent,
            'percent': min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0,
            'tier1': card.tier1 or 20, 'tier2': card.tier2 or 50, 'tier3': card.tier3 or 80,
            'is_loan': (card.account_balance or 0) < 0,
            'id': card.id, 'has_custom_icon': bool(card.has_custom_icon),
        })
    emoji_map = {c.name: c.icon for c in expense_cats + income_cats}

    category_totals = defaultdict(int)
    for tx in month_txs:
        if tx.type == 'expense' and _is_stats_tx(tx, excl_stat_cats):
            category_totals[tx.category] += tx.amount
    category_totals = dict(sorted(category_totals.items(), key=lambda x: x[1], reverse=True))

    routines = Routine.query.filter_by(user_id=uid).order_by(Routine.position, Routine.id).all()
    by_routine = _routine_items(uid)
    running_balances = _running_balances_for_user(uid)
    goals = SavingsGoal.query.filter_by(user_id=uid).order_by(SavingsGoal.position, SavingsGoal.id).all()
    goals_savings_by_id, goals_inv_by_id, goals_acct_by_id = _goal_maps(uid)
    return jsonify({
        'transactions': [{'id': tx.id, 'date': tx.date, 'time': tx.time or '', 'type': tx.type, 'category': tx.category,
                          'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or '',
                          'exclude_perf': bool(tx.exclude_perf), 'exclude_stats': bool(tx.exclude_stats),
                          'has_receipt': bool(getattr(tx, 'has_receipt', False)), 'cashback': tx.cashback or 0,
                          'balance_after': running_balances.get(tx.id)} for tx in month_txs],
        'income_total': income_total,
        'expense_total': expense_total,
        'balance': income_total - expense_total,
        'budget_amount': budget_amount,
        'remaining': budget_amount - expense_total,
        'card_stats': card_stats,
        'card_list': [{'id': c.id, 'name': c.name, 'is_loan': (c.account_balance or 0) < 0 and not c.point_reset_day,
                       'has_custom_icon': bool(c.has_custom_icon), 'cashback_type': c.cashback_type or '',
                       'point_reset_day': c.point_reset_day, 'point_carryover': c.point_carryover or 0,
                       'balance': _point_balance(c, transactions) if c.point_reset_day else None} for c in cards],
        'expense_cats': [[c.name, c.icon] for c in expense_cats],
        'income_cats': [[c.name, c.icon] for c in income_cats],
        'emoji_map': emoji_map,
        'category_totals': category_totals,
        'excl_cat_names': list(excl_cats),
        'excl_stat_cat_names': list(excl_stat_cats),
        'routines': [{'id': r.id, 'name': r.name, 'icon': r.icon or '', 'card': r.card or '', 'items': by_routine.get(r.id, [])} for r in routines],
        'budget_limits': {a.category_name: a.monthly_limit for a in BudgetAllocation.query.filter_by(user_id=uid).all() if a.monthly_limit},
        'savings_goals': [_savings_goal_json(g, goals_savings_by_id, goals_inv_by_id, goals_acct_by_id) for g in goals],
    })

def _sync_salary_if_needed(uid, category, tx_type, amount):
    if category == '월급' and tx_type == 'income':
        cfg = SalaryConfig.query.filter_by(user_id=uid).first()
        if cfg:
            cfg.amount = amount
        else:
            db.session.add(SalaryConfig(user_id=uid, amount=amount, pay_day=None))
        db.session.commit()

def _adjust_point_carryover(uid, card_name, point_pool, tx_type, amount, sign):
    """포인트 카드 지출이 "전환된 포인트에서 차감"으로 표시된 경우에만 card.point_carryover를
    직접 늘리거나 줄인다. sign=-1: 새로 반영(차감), sign=+1: 되돌림(거래 수정 전 값 복구·삭제).
    일반("이번 포인트") 지출은 기존처럼 account_balance 쪽 거래 합산으로만 계산되므로 손대지 않는다."""
    if point_pool != 'carryover' or tx_type != 'expense' or not card_name:
        return
    card = Card.query.filter_by(user_id=uid, name=card_name).filter(Card.point_reset_day.isnot(None)).first()
    if not card:
        return
    card.point_carryover = (card.point_carryover or 0) + sign * amount

@app.route('/api/transactions', methods=['POST'])
@login_required
def api_add_transaction():
    uid = session['user_id']
    data = request.json or {}
    is_transfer = data.get('category') == '계좌 이체'
    desc = data.get('description', '')
    card = data.get('card') or None
    if is_transfer and ' → ' in desc and not card:
        card = desc.split(' → ')[0].strip() or None
    now_time = datetime.now(_KST).strftime('%H:%M')
    amount = int(data['amount'])
    exclude_cashback = bool(data.get('exclude_cashback', False))
    point_pool = data.get('point_pool') if data['type'] == 'expense' else None
    if point_pool == 'carryover' and card:
        pc = Card.query.filter_by(user_id=uid, name=card).filter(Card.point_reset_day.isnot(None)).first()
        if pc and amount > (pc.point_carryover or 0):
            return jsonify({'error': '전환 포인트가 부족합니다'}), 400
    cashback_manual = bool(data.get('cashback_manual', False))
    if cashback_manual:
        cb_amount, cb_rule_id = int(data.get('cashback_amount', 0) or 0), None
    else:
        cb_amount, cb_rule_id = _compute_cashback(uid, card, data['type'], amount, exclude_cashback, desc, data['date'])
    tx = Transaction(
        date=data['date'], type=data['type'], category=data['category'],
        description=desc, amount=amount,
        card=card,
        exclude_perf=bool(data.get('exclude_perf', False)),
        exclude_stats=bool(data.get('exclude_stats', False)),
        exclude_cashback=exclude_cashback,
        time=now_time,
        cashback=cb_amount, cashback_rule_id=cb_rule_id, cashback_manual=cashback_manual,
        user_id=uid,
        point_pool=point_pool,
    )
    db.session.add(tx)
    _adjust_point_carryover(uid, card, point_pool, data['type'], amount, -1)
    if is_transfer and ' → ' in desc:
        to_card = desc.split(' → ')[1].strip() or None
        paired_cb, _ = _compute_cashback(uid, to_card, 'income', amount, False, desc, data['date'])
        paired = Transaction(
            date=data['date'], type='income', category='계좌 이체',
            description=desc, amount=amount,
            card=to_card, exclude_perf=True, exclude_stats=True,
            time=now_time,
            cashback=paired_cb,
            user_id=uid,
        )
        db.session.add(paired)
    db.session.commit()
    _sync_salary_if_needed(uid, tx.category, tx.type, tx.amount)
    return jsonify({'ok': True, 'id': tx.id})

@app.route('/api/transactions/bulk', methods=['POST'])
@login_required
def api_transactions_bulk():
    # 내역 목록 다중 선택에서 한 번에 처리. 계좌 이체 짝 거래와 전환 포인트 지출의
    # 카드 변경은 개별 수정 흐름을 그대로 따라가기 어려워 건너뛰고 건수만 돌려준다.
    uid = session['user_id']
    data = request.json or {}
    ids = [int(i) for i in data.get('ids', [])]
    action = data.get('action')
    value = data.get('value')
    txs = Transaction.query.filter(Transaction.user_id == uid, Transaction.id.in_(ids)).all()
    done = 0
    skipped = 0
    for tx in txs:
        if action == 'delete':
            if tx.category == '계좌 이체':
                sibling = Transaction.query.filter(
                    Transaction.user_id == uid, Transaction.id != tx.id,
                    Transaction.category == '계좌 이체', Transaction.description == tx.description,
                    Transaction.amount == tx.amount, Transaction.date == tx.date,
                    Transaction.type != tx.type,
                ).first()
                if sibling:
                    db.session.delete(sibling)
            linked_saving = Savings.query.filter_by(user_id=uid, withdraw_transaction_id=tx.id).first()
            if linked_saving:
                db.session.delete(linked_saving)
            _adjust_point_carryover(uid, tx.card, tx.point_pool, tx.type, tx.amount, 1)
            db.session.delete(tx)
            done += 1
        elif action == 'set_card':
            if tx.category == '계좌 이체' or tx.point_pool == 'carryover':
                skipped += 1
                continue
            tx.card = value or None
            if not tx.cashback_manual:
                tx.cashback, tx.cashback_rule_id = _compute_cashback(uid, tx.card, tx.type, tx.amount, tx.exclude_cashback, tx.description, tx.date, exclude_tx_id=tx.id)
            done += 1
        elif action == 'set_category':
            if tx.category == '계좌 이체':
                skipped += 1
                continue
            tx.category = value
            done += 1
        elif action == 'set_date':
            if tx.category == '계좌 이체' or not value:
                skipped += 1
                continue
            tx.date = value
            if not tx.cashback_manual:
                tx.cashback, tx.cashback_rule_id = _compute_cashback(uid, tx.card, tx.type, tx.amount, tx.exclude_cashback, tx.description, tx.date, exclude_tx_id=tx.id)
            done += 1
        elif action == 'set_exclude_perf':
            tx.exclude_perf = bool(value)
            done += 1
        elif action == 'set_exclude_stats':
            tx.exclude_stats = bool(value)
            done += 1
        else:
            return jsonify({'error': 'invalid action'}), 400
    db.session.commit()
    return jsonify({'ok': True, 'done': done, 'skipped': skipped})

@app.route('/api/transactions/<int:tx_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_transaction(tx_id):
    uid = session['user_id']
    tx = Transaction.query.filter_by(id=tx_id, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        if tx.category == '계좌 이체':
            sibling = Transaction.query.filter(
                Transaction.user_id == uid, Transaction.id != tx.id,
                Transaction.category == '계좌 이체', Transaction.description == tx.description,
                Transaction.amount == tx.amount, Transaction.date == tx.date,
                Transaction.type != tx.type,
            ).first()
            if sibling:
                db.session.delete(sibling)
        linked_saving = Savings.query.filter_by(user_id=uid, withdraw_transaction_id=tx.id).first()
        if linked_saving:
            db.session.delete(linked_saving)
        _adjust_point_carryover(uid, tx.card, tx.point_pool, tx.type, tx.amount, 1)
        db.session.delete(tx)
        db.session.commit()
        return jsonify({'ok': True})
    if request.method == 'PUT':
        data = request.json or {}
        new_type = data.get('type', tx.type)
        new_card = data.get('card') or None if 'card' in data else tx.card
        new_amount = int(data.get('amount', tx.amount))
        new_pool = (data['point_pool'] if 'point_pool' in data else tx.point_pool) if new_type == 'expense' else None
        if new_pool == 'carryover' and new_type == 'expense' and new_card:
            pc = Card.query.filter_by(user_id=uid, name=new_card).filter(Card.point_reset_day.isnot(None)).first()
            if pc:
                avail = pc.point_carryover or 0
                if tx.point_pool == 'carryover' and tx.type == 'expense' and tx.card == new_card:
                    avail += tx.amount
                if new_amount > avail:
                    return jsonify({'error': '전환 포인트가 부족합니다'}), 400
        old_date, old_desc, old_amount, old_type, old_category = tx.date, tx.description, tx.amount, tx.type, tx.category
        old_card, old_point_pool = tx.card, tx.point_pool
        tx.date = data.get('date', tx.date)
        tx.type = data.get('type', tx.type)
        tx.category = data.get('category', tx.category)
        tx.description = data.get('description', tx.description)
        tx.amount = int(data.get('amount', tx.amount))
        tx.card = data.get('card') or None
        if 'exclude_perf' in data:
            tx.exclude_perf = bool(data['exclude_perf'])
        if 'exclude_stats' in data:
            tx.exclude_stats = bool(data['exclude_stats'])
        if 'exclude_cashback' in data:
            tx.exclude_cashback = bool(data['exclude_cashback'])
        if 'point_pool' in data:
            tx.point_pool = data['point_pool'] if tx.type == 'expense' else None
        elif tx.type != 'expense':
            tx.point_pool = None
        if 'cashback_manual' in data:
            tx.cashback_manual = bool(data['cashback_manual'])
        if tx.cashback_manual:
            tx.cashback = int(data.get('cashback_amount', tx.cashback) or 0)
            tx.cashback_rule_id = None
        else:
            tx.cashback, tx.cashback_rule_id = _compute_cashback(uid, tx.card, tx.type, tx.amount, tx.exclude_cashback, tx.description, tx.date, exclude_tx_id=tx.id)
        # 전환 포인트 차감 거래였으면 수정 전 값만큼 먼저 되돌려놓고, 수정된 값으로 다시 반영
        _adjust_point_carryover(uid, old_card, old_point_pool, old_type, old_amount, 1)
        _adjust_point_carryover(uid, tx.card, tx.point_pool, tx.type, tx.amount, -1)

        # 계좌 이체는 지출/수입 두 건이 한 쌍으로 생성되는데, 한쪽 날짜만 바꾸면
        # 두 건의 날짜가 어긋나 버리므로 짝이 되는 거래도 같이 옮겨준다.
        if old_category == '계좌 이체' and tx.date != old_date:
            sibling = Transaction.query.filter(
                Transaction.user_id == uid, Transaction.id != tx.id,
                Transaction.category == '계좌 이체', Transaction.description == old_desc,
                Transaction.amount == old_amount, Transaction.date == old_date,
                Transaction.type != old_type,
            ).first()
            if sibling:
                sibling.date = tx.date

        db.session.commit()
        _sync_salary_if_needed(uid, tx.category, tx.type, tx.amount)
        return jsonify({'ok': True})
    expense_cats = Category.query.filter_by(user_id=uid, cat_type='expense').order_by(Category.position, Category.id).all()
    income_cats = Category.query.filter_by(user_id=uid, cat_type='income').order_by(Category.position, Category.id).all()
    _edit_cards = Card.query.filter_by(user_id=uid).all()
    _all_txs = Transaction.query.filter_by(user_id=uid).all()
    return jsonify({
        'transaction': {'id': tx.id, 'date': tx.date, 'time': tx.time or '', 'type': tx.type, 'category': tx.category,
                        'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or '',
                        'exclude_perf': bool(tx.exclude_perf), 'exclude_stats': bool(tx.exclude_stats),
                        'exclude_cashback': bool(getattr(tx, 'exclude_cashback', False)),
                        'has_receipt': bool(getattr(tx, 'has_receipt', False)), 'cashback': tx.cashback or 0,
                        'cashback_manual': bool(tx.cashback_manual),
                        'point_pool': tx.point_pool or ''},
        'expense_cats': [[c.name, c.icon] for c in expense_cats],
        'income_cats': [[c.name, c.icon] for c in income_cats],
        'card_list': [{'id': c.id, 'name': c.name, 'is_loan': (c.account_balance or 0) < 0 and not c.point_reset_day,
                       'has_custom_icon': bool(c.has_custom_icon), 'cashback_type': c.cashback_type or '',
                       'point_reset_day': c.point_reset_day, 'point_carryover': c.point_carryover or 0,
                       'balance': _point_balance(c, _all_txs) if c.point_reset_day else None}
                      for c in _edit_cards],
        'excl_cat_names': [c.name for c in expense_cats if c.exclude_perf],
        'excl_stat_cat_names': [c.name for c in (expense_cats + income_cats) if c.exclude_stats],
    })

@app.route('/api/debug/balance-check')
@login_required
def api_debug_balance_check():
    uid = session['user_id']
    cards = Card.query.filter_by(user_id=uid).all()
    all_txs = Transaction.query.filter_by(user_id=uid).all()
    out = []
    for card in cards:
        if (card.account_balance or 0) < 0:
            continue  # loans compute differently; not relevant to this check
        card_txs = [tx for tx in all_txs if tx.card == card.name]
        dates = sorted(tx.date for tx in card_txs)
        excluded = [tx for tx in card_txs if not _since_balance(tx.date, card.balance_since)]
        inc_now = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
        exp_now = sum(_net_amount(tx) for tx in card_txs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
        inc_all = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income')
        exp_all = sum(_net_amount(tx) for tx in card_txs if tx.type == 'expense')
        initial = card.account_balance or 0
        out.append({
            'name': card.name,
            'initial_balance': initial,
            'balance_since': card.balance_since,
            'earliest_tx_date': dates[0] if dates else None,
            'latest_tx_date': dates[-1] if dates else None,
            'tx_count': len(card_txs),
            'tx_excluded_by_balance_since': len(excluded),
            'current_balance_now': initial + inc_now - exp_now,
            'current_balance_if_counting_everything': initial + inc_all - exp_all,
        })
    return jsonify(out)

@app.route('/api/debug/fix-balance-since')
@login_required
def api_debug_fix_balance_since():
    # One-time remediation for cards whose balance_since got bumped forward by the
    # since-fixed bug (every card edit reset it, not just ones that changed the
    # balance) — clears it back to None (count all history) for any card where that
    # cutoff is currently hiding transactions. Cards with nothing excluded are untouched.
    uid = session['user_id']
    cards = Card.query.filter_by(user_id=uid).all()
    all_txs = Transaction.query.filter_by(user_id=uid).all()
    fixed = []
    for card in cards:
        if (card.account_balance or 0) < 0:
            continue
        card_txs = [tx for tx in all_txs if tx.card == card.name]
        excluded = [tx for tx in card_txs if not _since_balance(tx.date, card.balance_since)]
        if excluded:
            fixed.append({'name': card.name, 'old_balance_since': card.balance_since, 'tx_restored': len(excluded)})
            card.balance_since = None
    db.session.commit()
    return jsonify({'fixed': fixed})

@app.route('/api/cards', methods=['GET', 'POST'])
@login_required
def api_cards():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        max_pos = db.session.query(db.func.max(Card.position)).filter_by(user_id=uid).scalar() or 0
        card = Card(
            name=data['name'], monthly_target=int(data.get('target', 0)),
            tier1=int(data.get('tier1', 20)), tier2=int(data.get('tier2', 50)), tier3=int(data.get('tier3', 80)),
            account_balance=int(data.get('account_balance', 0)),
            balance_since=datetime.now(_KST).strftime('%Y-%m-%d'),
            url=data.get('url') or None,
            user_id=uid,
            linked_account_id=data.get('linked_account_id') or None,
            cashback_type=data.get('cashback_type') or None,
            cashback_rate=float(data['cashback_rate']) if data.get('cashback_rate') not in (None, '') else None,
            position=max_pos + 1,
            point_reset_day=int(data['point_reset_day']) if data.get('point_reset_day') not in (None, '') else None,
            point_reset_amount=int(data['point_reset_amount']) if data.get('point_reset_amount') not in (None, '') else None,
        )
        db.session.add(card)
        db.session.commit()
        return jsonify({'ok': True, 'id': card.id})
    current_month = datetime.now(_KST).strftime('%Y-%m')
    month_txs = Transaction.query.filter_by(user_id=uid).filter(Transaction.date.like(f'{current_month}%')).all()
    cards = Card.query.filter_by(user_id=uid).all()
    excl_cats_cards = {c.name for c in Category.query.filter_by(user_id=uid, exclude_perf=True).all()}
    stats = {}
    for card in cards:
        spent = sum(tx.amount for tx in month_txs
                    if tx.type == 'expense' and tx.card == card.name
                    and _is_perf_tx(tx, excl_cats_cards))
        stats[card.id] = {
            'spent': spent,
            'percent': min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0,
        }
    return jsonify({
        'cards': [{'id': c.id, 'name': c.name, 'target': c.monthly_target, 'url': c.url or '',
                   'tier1': c.tier1 or 20, 'tier2': c.tier2 or 50, 'tier3': c.tier3 or 80,
                   'account_balance': c.account_balance or 0, 'linked_account_id': c.linked_account_id,
                   'interest_rate': c.interest_rate,
                   'cashback_type': c.cashback_type or '', 'cashback_rate': c.cashback_rate,
                   'has_custom_icon': bool(c.has_custom_icon),
                   'point_reset_day': c.point_reset_day, 'point_reset_amount': c.point_reset_amount} for c in cards],
        'stats': stats,
    })

@app.route('/api/cards/reorder', methods=['POST'])
@login_required
def api_reorder_cards():
    uid = session['user_id']
    ids = (request.json or {}).get('ids', [])
    for i, card_id in enumerate(ids):
        card = Card.query.filter_by(id=card_id, user_id=uid).first()
        if card:
            card.position = i
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/cards/<int:card_id>', methods=['PUT', 'DELETE'])
@login_required
def api_card(card_id):
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(card)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    card.name = data.get('name', card.name)
    card.monthly_target = int(data.get('target', card.monthly_target))
    card.tier1 = int(data.get('tier1', card.tier1 or 20))
    card.tier2 = int(data.get('tier2', card.tier2 or 50))
    card.tier3 = int(data.get('tier3', card.tier3 or 80))
    if 'account_balance' in data:
        card.account_balance = int(data['account_balance'])
    if 'balance_since' in data:
        # balance_since is the date the account_balance figure is true as of — only
        # transactions on/after it count toward the running balance. The edit form
        # always resends whatever date is currently loaded (via card.balance_since),
        # so this only actually changes anything when the user deliberately edits the
        # amount and/or the date; a save that touches an unrelated field (target/url/
        # tiers/...) resends the same value and is a no-op here.
        new_since = data['balance_since'] or None
        if new_since != card.balance_since:
            card.balance_since = new_since
    if 'url' in data:
        card.url = data['url'] or None
    if 'linked_account_id' in data:
        card.linked_account_id = data['linked_account_id'] or None
    if 'interest_rate' in data:
        card.interest_rate = float(data['interest_rate']) if data['interest_rate'] not in (None, '') else None
    if 'cashback_type' in data:
        card.cashback_type = data['cashback_type'] or None
    if 'cashback_rate' in data:
        card.cashback_rate = float(data['cashback_rate']) if data['cashback_rate'] not in (None, '') else None
    if 'cashback_monthly_cap' in data:
        card.cashback_monthly_cap = int(data['cashback_monthly_cap']) if data['cashback_monthly_cap'] not in (None, '') else None
    if 'point_reset_day' in data:
        card.point_reset_day = int(data['point_reset_day']) if data['point_reset_day'] not in (None, '') else None
    if 'point_reset_amount' in data:
        card.point_reset_amount = int(data['point_reset_amount']) if data['point_reset_amount'] not in (None, '') else None
    db.session.commit()
    return jsonify({'ok': True})

def _cashback_rule_json(r):
    return {'id': r.id, 'name': r.name, 'keywords': r.keywords, 'rate': r.rate,
            'daily_cap': r.daily_cap, 'daily_count_cap': r.daily_count_cap,
            'monthly_cap': r.monthly_cap, 'monthly_count_cap': r.monthly_count_cap,
            'prev_month_min': r.prev_month_min}

@app.route('/api/cards/<int:card_id>/cashback-rules', methods=['GET', 'POST'])
@login_required
def api_cashback_rules(card_id):
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    if request.method == 'GET':
        rules = CashbackRule.query.filter_by(card_id=card.id).order_by(CashbackRule.position, CashbackRule.id).all()
        return jsonify({'rules': [_cashback_rule_json(r) for r in rules]})
    data = request.json or {}
    if not data.get('name') or not data.get('keywords') or not data.get('rate'):
        return jsonify({'error': 'invalid rule'}), 400
    last_pos = db.session.query(db.func.max(CashbackRule.position)).filter_by(card_id=card.id).scalar() or 0
    rule = CashbackRule(
        card_id=card.id, user_id=uid, name=data['name'], keywords=data['keywords'],
        rate=float(data['rate']),
        daily_cap=int(data['daily_cap']) if data.get('daily_cap') not in (None, '') else None,
        daily_count_cap=int(data['daily_count_cap']) if data.get('daily_count_cap') not in (None, '') else None,
        monthly_cap=int(data['monthly_cap']) if data.get('monthly_cap') not in (None, '') else None,
        monthly_count_cap=int(data['monthly_count_cap']) if data.get('monthly_count_cap') not in (None, '') else None,
        prev_month_min=int(data['prev_month_min']) if data.get('prev_month_min') not in (None, '', 0) else None,
        position=last_pos + 1,
    )
    db.session.add(rule)
    db.session.commit()
    return jsonify({'ok': True, 'id': rule.id})

@app.route('/api/cashback-rules/<int:rule_id>', methods=['PUT', 'DELETE'])
@login_required
def api_cashback_rule(rule_id):
    uid = session['user_id']
    rule = CashbackRule.query.filter_by(id=rule_id, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(rule)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    rule.name = data.get('name', rule.name)
    rule.keywords = data.get('keywords', rule.keywords)
    if 'rate' in data:
        rule.rate = float(data['rate'])
    if 'daily_cap' in data:
        rule.daily_cap = int(data['daily_cap']) if data['daily_cap'] not in (None, '') else None
    if 'daily_count_cap' in data:
        rule.daily_count_cap = int(data['daily_count_cap']) if data['daily_count_cap'] not in (None, '') else None
    if 'monthly_cap' in data:
        rule.monthly_cap = int(data['monthly_cap']) if data['monthly_cap'] not in (None, '') else None
    if 'monthly_count_cap' in data:
        rule.monthly_count_cap = int(data['monthly_count_cap']) if data['monthly_count_cap'] not in (None, '') else None
    if 'prev_month_min' in data:
        rule.prev_month_min = int(data['prev_month_min']) if data['prev_month_min'] not in (None, '', 0) else None
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/cards/<int:card_id>/perf-transactions')
@login_required
def api_card_perf_transactions(card_id):
    # 예산 탭의 "이달 실적" 퍼센트가 어떤 거래들로 계산됐는지 그대로 보여준다 —
    # card_stats의 perf_spent와 같은 조건(이번 달 지출 + 카드 일치 + 실적 제외 아님)으로 걸러야
    # 숫자가 일치한다.
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    current_month = datetime.now(_KST).strftime('%Y-%m')
    all_cats = Category.query.filter_by(user_id=uid).all()
    excl_cats = {c.name for c in all_cats if c.exclude_perf}
    emoji_map = {c.name: c.icon for c in all_cats}
    txs = Transaction.query.filter_by(user_id=uid, card=card.name).all()
    matched = [t for t in txs if t.type == 'expense' and t.date.startswith(current_month) and _is_perf_tx(t, excl_cats)]
    matched.sort(key=lambda t: (t.date, t.time or ''), reverse=True)
    return jsonify({
        'transactions': [{'id': t.id, 'date': t.date, 'time': t.time or '', 'type': t.type, 'category': t.category,
                           'description': t.description or '', 'amount': t.amount, 'card': t.card or '',
                           'exclude_perf': bool(t.exclude_perf), 'exclude_stats': bool(t.exclude_stats),
                           'has_receipt': bool(getattr(t, 'has_receipt', False)), 'cashback': t.cashback or 0}
                          for t in matched],
        'emoji_map': emoji_map,
    })

@app.route('/api/cards/<int:card_id>/point-convert', methods=['POST'])
@login_required
def api_point_convert(card_id):
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    if not card.point_reset_day:
        return jsonify({'error': 'not a point card'}), 400
    # account_balance(초기 잔고)는 사용자가 입력/리셋한 그대로 유지한다 — 전환은
    # account_balance를 전혀 건드리지 않고 point_carryover만 늘린다. "사용 가능한
    # 포인트"는 _point_balance()로 조회할 때마다 다시 계산되므로, 전환해둔 금액은
    # 자동으로 제외되고 account_balance는 언제 봐도 "원래 입력한 금액" 그대로 남는다.
    all_txs = Transaction.query.filter_by(user_id=uid).all()
    usable = _point_balance(card, all_txs)
    data = request.get_json(silent=True) or {}
    amount = data.get('amount')
    amount = usable if amount is None else int(amount)
    if amount <= 0 or amount > usable:
        return jsonify({'error': 'invalid amount'}), 400
    card.point_carryover = (card.point_carryover or 0) + amount
    card.point_converted_cycle = (card.point_converted_cycle or 0) + amount
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/cards/<int:card_id>/point-balance', methods=['PUT'])
@login_required
def api_point_balance(card_id):
    # 전환하기를 잘못 눌렀을 때(금액 실수 등) 사용자가 화면에 보이는 "사용 가능"/
    # "전환" 두 숫자를 직접 원하는 값으로 고칠 수 있게 하는 엔드포인트. account_balance를
    # 직접 받지 않고 두 표시값을 받아서 역산하는 이유는, account_balance 자체는 사용자
    # 입장에서 의미 없는 내부 anchor라 직접 입력하게 하면 또 이상한 값이 되기 쉽다.
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    if not card.point_reset_day:
        return jsonify({'error': 'not a point card'}), 400
    data = request.json or {}
    try:
        usable = int(data.get('usable', 0))
        carryover = int(data.get('carryover', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid amount'}), 400
    if usable < 0 or carryover < 0:
        return jsonify({'error': 'invalid amount'}), 400
    card_txs = Transaction.query.filter_by(user_id=uid, card=card.name).all()
    inc_now = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
    exp_now = sum(_net_amount(tx) for tx in card_txs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
    card.account_balance = usable - inc_now + exp_now + (card.point_converted_cycle or 0)
    card.point_carryover = carryover
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/cards/<int:card_id>/icon', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_card_icon(card_id):
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    path = os.path.join(CARD_ICONS_DIR, f'{uid}_{card_id}.png')

    if request.method == 'GET':
        if not os.path.exists(path):
            abort(404)
        return send_file(path, mimetype='image/png')

    if request.method == 'POST':
        file = request.files.get('icon')
        if not file:
            return jsonify({'error': 'no file'}), 400
        file.seek(0, os.SEEK_END)
        upload_size = file.tell()
        file.seek(0)
        if upload_size > _MAX_IMAGE_UPLOAD_BYTES:
            return jsonify({'error': '이미지 용량이 너무 큽니다. 8MB 이하 파일로 올려주세요.'}), 400
        try:
            if _PIL_OK:
                img = PILImage.open(file)
                if img.width * img.height > _MAX_IMAGE_PIXELS:
                    return jsonify({'error': '이미지 해상도가 너무 큽니다. 더 작은 이미지로 올려주세요.'}), 400
                img.draft('RGBA', (256, 256))  # cheap downscale during decode where the format supports it (e.g. JPEG)
                img = img.convert('RGBA')
                img.thumbnail((256, 256), PILImage.LANCZOS)
                img.save(path, 'PNG', optimize=True)
            else:
                file.save(path)
            card.has_custom_icon = True
            db.session.commit()
            return jsonify({'ok': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    if request.method == 'DELETE':
        if os.path.exists(path):
            os.remove(path)
        card.has_custom_icon = False
        db.session.commit()
        return jsonify({'ok': True})

@app.route('/api/cards/<int:card_id>/repayments', methods=['GET', 'POST'])
@login_required
def api_card_repayments(card_id):
    uid = session['user_id']
    card = Card.query.filter_by(id=card_id, user_id=uid).first_or_404()
    if request.method == 'GET':
        reps = LoanRepayment.query.filter_by(card_id=card_id, user_id=uid).order_by(LoanRepayment.date.desc(), LoanRepayment.id.desc()).all()
        return jsonify([{'id': r.id, 'amount': r.amount, 'date': r.date, 'memo': r.memo or ''} for r in reps])
    data = request.json or {}
    amt = int(data.get('amount', 0))
    if amt <= 0:
        return jsonify({'error': 'invalid amount'}), 400
    tx_id = None
    deduct_card = data.get('deduct_card', '')
    if deduct_card:
        now_time = datetime.now(_KST).strftime('%H:%M')
        tx = Transaction(
            user_id=uid, date=data.get('date', ''), time=now_time,
            type='expense', category='대출 상환',
            description=f'{card.name} 대출 상환',
            amount=amt, card=deduct_card,
            exclude_perf=True, exclude_stats=True,
        )
        db.session.add(tx)
        db.session.flush()
        tx_id = tx.id
    rep = LoanRepayment(card_id=card_id, user_id=uid, amount=amt, date=data.get('date', ''), memo=data.get('memo', ''), transaction_id=tx_id)
    db.session.add(rep)
    db.session.commit()
    return jsonify({'ok': True, 'id': rep.id, 'balance': card.account_balance})

@app.route('/api/cards/repayments/<int:rid>', methods=['DELETE'])
@login_required
def api_delete_repayment(rid):
    uid = session['user_id']
    rep = LoanRepayment.query.filter_by(id=rid, user_id=uid).first_or_404()
    card = Card.query.filter_by(id=rep.card_id, user_id=uid).first_or_404()
    if rep.transaction_id:
        tx = Transaction.query.filter_by(id=rep.transaction_id, user_id=uid).first()
        if tx:
            db.session.delete(tx)
    db.session.delete(rep)
    db.session.commit()
    return jsonify({'ok': True, 'balance': card.account_balance})

@app.route('/api/calendar')
@login_required
def api_calendar():
    uid = session['user_id']
    now = datetime.now()
    month = request.args.get('month', now.strftime('%Y-%m'))
    transactions = Transaction.query.filter_by(user_id=uid).filter(Transaction.date.like(f'{month}%')).all()

    cats = Category.query.filter_by(user_id=uid).order_by(Category.position, Category.id).all()
    emoji_map = {c.name: c.icon for c in cats}
    excl_stat_cats = {c.name for c in cats if c.exclude_stats}

    running_balances = _running_balances_for_user(uid)
    day_totals = defaultdict(lambda: {'expense': 0, 'income': 0})
    day_transactions = defaultdict(list)
    for tx in transactions:
        day_totals[tx.date][tx.type] += tx.amount
        day_transactions[tx.date].append({
            'id': tx.id, 'date': tx.date, 'time': tx.time or '', 'type': tx.type, 'category': tx.category,
            'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or '',
            'exclude_perf': bool(tx.exclude_perf), 'exclude_stats': bool(tx.exclude_stats),
            'cashback': tx.cashback or 0,
            'balance_after': running_balances.get(tx.id),
            'has_receipt': bool(getattr(tx, 'has_receipt', False)),
        })

    return jsonify({
        'day_totals': {k: dict(v) for k, v in day_totals.items()},
        'day_transactions': dict(day_transactions),
        'income_total': sum(tx.amount for tx in transactions if tx.type == 'income' and _is_stats_tx(tx, excl_stat_cats)),
        'expense_total': sum(tx.amount for tx in transactions if tx.type == 'expense' and _is_stats_tx(tx, excl_stat_cats)),
        'emoji_map': emoji_map,
    })

@app.route('/api/stats')
@login_required
def api_stats():
    uid = session['user_id']
    now = datetime.now()
    month = request.args.get('month', now.strftime('%Y-%m'))

    cats = Category.query.filter_by(user_id=uid).order_by(Category.position, Category.id).all()
    emoji_map = {c.name: c.icon for c in cats}
    icon_map = {c.name: c.icon for c in cats}

    expense_txs_all = Transaction.query.filter_by(user_id=uid).filter(
        Transaction.type == 'expense', Transaction.date.like(f'{month}%')).all()
    income_txs_all = Transaction.query.filter_by(user_id=uid).filter(
        Transaction.type == 'income', Transaction.date.like(f'{month}%')).all()
    excl_stat_cats_stats = {c.name for c in cats if c.exclude_stats}
    expense_txs = [tx for tx in expense_txs_all if _is_stats_tx(tx, excl_stat_cats_stats)]
    income_txs = [tx for tx in income_txs_all if _is_stats_tx(tx, excl_stat_cats_stats)]

    def cat_totals(txs):
        totals = defaultdict(int)
        for tx in txs:
            totals[tx.category] += tx.amount
        return sorted([{'name': k, 'amount': v, 'icon': icon_map.get(k, '📦')} for k, v in totals.items()], key=lambda x: x['amount'], reverse=True)

    bar_from_raw = request.args.get('bar_from')
    bar_to_raw = request.args.get('bar_to')
    if bar_from_raw and bar_to_raw:
        bf_y, bf_m = int(bar_from_raw[:4]), int(bar_from_raw[5:])
        bt_y, bt_m = int(bar_to_raw[:4]), int(bar_to_raw[5:])
    else:
        bt_y, bt_m = now.year, now.month
        bf_m = bt_m - 5; bf_y = bt_y
        while bf_m <= 0: bf_m += 12; bf_y -= 1

    bar_months = []
    cy2, cm2 = bf_y, bf_m
    while (cy2, cm2) <= (bt_y, bt_m):
        bar_months.append(f'{cy2}-{cm2:02d}')
        cm2 += 1
        if cm2 > 12: cm2 = 1; cy2 += 1

    monthly = []
    for mo in bar_months:
        e = Transaction.query.filter_by(user_id=uid).filter(
            Transaction.type == 'expense', Transaction.date.like(f'{mo}%')).all()
        inc = Transaction.query.filter_by(user_id=uid).filter(
            Transaction.type == 'income', Transaction.date.like(f'{mo}%')).all()
        monthly.append({
            'month': mo,
            'expense': sum(t.amount for t in e if _is_stats_tx(t, excl_stat_cats_stats)),
            'income': sum(t.amount for t in inc if _is_stats_tx(t, excl_stat_cats_stats)),
        })

    cards = Card.query.filter_by(user_id=uid).all()
    excl_cats_stats = {c.name for c in cats if c.exclude_perf}
    card_monthly_trend = {}
    for card in cards:
        trend = []
        for mo in bar_months:
            mo_txs = Transaction.query.filter_by(user_id=uid).filter(
                Transaction.type == 'expense',
                Transaction.date.like(f'{mo}%'),
                Transaction.card == card.name,
            ).all()
            amt = sum(tx.amount for tx in mo_txs if _is_perf_tx(tx, excl_cats_stats))
            trend.append(amt)
        card_monthly_trend[card.name] = trend

    card_monthly = []
    for card in cards:
        spent = sum(tx.amount for tx in expense_txs
                    if tx.card == card.name and _is_perf_tx(tx, excl_cats_stats))
        if spent > 0:
            card_monthly.append({'name': card.name, 'spent': spent, 'id': card.id, 'has_custom_icon': bool(card.has_custom_icon)})
    card_monthly.sort(key=lambda x: x['spent'], reverse=True)

    # 총 자산 추이 (기간 선택 가능, 최대 6개월)
    import calendar as _cal
    from datetime import date as _date
    all_txs_ever = Transaction.query.filter_by(user_id=uid).all()
    savings_list = [s for s in Savings.query.filter_by(user_id=uid).all() if not getattr(s, 'exclude_stats', False)]

    tf_raw = request.args.get('trend_from')
    tt_raw = request.args.get('trend_to')
    try:
        tt_y, tt_m = map(int, tt_raw.split('-'))
    except Exception:
        tt_y, tt_m = now.year, now.month
    try:
        tf_y, tf_m = map(int, tf_raw.split('-'))
    except Exception:
        tf_y, tf_m = tt_y, tt_m - 5
        while tf_m <= 0: tf_m += 12; tf_y -= 1
    # 최대 6개월 강제
    total_months = (tt_y - tf_y) * 12 + (tt_m - tf_m) + 1
    if total_months > 6:
        tf_m = tt_m - 5; tf_y = tt_y
        while tf_m <= 0: tf_m += 12; tf_y -= 1
    if total_months < 1:
        tf_y, tf_m = tt_y, tt_m

    # 투자 현재 평가액
    all_savings_deposits = SavingsDeposit.query.filter_by(user_id=uid).all()
    extra_deposits_stats = {}
    for dep in all_savings_deposits:
        extra_deposits_stats[dep.savings_id] = extra_deposits_stats.get(dep.savings_id, 0) + dep.amount

    inv_list = [i for i in Investment.query.filter_by(user_id=uid).all() if not getattr(i, 'exclude_stats', False)]
    inv_by_type = {}
    for inv in inv_list:
        price = (inv.current_price if inv.current_price is not None else inv.avg_price) or 0
        fx = (inv.exchange_rate or 1) if inv.itype == '해외주식' else 1
        val = int((inv.quantity or 0) * price * fx)
        inv_by_type[inv.itype] = inv_by_type.get(inv.itype, 0) + val
    inv_total_now = sum(inv_by_type.values())

    # 포트폴리오 구성 (현재 스냅샷) — 현금 카드 제외
    def _is_cash_card(c):
        return '현금' in c.name or '지갑' in c.name
    card_pos = sum(c.account_balance or 0 for c in cards if not _is_cash_card(c) and (c.account_balance or 0) > 0)
    loan_total = sum(
        (c.account_balance or 0)
        + db.session.query(func.coalesce(func.sum(LoanRepayment.amount), 0))
            .filter(
                LoanRepayment.card_id == c.id,
                LoanRepayment.user_id == uid
            )
            .scalar()
        for c in cards
        if not _is_cash_card(c) and (c.account_balance or 0) < 0
    )
    cash_total = sum(c.account_balance or 0 for c in cards if _is_cash_card(c) and (c.account_balance or 0) > 0)
    card_balance_now = card_pos + loan_total  # 순 통장잔고 (대출 차감)
    card_balance_all = sum(c.account_balance or 0 for c in cards)  # 자산 추이용 (현금 포함)
    deposit_total = sum(s.amount for s in savings_list if s.stype == '예금')
    installment_total = sum(_savings_stats(s, extra_deposits_stats.get(s.id, 0))['current_paid'] for s in savings_list if s.stype == '적금')
    subscription_total = sum(_savings_stats(s, extra_deposits_stats.get(s.id, 0))['current_paid'] for s in savings_list if s.stype == '청약')
    total_assets_now = card_balance_now + cash_total + deposit_total + installment_total + subscription_total + inv_total_now

    portfolio_breakdown = []
    if card_pos > 0:
        portfolio_breakdown.append({'label': '통장잔고', 'value': card_pos})
    if cash_total > 0:
        portfolio_breakdown.append({'label': '현금', 'value': cash_total})
    if deposit_total > 0:
        portfolio_breakdown.append({'label': '예금', 'value': deposit_total})
    if installment_total > 0:
        portfolio_breakdown.append({'label': '적금', 'value': installment_total})
    if subscription_total > 0:
        portfolio_breakdown.append({'label': '청약', 'value': subscription_total})
    for k, v in inv_by_type.items():
        if v > 0:
            portfolio_breakdown.append({'label': k, 'value': v})
    if loan_total < 0:
        portfolio_breakdown.append({'label': '대출', 'value': loan_total})

    card_initial = card_balance_all
    asset_trend = []
    cy, cm = tf_y, tf_m
    while (cy, cm) <= (tt_y, tt_m):
        if (cy, cm) == (tt_y, tt_m):
            bd = {'통장잔고': card_pos, '현금': cash_total, '예금': deposit_total, '적금': installment_total, '청약': subscription_total}
            bd.update({k: v for k, v in inv_by_type.items()})
            if loan_total < 0:
                bd['대출'] = loan_total
            trend_total = card_balance_all + deposit_total + installment_total + subscription_total + inv_total_now
            asset_trend.append({'month': f'{cy}-{cm:02d}', 'assets': trend_total, 'breakdown': bd})
        else:
            last_day = _cal.monthrange(cy, cm)[1]
            mo_end = f'{cy}-{cm:02d}-{last_day:02d}'
            inc = sum(tx.amount for tx in all_txs_ever if tx.type == 'income' and tx.date <= mo_end)
            exp = sum(tx.amount for tx in all_txs_ever if tx.type == 'expense' and tx.date <= mo_end)
            card_bal = card_initial + inc - exp
            dep_bal = 0
            inst_bal = 0
            sub_bal = 0
            mo_end_date = _date(cy, cm, last_day)
            for s in savings_list:
                if s.start_date > mo_end: continue
                start = datetime.strptime(s.start_date, '%Y-%m-%d').date()
                if s.stype == '청약':
                    me = max(0, (mo_end_date.year - start.year) * 12 + (mo_end_date.month - start.month))
                    extra_dep_mo = sum(d.amount for d in all_savings_deposits if d.savings_id == s.id and d.date <= mo_end)
                    sub_bal += s.amount * me + extra_dep_mo
                elif s.stype == '예금':
                    dep_bal += s.amount
                else:
                    end_d = datetime.strptime(s.end_date, '%Y-%m-%d').date()
                    mt = max(1, (end_d.year - start.year) * 12 + (end_d.month - start.month))
                    me = max(0, min(mt, (mo_end_date.year - start.year) * 12 + (mo_end_date.month - start.month)))
                    inst_bal += s.amount * me
            bd = {'통장잔고': card_bal, '예금': dep_bal, '적금': inst_bal, '청약': sub_bal}
            bd.update({k: v for k, v in inv_by_type.items()})
            asset_trend.append({'month': f'{cy}-{cm:02d}', 'assets': card_bal + dep_bal + inst_bal + sub_bal + inv_total_now, 'breakdown': bd})
        cm += 1
        if cm > 12: cm = 1; cy += 1

    first_tx = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.asc()).first()
    first_month = first_tx.date[:7] if first_tx else month

    # 전월 카테고리 비교
    prev_m = month
    py, pm = int(month[:4]), int(month[5:])
    pm -= 1
    if pm <= 0: pm = 12; py -= 1
    prev_m = f'{py}-{pm:02d}'
    prev_expense_txs = [tx for tx in Transaction.query.filter_by(user_id=uid).filter(
        Transaction.type == 'expense', Transaction.date.like(f'{prev_m}%')).all()
        if _is_stats_tx(tx, excl_stat_cats_stats)]
    prev_cat_totals = defaultdict(int)
    for tx in prev_expense_txs:
        prev_cat_totals[tx.category] += tx.amount
    cur_cat_totals = {item['name']: item['amount'] for item in cat_totals(expense_txs)}
    all_cats_cmp = set(list(cur_cat_totals.keys()) + list(prev_cat_totals.keys()))
    category_compare = sorted([{
        'name': c, 'icon': icon_map.get(c, '📦'),
        'current': cur_cat_totals.get(c, 0),
        'previous': prev_cat_totals.get(c, 0),
        'diff': cur_cat_totals.get(c, 0) - prev_cat_totals.get(c, 0),
    } for c in all_cats_cmp], key=lambda x: abs(x['diff']), reverse=True)

    return jsonify({
        'expense_cats': cat_totals(expense_txs),
        'income_cats': cat_totals(income_txs),
        'monthly': monthly,
        'emoji_map': emoji_map,
        'card_list': [c.name for c in cards],
        'card_monthly_trend': card_monthly_trend,
        'card_monthly': card_monthly,
        'asset_trend': asset_trend,
        'portfolio_breakdown': portfolio_breakdown,
        'total_assets': total_assets_now,
        'first_month': first_month,
        'category_compare': category_compare,
        'prev_month': prev_m,
    })

@app.route('/api/portfolio-pdf')
@login_required
def api_portfolio_pdf():
    import math as _math
    import calendar as _cal
    from datetime import date as _date
    uid = session['user_id']
    user_obj = User.query.get(uid)
    today = _date.today()
    current_month = today.strftime('%Y-%m')
    date_str = today.strftime('%Y년 %m월 %d일')
    name_display = user_obj.nickname or user_obj.email

    all_txs = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.desc()).all()
    month_txs = [tx for tx in all_txs if tx.date.startswith(current_month)]
    income_mo = sum(tx.amount for tx in month_txs if tx.type == 'income')
    expense_mo = sum(tx.amount for tx in month_txs if tx.type == 'expense')

    cards = Card.query.filter_by(user_id=uid).all()
    savings_list = Savings.query.filter_by(user_id=uid).all()
    inv_list = Investment.query.filter_by(user_id=uid).all()

    excl_cats_report = {c.name for c in Category.query.filter_by(user_id=uid, exclude_perf=True).all()}
    excl_stat_cats_report = {c.name for c in Category.query.filter_by(user_id=uid, exclude_stats=True).all()}
    loan_repayments_pdf = {}

    for r in LoanRepayment.query.filter_by(user_id=uid).all():

        if r.date.startswith(current_month):

            loan_repayments_pdf[r.card_id] = loan_repayments_pdf.get(r.card_id, 0) + r.amount    
            
    card_stats = []
    for card in cards:
        card_txs = [tx for tx in all_txs if tx.card == card.name]
        c_inc = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
        c_exp = sum(_net_amount(tx) for tx in card_txs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
        initial = card.account_balance or 0
        balance = initial + c_inc - c_exp
        spent = sum(tx.amount for tx in card_txs
                    if tx.type == 'expense' and tx.date.startswith(current_month)
                    and _is_perf_tx(tx, excl_cats_report) and _is_stats_tx(tx, excl_stat_cats_report))
        percent = min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        card_stats.append({'name': card.name, 'initial_balance': initial, 'balance': balance,
                           'spent': spent, 'target': card.monthly_target, 'percent': percent,
                           'interest_rate': card.interest_rate,
                           'total_repaid': loan_repayments_pdf.get(card.id, 0)})

    extra_deposits_pdf = {}
    for dep in SavingsDeposit.query.filter_by(user_id=uid).all():
        extra_deposits_pdf[dep.savings_id] = extra_deposits_pdf.get(dep.savings_id, 0) + dep.amount
    sav_stats = [_savings_stats(s, extra_deposits_pdf.get(s.id, 0)) for s in savings_list]
    investments = [_investment_stats(i) for i in inv_list]
    # 통계 제외 항목은 목록에는 그대로 남기고, 합계·순자산 계산에서만 뺀다
    sav_stats_ct = [s for s in sav_stats if not s.get('exclude_stats')]
    investments_ct = [i for i in investments if not i.get('exclude_stats')]
    inv_total = sum(i['current_value'] for i in investments_ct)
    inv_gain_total = sum(i['profit'] for i in investments_ct)
    inv_cost_total = sum(i['purchase_value'] for i in investments_ct)
    inv_return_rate = round(inv_gain_total / inv_cost_total * 100, 2) if inv_cost_total else 0
    loan_bal_pdf = sum((c.account_balance or 0) for c in cards if (c.account_balance or 0) < 0)
    net_worth = loan_bal_pdf + sum(s['current_paid'] for s in sav_stats_ct) + inv_total

    deposit_total = sum(s['amount'] for s in sav_stats_ct if s['stype'] == '예금')
    install_total = sum(s['current_paid'] for s in sav_stats_ct if s['stype'] == '적금')
    sub_total_pdf = sum(s['current_paid'] for s in sav_stats_ct if s['stype'] == '청약')
    portfolio = []
    if deposit_total > 0: portfolio.append(('예금', deposit_total))
    if install_total > 0: portfolio.append(('적금', install_total))
    if sub_total_pdf > 0: portfolio.append(('청약', sub_total_pdf))
    inv_by_type = {}
    for inv in investments_ct:
        inv_by_type[inv['itype']] = inv_by_type.get(inv['itype'], 0) + inv['current_value']
    for k, v in inv_by_type.items():
        if v > 0: portfolio.append((k, v))
    if loan_bal_pdf < 0: portfolio.append(('대출', loan_bal_pdf))
    total_assets = sum(v for _, v in portfolio)

    tt_y, tt_m = today.year, today.month
    tf_m = tt_m - 5; tf_y = tt_y
    while tf_m <= 0: tf_m += 12; tf_y -= 1
    card_initial = sum(c.account_balance or 0 for c in cards)
    asset_trend = []
    cy, cm_i = tf_y, tf_m
    while (cy, cm_i) <= (tt_y, tt_m):
        last_day = _cal.monthrange(cy, cm_i)[1]
        mo_end = f'{cy}-{cm_i:02d}-{last_day:02d}'
        inc = sum(tx.amount for tx in all_txs if tx.type == 'income' and tx.date <= mo_end)
        exp = sum(tx.amount for tx in all_txs if tx.type == 'expense' and tx.date <= mo_end)
        card_bal = card_initial + inc - exp
        sav_bal = 0
        mo_end_date = _date(cy, cm_i, last_day)
        for s in savings_list:
            if getattr(s, 'exclude_stats', False): continue
            if s.start_date > mo_end: continue
            start_d = datetime.strptime(s.start_date, '%Y-%m-%d').date()
            if s.stype == '청약':
                me = max(0, (mo_end_date.year - start_d.year) * 12 + (mo_end_date.month - start_d.month))
                sav_bal += s.amount * me
            elif s.stype == '예금':
                sav_bal += s.amount
            else:
                end_d = datetime.strptime(s.end_date, '%Y-%m-%d').date()
                mt = max(1, (end_d.year - start_d.year) * 12 + (end_d.month - start_d.month))
                me = max(0, min(mt, (mo_end_date.year - start_d.year) * 12 + (mo_end_date.month - start_d.month)))
                sav_bal += s.amount * me
        asset_trend.append({'month': f'{cy}-{cm_i:02d}', 'assets': card_bal + sav_bal})
        cm_i += 1
        if cm_i > 12: cm_i = 1; cy += 1

    def fmt(n): return f"{int(n):,}"
    def fmt_short(n):
        n = int(n)
        if abs(n) >= 100000000: return f"{n/100000000:.1f}억원"
        if abs(n) >= 10000: return f"{n/10000:.0f}만원"
        return f"{n:,}원"

    COLORS = ['#b088f9', '#7baff0', '#4BC0C0', '#FF6384', '#FF9F40', '#FFCE56', '#9966FF']

    def make_donut(items, clrs, size=180):
        if not items: return ''
        total = sum(v for _, v in items)
        if not total: return ''
        cx = cy2 = size / 2
        r = size / 2 - 14
        ir = r * 0.58
        angle = -_math.pi / 2
        paths = []
        for i, (label, value) in enumerate(items):
            sweep = min(value / total * 2 * _math.pi, 2 * _math.pi - 0.001)
            x1 = cx + r * _math.cos(angle); y1 = cy2 + r * _math.sin(angle)
            x2 = cx + r * _math.cos(angle + sweep); y2 = cy2 + r * _math.sin(angle + sweep)
            x3 = cx + ir * _math.cos(angle + sweep); y3 = cy2 + ir * _math.sin(angle + sweep)
            x4 = cx + ir * _math.cos(angle); y4 = cy2 + ir * _math.sin(angle)
            la = 1 if sweep > _math.pi else 0
            c = clrs[i % len(clrs)]
            d = f"M{x1:.1f},{y1:.1f} A{r:.1f},{r:.1f} 0 {la},1 {x2:.1f},{y2:.1f} L{x3:.1f},{y3:.1f} A{ir:.1f},{ir:.1f} 0 {la},0 {x4:.1f},{y4:.1f}Z"
            paths.append(f'<path d="{d}" fill="{c}" stroke="#fff" stroke-width="2"/>')
            angle += sweep
        lbl = fmt_short(total)
        center = (f'<text x="{cx:.0f}" y="{cy2-7:.0f}" text-anchor="middle" font-size="13" font-weight="bold" fill="#333">{lbl}</text>'
                  f'<text x="{cx:.0f}" y="{cy2+11:.0f}" text-anchor="middle" font-size="10" fill="#888">총 자산</text>')
        return f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">{"".join(paths)}{center}</svg>'

    donut_svg = make_donut(portfolio, COLORS)
    legend_html = ''
    for i, (label, value) in enumerate(portfolio):
        pct = value / total_assets * 100 if total_assets else 0
        color = COLORS[i % len(COLORS)]
        legend_html += (
            '<div style="margin-bottom:10px">'
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
            f'<svg width="12" height="12" style="flex-shrink:0;vertical-align:middle"><rect width="12" height="12" rx="3" fill="{color}"/></svg>'
            f'<span style="flex:1;font-size:12px">{label}</span>'
            f'<span style="font-size:12px;font-weight:700">{fmt(value)}원</span>'
            f'<span style="font-size:11px;color:#aaa;width:38px;text-align:right">{pct:.1f}%</span>'
            '</div>'
            f'<svg width="100%" height="8" style="display:block;border-radius:4px;overflow:hidden">'
            f'<rect width="100%" height="8" rx="4" fill="#f0f0f0"/>'
            f'<rect width="{pct:.1f}%" height="8" rx="4" fill="{color}"/>'
            '</svg>'
            '</div>'
        )

    PDF_BANK_LOGOS = [
        ('신한', '/static/cards/sinhanbank.png'), ('KB', '/static/cards/kbbank.png'),
        ('국민', '/static/cards/kbbank.png'), ('농협', '/static/cards/nhbank.png'),
        ('NH', '/static/cards/nhbank.png'), ('하나', '/static/cards/hanabank.png'),
        ('우리', '/static/cards/wooribank.png'), ('기업', '/static/cards/ibkbank.png'),
        ('IBK', '/static/cards/ibkbank.png'), ('카카오', '/static/cards/kakaobank.png'),
        ('토스', '/static/cards/tossbank.png'), ('케이뱅크', '/static/cards/kbank.png'),
        ('K뱅크', '/static/cards/kbank.png'), ('SC', '/static/cards/scbank.png'),
        ('제일', '/static/cards/scbank.png'), ('씨티', '/static/cards/citibank.png'),
        ('iM', '/static/cards/imbank.png'), ('IM', '/static/cards/imbank.png'),
        ('수협', '/static/cards/suhyupbank.png'), ('KDB', '/static/cards/kdbbank.png'),
        ('산업', '/static/cards/kdbbank.png'), ('BNK', '/static/cards/bnkbank.png'),
        ('부산', '/static/cards/bnkbank.png'), ('우체국', '/static/cards/epostbank.png'),
        ('SBI', '/static/cards/sbibank.png'), ('신협', '/static/cards/cubank.png'),
    ]
    def bank_logo_tag(name, size=32):
        if not name: return ''
        for k, url in PDF_BANK_LOGOS:
            if k in name:
                return (f'<img src="{url}" style="width:{size}px;height:{size}px;'
                        f'object-fit:contain;border-radius:8px" '
                        f'onerror="this.style.display=\'none\'" />')
        return ''

    def dday(end_str):
        if not end_str:
            return '—'
        try:
            diff = (_date(*map(int, end_str.split('-'))) - today).days
        except Exception:
            return '—'
        if diff < 0: return f'D+{abs(diff)}'
        if diff == 0: return 'D-Day'
        return f'D-{diff}'

    def card_panel(c):
        tgt = c['target']
        target_html = ''
        if tgt:
            pct_cap = min(c['percent'], 100)
            target_html = (
                '<div class="ig">'
                f'<div class="ic"><div class="l">월 예산</div><div class="v">{fmt(tgt)}원</div></div>'
                f'<div class="ic"><div class="l">이달 실적</div><div class="v">{fmt(c["spent"])}원</div></div>'
                f'<div class="ic"><div class="l">달성률</div><div class="v" style="color:#b088f9">{c["percent"]}%</div></div>'
                '</div>'
                '<div style="margin-top:4px">'
                f'<div class="pb"><div class="pf" style="width:{pct_cap}%;background:linear-gradient(90deg,#b088f9,#7baff0)"></div></div>'
                f'<div class="pl"><span>0원</span><span>{fmt(tgt)}원</span></div>'
                '</div>'
            )
        logo = bank_logo_tag(c['name'])
        return (
            '<div class="cp">'
            f'<div class="cn2" style="display:flex;align-items:center;gap:10px">{logo}<span>{c["name"]}</span></div>'
            '<div class="ig">'
            f'<div class="ic"><div class="l">초기 잔고</div><div class="v">{fmt(c["initial_balance"])}원</div></div>'
            f'<div class="ic"><div class="l">이달 지출</div><div class="v ce">{fmt(c["spent"])}원</div></div>'
            f'<div class="ic"><div class="l">현재 잔고</div><div class="v">{fmt(c["balance"])}원</div></div>'
            '</div>' + target_html + '</div>'
        )

    def loan_panel(c):
        logo = bank_logo_tag(c['name'])
        rate = c.get('interest_rate')
        rate_html = f'<div class="ic"><div class="l">연 이자율</div><div class="v">{rate}%</div></div>' if rate else ''
        repaid = c.get('total_repaid', 0)
        tgt = c.get('target', 0)
        tgt_html = f'<div class="ic"><div class="l">월 상환 목표</div><div class="v">{fmt(tgt)}원</div></div>' if tgt else ''
        return (
            '<div class="cp">'
            f'<div class="cn2" style="display:flex;align-items:center;gap:10px">{logo}<span style="color:#dc3545">{c["name"]}</span></div>'
            '<div class="ig">'
            f'<div class="ic"><div class="l">대출 잔액</div><div class="v ce">-{fmt(abs(c["balance"]))}원</div></div>'
            f'<div class="ic"><div class="l">상환 금액</div><div class="v ci">{fmt(repaid)}원</div></div>'
            + tgt_html + rate_html +
            '</div></div>'
        )

    def sav_panel(s):
        amt_label = '예치금액' if s['stype'] == '예금' else '월 납입액'
        badge_cls = 'by' if s['stype'] == '예금' else 'bj'
        sav_logo = bank_logo_tag(s['bank'] or '', size=28)
        return (
            '<div class="sp"><div class="sh">'
            f'<div class="sn" style="display:flex;align-items:center;gap:8px">{sav_logo}<span>{s["bank"] or ""}</span>&nbsp;<span class="badge {badge_cls}">{s["stype"]}</span></div>'
            f'<div class="dd">{dday(s["end_date"])}</div></div>'
            '<div class="sg2">'
            f'<div class="ic"><div class="l">{amt_label}</div><div class="v">{fmt(s["amount"])}원</div></div>'
            f'<div class="ic"><div class="l">연 이율</div><div class="v">{s["interest_rate"]}%</div></div>'
            f'<div class="ic"><div class="l">기간</div><div class="v">{s["months_total"]}개월</div></div>'
            '</div><div class="sg2">'
            f'<div class="ic"><div class="l">예상 이자</div><div class="v ci">+{fmt(s["interest"])}원</div></div>'
            f'<div class="ic"><div class="l">만기 수령</div><div class="v ci">{fmt(s["maturity_amount"])}원</div></div>'
            f'<div class="ic"><div class="l">만기일</div><div class="v">{s["end_date"]}</div></div>'
            '</div><div style="margin-top:4px">'
            f'<div class="pb"><div class="pf" style="width:{s["progress"]}%;background:linear-gradient(90deg,#b088f9,#7baff0)"></div></div>'
            f'<div class="pl"><span>{s["start_date"]}</span><span>{s["end_date"]}</span></div>'
            '</div></div>'
        )

    # 자산 추이 테이블
    trend_rows = ''
    for i, t in enumerate(asset_trend):
        prev_assets = asset_trend[i-1]['assets'] if i > 0 else None
        chg = t['assets'] - prev_assets if prev_assets is not None else None
        chg_html = ''
        if chg is not None:
            sign = '+' if chg >= 0 else ''
            col = '#198754' if chg >= 0 else '#dc3545'
            arr = '▲' if chg >= 0 else '▼'
            col = '#dc3545' if chg >= 0 else '#0d6efd'
            if prev_assets:
                pct_str = f' ({sign}{chg / prev_assets * 100:.1f}%)'
            elif chg == 0:
                pct_str = ' (+0.0%)'
            else:
                pct_str = ' (신규)'
            chg_html = f'<span style="color:{col};font-size:11px">{arr} {sign}{fmt(chg)}원{pct_str}</span>'
        trend_rows += f'<tr><td style="font-weight:600">{int(t["month"][5:])}월 ({t["month"]})</td><td style="text-align:right;font-weight:700">{fmt(t["assets"])}원</td><td style="text-align:right">{chg_html}</td></tr>'

    # 자산 추이 점선 SVG 라인 차트
    if asset_trend:
        n = len(asset_trend)
        min_val = min(t['assets'] for t in asset_trend)
        max_val = max(t['assets'] for t in asset_trend) or 1
        val_range = max_val - min_val or 1
        W, H, PX, PY = 500, 80, 28, 10
        cw, ch = W - PX * 2, H - PY * 2
        pts = []
        for i, t in enumerate(asset_trend):
            x = PX + (i / (n - 1) * cw if n > 1 else cw / 2)
            y = PY + ch - ((t['assets'] - min_val) / val_range * ch)
            pts.append((x, y, t))
        path_d = ' '.join(f'{"M" if i == 0 else "L"}{x:.1f},{y:.1f}' for i, (x, y, _) in enumerate(pts))
        circles = ''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#b088f9" stroke="white" stroke-width="2"/>' for x, y, _ in pts)
        labels = ''.join(f'<text x="{x:.1f}" y="{H + 14}" text-anchor="middle" font-size="9" fill="#888">{int(t["month"][5:])}월</text>' for x, _, t in pts)
        bar_chart = f'<svg width="100%" viewBox="0 0 {W} {H + 20}" style="margin:10px 0"><path d="{path_d}" fill="none" stroke="#b088f9" stroke-width="2" stroke-dasharray="5,4"/>{circles}{labels}</svg>'
    else:
        bar_chart = ''

    _normal_cards = [c for c in card_stats if c['initial_balance'] >= 0]
    _loan_cards   = [c for c in card_stats if c['initial_balance'] < 0]
    if not card_stats:
        cards_html = '<div class="empty">등록된 카드/계좌가 없습니다</div>'
    else:
        cards_html = ''.join(card_panel(c) for c in _normal_cards)
        if _loan_cards:
            cards_html += (
                '<div style="margin:24px 0 12px;display:flex;align-items:center;gap:10px">'
                '<span style="font-size:0.82rem;font-weight:700;color:#dc3545;white-space:nowrap">💸 대출</span>'
                '<div style="flex:1;height:2px;background:#fde8e8;border-radius:1px"></div>'
                '</div>'
                + ''.join(loan_panel(c) for c in _loan_cards)
            )
    savings_html = ''.join(sav_panel(s) for s in sav_stats) if sav_stats else '<div class="empty">등록된 예적금이 없습니다</div>'

    sav_summary_html = ''
    if sav_stats:
        sav_summary_html = (
            '<div class="sg" style="margin-top:12px">'
            f'<div class="sc"><div class="l">총 예치금</div><div class="v cn">{fmt(sum(s["amount"] for s in sav_stats))}원</div></div>'
            f'<div class="sc"><div class="l">총 예상 이자</div><div class="v ci">+{fmt(sum(s["interest"] for s in sav_stats))}원</div></div>'
            f'<div class="sc"><div class="l">총 만기 수령</div><div class="v ci">{fmt(sum(s["maturity_amount"] for s in sav_stats))}원</div></div>'
            f'<div class="sc"><div class="l">상품 수</div><div class="v cn">{len(sav_stats)}개</div></div>'
            '</div>'
        )

    def inv_row(i):
        gain = i['profit']
        gc = '#dc3545' if gain >= 0 else '#0d6efd'
        gs = '+' if gain >= 0 else ''
        gp = i['profit_pct']
        ticker_str = f' ({i["ticker"]})' if i['ticker'] else ''
        fx = i.get('exchange_rate') or None
        is_usd = i['itype'] == '해외주식' and fx
        avg_krw = int(i['avg_price'] * fx) if is_usd else i['avg_price']
        cur_krw = int(i['current_price'] * fx) if is_usd else i['current_price']
        usd_note = lambda p: f'<br><span style="font-size:10px;color:#aaa">${p:.2f}</span>' if is_usd else ''
        qty_unit = '개' if i['itype'] == '코인' else '주'
        return (
            '<tr>'
            f'<td><span class="badge bj">{i["itype"]}</span></td>'
            f'<td>{i["name"]}{ticker_str}</td>'
            f'<td style="text-align:right">{i["quantity"]:g}{qty_unit}</td>'
            f'<td style="text-align:right">{fmt(avg_krw)}원{usd_note(i["avg_price"])}</td>'
            f'<td style="text-align:right">{fmt(cur_krw)}원{usd_note(i["current_price"])}</td>'
            f'<td style="text-align:right;font-weight:700">{fmt(i["current_value"])}원</td>'
            f'<td style="text-align:right;color:{gc}">{gs}{fmt(gain)}원<br><span style="font-size:11px">({gs}{gp:.1f}%)</span></td>'
            '</tr>'
        )

    inv_gc = '#dc3545' if inv_gain_total >= 0 else '#0d6efd'
    inv_gs = '+' if inv_gain_total >= 0 else ''
    inv_rc = '#dc3545' if inv_return_rate >= 0 else '#0d6efd'
    inv_rs = '+' if inv_return_rate >= 0 else ''
    if investments:
        inv_html = (
            '<table><thead><tr><th>유형</th><th>종목</th><th style="text-align:right">수량</th>'
            '<th style="text-align:right">평균단가</th><th style="text-align:right">현재가</th>'
            '<th style="text-align:right">평가금액</th><th style="text-align:right">손익</th></tr></thead>'
            '<tbody>' + ''.join(inv_row(i) for i in investments) + '</tbody></table>'
            '<div class="sg" style="margin-top:12px">'
            f'<div class="sc"><div class="l">총 평가금액</div><div class="v cn">{fmt(inv_total)}원</div></div>'
            f'<div class="sc"><div class="l">총 손익</div><div class="v" style="color:{inv_gc}">{inv_gs}{fmt(inv_gain_total)}원</div></div>'
            f'<div class="sc"><div class="l">수익률</div><div class="v" style="color:{inv_rc}">{inv_rs}{inv_return_rate:.1f}%</div></div>'
            f'<div class="sc"><div class="l">종목 수</div><div class="v cn">{len(investments)}개</div></div>'
            '</div>'
        )
    else:
        inv_html = '<div class="empty">등록된 투자 종목이 없습니다</div>'

    def tx_row(tx):
        color = '#198754' if tx.type == 'income' else '#dc3545'
        sign = '+' if tx.type == 'income' else '-'
        badge_cls = 'bi' if tx.type == 'income' else 'be'
        label = '수입' if tx.type == 'income' else '지출'
        return (
            '<tr>'
            f'<td>{tx.date}</td>'
            f'<td><span class="badge {badge_cls}">{label}</span></td>'
            f'<td>{tx.category or "—"}</td>'
            f'<td>{tx.description or "—"}</td>'
            f'<td>{tx.card or "—"}</td>'
            f'<td style="text-align:right;font-weight:600;color:{color}">{sign}{fmt(tx.amount)}원</td>'
            '</tr>'
        )

    display_txs = all_txs[:50]
    txs_html = (
        '<table><thead><tr><th>날짜</th><th>유형</th><th>카테고리</th><th>설명</th><th>카드/계좌</th>'
        '<th style="text-align:right">금액</th></tr></thead>'
        '<tbody>' + ''.join(tx_row(tx) for tx in display_txs) + '</tbody></table>'
    ) if display_txs else '<div class="empty">거래 내역이 없습니다</div>'

    css = """*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;color:#222;background:#fff;padding:40px;font-size:13px;line-height:1.5}
.hdr{margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #b088f9}
.hdr h1{font-size:22px;font-weight:700;color:#b088f9;margin-bottom:4px}
.hdr .meta{font-size:11px;color:#888}
h2{font-size:14px;font-weight:700;color:#7c4fbf;background:#f0eaff;padding:12px 20px;margin:0;border-bottom:1.5px solid #e0d0fd}
.sec{margin-bottom:20px;border:1.5px solid #e0d0fd;border-radius:14px;overflow:hidden}
.si{padding:20px}
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px}
.sc{border:1px solid #e8e8e8;border-radius:10px;padding:14px 12px;text-align:center}
.sc .l{font-size:10px;color:#555;margin-bottom:5px}
.sc .v{font-size:15px;font-weight:700}
.ci{color:#198754}.ce{color:#dc3545}.cb{color:#b088f9}.cn{color:#333}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
thead th{background:#f8f5ff;color:#555;font-weight:700;padding:8px 10px;text-align:left;border-bottom:2px solid #e8d5ff}
tbody td{padding:8px 10px;border-bottom:1px solid #f5f5f5;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.be{background:#ffe0e0;color:#dc3545}.bi{background:#d4edda;color:#198754}
.by{background:#f0e8fd;color:#b088f9}.bj{background:#f0e8fd;color:#b088f9}
.cp{border:1px solid #e8e8e8;border-radius:12px;padding:16px;margin-bottom:10px}
.cn2{font-size:14px;font-weight:700;margin-bottom:10px}
.ig{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#eee;border-radius:8px;overflow:hidden;margin-bottom:12px}
.ic{background:white;padding:8px 10px;text-align:center}
.ic .l{font-size:10px;color:#555;margin-bottom:3px}
.ic .v{font-size:12px;font-weight:600}
.pb{background:#f0f0f0;border-radius:6px;height:8px;overflow:hidden}
.pf{height:8px;border-radius:6px}
.pl{display:flex;justify-content:space-between;font-size:10px;color:#aaa;margin-top:3px}
.sp{border:1px solid #e8e8e8;border-radius:12px;padding:16px;margin-bottom:10px}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.sn{font-size:14px;font-weight:700}
.dd{font-size:12px;font-weight:700;color:#b088f9}
.sg2{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#eee;border-radius:8px;overflow:hidden;margin-bottom:10px}
.empty{color:#aaa;text-align:center;padding:16px;font-size:12px}
.footer{margin-top:40px;font-size:10px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:16px}
.pdfbtn{position:fixed;top:16px;right:16px;z-index:9999;background:linear-gradient(135deg,#b088f9,#7baff0);color:white;border:none;border-radius:14px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(176,136,249,0.4)}
@media print{body{padding:20px}.pdfbtn{display:none}}
@media(max-width:600px){body{padding:16px}.sg{grid-template-columns:repeat(2,1fr)}table{font-size:11px}thead th,tbody td{padding:6px 6px}}"""

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>포트폴리오 — {name_display}</title>
<style>{css}</style>
</head>
<body>
<button class="pdfbtn" onclick="window.print()">⬇ PDF 저장</button>
<div class="hdr">
  <h1>재무 포트폴리오</h1>
  <div class="meta">계정: {name_display} &nbsp;|&nbsp; 출력일: {date_str}</div>
</div>

<div class="sec">
  <h2>순자산 요약</h2>
  <div class="si"><div class="sg">
    <div class="sc"><div class="l">순자산</div><div class="v cn">{fmt(net_worth)}원</div></div>
    <div class="sc"><div class="l">이달 수입</div><div class="v ci">{fmt(income_mo)}원</div></div>
    <div class="sc"><div class="l">이달 지출</div><div class="v ce">{fmt(expense_mo)}원</div></div>
    <div class="sc"><div class="l">이달 잔액</div><div class="v cb">{fmt(income_mo - expense_mo)}원</div></div>
  </div></div>
</div>

<div class="sec">
  <h2>자산 구성</h2>
  <div class="si">
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px">
      {donut_svg}
      <div style="width:100%">{legend_html}</div>
    </div>
  </div>
</div>

<div class="sec">
  <h2>총 자산 추이 (최근 6개월)</h2>
  <div class="si">
    {bar_chart}
    <table>
      <thead><tr><th>월</th><th style="text-align:right">총 자산</th><th style="text-align:right">전월 대비</th></tr></thead>
      <tbody>{trend_rows}</tbody>
    </table>
  </div>
</div>

<div class="sec">
  <h2>카드 / 계좌 ({len(card_stats)}개)</h2>
  <div class="si">{cards_html}</div>
</div>

<div class="sec">
  <h2>예적금 ({len(sav_stats)}개)</h2>
  <div class="si">{savings_html}{sav_summary_html}</div>
</div>

<div class="sec">
  <h2>투자 ({len(investments)}개 종목)</h2>
  <div class="si">{inv_html}</div>
</div>

<div class="sec">
  <h2>거래 내역 (최근 {len(display_txs)}건 / 전체 {len(all_txs)}건)</h2>
  <div class="si">{txs_html}</div>
</div>

<div class="footer">생성: 나의 가계부 앱 &nbsp;|&nbsp; {name_display} &nbsp;|&nbsp; {date_str}</div>
<script>window.onload = function() {{ window.print(); }}</script>
</body>
</html>"""
    return html, 200, {'Content-Type': 'text/html; charset=utf-8'}

@app.route('/api/budget', methods=['GET', 'POST'])
@login_required
def api_budget():
    uid = session['user_id']
    current_month = datetime.now(_KST).strftime('%Y-%m')
    if request.method == 'POST':
        data = request.json or {}
        amount = int(data.get('amount', 0))
        existing = Budget.query.filter_by(month=current_month, user_id=uid).first()
        if existing:
            existing.amount = amount
        else:
            db.session.add(Budget(month=current_month, amount=amount, user_id=uid))
        db.session.commit()
        return jsonify({'ok': True})
    budget_amount = _effective_budget_amount(uid, current_month)
    all_txs = Transaction.query.filter_by(user_id=uid).all()
    all_cats_budget = Category.query.filter_by(user_id=uid).all()
    excl_cats_budget = {c.name for c in all_cats_budget if c.exclude_perf}
    excl_stat_cats_budget = {c.name for c in all_cats_budget if c.exclude_stats}
    expense_total = sum(tx.amount for tx in all_txs
                        if tx.type == 'expense' and tx.date.startswith(current_month)
                        and _is_stats_tx(tx, excl_stat_cats_budget))

    cards = Card.query.filter_by(user_id=uid).order_by(Card.position, Card.id).all()
    card_by_id = {c.id: c for c in cards}
    # linked_names[account_id] = [card_name, ...]
    linked_names = {}
    for c in cards:
        if c.linked_account_id:
            linked_names.setdefault(c.linked_account_id, []).append(c.name)

    loan_repayments_all = {}
    for r in LoanRepayment.query.filter_by(user_id=uid).all():
        loan_repayments_all[r.card_id] = loan_repayments_all.get(r.card_id, 0) + r.amount

    cashback_rule_counts = {}
    for r in CashbackRule.query.filter_by(user_id=uid).all():
        cashback_rule_counts[r.card_id] = cashback_rule_counts.get(r.card_id, 0) + 1

    card_stats = []
    for card in cards:
        initial_balance = card.account_balance or 0
        # 포인트 카드는 account_balance가 (복구용 역산 등으로) 음수가 되더라도 "대출"로
        # 취급하면 안 된다 — 완전히 다른 화면/공식(all_repaid 등)으로 빠져버린다.
        is_loan = initial_balance < 0 and not card.point_reset_day
        linked_account_id = card.linked_account_id
        if is_loan:
            all_repaid = loan_repayments_all.get(card.id, 0)
            card_stats.append({
                'id': card.id, 'name': card.name,
                'initial_balance': initial_balance, 'total_income': 0,
                'total_expense': 0, 'balance': initial_balance + all_repaid,
                'spent': 0, 'target': card.monthly_target or 0, 'percent': 0,
                'tier1': card.tier1 or 20, 'tier2': card.tier2 or 50, 'tier3': card.tier3 or 80,
                'url': card.url or '', 'is_loan': True, 'linked_account_id': linked_account_id,
                'total_repaid': all_repaid, 'has_custom_icon': bool(card.has_custom_icon),
            })
        else:
            card_txs = [tx for tx in all_txs if tx.card == card.name]
            all_income = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
            all_expense = sum(_net_amount(tx) for tx in card_txs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
            display_income = sum(tx.amount for tx in card_txs if tx.type == 'income' and tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_budget))
            display_expense = sum(tx.amount for tx in card_txs if tx.type == 'expense' and tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_budget))
            display_cashback = sum(tx.cashback or 0 for tx in card_txs if tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_budget))
            perf_spent = sum(_net_amount(tx) for tx in card_txs
                             if tx.type == 'expense' and tx.date.startswith(current_month)
                             and _is_perf_tx(tx, excl_cats_budget))
            # account card: balance includes all linked cards' transactions (전체 누적, 월별로 초기화되지 않음)
            if card.id in linked_names:
                for lname in linked_names[card.id]:
                    ltxs = [tx for tx in all_txs if tx.card == lname]
                    all_income += sum(_net_amount(tx) for tx in ltxs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
                    all_expense += sum(_net_amount(tx) for tx in ltxs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
                    display_income += sum(tx.amount for tx in ltxs if tx.type == 'income' and tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_budget))
                    display_expense += sum(tx.amount for tx in ltxs if tx.type == 'expense' and tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_budget))
                    display_cashback += sum(tx.cashback or 0 for tx in ltxs if tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_budget))
            # linked card: show account card's balance
            if linked_account_id and linked_account_id in card_by_id:
                acc = card_by_id[linked_account_id]
                acc_initial = acc.account_balance or 0
                acc_txs_names = [acc.name] + linked_names.get(linked_account_id, [])
                acc_inc = sum(_net_amount(tx) for tx in all_txs if tx.card in acc_txs_names and tx.type == 'income' and _since_balance(tx.date, acc.balance_since))
                acc_exp = sum(_net_amount(tx) for tx in all_txs if tx.card in acc_txs_names and _is_account_expense(tx) and _since_balance(tx.date, acc.balance_since))
                balance = acc_initial + acc_inc - acc_exp
            else:
                # 포인트 카드는 "이번 주기에 새로 전환한 금액"만 사용 가능한 잔고에서
                # 빼야 한다 — account_balance 자체는 건드리지 않으므로 여기서 매번
                # 빼줘야 전환한 만큼 실제로 줄어든 것처럼 보이고, point_carryover 전체가
                # 아니라 baseline을 뺀 순증분만 빼야 지난 주기부터 있던 전환 포인트가
                # 이번에 새로 충전된 금액까지 깎아먹지 않는다(_point_balance 참고).
                # 일반 카드는 point_carryover가 항상 0이라 영향 없음.
                balance = initial_balance + all_income - all_expense - (card.point_converted_cycle or 0)
                # 포인트는 성격상 마이너스가 될 수 없다 — 가진 포인트보다 더 쓸 수는
                # 없으므로, 어떤 이유로든 계산이 음수가 나오면 0으로 바닥을 둔다.
                # 일반 계좌(마이너스 통장 등)는 실제로 음수일 수 있어 대상에서 뺀다.
                if card.point_reset_day and balance < 0:
                    balance = 0
            percent = min(int(perf_spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
            card_stats.append({
                'id': card.id, 'name': card.name,
                'initial_balance': initial_balance, 'total_income': display_income,
                'total_expense': display_expense, 'total_cashback': display_cashback, 'balance': balance,
                'spent': perf_spent, 'target': card.monthly_target, 'percent': percent,
                'tier1': card.tier1 or 20, 'tier2': card.tier2 or 50, 'tier3': card.tier3 or 80,
                'url': card.url or '', 'is_loan': False, 'linked_account_id': linked_account_id,
                'cashback_type': card.cashback_type or '', 'cashback_rate': card.cashback_rate,
                'cashback_monthly_cap': card.cashback_monthly_cap,
                'cashback_rule_count': cashback_rule_counts.get(card.id, 0),
                'has_custom_icon': bool(card.has_custom_icon), 'balance_since': card.balance_since,
                'point_reset_day': card.point_reset_day, 'point_reset_amount': card.point_reset_amount,
                'point_carryover': card.point_carryover or 0,
            })

    savings = Savings.query.filter_by(user_id=uid).order_by(Savings.position, Savings.id).all()
    investments = Investment.query.filter_by(user_id=uid).order_by(Investment.position, Investment.id).all()
    _auto_fetch_investment_prices(investments)
    extra_deposits = {}
    for dep in SavingsDeposit.query.filter_by(user_id=uid).all():
        extra_deposits[dep.savings_id] = extra_deposits.get(dep.savings_id, 0) + dep.amount
    return jsonify({
        'budget_amount': budget_amount,
        'expense_total': expense_total,
        'current_month': current_month,
        'card_stats': card_stats,
        'savings': [_savings_stats(s, extra_deposits.get(s.id, 0)) for s in savings],
        'investments': [_investment_stats(i) for i in investments],
        'invest_accounts': _invest_account_list(session['user_id'], [_investment_stats(i) for i in investments]),
    })

@app.route('/api/savings', methods=['GET', 'POST'])
@login_required
def api_savings():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        nd = data.get('notify_day')
        atd = data.get('auto_tx_day')
        max_pos = db.session.query(db.func.max(Savings.position)).filter_by(user_id=uid).scalar() or 0
        amount = int(data.get('amount', 0))
        withdraw_card = data.get('withdraw_card', '') or ''
        withdraw_tx_id = None
        if withdraw_card and amount > 0:
            now_time = datetime.now(_KST).strftime('%H:%M')
            tx = Transaction(
                user_id=uid, date=data['start_date'], time=now_time,
                type='expense', category=data.get('stype', '예금'),
                description=f"{data['name']} {data.get('stype', '예금')} 가입",
                amount=amount, card=withdraw_card,
                exclude_perf=True, exclude_stats=True,
            )
            db.session.add(tx)
            db.session.flush()
            withdraw_tx_id = tx.id
        db.session.add(Savings(
            user_id=uid,
            stype=data.get('stype', '예금'),
            bank=data.get('bank', ''),
            name=data['name'],
            amount=amount,
            interest_rate=float(data.get('interest_rate', 0)),
            interest_type=data.get('interest_type', '단리'),
            tax_type=data.get('tax_type', '일반과세'),
            start_date=data['start_date'],
            end_date=data['end_date'],
            notify_day=int(nd) if nd else None,
            auto_tx=bool(data.get('auto_tx', False)),
            auto_tx_day=int(atd) if atd else None,
            auto_tx_card=data.get('auto_tx_card', '') or '',
            weekend_adjust=data.get('weekend_adjust', 'next') or 'next',
            exclude_stats=bool(data.get('exclude_stats', False)),
            bonus_amount=int(data['bonus_amount']) if data.get('bonus_amount') else None,
            position=max_pos + 1,
            withdraw_transaction_id=withdraw_tx_id,
        ))
        db.session.commit()
        return jsonify({'ok': True})
    items = Savings.query.filter_by(user_id=uid).order_by(Savings.position, Savings.id).all()
    extra_deposits_sav = {}
    for dep in SavingsDeposit.query.filter_by(user_id=uid).all():
        extra_deposits_sav[dep.savings_id] = extra_deposits_sav.get(dep.savings_id, 0) + dep.amount
    return jsonify({'savings': [_savings_stats(s, extra_deposits_sav.get(s.id, 0)) for s in items]})

@app.route('/api/savings/reorder', methods=['POST'])
@login_required
def api_reorder_savings():
    uid = session['user_id']
    ids = (request.json or {}).get('ids', [])
    for i, sid in enumerate(ids):
        s = Savings.query.filter_by(id=sid, user_id=uid).first()
        if s:
            s.position = i
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/savings/<int:sid>', methods=['PUT', 'DELETE'])
@login_required
def api_saving(sid):
    uid = session['user_id']
    s = Savings.query.filter_by(id=sid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        if s.withdraw_transaction_id:
            tx = Transaction.query.filter_by(id=s.withdraw_transaction_id, user_id=uid).first()
            if tx:
                db.session.delete(tx)
        db.session.delete(s)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    s.stype = data.get('stype', s.stype)
    s.bank = data.get('bank', s.bank)
    s.name = data.get('name', s.name)
    s.amount = int(data.get('amount', s.amount))
    s.interest_rate = float(data.get('interest_rate', s.interest_rate))
    s.interest_type = data.get('interest_type', getattr(s, 'interest_type', '단리') or '단리')
    s.tax_type = data.get('tax_type', getattr(s, 'tax_type', '일반과세') or '일반과세')
    s.start_date = data.get('start_date', s.start_date)
    s.end_date = data.get('end_date', s.end_date)
    if 'notify_day' in data:
        nd = data['notify_day']
        s.notify_day = int(nd) if nd else None
    if 'auto_tx' in data:
        s.auto_tx = bool(data['auto_tx'])
    if 'auto_tx_day' in data:
        atd = data['auto_tx_day']
        s.auto_tx_day = int(atd) if atd else None
    if 'auto_tx_card' in data:
        s.auto_tx_card = data['auto_tx_card'] or ''
    if 'weekend_adjust' in data:
        s.weekend_adjust = data['weekend_adjust'] or 'next'
    if 'exclude_stats' in data:
        s.exclude_stats = bool(data['exclude_stats'])
    if 'manual_count' in data:
        mc = data['manual_count']
        s.manual_count = int(mc) if mc is not None else None
    if 'is_paused' in data:
        s.is_paused = bool(data['is_paused'])
    if 'bonus_amount' in data:
        ba = data['bonus_amount']
        s.bonus_amount = int(ba) if ba else None
    db.session.commit()
    return jsonify({'ok': True})

# ─── 저축 목표 ────────────────────────────────────────────────────────────────
def _check_invest_account(uid, aid):
    # 모든 종목은 투자 계좌에 속해야 한다 — 없거나 남의 계좌면 None
    if not aid:
        return None
    return InvestAccount.query.filter_by(id=int(aid), user_id=uid).first()

def _investment_current_value(inv):
    # 통계 · 투자 탭과 같은 평가액 계산 (해외주식은 환율 적용)
    price = inv.current_price if inv.current_price is not None else (inv.avg_price or 0)
    fx = (inv.exchange_rate or 1) if inv.itype == '해외주식' else 1
    return int((inv.quantity or 0) * price * fx)

def _holding_value(inv):
    # 목표 진행률에 들어가는 한 종목의 값 = 현재 평가액 + 지금까지 판 금액
    return _investment_current_value(inv) + _inv_realized(inv.id)

def _goal_link_tokens(g):
    # 연결 항목 토큰: 's{id}' 예·적금, 'i{id}' 투자 종목, 'a{id}' 투자 계좌(계좌 안 종목 전체).
    # 예전 데이터는 숫자만 있어 예·적금으로 본다.
    if g.savings_ids:
        return [('s' + t.strip()) if t.strip().isdigit() else t.strip() for t in g.savings_ids.split(',') if t.strip()]
    return ['s%d' % g.savings_id] if g.savings_id else []

def _goal_maps(uid):
    return (
        {s.id: s for s in Savings.query.filter_by(user_id=uid).all()},
        {i.id: i for i in Investment.query.filter_by(user_id=uid).all()},
        {a.id: a for a in InvestAccount.query.filter_by(user_id=uid).all()},
    )

def _savings_goal_json(g, savings_by_id, inv_by_id=None, acct_by_id=None):
    # 연결된 항목 값의 합이 진행률, 연결이 없으면 직접 입력해둔 manual_amount가 진행률이 된다.
    inv_by_id = inv_by_id or {}
    acct_by_id = acct_by_id or {}
    tokens = _goal_link_tokens(g)
    account_ids = {int(t[1:]) for t in tokens if t[0] == 'a'}
    linked = []
    for t in tokens:
        rid = int(t[1:])
        if t[0] == 's' and rid in savings_by_id:
            s = savings_by_id[rid]
            linked.append((f'{s.bank} {s.name}'.strip(), s.amount))
        elif t[0] == 'a' and rid in acct_by_id:
            held = [i for i in inv_by_id.values() if i.account_id == rid]
            acct = acct_by_id[rid]
            linked.append((acct.name, sum(_investment_current_value(i) for i in held) + int(acct.cash or 0)))
        elif t[0] == 'i' and rid in inv_by_id:
            inv = inv_by_id[rid]
            if inv.account_id in account_ids:
                continue  # 연결된 계좌에 이미 들어간 종목은 중복으로 더하지 않는다
            linked.append((inv.name, _holding_value(inv)))
    current = sum(v for _, v in linked) if linked else g.manual_amount
    first_savings = next((int(t[1:]) for t in tokens if t[0] == 's'), None)
    return {
        'id': g.id, 'name': g.name, 'target_amount': g.target_amount, 'target_date': g.target_date or '',
        'link_ids': tokens, 'savings_id': first_savings,
        'savings_name': ', '.join(n for n, _ in linked),
        'current_amount': current, 'manual': not tokens,
        'position': g.position,
    }

def _links_from_request(data):
    if 'link_ids' in data:
        return [str(t) for t in (data['link_ids'] or [])]
    if 'savings_ids' in data:
        return ['s%s' % i for i in (data['savings_ids'] or [])]
    if data.get('savings_id'):
        return ['s%s' % data['savings_id']]
    return []

def _set_goal_links(g, tokens):
    tokens = [t for t in tokens if len(t) > 1 and t[0] in 'sia' and t[1:].isdigit()]
    g.savings_ids = ','.join(tokens) if tokens else None
    first_savings = next((int(t[1:]) for t in tokens if t[0] == 's'), None)
    g.savings_id = first_savings

@app.route('/api/savings-goals', methods=['GET', 'POST'])
@login_required
def api_savings_goals():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        max_pos = db.session.query(db.func.max(SavingsGoal.position)).filter_by(user_id=uid).scalar() or 0
        g = SavingsGoal(
            user_id=uid, name=(data.get('name') or '').strip(),
            target_amount=int(data.get('target_amount') or 0),
            target_date=data.get('target_date') or None,
            manual_amount=int(data.get('manual_amount') or 0),
            position=max_pos + 1,
        )
        _set_goal_links(g, _links_from_request(data))
        db.session.add(g)
        db.session.commit()
        return jsonify({'ok': True, 'id': g.id})
    goals = SavingsGoal.query.filter_by(user_id=uid).order_by(SavingsGoal.position, SavingsGoal.id).all()
    savings_by_id, inv_by_id, acct_by_id = _goal_maps(uid)
    return jsonify([_savings_goal_json(g, savings_by_id, inv_by_id, acct_by_id) for g in goals])

@app.route('/api/savings-goals/<int:gid>', methods=['PUT', 'DELETE'])
@login_required
def api_savings_goal(gid):
    uid = session['user_id']
    g = SavingsGoal.query.filter_by(id=gid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(g)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    if 'name' in data: g.name = (data['name'] or '').strip()
    if 'target_amount' in data: g.target_amount = int(data['target_amount'] or 0)
    if 'target_date' in data: g.target_date = data['target_date'] or None
    if any(k in data for k in ('link_ids', 'savings_ids', 'savings_id')):
        _set_goal_links(g, _links_from_request(data))
    if 'manual_amount' in data: g.manual_amount = int(data['manual_amount'] or 0)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/savings-goals/<int:gid>/add', methods=['POST'])
@login_required
def api_savings_goal_add(gid):
    # 수동 목표에 "입금했어요" 하듯 금액을 더하는 빠른 버튼용 — 계좌 연결된
    # 목표는 진행률이 계좌 잔액을 그대로 따라가므로 여기서 건드릴 게 없다.
    uid = session['user_id']
    g = SavingsGoal.query.filter_by(id=gid, user_id=uid).first_or_404()
    if _goal_link_tokens(g):
        return jsonify({'error': '계좌에 연결된 목표는 직접 추가할 수 없습니다'}), 400
    amount = int((request.json or {}).get('amount') or 0)
    g.manual_amount = max(0, g.manual_amount + amount)
    db.session.commit()
    return jsonify({'ok': True, 'manual_amount': g.manual_amount})

@app.route('/api/usd-rate')
@login_required
def get_usd_rate():
    try:
        import FinanceDataReader as fdr
        from datetime import date, timedelta
        start = (date.today() - timedelta(days=7)).strftime('%Y-%m-%d')
        fx = fdr.DataReader('USD/KRW', start)
        rate = int(float(fx['Close'].iloc[-1])) if not fx.empty else 1380
        return jsonify({'ok': True, 'rate': rate})
    except Exception:
        return jsonify({'ok': True, 'rate': 1380})

def _acct_icon_path(uid, aid):
    return os.path.join(CARD_ICONS_DIR, f'acct_{uid}_{aid}.png')

def _acct_icon_version(a):
    p = _acct_icon_path(a.user_id, a.id)
    return int(os.path.getmtime(p)) if a.has_custom_icon and os.path.exists(p) else 0

@app.route('/api/invest-accounts/<int:aid>/icon', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_invest_account_icon(aid):
    uid = session['user_id']
    a = InvestAccount.query.filter_by(id=aid, user_id=uid).first_or_404()
    path = _acct_icon_path(uid, aid)

    if request.method == 'GET':
        if not os.path.exists(path):
            abort(404)
        return send_file(path, mimetype='image/png')

    if request.method == 'POST':
        file = request.files.get('icon')
        if not file:
            return jsonify({'error': 'no file'}), 400
        file.seek(0, os.SEEK_END)
        upload_size = file.tell()
        file.seek(0)
        if upload_size > _MAX_IMAGE_UPLOAD_BYTES:
            return jsonify({'error': '이미지 용량이 너무 큽니다. 8MB 이하 파일로 올려주세요.'}), 400
        try:
            if _PIL_OK:
                img = PILImage.open(file)
                if img.width * img.height > _MAX_IMAGE_PIXELS:
                    return jsonify({'error': '이미지 해상도가 너무 큽니다. 더 작은 이미지로 올려주세요.'}), 400
                img.draft('RGBA', (256, 256))
                img = img.convert('RGBA')
                img.thumbnail((256, 256), PILImage.LANCZOS)
                img.save(path, 'PNG', optimize=True)
            else:
                file.save(path)
            a.has_custom_icon = True
            db.session.commit()
            return jsonify({'ok': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    if os.path.exists(path):
        os.remove(path)
    a.has_custom_icon = False
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/invest-accounts', methods=['GET', 'POST'])
@login_required
def api_invest_accounts():
    uid = session['user_id']
    if request.method == 'POST':
        body = request.json or {}
        name = (body.get('name') or '').strip()
        if not name:
            return jsonify({'error': '계좌 이름을 입력해 주세요'}), 400
        max_pos = db.session.query(db.func.max(InvestAccount.position)).filter_by(user_id=uid).scalar() or 0
        a = InvestAccount(user_id=uid, name=name, position=max_pos + 1, broker=(body.get('broker') or '')[:30] or None,
                          broker_name=(body.get('broker_name') or '').strip()[:60] or None,
                          opened_at=body.get('opened_at') or None,
                          principal=float(body['principal']) if body.get('principal') not in (None, '') else None)
        db.session.add(a)
        db.session.commit()
        return jsonify({'ok': True, 'id': a.id})
    accts = InvestAccount.query.filter_by(user_id=uid).order_by(InvestAccount.position, InvestAccount.id).all()
    return jsonify([{'id': a.id, 'name': a.name, 'broker': a.broker or '', 'broker_name': a.broker_name or '', 'has_custom_icon': bool(a.has_custom_icon), 'icon_v': _acct_icon_version(a)} for a in accts])

@app.route('/api/invest-accounts/<int:aid>', methods=['PUT', 'DELETE'])
@login_required
def api_invest_account(aid):
    uid = session['user_id']
    a = InvestAccount.query.filter_by(id=aid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        # 계좌를 지워도 보유 종목은 남기고 계좌 연결만 푼다
        Investment.query.filter_by(user_id=uid, account_id=aid).update({'account_id': None})
        if os.path.exists(_acct_icon_path(uid, aid)):
            os.remove(_acct_icon_path(uid, aid))
        db.session.delete(a)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': '계좌 이름을 입력해 주세요'}), 400
        a.name = name
    if 'broker' in data:
        a.broker = (data.get('broker') or '')[:30] or None
    if 'broker_name' in data:
        a.broker_name = (data.get('broker_name') or '').strip()[:60] or None
    if 'opened_at' in data:
        a.opened_at = data.get('opened_at') or None
    if 'principal' in data:
        a.principal = float(data['principal']) if data.get('principal') not in (None, '') else None
    if 'cash' in data:
        a.cash = float(data.get('cash') or 0)
        a.cash_set = True
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/investments/<int:iid>/trades', methods=['GET', 'POST'])
@login_required
def api_investment_trades(iid):
    uid = session['user_id']
    inv = Investment.query.filter_by(id=iid, user_id=uid).first_or_404()
    if request.method == 'GET':
        trades = InvestmentTrade.query.filter_by(investment_id=iid).order_by(InvestmentTrade.date.desc(), InvestmentTrade.id.desc()).all()
        return jsonify([{'id': t.id, 'date': t.date, 'side': t.side, 'quantity': t.quantity, 'price': t.price} for t in trades])
    data = request.json or {}
    side = data.get('side')
    qty = float(data.get('quantity') or 0)
    price = float(data.get('price') or 0)
    fee = float(data.get('fee') or 0)
    if side not in ('buy', 'sell') or qty <= 0 or price <= 0:
        return jsonify({'error': '수량과 단가를 확인해 주세요'}), 400
    if fee < 0:
        return jsonify({'error': '수수료는 0원 이상이어야 해요'}), 400
    if not inv.account_id:
        return jsonify({'error': '투자 계좌를 먼저 지정해 주세요'}), 400
    held = inv.quantity or 0
    fx = inv.exchange_rate if inv.itype == '해외주식' else None
    krw = qty * price * (fx or 1)
    acct = InvestAccount.query.filter_by(id=inv.account_id, user_id=uid).first()
    if side == 'buy' and acct and acct.cash_set and krw + fee > (acct.cash or 0) + 0.5:
        return jsonify({'error': f'예수금이 부족합니다 (잔액 {int(acct.cash or 0):,}원 · 필요 {int(krw + fee):,}원)'}), 400
    if side == 'buy':
        # 매수는 평균 매수가를 가중 평균으로 다시 계산
        new_qty = held + qty
        inv.avg_price = (held * (inv.avg_price or 0) + qty * price) / new_qty
        inv.quantity = new_qty
    else:
        if qty > held + 1e-9:
            return jsonify({'error': '보유 수량보다 많이 팔 수 없습니다'}), 400
        # 매도는 수량만 줄이고 평균 매수가는 그대로 둔다
        inv.quantity = held - qty
    date = data.get('date') or datetime.now(_KST).strftime('%Y-%m-%d')
    if acct and acct.cash_set:
        # 예수금을 입력한 계좌면 거래 금액과 수수료만큼 예수금이 움직인다 (매수는 빠지고, 매도는 정산되어 들어온다)
        acct.cash = (acct.cash or 0) + ((krw - fee) if side == 'sell' else -(krw + fee))
    db.session.add(InvestmentTrade(user_id=uid, investment_id=iid, date=date, side=side, quantity=qty, price=price, exchange_rate=fx, fee=fee))
    db.session.commit()
    return jsonify({'ok': True})

def _account_balance_now(a):
    # 계좌 잔고 = 종목 평가액 + 예수금 (예수금은 입력한 계좌만)
    held = Investment.query.filter_by(user_id=a.user_id, account_id=a.id).all()
    return sum(_investment_current_value(i) for i in held) + (int(a.cash or 0) if a.cash_set else 0)

def _snapshot_account(a):
    today = datetime.now(_KST).strftime('%Y-%m-%d')
    bal = _account_balance_now(a)
    row = InvestSnapshot.query.filter_by(account_id=a.id, date=today).first()
    if row:
        row.balance = bal
    else:
        db.session.add(InvestSnapshot(user_id=a.user_id, account_id=a.id, date=today, balance=bal))
    db.session.commit()

def _snapshot_all_accounts():
    with app.app_context():
        for a in InvestAccount.query.all():
            _snapshot_account(a)

def _yearly_returns(a, balance):
    # 연도별 수익금·수익률. 전년 연말 잔고(첫해는 원금)와 순입금으로 계산한다
    cy = datetime.now(_KST).year
    records = InvestYear.query.filter_by(account_id=a.id).order_by(InvestYear.year).all()
    prev = a.principal
    out = []
    for r in records:
        if r.year >= cy:
            continue
        gain = rate = None
        if prev is not None:
            gain = r.end_balance - prev - r.net_deposit
            base = prev + r.net_deposit
            rate = round(gain / base * 100, 2) if base > 0 else None
            gain = int(gain)
        out.append({'year': r.year, 'end_balance': int(r.end_balance), 'net_deposit': int(r.net_deposit), 'gain': gain, 'rate': rate})
        prev = r.end_balance
    cur = next((r for r in records if r.year == cy), None)
    cur_net = cur.net_deposit if cur else 0
    gain = rate = None
    if prev is not None:
        gain = int(balance - prev - cur_net)
        base = prev + cur_net
        rate = round(gain / base * 100, 2) if base > 0 else None
    live = {'year': cy, 'live': True, 'end_balance': int(balance), 'net_deposit': int(cur_net), 'gain': gain, 'rate': rate}
    return out, live

def _portfolio_invest_accounts(uid):
    # 포트폴리오 PDF용 계좌별 요약: 잔고, 예수금, 원금 대비 손익, 연도별 수익
    out = []
    for a in InvestAccount.query.filter_by(user_id=uid).order_by(InvestAccount.position, InvestAccount.id).all():
        bal = _account_balance_now(a)
        years, live = _yearly_returns(a, bal)
        principal = a.principal or 0
        out.append({
            'name': a.name, 'broker_name': a.broker_name or '', 'opened_at': a.opened_at or '',
            'balance': int(bal), 'cash': int(a.cash or 0) if a.cash_set else None,
            'principal': int(principal), 'since_gain': int(bal - principal) if principal else None,
            'since_pct': round((bal - principal) / principal * 100, 2) if principal else None,
            'years': years + [live],
        })
    return out

@app.route('/api/invest-accounts/<int:aid>/years/<int:year>', methods=['PUT', 'DELETE'])
@login_required
def api_invest_account_year(aid, year):
    uid = session['user_id']
    InvestAccount.query.filter_by(id=aid, user_id=uid).first_or_404()
    row = InvestYear.query.filter_by(account_id=aid, year=year).first()
    if request.method == 'DELETE':
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    if not row:
        row = InvestYear(user_id=uid, account_id=aid, year=year)
        db.session.add(row)
    row.end_balance = float(data.get('end_balance') or 0)
    row.net_deposit = float(data.get('net_deposit') or 0)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/invest-accounts/<int:aid>/detail')
@login_required
def api_invest_account_detail(aid):
    uid = session['user_id']
    a = InvestAccount.query.filter_by(id=aid, user_id=uid).first_or_404()
    invs = Investment.query.filter_by(user_id=uid, account_id=aid).order_by(Investment.position, Investment.id).all()
    stats = [_investment_stats(i) for i in invs]
    holdings_value = sum(st['current_value'] for st in stats)
    purchase = sum(st['purchase_value'] for st in stats)
    names = {i.id: i.name for i in invs}
    trades = []
    if names:
        trades = InvestmentTrade.query.filter(InvestmentTrade.user_id == uid, InvestmentTrade.investment_id.in_(list(names)))\
            .order_by(InvestmentTrade.date.desc(), InvestmentTrade.id.desc()).limit(50).all()
    balance = holdings_value + (int(a.cash or 0) if a.cash_set else 0)
    _snapshot_account(a)
    years, live_year = _yearly_returns(a, balance)
    days_open = None
    if a.opened_at:
        try:
            days_open = (datetime.now(_KST).date() - datetime.strptime(a.opened_at, '%Y-%m-%d').date()).days
        except ValueError:
            days_open = None
    principal = a.principal or 0
    return jsonify({
        'id': a.id, 'name': a.name, 'broker': a.broker or '', 'broker_name': a.broker_name or '',
        'has_custom_icon': bool(a.has_custom_icon), 'icon_v': _acct_icon_version(a),
        'cash': int(a.cash or 0), 'cash_set': bool(a.cash_set),
        'opened_at': a.opened_at or '', 'days_open': days_open,
        'years': years, 'live_year': live_year,
        'principal': int(principal), 'since_gain': int(balance - principal) if principal else None,
        'since_pct': round((balance - principal) / principal * 100, 2) if principal else None,
        'holdings_value': holdings_value, 'purchase_value': purchase, 'gain': holdings_value - purchase,
        'balance': balance,
        'holdings': [{'id': st['id'], 'name': st['name'], 'itype': st['itype'], 'quantity': st['quantity'],
                      'avg_price': st['avg_price'], 'current_value': st['current_value'],
                      'profit': st['profit'], 'profit_pct': st['profit_pct']} for st in stats],
        'trades': [{'date': t.date, 'side': t.side, 'name': names.get(t.investment_id, ''), 'quantity': t.quantity,
                    'price': t.price, 'fee': t.fee or 0} for t in trades],
    })

@app.route('/api/investments', methods=['GET', 'POST'])
@login_required
def api_investments():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        if not _check_invest_account(uid, data.get('account_id')):
            return jsonify({'error': '투자 계좌를 선택해 주세요'}), 400
        max_pos = db.session.query(db.func.max(Investment.position)).filter_by(user_id=uid).scalar() or 0
        inv = Investment(
            user_id=uid,
            itype=data.get('itype', '국내주식'),
            name=data.get('name', ''),
            ticker=data.get('ticker', ''),
            quantity=float(data.get('quantity', 0)),
            avg_price=float(data.get('avg_price', 0)),
            current_price=float(data['current_price']) if data.get('current_price') not in (None, '') else None,
            exchange_rate=float(data['exchange_rate']) if data.get('exchange_rate') not in (None, '') else None,
            memo=data.get('memo', ''),
            account_type=data.get('account_type', '일반'),
            account_id=int(data['account_id']),
            position=max_pos + 1,
            exclude_stats=bool(data.get('exclude_stats', False)),
        )
        db.session.add(inv)
        db.session.commit()
        return jsonify({'ok': True})
    items = Investment.query.filter_by(user_id=uid).order_by(Investment.position, Investment.id).all()
    return jsonify({'investments': [_investment_stats(i) for i in items]})

@app.route('/api/investments/reorder', methods=['POST'])
@login_required
def api_reorder_investments():
    uid = session['user_id']
    ids = (request.json or {}).get('ids', [])
    for i, iid in enumerate(ids):
        inv = Investment.query.filter_by(id=iid, user_id=uid).first()
        if inv:
            inv.position = i
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/investments/<int:iid>', methods=['PUT', 'DELETE'])
@login_required
def api_investment(iid):
    uid = session['user_id']
    inv = Investment.query.filter_by(id=iid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(inv)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    inv.itype = data.get('itype', inv.itype)
    inv.name = data.get('name', inv.name)
    inv.ticker = data.get('ticker', inv.ticker)
    inv.quantity = float(data.get('quantity', inv.quantity))
    inv.avg_price = float(data.get('avg_price', inv.avg_price))
    inv.current_price = float(data['current_price']) if data.get('current_price') not in (None, '') else None
    inv.exchange_rate = float(data['exchange_rate']) if data.get('exchange_rate') not in (None, '') else inv.exchange_rate
    inv.memo = data.get('memo', inv.memo)
    if 'account_type' in data:
        inv.account_type = data['account_type']
    if 'account_id' in data:
        if not _check_invest_account(uid, data['account_id']):
            return jsonify({'error': '투자 계좌를 선택해 주세요'}), 400
        inv.account_id = int(data['account_id'])
    elif not inv.account_id:
        return jsonify({'error': '투자 계좌를 선택해 주세요'}), 400
    if 'exclude_stats' in data:
        inv.exclude_stats = bool(data['exclude_stats'])
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/investments/price')
@login_required
def fetch_investment_price():
    from datetime import date, timedelta
    import FinanceDataReader as fdr
    ticker = request.args.get('ticker', '').strip()
    itype = request.args.get('itype', '')
    if not ticker:
        return jsonify({'ok': False, 'error': '티커를 입력하세요'}), 400
    try:
        if itype == '코인' or ticker.upper().startswith('KRW-'):
            import urllib.request as _ur, json as _js
            url = f'https://api.upbit.com/v1/ticker?markets={ticker.upper()}'
            req = _ur.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
            with _ur.urlopen(req, timeout=6) as r:
                d = _js.loads(r.read())
            price = d[0]['trade_price']
            return jsonify({'ok': True, 'price': price, 'price_krw': price, 'currency': 'KRW'})
        start = (date.today() - timedelta(days=7)).strftime('%Y-%m-%d')
        is_kr = itype == '국내주식' or (itype == 'ETF' and ticker.replace('.', '').isdigit())
        if is_kr:
            t = ticker.replace('.KS', '').replace('.KQ', '')
            df = fdr.DataReader(t, start)
            if df.empty:
                return jsonify({'ok': False, 'error': '데이터를 가져올 수 없습니다'}), 400
            price = float(df['Close'].iloc[-1])
            return jsonify({'ok': True, 'price': price, 'price_krw': int(price), 'currency': 'KRW'})
        else:
            df = fdr.DataReader(ticker, start)
            if df.empty:
                return jsonify({'ok': False, 'error': '데이터를 가져올 수 없습니다'}), 400
            price = float(df['Close'].iloc[-1])
            try:
                fx = fdr.DataReader('USD/KRW', start)
                usd_krw = float(fx['Close'].iloc[-1]) if not fx.empty else 1380
            except Exception:
                usd_krw = 1380
            return jsonify({'ok': True, 'price': price, 'price_krw': int(price * usd_krw), 'currency': 'USD'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400


ADMIN_EMAIL = 'song57290@gmail.com'
NOTICE_APPS = {'gaegyebu', 'puroop'}

@app.route('/api/notices', methods=['GET', 'POST'])
@login_required
def api_notices():
    uid = session['user_id']
    u = User.query.get(uid)
    is_admin = u and u.email == ADMIN_EMAIL
    if request.method == 'POST':
        if not is_admin:
            return jsonify({'ok': False, 'error': '권한이 없습니다'}), 403
        data = request.json or {}
        title = (data.get('title') or '').strip()
        content = (data.get('content') or '').strip()
        app_name = data.get('app') if data.get('app') in NOTICE_APPS else 'gaegyebu'
        if not title or not content:
            return jsonify({'ok': False, 'error': '제목과 내용을 입력하세요'}), 400
        db.session.add(Notice(user_id=uid, app=app_name, title=title, content=content, created_at=datetime.now()))
        db.session.commit()
        return jsonify({'ok': True})
    app_filter = request.args.get('app') if request.args.get('app') in NOTICE_APPS else 'gaegyebu'
    notices = Notice.query.filter_by(app=app_filter).order_by(Notice.created_at.desc()).all()
    return jsonify([{
        'id': n.id, 'title': n.title, 'content': n.content,
        'created_at': n.created_at.strftime('%Y.%m.%d'),
        'is_admin': is_admin,
    } for n in notices])

@app.route('/api/notices/<int:nid>', methods=['DELETE', 'PUT'])
@login_required
def api_notice(nid):
    uid = session['user_id']
    u = User.query.get(uid)
    if not u or u.email != ADMIN_EMAIL:
        return jsonify({'ok': False, 'error': '권한이 없습니다'}), 403
    n = Notice.query.get_or_404(nid)
    if request.method == 'DELETE':
        db.session.delete(n)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    if not title or not content:
        return jsonify({'ok': False, 'error': '제목과 내용을 입력하세요'}), 400
    n.title = title
    n.content = content
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/salary', methods=['GET', 'PUT'])
@login_required
def api_salary():
    uid = session['user_id']
    if request.method == 'GET':
        cfg = SalaryConfig.query.filter_by(user_id=uid).first()
        allocs = BudgetAllocation.query.filter_by(user_id=uid).all()
        fixed = FixedExpense.query.filter_by(user_id=uid).all()
        current_month = datetime.now(_KST).strftime('%Y-%m')
        txs = Transaction.query.filter_by(user_id=uid).filter(Transaction.date.like(f'{current_month}%')).all()
        excl_stat_cats_salary = {c.name for c in Category.query.filter_by(user_id=uid).all() if c.exclude_stats}
        actual = {}
        for tx in txs:
            if tx.type == 'expense' and _is_stats_tx(tx, excl_stat_cats_salary):
                actual[tx.category] = actual.get(tx.category, 0) + tx.amount
        fixed_list = [{'id': f.id, 'name': f.name, 'amount': f.amount, 'day_of_month': f.day_of_month,
                        'category': f.category, 'auto_register': bool(f.auto_register),
                        'tx_type': f.tx_type or 'expense', 'tx_card': f.tx_card or '',
                        'item_type': 'fixed'} for f in fixed]
        savings_all = Savings.query.filter_by(user_id=uid).all()
        for s in savings_all:
            if s.stype not in ('적금', '청약'):
                continue
            auto_tx = bool(getattr(s, 'auto_tx', False))
            if not auto_tx or bool(getattr(s, 'is_paused', False)):
                continue
            fixed_list.append({'id': s.id, 'name': s.name, 'amount': s.amount,
                                'day_of_month': getattr(s, 'auto_tx_day', None),
                                'category': '저축', 'auto_register': auto_tx,
                                'tx_type': 'expense', 'tx_card': getattr(s, 'auto_tx_card', '') or '',
                                'item_type': 'savings', 'stype': s.stype})
        return jsonify({
            'salary': {'amount': cfg.amount if cfg else 0, 'pay_day': cfg.pay_day if cfg else None},
            'allocations': [{'id': a.id, 'category_name': a.category_name, 'percent': a.percent, 'monthly_limit': a.monthly_limit} for a in allocs],
            'fixed_expenses': fixed_list,
            'actual': actual,
        })
    data = request.get_json()
    cfg = SalaryConfig.query.filter_by(user_id=uid).first()
    if cfg:
        cfg.amount = data.get('amount', cfg.amount)
        cfg.pay_day = data.get('pay_day', cfg.pay_day)
    else:
        db.session.add(SalaryConfig(user_id=uid, amount=data.get('amount', 0), pay_day=data.get('pay_day')))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/salary/allocations', methods=['PUT'])
@login_required
def api_salary_allocations():
    uid = session['user_id']
    data = request.get_json()
    # 예전엔 이 유저의 배분 행을 전부 지우고 percent>0인 것만 다시 만들었는데,
    # 그러면 그때마다 카테고리별 monthly_limit(월 한도)이 통째로 날아가고, 방금
    # 추가만 해두고 금액을 아직 안 넣은(percent=0) 카테고리도 저장 즉시 사라졌다
    # — 보낸 이름만 percent를 갱신/생성하고, 안 보낸 기존 행은 percent만 0으로
    # 내리되 한도가 남아있으면 행 자체는 보존한다(한도까지 비어야 정리 삭제).
    sent = {a['category_name']: (a.get('percent', 0) or 0) for a in data}
    existing = {a.category_name: a for a in BudgetAllocation.query.filter_by(user_id=uid).all()}
    for name, pct in sent.items():
        if name in existing:
            existing[name].percent = pct
        else:
            db.session.add(BudgetAllocation(user_id=uid, category_name=name, percent=pct))
    for name, alloc in existing.items():
        if name not in sent:
            alloc.percent = 0
            if not alloc.monthly_limit:
                db.session.delete(alloc)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/salary/fixed', methods=['POST'])
@login_required
def api_fixed_expenses_add():
    uid = session['user_id']
    data = request.get_json()
    f = FixedExpense(user_id=uid, name=data['name'], amount=data['amount'],
                     day_of_month=data.get('day_of_month'), category=data.get('category', ''),
                     auto_register=bool(data.get('auto_register', False)),
                     auto_silent=bool(data.get('auto_silent', False)),
                     tx_type=data.get('tx_type', 'expense'), tx_card=data.get('tx_card', ''))
    db.session.add(f)
    db.session.commit()
    return jsonify({'id': f.id, 'name': f.name, 'amount': f.amount, 'day_of_month': f.day_of_month, 'category': f.category, 'auto_register': bool(f.auto_register), 'auto_silent': bool(f.auto_silent), 'tx_type': f.tx_type, 'tx_card': f.tx_card})

@app.route('/api/salary/fixed/<int:fid>', methods=['PUT', 'DELETE'])
@login_required
def api_fixed_expense(fid):
    uid = session['user_id']
    f = FixedExpense.query.filter_by(id=fid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(f)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.get_json()
    f.name = data.get('name', f.name)
    f.amount = data.get('amount', f.amount)
    f.day_of_month = data.get('day_of_month', f.day_of_month)
    f.category = data.get('category', f.category)
    f.auto_register = bool(data.get('auto_register', f.auto_register))
    f.auto_silent = bool(data.get('auto_silent', getattr(f, 'auto_silent', False)))
    f.tx_type = data.get('tx_type', f.tx_type or 'expense')
    f.tx_card = data.get('tx_card', f.tx_card or '')
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/savings/<int:sid>/deposits', methods=['GET', 'POST'])
@login_required
def api_savings_deposits(sid):
    uid = session['user_id']
    Savings.query.filter_by(id=sid, user_id=uid).first_or_404()
    if request.method == 'POST':
        data = request.get_json()
        dep = SavingsDeposit(savings_id=sid, user_id=uid,
                             amount=int(data.get('amount', 0)),
                             date=data.get('date', datetime.now(_KST).strftime('%Y-%m-%d')),
                             memo=data.get('memo', ''))
        db.session.add(dep)
        db.session.commit()
        return jsonify({'id': dep.id, 'amount': dep.amount, 'date': dep.date, 'memo': dep.memo})
    deps = SavingsDeposit.query.filter_by(savings_id=sid, user_id=uid).order_by(SavingsDeposit.date.desc()).all()
    return jsonify([{'id': d.id, 'amount': d.amount, 'date': d.date, 'memo': d.memo} for d in deps])

@app.route('/api/savings/deposits/<int:did>', methods=['DELETE'])
@login_required
def api_savings_deposit_delete(did):
    uid = session['user_id']
    dep = SavingsDeposit.query.filter_by(id=did, user_id=uid).first_or_404()
    db.session.delete(dep)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/pending-registers', methods=['GET'])
@login_required
def api_pending_registers():
    uid = session['user_id']
    today = datetime.now(_KST)
    today_day = today.day
    current_month = today.strftime('%Y-%m')
    pending = []
    business_today = _is_business_day(today.date())
    auto_check = _get_notif_prefs(uid)['auto_transfer_check']
    # 고정 지출 (auto_silent=True인 항목은 여기서 조용히 등록)
    for f in FixedExpense.query.filter_by(user_id=uid, auto_register=True).all():
        if f.day_of_month != today_day:
            continue
        already = Transaction.query.filter_by(user_id=uid).filter(
            Transaction.date.like(f'{current_month}%'),
            Transaction.description == f'[자동] {f.name}',
        ).first()
        if already:
            continue
        if getattr(f, 'auto_silent', False):
            today_str = today.strftime('%Y-%m-%d')
            tx = Transaction(user_id=uid, date=today_str, type=f.tx_type or 'expense',
                             category=f.category or '기타', description=f'[자동] {f.name}',
                             amount=f.amount, card=f.tx_card or '')
            db.session.add(tx)
            db.session.commit()
        else:
            pending.append({'item_type': 'fixed', 'id': f.id, 'name': f.name, 'amount': f.amount,
                            'category': f.category or '', 'tx_type': f.tx_type or 'expense',
                            'tx_card': f.tx_card or ''})
    # 적금/청약 자동이체
    for s in Savings.query.filter_by(user_id=uid, auto_tx=True).all():
        if s.stype not in ('적금', '청약') or not business_today or not auto_check:
            continue
        if bool(getattr(s, 'is_paused', False)):
            continue
        atd = getattr(s, 'auto_tx_day', None)
        if not atd:
            continue
        effective = _effective_withdrawal_date(today.year, today.month, atd, getattr(s, 'weekend_adjust', 'next') or 'next')
        # 정확히 그 날에만 뜨면 그날 앱을 안 열었을 때 영영 놓쳐버린다 — 이미 등록된
        # 거래가 없는 한 그 날짜가 지난 뒤에도(이번 달 안에서는) 계속 띄워준다.
        if today.date() < effective:
            continue
        desc = f'[자동이체] {s.name}'
        already = Transaction.query.filter_by(user_id=uid).filter(
            Transaction.date.like(f'{current_month}%'),
            Transaction.description == desc,
        ).first()
        if not already:
            pending.append({'item_type': 'savings', 'id': s.id, 'name': s.name, 'amount': s.amount,
                            'category': '저축', 'tx_type': 'expense',
                            'tx_card': getattr(s, 'auto_tx_card', '') or ''})
    return jsonify(pending)

@app.route('/api/salary/fixed/<int:fid>/register', methods=['POST'])
@login_required
def api_fixed_register(fid):
    uid = session['user_id']
    f = FixedExpense.query.filter_by(id=fid, user_id=uid).first_or_404()
    today = datetime.now(_KST).strftime('%Y-%m-%d')
    data = request.get_json() or {}
    card = data.get('card', f.tx_card) or None
    tx = Transaction(date=today, type=f.tx_type or 'expense',
                     category=f.category or '기타', description=f'[자동] {f.name}',
                     amount=f.amount, card=card, user_id=uid)
    db.session.add(tx)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/savings/<int:sid>/auto-register', methods=['POST'])
@login_required
def api_savings_auto_register(sid):
    uid = session['user_id']
    s = Savings.query.filter_by(id=sid, user_id=uid).first_or_404()
    today = datetime.now(_KST).strftime('%Y-%m-%d')
    data = request.get_json() or {}
    card = data.get('card', getattr(s, 'auto_tx_card', '')) or None
    tx = Transaction(date=today, type='expense',
                     category='저축', description=f'[자동이체] {s.name}',
                     amount=s.amount, card=card, user_id=uid,
                     exclude_perf=True)
    db.session.add(tx)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/help', methods=['GET'])
def api_help_list():
    items = HelpItem.query.order_by(HelpItem.position).all()
    return jsonify([{'id': h.id, 'icon': h.icon, 'title': h.title, 'desc': h.desc} for h in items])

@app.route('/api/help/<int:item_id>', methods=['PUT'])
@login_required
def api_help_item(item_id):
    u = User.query.get(session['user_id'])
    if u.email != ADMIN_EMAIL:
        return jsonify({'error': 'Forbidden'}), 403
    h = HelpItem.query.get_or_404(item_id)
    data = request.get_json()
    if 'icon' in data: h.icon = data['icon']
    if 'title' in data: h.title = data['title']
    if 'desc' in data: h.desc = data['desc']
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/update-notice-config', methods=['GET'])
def api_update_notice_config_get():
    config = AppConfig.query.get('update_notice')
    if config:
        return jsonify(json.loads(config.value))
    return jsonify({'version': '', 'date': '', 'updates': []})

@app.route('/api/update-notice-config', methods=['PUT'])
@login_required
def api_update_notice_config_put():
    u = User.query.get(session['user_id'])
    if u.email != ADMIN_EMAIL:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json()
    config = AppConfig.query.get('update_notice')
    if config:
        config.value = json.dumps(data, ensure_ascii=False)
    else:
        db.session.add(AppConfig(key='update_notice', value=json.dumps(data, ensure_ascii=False)))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/app-version', methods=['GET'])
def api_app_version_get():
    config = AppConfig.query.get('apk_version')
    if config:
        return jsonify(json.loads(config.value))
    return jsonify({'version_code': 0, 'version_name': '', 'url': ''})

@app.route('/api/app-version', methods=['PUT'])
@login_required
def api_app_version_put():
    u = User.query.get(session['user_id'])
    if u.email != ADMIN_EMAIL:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json() or {}
    value = {
        'version_code': int(data.get('version_code', 0)),
        'version_name': data.get('version_name', ''),
        'url': '/download/gaegyebu-latest.apk',
    }
    config = AppConfig.query.get('apk_version')
    if config:
        config.value = json.dumps(value, ensure_ascii=False)
    else:
        db.session.add(AppConfig(key='apk_version', value=json.dumps(value, ensure_ascii=False)))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/download/gaegyebu-latest.apk')
def download_latest_apk():
    releases_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'releases')
    fname = 'gaegyebu.apk'
    cfg = AppConfig.query.get('apk_version')
    if cfg:
        info = json.loads(cfg.value)
        vname = (info.get('version_name') or '').replace('ver', 'v').replace(' ', '')
        # version_name(예: v2.51)은 여러 빌드에 걸쳐 그대로 두고 version_code만
        # 다운로드한 파일명만 보고도 어떤 빌드인지 구분할 수 있도록 build 번호 추가.
        vcode = info.get('version_code')
        bcode = f'build{vcode}' if vcode else ''
        bdate = (info.get('build_date') or '').replace('-', '')
        parts = [p for p in (vname, bcode, bdate) if p]
        if parts:
            fname = 'gaegyebu_' + '_'.join(parts) + '.apk'
    resp = send_from_directory(releases_dir, 'gaegyebu-latest.apk', as_attachment=True,
                                download_name=fname, mimetype='application/vnd.android.package-archive',
                                conditional=False, last_modified=False, etag=False)
    # 파일 이름(URL)이 항상 동일해서, 통신사 프록시나 기기의 DownloadManager가 이전에
    # 받았던 구버전 바이트를 그대로 재사용해버리는 문제가 있었다(index.html에서
    # 이미 한 번 겪었던 것과 같은 종류의 캐싱 버그) — 강하게 캐시를 금지해 항상
    # 지금 releases/gaegyebu-latest.apk의 실제 내용을 새로 받도록 한다.
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

# ─── 푸룹(Life OS) APK 배포 ────────────────────────────────────────────────────
# 가계부와 같은 서버에서 푸룹 APK도 함께 호스팅 — 배포 방식은 위 gaegyebu APK와 동일
# (releases/puroop-latest.apk에 EAS 프로덕션 빌드 결과물을 올려두고 fly deploy).
@app.route('/api/puroop-version', methods=['GET'])
def api_puroop_version_get():
    config = AppConfig.query.get('puroop_apk_version')
    if config:
        return jsonify(json.loads(config.value))
    return jsonify({'version_code': 0, 'version_name': '', 'url': ''})

@app.route('/api/puroop-version', methods=['PUT'])
@login_required
def api_puroop_version_put():
    u = User.query.get(session['user_id'])
    if u.email != ADMIN_EMAIL:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json() or {}
    value = {
        'version_code': int(data.get('version_code', 0)),
        'version_name': data.get('version_name', ''),
        'url': '/download/puroop-latest.apk',
    }
    config = AppConfig.query.get('puroop_apk_version')
    if config:
        config.value = json.dumps(value, ensure_ascii=False)
    else:
        db.session.add(AppConfig(key='puroop_apk_version', value=json.dumps(value, ensure_ascii=False)))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/download/puroop-latest.apk')
def download_latest_puroop_apk():
    releases_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'releases')
    fname = 'puroop.apk'
    cfg = AppConfig.query.get('puroop_apk_version')
    if cfg:
        info = json.loads(cfg.value)
        vname = (info.get('version_name') or '').replace('ver', 'v').replace(' ', '')
        vcode = info.get('version_code')
        bcode = f'build{vcode}' if vcode else ''
        bdate = (info.get('build_date') or '').replace('-', '')
        parts = [p for p in (vname, bcode, bdate) if p]
        if parts:
            fname = 'puroop_' + '_'.join(parts) + '.apk'
    resp = send_from_directory(releases_dir, 'puroop-latest.apk', as_attachment=True,
                                download_name=fname, mimetype='application/vnd.android.package-archive',
                                conditional=False, last_modified=False, etag=False)
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/api/budget/monthly-balances')
@login_required
def api_budget_monthly_balances():
    import calendar as _cal

    uid = session['user_id']
    card = Card.query.filter_by(id=request.args.get('card_id', type=int), user_id=uid).first_or_404()
    if (card.account_balance or 0) < 0:
        return jsonify({'error': '대출/빚 계좌는 잔고 추이를 지원하지 않습니다.'}), 400

    start = request.args.get('start', '')
    end = request.args.get('end', '')
    try:
        sy, sm = (int(p) for p in start.split('-'))
        ey, em = (int(p) for p in end.split('-'))
        assert 1 <= sm <= 12 and 1 <= em <= 12
    except (ValueError, AssertionError):
        return jsonify({'error': 'invalid start/end'}), 400
    if (sy, sm) > (ey, em):
        return jsonify({'error': 'start must be before end'}), 400

    cards = Card.query.filter_by(user_id=uid).all()
    linked_names = {}
    for c in cards:
        if c.linked_account_id:
            linked_names.setdefault(c.linked_account_id, []).append(c.name)
    names = {card.name} | set(linked_names.get(card.id, []))

    group_txs = Transaction.query.filter_by(user_id=uid).filter(Transaction.card.in_(names)).order_by(
        Transaction.date, Transaction.time, Transaction.id).all()
    group_txs = [tx for tx in group_txs if _since_balance(tx.date, card.balance_since)]
    checkpoints = []
    running = card.account_balance or 0
    for tx in group_txs:
        running += _net_amount(tx) if tx.type == 'income' else -_net_amount(tx)
        checkpoints.append((tx.date, running))

    months = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        months.append(f'{y:04d}-{m:02d}')
        m += 1
        if m > 12:
            m = 1
            y += 1

    results = []
    idx = 0
    running = card.account_balance or 0
    for ym in months:
        last_day = _cal.monthrange(*[int(p) for p in ym.split('-')])[1]
        cutoff = f'{ym}-{last_day:02d}'
        if card.balance_since is not None and cutoff < card.balance_since:
            results.append({'month': ym, 'balance': None})
            continue
        while idx < len(checkpoints) and checkpoints[idx][0] <= cutoff:
            running = checkpoints[idx][1]
            idx += 1
        results.append({'month': ym, 'balance': running})

    return jsonify({'card_id': card.id, 'card_name': card.name, 'results': results})

@app.route('/api/portfolio')
@login_required
def api_portfolio():
    uid = session['user_id']
    user = User.query.get(uid)
    current_month = datetime.now(_KST).strftime('%Y-%m')
    transactions = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.desc()).all()
    month_txs = [tx for tx in transactions if tx.date.startswith(current_month)]
    excl_stat_cats_port = {c.name for c in Category.query.filter_by(user_id=uid, exclude_stats=True).all()}
    income_total = sum(tx.amount for tx in month_txs if tx.type == 'income' and _is_stats_tx(tx, excl_stat_cats_port))
    expense_total = sum(tx.amount for tx in month_txs if tx.type == 'expense' and _is_stats_tx(tx, excl_stat_cats_port))
    cards = Card.query.filter_by(user_id=uid).all()
    port_loan_repayments = {}
    for r in LoanRepayment.query.filter_by(user_id=uid).all():
        if r.date.startswith(current_month):
            port_loan_repayments[r.card_id] = port_loan_repayments.get(r.card_id, 0) + r.amount
    card_stats = []
    for card in cards:
        card_txs = [tx for tx in transactions if tx.card == card.name]
        initial_balance = card.account_balance or 0
        is_loan = initial_balance < 0
        all_income = sum(_net_amount(tx) for tx in card_txs if tx.type == 'income' and _since_balance(tx.date, card.balance_since))
        all_expense = sum(_net_amount(tx) for tx in card_txs if _is_account_expense(tx) and _since_balance(tx.date, card.balance_since))
        display_income = sum(tx.amount for tx in card_txs if tx.type == 'income' and tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_port))
        display_expense = sum(tx.amount for tx in card_txs if tx.type == 'expense' and tx.date.startswith(current_month) and _is_stats_tx(tx, excl_stat_cats_port))
        balance = initial_balance + all_income - all_expense
        percent = min(int(display_expense / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        card_stats.append({'name': card.name, 'initial_balance': initial_balance,
                           'balance': balance,
                           'month_income': display_income, 'spent': display_expense,
                           'target': card.monthly_target, 'percent': percent,
                           'is_loan': is_loan, 'interest_rate': card.interest_rate,
                           'total_repaid': port_loan_repayments.get(card.id, 0) if is_loan else 0})
    savings_list = Savings.query.filter_by(user_id=uid).all()
    extra_deposits_port = {}
    for dep in SavingsDeposit.query.filter_by(user_id=uid).all():
        extra_deposits_port[dep.savings_id] = extra_deposits_port.get(dep.savings_id, 0) + dep.amount
    savings_stats = [_savings_stats(s, extra_deposits_port.get(s.id, 0)) for s in savings_list]
    inv_list = Investment.query.filter_by(user_id=uid).all()
    _auto_fetch_investment_prices(inv_list)
    budget_amount_port = _effective_budget_amount(uid, current_month)
    investments = [_investment_stats(i) for i in inv_list]
    # 통계 제외 항목은 목록에는 그대로 남기고, 합계·순자산 계산에서만 뺀다
    savings_stats_ct = [s for s in savings_stats if not s.get('exclude_stats')]
    investments_ct = [i for i in investments if not i.get('exclude_stats')]
    loan_bal_port = sum((c.account_balance or 0) for c in cards if (c.account_balance or 0) < 0)
    net_worth = loan_bal_port + sum(s['current_paid'] for s in savings_stats_ct) + sum(i['current_value'] for i in investments_ct)
    inv_total = sum(i['current_value'] for i in investments_ct)
    inv_gain_total = sum(i['profit'] for i in investments_ct)
    inv_cost_total = sum(i['purchase_value'] for i in investments_ct)
    inv_return_rate = round(inv_gain_total / inv_cost_total * 100, 2) if inv_cost_total else 0
    return jsonify({
        'user': {'email': user.email, 'nickname': user.nickname},
        'current_month': current_month,
        'summary': {'income': income_total, 'expense': expense_total,
                    'balance': income_total - expense_total, 'tx_count': len(transactions)},
        'net_worth': net_worth,
        'cards': card_stats,
        'savings': savings_stats,
        'savings_summary': {
            'total_principal': sum(s['amount'] for s in savings_stats_ct),
            'total_interest': sum(s['interest'] for s in savings_stats_ct),
            'total_maturity': sum(s['maturity_amount'] for s in savings_stats_ct),
        },
        'investments': investments,
        'investments_summary': {'total_value': inv_total, 'total_gain': inv_gain_total, 'count': len(investments_ct), 'return_rate': inv_return_rate, 'total_cost': inv_cost_total},
        'invest_accounts': _portfolio_invest_accounts(uid),
        'budget': budget_amount_port,
        'transactions': [{'date': tx.date, 'type': tx.type, 'category': tx.category,
                          'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or ''}
                         for tx in transactions],
    })

def _routine_items(uid):
    items = RoutineItem.query.filter_by(user_id=uid).order_by(RoutineItem.position, RoutineItem.id).all()
    by_routine = {}
    for it in items:
        by_routine.setdefault(it.routine_id, []).append({
            'id': it.id, 'category': it.category, 'cat_type': it.cat_type,
            'exclude_card_perf': bool(it.exclude_card_perf), 'exclude_stats': bool(it.exclude_stats),
            'description': it.description or '', 'card': it.card or '',
            'exclude_cashback': bool(it.exclude_cashback),
        })
    return by_routine

@app.route('/api/routines', methods=['GET', 'POST'])
@login_required
def api_routines():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        max_pos = db.session.query(db.func.max(Routine.position)).filter(Routine.user_id == uid).scalar() or 0
        r = Routine(user_id=uid, name=data.get('name', '').strip(),
                    icon=data.get('icon', '') or '',
                    card=data.get('card', '') or '', position=max_pos + 1)
        db.session.add(r)
        db.session.flush()
        for i, it in enumerate(data.get('items', [])):
            if it.get('category'):
                db.session.add(RoutineItem(routine_id=r.id, user_id=uid,
                                           category=it['category'], cat_type=it.get('cat_type', 'expense'),
                                           exclude_card_perf=bool(it.get('exclude_card_perf', False)),
                                           exclude_stats=bool(it.get('exclude_stats', False)),
                                           description=it.get('description', '') or '',
                                           card=it.get('card', '') or '',
                                           exclude_cashback=bool(it.get('exclude_cashback', False)),
                                           position=i))
        db.session.commit()
        return jsonify({'ok': True, 'id': r.id})
    routines = Routine.query.filter_by(user_id=uid).order_by(Routine.position, Routine.id).all()
    by_routine = _routine_items(uid)
    return jsonify([{'id': r.id, 'name': r.name, 'icon': r.icon or '', 'card': r.card or '', 'position': r.position,
                     'items': by_routine.get(r.id, [])} for r in routines])

@app.route('/api/routines/suggestions')
@login_required
def api_routine_suggestions():
    uid = session['user_id']
    from datetime import date, timedelta
    cutoff = (date.today() - timedelta(days=30)).strftime('%Y-%m-%d')
    txs = Transaction.query.filter_by(user_id=uid).filter(Transaction.date >= cutoff).all()
    existing_cats = {it.category for it in RoutineItem.query.filter_by(user_id=uid).all()}
    from collections import defaultdict
    week_sets = defaultdict(set)
    for tx in txs:
        try:
            d = datetime.strptime(tx.date, '%Y-%m-%d')
            week_sets[(tx.category, tx.type)].add(d.strftime('%Y-W%W'))
        except Exception:
            pass
    suggestions = [{'category': cat, 'cat_type': ctype, 'week_count': len(weeks)}
                   for (cat, ctype), weeks in week_sets.items()
                   if len(weeks) >= 3 and cat not in existing_cats]
    suggestions.sort(key=lambda x: x['week_count'], reverse=True)
    return jsonify(suggestions[:3])

@app.route('/api/routines/<int:rid>', methods=['PUT', 'DELETE'])
@login_required
def api_routine(rid):
    uid = session['user_id']
    r = Routine.query.filter_by(id=rid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        RoutineItem.query.filter_by(routine_id=rid, user_id=uid).delete()
        db.session.delete(r)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    if 'name' in data: r.name = data['name'].strip()
    if 'icon' in data: r.icon = data['icon'] or ''
    if 'card' in data: r.card = data['card'] or ''
    if 'position' in data: r.position = data['position']
    if 'items' in data:
        RoutineItem.query.filter_by(routine_id=rid, user_id=uid).delete()
        for i, it in enumerate(data['items']):
            if it.get('category'):
                db.session.add(RoutineItem(routine_id=rid, user_id=uid,
                                           category=it['category'], cat_type=it.get('cat_type', 'expense'),
                                           exclude_card_perf=bool(it.get('exclude_card_perf', False)),
                                           exclude_stats=bool(it.get('exclude_stats', False)),
                                           description=it.get('description', '') or '',
                                           card=it.get('card', '') or '',
                                           exclude_cashback=bool(it.get('exclude_cashback', False)),
                                           position=i))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/categories', methods=['GET', 'POST'])
@login_required
def api_categories():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        name = data.get('name', '').strip()
        icon = data.get('icon', '📦').strip()
        cat_type = data.get('type', 'expense')
        if name and not Category.query.filter_by(name=name, user_id=uid).first():
            max_pos = db.session.query(db.func.max(Category.position)).filter(Category.user_id == uid).scalar() or 0
            db.session.add(Category(name=name, icon=icon, position=max_pos + 1, cat_type=cat_type, user_id=uid))
            db.session.commit()
        return jsonify({'ok': True})
    expense = Category.query.filter_by(cat_type='expense', user_id=uid).order_by(Category.position, Category.id).all()
    income = Category.query.filter_by(cat_type='income', user_id=uid).order_by(Category.position, Category.id).all()
    return jsonify({
        'expense': [{'id': c.id, 'name': c.name, 'icon': c.icon, 'type': c.cat_type, 'exclude_perf': bool(c.exclude_perf), 'exclude_stats': bool(c.exclude_stats)} for c in expense],
        'income': [{'id': c.id, 'name': c.name, 'icon': c.icon, 'type': c.cat_type, 'exclude_perf': bool(c.exclude_perf), 'exclude_stats': bool(c.exclude_stats)} for c in income],
    })

@app.route('/api/categories/reorder', methods=['POST'])
@login_required
def api_reorder_categories():
    uid = session['user_id']
    ids = (request.json or {}).get('ids', [])
    for i, cat_id in enumerate(ids):
        cat = Category.query.filter_by(id=cat_id, user_id=uid).first()
        if cat:
            cat.position = i
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/categories/<int:cat_id>', methods=['PUT', 'DELETE'])
@login_required
def api_category(cat_id):
    uid = session['user_id']
    cat = Category.query.filter_by(id=cat_id, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(cat)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json or {}
    cat.name = data.get('name', cat.name).strip()
    cat.icon = data.get('icon', cat.icon).strip()
    if 'exclude_perf' in data:
        cat.exclude_perf = bool(data['exclude_perf'])
    if 'exclude_stats' in data:
        cat.exclude_stats = bool(data['exclude_stats'])
    db.session.commit()
    return jsonify({'ok': True})

# ── SPA entry point ───────────────────────────────────────────────────────────

_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist')
_DIST_INDEX = os.path.join(_DIST_DIR, 'index.html')

@app.route('/assets/<path:filename>')
def serve_dist_assets(filename):
    return send_from_directory(os.path.join(_DIST_DIR, 'assets'), filename)

@app.route('/.well-known/assetlinks.json')
def assetlinks():
    from flask import Response
    data = [{
        'relation': ['delegate_permission/common.handle_all_urls'],
        'target': {
            'namespace': 'android_app',
            'package_name': 'dev.fly.gaegyebu.twa',
            'sha256_cert_fingerprints': [
                '7E:49:04:C8:8F:9A:D5:C6:4F:7C:17:FE:38:55:9B:C7:DC:A4:01:16:88:12:A8:72:CA:78:BB:E8:32:63:A0:65'
            ]
        }
    }]
    return Response(json.dumps(data), mimetype='application/json')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    if os.path.exists(_DIST_INDEX):
        resp = send_file(_DIST_INDEX)
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp
    return 'Frontend not built. Run: cd frontend && npm run build', 503

# ── Excel import helpers ──────────────────────────────────────────────────────
def _parse_date(val):
    if val is None: return None
    if hasattr(val, 'strftime'): return val.strftime('%Y-%m-%d')
    s = str(val).strip().split(' ')[0].split('T')[0]
    for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d'):
        try: return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except: pass
    if len(s) == 8 and s.isdigit():
        return f'{s[:4]}-{s[4:6]}-{s[6:8]}'
    return None

def _parse_amount(val):
    if val is None: return None
    if isinstance(val, (int, float)): return int(abs(val)) if val != 0 else None
    s = str(val).replace(',', '').replace('원', '').replace(' ', '').strip()
    try: v = float(s); return int(abs(v)) if v != 0 else None
    except: return None

def _parse_type(val):
    if val is None: return None
    s = str(val).strip()
    for kw in ('출금', '지출', '결제', 'expense'):
        if kw in s: return 'expense'
    for kw in ('입금', '수입', '이자', 'income'):
        if kw in s: return 'income'
    return None

_DATE_H = {'날짜','거래일자','거래일','일자','거래날짜','날짜(time)'}
_TYPE_H = {'유형','구분','거래구분','거래유형','입출금구분','입출금'}
_DESC_H = {'내용','적요','거래내용','메모','설명','항목','가맹점명','사용처','적요내용','거래처'}
_AMT_H  = {'금액','거래금액','금액(원)','거래금액(원)'}
_DEB_H  = {'출금','출금액','지출금액','출금금액','출금(원)','출금금액(원)','출금액(원)'}
_CRD_H  = {'입금','입금액','수입금액','입금금액','입금(원)','입금금액(원)','입금액(원)'}
_CAT_H  = {'카테고리','분류'}
_CARD_H = {'카드','카드명','결제카드'}

def _detect_cols(header):
    cols = {}
    for i, h in enumerate(header):
        if h is None: continue
        h = str(h).strip().replace(' ', '')
        if h in _DATE_H: cols.setdefault('date', i)
        elif h in _TYPE_H: cols.setdefault('type', i)
        elif h in _DESC_H: cols.setdefault('desc', i)
        elif h in _AMT_H: cols.setdefault('amount', i)
        elif h in _DEB_H: cols['debit'] = i
        elif h in _CRD_H: cols['credit'] = i
        elif h in _CAT_H: cols.setdefault('category', i)
        elif h in _CARD_H: cols.setdefault('card', i)
    return cols

@app.route('/import/template')
def import_template():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '내역'
    ws.append(['날짜', '유형', '카테고리', '설명', '금액', '카드'])
    ws.append(['2026-06-17', '지출', '식사', '스타벅스', 50000, '신한카드'])
    ws.append(['2026-06-17', '수입', '기타', '월급', 3000000, ''])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, download_name='가계부_양식.xlsx', as_attachment=True,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@app.route('/import', methods=['POST'])
def import_excel():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    file = request.files.get('file')
    fname = (file.filename or '').lower()
    if not file or not (fname.endswith('.xlsx') or fname.endswith('.xls')):
        return redirect('/?import_error=파일 형식 오류 (.xlsx 또는 .xls)')

    all_rows = []
    try:
        if fname.endswith('.xlsx'):
            wb = openpyxl.load_workbook(file)
            ws = wb.active
            for row in ws.iter_rows(values_only=True):
                all_rows.append(list(row))
        else:
            wb = xlrd.open_workbook(file_contents=file.read())
            ws = wb.sheet_by_index(0)
            for i in range(ws.nrows):
                parsed = []
                for cell in ws.row(i):
                    if cell.ctype == xlrd.XL_CELL_DATE:
                        parsed.append(xlrd.xldate_as_datetime(cell.value, wb.datemode).strftime('%Y-%m-%d'))
                    elif cell.ctype == xlrd.XL_CELL_EMPTY:
                        parsed.append(None)
                    else:
                        parsed.append(cell.value)
                all_rows.append(parsed)
    except Exception as e:
        app.logger.exception('Excel open error')
        from urllib.parse import quote
        return redirect('/?import_error=' + quote(str(e)[:120]))

    if not all_rows:
        return redirect('/?import_error=빈 파일입니다')

    def serialize(v):
        if v is None: return None
        if hasattr(v, 'strftime'): return v.strftime('%Y-%m-%d')
        return str(v)
    all_rows = [[serialize(c) for c in row] for row in all_rows]

    fd, path = tempfile.mkstemp(suffix='.json', prefix='impx_')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(all_rows, f)

    header_row = 0
    auto_cols = {}
    for ri, row in enumerate(all_rows[:15]):
        c = _detect_cols(row)
        if 'date' in c or 'debit' in c or 'credit' in c or 'amount' in c:
            header_row = ri
            auto_cols = c
            break

    from urllib.parse import urlencode
    params = urlencode({'tmp': os.path.basename(path), 'hr': header_row,
                        **{k: v for k, v in auto_cols.items()}})
    return redirect(url_for('import_map') + '?' + params)

@app.route('/import/map')
def import_map():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    tmp = request.args.get('tmp', '')
    if not tmp.startswith('impx_'):
        return redirect('/')
    path = os.path.join(tempfile.gettempdir(), tmp)
    if not os.path.exists(path):
        return redirect('/')
    with open(path, encoding='utf-8') as f:
        all_rows = json.load(f)
    header_row = int(request.args.get('hr', 0))
    headers = all_rows[header_row]
    preview = all_rows[header_row + 1 : header_row + 6]
    auto_cols = {k: int(v) for k, v in request.args.items()
                 if k not in ('tmp', 'hr') and v.lstrip('-').isdigit()}
    col_samples = []
    for ci in range(len(headers)):
        sample = ''
        for row in preview:
            if ci < len(row) and row[ci] is not None and str(row[ci]).strip():
                sample = str(row[ci]).strip()
                break
        col_samples.append(sample)

    return render_template('import_map.html', headers=headers, preview=preview,
                           auto_cols=auto_cols, tmp=tmp, header_row=header_row,
                           col_samples=col_samples)

@app.route('/import/confirm', methods=['POST'])
def import_confirm():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    tmp = request.form.get('tmp', '')
    if not tmp.startswith('impx_'):
        return redirect('/')
    path = os.path.join(tempfile.gettempdir(), tmp)
    if not os.path.exists(path):
        return redirect('/?import_error=세션이 만료되었습니다. 다시 업로드해주세요.')
    with open(path, encoding='utf-8') as f:
        all_rows = json.load(f)
    os.remove(path)

    header_row = int(request.form.get('header_row', 0))

    def gi(name):
        v = request.form.get(name, '')
        return int(v) if v.lstrip('-').isdigit() else -1

    col_date   = gi('col_date')
    col_debit  = gi('col_debit')
    col_credit = gi('col_credit')
    col_amount = gi('col_amount')
    col_type   = gi('col_type')
    col_desc   = gi('col_desc')
    col_cat    = gi('col_cat')

    parsed_rows = []
    skipped_rows = []
    row_num_offset = header_row + 2  # 1-based, header 다음 줄부터
    for ri, row in enumerate(all_rows[header_row + 1:]):
        row_num = ri + row_num_offset
        raw_preview = ', '.join(str(c) for c in row if c is not None and str(c).strip())[:80]
        if not any(row):
            continue
        try:
            date_val = _parse_date(row[col_date]) if 0 <= col_date < len(row) else None
            if not date_val:
                skipped_rows.append({'row': row_num, 'preview': raw_preview, 'reason': '날짜 인식 불가'})
                continue

            if col_debit >= 0 and col_credit >= 0:
                debit  = _parse_amount(row[col_debit])  if col_debit  < len(row) else None
                credit = _parse_amount(row[col_credit]) if col_credit < len(row) else None
                if debit:    tx_type, amount = 'expense', debit
                elif credit: tx_type, amount = 'income',  credit
                else:
                    skipped_rows.append({'row': row_num, 'preview': raw_preview, 'reason': '출금/입금 금액 없음'})
                    continue
            elif col_amount >= 0 and col_type >= 0:
                tx_type = _parse_type(row[col_type])
                amount  = _parse_amount(row[col_amount])
                if not tx_type or not amount:
                    skipped_rows.append({'row': row_num, 'preview': raw_preview, 'reason': '금액 또는 유형 인식 불가'})
                    continue
            elif col_amount >= 0:
                amount = _parse_amount(row[col_amount])
                if not amount:
                    skipped_rows.append({'row': row_num, 'preview': raw_preview, 'reason': '금액 인식 불가'})
                    continue
                tx_type = 'expense'
            else:
                skipped_rows.append({'row': row_num, 'preview': raw_preview, 'reason': '금액 컬럼 미지정'})
                continue

            desc_val = str(row[col_desc]).strip() if 0 <= col_desc < len(row) and row[col_desc] else ''
            cat_val  = str(row[col_cat]).strip()  if 0 <= col_cat  < len(row) and row[col_cat]  else ''

            parsed_rows.append({
                'date': date_val, 'type': tx_type,
                'description': desc_val, 'amount': amount, 'category': cat_val,
            })
        except Exception as e:
            skipped_rows.append({'row': row_num, 'preview': raw_preview, 'reason': f'파싱 오류: {str(e)[:40]}'})

    # 파싱된 내역을 임시파일에 저장 후 카테고리 선택 페이지로
    fd, cat_path = tempfile.mkstemp(suffix='.json', prefix='impc_')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump({'rows': parsed_rows, 'skipped_rows': skipped_rows}, f)

    from urllib.parse import urlencode
    return redirect('/import/categorize?' + urlencode({'tmp': os.path.basename(cat_path)}))


@app.route('/import/categorize')
def import_categorize():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    tmp = request.args.get('tmp', '')
    if not tmp.startswith('impc_'):
        return redirect('/')
    path = os.path.join(tempfile.gettempdir(), tmp)
    if not os.path.exists(path):
        return redirect('/?import_error=세션이 만료되었습니다. 다시 업로드해주세요.')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    cats_expense = Category.query.filter(
        (Category.user_id == uid) | (Category.user_id == None),
        Category.cat_type == 'expense'
    ).order_by(Category.position).all()
    cats_income = Category.query.filter(
        (Category.user_id == uid) | (Category.user_id == None),
        Category.cat_type == 'income'
    ).order_by(Category.position).all()
    cards = Card.query.filter_by(user_id=uid).order_by(Card.id).all()

    return render_template('import_categorize.html',
                           rows=data['rows'], skipped_rows=data.get('skipped_rows', []),
                           cats_expense=cats_expense, cats_income=cats_income,
                           cards=cards, tmp=tmp)


@app.route('/import/categorize/confirm', methods=['POST'])
def import_categorize_confirm():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    tmp = request.form.get('tmp', '')
    if not tmp.startswith('impc_'):
        return redirect('/')
    path = os.path.join(tempfile.gettempdir(), tmp)
    if not os.path.exists(path):
        return redirect('/?import_error=세션이 만료되었습니다. 다시 업로드해주세요.')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    os.remove(path)

    imported = 0
    salary_sync = None
    now_time = datetime.now(_KST).strftime('%H:%M')
    for i, row in enumerate(data['rows']):
        cat = request.form.get(f'cat_{i}', '기타').strip() or '기타'
        card_val = request.form.get(f'card_{i}', '').strip() or None
        transfer_to = request.form.get(f'transfer_to_{i}', '').strip() or None
        is_transfer = cat == '계좌 이체' and transfer_to
        desc = f'{card_val} → {transfer_to}' if is_transfer else row['description']
        row_cb, row_cb_rule_id = _compute_cashback(uid, card_val, row['type'], row['amount'], False, desc, row['date'])
        db.session.add(Transaction(
            date=row['date'], type=row['type'], category=cat,
            description=desc, amount=row['amount'],
            card=card_val, user_id=uid,
            exclude_perf=bool(is_transfer), exclude_stats=bool(is_transfer),
            time=now_time,
            cashback=row_cb, cashback_rule_id=row_cb_rule_id,
        ))
        if is_transfer:
            paired_cb, _ = _compute_cashback(uid, transfer_to, 'income', row['amount'], False, desc, row['date'])
            db.session.add(Transaction(
                date=row['date'], type='income', category='계좌 이체',
                description=desc, amount=row['amount'],
                card=transfer_to, user_id=uid,
                exclude_perf=True, exclude_stats=True,
                time=now_time,
                cashback=paired_cb,
            ))
        if cat == '월급' and row['type'] == 'income':
            salary_sync = row['amount']
        imported += 1

    db.session.commit()
    if salary_sync is not None:
        _sync_salary_if_needed(uid, '월급', 'income', salary_sync)
    skipped_count = len(data.get('skipped_rows', []))
    return redirect(f'/?imported={imported}&skipped={skipped_count}')

def _parse_sms_line(line):
    amount_m = re.search(r'([\d,]+)원', line)
    if not amount_m:
        return None
    try:
        amount = int(amount_m.group(1).replace(',', ''))
    except Exception:
        return None
    if amount <= 0:
        return None

    d = re.search(r'(\d{4})[-./](\d{1,2})[-./](\d{1,2})', line)
    if d:
        date_val = f"{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}"
    else:
        d = re.search(r'(\d{1,2})[/.-](\d{1,2})', line)
        year = datetime.now(_KST).year
        date_val = f"{year}-{int(d.group(1)):02d}-{int(d.group(2)):02d}" if d else datetime.now(_KST).strftime('%Y-%m-%d')

    tx_type = 'income' if re.search(r'입금|환급|취소|환불', line) else 'expense'

    bracket_m = re.search(r'\[([^\]]+)\]', line)
    if bracket_m:
        card_val = bracket_m.group(1)
    else:
        card_m = re.search(r'[가-힣a-zA-Z]+(?:카드|은행|뱅크|bank)', line, re.IGNORECASE)
        card_val = card_m.group(0) if card_m else None

    desc = line
    desc = re.sub(r'\[[^\]]+\]', '', desc)
    desc = re.sub(r'[\d,]+원', '', desc)
    desc = re.sub(r'\(금액\)', '', desc)
    desc = re.sub(r'\d{4}[-./]\d{1,2}[-./]\d{1,2}', '', desc)
    desc = re.sub(r'\d{1,2}[/.-]\d{1,2}', '', desc)
    desc = re.sub(r'\d{2}:\d{2}', '', desc)
    desc = re.sub(r'[가-힣]+(?:카드|은행|뱅크)', '', desc)
    desc = re.sub(r'일시불|할부\d*|승인|취소|번호|이체|출금|입금|납부|결제|사용|신용|체크', '', desc)
    desc = re.sub(r'\([^)]*\)', '', desc)
    desc = re.sub(r'[\[\]（）]', '', desc)
    desc = re.sub(r'[가-힣][*]+[가-힣]+', '', desc)
    desc = re.sub(r'\s+', ' ', desc).strip(' -_|,.')

    return {'date': date_val, 'type': tx_type, 'amount': amount,
            'description': desc, 'card': card_val, 'category': '기타'}

@app.route('/import/text', methods=['POST'])
def import_text():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    raw = request.form.get('text', '').strip()
    if not raw:
        return redirect('/?import_error=내용을 입력해주세요')

    parsed = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        tx = _parse_sms_line(line)
        if tx:
            parsed.append(tx)

    if not parsed:
        return redirect('/?import_error=인식된 거래 내역이 없습니다')

    fd, path = tempfile.mkstemp(suffix='.json', prefix='impt_')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(parsed, f, ensure_ascii=False)

    return redirect(url_for('import_text_preview', tmp=os.path.basename(path)))

@app.route('/import/text/preview')
def import_text_preview():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    tmp = request.args.get('tmp', '')
    if not tmp.startswith('impt_'):
        return redirect('/')
    path = os.path.join(tempfile.gettempdir(), tmp)
    if not os.path.exists(path):
        return redirect('/')
    with open(path, encoding='utf-8') as f:
        parsed = json.load(f)
    categories = Category.query.filter_by(user_id=uid).order_by(Category.position, Category.id).all()
    cards = Card.query.filter_by(user_id=uid).all()

    _generic = {'카드', '은행', '뱅크', '체크', '신용', '승인', '출금', '입금', '이체', '결제', '납부'}

    def match_card(sms_card):
        if not sms_card:
            return ''
        for card in cards:
            if card.name in sms_card or sms_card in card.name:
                return card.name
        for card in cards:
            name = card.name
            for length in (2, 3):
                for i in range(len(name) - length + 1):
                    chunk = name[i:i+length]
                    if chunk in _generic:
                        continue
                    if chunk in sms_card:
                        return card.name
        return ''

    for tx in parsed:
        tx['card_matched'] = match_card(tx.get('card', ''))

    expense_cats = [c for c in categories if c.cat_type == 'expense']
    income_cats = [c for c in categories if c.cat_type == 'income']
    return render_template('import_text_preview.html',
                           parsed=parsed, tmp=tmp,
                           categories=categories, card_list=cards,
                           expense_cats_json=[[c.name, c.icon] for c in expense_cats],
                           income_cats_json=[[c.name, c.icon] for c in income_cats])

@app.route('/import/text/confirm', methods=['POST'])
def import_text_confirm():
    uid = session.get('user_id')
    if not uid:
        return redirect('/login')
    tmp = request.form.get('tmp', '')
    if not tmp.startswith('impt_'):
        return redirect('/')
    path = os.path.join(tempfile.gettempdir(), tmp)
    if os.path.exists(path):
        os.remove(path)

    dates    = request.form.getlist('date')
    types    = request.form.getlist('type')
    descs    = request.form.getlist('description')
    amts     = request.form.getlist('amount')
    cats     = request.form.getlist('category')
    cardss   = request.form.getlist('card')
    transfer_tos = request.form.getlist('transfer_to')
    checks   = set(request.form.getlist('include'))
    now_time = datetime.now(_KST).strftime('%H:%M')

    imported = 0
    for i in range(len(dates)):
        if str(i) not in checks:
            continue
        try:
            amount = int(str(amts[i]).replace(',', ''))
            card = cardss[i] if cardss[i] else None
            is_transfer = bool(cats[i] == '계좌 이체' and transfer_tos[i])
            row_cb, row_cb_rule_id = _compute_cashback(uid, card, types[i], amount, False, descs[i], dates[i])
            db.session.add(Transaction(
                date=dates[i], type=types[i], category=cats[i],
                description=descs[i], amount=amount,
                card=card, user_id=uid,
                exclude_perf=is_transfer, exclude_stats=is_transfer,
                time=now_time,
                cashback=row_cb, cashback_rule_id=row_cb_rule_id,
            ))
            if is_transfer:
                to_card = transfer_tos[i]
                paired_cb, _ = _compute_cashback(uid, to_card, 'income', amount, False, descs[i], dates[i])
                db.session.add(Transaction(
                    date=dates[i], type='income', category='계좌 이체',
                    description=descs[i], amount=amount,
                    card=to_card, user_id=uid,
                    exclude_perf=True, exclude_stats=True,
                    time=now_time,
                    cashback=paired_cb,
                ))
            imported += 1
        except Exception:
            db.session.rollback()

    db.session.commit()
    return redirect(f'/?imported={imported}')

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js')


# ── Push Notification ─────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_FILE_DIR = os.environ.get('DATA_DIR', _BASE_DIR)
VAPID_PRIVATE_FILE = os.path.join(_FILE_DIR, 'vapid_private_v2.pem')
VAPID_PUBLIC_FILE = os.path.join(_FILE_DIR, 'vapid_public_v2.txt')
SUBSCRIPTIONS_FILE = os.path.join(_FILE_DIR, 'subscriptions.json')
FCM_TOKENS_FILE = os.path.join(_FILE_DIR, 'fcm_tokens.json')

_firebase_initialized = False

def _init_firebase():
    global _firebase_initialized
    if _firebase_initialized:
        return True
    try:
        import firebase_admin
        from firebase_admin import credentials
        if firebase_admin._apps:
            _firebase_initialized = True
            return True
        creds_b64 = os.environ.get('FIREBASE_CREDENTIALS_B64')
        creds_json = os.environ.get('FIREBASE_CREDENTIALS')
        if creds_b64:
            import base64
            cred = credentials.Certificate(json.loads(base64.b64decode(creds_b64).decode('utf-8')))
        elif creds_json:
            cred = credentials.Certificate(json.loads(creds_json))
        else:
            sdk_path = os.path.join(_BASE_DIR, 'firebase-adminsdk.json')
            if not os.path.exists(sdk_path):
                return False
            cred = credentials.Certificate(sdk_path)
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        return True
    except Exception as e:
        app.logger.error('Firebase init error: %s', e)
        return False

def _load_fcm_tokens():
    if not os.path.exists(FCM_TOKENS_FILE):
        return []
    with open(FCM_TOKENS_FILE) as f:
        return json.load(f)

def _save_fcm_tokens(tokens):
    with open(FCM_TOKENS_FILE, 'w') as f:
        json.dump(tokens, f)

def _get_vapid_keys():
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    # 기존 키가 PKCS8 형식이면 삭제하고 EC PEM으로 재생성
    if os.path.exists(VAPID_PRIVATE_FILE):
        with open(VAPID_PRIVATE_FILE, 'rb') as f:
            content = f.read()
        if b'BEGIN PRIVATE KEY' in content:  # PKCS8 → 재생성
            for p in [VAPID_PRIVATE_FILE, VAPID_PUBLIC_FILE]:
                if os.path.exists(p): os.remove(p)
    if os.path.exists(VAPID_PRIVATE_FILE) and os.path.exists(VAPID_PUBLIC_FILE):
        try:
            with open(VAPID_PRIVATE_FILE, 'rb') as f:
                load_pem_private_key(f.read(), password=None)
            with open(VAPID_PUBLIC_FILE) as f:
                pub = f.read().strip()
            return {'private': VAPID_PRIVATE_FILE, 'public': pub}
        except Exception:
            for p in [VAPID_PRIVATE_FILE, VAPID_PUBLIC_FILE]:
                if os.path.exists(p): os.remove(p)
    try:
        pk = ec.generate_private_key(ec.SECP256R1())
        # pywebpush가 요구하는 EC PEM 형식 (TraditionalOpenSSL)
        pem = pk.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption())
        with open(VAPID_PRIVATE_FILE, 'wb') as f:
            f.write(pem)
        pub_b64 = base64.urlsafe_b64encode(
            pk.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        ).rstrip(b'=').decode()
        with open(VAPID_PUBLIC_FILE, 'w') as f:
            f.write(pub_b64)
        return {'private': VAPID_PRIVATE_FILE, 'public': pub_b64}
    except Exception:
        return {'private': '', 'public': ''}

vapid_keys = _get_vapid_keys()

def _load_subs():
    if not os.path.exists(SUBSCRIPTIONS_FILE):
        return []
    with open(SUBSCRIPTIONS_FILE) as f:
        return json.load(f)

def _save_subs(subs):
    with open(SUBSCRIPTIONS_FILE, 'w') as f:
        json.dump(subs, f)

@app.route('/api/vapid-public-key')
def vapid_public_key():
    return {'key': vapid_keys['public']}

@app.route('/api/subscribe', methods=['POST'])
def push_subscribe():
    data = request.json or {}
    uid = session.get('user_id')
    if uid:
        data['user_id'] = uid
    all_subs = _load_subs()
    # 동일 엔드포인트 제거 (중복 방지)
    subs = [s for s in all_subs if s.get('endpoint') != data.get('endpoint')]
    subs.append(data)
    # 같은 user_id 구독이 3개 초과하면 오래된 것부터 제거
    if uid:
        user_subs = [s for s in subs if s.get('user_id') == uid]
        if len(user_subs) > 3:
            keep_endpoints = {s['endpoint'] for s in user_subs[-3:]}
            subs = [s for s in subs if s.get('user_id') != uid or s.get('endpoint') in keep_endpoints]
    _save_subs(subs)
    return {'ok': True}

@app.route('/api/unsubscribe', methods=['POST'])
def push_unsubscribe():
    data = request.json or {}
    _save_subs([s for s in _load_subs() if s.get('endpoint') != data.get('endpoint')])
    return {'ok': True}

@app.route('/api/fcm-subscribe', methods=['POST'])
def fcm_subscribe():
    data = request.json or {}
    token = data.get('token')
    if not token:
        return jsonify({'ok': False}), 400
    uid = session.get('user_id')
    tokens = _load_fcm_tokens()
    tokens = [t for t in tokens if t.get('token') != token]
    tokens.append({
        'token': token,
        'user_id': uid,
        'notify_hour': data.get('notify_hour', 21),
        'notify_minute': data.get('notify_minute', 0),
    })
    _save_fcm_tokens(tokens)
    # 같은 유저의 Web Push 구독 제거 (중복 알림 방지)
    if uid:
        _save_subs([s for s in _load_subs() if s.get('user_id') != uid])
    return jsonify({'ok': True})

@app.route('/api/fcm-unsubscribe', methods=['POST'])
def fcm_unsubscribe():
    data = request.json or {}
    token = data.get('token')
    _save_fcm_tokens([t for t in _load_fcm_tokens() if t.get('token') != token])
    return jsonify({'ok': True})

def _do_send_fcm(token, title='💰 나의 가계부', body='오늘 지출을 기록했나요? 📝'):
    from firebase_admin import messaging
    if not _init_firebase():
        raise RuntimeError('Firebase not initialized')
    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id='gaegyebu_push',
                sound='default',
            ),
        ),
        token=token,
    )
    messaging.send(message)

def _do_send_push(sub, title='💰 나의 가계부', body='오늘 지출을 기록했나요? 📝'):
    from pywebpush import webpush
    priv_path = vapid_keys.get('private', '')
    if not priv_path or not os.path.exists(priv_path):
        raise RuntimeError('VAPID private key not found: ' + str(priv_path))
    webpush(
        subscription_info={'endpoint': sub['endpoint'], 'keys': sub['keys']},
        data=json.dumps({'title': title, 'body': body, 'url': '/'}),
        vapid_private_key=priv_path,
        vapid_claims={'sub': 'mailto:song57290@gmail.com'},
        ttl=86400,
        headers={'urgency': 'high'},
    )

def _scheduled_price_update():
    with app.app_context():
        try:
            all_investments = Investment.query.all()
            if all_investments:
                _auto_fetch_investment_prices(all_investments)
        except Exception as e:
            app.logger.error('Scheduled price update error: %s', e)

_NOTIF_DEFAULTS = {'savings_day': True, 'savings_holiday': 'skip', 'auto_transfer_check': True}

def _get_notif_prefs(uid):
    prefs = dict(_NOTIF_DEFAULTS)
    cfg = AppConfig.query.get(f'notif_prefs_{uid}') if uid else None
    if cfg:
        try:
            prefs.update(json.loads(cfg.value))
        except Exception:
            pass
    return prefs

@app.route('/api/notification-prefs', methods=['GET', 'PUT'])
@login_required
def api_notification_prefs():
    uid = session['user_id']
    prefs = _get_notif_prefs(uid)
    if request.method == 'GET':
        return jsonify(prefs)
    data = request.json or {}
    for k in ('savings_day', 'auto_transfer_check'):
        if k in data:
            prefs[k] = bool(data[k])
    if 'savings_holiday' in data:
        if data['savings_holiday'] not in ('skip', 'next'):
            return jsonify({'error': 'invalid option'}), 400
        prefs['savings_holiday'] = data['savings_holiday']
    key = f'notif_prefs_{uid}'
    cfg = AppConfig.query.get(key)
    value = json.dumps(prefs, ensure_ascii=False)
    if cfg:
        cfg.value = value
    else:
        db.session.add(AppConfig(key=key, value=value))
    db.session.commit()
    return jsonify(prefs)

def _send_push_notifications():
    try:
        from datetime import timezone, timedelta
        KST = timezone(timedelta(hours=9))
        now = datetime.now(KST)
        for sub in _load_subs():
            if now.hour == sub.get('notify_hour', 21) and now.minute == sub.get('notify_minute', 0):
                try:
                    _do_send_push(sub)
                except Exception as e:
                    app.logger.error('Push failed for %s: %s', sub.get('endpoint', '')[:40], e)
        for tok in _load_fcm_tokens():
            if now.hour == tok.get('notify_hour', 21) and now.minute == tok.get('notify_minute', 0):
                try:
                    _do_send_fcm(tok['token'])
                except Exception as e:
                    app.logger.error('FCM push failed: %s', e)
    except Exception as e:
        app.logger.error('Push scheduler error: %s', e)

def _send_savings_notifications():
    with app.app_context():
        try:
            from datetime import timezone, timedelta
            KST = timezone(timedelta(hours=9))
            now = datetime.now(KST)
            savings_list = Savings.query.filter(Savings.stype.in_(['청약', '적금'])).all()
            subs = _load_subs()
            for s in savings_list:
                nd = getattr(s, 'notify_day', None)
                if not nd:
                    continue
                prefs = _get_notif_prefs(s.user_id)
                if not prefs['savings_day']:
                    continue
                if prefs['savings_holiday'] == 'skip':
                    # 쉬는 날이면 그날 알림은 보내지 않는다 (다음 영업일로 미루지 않음)
                    if nd != now.day or not _is_business_day(now.date()):
                        continue
                else:
                    # 쉬는 날이면 다음 영업일에 알림
                    if now.date() != _effective_withdrawal_date(now.year, now.month, nd, 'next'):
                        continue
                icon = '🏠' if s.stype == '청약' else '🏦'
                title = f'{icon} {s.stype} 납입일 알림'
                body = f'{s.name} 납입일입니다! {s.amount:,}원을 납입해 주세요.'
                user_subs = [sub for sub in subs if sub.get('user_id') == s.user_id]
                for sub in user_subs:
                    try:
                        _do_send_push(sub, title=title, body=body)
                    except Exception as e:
                        app.logger.error('Savings push failed uid=%s: %s', s.user_id, e)
                user_tokens = [t for t in _load_fcm_tokens() if t.get('user_id') == s.user_id]
                for tok in user_tokens:
                    try:
                        _do_send_fcm(tok['token'], title=title, body=body)
                    except Exception as e:
                        app.logger.error('Savings FCM failed uid=%s: %s', s.user_id, e)
        except Exception as e:
            app.logger.error('Savings notification error: %s', e)


@app.route('/api/test-notify', methods=['POST'])
@login_required
def test_notify():
    uid = session['user_id']
    all_subs = _load_subs()
    subs = [s for s in all_subs if s.get('user_id') == uid]
    all_fcm = _load_fcm_tokens()
    fcm_subs = [t for t in all_fcm if t.get('user_id') == uid]
    if not subs and not fcm_subs:
        return jsonify({'ok': False, 'error': '구독 정보 없음. 알림을 먼저 켜주세요.'}), 400
    sent = 0
    errors = []
    expired_endpoints = []
    for sub in subs:
        try:
            _do_send_push(sub, title='✅ 테스트 알림', body='알림이 정상 작동합니다!')
            sent += 1
        except Exception as e:
            err_str = str(e)
            if '410' in err_str or 'unsubscribed' in err_str or 'expired' in err_str:
                expired_endpoints.append(sub.get('endpoint'))
            else:
                errors.append(err_str)
            app.logger.error('Test push failed: %s', e)
    if expired_endpoints:
        _save_subs([s for s in all_subs if s.get('endpoint') not in expired_endpoints])
    # FCM 토큰으로도 전송 — NotRegistered는 기기에서 알림 권한을 끄거나 앱을 삭제/
    # 재설치하면 토큰이 무효화되면서 뜨는 표준 오류라, 따로 구분해 죽은 토큰은
    # 정리하고 사용자에게는 원인을 짐작할 수 있는 문구로 안내한다.
    unregistered_tokens = []
    for tok in fcm_subs:
        try:
            _do_send_fcm(tok['token'], title='✅ 테스트 알림', body='알림이 정상 작동합니다!')
            sent += 1
        except Exception as e:
            err_str = str(e)
            if 'NotRegistered' in err_str or 'UNREGISTERED' in err_str.upper():
                unregistered_tokens.append(tok.get('token'))
            else:
                errors.append(err_str)
            app.logger.error('Test FCM failed: %s', e)
    if unregistered_tokens:
        _save_fcm_tokens([t for t in all_fcm if t.get('token') not in unregistered_tokens])
    if sent > 0:
        return jsonify({'ok': True, 'sent': sent})
    if expired_endpoints or (unregistered_tokens and not errors):
        return jsonify({'ok': False, 'error': '알림 권한이 꺼져있는 것 같아요. 기기 설정에서 이 앱의 알림 권한을 확인해주세요.', 'reason': 'permission_off'}), 400
    return jsonify({'ok': False, 'error': '; '.join(errors)}), 500

if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        import atexit
        _scheduler = BackgroundScheduler()
        _scheduler.add_job(_send_push_notifications, 'cron', minute='*')
        _scheduler.add_job(_send_savings_notifications, 'cron', hour=0, minute=0)
        _scheduler.add_job(_apply_point_resets, 'cron', hour=0, minute=5)
        _scheduler.add_job(_scheduled_price_update, 'cron', day_of_week='mon-fri', hour=6, minute=35)
        _scheduler.add_job(_scheduled_price_update, 'cron', day_of_week='tue-sat', hour=2, minute=15)
        _scheduler.add_job(_snapshot_all_accounts, 'cron', hour=23, minute=55)
        _scheduler.start()
        atexit.register(lambda: _scheduler.shutdown(wait=False))
    except ImportError:
        pass

# ─── 내역 검색 ───────────────────────────────────────────────────────────────
@app.route('/api/search')
@login_required
def api_search():
    uid = session['user_id']
    q = request.args.get('q', '').strip()
    category = request.args.get('category', '')
    tx_type = request.args.get('type', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')
    amount_min = request.args.get('amount_min', type=int)
    amount_max = request.args.get('amount_max', type=int)

    query = Transaction.query.filter_by(user_id=uid)
    if q:
        query = query.filter(db.or_(
            Transaction.description.ilike(f'%{q}%'),
            Transaction.category.ilike(f'%{q}%'),
        ))
    if category:
        query = query.filter(Transaction.category == category)
    if tx_type:
        query = query.filter(Transaction.type == tx_type)
    if date_from:
        query = query.filter(Transaction.date >= date_from)
    if date_to:
        query = query.filter(Transaction.date <= date_to)
    if amount_min is not None:
        query = query.filter(Transaction.amount >= amount_min)
    if amount_max is not None:
        query = query.filter(Transaction.amount <= amount_max)

    txs = query.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(200).all()
    return jsonify([{
        'id': tx.id, 'date': tx.date, 'type': tx.type, 'category': tx.category,
        'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or '',
        'has_receipt': bool(getattr(tx, 'has_receipt', False)),
    } for tx in txs])

# ─── 무드(기분) 기록 ──────────────────────────────────────────────────────────
@app.route('/api/mood')
@login_required
def api_mood_list():
    uid = session['user_id']
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    query = Mood.query.filter_by(user_id=uid)
    if date_from:
        query = query.filter(Mood.date >= date_from)
    if date_to:
        query = query.filter(Mood.date <= date_to)

    moods = query.order_by(Mood.date.desc()).limit(400).all()
    return jsonify([{
        'id': m.id, 'date': m.date, 'score': m.score, 'memo': m.memo or '',
        # 연속 기록 계산용 — 그날 당일에 기록했는지(연속 인정) 나중에 소급 입력했는지
        # (연속 계산에서 제외) 구분하기 위한 실제 최초 입력일. updated_at이 아니라
        # created_at을 써야 "내용만 수정"한 경우엔 연속 기록이 깨지지 않는다.
        # created_at은 서버(fly, UTC) 시각 그대로 저장되므로 한국 날짜로 바꿔서 내려준다 —
        # 안 그러면 KST 0~9시에 당일 기록한 것도 "전날 입력"으로 보여 연속이 끊긴다.
        'created_date': m.created_at.replace(tzinfo=timezone.utc).astimezone(_KST).strftime('%Y-%m-%d'),
    } for m in moods])

@app.route('/api/mood', methods=['POST'])
@login_required
def api_mood_upsert():
    uid = session['user_id']
    data = request.json or {}
    date = data.get('date', '')
    score = data.get('score')
    memo = (data.get('memo') or '').strip()[:200]

    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        return jsonify({'error': '날짜 형식이 올바르지 않습니다'}), 400
    if not isinstance(score, int) or score < 1 or score > 5:
        return jsonify({'error': '점수는 1~5 사이여야 합니다'}), 400

    now = datetime.now()
    mood = Mood.query.filter_by(user_id=uid, date=date).first()
    if mood:
        mood.score = score
        mood.memo = memo
        mood.updated_at = now
    else:
        mood = Mood(user_id=uid, date=date, score=score, memo=memo, created_at=now, updated_at=now)
        db.session.add(mood)
    db.session.commit()
    return jsonify({'ok': True, 'date': date, 'score': score, 'memo': memo})

# ─── 영수증 첨부 ──────────────────────────────────────────────────────────────
@app.route('/api/transactions/<int:tid>/receipt', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_receipt(tid):
    uid = session['user_id']
    tx = Transaction.query.filter_by(id=tid, user_id=uid).first_or_404()
    path = os.path.join(RECEIPTS_DIR, f'{uid}_{tid}.jpg')

    if request.method == 'GET':
        if not os.path.exists(path):
            abort(404)
        return send_file(path, mimetype='image/jpeg')

    if request.method == 'POST':
        file = request.files.get('receipt')
        if not file:
            return jsonify({'error': 'no file'}), 400
        file.seek(0, os.SEEK_END)
        upload_size = file.tell()
        file.seek(0)
        if upload_size > _MAX_IMAGE_UPLOAD_BYTES:
            return jsonify({'error': '이미지 용량이 너무 큽니다. 8MB 이하 파일로 올려주세요.'}), 400
        try:
            if _PIL_OK:
                img = PILImage.open(file)
                if img.width * img.height > _MAX_IMAGE_PIXELS:
                    return jsonify({'error': '이미지 해상도가 너무 큽니다. 더 작은 이미지로 올려주세요.'}), 400
                img.draft('RGB', (1200, 1600))
                img = img.convert('RGB')
                img.thumbnail((1200, 1600), PILImage.LANCZOS)
                img.save(path, 'JPEG', quality=80, optimize=True)
            else:
                file.save(path)
            tx.has_receipt = True
            db.session.commit()
            return jsonify({'ok': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    if request.method == 'DELETE':
        if os.path.exists(path):
            os.remove(path)
        tx.has_receipt = False
        db.session.commit()
        return jsonify({'ok': True})

# ─── 데이터 백업/복원 ─────────────────────────────────────────────────────────
@app.route('/api/backup')
@login_required
def api_backup():
    uid = session['user_id']
    txs = Transaction.query.filter_by(user_id=uid).all()
    cats = Category.query.filter_by(user_id=uid).all()
    cards = Card.query.filter_by(user_id=uid).all()
    savings_list = Savings.query.filter_by(user_id=uid).all()
    investments = Investment.query.filter_by(user_id=uid).all()
    routines = Routine.query.filter_by(user_id=uid).all()
    routine_items = RoutineItem.query.filter_by(user_id=uid).all()
    allocs = BudgetAllocation.query.filter_by(user_id=uid).all()
    fixed = FixedExpense.query.filter_by(user_id=uid).all()
    salary_cfg = SalaryConfig.query.filter_by(user_id=uid).first()
    budgets = Budget.query.filter_by(user_id=uid).all()

    data = {
        'version': 2,
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'transactions': [{'date': t.date, 'type': t.type, 'category': t.category,
                          'description': t.description, 'amount': t.amount, 'card': t.card or '',
                          'exclude_perf': bool(t.exclude_perf), 'exclude_stats': bool(t.exclude_stats),
                          'time': t.time or '', 'cashback': t.cashback or 0} for t in txs],
        'categories': [{'name': c.name, 'icon': c.icon, 'cat_type': c.cat_type, 'position': c.position,
                        'exclude_perf': bool(c.exclude_perf), 'exclude_stats': bool(c.exclude_stats)} for c in cats],
        'cards': [{'name': c.name, 'monthly_target': c.monthly_target, 'account_balance': c.account_balance or 0,
                   'balance_since': c.balance_since,
                   'cashback_type': c.cashback_type, 'cashback_rate': c.cashback_rate,
                   'tier1': c.tier1, 'tier2': c.tier2, 'tier3': c.tier3} for c in cards],
        'savings': [{'stype': s.stype, 'bank': s.bank, 'name': s.name, 'amount': s.amount,
                     'interest_rate': s.interest_rate, 'interest_type': s.interest_type,
                     'tax_type': s.tax_type, 'start_date': s.start_date, 'end_date': s.end_date} for s in savings_list],
        'investments': [{'itype': i.itype, 'name': i.name, 'ticker': i.ticker or '',
                         'quantity': i.quantity, 'avg_price': i.avg_price,
                         'account_type': i.account_type, 'memo': i.memo or ''} for i in investments],
        'routines': [{'name': r.name, 'icon': r.icon or '', 'card': r.card or '',
                      'items': [{'category': ri.category, 'cat_type': ri.cat_type, 'card': ri.card or '',
                                 'exclude_cashback': bool(ri.exclude_cashback)} for ri in routine_items if ri.routine_id == r.id]}
                     for r in routines],
        'budget_allocations': [{'category_name': a.category_name, 'percent': a.percent,
                                 'monthly_limit': a.monthly_limit} for a in allocs],
        'fixed_expenses': [{'name': f.name, 'amount': f.amount, 'day_of_month': f.day_of_month,
                             'category': f.category or '', 'auto_register': bool(f.auto_register),
                             'auto_silent': bool(getattr(f, 'auto_silent', False)),
                             'tx_type': f.tx_type or 'expense', 'tx_card': f.tx_card or ''} for f in fixed],
        'salary': {'amount': salary_cfg.amount if salary_cfg else 0,
                   'pay_day': salary_cfg.pay_day if salary_cfg else None},
        'budgets': [{'month': b.month, 'amount': b.amount} for b in budgets],
    }
    resp = jsonify(data)
    resp.headers['Content-Disposition'] = f'attachment; filename=gaegyebu_backup_{datetime.now().strftime("%Y%m%d")}.json'
    return resp

@app.route('/api/restore', methods=['POST'])
@login_required
def api_restore():
    uid = session['user_id']
    data = request.json or {}
    if data.get('version') not in (1, 2):
        return jsonify({'error': 'unsupported version'}), 400

    Transaction.query.filter_by(user_id=uid).delete()
    Category.query.filter_by(user_id=uid).delete()
    Card.query.filter_by(user_id=uid).delete()
    Savings.query.filter_by(user_id=uid).delete()
    Investment.query.filter_by(user_id=uid).delete()
    RoutineItem.query.filter_by(user_id=uid).delete()
    Routine.query.filter_by(user_id=uid).delete()
    BudgetAllocation.query.filter_by(user_id=uid).delete()
    FixedExpense.query.filter_by(user_id=uid).delete()
    SalaryConfig.query.filter_by(user_id=uid).delete()
    Budget.query.filter_by(user_id=uid).delete()

    for t in data.get('transactions', []):
        db.session.add(Transaction(user_id=uid, date=t['date'], type=t['type'], category=t['category'],
                                   description=t.get('description', ''), amount=t['amount'],
                                   card=t.get('card', ''), exclude_perf=t.get('exclude_perf', False),
                                   exclude_stats=t.get('exclude_stats', False), time=t.get('time', ''),
                                   cashback=t.get('cashback', 0)))
    for c in data.get('categories', []):
        db.session.add(Category(user_id=uid, name=c['name'], icon=c.get('icon', ''),
                                cat_type=c.get('cat_type', 'expense'), position=c.get('position', 0),
                                exclude_perf=c.get('exclude_perf', False), exclude_stats=c.get('exclude_stats', False)))
    for c in data.get('cards', []):
        db.session.add(Card(user_id=uid, name=c['name'], monthly_target=c.get('monthly_target', 0),
                            account_balance=c.get('account_balance', 0),
                            balance_since=c.get('balance_since'),
                            cashback_type=c.get('cashback_type'), cashback_rate=c.get('cashback_rate'),
                            tier1=c.get('tier1', 20), tier2=c.get('tier2', 50), tier3=c.get('tier3', 80)))
    for s in data.get('savings', []):
        db.session.add(Savings(user_id=uid, stype=s.get('stype', '예금'), bank=s.get('bank', ''),
                               name=s['name'], amount=s['amount'], interest_rate=s.get('interest_rate', 0),
                               interest_type=s.get('interest_type', '단리'), tax_type=s.get('tax_type', '일반과세'),
                               start_date=s['start_date'], end_date=s['end_date']))
    for i in data.get('investments', []):
        db.session.add(Investment(user_id=uid, itype=i.get('itype', '국내주식'), name=i['name'],
                                  ticker=i.get('ticker', ''), quantity=i.get('quantity', 0),
                                  avg_price=i.get('avg_price', 0), account_type=i.get('account_type', '일반'),
                                  memo=i.get('memo', '')))
    for r in data.get('routines', []):
        ro = Routine(user_id=uid, name=r['name'], icon=r.get('icon', ''), card=r.get('card', ''))
        db.session.add(ro)
        db.session.flush()
        for it in r.get('items', []):
            db.session.add(RoutineItem(routine_id=ro.id, user_id=uid,
                                       category=it['category'], cat_type=it.get('cat_type', 'expense'),
                                       card=it.get('card', '') or '',
                                       exclude_cashback=bool(it.get('exclude_cashback', False))))
    for a in data.get('budget_allocations', []):
        db.session.add(BudgetAllocation(user_id=uid, category_name=a['category_name'],
                                        percent=a.get('percent', 0), monthly_limit=a.get('monthly_limit')))
    for f in data.get('fixed_expenses', []):
        db.session.add(FixedExpense(user_id=uid, name=f['name'], amount=f['amount'],
                                    day_of_month=f.get('day_of_month'), category=f.get('category', ''),
                                    auto_register=f.get('auto_register', False),
                                    auto_silent=f.get('auto_silent', False),
                                    tx_type=f.get('tx_type', 'expense'), tx_card=f.get('tx_card', '')))
    sal = data.get('salary', {})
    if sal.get('amount'):
        db.session.add(SalaryConfig(user_id=uid, amount=sal['amount'], pay_day=sal.get('pay_day')))
    for b in data.get('budgets', []):
        db.session.add(Budget(user_id=uid, month=b['month'], amount=b['amount']))

    db.session.commit()
    return jsonify({'ok': True})

# ─── 카테고리별 예산 한도 저장 ────────────────────────────────────────────────
@app.route('/api/salary/allocations/limits', methods=['POST'])
@login_required
def api_budget_limits():
    uid = session['user_id']
    data = request.json or {}
    limits = data.get('limits', {})
    for cat_name, limit in limits.items():
        alloc = BudgetAllocation.query.filter_by(user_id=uid, category_name=cat_name).first()
        if alloc:
            alloc.monthly_limit = int(limit) if limit else None
            if not alloc.monthly_limit and not alloc.percent:
                db.session.delete(alloc)
        elif limit:
            db.session.add(BudgetAllocation(user_id=uid, category_name=cat_name,
                                            percent=0, monthly_limit=int(limit)))
    db.session.commit()
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(debug=True)
