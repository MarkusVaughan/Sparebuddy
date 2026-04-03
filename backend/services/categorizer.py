"""
Auto-categorization service.
Re-runs category rules against uncategorized (or all) transactions.
"""

from typing import List, Optional

from sqlalchemy.orm import Session
from ..database import Category, CategoryRule, Transaction, TransactionSplit


def find_matching_category_id(db: Session, user_id: int, description: str) -> Optional[int]:
    rules = (
        db.query(CategoryRule)
        .join(Category, CategoryRule.category_id == Category.id)
        .filter(CategoryRule.is_active == True, Category.user_id == user_id)
        .order_by(CategoryRule.id.asc())
        .all()
    )
    desc_upper = description.upper()
    for rule in rules:
        if rule.match_text.upper() in desc_upper:
            return rule.category_id
    return None


def apply_rules_to_transactions(
    db: Session,
    user_id: int,
    account_id: int = None,
    account_ids: Optional[List[int]] = None,
    overwrite: bool = False,
) -> int:
    """
    Apply active category rules to transactions.

    Args:
        db: Database session
        account_id: If set, only process transactions for this account
        account_ids: If set, only process transactions for these accounts
        overwrite: If True, re-categorize already-categorized transactions too

    Returns:
        Number of transactions updated
    """
    if not (
        db.query(CategoryRule.id)
        .join(Category, CategoryRule.category_id == Category.id)
        .filter(CategoryRule.is_active == True, Category.user_id == user_id)
        .first()
    ):
        return 0

    query = db.query(Transaction)
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    elif account_ids:
        query = query.filter(Transaction.account_id.in_(account_ids))
    if not overwrite:
        query = query.filter(Transaction.category_id == None)

    transactions = query.all()
    updated = 0

    for tx in transactions:
        matched_category_id = find_matching_category_id(db, user_id, tx.description)
        if matched_category_id is not None:
            tx.category_id = matched_category_id
            updated += 1

    db.commit()
    return updated


def apply_rules_to_transaction_splits(
    db: Session,
    user_id: int,
    account_id: int = None,
    account_ids: Optional[List[int]] = None,
    overwrite: bool = False,
) -> int:
    if not (
        db.query(CategoryRule.id)
        .join(Category, CategoryRule.category_id == Category.id)
        .filter(CategoryRule.is_active == True, Category.user_id == user_id)
        .first()
    ):
        return 0

    query = (
        db.query(TransactionSplit)
        .join(Transaction, TransactionSplit.transaction_id == Transaction.id)
        .filter(TransactionSplit.participant_user_id == user_id)
    )
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    elif account_ids:
        query = query.filter(Transaction.account_id.in_(account_ids))
    if not overwrite:
        query = query.filter(TransactionSplit.category_id == None)

    splits = query.all()
    updated = 0

    for split in splits:
        matched_category_id = find_matching_category_id(db, user_id, split.transaction.description)
        if matched_category_id is not None:
            split.category_id = matched_category_id
            updated += 1

    db.commit()
    return updated
