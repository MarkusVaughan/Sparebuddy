from sqlalchemy.orm import Session

from ..database import Account, BudgetTarget, Category, CategoryRule, Goal, Transaction


def merge_duplicate_categories(db: Session, user_id: int):
    account_ids = [
        account_id
        for (account_id,) in db.query(Account.id).filter(Account.user_id == user_id).all()
    ]
    categories = (
        db.query(Category)
        .filter(Category.user_id == user_id)
        .order_by(Category.id.asc())
        .all()
    )

    seen = {}
    for category in categories:
        key = (category.name.strip().lower(), category.category_type.value)
        keeper = seen.get(key)
        if not keeper:
            seen[key] = category
            continue

        if account_ids:
            (
                db.query(Transaction)
                .filter(
                    Transaction.account_id.in_(account_ids),
                    Transaction.category_id == category.id,
                )
                .update({Transaction.category_id: keeper.id}, synchronize_session=False)
            )
        (
            db.query(BudgetTarget)
            .filter(BudgetTarget.user_id == user_id, BudgetTarget.category_id == category.id)
            .update({BudgetTarget.category_id: keeper.id}, synchronize_session=False)
        )
        (
            db.query(Goal)
            .filter(Goal.user_id == user_id, Goal.category_id == category.id)
            .update({Goal.category_id: keeper.id}, synchronize_session=False)
        )

        existing_rules = {rule.match_text.strip().lower() for rule in keeper.rules}
        for rule in category.rules:
            normalized = rule.match_text.strip().lower()
            if normalized not in existing_rules:
                db.add(
                    CategoryRule(
                        category_id=keeper.id,
                        match_text=rule.match_text,
                        is_active=rule.is_active,
                    )
                )
                existing_rules.add(normalized)
        (
            db.query(CategoryRule)
            .filter(CategoryRule.category_id == category.id)
            .delete(synchronize_session=False)
        )
        db.query(Category).filter(Category.id == category.id).delete(synchronize_session=False)


def ensure_user_categories(db: Session, user_id: int):
    template_categories_raw = (
        db.query(Category)
        .filter(Category.user_id.is_(None))
        .order_by(Category.id.asc())
        .all()
    )
    template_categories = []
    seen_template_keys = set()
    for category in template_categories_raw:
        key = (category.name.strip().lower(), category.category_type.value)
        if key in seen_template_keys:
            continue
        seen_template_keys.add(key)
        template_categories.append(category)
    if not template_categories:
        return

    existing_by_template = {
        category.base_category_id: category
        for category in db.query(Category)
        .filter(Category.user_id == user_id, Category.base_category_id.isnot(None))
        .all()
    }

    template_to_user = {}
    for template in template_categories:
        user_category = existing_by_template.get(template.id)
        if not user_category:
            user_category = Category(
                user_id=user_id,
                base_category_id=template.id,
                name=template.name,
                color=template.color,
                icon=template.icon,
                category_type=template.category_type,
            )
            db.add(user_category)
            db.flush()
            for rule in template.rules:
                db.add(
                    CategoryRule(
                        category_id=user_category.id,
                        match_text=rule.match_text,
                        is_active=rule.is_active,
                    )
                )
        template_to_user[template.id] = user_category.id

    if not template_to_user:
        return

    account_ids = [
        account_id
        for (account_id,) in db.query(Account.id).filter(Account.user_id == user_id).all()
    ]

    for template_id, user_category_id in template_to_user.items():
        if account_ids:
            (
                db.query(Transaction)
                .filter(
                    Transaction.account_id.in_(account_ids),
                    Transaction.category_id == template_id,
                )
                .update({Transaction.category_id: user_category_id}, synchronize_session=False)
            )
        (
            db.query(BudgetTarget)
            .filter(BudgetTarget.user_id == user_id, BudgetTarget.category_id == template_id)
            .update({BudgetTarget.category_id: user_category_id}, synchronize_session=False)
        )
        (
            db.query(Goal)
            .filter(Goal.user_id == user_id, Goal.category_id == template_id)
            .update({Goal.category_id: user_category_id}, synchronize_session=False)
        )

    merge_duplicate_categories(db, user_id)
    db.commit()
