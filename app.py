from flask import Flask, render_template, request, redirect, url_for # render_template를 해주면 templates 폴더 안의 HTML 파일을 불러옴
from models import db, Transaction

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expense.db' # DB 파일 위치
db.init_app(app)

with app.app_context():
    db.create_all() # 테이블 자동 생성

@app.route('/') # 이 URL로 접속하면 아래의 함수를 실행
def index():
    transactions = Transaction.query.order_by(Transaction.date.desc()).all()

    income_total = sum(tx.amount for tx in transactions if tx.type == 'income')
    expense_total = sum(tx.amount for tx in transactions if tx.type == 'expense')
    balance = income_total - expense_total

    return render_template('index.html', # render_template를 하면 변수를 여러개 넘길 수 있음
                           transactions = transactions,
                           income_total = income_total,
                           expense_total=expense_total,
                           balance = balance,
                           )

@app.route('/add', methods=['POST'])
def add():
    tx = Transaction(
        date=request.form['date'],
        type=request.form['type'],
        category=request.form['category'],
        description=request.form['description'],
        amount=int(request.form['amount']),
    )
    db.session.add(tx)
    db.session.commit()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True) # 서버 실행 / debug=True면 코드 수정 시 자동 재시작