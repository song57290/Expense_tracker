from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Transaction(db.Model):        # 하나의 클래스 = 하나의 DB 테이블
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(10), nullable=False)   # 예: "2026-06-12"
    type = db.Column(db.String(10), nullable=False)   # "income" 또는 "expense"
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    card = db.Column(db.String(50), nullable=True)  # 어떤 카드로 결제했는지 (없을 수도 있음)

# 예산 설정
class Budget(db.Model):
    id = db.Column(db.Integer, primary_key = True)
    month = db.Column(db.String(7), nullable = False) # 예: "2026-06"
    amount = db.Column(db.Integer, nullable = False)

# 동적으로 카테고리 추가
class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    icon = db.Column(db.String(10), nullable=False)  # 이모지
    position = db.Column(db.Integer, nullable=False, default=0)

# 카드별 실적 관리
class Card(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    monthly_target = db.Column(db.Integer, nullable=False)
    url = db.Column(db.String(500), nullable=True)
    tier1 = db.Column(db.Integer, nullable=True, server_default='20')
    tier2 = db.Column(db.Integer, nullable=True, server_default='50')
    tier3 = db.Column(db.Integer, nullable=True, server_default='80')
