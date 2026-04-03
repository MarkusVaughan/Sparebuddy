from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date

from ..database import get_db, Asset, AssetType

router = APIRouter(prefix="/assets", tags=["assets"])


class AssetCreate(BaseModel):
    user_id: int = 1
    name: str
    asset_type: AssetType
    value: float
    recorded_date: date
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[AssetType] = None
    value: Optional[float] = None
    recorded_date: Optional[date] = None
    notes: Optional[str] = None


@router.get("/")
def list_assets(user_id: int = 1, db: Session = Depends(get_db)):
    """Returns the latest value for each asset name."""
    latest_dates = (
        db.query(
            Asset.name,
            func.max(Asset.recorded_date).label("latest_date")
        )
        .filter(Asset.user_id == user_id)
        .group_by(Asset.name)
        .subquery()
    )

    latest_rows = (
        db.query(
            Asset.name,
            func.max(Asset.id).label("latest_id")
        )
        .join(
            latest_dates,
            (Asset.name == latest_dates.c.name)
            & (Asset.recorded_date == latest_dates.c.latest_date)
        )
        .filter(Asset.user_id == user_id)
        .group_by(Asset.name)
        .subquery()
    )

    assets = (
        db.query(Asset)
        .join(
            latest_rows,
            Asset.id == latest_rows.c.latest_id
        )
        .filter(Asset.user_id == user_id)
        .order_by(Asset.name.asc())
        .all()
    )

    total = sum(a.value for a in assets)

    by_type = {}
    for a in assets:
        t = a.asset_type.value
        by_type.setdefault(t, 0)
        by_type[t] += a.value

    return {
        "total_net_worth": total,
        "by_type": by_type,
        "assets": [
            {
                "id": a.id,
                "name": a.name,
                "asset_type": a.asset_type,
                "value": a.value,
                "recorded_date": a.recorded_date.isoformat(),
                "notes": a.notes,
            }
            for a in assets
        ],
    }


@router.get("/net-worth-history")
def net_worth_history(user_id: int = 1, db: Session = Depends(get_db)):
    """Returns total net worth, assets, and debt as of each recorded date."""
    snapshots = (
        db.query(Asset)
        .filter(Asset.user_id == user_id)
        .order_by(Asset.recorded_date.asc(), Asset.id.asc())
        .all()
    )
    if not snapshots:
        return []

    snapshots_by_date = {}
    for snapshot in snapshots:
        snapshots_by_date.setdefault(snapshot.recorded_date, []).append(snapshot)

    latest_by_name = {}
    history = []

    for recorded_date in sorted(snapshots_by_date.keys()):
        for snapshot in snapshots_by_date[recorded_date]:
            latest_by_name[snapshot.name] = snapshot

        latest_values = [float(snapshot.value) for snapshot in latest_by_name.values()]
        assets_total = sum(value for value in latest_values if value > 0)
        debt_total = abs(sum(value for value in latest_values if value < 0))
        total = sum(latest_values)

        history.append({
            "date": recorded_date.isoformat(),
            "total": total,
            "assets": assets_total,
            "debt": debt_total,
        })

    return history


@router.get("/history/{asset_name}")
def asset_history(asset_name: str, user_id: int = 1, db: Session = Depends(get_db)):
    """Returns historical values for a named asset."""
    records = (
        db.query(Asset)
        .filter(Asset.user_id == user_id, Asset.name == asset_name)
        .order_by(Asset.recorded_date.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "asset_type": r.asset_type,
            "date": r.recorded_date.isoformat(),
            "value": float(r.value),
            "notes": r.notes,
        }
        for r in records
    ]


@router.post("/")
def record_asset(payload: AssetCreate, db: Session = Depends(get_db)):
    asset = Asset(**payload.dict())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {"id": asset.id}


@router.patch("/{asset_id}")
def update_asset(asset_id: int, payload: AssetUpdate, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    updates = payload.dict(exclude_unset=True)
    original_name = asset.name

    # Name/type define the asset series, so update them across all snapshots
    # with the same current name for this user.
    if "name" in updates or "asset_type" in updates:
        series_updates = {}
        if "name" in updates:
            series_updates["name"] = updates["name"]
        if "asset_type" in updates:
            series_updates["asset_type"] = updates["asset_type"]
        (
            db.query(Asset)
            .filter(Asset.user_id == asset.user_id, Asset.name == original_name)
            .update(series_updates, synchronize_session=False)
        )

    for key, value in updates.items():
        if key in {"name", "asset_type"}:
            continue
        setattr(asset, key, value)
    db.commit()
    return {"ok": True}


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    return {"ok": True}
