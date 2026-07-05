from flask import Flask, render_template, request, redirect, url_for, send_from_directory, send_file, jsonify, abort, session
from functools import wraps
from models import db, Transaction, Budget, Category, Card, User, Savings, Investment, Notice
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import openpyxl
import xlrd
from io import BytesIO
import tempfile, json, os, re, base64, random, smtplib
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
    # seed categories for user 1 (existing data owner)
    _seed_user_categories(1)

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
    return jsonify({'user': {'id': user.id, 'email': user.email, 'nickname': user.nickname}})

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
    session.permanent = True
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
    session.permanent = True
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

# ── Savings helper ───────────────────────────────────────────────────────────

def _savings_stats(s):
    from datetime import date as _date
    today = _date.today()
    try:
        start = datetime.strptime(s.start_date, '%Y-%m-%d').date()
        end = datetime.strptime(s.end_date, '%Y-%m-%d').date()
    except Exception:
        start = today; end = today
    months_total = max(1, (end.year - start.year) * 12 + (end.month - start.month))
    months_elapsed = max(0, min(months_total, (today.year - start.year) * 12 + (today.month - start.month)))
    progress = min(100, int(months_elapsed / months_total * 100))
    d_day = (end - today).days
    rate = s.interest_rate or 0
    itype = getattr(s, 'interest_type', '단리') or '단리'
    if s.stype == '예금':
        total_paid = s.amount
        current_paid = s.amount
        years = months_total / 12
        if itype == '복리':
            maturity_amount = int(s.amount * (1 + rate / 100) ** years)
        else:
            maturity_amount = int(s.amount * (1 + rate / 100 * years))
        interest = maturity_amount - s.amount
    else:
        total_paid = s.amount * months_total
        current_paid = s.amount * months_elapsed
        n = months_total
        r_m = rate / 100 / 12
        if itype == '복리' and r_m > 0:
            maturity_amount = int(s.amount * (1 + r_m) * ((1 + r_m) ** n - 1) / r_m)
        else:
            maturity_amount = int(total_paid + s.amount * n * (n + 1) / 2 * r_m)
        interest = maturity_amount - total_paid
    return {
        'id': s.id, 'stype': s.stype, 'bank': s.bank, 'name': s.name,
        'amount': s.amount, 'interest_rate': rate, 'interest_type': itype,
        'start_date': s.start_date, 'end_date': s.end_date,
        'months_total': months_total, 'months_elapsed': months_elapsed,
        'progress': progress, 'd_day': d_day,
        'total_paid': total_paid, 'current_paid': current_paid,
        'interest': interest, 'maturity_amount': maturity_amount,
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

def _auto_fetch_investment_prices(inv_list):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from datetime import date, timedelta
    import FinanceDataReader as fdr

    todo = [inv for inv in inv_list if _needs_price_update(inv) and (inv.ticker or '').strip()]
    if not todo:
        return

    start = (date.today() - timedelta(days=7)).strftime('%Y-%m-%d')

    usd_krw = 1380
    try:
        fx = fdr.DataReader('USD/KRW', start)
        if not fx.empty:
            usd_krw = float(fx['Close'].iloc[-1])
    except Exception:
        pass

    def fetch_price(inv):
        try:
            market = _inv_market(inv)
            t = (inv.ticker or '').strip()
            if market == 'KR':
                t_clean = t.replace('.KS', '').replace('.KQ', '')
                df = fdr.DataReader(t_clean, start)
            elif market == 'US':
                df = fdr.DataReader(t, start)
            else:
                return inv.id, None
            if df.empty:
                return inv.id, None
            price = float(df['Close'].iloc[-1])
            if market == 'US':
                price = price * usd_krw
            return inv.id, price
        except Exception:
            return inv.id, None

    id_map = {inv.id: inv for inv in todo}
    with ThreadPoolExecutor(max_workers=min(3, len(todo))) as ex:
        futures = {ex.submit(fetch_price, inv): inv.id for inv in todo}
        results = {}
        for f in as_completed(futures):
            inv_id, price = f.result()
            results[inv_id] = price

    changed = False
    for inv_id, price in results.items():
        if price is not None:
            id_map[inv_id].current_price = price
            id_map[inv_id].price_updated_at = datetime.utcnow()
            changed = True
    if changed:
        db.session.commit()

def _investment_stats(inv):
    qty = inv.quantity or 0
    avg = inv.avg_price or 0
    cur = inv.current_price if inv.current_price is not None else avg
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
        'purchase_value': purchase_value, 'current_value': current_value,
        'profit': profit, 'profit_pct': profit_pct,
        'memo': inv.memo or '',
        'price_updated_at': updated_at,
    }

# ── JSON API routes ───────────────────────────────────────────────────────────

@app.route('/api/home')
@login_required
def api_home():
    uid = session['user_id']
    current_month = datetime.now().strftime('%Y-%m')
    transactions = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.desc()).all()
    month_txs = [tx for tx in transactions if tx.date.startswith(current_month)]

    income_total = sum(tx.amount for tx in month_txs if tx.type == 'income')
    expense_total = sum(tx.amount for tx in month_txs if tx.type == 'expense')

    budget = Budget.query.filter_by(month=current_month, user_id=uid).first()
    budget_amount = budget.amount if budget else 0

    cards = Card.query.filter_by(user_id=uid).all()
    card_stats = []
    for card in cards:
        spent = sum(tx.amount for tx in month_txs if tx.type == 'expense' and tx.card == card.name)
        card_stats.append({
            'name': card.name,
            'target': card.monthly_target,
            'spent': spent,
            'percent': min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0,
            'tier1': card.tier1 or 20, 'tier2': card.tier2 or 50, 'tier3': card.tier3 or 80,
        })

    expense_cats = Category.query.filter_by(user_id=uid, cat_type='expense').order_by(Category.position, Category.id).all()
    income_cats = Category.query.filter_by(user_id=uid, cat_type='income').order_by(Category.position, Category.id).all()
    emoji_map = {c.name: c.icon for c in expense_cats + income_cats}

    category_totals = defaultdict(int)
    for tx in month_txs:
        if tx.type == 'expense':
            category_totals[tx.category] += tx.amount
    category_totals = dict(sorted(category_totals.items(), key=lambda x: x[1], reverse=True))

    return jsonify({
        'transactions': [{'id': tx.id, 'date': tx.date, 'type': tx.type, 'category': tx.category,
                          'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or ''} for tx in month_txs],
        'income_total': income_total,
        'expense_total': expense_total,
        'balance': income_total - expense_total,
        'budget_amount': budget_amount,
        'remaining': budget_amount - expense_total,
        'card_stats': card_stats,
        'card_list': [{'id': c.id, 'name': c.name} for c in cards],
        'expense_cats': [[c.name, c.icon] for c in expense_cats],
        'income_cats': [[c.name, c.icon] for c in income_cats],
        'emoji_map': emoji_map,
        'category_totals': category_totals,
    })

@app.route('/api/transactions', methods=['POST'])
@login_required
def api_add_transaction():
    uid = session['user_id']
    data = request.json or {}
    tx = Transaction(
        date=data['date'], type=data['type'], category=data['category'],
        description=data.get('description', ''), amount=int(data['amount']),
        card=data.get('card') or None,
        user_id=uid,
    )
    db.session.add(tx)
    db.session.commit()
    return jsonify({'ok': True, 'id': tx.id})

@app.route('/api/transactions/<int:tx_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_transaction(tx_id):
    uid = session['user_id']
    tx = Transaction.query.filter_by(id=tx_id, user_id=uid).first_or_404()
    if request.method == 'DELETE':
        db.session.delete(tx)
        db.session.commit()
        return jsonify({'ok': True})
    if request.method == 'PUT':
        data = request.json or {}
        tx.date = data.get('date', tx.date)
        tx.type = data.get('type', tx.type)
        tx.category = data.get('category', tx.category)
        tx.description = data.get('description', tx.description)
        tx.amount = int(data.get('amount', tx.amount))
        tx.card = data.get('card') or None
        db.session.commit()
        return jsonify({'ok': True})
    expense_cats = Category.query.filter_by(user_id=uid, cat_type='expense').order_by(Category.position, Category.id).all()
    income_cats = Category.query.filter_by(user_id=uid, cat_type='income').order_by(Category.position, Category.id).all()
    return jsonify({
        'transaction': {'id': tx.id, 'date': tx.date, 'type': tx.type, 'category': tx.category,
                        'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or ''},
        'expense_cats': [[c.name, c.icon] for c in expense_cats],
        'income_cats': [[c.name, c.icon] for c in income_cats],
        'card_list': [{'id': c.id, 'name': c.name} for c in Card.query.filter_by(user_id=uid).all()],
    })

@app.route('/api/cards', methods=['GET', 'POST'])
@login_required
def api_cards():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        db.session.add(Card(
            name=data['name'], monthly_target=int(data.get('target', 0)),
            tier1=int(data.get('tier1', 20)), tier2=int(data.get('tier2', 50)), tier3=int(data.get('tier3', 80)),
            account_balance=int(data.get('account_balance', 0)),
            url=data.get('url') or None,
            user_id=uid,
        ))
        db.session.commit()
        return jsonify({'ok': True})
    current_month = datetime.now().strftime('%Y-%m')
    month_txs = Transaction.query.filter_by(user_id=uid).filter(Transaction.date.like(f'{current_month}%')).all()
    cards = Card.query.filter_by(user_id=uid).all()
    stats = {}
    for card in cards:
        spent = sum(tx.amount for tx in month_txs if tx.type == 'expense' and tx.card == card.name)
        stats[card.id] = {
            'spent': spent,
            'percent': min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0,
        }
    return jsonify({
        'cards': [{'id': c.id, 'name': c.name, 'target': c.monthly_target, 'url': c.url or '',
                   'tier1': c.tier1 or 20, 'tier2': c.tier2 or 50, 'tier3': c.tier3 or 80} for c in cards],
        'stats': stats,
    })

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
    if 'url' in data:
        card.url = data['url'] or None
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/calendar')
@login_required
def api_calendar():
    uid = session['user_id']
    now = datetime.now()
    month = request.args.get('month', now.strftime('%Y-%m'))
    transactions = Transaction.query.filter_by(user_id=uid).filter(Transaction.date.like(f'{month}%')).all()

    cats = Category.query.filter_by(user_id=uid).order_by(Category.position, Category.id).all()
    emoji_map = {c.name: c.icon for c in cats}

    day_totals = defaultdict(lambda: {'expense': 0, 'income': 0})
    day_transactions = defaultdict(list)
    for tx in transactions:
        day_totals[tx.date][tx.type] += tx.amount
        day_transactions[tx.date].append({
            'id': tx.id, 'type': tx.type, 'category': tx.category,
            'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or '',
        })

    return jsonify({
        'day_totals': {k: dict(v) for k, v in day_totals.items()},
        'day_transactions': dict(day_transactions),
        'income_total': sum(tx.amount for tx in transactions if tx.type == 'income'),
        'expense_total': sum(tx.amount for tx in transactions if tx.type == 'expense'),
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

    expense_txs = Transaction.query.filter_by(user_id=uid).filter(
        Transaction.type == 'expense', Transaction.date.like(f'{month}%')).all()
    income_txs = Transaction.query.filter_by(user_id=uid).filter(
        Transaction.type == 'income', Transaction.date.like(f'{month}%')).all()

    def cat_totals(txs):
        totals = defaultdict(int)
        for tx in txs:
            totals[tx.category] += tx.amount
        return sorted([{'name': k, 'amount': v, 'icon': icon_map.get(k, '📦')} for k, v in totals.items()], key=lambda x: x['amount'], reverse=True)

    six_months = []
    for i in range(5, -1, -1):
        m = now.month - i; y = now.year
        while m <= 0: m += 12; y -= 1
        six_months.append(f'{y}-{m:02d}')

    monthly = []
    for mo in six_months:
        e = Transaction.query.filter_by(user_id=uid).filter(
            Transaction.type == 'expense', Transaction.date.like(f'{mo}%')).all()
        inc = Transaction.query.filter_by(user_id=uid).filter(
            Transaction.type == 'income', Transaction.date.like(f'{mo}%')).all()
        monthly.append({'month': mo, 'expense': sum(t.amount for t in e), 'income': sum(t.amount for t in inc)})

    cards = Card.query.filter_by(user_id=uid).all()
    card_monthly_trend = {}
    for card in cards:
        trend = []
        for mo in six_months:
            amt = sum(
                tx.amount for tx in Transaction.query.filter_by(user_id=uid).filter(
                    Transaction.type == 'expense',
                    Transaction.date.like(f'{mo}%'),
                    Transaction.card == card.name,
                ).all()
            )
            trend.append(amt)
        card_monthly_trend[card.name] = trend

    card_monthly = []
    for card in cards:
        spent = sum(tx.amount for tx in expense_txs if tx.card == card.name)
        if spent > 0:
            card_monthly.append({'name': card.name, 'spent': spent})
    card_monthly.sort(key=lambda x: x['spent'], reverse=True)

    # 총 자산 추이 (기간 선택 가능, 최대 6개월)
    import calendar as _cal
    from datetime import date as _date
    all_txs_ever = Transaction.query.filter_by(user_id=uid).all()
    savings_list = Savings.query.filter_by(user_id=uid).all()

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

    card_initial = sum(c.account_balance or 0 for c in cards)
    asset_trend = []
    cy, cm = tf_y, tf_m
    while (cy, cm) <= (tt_y, tt_m):
        last_day = _cal.monthrange(cy, cm)[1]
        mo_end = f'{cy}-{cm:02d}-{last_day:02d}'
        inc = sum(tx.amount for tx in all_txs_ever if tx.type == 'income' and tx.date <= mo_end)
        exp = sum(tx.amount for tx in all_txs_ever if tx.type == 'expense' and tx.date <= mo_end)
        card_bal = card_initial + inc - exp
        sav_bal = 0
        mo_end_date = _date(cy, cm, last_day)
        for s in savings_list:
            if s.start_date > mo_end: continue
            start = datetime.strptime(s.start_date, '%Y-%m-%d').date()
            end_d = datetime.strptime(s.end_date, '%Y-%m-%d').date()
            if s.stype == '예금':
                sav_bal += s.amount
            else:
                mt = max(1, (end_d.year - start.year) * 12 + (end_d.month - start.month))
                me = max(0, min(mt, (mo_end_date.year - start.year) * 12 + (mo_end_date.month - start.month)))
                sav_bal += s.amount * me
        asset_trend.append({'month': f'{cy}-{cm:02d}', 'assets': card_bal + sav_bal})
        cm += 1
        if cm > 12: cm = 1; cy += 1

    # 포트폴리오 구성 비율
    inv_list = Investment.query.filter_by(user_id=uid).all()
    total_inc_ever = sum(tx.amount for tx in all_txs_ever if tx.type == 'income')
    total_exp_ever = sum(tx.amount for tx in all_txs_ever if tx.type == 'expense')
    card_balance_now = sum(c.account_balance or 0 for c in cards) + total_inc_ever - total_exp_ever
    deposit_total = sum(s.amount for s in savings_list if s.stype == '예금')
    installment_total = sum(_savings_stats(s)['current_paid'] for s in savings_list if s.stype == '적금')
    inv_by_type = {}
    for inv in inv_list:
        val = int((inv.quantity or 0) * ((inv.current_price if inv.current_price is not None else inv.avg_price) or 0))
        inv_by_type[inv.itype] = inv_by_type.get(inv.itype, 0) + val
    portfolio_breakdown = []
    if card_balance_now > 0:
        portfolio_breakdown.append({'label': '카드잔고', 'value': card_balance_now})
    if deposit_total > 0:
        portfolio_breakdown.append({'label': '예금', 'value': deposit_total})
    if installment_total > 0:
        portfolio_breakdown.append({'label': '적금', 'value': installment_total})
    for k, v in inv_by_type.items():
        if v > 0:
            portfolio_breakdown.append({'label': k, 'value': v})

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

    card_stats = []
    for card in cards:
        card_txs = [tx for tx in all_txs if tx.card == card.name]
        c_inc = sum(tx.amount for tx in card_txs if tx.type == 'income')
        c_exp = sum(tx.amount for tx in card_txs if tx.type == 'expense')
        initial = card.account_balance or 0
        balance = initial + c_inc - c_exp
        spent = sum(tx.amount for tx in card_txs if tx.type == 'expense' and tx.date.startswith(current_month))
        percent = min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        card_stats.append({'name': card.name, 'initial_balance': initial, 'balance': balance,
                           'spent': spent, 'target': card.monthly_target, 'percent': percent})

    sav_stats = [_savings_stats(s) for s in savings_list]
    net_worth = sum(c['balance'] for c in card_stats) + sum(s['current_paid'] for s in sav_stats)

    investments = []
    for inv in inv_list:
        avg = inv.avg_price or 0
        cur = inv.current_price if inv.current_price is not None else avg
        qty = inv.quantity or 0
        val = int(qty * (cur or 0))
        gain = val - int(qty * avg)
        investments.append({'itype': inv.itype, 'name': inv.name, 'ticker': inv.ticker or '',
                            'quantity': qty, 'avg_price': avg, 'current_price': cur or 0,
                            'value': val, 'gain': gain})
    inv_total = sum(i['value'] for i in investments)
    inv_gain_total = sum(i['gain'] for i in investments)
    inv_cost_total = sum(int(i['quantity'] * i['avg_price']) for i in investments)
    inv_return_rate = round(inv_gain_total / inv_cost_total * 100, 2) if inv_cost_total else 0

    card_bal_total = sum(c['balance'] for c in card_stats)
    deposit_total = sum(s['amount'] for s in sav_stats if s['stype'] == '예금')
    install_total = sum(s['current_paid'] for s in sav_stats if s['stype'] == '적금')
    portfolio = []
    if card_bal_total > 0: portfolio.append(('카드잔고', card_bal_total))
    if deposit_total > 0: portfolio.append(('예금', deposit_total))
    if install_total > 0: portfolio.append(('적금', install_total))
    inv_by_type = {}
    for inv in investments:
        inv_by_type[inv['itype']] = inv_by_type.get(inv['itype'], 0) + inv['value']
    for k, v in inv_by_type.items():
        if v > 0: portfolio.append((k, v))
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
            if s.start_date > mo_end: continue
            start_d = datetime.strptime(s.start_date, '%Y-%m-%d').date()
            end_d = datetime.strptime(s.end_date, '%Y-%m-%d').date()
            if s.stype == '예금':
                sav_bal += s.amount
            else:
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
        diff = (_date(*map(int, end_str.split('-'))) - today).days
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
                f'<div class="ic"><div class="l">달성률</div><div class="v" style="color:#ffc107">{c["percent"]}%</div></div>'
                '</div>'
                '<div style="margin-top:4px">'
                f'<div class="pb"><div class="pf" style="width:{pct_cap}%;background:#ffc107"></div></div>'
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

    cards_html = ''.join(card_panel(c) for c in card_stats) if card_stats else '<div class="empty">등록된 카드/계좌가 없습니다</div>'
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
        gc = '#dc3545' if i['gain'] >= 0 else '#0d6efd'
        gs = '+' if i['gain'] >= 0 else ''
        cost = int(i['quantity'] * i['avg_price'])
        gp = (i['gain'] / cost * 100) if cost else 0
        ticker_str = f' ({i["ticker"]})' if i['ticker'] else ''
        return (
            '<tr>'
            f'<td><span class="badge bj">{i["itype"]}</span></td>'
            f'<td>{i["name"]}{ticker_str}</td>'
            f'<td style="text-align:right">{i["quantity"]:g}주</td>'
            f'<td style="text-align:right">{fmt(i["avg_price"])}원</td>'
            f'<td style="text-align:right">{fmt(i["current_price"])}원</td>'
            f'<td style="text-align:right;font-weight:700">{fmt(i["value"])}원</td>'
            f'<td style="text-align:right;color:{gc}">{gs}{fmt(i["gain"])}원<br><span style="font-size:11px">({gs}{gp:.1f}%)</span></td>'
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

    txs_html = (
        '<table><thead><tr><th>날짜</th><th>유형</th><th>카테고리</th><th>설명</th><th>카드/계좌</th>'
        '<th style="text-align:right">금액</th></tr></thead>'
        '<tbody>' + ''.join(tx_row(tx) for tx in all_txs) + '</tbody></table>'
    ) if all_txs else '<div class="empty">거래 내역이 없습니다</div>'

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
.ci{color:#198754}.ce{color:#dc3545}.cb{color:#0d6efd}.cn{color:#333}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
thead th{background:#f8f5ff;color:#555;font-weight:700;padding:8px 10px;text-align:left;border-bottom:2px solid #e8d5ff}
tbody td{padding:8px 10px;border-bottom:1px solid #f5f5f5;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.be{background:#ffe0e0;color:#dc3545}.bi{background:#d4edda;color:#198754}
.by{background:#e8f4fd;color:#0d6efd}.bj{background:#f0e8fd;color:#b088f9}
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
  <div class="meta">계정: {name_display} &nbsp;|&nbsp; 추출일: {date_str}</div>
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
  <h2>거래 내역 (총 {len(all_txs)}건)</h2>
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
    current_month = datetime.now().strftime('%Y-%m')
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
    budget = Budget.query.filter_by(month=current_month, user_id=uid).first()
    all_txs = Transaction.query.filter_by(user_id=uid).all()
    expense_total = sum(tx.amount for tx in all_txs if tx.type == 'expense' and tx.date.startswith(current_month))

    cards = Card.query.filter_by(user_id=uid).all()
    card_stats = []
    for card in cards:
        card_txs = [tx for tx in all_txs if tx.card == card.name]
        month_income = sum(tx.amount for tx in card_txs if tx.type == 'income' and tx.date.startswith(current_month))
        month_expense = sum(tx.amount for tx in card_txs if tx.type == 'expense' and tx.date.startswith(current_month))
        initial_balance = card.account_balance or 0
        balance = initial_balance + month_income - month_expense
        percent = min(int(month_expense / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        card_stats.append({
            'id': card.id, 'name': card.name,
            'initial_balance': initial_balance, 'total_income': month_income,
            'total_expense': month_expense, 'balance': balance,
            'spent': month_expense, 'target': card.monthly_target, 'percent': percent,
            'tier1': card.tier1 or 20, 'tier2': card.tier2 or 50, 'tier3': card.tier3 or 80,
            'url': card.url or '',
        })

    savings = Savings.query.filter_by(user_id=uid).all()
    investments = Investment.query.filter_by(user_id=uid).all()
    _auto_fetch_investment_prices(investments)
    return jsonify({
        'budget_amount': budget.amount if budget else 0,
        'expense_total': expense_total,
        'current_month': current_month,
        'card_stats': card_stats,
        'savings': [_savings_stats(s) for s in savings],
        'investments': [_investment_stats(i) for i in investments],
    })

@app.route('/api/savings', methods=['GET', 'POST'])
@login_required
def api_savings():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        db.session.add(Savings(
            user_id=uid,
            stype=data.get('stype', '예금'),
            bank=data.get('bank', ''),
            name=data['name'],
            amount=int(data.get('amount', 0)),
            interest_rate=float(data.get('interest_rate', 0)),
            interest_type=data.get('interest_type', '단리'),
            start_date=data['start_date'],
            end_date=data['end_date'],
        ))
        db.session.commit()
        return jsonify({'ok': True})
    items = Savings.query.filter_by(user_id=uid).all()
    return jsonify({'savings': [_savings_stats(s) for s in items]})

@app.route('/api/savings/<int:sid>', methods=['PUT', 'DELETE'])
@login_required
def api_saving(sid):
    uid = session['user_id']
    s = Savings.query.filter_by(id=sid, user_id=uid).first_or_404()
    if request.method == 'DELETE':
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
    s.start_date = data.get('start_date', s.start_date)
    s.end_date = data.get('end_date', s.end_date)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/investments', methods=['GET', 'POST'])
@login_required
def api_investments():
    uid = session['user_id']
    if request.method == 'POST':
        data = request.json or {}
        inv = Investment(
            user_id=uid,
            itype=data.get('itype', '국내주식'),
            name=data.get('name', ''),
            ticker=data.get('ticker', ''),
            quantity=float(data.get('quantity', 0)),
            avg_price=float(data.get('avg_price', 0)),
            current_price=float(data['current_price']) if data.get('current_price') not in (None, '') else None,
            memo=data.get('memo', ''),
        )
        db.session.add(inv)
        db.session.commit()
        return jsonify({'ok': True})
    items = Investment.query.filter_by(user_id=uid).all()
    return jsonify({'investments': [_investment_stats(i) for i in items]})

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
    inv.memo = data.get('memo', inv.memo)
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
        if not title or not content:
            return jsonify({'ok': False, 'error': '제목과 내용을 입력하세요'}), 400
        db.session.add(Notice(user_id=uid, title=title, content=content, created_at=datetime.now()))
        db.session.commit()
        return jsonify({'ok': True})
    notices = Notice.query.order_by(Notice.created_at.desc()).all()
    return jsonify([{
        'id': n.id, 'title': n.title, 'content': n.content,
        'created_at': n.created_at.strftime('%Y.%m.%d'),
        'is_admin': is_admin,
    } for n in notices])

@app.route('/api/notices/<int:nid>', methods=['DELETE'])
@login_required
def api_notice(nid):
    uid = session['user_id']
    u = User.query.get(uid)
    if not u or u.email != ADMIN_EMAIL:
        return jsonify({'ok': False, 'error': '권한이 없습니다'}), 403
    n = Notice.query.get_or_404(nid)
    db.session.delete(n)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/portfolio')
@login_required
def api_portfolio():
    uid = session['user_id']
    user = User.query.get(uid)
    current_month = datetime.now().strftime('%Y-%m')
    transactions = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.desc()).all()
    month_txs = [tx for tx in transactions if tx.date.startswith(current_month)]
    income_total = sum(tx.amount for tx in month_txs if tx.type == 'income')
    expense_total = sum(tx.amount for tx in month_txs if tx.type == 'expense')
    cards = Card.query.filter_by(user_id=uid).all()
    card_stats = []
    for card in cards:
        card_txs = [tx for tx in transactions if tx.card == card.name]
        total_income = sum(tx.amount for tx in card_txs if tx.type == 'income')
        total_expense = sum(tx.amount for tx in card_txs if tx.type == 'expense')
        initial = card.account_balance or 0
        balance = initial + total_income - total_expense
        spent = sum(tx.amount for tx in card_txs if tx.type == 'expense' and tx.date.startswith(current_month))
        percent = min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        card_stats.append({'name': card.name, 'initial_balance': initial, 'total_income': total_income,
                           'total_expense': total_expense, 'balance': balance,
                           'spent': spent, 'target': card.monthly_target, 'percent': percent})
    savings_list = Savings.query.filter_by(user_id=uid).all()
    savings_stats = [_savings_stats(s) for s in savings_list]
    inv_list = Investment.query.filter_by(user_id=uid).all()
    budget = Budget.query.filter_by(month=current_month, user_id=uid).first()
    net_worth = sum(c['balance'] for c in card_stats) + sum(s['current_paid'] for s in savings_stats)
    investments = []
    for inv in inv_list:
        avg = inv.avg_price or 0
        cur = inv.current_price if inv.current_price is not None else avg
        qty = inv.quantity or 0
        val = int(qty * (cur or 0))
        gain = val - int(qty * avg)
        investments.append({
            'id': inv.id, 'itype': inv.itype, 'name': inv.name, 'ticker': inv.ticker or '',
            'quantity': qty, 'avg_price': avg, 'current_price': cur or 0,
            'value': val, 'gain': gain, 'memo': inv.memo or '',
        })
    inv_total = sum(i['value'] for i in investments)
    inv_gain_total = sum(i['gain'] for i in investments)
    inv_cost_total = sum(int(i['quantity'] * i['avg_price']) for i in investments)
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
            'total_principal': sum(s['amount'] for s in savings_stats),
            'total_interest': sum(s['interest'] for s in savings_stats),
            'total_maturity': sum(s['maturity_amount'] for s in savings_stats),
        },
        'investments': investments,
        'investments_summary': {'total_value': inv_total, 'total_gain': inv_gain_total, 'count': len(investments), 'return_rate': inv_return_rate},
        'budget': budget.amount if budget else 0,
        'transactions': [{'date': tx.date, 'type': tx.type, 'category': tx.category,
                          'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or ''}
                         for tx in transactions],
    })

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
        'expense': [{'id': c.id, 'name': c.name, 'icon': c.icon, 'type': c.cat_type} for c in expense],
        'income': [{'id': c.id, 'name': c.name, 'icon': c.icon, 'type': c.cat_type} for c in income],
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
    db.session.commit()
    return jsonify({'ok': True})

# ── SPA entry point ───────────────────────────────────────────────────────────

_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist')
_DIST_INDEX = os.path.join(_DIST_DIR, 'index.html')

@app.route('/assets/<path:filename>')
def serve_dist_assets(filename):
    return send_from_directory(os.path.join(_DIST_DIR, 'assets'), filename)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    if os.path.exists(_DIST_INDEX):
        return send_file(_DIST_INDEX)
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
    for i, row in enumerate(data['rows']):
        cat = request.form.get(f'cat_{i}', '기타').strip() or '기타'
        card_val = request.form.get(f'card_{i}', '').strip() or None
        db.session.add(Transaction(
            date=row['date'], type=row['type'], category=cat,
            description=row['description'], amount=row['amount'],
            card=card_val, user_id=uid,
        ))
        imported += 1

    db.session.commit()
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
        year = datetime.now().year
        date_val = f"{year}-{int(d.group(1)):02d}-{int(d.group(2)):02d}" if d else datetime.now().strftime('%Y-%m-%d')

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

    dates  = request.form.getlist('date')
    types  = request.form.getlist('type')
    descs  = request.form.getlist('description')
    amts   = request.form.getlist('amount')
    cats   = request.form.getlist('category')
    cardss = request.form.getlist('card')
    checks = set(request.form.getlist('include'))

    imported = 0
    for i in range(len(dates)):
        if str(i) not in checks:
            continue
        try:
            amount = int(str(amts[i]).replace(',', ''))
            db.session.add(Transaction(
                date=dates[i], type=types[i], category=cats[i],
                description=descs[i], amount=amount,
                card=cardss[i] if cardss[i] else None,
                user_id=uid,
            ))
            imported += 1
        except Exception:
            pass

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

def _get_vapid_keys():
    if os.path.exists(VAPID_PRIVATE_FILE) and os.path.exists(VAPID_PUBLIC_FILE):
        try:
            from cryptography.hazmat.primitives.serialization import load_pem_private_key
            with open(VAPID_PRIVATE_FILE, 'rb') as f:
                load_pem_private_key(f.read(), password=None)
            with open(VAPID_PUBLIC_FILE) as f:
                pub = f.read().strip()
            return {'private': VAPID_PRIVATE_FILE, 'public': pub}
        except Exception:
            for p in [VAPID_PRIVATE_FILE, VAPID_PUBLIC_FILE]:
                if os.path.exists(p): os.remove(p)
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        pk = ec.generate_private_key(ec.SECP256R1())
        pem = pk.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
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
    subs = [s for s in _load_subs() if s.get('endpoint') != data.get('endpoint')]
    subs.append(data)
    _save_subs(subs)
    return {'ok': True}

@app.route('/api/unsubscribe', methods=['POST'])
def push_unsubscribe():
    data = request.json or {}
    _save_subs([s for s in _load_subs() if s.get('endpoint') != data.get('endpoint')])
    return {'ok': True}

def _send_push_notifications():
    try:
        from pywebpush import webpush
        from datetime import timezone, timedelta
        KST = timezone(timedelta(hours=9))
        now = datetime.now(KST)
        priv = vapid_keys.get('private', '')
        if not priv or not os.path.exists(priv):
            return
        for sub in _load_subs():
            if now.hour == sub.get('notify_hour', 21) and now.minute == sub.get('notify_minute', 0):
                try:
                    webpush(
                        subscription_info={'endpoint': sub['endpoint'], 'keys': sub['keys']},
                        data=json.dumps({'title': '💰 나의 가계부', 'body': '오늘 지출을 기록했나요? 📝', 'url': '/'}),
                        vapid_private_key=priv,
                        vapid_claims={'sub': 'mailto:song57290@gmail.com'}
                    )
                except Exception as e:
                    app.logger.error('Push failed: %s', e)
    except ImportError:
        pass

if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        import atexit
        _scheduler = BackgroundScheduler()
        _scheduler.add_job(_send_push_notifications, 'cron', minute='*')
        _scheduler.start()
        atexit.register(lambda: _scheduler.shutdown(wait=False))
    except ImportError:
        pass

if __name__ == '__main__':
    app.run(debug=True)
