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
    # Existing Demo Citizens
    {
        "pan_reference": "SYNPAN-000123",
        "full_name": "Aarav Sharma",
        "date_of_birth": "1988-04-12",
        "income_bracket": "5-10L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "PANCARD-000123",
        "full_name": "Aarav Sharma",
        "date_of_birth": "1988-04-12",
        "income_bracket": "5-10L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "INC-2026-000123",
        "full_name": "Aarav Sharma",
        "date_of_birth": "1988-04-12",
        "income_bracket": "5-10L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    # Catalog placeholder reference aliases for Aarav Sharma
    {
        "pan_reference": "SYNPAN-000101",
        "full_name": "Aarav Sharma",
        "date_of_birth": "1988-04-12",
        "income_bracket": "5-10L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "PANCARD-000101",
        "full_name": "Aarav Sharma",
        "date_of_birth": "1988-04-12",
        "income_bracket": "5-10L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "INC-2026-000101",
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
        "pan_reference": "PANCARD-000456",
        "full_name": "Priya Nair",
        "date_of_birth": "1992-11-03",
        "income_bracket": "10-15L",
        "filing_status": "FILED",
        "assessment_year": "2024-25",
    },
    {
        "pan_reference": "INC-2026-000456",
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
    {
        "pan_reference": "PANCARD-000789",
        "full_name": "Rohan Verma",
        "date_of_birth": "1985-07-21",
        "income_bracket": "3-5L",
        "filing_status": "PENDING",
        "assessment_year": "2023-24",
    },
    {
        "pan_reference": "INC-2026-000789",
        "full_name": "Rohan Verma",
        "date_of_birth": "1985-07-21",
        "income_bracket": "3-5L",
        "filing_status": "PENDING",
        "assessment_year": "2023-24",
    },

    # 20 New Synthetic Citizens
    # 1. Aditi Rao (Clean match)
    {"pan_reference": "SYNPAN-200001", "full_name": "Aditi Rao", "date_of_birth": "1994-03-14", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200001", "full_name": "Aditi Rao", "date_of_birth": "1994-03-14", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0001", "full_name": "Aditi Rao", "date_of_birth": "1994-03-14", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 2. Vikramaditya Sengupta (Clean match)
    {"pan_reference": "SYNPAN-200002", "full_name": "Vikramaditya Sengupta", "date_of_birth": "1982-08-22", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200002", "full_name": "Vikramaditya Sengupta", "date_of_birth": "1982-08-22", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0002", "full_name": "Vikramaditya Sengupta", "date_of_birth": "1982-08-22", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 3. Meera Nambiar (Clean match)
    {"pan_reference": "SYNPAN-200003", "full_name": "Meera Nambiar", "date_of_birth": "1990-11-05", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200003", "full_name": "Meera Nambiar", "date_of_birth": "1990-11-05", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0003", "full_name": "Meera Nambiar", "date_of_birth": "1990-11-05", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 4. Arjun Kulkarni (Clean match)
    {"pan_reference": "SYNPAN-200004", "full_name": "Arjun Kulkarni", "date_of_birth": "1987-05-19", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200004", "full_name": "Arjun Kulkarni", "date_of_birth": "1987-05-19", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0004", "full_name": "Arjun Kulkarni", "date_of_birth": "1987-05-19", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 5. Sneha Deshmukh (Clean match)
    {"pan_reference": "SYNPAN-200005", "full_name": "Sneha Deshmukh", "date_of_birth": "1996-01-28", "income_bracket": "0-3L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200005", "full_name": "Sneha Deshmukh", "date_of_birth": "1996-01-28", "income_bracket": "0-3L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0005", "full_name": "Sneha Deshmukh", "date_of_birth": "1996-01-28", "income_bracket": "0-3L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 6. Harshvardhan Reddy (Clean match)
    {"pan_reference": "SYNPAN-200006", "full_name": "Harshvardhan Reddy", "date_of_birth": "1979-09-12", "income_bracket": "15L+", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200006", "full_name": "Harshvardhan Reddy", "date_of_birth": "1979-09-12", "income_bracket": "15L+", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0006", "full_name": "Harshvardhan Reddy", "date_of_birth": "1979-09-12", "income_bracket": "15L+", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 7. Kiran Mazumdar (Clean match)
    {"pan_reference": "SYNPAN-200007", "full_name": "Kiran Mazumdar", "date_of_birth": "1985-04-03", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200007", "full_name": "Kiran Mazumdar", "date_of_birth": "1985-04-03", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0007", "full_name": "Kiran Mazumdar", "date_of_birth": "1985-04-03", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 8. Devendra Joshi (Clean match)
    {"pan_reference": "SYNPAN-200008", "full_name": "Devendra Joshi", "date_of_birth": "1991-12-17", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200008", "full_name": "Devendra Joshi", "date_of_birth": "1991-12-17", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0008", "full_name": "Devendra Joshi", "date_of_birth": "1991-12-17", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 9. Sunita Sundaram (Clean match)
    {"pan_reference": "SYNPAN-200009", "full_name": "Sunita Sundaram", "date_of_birth": "1975-07-30", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200009", "full_name": "Sunita Sundaram", "date_of_birth": "1975-07-30", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0009", "full_name": "Sunita Sundaram", "date_of_birth": "1975-07-30", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 10. Manish Tiwari (Clean match)
    {"pan_reference": "SYNPAN-200010", "full_name": "Manish Tiwari", "date_of_birth": "1988-02-25", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200010", "full_name": "Manish Tiwari", "date_of_birth": "1988-02-25", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0010", "full_name": "Manish Tiwari", "date_of_birth": "1988-02-25", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 11. Deepika Padukone-Bose (Clean match)
    {"pan_reference": "SYNPAN-200011", "full_name": "Deepika Padukone-Bose", "date_of_birth": "1993-10-09", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200011", "full_name": "Deepika Padukone-Bose", "date_of_birth": "1993-10-09", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0011", "full_name": "Deepika Padukone-Bose", "date_of_birth": "1993-10-09", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 12. Gaurav Bhatia (Clean match)
    {"pan_reference": "SYNPAN-200012", "full_name": "Gaurav Bhatia", "date_of_birth": "1986-06-14", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200012", "full_name": "Gaurav Bhatia", "date_of_birth": "1986-06-14", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0012", "full_name": "Gaurav Bhatia", "date_of_birth": "1986-06-14", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 13. Ananya Ghosh (Clean match)
    {"pan_reference": "SYNPAN-200013", "full_name": "Ananya Ghosh", "date_of_birth": "1997-08-31", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200013", "full_name": "Ananya Ghosh", "date_of_birth": "1997-08-31", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0013", "full_name": "Ananya Ghosh", "date_of_birth": "1997-08-31", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 14. Naveen Patnaik (Clean match)
    {"pan_reference": "SYNPAN-200014", "full_name": "Naveen Patnaik", "date_of_birth": "1980-04-18", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200014", "full_name": "Naveen Patnaik", "date_of_birth": "1980-04-18", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0014", "full_name": "Naveen Patnaik", "date_of_birth": "1980-04-18", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 15. Patel Kavita Suresh (Transposed Name in DLJA/DTR vs Kavita Suresh Patel in NIR)
    {"pan_reference": "SYNPAN-200015", "full_name": "Patel Kavita Suresh", "date_of_birth": "1989-09-15", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200015", "full_name": "Patel Kavita Suresh", "date_of_birth": "1989-09-15", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0015", "full_name": "Patel Kavita Suresh", "date_of_birth": "1989-09-15", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 16. R. K. Mukherjee (Abbreviated name in DTR vs Rajesh Kumar Mukherjee in NIR)
    {"pan_reference": "SYNPAN-200016", "full_name": "R. K. Mukherjee", "date_of_birth": "1983-03-21", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200016", "full_name": "R. K. Mukherjee", "date_of_birth": "1983-03-21", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0016", "full_name": "R. K. Mukherjee", "date_of_birth": "1983-03-21", "income_bracket": "10-15L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 17. Amitabh Saxena (DOB 1-Day mismatch: 1984-06-15 in NIR/DTR vs 1984-06-16 in DLJA)
    {"pan_reference": "SYNPAN-200017", "full_name": "Amitabh Saxena", "date_of_birth": "1984-06-15", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200017", "full_name": "Amitabh Saxena", "date_of_birth": "1984-06-15", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0017", "full_name": "Amitabh Saxena", "date_of_birth": "1984-06-15", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 18. Siddharth Malhotra (DOB 1-Year mismatch: 1991-12-05 in DTR vs 1990-12-05 in NIR)
    {"pan_reference": "SYNPAN-200018", "full_name": "Siddharth Malhotra", "date_of_birth": "1991-12-05", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200018", "full_name": "Siddharth Malhotra", "date_of_birth": "1991-12-05", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0018", "full_name": "Siddharth Malhotra", "date_of_birth": "1991-12-05", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 19. Vikram Choudhury (Spelling variation: Choudhury in NIR/DTR vs Choudhary in DLJA)
    {"pan_reference": "SYNPAN-200019", "full_name": "Vikram Choudhury", "date_of_birth": "1985-07-11", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200019", "full_name": "Vikram Choudhury", "date_of_birth": "1985-07-11", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0019", "full_name": "Vikram Choudhury", "date_of_birth": "1985-07-11", "income_bracket": "5-10L", "filing_status": "FILED", "assessment_year": "2024-25"},

    # 20. Pooja Sharma (Discrepancy: Pooja Sharma in NIR/DTR vs Pooja Verma in DLJA)
    {"pan_reference": "SYNPAN-200020", "full_name": "Pooja Sharma", "date_of_birth": "1992-04-02", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "PANCARD-200020", "full_name": "Pooja Sharma", "date_of_birth": "1992-04-02", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
    {"pan_reference": "INC-2026-0020", "full_name": "Pooja Sharma", "date_of_birth": "1992-04-02", "income_bracket": "3-5L", "filing_status": "FILED", "assessment_year": "2024-25"},
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
