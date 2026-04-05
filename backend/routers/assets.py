from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import Asset, AssetShare, AssetType, ShareStatus, User, get_db

router = APIRouter(prefix="/assets", tags=["assets"])


class SharedUserIn(BaseModel):
    user_id: int
    share_ratio: float = 0.5

    @field_validator("share_ratio")
    @classmethod
    def ratio_must_be_valid(cls, v):
        if not (0 < v < 1):
            raise ValueError("share_ratio must be between 0 and 1 (exclusive)")
        return round(v, 4)


class AssetCreate(BaseModel):
    name: str
    asset_type: AssetType
    value: float
    recorded_date: date
    notes: Optional[str] = None
    shared_users: list[SharedUserIn] = Field(default_factory=list)


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[AssetType] = None
    value: Optional[float] = None
    recorded_date: Optional[date] = None
    notes: Optional[str] = None
    shared_users: Optional[list[SharedUserIn]] = None


class ShareRatioUpdate(BaseModel):
    share_ratio: float

    @field_validator("share_ratio")
    @classmethod
    def ratio_must_be_valid(cls, v):
        if not (0 < v < 1):
            raise ValueError("share_ratio must be between 0 and 1 (exclusive)")
        return round(v, 4)


def validate_shared_users(current_user_id: int, shared_users: list[SharedUserIn], db: Session):
    if not shared_users:
        return
    user_ids = [su.user_id for su in shared_users]
    if current_user_id in user_ids:
        raise HTTPException(status_code=400, detail="You do not need to share with yourself")
    total_ratio = sum(su.share_ratio for su in shared_users)
    if total_ratio >= 1.0:
        raise HTTPException(status_code=400, detail="Total share ratio cannot be 100% or more — owner must retain a portion")
    existing = {row[0] for row in db.query(User.id).filter(User.id.in_(user_ids)).all()}
    missing = [str(uid) for uid in user_ids if uid not in existing]
    if missing:
        raise HTTPException(status_code=404, detail=f"Users not found: {', '.join(missing)}")


def sync_asset_shares(owner_user_id: int, asset_name: str, shared_users: list[SharedUserIn], db: Session):
    shared_user_map = {su.user_id: su.share_ratio for su in shared_users}
    existing = {
        share.shared_user_id: share
        for share in db.query(AssetShare)
        .filter(AssetShare.owner_user_id == owner_user_id, AssetShare.asset_name == asset_name)
        .all()
    }
    for shared_user_id, share in existing.items():
        if shared_user_id not in shared_user_map:
            db.delete(share)
    for shared_user_id, ratio in shared_user_map.items():
        if shared_user_id not in existing:
            db.add(AssetShare(
                owner_user_id=owner_user_id,
                shared_user_id=shared_user_id,
                asset_name=asset_name,
                share_ratio=ratio,
                status=ShareStatus.pending,
                decline_message=None,
                responded_at=None,
            ))
        else:
            share = existing[shared_user_id]
            share.share_ratio = ratio
            if share.status == ShareStatus.declined:
                share.status = ShareStatus.pending
                share.decline_message = None
                share.responded_at = None


def shares_for_owner(owner_user_id: int, db: Session):
    """Returns accepted+pending shares for owner, keyed by asset_name."""
    rows = db.query(AssetShare).filter(AssetShare.owner_user_id == owner_user_id).all()
    by_name = {}
    for row in rows:
        if row.status == ShareStatus.declined:
            continue
        by_name.setdefault(row.asset_name, []).append({
            "share_id": row.id,
            "user_id": row.shared_user_id,
            "share_ratio": float(row.share_ratio),
            "status": row.status.value,
        })
    return by_name


def owner_ratio(shares: list[dict]) -> float:
    """Owner keeps whatever isn't allocated to shared users."""
    return 1.0 - sum(s["share_ratio"] for s in shares if s["status"] == ShareStatus.accepted.value)


def latest_assets_for_user(user_id: int, db: Session):
    latest_dates = (
        db.query(Asset.name, func.max(Asset.recorded_date).label("latest_date"))
        .filter(Asset.user_id == user_id)
        .group_by(Asset.name)
        .subquery()
    )
    latest_rows = (
        db.query(Asset.name, func.max(Asset.id).label("latest_id"))
        .join(
            latest_dates,
            (Asset.name == latest_dates.c.name) & (Asset.recorded_date == latest_dates.c.latest_date),
        )
        .filter(Asset.user_id == user_id)
        .group_by(Asset.name)
        .subquery()
    )
    return (
        db.query(Asset)
        .join(latest_rows, Asset.id == latest_rows.c.latest_id)
        .filter(Asset.user_id == user_id)
        .order_by(Asset.name.asc())
        .all()
    )


@router.get("/")
def list_assets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    owned_assets = latest_assets_for_user(current_user.id, db)
    owned_share_map = shares_for_owner(current_user.id, db)

    # Accepted shares where current user is the recipient
    accepted_links = (
        db.query(AssetShare)
        .filter(AssetShare.shared_user_id == current_user.id, AssetShare.status == ShareStatus.accepted)
        .all()
    )

    # Fetch shared assets
    shared_assets = []
    if accepted_links:
        owner_ids = {link.owner_user_id for link in accepted_links}
        owner_names = {u.id: u.name for u in db.query(User).filter(User.id.in_(owner_ids)).all()}
        for link in accepted_links:
            asset = (
                db.query(Asset)
                .filter(Asset.user_id == link.owner_user_id, Asset.name == link.asset_name)
                .order_by(Asset.recorded_date.desc(), Asset.id.desc())
                .first()
            )
            if asset:
                shared_assets.append((asset, owner_names.get(link.owner_user_id), link))

    # Serialize owned assets — apply owner's ratio to displayed value
    serialized_owned = []
    for asset in owned_assets:
        shares = owned_share_map.get(asset.name, [])
        my_ratio = owner_ratio(shares)
        raw_value = float(asset.value)
        effective_value = raw_value * my_ratio
        serialized_owned.append({
            "id": asset.id,
            "name": asset.name,
            "asset_type": asset.asset_type,
            "raw_value": raw_value,
            "value": round(effective_value, 2),
            "recorded_date": asset.recorded_date.isoformat(),
            "notes": asset.notes,
            "owner_user_id": current_user.id,
            "owner_name": current_user.name,
            "is_shared_view": False,
            "share_id": None,
            "shared_users": shares,
            "shared_user_ids": [s["user_id"] for s in shares],
            "my_ratio": round(my_ratio, 4),
        })

    # Serialize shared assets — apply the recipient's ratio to displayed value
    serialized_shared = []
    for asset, owner_name, link in shared_assets:
        raw_value = float(asset.value)
        effective_value = raw_value * float(link.share_ratio)
        serialized_shared.append({
            "id": asset.id,
            "name": asset.name,
            "asset_type": asset.asset_type,
            "raw_value": raw_value,
            "value": round(effective_value, 2),
            "recorded_date": asset.recorded_date.isoformat(),
            "notes": asset.notes,
            "owner_user_id": asset.user_id,
            "owner_name": owner_name,
            "is_shared_view": True,
            "share_id": link.id,
            "shared_users": [],
            "shared_user_ids": [],
            "my_ratio": round(float(link.share_ratio), 4),
        })

    all_assets = serialized_owned + serialized_shared
    total = sum(a["value"] for a in all_assets)
    by_type: dict = {}
    for a in all_assets:
        key = a["asset_type"].value if hasattr(a["asset_type"], "value") else a["asset_type"]
        by_type[key] = by_type.get(key, 0) + a["value"]

    return {"total_net_worth": total, "by_type": by_type, "assets": all_assets}


@router.get("/net-worth-history")
def net_worth_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    owned_snapshots = (
        db.query(Asset)
        .filter(Asset.user_id == current_user.id)
        .order_by(Asset.recorded_date.asc(), Asset.id.asc())
        .all()
    )

    # For history we need to know the ratio at the time — use the current ratio as best approximation
    accepted_links = (
        db.query(AssetShare)
        .filter(AssetShare.shared_user_id == current_user.id, AssetShare.status == ShareStatus.accepted)
        .all()
    )
    link_map = {(link.owner_user_id, link.asset_name): float(link.share_ratio) for link in accepted_links}

    shared_snapshots = []
    for link in accepted_links:
        snaps = (
            db.query(Asset)
            .filter(Asset.user_id == link.owner_user_id, Asset.name == link.asset_name)
            .order_by(Asset.recorded_date.asc(), Asset.id.asc())
            .all()
        )
        shared_snapshots.extend(snaps)

    # Build per-asset-key latest values per date, then apply ratios
    # Key: (user_id, name, is_owned)
    all_snaps = [(s, True) for s in owned_snapshots] + [(s, False) for s in shared_snapshots]
    all_snaps.sort(key=lambda x: (x[0].recorded_date, x[0].id))

    if not all_snaps:
        return []

    # Aggregate net worth per date
    dates = sorted({s.recorded_date for s, _ in all_snaps})
    latest_by_key: dict = {}

    # Build share map for owned assets (current ratios)
    owned_share_map = shares_for_owner(current_user.id, db)

    history = []
    snap_by_date: dict = {}
    for snap, is_owned in all_snaps:
        snap_by_date.setdefault(snap.recorded_date, []).append((snap, is_owned))

    for d in dates:
        for snap, is_owned in snap_by_date[d]:
            key = f"{'own' if is_owned else 'shared'}:{snap.user_id}:{snap.name}"
            latest_by_key[key] = (snap, is_owned)

        effective_values = []
        for key, (snap, is_owned) in latest_by_key.items():
            raw = float(snap.value)
            if is_owned:
                shares = owned_share_map.get(snap.name, [])
                ratio = owner_ratio(shares)
            else:
                ratio = link_map.get((snap.user_id, snap.name), 0.5)
            effective_values.append(raw * ratio)

        assets_total = sum(v for v in effective_values if v > 0)
        debt_total = abs(sum(v for v in effective_values if v < 0))
        history.append({
            "date": d.isoformat(),
            "total": round(sum(effective_values), 2),
            "assets": round(assets_total, 2),
            "debt": round(debt_total, 2),
        })

    return history


@router.get("/history/{owner_user_id}/{asset_name}")
def asset_history(owner_user_id: int, asset_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    allowed = owner_user_id == current_user.id or db.query(AssetShare).filter(
        AssetShare.owner_user_id == owner_user_id,
        AssetShare.shared_user_id == current_user.id,
        AssetShare.asset_name == asset_name,
        AssetShare.status == ShareStatus.accepted,
    ).first()
    if not allowed:
        raise HTTPException(status_code=404, detail="Asset not found")
    records = (
        db.query(Asset)
        .filter(Asset.user_id == owner_user_id, Asset.name == asset_name)
        .order_by(Asset.recorded_date.asc())
        .all()
    )
    return [
        {
            "id": record.id,
            "name": record.name,
            "asset_type": record.asset_type,
            "date": record.recorded_date.isoformat(),
            "value": float(record.value),
            "notes": record.notes,
            "owner_user_id": owner_user_id,
        }
        for record in records
    ]


@router.patch("/shares/{share_id}/ratio")
def update_share_ratio(
    share_id: int,
    payload: ShareRatioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Only the asset owner can update the split ratio."""
    share = db.query(AssetShare).filter(AssetShare.id == share_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the asset owner can change the split ratio")

    # Validate: sum of all ratios for this asset must stay below 1.0
    other_ratios = (
        db.query(func.sum(AssetShare.share_ratio))
        .filter(
            AssetShare.owner_user_id == current_user.id,
            AssetShare.asset_name == share.asset_name,
            AssetShare.id != share_id,
            AssetShare.status != ShareStatus.declined,
        )
        .scalar() or 0
    )
    if float(other_ratios) + payload.share_ratio >= 1.0:
        raise HTTPException(status_code=400, detail="Total share ratio cannot reach 100% — owner must retain a portion")

    share.share_ratio = payload.share_ratio
    db.commit()
    return {"ok": True, "share_ratio": payload.share_ratio}


@router.post("/")
def record_asset(payload: AssetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    validate_shared_users(current_user.id, payload.shared_users, db)
    asset = Asset(
        name=payload.name,
        asset_type=payload.asset_type,
        value=payload.value,
        recorded_date=payload.recorded_date,
        notes=payload.notes,
        user_id=current_user.id,
    )
    db.add(asset)
    db.flush()
    sync_asset_shares(current_user.id, payload.name, payload.shared_users, db)
    db.commit()
    db.refresh(asset)
    return {"id": asset.id}


@router.patch("/{asset_id}")
def update_asset(asset_id: int, payload: AssetUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    updates = payload.dict(exclude_unset=True)
    shared_users = updates.pop("shared_users", None)
    if shared_users is not None:
        validate_shared_users(current_user.id, shared_users, db)

    original_name = asset.name
    if "name" in updates or "asset_type" in updates:
        series_updates = {}
        if "name" in updates:
            series_updates["name"] = updates["name"]
        if "asset_type" in updates:
            series_updates["asset_type"] = updates["asset_type"]
        db.query(Asset).filter(Asset.user_id == asset.user_id, Asset.name == original_name).update(series_updates, synchronize_session=False)
        if "name" in updates:
            db.query(AssetShare).filter(AssetShare.owner_user_id == asset.user_id, AssetShare.asset_name == original_name).update(
                {"asset_name": updates["name"]}, synchronize_session=False,
            )

    for key, value in updates.items():
        if key in {"name", "asset_type"}:
            continue
        setattr(asset, key, value)

    if shared_users is not None:
        sync_asset_shares(asset.user_id, updates.get("name", original_name), shared_users, db)

    db.commit()
    return {"ok": True}


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    return {"ok": True}
