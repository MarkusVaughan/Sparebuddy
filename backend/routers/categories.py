from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from typing import Optional

from ..database import get_db, Category, CategoryRule, CategoryType, Transaction, BudgetTarget

router = APIRouter(prefix="/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: str = "💳"
    category_type: CategoryType = CategoryType.expense


class RuleCreate(BaseModel):
    match_text: str


@router.get("/")
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
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


@router.post("/")
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    cat = Category(**payload.dict())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name}


@router.patch("/{category_id}")
def update_category(category_id: int, payload: CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in payload.dict().items():
        setattr(cat, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    try:
        # Detach related records explicitly so category deletion behaves predictably.
        db.query(Transaction).filter(Transaction.category_id == category_id).update(
            {Transaction.category_id: None},
            synchronize_session=False,
        )
        db.query(BudgetTarget).filter(BudgetTarget.category_id == category_id).delete(
            synchronize_session=False,
        )
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
def add_rule(category_id: int, payload: RuleCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    rule = CategoryRule(category_id=category_id, match_text=payload.match_text)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "match_text": rule.match_text}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CategoryRule).filter(CategoryRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}
