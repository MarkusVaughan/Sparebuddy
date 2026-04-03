from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from pydantic import BaseModel

from ..database import get_db, BudgetTarget, Transaction, Category, CategoryType

router = APIRouter(prefix="/budgets", tags=["budgets"])


class BudgetSet(BaseModel):
    user_id: int = 1
    category_id: int
    month: str   # "2026-04"
    amount: float


@router.get("/{month}")
def get_budget(month: str, user_id: int = 1, db: Session = Depends(get_db)):
    """
    Returns budget targets vs actual spending for all categories in a month.
    """
    year, mon = month.split("-")

    # Get all targets for this month/user
    targets = (
        db.query(BudgetTarget)
        .filter(BudgetTarget.month == month, BudgetTarget.user_id == user_id)
        .all()
    )
    target_map = {t.category_id: t.amount for t in targets}

    # Get actual spending per category
    actuals = (
        db.query(
            Transaction.category_id,
            func.sum(Transaction.amount).label("total")
        )
        .filter(
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon),
            Transaction.amount < 0
        )
        .group_by(Transaction.category_id)
        .all()
    )
    actual_map = {a.category_id: abs(a.total) for a in actuals}

    # Always include all expense categories so budget goals can be set ahead of spending.
    categories = (
        db.query(Category)
        .filter(Category.category_type == CategoryType.expense)
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
def set_budget(payload: BudgetSet, db: Session = Depends(get_db)):
    existing = (
        db.query(BudgetTarget)
        .filter(
            BudgetTarget.user_id == payload.user_id,
            BudgetTarget.category_id == payload.category_id,
            BudgetTarget.month == payload.month
        )
        .first()
    )
    if existing:
        existing.amount = payload.amount
    else:
        db.add(BudgetTarget(**payload.dict()))
    db.commit()
    return {"ok": True}
