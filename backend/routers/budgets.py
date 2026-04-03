from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_db, BudgetTarget, Transaction, TransactionSplit, Category, CategoryType, ShareStatus
from ..database import Account, User

router = APIRouter(prefix="/budgets", tags=["budgets"])


class BudgetSet(BaseModel):
    category_id: int
    month: str   # "2026-04"
    amount: float


@router.get("/{month}")
def get_budget(
    month: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns budget targets vs actual spending for all categories in a month.
    """
    year, mon = month.split("-")

    # Get all targets for this month/user
    targets = (
        db.query(BudgetTarget)
        .filter(BudgetTarget.month == month, BudgetTarget.user_id == current_user.id)
        .all()
    )
    target_map = {t.category_id: t.amount for t in targets}

    # Get actual spending per category
    own_actuals = (
        db.query(
            Transaction.category_id,
            func.sum(func.abs(Transaction.amount)).label("total")
        )
        .join(Account, Transaction.account_id == Account.id)
        .filter(
            Account.user_id == current_user.id,
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon),
            Transaction.amount < 0
        )
        .group_by(Transaction.category_id)
        .all()
    )
    shared_actuals = (
        db.query(
            TransactionSplit.category_id,
            func.sum(
                func.coalesce(
                    TransactionSplit.settlement_amount,
                    func.abs(Transaction.amount) * TransactionSplit.share_ratio,
                )
            ).label("total")
        )
        .join(Transaction, TransactionSplit.transaction_id == Transaction.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(
            TransactionSplit.participant_user_id == current_user.id,
            TransactionSplit.status == ShareStatus.accepted,
            Account.user_id != current_user.id,
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon),
            Transaction.amount < 0,
            TransactionSplit.category_id.isnot(None),
        )
        .group_by(TransactionSplit.category_id)
        .all()
    )
    actual_map = {}
    for actual in [*own_actuals, *shared_actuals]:
        if actual.category_id is None:
            continue
        actual_map[actual.category_id] = actual_map.get(actual.category_id, 0) + abs(float(actual.total or 0))

    # Always include all expense categories so budget goals can be set ahead of spending.
    categories = (
        db.query(Category)
        .filter(
            Category.user_id == current_user.id,
            Category.category_type == CategoryType.expense,
        )
        .order_by(Category.name.asc())
        .all()
    )

    result = []
    for cat in categories:
        cat_id = cat.id
        budget = target_map.get(cat_id, 0)
        actual = actual_map.get(cat_id, 0)
        result.append({
            "category_id": cat_id,
            "category_name": cat.name,
            "color": cat.color,
            "icon": cat.icon,
            "budget": budget,
            "actual": actual,
            "remaining": budget - actual if budget > 0 else None,
            "pct_used": round((actual / budget * 100), 1) if budget > 0 else None,
        })

    return sorted(result, key=lambda x: (-x["actual"], x["category_name"].lower()))


@router.post("/")
def set_budget(
    payload: BudgetSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = (
        db.query(Category)
        .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    existing = (
        db.query(BudgetTarget)
        .filter(
            BudgetTarget.user_id == current_user.id,
            BudgetTarget.category_id == payload.category_id,
            BudgetTarget.month == payload.month
        )
        .first()
    )
    if existing:
        existing.amount = payload.amount
    else:
        db.add(BudgetTarget(user_id=current_user.id, **payload.dict()))
    db.commit()
    return {"ok": True}
