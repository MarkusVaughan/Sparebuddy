"""
DNB CSV Transaction Importer

Handles the export format from DNB nettbank:
  "Dato";"Forklaringstekst";"Rentedato";"Beløp";"Motkonto"
  "03.04.2026";"REMA 1000";"04.04.2026";"-389,00";""

Supports both semicolon-separated and comma-separated formats.
"""

import csv
import hashlib
import io
from datetime import date, datetime
from typing import Optional
from sqlalchemy.orm import Session
from ..database import Transaction, CategoryRule, Category


def parse_norwegian_amount(value: str) -> float:
    """Convert Norwegian number format '1.234,56' to float 1234.56"""
    cleaned = value.strip().replace('"', '').replace('\xa0', '')
    # Remove thousands separator (period), replace decimal comma with dot
    cleaned = cleaned.replace('.', '').replace(',', '.')
    return float(cleaned)


def parse_norwegian_date(value: str) -> date:
    """Convert 'dd.mm.yyyy' to a date object"""
    return datetime.strptime(value.strip().replace('"', ''), "%d.%m.%Y").date()


def make_import_hash(account_id: int, date_val: date, description: str, amount: float) -> str:
    """Generate a unique hash for deduplication"""
    raw = f"{account_id}|{date_val.isoformat()}|{description.strip().lower()}|{amount:.2f}"
    return hashlib.sha256(raw.encode()).hexdigest()


def find_category_for(description: str, db: Session) -> Optional[int]:
    """
    Check category rules to auto-assign a category.
    Rules are matched case-insensitively against the transaction description.
    """
    rules = db.query(CategoryRule).filter(CategoryRule.is_active == True).all()
    desc_upper = description.upper()
    for rule in rules:
        if rule.match_text.upper() in desc_upper:
            return rule.category_id
    return None


def import_dnb_csv(
    file_content: bytes,
    account_id: int,
    db: Session
) -> dict:
    """
    Parse a DNB CSV export and insert new transactions into the database.

    Returns a summary dict:
      { "imported": int, "skipped_duplicates": int, "errors": list[str] }
    """
    imported = 0
    skipped = 0
    errors = []

    # Try to decode — DNB typically uses latin-1 or utf-8-sig
    for encoding in ("utf-8-sig", "latin-1", "utf-8"):
        try:
            text = file_content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return {"imported": 0, "skipped_duplicates": 0, "errors": ["Kunne ikke lese filen (ukjent tegnsett)"]}

    # Detect delimiter
    delimiter = ";" if ";" in text.splitlines()[0] else ","

    reader = csv.DictReader(
        io.StringIO(text),
        delimiter=delimiter,
        quotechar='"'
    )

    # Normalize field names (strip quotes and whitespace)
    for row in reader:
        try:
            # Support multiple possible column name variants from DNB
            date_val = parse_norwegian_date(
                row.get("Dato") or row.get('"Dato"') or ""
            )
            description = (
                row.get("Forklaringstekst") or
                row.get("Tekst") or
                row.get('"Forklaringstekst"') or
                ""
            ).strip().strip('"')

            amount_raw = (
                row.get("Beløp") or
                row.get('"Beløp"') or
                "0"
            )
            amount = parse_norwegian_amount(amount_raw)

            balance_raw = row.get("Saldo") or row.get('"Saldo"') or None
            balance = parse_norwegian_amount(balance_raw) if balance_raw and balance_raw.strip().strip('"') else None

            import_hash = make_import_hash(account_id, date_val, description, amount)

            # Skip duplicates
            existing = db.query(Transaction).filter(Transaction.import_hash == import_hash).first()
            if existing:
                skipped += 1
                continue

            category_id = find_category_for(description, db)

            tx = Transaction(
                account_id=account_id,
                category_id=category_id,
                date=date_val,
                description=description,
                amount=amount,
                balance_after=balance,
                import_hash=import_hash,
            )
            db.add(tx)
            imported += 1

        except Exception as e:
            errors.append(f"Rad feil: {e} — {dict(row)}")

    db.commit()
    return {"imported": imported, "skipped_duplicates": skipped, "errors": errors}
