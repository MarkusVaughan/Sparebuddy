import os
import enum
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import (
    create_engine, Column, BigInteger, String, Numeric, Date,
    DateTime, ForeignKey, Boolean, Enum, Text
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AccountType(str, enum.Enum):
    checking = "checking"
    savings = "savings"
    credit = "credit"


class AssetType(str, enum.Enum):
    bank = "bank"
    investment = "investment"
    pension = "pension"
    property = "property"
    other = "other"


class CategoryType(str, enum.Enum):
    expense = "expense"
    income = "income"


class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    accounts = relationship("Account", back_populates="user")
    budget_targets = relationship("BudgetTarget", back_populates="user")
    assets = relationship("Asset", back_populates="user")


class Account(Base):
    __tablename__ = "accounts"
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    bank = Column(String, default="DNB")
    account_type = Column(Enum(AccountType, name="account_type"), default=AccountType.checking)
    account_number = Column(String, nullable=True)

    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")


class Category(Base):
    __tablename__ = "categories"
    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#6366f1")
    icon = Column(String, default="💳")
    category_type = Column(Enum(CategoryType, name="category_type"), default=CategoryType.expense)

    rules = relationship("CategoryRule", back_populates="category")
    transactions = relationship("Transaction", back_populates="category")
    budget_targets = relationship("BudgetTarget", back_populates="category")


class CategoryRule(Base):
    __tablename__ = "category_rules"
    id = Column(BigInteger, primary_key=True, index=True)
    category_id = Column(BigInteger, ForeignKey("categories.id"), nullable=False)
    match_text = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

    category = relationship("Category", back_populates="rules")


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(BigInteger, primary_key=True, index=True)
    account_id = Column(BigInteger, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(BigInteger, ForeignKey("categories.id"), nullable=True)
    date = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    balance_after = Column(Numeric(12, 2), nullable=True)
    imported_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    import_hash = Column(String, unique=True, nullable=False)

    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")


class BudgetTarget(Base):
    __tablename__ = "budget_targets"
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    category_id = Column(BigInteger, ForeignKey("categories.id"), nullable=False)
    month = Column(String, nullable=False)  # Format: "2026-04"
    amount = Column(Numeric(12, 2), nullable=False)

    user = relationship("User", back_populates="budget_targets")
    category = relationship("Category", back_populates="budget_targets")


class Asset(Base):
    __tablename__ = "assets"
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    asset_type = Column(Enum(AssetType, name="asset_type"), nullable=False)
    value = Column(Numeric(12, 2), nullable=False)
    recorded_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)

    user = relationship("User", back_populates="assets")
