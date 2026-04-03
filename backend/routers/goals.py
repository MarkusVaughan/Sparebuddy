from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import Asset, Category, Goal, GoalAssetLink, GoalType, get_db

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    user_id: int = 1
    name: str
    goal_type: GoalType = GoalType.savings
    target_amount: float
    current_amount: float = 0
    monthly_target: Optional[float] = None
    start_month: str
    target_month: str
    category_id: Optional[int] = None
    linked_asset_names: list[str] = Field(default_factory=list)
    baseline_amount: Optional[float] = None
    notes: Optional[str] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    goal_type: Optional[GoalType] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    monthly_target: Optional[float] = None
    start_month: Optional[str] = None
    target_month: Optional[str] = None
    category_id: Optional[int] = None
    linked_asset_names: Optional[list[str]] = None
    baseline_amount: Optional[float] = None
    notes: Optional[str] = None


def latest_asset_values_by_name(user_id: int, db: Session):
    latest_rows = (
        db.query(Asset)
        .filter(Asset.user_id == user_id)
        .order_by(Asset.name.asc(), Asset.recorded_date.desc(), Asset.id.desc())
        .all()
    )

    latest_by_name = {}
    for asset in latest_rows:
        latest_by_name.setdefault(asset.name, float(asset.value))
    return latest_by_name


def validate_category(goal_type: GoalType, category_id: Optional[int], db: Session):
    if category_id is None:
        return

    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if goal_type == GoalType.expense_reduction and category.category_type.value != "expense":
        raise HTTPException(status_code=400, detail="Expense reduction goals must use an expense category")


def validate_asset_links(user_id: int, linked_asset_names: list[str], db: Session):
    if not linked_asset_names:
        return

    existing_names = {
        row[0]
        for row in db.query(Asset.name)
        .filter(Asset.user_id == user_id, Asset.name.in_(linked_asset_names))
        .distinct()
        .all()
    }
    missing = [name for name in linked_asset_names if name not in existing_names]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Assets not found: {', '.join(missing)}",
        )


def compute_goal_progress(goal: Goal, latest_assets: dict[str, float]):
    linked_asset_names = [link.asset_name for link in goal.asset_links]
    linked_asset_values = [latest_assets[name] for name in linked_asset_names if name in latest_assets]
    linked_asset_total = sum(linked_asset_values)
    linked_debt_balance = abs(sum(value for value in linked_asset_values if value < 0))

    current_amount = float(goal.current_amount)
    baseline_amount = float(goal.baseline_amount) if goal.baseline_amount is not None else None

    if linked_asset_names and goal.goal_type == GoalType.savings.value:
        current_amount = max(linked_asset_total, 0)
    elif linked_asset_names and goal.goal_type == GoalType.debt_reduction.value:
        if baseline_amount is None:
            baseline_amount = linked_debt_balance
        current_amount = max(baseline_amount - linked_debt_balance, 0)

    return {
        "current_amount": current_amount,
        "baseline_amount": baseline_amount,
        "linked_asset_names": linked_asset_names,
        "linked_asset_total": linked_asset_total,
        "linked_debt_balance": linked_debt_balance,
    }


def serialize_goal(goal: Goal, latest_assets: dict[str, float]):
    computed = compute_goal_progress(goal, latest_assets)
    return {
        "id": goal.id,
        "name": goal.name,
        "goal_type": goal.goal_type,
        "target_amount": float(goal.target_amount),
        "current_amount": computed["current_amount"],
        "manual_current_amount": float(goal.current_amount),
        "monthly_target": float(goal.monthly_target) if goal.monthly_target is not None else None,
        "start_month": goal.start_month,
        "target_month": goal.target_month,
        "category_id": goal.category_id,
        "category_name": goal.category.name if goal.category else None,
        "linked_asset_names": computed["linked_asset_names"],
        "linked_asset_total": computed["linked_asset_total"],
        "linked_debt_balance": computed["linked_debt_balance"],
        "baseline_amount": computed["baseline_amount"],
        "notes": goal.notes,
    }


@router.get("/")
def list_goals(user_id: int = 1, db: Session = Depends(get_db)):
    goals = (
        db.query(Goal)
        .options(joinedload(Goal.category), joinedload(Goal.asset_links))
        .filter(Goal.user_id == user_id)
        .order_by(Goal.target_month.asc(), Goal.created_at.asc())
        .all()
    )
    latest_assets = latest_asset_values_by_name(user_id, db)
    return [serialize_goal(goal, latest_assets) for goal in goals]


@router.post("/")
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    validate_category(payload.goal_type, payload.category_id, db)
    validate_asset_links(payload.user_id, payload.linked_asset_names, db)

    baseline_amount = payload.baseline_amount
    if payload.goal_type == GoalType.debt_reduction and payload.linked_asset_names and baseline_amount is None:
        latest_assets = latest_asset_values_by_name(payload.user_id, db)
        baseline_amount = abs(
            sum(latest_assets.get(name, 0) for name in payload.linked_asset_names if latest_assets.get(name, 0) < 0)
        )

    goal = Goal(
        user_id=payload.user_id,
        name=payload.name,
        goal_type=payload.goal_type.value,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        monthly_target=payload.monthly_target,
        start_month=payload.start_month,
        target_month=payload.target_month,
        category_id=payload.category_id,
        baseline_amount=baseline_amount,
        notes=payload.notes,
    )
    db.add(goal)
    db.flush()

    for asset_name in payload.linked_asset_names:
        db.add(GoalAssetLink(goal_id=goal.id, asset_name=asset_name))

    db.commit()
    db.refresh(goal)
    return {"id": goal.id}


@router.patch("/{goal_id}")
def update_goal(goal_id: int, payload: GoalUpdate, db: Session = Depends(get_db)):
    goal = (
        db.query(Goal)
        .options(joinedload(Goal.asset_links))
        .filter(Goal.id == goal_id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    updates = payload.dict(exclude_unset=True)
    goal_type = updates.get("goal_type", GoalType(goal.goal_type))
    category_id = updates.get("category_id", goal.category_id)
    linked_asset_names = updates.pop("linked_asset_names", None)

    validate_category(goal_type, category_id, db)
    if linked_asset_names is not None:
        validate_asset_links(goal.user_id, linked_asset_names, db)

    for key, value in updates.items():
        if key == "goal_type":
            setattr(goal, key, value.value)
            continue
        setattr(goal, key, value)

    if linked_asset_names is not None:
        existing_links = {link.asset_name: link for link in goal.asset_links}
        for link in list(goal.asset_links):
            if link.asset_name not in linked_asset_names:
                db.delete(link)
        for asset_name in linked_asset_names:
            if asset_name not in existing_links:
                db.add(GoalAssetLink(goal_id=goal.id, asset_name=asset_name))

        if goal.goal_type == GoalType.debt_reduction.value and "baseline_amount" not in updates:
            latest_assets = latest_asset_values_by_name(goal.user_id, db)
            goal.baseline_amount = abs(
                sum(latest_assets.get(name, 0) for name in linked_asset_names if latest_assets.get(name, 0) < 0)
            )

    db.commit()
    return {"ok": True}


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
    return {"ok": True}
