from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Date,
    DateTime, ForeignKey, Boolean, Enum
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import enum

DATABASE_URL = "sqlite:///./sparebuddy.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("Account", back_populates="user")
    budget_targets = relationship("BudgetTarget", back_populates="user")
    assets = relationship("Asset", back_populates="user")


class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    bank = Column(String, default="DNB")
    account_type = Column(Enum(AccountType), default=AccountType.checking)
    account_number = Column(String, nullable=True)

    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#6366f1")
    icon = Column(String, default="💳")
    category_type = Column(Enum(CategoryType), default=CategoryType.expense)

    rules = relationship("CategoryRule", back_populates="category")
    transactions = relationship("Transaction", back_populates="category")
    budget_targets = relationship("BudgetTarget", back_populates="category")


class CategoryRule(Base):
    __tablename__ = "category_rules"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    match_text = Column(String, nullable=False)  # e.g. "REMA", "NETFLIX"
    is_active = Column(Boolean, default=True)

    category = relationship("Category", back_populates="rules")


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    date = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=True)
    imported_at = Column(DateTime, default=datetime.utcnow)
    # Used for deduplication
    import_hash = Column(String, unique=True, nullable=False)

    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")


class BudgetTarget(Base):
    __tablename__ = "budget_targets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    month = Column(String, nullable=False)  # Format: "2026-04"
    amount = Column(Float, nullable=False)

    user = relationship("User", back_populates="budget_targets")
    category = relationship("Category", back_populates="budget_targets")


class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)       # e.g. "DNB BSU", "Nordnet portefølje"
    asset_type = Column(Enum(AssetType), nullable=False)
    value = Column(Float, nullable=False)
    recorded_date = Column(Date, nullable=False)
    notes = Column(String, nullable=True)

    user = relationship("User", back_populates="assets")


def create_tables():
    Base.metadata.create_all(bind=engine)


def seed_default_categories(db):
    """Seed sensible default categories if none exist."""
    if db.query(Category).count() > 0:
        return

    defaults = [
        ("Dagligvarer", "#22c55e", "🛒", "expense"),
        ("Restaurant & Kafe", "#f97316", "🍽️", "expense"),
        ("Transport", "#3b82f6", "🚗", "expense"),
        ("Abonnementer", "#8b5cf6", "📱", "expense"),
        ("Helse", "#ec4899", "🏥", "expense"),
        ("Klær & Shopping", "#f59e0b", "👕", "expense"),
        ("Bolig & Hushold", "#64748b", "🏠", "expense"),
        ("Fritid & Underholdning", "#06b6d4", "🎬", "expense"),
        ("Reise & Ferie", "#10b981", "✈️", "expense"),
        ("Sparing", "#6366f1", "💰", "expense"),
        ("Lønn", "#16a34a", "💼", "income"),
        ("Overføring", "#94a3b8", "↔️", "income"),
        ("Annet", "#9ca3af", "📦", "expense"),
    ]

    for name, color, icon, cat_type in defaults:
        db.add(Category(name=name, color=color, icon=icon, category_type=cat_type))

    db.commit()
