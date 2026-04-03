from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..auth import get_current_user
from ..database import get_db, Account, AccountType
from ..database import User

router = APIRouter(prefix="/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    name: str
    bank: str = "DNB"
    account_type: AccountType = AccountType.checking
    account_number: Optional[str] = None


@router.get("/")
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "bank": a.bank,
            "account_type": a.account_type,
            "account_number": a.account_number,
        }
        for a in accounts
    ]


@router.post("/")
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = Account(**payload.dict(), user_id=current_user.id)
    db.add(account)
    db.commit()
    db.refresh(account)
    return {"id": account.id, "name": account.name}


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return {"ok": True}
