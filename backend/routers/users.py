from datetime import datetime
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user, hash_password, verify_password
from ..database import FamilyInvite, TrustedContact, User, get_db

router = APIRouter(prefix="/users", tags=["users"])


class OnboardingUpdate(BaseModel):
    onboarding_completed: bool = True


class ProfileUpdate(BaseModel):
    name: str
    email: str
    vipps_phone: Optional[str] = None


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


class DeactivatePayload(BaseModel):
    password: str


class InviteCreate(BaseModel):
    name: str
    email: str


def serialize_user(user: User, trusted_ids: Optional[set[int]] = None):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "vipps_phone": user.vipps_phone,
        "is_trusted": user.id in (trusted_ids or set()),
    }


def serialize_invite(invite: FamilyInvite):
    return {
        "id": invite.id,
        "name": invite.invite_name,
        "email": invite.invite_email,
        "invite_token": invite.invite_token,
        "status": invite.status,
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
        "accepted_at": invite.accepted_at.isoformat() if invite.accepted_at else None,
    }


def trusted_contact_ids(user_id: int, db: Session):
    return {
        row.contact_user_id
        for row in db.query(TrustedContact).filter(TrustedContact.user_id == user_id).all()
    }


@router.get("/")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trusted_ids = trusted_contact_ids(current_user.id, db)
    users = (
        db.query(User)
        .filter(User.is_active == True)
        .order_by(User.name.asc(), User.id.asc())
        .all()
    )
    return [serialize_user(user, trusted_ids) for user in users]


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "vipps_phone": current_user.vipps_phone,
        "onboarding_completed": current_user.onboarding_completed,
        "is_active": current_user.is_active,
    }


@router.patch("/me")
def update_me(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email must be valid")
    existing = db.query(User).filter(User.email == email, User.id != current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already in use")
    current_user.name = payload.name.strip()
    current_user.email = email
    current_user.vipps_phone = payload.vipps_phone.strip() if payload.vipps_phone else None
    db.commit()
    return {"ok": True}


@router.patch("/me/password")
def change_password(
    payload: PasswordUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    current_user.auth_token_version = int(current_user.auth_token_version) + 1
    db.commit()
    return {"ok": True}


@router.post("/me/deactivate")
def deactivate_account(
    payload: DeactivatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    current_user.is_active = False
    current_user.deactivated_at = datetime.utcnow()
    current_user.auth_token_version = int(current_user.auth_token_version) + 1
    db.commit()
    return {"ok": True}


@router.patch("/me/onboarding")
def update_onboarding(
    payload: OnboardingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.onboarding_completed = payload.onboarding_completed
    db.commit()
    return {"ok": True}


@router.get("/me/trusted")
def get_trusted_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trusted_ids = trusted_contact_ids(current_user.id, db)
    if not trusted_ids:
        return []
    users = (
        db.query(User)
        .filter(User.id.in_(trusted_ids), User.is_active == True)
        .order_by(User.name.asc())
        .all()
    )
    return [serialize_user(user, trusted_ids) for user in users]


@router.get("/me/invites")
def list_invites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invites = (
        db.query(FamilyInvite)
        .filter(FamilyInvite.inviter_user_id == current_user.id)
        .order_by(FamilyInvite.created_at.desc(), FamilyInvite.id.desc())
        .all()
    )
    return [serialize_invite(invite) for invite in invites]


@router.post("/me/invites")
def create_invite(
    payload: InviteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email must be valid")
    if email == current_user.email:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")
    existing_active = db.query(User).filter(User.email == email, User.is_active == True).first()
    if existing_active:
        raise HTTPException(status_code=400, detail="This person already has an active account")
    invite = FamilyInvite(
        inviter_user_id=current_user.id,
        invite_email=email,
        invite_name=payload.name.strip(),
        invite_token=secrets.token_urlsafe(8),
        status="pending",
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return serialize_invite(invite)


@router.delete("/me/invites/{invite_id}")
def revoke_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite = (
        db.query(FamilyInvite)
        .filter(FamilyInvite.id == invite_id, FamilyInvite.inviter_user_id == current_user.id)
        .first()
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending invites can be revoked")
    invite.status = "revoked"
    db.commit()
    return {"ok": True}
