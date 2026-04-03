from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import Asset, AssetShare, AssetType, ShareStatus, User, get_db

router = APIRouter(prefix="/assets", tags=["assets"])


class AssetCreate(BaseModel):
    name: str
    asset_type: AssetType
    value: float
    recorded_date: date
    notes: Optional[str] = None
    shared_user_ids: list[int] = Field(default_factory=list)


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[AssetType] = None
    value: Optional[float] = None
    recorded_date: Optional[date] = None
    notes: Optional[str] = None
    shared_user_ids: Optional[list[int]] = None


def validate_shared_users(current_user_id: int, shared_user_ids: list[int], db: Session):
    if not shared_user_ids:
        return
    if current_user_id in shared_user_ids:
        raise HTTPException(status_code=400, detail="You do not need to share with yourself")
    existing = {
        row[0]
        for row in db.query(User.id).filter(User.id.in_(shared_user_ids)).all()
    }
    missing = [str(user_id) for user_id in shared_user_ids if user_id not in existing]
    if missing:
        raise HTTPException(status_code=404, detail=f"Users not found: {', '.join(missing)}")


def sync_asset_shares(owner_user_id: int, asset_name: str, shared_user_ids: list[int], db: Session):
    existing = {
        share.shared_user_id: share
        for share in db.query(AssetShare)
        .filter(AssetShare.owner_user_id == owner_user_id, AssetShare.asset_name == asset_name)
        .all()
    }
    for shared_user_id, share in existing.items():
        if shared_user_id not in shared_user_ids:
            db.delete(share)
    for shared_user_id in shared_user_ids:
        if shared_user_id not in existing:
            db.add(AssetShare(
                owner_user_id=owner_user_id,
                shared_user_id=shared_user_id,
                asset_name=asset_name,
                status=ShareStatus.pending,
                decline_message=None,
                responded_at=None,
            ))
        else:
            share = existing[shared_user_id]
            if share.status == ShareStatus.declined:
                share.status = ShareStatus.pending
                share.decline_message = None
                share.responded_at = None


def shares_for_owner(owner_user_id: int, db: Session):
    rows = (
        db.query(AssetShare)
        .filter(AssetShare.owner_user_id == owner_user_id)
        .all()
    )
    by_name = {}
    for row in rows:
        if row.status == ShareStatus.declined:
            continue
        by_name.setdefault(row.asset_name, []).append({
            "user_id": row.shared_user_id,
            "status": row.status.value,
        })
    return by_name


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
    shared_links = (
        db.query(AssetShare)
        .filter(AssetShare.shared_user_id == current_user.id, AssetShare.status == ShareStatus.accepted)
        .all()
    )
    shared_requests = {(link.owner_user_id, link.asset_name) for link in shared_links}
    shared_assets = []
    if shared_requests:
      owners = {owner_user_id for owner_user_id, _ in shared_requests}
      owner_names = {user.id: user.name for user in db.query(User).filter(User.id.in_(owners)).all()}
      for owner_user_id, asset_name in shared_requests:
          asset = (
              db.query(Asset)
              .filter(Asset.user_id == owner_user_id, Asset.name == asset_name)
              .order_by(Asset.recorded_date.desc(), Asset.id.desc())
              .first()
          )
          if asset:
              shared_assets.append((asset, owner_names.get(owner_user_id)))
    owned_share_map = shares_for_owner(current_user.id, db)

    serialized_owned = [
        {
            "id": asset.id,
            "name": asset.name,
            "asset_type": asset.asset_type,
            "value": asset.value,
            "recorded_date": asset.recorded_date.isoformat(),
            "notes": asset.notes,
            "owner_user_id": current_user.id,
            "owner_name": current_user.name,
            "is_shared_view": False,
            "shared_user_ids": [share["user_id"] for share in owned_share_map.get(asset.name, [])],
            "shared_users": owned_share_map.get(asset.name, []),
            "share_id": None,
        }
        for asset in owned_assets
    ]
    serialized_shared = [
        {
            "id": asset.id,
            "name": asset.name,
            "asset_type": asset.asset_type,
            "value": asset.value,
            "recorded_date": asset.recorded_date.isoformat(),
            "notes": asset.notes,
            "owner_user_id": asset.user_id,
            "owner_name": owner_name,
            "is_shared_view": True,
            "shared_user_ids": [],
            "shared_users": [],
            "share_id": (
                db.query(AssetShare.id)
                .filter(
                    AssetShare.owner_user_id == asset.user_id,
                    AssetShare.shared_user_id == current_user.id,
                    AssetShare.asset_name == asset.name,
                    AssetShare.status == ShareStatus.accepted,
                )
                .scalar()
            ),
        }
        for asset, owner_name in shared_assets
    ]

    all_assets = serialized_owned + serialized_shared
    total = sum(asset["value"] for asset in all_assets)

    by_type = {}
    for asset in all_assets:
        by_type.setdefault(asset["asset_type"].value, 0)
        by_type[asset["asset_type"].value] += asset["value"]

    return {
        "total_net_worth": total,
        "by_type": by_type,
        "assets": all_assets,
    }


@router.get("/net-worth-history")
def net_worth_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    snapshots = (
        db.query(Asset)
        .filter(Asset.user_id == current_user.id)
        .order_by(Asset.recorded_date.asc(), Asset.id.asc())
        .all()
    )
    shared_links = db.query(AssetShare).filter(AssetShare.shared_user_id == current_user.id).all()
    for link in shared_links:
        if link.status != ShareStatus.accepted:
            continue
        snapshots.extend(
            db.query(Asset)
            .filter(Asset.user_id == link.owner_user_id, Asset.name == link.asset_name)
            .order_by(Asset.recorded_date.asc(), Asset.id.asc())
            .all()
        )
    if not snapshots:
        return []

    snapshots.sort(key=lambda asset: (asset.recorded_date, asset.id))
    snapshots_by_key = {}
    for snapshot in snapshots:
        key = f"{snapshot.user_id}:{snapshot.name}"
        snapshots_by_key.setdefault(snapshot.recorded_date, []).append((key, snapshot))

    latest_by_key = {}
    history = []
    for recorded_date in sorted(snapshots_by_key.keys()):
        for key, snapshot in snapshots_by_key[recorded_date]:
            latest_by_key[key] = snapshot
        latest_values = [float(snapshot.value) for snapshot in latest_by_key.values()]
        assets_total = sum(value for value in latest_values if value > 0)
        debt_total = abs(sum(value for value in latest_values if value < 0))
        total = sum(latest_values)
        history.append({"date": recorded_date.isoformat(), "total": total, "assets": assets_total, "debt": debt_total})
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


@router.post("/")
def record_asset(payload: AssetCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    validate_shared_users(current_user.id, payload.shared_user_ids, db)
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
    sync_asset_shares(current_user.id, payload.name, payload.shared_user_ids, db)
    db.commit()
    db.refresh(asset)
    return {"id": asset.id}


@router.patch("/{asset_id}")
def update_asset(asset_id: int, payload: AssetUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    updates = payload.dict(exclude_unset=True)
    shared_user_ids = updates.pop("shared_user_ids", None)
    if shared_user_ids is not None:
        validate_shared_users(current_user.id, shared_user_ids, db)

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
                {"asset_name": updates["name"]},
                synchronize_session=False,
            )

    for key, value in updates.items():
        if key in {"name", "asset_type"}:
            continue
        setattr(asset, key, value)

    if shared_user_ids is not None:
        sync_asset_shares(asset.user_id, updates.get("name", original_name), shared_user_ids, db)

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
