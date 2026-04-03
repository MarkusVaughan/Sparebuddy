from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db, Account, AccountType

router = APIRouter(prefix="/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    name: str
    bank: str = "DNB"
    account_type: AccountType = AccountType.checking
    account_number: Optional[str] = None
    user_id: int = 1  # Default to first user until auth is implemented


@router.get("/")
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(Account).all()
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
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    account = Account(**payload.dict())
    db.add(account)
    db.commit()
    db.refresh(account)
    return {"id": account.id, "name": account.name}


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return {"ok": True}
