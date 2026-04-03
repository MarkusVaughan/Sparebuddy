from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import extract, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..auth import get_current_user
from ..database import Account, Category, ShareStatus, Transaction, TransactionSplit, User, get_db
from ..services.categorizer import apply_rules_to_transaction_splits, apply_rules_to_transactions, find_matching_category_id
from ..services.dnb_importer import import_dnb_csv

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None


class TransactionSplitUpdate(BaseModel):
    participant_user_id: Optional[int] = None
    share_ratio: float = 0.5
    due_date: Optional[date] = None
    note: Optional[str] = None


class SettlementUpdate(BaseModel):
    share_ratio: Optional[float] = None
    due_date: Optional[date] = None
    note: Optional[str] = None
    paid: Optional[bool] = None


def derive_settlement_status(split: TransactionSplit):
    if split.paid_at is not None:
        return "paid"
    if split.payment_requested_at is not None:
        return "awaiting_approval"
    if split.due_date and split.due_date < date.today():
        return "overdue"
    return "unpaid"


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


def serialize_transaction(tx: Transaction, current_user_id: int):
    owned_split = next((split for split in tx.splits if tx.account and tx.account.user_id == current_user_id and split.status != ShareStatus.declined), None)
    participant_split = next((split for split in tx.splits if split.participant_user_id == current_user_id and split.status == ShareStatus.accepted), None)
    split_info = None
    shared_role = None
    category = tx.category

    if owned_split:
        shared_role = "owner"
        split_amount = float(owned_split.settlement_amount) if owned_split.settlement_amount is not None else abs(float(tx.amount)) * float(owned_split.share_ratio)
        split_info = {
            "id": owned_split.id,
            "participant_user_id": owned_split.participant_user_id,
            "participant_name": owned_split.participant.name if owned_split.participant else None,
            "status": owned_split.status.value,
            "share_ratio": float(owned_split.share_ratio),
            "share_percent": round(float(owned_split.share_ratio) * 100, 2),
            "settlement_amount": split_amount,
            "due_date": owned_split.due_date.isoformat() if owned_split.due_date else None,
            "paid_at": owned_split.paid_at.isoformat() if owned_split.paid_at else None,
            "payment_requested_at": owned_split.payment_requested_at.isoformat() if owned_split.payment_requested_at else None,
            "payment_requested_by_user_id": owned_split.payment_requested_by_user_id,
            "settlement_status": derive_settlement_status(owned_split),
            "note": owned_split.note,
        }
    elif participant_split:
        shared_role = "participant"
        category = participant_split.category
        split_amount = float(participant_split.settlement_amount) if participant_split.settlement_amount is not None else abs(float(tx.amount)) * float(participant_split.share_ratio)
        split_info = {
            "id": participant_split.id,
            "owner_user_id": tx.account.user_id if tx.account else None,
            "owner_name": tx.account.user.name if tx.account and tx.account.user else None,
            "status": participant_split.status.value,
            "share_ratio": float(participant_split.share_ratio),
            "share_percent": round(float(participant_split.share_ratio) * 100, 2),
            "settlement_amount": split_amount,
            "due_date": participant_split.due_date.isoformat() if participant_split.due_date else None,
            "paid_at": participant_split.paid_at.isoformat() if participant_split.paid_at else None,
            "payment_requested_at": participant_split.payment_requested_at.isoformat() if participant_split.payment_requested_at else None,
            "payment_requested_by_user_id": participant_split.payment_requested_by_user_id,
            "settlement_status": derive_settlement_status(participant_split),
            "note": participant_split.note,
        }

    return {
        "id": tx.id,
        "account_id": tx.account_id,
        "account_name": tx.account.name if tx.account else "",
        "category_id": category.id if category else None,
        "category_name": category.name if category else None,
        "category_color": category.color if category else None,
        "category_icon": category.icon if category else None,
        "date": tx.date.isoformat(),
        "description": tx.description,
        "amount": float(tx.amount),
        "shared_role": shared_role,
        "split": split_info,
    }


@router.get("/")
def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    month: Optional[str] = None,
    uncategorized: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    own_transactions = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.account).joinedload(Account.user),
            joinedload(Transaction.category),
            joinedload(Transaction.splits).joinedload(TransactionSplit.participant),
            joinedload(Transaction.splits).joinedload(TransactionSplit.category),
        )
        .join(Account, Transaction.account_id == Account.id)
        .filter(Account.user_id == current_user.id)
    )

    if account_id:
        own_transactions = own_transactions.filter(Transaction.account_id == account_id)
    if category_id:
        own_transactions = own_transactions.filter(Transaction.category_id == category_id)
    if uncategorized:
        own_transactions = own_transactions.filter(Transaction.category_id == None)
    if month:
        year, mon = month.split("-")
        own_transactions = own_transactions.filter(extract("year", Transaction.date) == int(year), extract("month", Transaction.date) == int(mon))
    if search:
        own_transactions = own_transactions.filter(Transaction.description.ilike(f"%{search}%"))

    shared_transactions = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.account).joinedload(Account.user),
            joinedload(Transaction.category),
            joinedload(Transaction.splits).joinedload(TransactionSplit.participant),
            joinedload(Transaction.splits).joinedload(TransactionSplit.category),
        )
        .join(TransactionSplit, TransactionSplit.transaction_id == Transaction.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(TransactionSplit.participant_user_id == current_user.id, TransactionSplit.status == ShareStatus.accepted)
    )
    if month:
        year, mon = month.split("-")
        shared_transactions = shared_transactions.filter(extract("year", Transaction.date) == int(year), extract("month", Transaction.date) == int(mon))
    if search:
        shared_transactions = shared_transactions.filter(Transaction.description.ilike(f"%{search}%"))

    owned_items = own_transactions.all()
    shared_items = [tx for tx in shared_transactions.all() if tx.account and tx.account.user_id != current_user.id]
    combined = {tx.id: tx for tx in owned_items}
    for tx in shared_items:
        combined.setdefault(tx.id, tx)

    def matches_filters(tx: Transaction):
        participant_split = next((split for split in tx.splits if split.participant_user_id == current_user.id), None)
        effective_category_id = tx.category_id
        if participant_split and tx.account and tx.account.user_id != current_user.id:
            effective_category_id = participant_split.category_id
        if category_id and effective_category_id != category_id:
            return False
        if uncategorized and effective_category_id is not None:
            return False
        return True

    transactions = sorted(
        [tx for tx in combined.values() if matches_filters(tx)],
        key=lambda tx: (tx.date, tx.id),
        reverse=True,
    )
    total = len(transactions)
    paged = transactions[skip:skip + limit]
    return {"total": total, "items": [serialize_transaction(tx, current_user.id) for tx in paged]}


@router.patch("/{transaction_id}")
def update_transaction(transaction_id: int, payload: TransactionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    updates = payload.dict(exclude_unset=True)
    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.splits))
        .join(Account, Transaction.account_id == Account.id)
        .filter(Transaction.id == transaction_id, Account.user_id == current_user.id)
        .first()
    )
    participant_split = None
    if not tx:
        tx = (
            db.query(Transaction)
            .options(joinedload(Transaction.splits))
            .join(TransactionSplit, TransactionSplit.transaction_id == Transaction.id)
            .filter(Transaction.id == transaction_id, TransactionSplit.participant_user_id == current_user.id, TransactionSplit.status == ShareStatus.accepted)
            .first()
        )
        if tx:
            participant_split = next((split for split in tx.splits if split.participant_user_id == current_user.id), None)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if "category_id" in updates:
        if updates["category_id"] is None:
            if participant_split is not None:
                participant_split.category_id = None
            else:
                tx.category_id = None
        else:
            category = db.query(Category).filter(Category.id == updates["category_id"], Category.user_id == current_user.id).first()
            if not category:
                raise HTTPException(status_code=404, detail="Category not found")
            if participant_split is not None:
                participant_split.category_id = updates["category_id"]
            else:
                tx.category_id = updates["category_id"]
    if "description" in updates and participant_split is None:
        tx.description = updates["description"]
    db.commit()
    return {"ok": True}


@router.put("/{transaction_id}/split")
def upsert_split(transaction_id: int, payload: TransactionSplitUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.splits))
        .join(Account, Transaction.account_id == Account.id)
        .filter(Transaction.id == transaction_id, Account.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if payload.participant_user_id is None:
        db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction_id).delete(synchronize_session=False)
        db.commit()
        return {"ok": True}

    if payload.participant_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot split a transaction with yourself")

    participant = db.query(User).filter(User.id == payload.participant_user_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.share_ratio <= 0 or payload.share_ratio > 1:
        raise HTTPException(status_code=400, detail="Share ratio must be between 0 and 1")
    due_date = payload.due_date or (tx.date + timedelta(days=14))

    split = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction_id).first()
    if split:
        split.participant_user_id = payload.participant_user_id
        split.share_ratio = payload.share_ratio
        split.settlement_amount = abs(float(tx.amount)) * payload.share_ratio
        split.due_date = due_date
        split.paid_at = None
        split.payment_requested_at = None
        split.payment_requested_by_user_id = None
        split.note = payload.note
        split.category_id = find_matching_category_id(db, payload.participant_user_id, tx.description)
        split.status = ShareStatus.pending
        split.decline_message = None
        split.responded_at = None
    else:
        split = TransactionSplit(
            transaction_id=transaction_id,
            participant_user_id=payload.participant_user_id,
            category_id=find_matching_category_id(db, payload.participant_user_id, tx.description),
            status=ShareStatus.pending,
            decline_message=None,
            share_ratio=payload.share_ratio,
            settlement_amount=abs(float(tx.amount)) * payload.share_ratio,
            due_date=due_date,
            paid_at=None,
            payment_requested_at=None,
            payment_requested_by_user_id=None,
            note=payload.note,
            responded_at=None,
        )
        db.add(split)
    db.commit()
    return {"ok": True}


@router.patch("/splits/{split_id}")
def update_split(split_id: int, payload: SettlementUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    split = (
        db.query(TransactionSplit)
        .options(joinedload(TransactionSplit.transaction).joinedload(Transaction.account))
        .filter(TransactionSplit.id == split_id, TransactionSplit.status == ShareStatus.accepted)
        .first()
    )
    if not split or not split.transaction or not split.transaction.account:
        raise HTTPException(status_code=404, detail="Split not found")
    is_owner = split.transaction.account.user_id == current_user.id
    is_participant = split.participant_user_id == current_user.id
    if not is_owner and not is_participant:
        raise HTTPException(status_code=404, detail="Split not found")

    updates = payload.dict(exclude_unset=True)
    if "share_ratio" in updates:
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the owner can change split percentage")
        if updates["share_ratio"] <= 0 or updates["share_ratio"] > 1:
            raise HTTPException(status_code=400, detail="Share ratio must be between 0 and 1")
        split.share_ratio = updates["share_ratio"]
        split.settlement_amount = abs(float(split.transaction.amount)) * float(split.share_ratio)
    if "due_date" in updates:
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the owner can change due date")
        split.due_date = updates["due_date"]
    if "note" in updates:
        split.note = updates["note"]
    if "paid" in updates:
        if is_owner:
            split.paid_at = datetime.utcnow() if updates["paid"] else None
            split.payment_requested_at = None
            split.payment_requested_by_user_id = None
        elif is_participant:
            if updates["paid"]:
                split.payment_requested_at = datetime.utcnow()
                split.payment_requested_by_user_id = current_user.id
            else:
                split.payment_requested_at = None
                split.payment_requested_by_user_id = None

    db.commit()
    return {"ok": True}


@router.post("/import")
async def import_transactions(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    content = await file.read()
    try:
        return import_dnb_csv(content, account_id, db)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Importen inneholder duplikater eller ugyldige rader for databasen.")
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/apply-rules")
def apply_rules(account_id: Optional[int] = None, overwrite: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account_ids = None
    if account_id is not None:
        account = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
    else:
        account_ids = [account.id for account in db.query(Account.id).filter(Account.user_id == current_user.id).all()]
    updated = apply_rules_to_transactions(db, user_id=current_user.id, account_id=account_id, account_ids=account_ids, overwrite=overwrite)
    updated += apply_rules_to_transaction_splits(db, user_id=current_user.id, account_id=account_id, account_ids=account_ids, overwrite=overwrite)
    return {"updated": updated}


@router.get("/summary/monthly")
def monthly_summary(month: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    year, mon = month.split("-")
    own_results = (
        db.query(Category.id, Category.name, Category.color, Category.icon, func.sum(func.abs(Transaction.amount)).label("total"))
        .join(Transaction, Transaction.category_id == Category.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(
            Account.user_id == current_user.id,
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon),
            Transaction.amount < 0,
        )
        .group_by(Category.id, Category.name, Category.color, Category.icon)
        .all()
    )

    shared_results = (
        db.query(
            Category.id,
            Category.name,
            Category.color,
            Category.icon,
            func.sum(
                func.coalesce(
                    TransactionSplit.settlement_amount,
                    func.abs(Transaction.amount) * TransactionSplit.share_ratio,
                )
            ).label("total"),
        )
        .join(TransactionSplit, TransactionSplit.category_id == Category.id)
        .join(Transaction, TransactionSplit.transaction_id == Transaction.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(
            TransactionSplit.participant_user_id == current_user.id,
            TransactionSplit.status == ShareStatus.accepted,
            Account.user_id != current_user.id,
            extract("year", Transaction.date) == int(year),
            extract("month", Transaction.date) == int(mon),
            Transaction.amount < 0,
        )
        .group_by(Category.id, Category.name, Category.color, Category.icon)
        .all()
    )

    summary_by_category = {}
    for result in [*own_results, *shared_results]:
        category_id = result.id
        if category_id not in summary_by_category:
            summary_by_category[category_id] = {
                "category_id": category_id,
                "category_name": result.name,
                "color": result.color,
                "icon": result.icon,
                "total": 0,
            }
        summary_by_category[category_id]["total"] += abs(float(result.total or 0))

    return sorted(summary_by_category.values(), key=lambda item: item["total"], reverse=True)
