from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Transaction(db.Model):        # 하나의 클래스 = 하나의 DB 테이블
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(10), nullable=False)   # 예: "2026-06-12"
    type = db.Column(db.String(10), nullable=False)   # "income" 또는 "expense"
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Integer, nullable=False)