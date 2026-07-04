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

class Card(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    monthly_target = db.Column(db.Integer, nullable=False)
    url = db.Column(db.String(500), nullable=True)
    tier1 = db.Column(db.Integer, nullable=True, server_default='20')
    tier2 = db.Column(db.Integer, nullable=True, server_default='50')
    tier3 = db.Column(db.Integer, nullable=True, server_default='80')
    account_balance = db.Column(db.Integer, nullable=False, default=0)
    user_id = db.Column(db.Integer, nullable=True)

class Savings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    stype = db.Column(db.String(10), nullable=False, default='예금')
    bank = db.Column(db.String(50), nullable=False, default='')
    name = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Integer, nullable=False, default=0)
    interest_rate = db.Column(db.Float, nullable=False, default=0.0)
    interest_type = db.Column(db.String(10), nullable=False, default='단리')
    start_date = db.Column(db.String(10), nullable=False)
    end_date = db.Column(db.String(10), nullable=False)

class Notice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False)

class Investment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    itype = db.Column(db.String(20), nullable=False, default='국내주식')
    name = db.Column(db.String(100), nullable=False)
    ticker = db.Column(db.String(30), nullable=True, default='')
    quantity = db.Column(db.Float, nullable=False, default=0)
    avg_price = db.Column(db.Float, nullable=False, default=0)
    current_price = db.Column(db.Float, nullable=True)
    memo = db.Column(db.String(200), nullable=True, default='')
    price_updated_at = db.Column(db.DateTime, nullable=True)
