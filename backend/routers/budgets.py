from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_db, BudgetTarget, Transaction, TransactionSplit, Category, CategoryType, ShareStatus
from ..database import Account, User

router = APIRouter(prefix="/budgets", tags=["budgets"])


class BudgetSet(BaseModel):
    category_id: int
    month: str   # "2026-04"
    amount: float


def month_bounds(month: str) -> tuple[date, date]:
    try:
        year, mon = map(int, month.split("-"))
        start = date(year, mon, 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid month format, expected YYYY-MM") from exc
    if mon == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, mon + 1, 1)
    return start, end


def shift_month_start(month_start: date, offset: int) -> date:
    month_index = month_start.month - 1 + offset
    year = month_start.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


@router.get("/{month}")
def get_budget(
    month: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns budget targets vs actual spending for all categories in a month.
    """
    start_date, end_date = month_bounds(month)
    average_start_date = shift_month_start(start_date, -3)

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
            func.sum(
                func.abs(Transaction.amount) - func.coalesce(
                    TransactionSplit.settlement_amount,
                    func.abs(Transaction.amount) * TransactionSplit.share_ratio,
                    0,
                )
            ).label("total")
        )
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(
            TransactionSplit,
            and_(
                TransactionSplit.transaction_id == Transaction.id,
                TransactionSplit.status == ShareStatus.accepted,
            ),
        )
        .filter(
            Account.user_id == current_user.id,
            Transaction.date >= start_date,
            Transaction.date < end_date,
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
            Transaction.date >= start_date,
            Transaction.date < end_date,
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

    own_average_actuals = (
        db.query(
            Transaction.category_id,
            func.sum(
                func.abs(Transaction.amount) - func.coalesce(
                    TransactionSplit.settlement_amount,
                    func.abs(Transaction.amount) * TransactionSplit.share_ratio,
                    0,
                )
            ).label("total")
        )
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(
            TransactionSplit,
            and_(
                TransactionSplit.transaction_id == Transaction.id,
                TransactionSplit.status == ShareStatus.accepted,
            ),
        )
        .filter(
            Account.user_id == current_user.id,
            Transaction.date >= average_start_date,
            Transaction.date < start_date,
            Transaction.amount < 0,
        )
        .group_by(Transaction.category_id)
        .all()
    )
    shared_average_actuals = (
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
            Transaction.date >= average_start_date,
            Transaction.date < start_date,
            Transaction.amount < 0,
            TransactionSplit.category_id.isnot(None),
        )
        .group_by(TransactionSplit.category_id)
        .all()
    )
    average_map = {}
    for actual in [*own_average_actuals, *shared_average_actuals]:
        if actual.category_id is None:
            continue
        average_map[actual.category_id] = average_map.get(actual.category_id, 0) + abs(float(actual.total or 0))

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
        budget = float(target_map.get(cat_id, 0) or 0)
        actual = float(actual_map.get(cat_id, 0) or 0)
        average_actual = float(average_map.get(cat_id, 0) or 0) / 3
        result.append({
            "category_id": cat_id,
            "category_name": cat.name,
            "color": cat.color,
            "icon": cat.icon,
            "budget": budget,
            "actual": actual,
            "average_actual": average_actual,
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
