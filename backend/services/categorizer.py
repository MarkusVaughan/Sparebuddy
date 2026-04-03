"""
Auto-categorization service.
Re-runs category rules against uncategorized (or all) transactions.
"""

from sqlalchemy.orm import Session
from ..database import Transaction, CategoryRule


def apply_rules_to_transactions(db: Session, account_id: int = None, overwrite: bool = False) -> int:
    """
    Apply active category rules to transactions.

    Args:
        db: Database session
        account_id: If set, only process transactions for this account
        overwrite: If True, re-categorize already-categorized transactions too

    Returns:
        Number of transactions updated
    """
    rules = db.query(CategoryRule).filter(CategoryRule.is_active == True).all()
    if not rules:
        return 0

    query = db.query(Transaction)
    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    if not overwrite:
        query = query.filter(Transaction.category_id == None)

    transactions = query.all()
    updated = 0

    for tx in transactions:
        desc_upper = tx.description.upper()
        for rule in rules:
            if rule.match_text.upper() in desc_upper:
                tx.category_id = rule.category_id
                updated += 1
                break

    db.commit()
    return updated
