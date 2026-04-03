from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from pydantic import BaseModel
from typing import Optional
from datetime import date

from ..database import get_db, Transaction, Account, Category
from ..services.dnb_importer import import_dnb_csv
from ..services.categorizer import apply_rules_to_transactions

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    account_id: int
    account_name: str
    category_id: Optional[int]
    category_name: Optional[str]
    category_color: Optional[str]
    date: date
    description: str
    amount: float

    class Config:
        from_attributes = True


@router.get("/")
def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    month: Optional[str] = None,       # Format: "2026-04"
    uncategorized: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    q = db.query(Transaction)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    if uncategorized:
        q = q.filter(Transaction.category_id == None)
    if month:
        year, mon = month.split("-")
        q = q.filter(
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon)
        )
    if search:
        q = q.filter(Transaction.description.ilike(f"%{search}%"))

    total = q.count()
    transactions = q.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()

    results = []
    for tx in transactions:
        results.append({
            "id": tx.id,
            "account_id": tx.account_id,
            "account_name": tx.account.name if tx.account else "",
            "category_id": tx.category_id,
            "category_name": tx.category.name if tx.category else None,
            "category_color": tx.category.color if tx.category else None,
            "category_icon": tx.category.icon if tx.category else None,
            "date": tx.date.isoformat(),
            "description": tx.description,
            "amount": tx.amount,
        })

    return {"total": total, "items": results}


@router.patch("/{transaction_id}")
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db)
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if payload.category_id is not None:
        tx.category_id = payload.category_id
    if payload.description is not None:
        tx.description = payload.description
    db.commit()
    return {"ok": True}


@router.post("/import")
async def import_transactions(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    content = await file.read()
    try:
        result = import_dnb_csv(content, account_id, db)
        return result
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Importen inneholder duplikater eller ugyldige rader for databasen.",
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/apply-rules")
def apply_rules(
    account_id: Optional[int] = None,
    overwrite: bool = False,
    db: Session = Depends(get_db)
):
    updated = apply_rules_to_transactions(db, account_id=account_id, overwrite=overwrite)
    return {"updated": updated}


@router.get("/summary/monthly")
def monthly_summary(
    month: str,  # "2026-04"
    db: Session = Depends(get_db)
):
    """Returns total spent per category for a given month."""
    year, mon = month.split("-")
    results = (
        db.query(
            Category.id,
            Category.name,
            Category.color,
            Category.icon,
            func.sum(Transaction.amount).label("total")
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon),
            Transaction.amount < 0
        )
        .group_by(Category.id)
        .all()
    )

    return [
        {
            "category_id": r.id,
            "category_name": r.name,
            "color": r.color,
            "icon": r.icon,
            "total": abs(r.total),
        }
        for r in results
    ]
