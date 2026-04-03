from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..auth import get_current_user
from ..database import Account, AssetShare, Goal, GoalShare, ShareStatus, Transaction, TransactionSplit, User, get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


class ShareResponse(BaseModel):
    action: str
    message: Optional[str] = None


def serialize_asset_request(share: AssetShare, current_user_id: int):
    owner = None
    if share.owner_user_id:
        owner = share.owner_user_id
    is_recipient = share.shared_user_id == current_user_id
    return {
        "id": share.id,
        "type": "asset_share",
        "status": share.status.value,
        "asset_name": share.asset_name,
        "owner_user_id": share.owner_user_id,
        "owner_name": share.owner.name if hasattr(share, "owner") and share.owner else None,
        "shared_user_id": share.shared_user_id,
        "shared_user_name": share.shared_user.name if share.shared_user else None,
        "message": share.decline_message,
        "created_at": share.created_at.isoformat() if share.created_at else None,
        "responded_at": share.responded_at.isoformat() if share.responded_at else None,
        "direction": "incoming" if is_recipient else "outgoing",
    }


def serialize_transaction_request(split: TransactionSplit, current_user_id: int):
    tx = split.transaction
    owner = tx.account.user if tx and tx.account else None
    is_recipient = split.participant_user_id == current_user_id
    return {
        "id": split.id,
        "type": "transaction_share",
        "status": split.status.value,
        "transaction_id": split.transaction_id,
        "description": tx.description if tx else None,
        "transaction_date": tx.date.isoformat() if tx else None,
        "amount": float(tx.amount) if tx else None,
        "settlement_amount": float(split.settlement_amount) if split.settlement_amount is not None else None,
        "owner_user_id": owner.id if owner else None,
        "owner_name": owner.name if owner else None,
        "shared_user_id": split.participant_user_id,
        "shared_user_name": split.participant.name if split.participant else None,
        "message": split.decline_message,
        "created_at": split.created_at.isoformat() if split.created_at else None,
        "responded_at": split.responded_at.isoformat() if split.responded_at else None,
        "direction": "incoming" if is_recipient else "outgoing",
    }


def serialize_goal_request(share: GoalShare, current_user_id: int):
    is_recipient = share.user_id == current_user_id
    return {
        "id": share.id,
        "type": "goal_share",
        "status": share.status.value,
        "goal_id": share.goal_id,
        "goal_name": share.goal.name if share.goal else None,
        "owner_user_id": share.goal.user_id if share.goal else None,
        "owner_name": share.goal.user.name if share.goal and share.goal.user else None,
        "shared_user_id": share.user_id,
        "shared_user_name": share.user.name if share.user else None,
        "message": share.decline_message,
        "created_at": share.created_at.isoformat() if share.created_at else None,
        "responded_at": share.responded_at.isoformat() if share.responded_at else None,
        "direction": "incoming" if is_recipient else "outgoing",
    }


@router.get("/")
def list_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    incoming_asset_requests = (
        db.query(AssetShare)
        .options(joinedload(AssetShare.shared_user))
        .join(User, AssetShare.owner_user_id == User.id)
        .filter(AssetShare.shared_user_id == current_user.id, AssetShare.status == ShareStatus.pending)
        .all()
    )
    for share in incoming_asset_requests:
        share.owner = db.query(User).filter(User.id == share.owner_user_id).first()

    outgoing_asset_updates = (
        db.query(AssetShare)
        .options(joinedload(AssetShare.shared_user))
        .join(User, AssetShare.shared_user_id == User.id)
        .filter(
            AssetShare.owner_user_id == current_user.id,
            AssetShare.status.in_([ShareStatus.pending, ShareStatus.declined]),
        )
        .all()
    )
    for share in outgoing_asset_updates:
        share.owner = current_user

    incoming_transaction_requests = (
        db.query(TransactionSplit)
        .options(
            joinedload(TransactionSplit.participant),
            joinedload(TransactionSplit.transaction).joinedload(Transaction.account).joinedload(Account.user),
        )
        .filter(TransactionSplit.participant_user_id == current_user.id, TransactionSplit.status == ShareStatus.pending)
        .all()
    )

    outgoing_transaction_updates = (
        db.query(TransactionSplit)
        .options(
            joinedload(TransactionSplit.participant),
            joinedload(TransactionSplit.transaction).joinedload(Transaction.account).joinedload(Account.user),
        )
        .join(Transaction, TransactionSplit.transaction_id == Transaction.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(
            Account.user_id == current_user.id,
            TransactionSplit.status.in_([ShareStatus.pending, ShareStatus.declined]),
        )
        .all()
    )

    incoming_goal_requests = (
        db.query(GoalShare)
        .options(
            joinedload(GoalShare.user),
            joinedload(GoalShare.goal).joinedload(Goal.user),
        )
        .filter(GoalShare.user_id == current_user.id, GoalShare.status == ShareStatus.pending)
        .all()
    )

    outgoing_goal_updates = (
        db.query(GoalShare)
        .options(
            joinedload(GoalShare.user),
            joinedload(GoalShare.goal).joinedload(Goal.user),
        )
        .join(Goal, GoalShare.goal_id == Goal.id)
        .filter(
            Goal.user_id == current_user.id,
            GoalShare.status.in_([ShareStatus.pending, ShareStatus.declined]),
        )
        .all()
    )

    items = [
        *[serialize_asset_request(share, current_user.id) for share in incoming_asset_requests],
        *[serialize_asset_request(share, current_user.id) for share in outgoing_asset_updates],
        *[serialize_transaction_request(split, current_user.id) for split in incoming_transaction_requests],
        *[serialize_transaction_request(split, current_user.id) for split in outgoing_transaction_updates],
        *[serialize_goal_request(share, current_user.id) for share in incoming_goal_requests],
        *[serialize_goal_request(share, current_user.id) for share in outgoing_goal_updates],
    ]
    items.sort(key=lambda item: item["responded_at"] or item["created_at"] or "", reverse=True)
    return items


@router.get("/count")
def notification_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pending_assets = db.query(AssetShare.id).filter(
        AssetShare.shared_user_id == current_user.id,
        AssetShare.status == ShareStatus.pending,
    ).count()
    pending_transactions = db.query(TransactionSplit.id).filter(
        TransactionSplit.participant_user_id == current_user.id,
        TransactionSplit.status == ShareStatus.pending,
    ).count()
    pending_goals = db.query(GoalShare.id).filter(
        GoalShare.user_id == current_user.id,
        GoalShare.status == ShareStatus.pending,
    ).count()
    return {"pending_count": pending_assets + pending_transactions + pending_goals}


@router.post("/{notification_type}/{notification_id}/respond")
def respond_to_notification(
    notification_type: str,
    notification_id: int,
    payload: ShareResponse,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    action = payload.action.lower().strip()
    if action not in {"accept", "decline"}:
        raise HTTPException(status_code=400, detail="Action must be accept or decline")
    if action == "decline" and not (payload.message or "").strip():
        raise HTTPException(status_code=400, detail="Forklaring er påkrevd når du avslår.")

    if notification_type == "asset_share":
        share = db.query(AssetShare).filter(
            AssetShare.id == notification_id,
            AssetShare.shared_user_id == current_user.id,
            AssetShare.status == ShareStatus.pending,
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="Share request not found")
        share.status = ShareStatus.accepted if action == "accept" else ShareStatus.declined
        share.decline_message = payload.message.strip() if action == "decline" else None
        share.responded_at = datetime.utcnow()
    elif notification_type == "transaction_share":
        split = db.query(TransactionSplit).filter(
            TransactionSplit.id == notification_id,
            TransactionSplit.participant_user_id == current_user.id,
            TransactionSplit.status == ShareStatus.pending,
        ).first()
        if not split:
            raise HTTPException(status_code=404, detail="Share request not found")
        split.status = ShareStatus.accepted if action == "accept" else ShareStatus.declined
        split.decline_message = payload.message.strip() if action == "decline" else None
        split.responded_at = datetime.utcnow()
    elif notification_type == "goal_share":
        share = db.query(GoalShare).filter(
            GoalShare.id == notification_id,
            GoalShare.user_id == current_user.id,
            GoalShare.status == ShareStatus.pending,
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="Share request not found")
        share.status = ShareStatus.accepted if action == "accept" else ShareStatus.declined
        share.decline_message = payload.message.strip() if action == "decline" else None
        share.responded_at = datetime.utcnow()
    else:
        raise HTTPException(status_code=404, detail="Unknown notification type")

    db.commit()
    return {"ok": True}


@router.delete("/{notification_type}/{notification_id}")
def withdraw_notification(
    notification_type: str,
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if notification_type == "asset_share":
        share = db.query(AssetShare).filter(
            AssetShare.id == notification_id,
            AssetShare.owner_user_id == current_user.id,
            AssetShare.status == ShareStatus.pending,
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="Pending share request not found")
        db.delete(share)
    elif notification_type == "transaction_share":
        split = (
            db.query(TransactionSplit)
            .join(Transaction, TransactionSplit.transaction_id == Transaction.id)
            .join(Account, Transaction.account_id == Account.id)
            .filter(
                TransactionSplit.id == notification_id,
                Account.user_id == current_user.id,
                TransactionSplit.status == ShareStatus.pending,
            )
            .first()
        )
        if not split:
            raise HTTPException(status_code=404, detail="Pending share request not found")
        db.delete(split)
    elif notification_type == "goal_share":
        share = (
            db.query(GoalShare)
            .join(Goal, GoalShare.goal_id == Goal.id)
            .filter(
                GoalShare.id == notification_id,
                Goal.user_id == current_user.id,
                GoalShare.status == ShareStatus.pending,
            )
            .first()
        )
        if not share:
            raise HTTPException(status_code=404, detail="Pending share request not found")
        db.delete(share)
    else:
        raise HTTPException(status_code=404, detail="Unknown notification type")

    db.commit()
    return {"ok": True}


@router.post("/{notification_type}/{notification_id}/leave")
def leave_shared_item(
    notification_type: str,
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if notification_type == "asset_share":
        share = db.query(AssetShare).filter(
            AssetShare.id == notification_id,
            AssetShare.shared_user_id == current_user.id,
            AssetShare.status == ShareStatus.accepted,
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="Shared item not found")
        db.delete(share)
    elif notification_type == "transaction_share":
        split = db.query(TransactionSplit).filter(
            TransactionSplit.id == notification_id,
            TransactionSplit.participant_user_id == current_user.id,
            TransactionSplit.status == ShareStatus.accepted,
        ).first()
        if not split:
            raise HTTPException(status_code=404, detail="Shared item not found")
        db.delete(split)
    elif notification_type == "goal_share":
        share = db.query(GoalShare).filter(
            GoalShare.id == notification_id,
            GoalShare.user_id == current_user.id,
            GoalShare.status == ShareStatus.accepted,
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="Shared item not found")
        db.delete(share)
    else:
        raise HTTPException(status_code=404, detail="Unknown notification type")

    db.commit()
    return {"ok": True}
