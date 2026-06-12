from flask import Flask, render_template, request, redirect, url_for # render_template를 해주면 templates 폴더 안의 HTML 파일을 불러옴
from models import db, Transaction

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expense.db' # DB 파일 위치
db.init_app(app)

with app.app_context():
    db.create_all() # 테이블 자동 생성

# 메인 페이지 - DB에서 전체 내역 조회 후 합계 계산해서 화면에 표시
@app.route('/') # 이 URL로 접속하면 아래의 함수를 실행
def index():
    transactions = Transaction.query.order_by(Transaction.date.desc()).all() # DB에서 전체 내역을 최신순(날짜)으로 가져옴

    income_total = sum(tx.amount for tx in transactions if tx.type == 'income')
    expense_total = sum(tx.amount for tx in transactions if tx.type == 'expense')
    balance = income_total - expense_total # 가져온 내역에서 수입/지출 합계와 잔액 계산

    return render_template('index.html', # render_template를 하면 변수를 여러개 넘길 수 있음
                           transactions = transactions,
                           income_total = income_total,
                           expense_total = expense_total,
                           balance = balance,
                           ) # 계산 결과를 index.html에 넘겨서 화면에 표시

# 내역 추가 - 폼에서 입력한 데이터를 받아서 DB에 저장
@app.route('/add', methods=['POST'])
def add():
    tx = Transaction(
        date=request.form['date'], # 폼에서 입력한 값을 꺼내서
        type=request.form['type'],
        category=request.form['category'],
        description=request.form['description'],
        amount=int(request.form['amount']),
    )
    db.session.add(tx) # DB에 추가 예약
    db.session.commit() # 실제로 DB에 저장
    return redirect(url_for('index')) # 저장 후 메인 페이지로 이동

# 내역 삭제 - URL의 id로 해당 내역을 찾아서 DB에서 삭제
@app.route('/delete/<int:tx_id>', methods=['POST'])
def delete(tx_id):
    tx = Transaction.query.get_or_404(tx_id)
    db.session.delete(tx)
    db.session.commit()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True) # 서버 실행 / debug=True면 코드 수정 시 자동 재시작