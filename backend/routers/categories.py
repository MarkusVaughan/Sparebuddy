from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import Account, BudgetTarget, Category, CategoryRule, CategoryType, Goal, Transaction, TransactionSplit, User
from ..database import get_db

router = APIRouter(prefix="/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: str = "💳"
    category_type: CategoryType = CategoryType.expense


class RuleCreate(BaseModel):
    match_text: str


def get_user_category(db: Session, user_id: int, category_id: int):
    return (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user_id)
        .first()
    )


@router.get("/")
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    categories = (
        db.query(Category)
        .filter(Category.user_id == current_user.id)
        .order_by(Category.name.asc())
        .all()
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "color": c.color,
            "icon": c.icon,
            "category_type": c.category_type,
            "rules": [{"id": r.id, "match_text": r.match_text} for r in c.rules if r.is_active],
        }
        for c in categories
    ]


@router.get("/rule-suggestions")
def rule_suggestions(
    q: str = Query("", min_length=0),
    limit: int = Query(8, ge=1, le=25),
    db: Session = Depends(get_db),
):
    query = (
        db.query(CategoryRule.match_text)
        .filter(CategoryRule.is_active == True)
        .distinct()
        .order_by(CategoryRule.match_text.asc())
    )
    if q:
        query = query.filter(CategoryRule.match_text.ilike(f"{q}%"))
    suggestions = [match_text for (match_text,) in query.limit(limit).all()]
    return suggestions


@router.post("/")
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = Category(**payload.dict(), user_id=current_user.id)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name}


@router.patch("/{category_id}")
def update_category(
    category_id: int,
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = get_user_category(db, current_user.id, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.dict().items():
        setattr(cat, key, value)
    db.commit()
    return {"ok": True}


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = get_user_category(db, current_user.id, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    try:
        account_ids = [
            account_id
            for (account_id,) in db.query(Account.id).filter(Account.user_id == current_user.id).all()
        ]
        if account_ids:
            db.query(Transaction).filter(
                Transaction.category_id == category_id,
                Transaction.account_id.in_(account_ids),
            ).update(
                {Transaction.category_id: None},
                synchronize_session=False,
            )
        db.query(TransactionSplit).filter(
            TransactionSplit.participant_user_id == current_user.id,
            TransactionSplit.category_id == category_id,
        ).update(
            {TransactionSplit.category_id: None},
            synchronize_session=False,
        )
        db.query(BudgetTarget).filter(
            BudgetTarget.user_id == current_user.id,
            BudgetTarget.category_id == category_id,
        ).delete(synchronize_session=False)
        db.query(Goal).filter(
            Goal.user_id == current_user.id,
            Goal.category_id == category_id,
        ).update({Goal.category_id: None}, synchronize_session=False)
        db.query(CategoryRule).filter(CategoryRule.category_id == category_id).delete(
            synchronize_session=False,
        )
        db.delete(cat)
        db.commit()
        return {"ok": True}
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Kunne ikke slette kategori.")


@router.post("/{category_id}/rules")
def add_rule(
    category_id: int,
    payload: RuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = get_user_category(db, current_user.id, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    rule = CategoryRule(category_id=category_id, match_text=payload.match_text.strip())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "match_text": rule.match_text}


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = (
        db.query(CategoryRule)
        .join(Category, CategoryRule.category_id == Category.id)
        .filter(CategoryRule.id == rule_id, Category.user_id == current_user.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}
