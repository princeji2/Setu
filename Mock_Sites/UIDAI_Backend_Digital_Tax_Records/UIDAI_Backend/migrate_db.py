"""
Safe SQLite migration script.
Adds date_of_birth, family_income, income_source to the users table.
Existing rows keep their data; new columns default to NULL.
Run once: python migrate_db.py
"""
import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "pan_records.db")


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def run_migration():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    migrations = [
        ("date_of_birth", "DATE"),
        ("family_income",  "VARCHAR(50)"),
        ("income_source",  "VARCHAR(100)"),
    ]

    for col_name, col_type in migrations:
        if column_exists(cur, "users", col_name):
            print(f"  [SKIP]  Column '{col_name}' already exists.")
        else:
            cur.execute(
                f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"
            )
            print(f"  [ADD]   Column '{col_name} {col_type}' added.")

    conn.commit()
    conn.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    run_migration()
