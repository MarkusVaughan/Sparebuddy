"""
One-time import of historic data from the Excel spreadsheet into Supabase.
Run from the project root: python scripts/import_historic.py
"""
import os
import sys
from datetime import date
from dotenv import load_dotenv

load_dotenv()

import sqlalchemy as sa
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from backend.database import engine, User, Asset, BudgetTarget, Category

# ---------------------------------------------------------------------------
# Asset snapshots from "Lån & Egenkapital"
# ---------------------------------------------------------------------------

ASSET_SNAPSHOTS = [
    # (recorded_date, name, asset_type, value, notes)
    # --- 2025-06-23 ---
    (date(2025, 6, 23), "Aksjer",      "investment",  53877.00,    None),
    (date(2025, 6, 23), "Fond",        "investment",  97948.00,    None),
    (date(2025, 6, 23), "Sparing DNB", "bank",        27316.00,    None),
    (date(2025, 6, 23), "Sparing FP",  "bank",        213378.00,   None),
    (date(2025, 6, 23), "Krypto",      "investment",  1000.00,     None),
    (date(2025, 6, 23), "Boliglån",    "other",       -4647516.00, "Gjeld"),
    (date(2025, 6, 23), "Billån",      "other",       -480000.00,  "Gjeld"),
    # --- 2025-08-04 ---
    (date(2025, 8, 4),  "Aksjer",      "investment",  54948.00,    None),
    (date(2025, 8, 4),  "Fond",        "investment",  123816.00,   None),
    (date(2025, 8, 4),  "Sparing DNB", "bank",        51323.00,    None),
    (date(2025, 8, 4),  "Sparing FP",  "bank",        211068.00,   None),
    (date(2025, 8, 4),  "Krypto",      "investment",  23666.62,    None),
    (date(2025, 8, 4),  "Boliglån",    "other",       -4641559.00, "Gjeld"),
    (date(2025, 8, 4),  "Billån",      "other",       -476253.00,  "Gjeld"),
    # --- 2025-10-05 ---
    (date(2025, 10, 5), "Aksjer",      "investment",  9070.00,     None),
    (date(2025, 10, 5), "Fond",        "investment",  138687.00,   None),
    (date(2025, 10, 5), "Sparing DNB", "bank",        47137.00,    None),
    (date(2025, 10, 5), "Sparing FP",  "bank",        207948.00,   None),
    (date(2025, 10, 5), "Krypto",      "investment",  25094.00,    None),
    (date(2025, 10, 5), "Boliglån",    "other",       -4630072.00, "Gjeld"),
    (date(2025, 10, 5), "Billån",      "other",       -466753.00,  "Gjeld"),
    # --- 2026-01-25 ---
    (date(2026, 1, 25), "Aksjer",      "investment",  4680.00,     None),
    (date(2026, 1, 25), "Fond",        "investment",  253324.00,   None),
    (date(2026, 1, 25), "Sparing DNB", "bank",        150945.00,   None),
    (date(2026, 1, 25), "Sparing FP",  "bank",        209518.00,   None),
    (date(2026, 1, 25), "Krypto",      "investment",  15881.00,    None),
    (date(2026, 1, 25), "Boliglån",    "other",       -4605259.00, "Gjeld"),
    (date(2026, 1, 25), "Billån",      "other",       -452394.00,  "Gjeld"),
]

# ---------------------------------------------------------------------------
# Budget targets from "Budsjett"
# Category name (spreadsheet) → category name in Supabase
# ---------------------------------------------------------------------------

CATEGORY_MAP = {
    "Mat":          "Dagligvarer",
    "Restaurant":   "Restaurant & Kafe",
    "Klær":         "Klær & Shopping",
    "Div":          "Annet",
    "Sosialt":      "Fritid & Underholdning",
    "Reise":        "Reise & Ferie",
    "Bil":          "Transport",
    "Trening":      "Helse",
    "Kollektivt":   "Transport",
    "Felleskost":   "Bolig & Hushold",
    "Lunsj":        "Restaurant & Kafe",
    "Abonnoment":   "Abonnementer",
}

# (month, category_key, budgeted_amount)
BUDGET_TARGETS = [
    # Jul 2025
    ("2025-07", "Mat",        3000),
    ("2025-07", "Restaurant", 2000),
    ("2025-07", "Klær",       1000),
    ("2025-07", "Div",        1000),
    ("2025-07", "Sosialt",    2000),
    ("2025-07", "Reise",      6000),
    # Aug 2025
    ("2025-08", "Mat",        4000),
    ("2025-08", "Restaurant", 2000),
    ("2025-08", "Klær",       4000),
    ("2025-08", "Div",        2000),
    ("2025-08", "Sosialt",    2000),
    ("2025-08", "Reise",      10000),
    ("2025-08", "Trening",    1090),
    ("2025-08", "Kollektivt", 800),
    # Sep 2025
    ("2025-09", "Mat",        4000),
    ("2025-09", "Restaurant", 2000),
    ("2025-09", "Klær",       4000),
    ("2025-09", "Div",        2000),
    ("2025-09", "Sosialt",    2000),
    ("2025-09", "Reise",      0),
    ("2025-09", "Bil",        600),
    ("2025-09", "Trening",    1090),
    ("2025-09", "Kollektivt", 800),
    ("2025-09", "Felleskost", 2730),
    # Oct 2025
    ("2025-10", "Mat",        4000),
    ("2025-10", "Restaurant", 2000),
    ("2025-10", "Klær",       4000),
    ("2025-10", "Div",        2000),
    ("2025-10", "Sosialt",    3000),
    ("2025-10", "Reise",      1500),
    ("2025-10", "Bil",        1000),
    ("2025-10", "Trening",    1090),
    ("2025-10", "Kollektivt", 800),
    ("2025-10", "Felleskost", 2730),
    # Dec 2025
    ("2025-12", "Mat",        4000),
    ("2025-12", "Restaurant", 2000),
    ("2025-12", "Klær",       4000),
    ("2025-12", "Div",        2000),
    ("2025-12", "Sosialt",    3000),
    ("2025-12", "Reise",      1500),
    ("2025-12", "Bil",        1000),
    ("2025-12", "Trening",    1090),
    ("2025-12", "Kollektivt", 800),
    ("2025-12", "Felleskost", 2730),
    ("2025-12", "Lunsj",      800),
    ("2025-12", "Abonnoment", 700),
    # Jan 2026
    ("2026-01", "Mat",        4000),
    ("2026-01", "Restaurant", 2000),
    ("2026-01", "Klær",       4000),
    ("2026-01", "Div",        2000),
    ("2026-01", "Sosialt",    3000),
    ("2026-01", "Reise",      1500),
    ("2026-01", "Bil",        1000),
    ("2026-01", "Trening",    1090),
    ("2026-01", "Kollektivt", 800),
    ("2026-01", "Felleskost", 2730),
    ("2026-01", "Lunsj",      800),
    ("2026-01", "Abonnoment", 700),
    # Feb 2026
    ("2026-02", "Mat",        4000),
    ("2026-02", "Restaurant", 2000),
    ("2026-02", "Klær",       4000),
    ("2026-02", "Div",        2000),
    ("2026-02", "Sosialt",    3000),
    ("2026-02", "Reise",      1500),
    ("2026-02", "Bil",        6000),
    ("2026-02", "Trening",    1090),
    ("2026-02", "Kollektivt", 800),
    ("2026-02", "Felleskost", 2730),
    ("2026-02", "Lunsj",      800),
    ("2026-02", "Abonnoment", 700),
]


def run():
    with Session(engine) as db:
        # --- Ensure a default user exists ---
        user = db.query(User).filter_by(email="markus@sparebuddy.local").first()
        if not user:
            user = User(
                name="Markus",
                email="markus@sparebuddy.local",
                password_hash="local",
            )
            db.add(user)
            db.flush()
            print(f"Created user: {user.name} (id={user.id})")
        else:
            print(f"Using existing user: {user.name} (id={user.id})")

        # --- Load category name → id map ---
        categories = {c.name: c.id for c in db.query(Category).all()}

        # --- Import assets ---
        existing_assets = db.query(Asset).filter_by(user_id=user.id).count()
        if existing_assets > 0:
            print(f"Skipping assets — {existing_assets} already exist.")
        else:
            for recorded_date, name, asset_type, value, notes in ASSET_SNAPSHOTS:
                db.add(Asset(
                    user_id=user.id,
                    name=name,
                    asset_type=asset_type,
                    value=value,
                    recorded_date=recorded_date,
                    notes=notes,
                ))
            print(f"Imported {len(ASSET_SNAPSHOTS)} asset snapshots.")

        # --- Import budget targets ---
        existing_budgets = db.query(BudgetTarget).filter_by(user_id=user.id).count()
        if existing_budgets > 0:
            print(f"Skipping budget targets — {existing_budgets} already exist.")
        else:
            skipped = 0
            imported = 0
            for month, cat_key, amount in BUDGET_TARGETS:
                if amount == 0:
                    skipped += 1
                    continue
                supabase_name = CATEGORY_MAP[cat_key]
                cat_id = categories.get(supabase_name)
                if not cat_id:
                    print(f"  WARNING: category not found: {supabase_name}")
                    continue
                # Avoid duplicate (same user + category + month)
                exists = db.query(BudgetTarget).filter_by(
                    user_id=user.id, category_id=cat_id, month=month
                ).first()
                if exists:
                    skipped += 1
                    continue
                db.add(BudgetTarget(
                    user_id=user.id,
                    category_id=cat_id,
                    month=month,
                    amount=amount,
                ))
                imported += 1
            print(f"Imported {imported} budget targets ({skipped} skipped).")

        db.commit()
        print("Done.")


if __name__ == "__main__":
    run()
