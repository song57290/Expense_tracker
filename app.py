from flask import Flask, render_template, request, redirect, url_for, send_from_directory
from models import db, Transaction, Budget
from datetime import datetime
from collections import defaultdict
from models import db, Transaction, Budget, Category, Card

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expense.db' # DB 파일 위치
db.init_app(app)

@app.template_filter('bank_logo')
def bank_logo_filter(card_name):
    mappings = [
        ('신한', '/static/cards/sinhanbank.png'),
        ('KB', '/static/cards/kbbank.png'),
        ('국민', '/static/cards/kbbank.png'),
        ('농협', '/static/cards/nhbank.png'),
        ('NH', '/static/cards/nhbank.png'),
        ('하나', '/static/cards/hanabank.png'),
        ('우리', '/static/cards/wooribank.png'),
        ('기업', '/static/cards/ibkbank.png'),
        ('IBK', '/static/cards/ibkbank.png'),
        ('카카오', '/static/cards/kakaobank.png'),
        ('토스', '/static/cards/tossbank.png'),
        ('케이뱅크', '/static/cards/kbank.png'),
        ('K뱅크', '/static/cards/kbank.png'),
        ('SC', '/static/cards/scbank.png'),
        ('제일', '/static/cards/scbank.png'),
        ('씨티', '/static/cards/citibank.png'),
        ('citi', '/static/cards/citibank.png'),
        ('IM', '/static/cards/imbank.png'),
        ('iM', '/static/cards/imbank.png'),
        ('수협', '/static/cards/suhyupbank.png'),
        ('KDB', '/static/cards/kdbbank.png'),
        ('산업', '/static/cards/kdbbank.png'),
        ('BNK', '/static/cards/bnkbank.png'),
        ('부산', '/static/cards/bnkbank.png'),
        ('우체국', '/static/cards/epostbank.png'),
        ('SBI', '/static/cards/sbibank.png'),
        ('신협', '/static/cards/cubank.png'),
        ('BC', '/static/banks/bccard.png'),
        ('현대', '/static/banks/hyundaicard.png'),
        ('롯데', '/static/banks/lottecard.png'),
        ('삼성', '/static/banks/samsungcard.png'),
    ]
    for keyword, path in mappings:
        if keyword in card_name:
            return path
    return None

with app.app_context():
    db.create_all()
    if not Category.query.first():
        for name, icon in [('식사','🍚'),('간식','🍪'),('쇼핑','🛍️'),('자동차','🚗'),('교통','🚌'),('의료','💊'),('기타','📦')]:
            db.session.add(Category(name=name, icon=icon))
        db.session.commit()

# 메인 페이지 - DB에서 전체 내역 조회 후 합계 계산해서 화면에 표시
@app.route('/') # 이 URL로 접속하면 아래의 함수를 실행
def index():
    transactions = Transaction.query.order_by(Transaction.date.desc()).all() # DB에서 전체 내역을 최신순(날짜)으로 가져옴

    income_total = sum(tx.amount for tx in transactions if tx.type == 'income')
    expense_total = sum(tx.amount for tx in transactions if tx.type == 'expense')
    balance = income_total - expense_total # 가져온 내역에서 수입/지출 합계와 잔액 계산

    current_month = datetime.now().strftime('%Y-%m')
    budget = Budget.query.filter_by(month = current_month).first()
    budget_amount = budget.amount if budget else 0
    remaining = budget_amount - expense_total

    # 카드 실적 데이터 계산
    cards = Card.query.all()
    card_stats = []
    for card in cards:
        spent = sum(tx.amount for tx in transactions 
                    if tx.type == 'expense' and tx.card == card.name)
        card_stats.append({
            'name': card.name,
            'target': card.monthly_target,
            'spent': spent,
            'percent': min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        })

    categories = Category.query.order_by(Category.id).all()
    return render_template('index.html',
                        transactions=transactions,
                        income_total=income_total,
                        expense_total=expense_total,
                        balance=balance,
                        budget_amount=budget_amount,
                        remaining=remaining,
                        card_stats=card_stats,
                        card_list=cards,
                        categories=categories,
                        )

# 내역 추가 - 폼에서 입력한 데이터를 받아서 DB에 저장
@app.route('/add', methods=['POST'])
def add():
    tx = Transaction(
        date=request.form['date'], # 폼에서 입력한 값을 꺼내서
        type=request.form['type'],
        category=request.form['category'],
        description=request.form['description'],
        amount=int(request.form['amount']),
        card=request.form.get('card') or None, # 카드 선택 안 하면 None
    )
    db.session.add(tx) # DB에 추가 예약
    db.session.commit() # 실제로 DB에 저장
    next_url = request.form.get('next', url_for('index'))
    return redirect(next_url)

# 내역 삭제 - URL의 id로 해당 내역을 찾아서 DB에서 삭제
@app.route('/delete/<int:tx_id>', methods=['POST'])
def delete(tx_id):
    tx = Transaction.query.get_or_404(tx_id)
    db.session.delete(tx)
    db.session.commit()
    return redirect(url_for('index'))

# 내역 수정 - GET이면 수정 폼 표시, POST면 DB에 저장
@app.route('/edit/<int:tx_id>', methods=['GET', 'POST'])
def edit(tx_id):
    tx = Transaction.query.get_or_404(tx_id)
    if request.method == 'POST':
        tx.date = request.form['date']
        tx.type = request.form['type']
        tx.category = request.form['category']
        tx.description = request.form['description']
        tx.amount = int(request.form['amount'])
        tx.card = request.form.get('card') or None
        db.session.commit()
        return redirect(url_for('index'))
    card_list = Card.query.all()
    categories = Category.query.order_by(Category.id).all()
    return render_template('edit.html', tx=tx, card_list=card_list, categories=categories)

# 예산 설정 - GET이면 설정 페이지, POST면 DB에 저장
@app.route('/budget', methods=['GET', 'POST'])
def budget():
    current_month = datetime.now().strftime('%Y-%m')
    if request.method == 'POST':
        existing = Budget.query.filter_by(month=current_month).first()
        if existing:
            existing.amount = int(request.form['amount'])
        else:
            db.session.add(Budget(month=current_month, amount=int(request.form['amount'])))
        db.session.commit()
        return redirect(url_for('index'))
    current_budget = Budget.query.filter_by(month=current_month).first()
    transactions = Transaction.query.filter(
        Transaction.type == 'expense',
        Transaction.date.like(f'{current_month}%')
    ).all()
    cards = Card.query.all()
    card_stats = []
    for card in cards:
        spent = sum(tx.amount for tx in transactions if tx.card == card.name)
        card_stats.append({
            'name': card.name,
            'target': card.monthly_target,
            'spent': spent,
            'percent': min(int(spent / card.monthly_target * 100), 100) if card.monthly_target > 0 else 0
        })
    return render_template('budget.html', current_budget=current_budget, current_month=current_month, card_stats=card_stats)

# 카테고리별 통계
@app.route('/stats')
def stats():
    current_month = datetime.now().strftime('%Y-%m')
    transactions = Transaction.query.filter(
        Transaction.type == 'expense',
        Transaction.date.like(f'{current_month}%')
    ).all()

    category_totals = defaultdict(int)
    for tx in transactions:
        category_totals[tx.category] += tx.amount
    
    cats = Category.query.order_by(Category.id).all()
    emoji_map = {c.name: c.icon for c in cats}
    return render_template('stats.html', category_totals=category_totals, emoji_map=emoji_map)

# 카테고리 관리 - GET이면 목록 표시, POST면 새 카테고리 추가
@app.route('/categories', methods=['GET', 'POST'])
def categories():
    if request.method == 'POST':
        name = request.form['name'].strip()
        icon = request.form['icon'].strip()
        if name and icon and not Category.query.filter_by(name=name).first():
            db.session.add(Category(name=name, icon=icon))
            db.session.commit()
    cats = Category.query.order_by(Category.id).all()
    return render_template('categories.html', categories=cats)

# 카테고리 수정
@app.route('/categories/edit/<int:cat_id>', methods=['POST'])
def edit_category(cat_id):
    cat = Category.query.get_or_404(cat_id)
    cat.name = request.form['name'].strip()
    cat.icon = request.form['icon'].strip()
    db.session.commit()
    return redirect(url_for('categories'))

# 카테고리 삭제
@app.route('/categories/delete/<int:cat_id>', methods=['POST'])
def delete_category(cat_id):
    cat = Category.query.get_or_404(cat_id)
    db.session.delete(cat)
    db.session.commit()
    return redirect(url_for('categories'))

# 카드 관리 - GET이면 목록 표시, POST면 새 카드 추가
@app.route('/cards', methods=['GET', 'POST'])
def cards():
    if request.method == 'POST':
        db.session.add(Card(
            name=request.form['name'],
            monthly_target=int(request.form['monthly_target']),
            url=request.form.get('url') or None
        ))
        db.session.commit()
    card_list = Card.query.all()
    return render_template('cards.html', cards=card_list)

# 카드 수정
@app.route('/cards/edit/<int:card_id>', methods=['POST'])
def edit_card(card_id):
    card = Card.query.get_or_404(card_id)
    card.name = request.form['name']
    card.monthly_target = int(request.form['monthly_target'])
    card.url = request.form.get('url') or None
    db.session.commit()
    return redirect(url_for('cards'))

# 카드 삭제
@app.route('/cards/delete/<int:card_id>', methods=['POST'])
def delete_card(card_id):
    card = Card.query.get_or_404(card_id)
    db.session.delete(card)
    db.session.commit()
    return redirect(url_for('cards'))

# 캘린더 - 날짜별 지출/수입 내역 표시
@app.route('/calendar')
def calendar():
    transactions = Transaction.query.all()
    # FullCalendar에서 사용할 수 있는 형식으로 변환
    events = []
    for tx in transactions:
        events.append({
            'title': f"{tx.amount:,}원 ({tx.category})",
            'start': tx.date,
            'color': '#36A2EB' if tx.type == 'income' else '#FF6384'
        })
    card_list = Card.query.all()
    categories = Category.query.order_by(Category.id).all()
    return render_template('calendar.html', events=events, card_list=card_list, categories=categories)

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js')

if __name__ == '__main__':
    app.run(debug=True) # 서버 실행 / debug=True면 코드 수정 시 자동 재시작