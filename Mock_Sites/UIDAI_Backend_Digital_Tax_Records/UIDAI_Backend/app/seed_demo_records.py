"""
Idempotent demo-data seed for the Digital Tax Records service.

Why this exists
---------------
The gateway-facing lookup GET /pan/{pan_reference}/fields reads rows from the
`pan_records` table. Those synthetic records are normally created via the
authenticated POST /pan/ flow, and the SQLite file (pan_records.db) is
gitignored — so a fresh deploy, and every restart on an ephemeral filesystem
(e.g. Render's free tier), boots with an EMPTY table and every gateway lookup
404s. That silently breaks the headline PAN-verification demo.

This module seeds a small, fixed set of synthetic demo records directly into
`pan_records` if (and only if) they are absent. It is:
  - idempotent  — keyed on pan_reference; an existing reference is left
                  untouched, so running it on every boot never duplicates
                  or errors;
  - synthetic   — every reference is SYNPAN-/DEMO- form with coarse,
                  non-sensitive values, matching the service's own
                  validators (filing_status / income_bracket vocab);
  - non-fatal   — the caller wraps this so a seed failure logs a warning
                  but never prevents the service from starting.

The demo references here (esp. SYNPAN-000123) are the ones the gateway demo
scripts and end-to-end flow rely on — keep them in sync with
gateway/scripts/demo-dtr-run.js if that set changes.
"""

from sqlalchemy.orm import Session

from app.database import Base, engine, SessionLocal
from app.models.pan import PanRecord


# Synthetic user_id owning the seeded records. `pan_records.user_id` is a
# plain indexed integer with no DB-level FK, so this need not correspond to
# a real `users` row — the gateway lookup is by pan_reference and ignores
# user_id entirely. A distinctive value keeps the seed rows easy to spot.
SEED_USER_ID = 900001

# Fixed, synthetic demo records. Values respect the service's own
# validators: filing_status ∈ {FILED, NOT_FILED, PENDING},
# income_bracket ∈ {0-3L, 3-5L, 0-5L, 5-10L, 10-15L, 10L+, 15L+}.
DEMO_RECORDS = [
    {
        "pan_reference": "SYNPAN-000123",
        "full_name": "Aarav Sharma",
        "date_of_birth": "1988-04-12",
        "income_bracket": "5-10L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "SYNPAN-000456",
        "full_name": "Priya Nair",
        "date_of_birth": "1992-11-03",
        "income_bracket": "10-15L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "DEMO-000789",
        "full_name": "Rohan Verma",
        "date_of_birth": "1985-07-21",
        "income_bracket": "3-5L",
        "filing_status": "PENDING",
        "assessment_year": "2023-24",
    },
]


def _seed_with_session(db: Session) -> int:
    """Insert any missing demo records. Returns how many were newly added."""
    added = 0
    for rec in DEMO_RECORDS:
        exists = (
            db.query(PanRecord)
            .filter(PanRecord.pan_reference == rec["pan_reference"])
            .first()
        )
        if exists:
            continue

        db.add(
            PanRecord(
                user_id=SEED_USER_ID,
                pan_reference=rec["pan_reference"],
                full_name=rec["full_name"],
                date_of_birth=rec["date_of_birth"],
                income_bracket=rec["income_bracket"],
                filing_status=rec["filing_status"],
                assessment_year=rec["assessment_year"],
                # Seeded records are pre-verified demo fixtures.
                status="VERIFIED",
                message="Seeded synthetic demo record",
                ai_score=100,
                risk_level="LOW",
            )
        )
        added += 1

    if added:
        db.commit()
    return added


def seed_demo_records() -> int:
    """
    Ensure tables exist, then idempotently seed the demo PAN records.
    Returns the number of records newly inserted (0 if all already present).
    Safe to call on every application startup.
    """
    # Harmless if the tables already exist (mirrors main.py's create_all).
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        return _seed_with_session(db)
    finally:
        db.close()


if __name__ == "__main__":
    count = seed_demo_records()
    print(f"[seed] Demo PAN records ensured. Newly inserted: {count}")
