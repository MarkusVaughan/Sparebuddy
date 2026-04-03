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


@router.get("/")
def list_assets(user_id: int = 1, db: Session = Depends(get_db)):
    """Returns the latest value for each asset."""
    # Subquery: latest recorded_date per asset name/type
    subq = (
        db.query(
            Asset.name,
            Asset.asset_type,
            func.max(Asset.recorded_date).label("latest_date")
        )
        .filter(Asset.user_id == user_id)
        .group_by(Asset.name, Asset.asset_type)
        .subquery()
    )

    assets = (
        db.query(Asset)
        .join(
            subq,
            (Asset.name == subq.c.name)
            & (Asset.asset_type == subq.c.asset_type)
            & (Asset.recorded_date == subq.c.latest_date)
        )
        .filter(Asset.user_id == user_id)
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
        {"date": r.recorded_date.isoformat(), "value": r.value}
        for r in records
    ]


@router.post("/")
def record_asset(payload: AssetCreate, db: Session = Depends(get_db)):
    asset = Asset(**payload.dict())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {"id": asset.id}


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    return {"ok": True}
