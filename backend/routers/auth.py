from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import authenticate_user, create_access_token, get_current_user, hash_password
from ..database import FamilyInvite, TrustedContact, User, get_db
from ..services.category_setup import ensure_user_categories

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginPayload(BaseModel):
    email: str
    password: str


class RegisterPayload(BaseModel):
    name: str
    email: str
    password: str
    invite_token: str


def serialize_user(user: User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "onboarding_completed": user.onboarding_completed,
        "is_active": user.is_active,
    }


def ensure_trusted_pair(db: Session, user_a_id: int, user_b_id: int):
    if user_a_id == user_b_id:
        return
    existing = {
        (row.user_id, row.contact_user_id)
        for row in db.query(TrustedContact)
        .filter(
            TrustedContact.user_id.in_([user_a_id, user_b_id]),
            TrustedContact.contact_user_id.in_([user_a_id, user_b_id]),
        )
        .all()
    }
    if (user_a_id, user_b_id) not in existing:
        db.add(TrustedContact(user_id=user_a_id, contact_user_id=user_b_id))
    if (user_b_id, user_a_id) not in existing:
        db.add(TrustedContact(user_id=user_b_id, contact_user_id=user_a_id))


@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    ensure_user_categories(db, user.id)
    return {
        "token": create_access_token(user),
        "user": serialize_user(user),
    }


@router.post("/register")
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email must be valid")
    invite = (
        db.query(FamilyInvite)
        .filter(FamilyInvite.invite_token == payload.invite_token.strip(), FamilyInvite.status == "pending")
        .first()
    )
    if not invite:
        raise HTTPException(status_code=400, detail="Invite code is not valid")
    if invite.invite_email.strip().lower() != email:
        raise HTTPException(status_code=400, detail="Invite code does not match this email")

    existing = db.query(User).filter(User.email == email).first()
    if existing and existing.password_hash != "phase1-no-auth":
        raise HTTPException(status_code=400, detail="Email is already in use")

    password_hash = hash_password(payload.password)

    if existing:
        existing.name = payload.name.strip()
        existing.password_hash = password_hash
        existing.auth_token_version = int(existing.auth_token_version) + 1
        existing.is_active = True
        existing.deactivated_at = None
        user = existing
    else:
        user = User(
            name=payload.name.strip(),
            email=email,
            password_hash=password_hash,
            auth_token_version=1,
            is_active=True,
        )
        db.add(user)

    db.flush()
    invite.status = "accepted"
    invite.accepted_at = datetime.utcnow()
    ensure_trusted_pair(db, invite.inviter_user_id, user.id)
    db.commit()
    db.refresh(user)
    ensure_user_categories(db, user.id)
    return {
        "token": create_access_token(user),
        "user": serialize_user(user),
    }


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.auth_token_version = int(current_user.auth_token_version) + 1
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return serialize_user(current_user)
