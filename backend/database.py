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


class GoalType(str, enum.Enum):
    savings = "savings"
    debt_reduction = "debt_reduction"
    expense_reduction = "expense_reduction"


class ShareStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    auth_token_version = Column(BigInteger, nullable=False, default=1)
    onboarding_completed = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    vipps_phone = Column(String, nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    accounts = relationship("Account", back_populates="user")
    budget_targets = relationship("BudgetTarget", back_populates="user")
    assets = relationship("Asset", back_populates="user")
    goals = relationship("Goal", back_populates="user")
    shared_goals = relationship("GoalShare", back_populates="user")
    shared_assets = relationship("AssetShare", back_populates="shared_user", foreign_keys="AssetShare.shared_user_id")
    split_transactions = relationship("TransactionSplit", back_populates="participant", foreign_keys="TransactionSplit.participant_user_id")
    sent_invites = relationship("FamilyInvite", back_populates="inviter", foreign_keys="FamilyInvite.inviter_user_id")
    trusted_contacts = relationship("TrustedContact", back_populates="user", foreign_keys="TrustedContact.user_id")


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
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    base_category_id = Column(BigInteger, ForeignKey("categories.id"), nullable=True)
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
    splits = relationship("TransactionSplit", back_populates="transaction", cascade="all, delete-orphan")


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


class Goal(Base):
    __tablename__ = "goals"
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    goal_type = Column(String, nullable=False, default=GoalType.savings.value)
    target_amount = Column(Numeric(12, 2), nullable=False)
    current_amount = Column(Numeric(12, 2), nullable=False, default=0)
    monthly_target = Column(Numeric(12, 2), nullable=True)
    start_month = Column(String, nullable=False)   # Format: "2026-04"
    target_month = Column(String, nullable=False)  # Format: "2026-06"
    category_id = Column(BigInteger, ForeignKey("categories.id"), nullable=True)
    baseline_amount = Column(Numeric(12, 2), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user = relationship("User", back_populates="goals")
    category = relationship("Category")
    asset_links = relationship("GoalAssetLink", back_populates="goal", cascade="all, delete-orphan")
    shares = relationship("GoalShare", back_populates="goal", cascade="all, delete-orphan")


class GoalAssetLink(Base):
    __tablename__ = "goal_asset_links"
    id = Column(BigInteger, primary_key=True, index=True)
    goal_id = Column(BigInteger, ForeignKey("goals.id"), nullable=False)
    asset_name = Column(String, nullable=False)

    goal = relationship("Goal", back_populates="asset_links")


class GoalShare(Base):
    __tablename__ = "goal_shares"
    id = Column(BigInteger, primary_key=True, index=True)
    goal_id = Column(BigInteger, ForeignKey("goals.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(ShareStatus, name="share_status"), nullable=False, default=ShareStatus.pending)
    decline_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    goal = relationship("Goal", back_populates="shares")
    user = relationship("User", back_populates="shared_goals")


class FamilyInvite(Base):
    __tablename__ = "family_invites"
    id = Column(BigInteger, primary_key=True, index=True)
    inviter_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    invite_email = Column(String, nullable=False)
    invite_name = Column(String, nullable=True)
    invite_token = Column(String, unique=True, nullable=False)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    inviter = relationship("User", back_populates="sent_invites", foreign_keys=[inviter_user_id])


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    contact_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user = relationship("User", back_populates="trusted_contacts", foreign_keys=[user_id])


class AssetShare(Base):
    __tablename__ = "asset_shares"
    id = Column(BigInteger, primary_key=True, index=True)
    owner_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    shared_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    asset_name = Column(String, nullable=False)
    status = Column(Enum(ShareStatus, name="share_status"), nullable=False, default=ShareStatus.pending)
    share_ratio = Column(Numeric(5, 4), nullable=False, default=0.5)
    decline_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    shared_user = relationship("User", back_populates="shared_assets", foreign_keys=[shared_user_id])


class TransactionSplit(Base):
    __tablename__ = "transaction_splits"
    id = Column(BigInteger, primary_key=True, index=True)
    transaction_id = Column(BigInteger, ForeignKey("transactions.id"), nullable=False)
    participant_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    category_id = Column(BigInteger, ForeignKey("categories.id"), nullable=True)
    status = Column(Enum(ShareStatus, name="share_status"), nullable=False, default=ShareStatus.pending)
    decline_message = Column(Text, nullable=True)
    share_ratio = Column(Numeric(6, 4), nullable=False, default=0.5)
    settlement_amount = Column(Numeric(12, 2), nullable=True)
    due_date = Column(Date, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    payment_requested_at = Column(DateTime(timezone=True), nullable=True)
    payment_requested_by_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    transaction = relationship("Transaction", back_populates="splits")
    participant = relationship("User", back_populates="split_transactions", foreign_keys=[participant_user_id])
    category = relationship("Category")
