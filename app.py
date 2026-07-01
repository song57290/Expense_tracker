from flask import Flask, render_template, request, redirect, url_for, send_from_directory, send_file, jsonify, abort, session
from functools import wraps
from models import db, Transaction, Budget, Category, Card, User
from datetime import datetime, timedelta
from collections import defaultdict
import openpyxl
import xlrd
from io import BytesIO
import tempfile, json, os, re, base64

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
    return jsonify({'user': {'id': user.id, 'email': user.email}})

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    if not email or not password or len(password) < 6:
        return jsonify({'error': '이메일과 비밀번호(6자 이상)를 입력하세요'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': '이미 사용 중인 이메일입니다'}), 400
    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    _seed_user_categories(user.id)
    session.permanent = True
    session['user_id'] = user.id
    return jsonify({'ok': True, 'email': user.email})

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
    return jsonify({'ok': True, 'email': user.email})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('user_id', None)
    return jsonify({'ok': True})

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
                          'description': tx.description or '', 'amount': tx.amount, 'card': tx.card or ''} for tx in transactions],
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

    return jsonify({
        'expense_cats': cat_totals(expense_txs),
        'income_cats': cat_totals(income_txs),
        'monthly': monthly,
        'emoji_map': emoji_map,
        'card_list': [c.name for c in cards],
        'card_monthly_trend': card_monthly_trend,
        'card_monthly': card_monthly,
    })

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
        total_income = sum(tx.amount for tx in card_txs if tx.type == 'income')
        total_expense = sum(tx.amount for tx in card_txs if tx.type == 'expense')
        initial_balance = card.account_balance or 0
        balance = initial_balance + total_income - total_expense
        spent = sum(tx.amount for tx in card_txs if tx.type == 'expense' and tx.date.startswith(current_month))
        percent = min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        card_stats.append({
            'id': card.id, 'name': card.name,
            'initial_balance': initial_balance, 'total_income': total_income,
            'total_expense': total_expense, 'balance': balance,
            'spent': spent, 'target': card.monthly_target, 'percent': percent,
            'tier1': card.tier1 or 20, 'tier2': card.tier2 or 50, 'tier3': card.tier3 or 80,
        })

    return jsonify({
        'budget_amount': budget.amount if budget else 0,
        'expense_total': expense_total,
        'current_month': current_month,
        'card_stats': card_stats,
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

    imported = 0
    skipped = 0
    for row in all_rows[header_row + 1:]:
        if not any(row):
            continue
        try:
            date_val = _parse_date(row[col_date]) if 0 <= col_date < len(row) else None
            if not date_val:
                skipped += 1; continue

            if col_debit >= 0 and col_credit >= 0:
                debit  = _parse_amount(row[col_debit])  if col_debit  < len(row) else None
                credit = _parse_amount(row[col_credit]) if col_credit < len(row) else None
                if debit:    tx_type, amount = 'expense', debit
                elif credit: tx_type, amount = 'income',  credit
                else:        skipped += 1; continue
            elif col_amount >= 0 and col_type >= 0:
                tx_type = _parse_type(row[col_type])
                amount  = _parse_amount(row[col_amount])
                if not tx_type or not amount:
                    skipped += 1; continue
            elif col_amount >= 0:
                amount = _parse_amount(row[col_amount])
                if not amount: skipped += 1; continue
                tx_type = 'expense'
            else:
                skipped += 1; continue

            desc_val = str(row[col_desc]).strip() if 0 <= col_desc < len(row) and row[col_desc] else ''
            cat_val  = str(row[col_cat]).strip()  if 0 <= col_cat  < len(row) and row[col_cat]  else '기타'

            db.session.add(Transaction(
                date=date_val, type=tx_type, category=cat_val,
                description=desc_val, amount=amount, card=None, user_id=uid,
            ))
            imported += 1
        except Exception:
            skipped += 1

    db.session.commit()
    return redirect(f'/?imported={imported}&skipped={skipped}')

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
    categories = Category.query.filter_by(user_id=uid).order_by(Category.id).all()
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
                        data=json.dumps({'title': '나의 가계부', 'body': '오늘 지출을 기록했나요? 📝', 'url': '/'}),
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
