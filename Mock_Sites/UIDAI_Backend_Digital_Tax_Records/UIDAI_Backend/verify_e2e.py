"""
Complete end-to-end verification of the user profile system.
Tests all requirements specified by the user.
"""
import sys
import os

# Ensure UTF-8 output encoding on Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Add venv site-packages
_base = os.path.dirname(os.path.abspath(__file__))
_venv_sp = os.path.join(_base, "venv", "Lib", "site-packages")
if _venv_sp not in sys.path:
    sys.path.insert(0, _venv_sp)

from fastapi.testclient import TestClient
from app.main import app
import sqlite3
import json

client = TestClient(app)

# Test data
USER_A = {
    "full_name": "Test User A",
    "email": "testusera@example.com",
    "mobile_number": "9876543210",
    "date_of_birth": "1999-08-21",
    "family_income": "5-10L",
    "income_source": "SALARY",
    "password": "Test@12345"
}

USER_B = {
    "full_name": "Test User B",
    "email": "testuserb@example.com",
    "mobile_number": "9123456789",
    "date_of_birth": "2000-05-10",
    "family_income": "3-5L",
    "income_source": "BUSINESS",
    "password": "Test@12345"
}

results = {}

def test_result(name, passed, details=""):
    results[name] = {"passed": passed, "details": details}
    status = "[PASS]" if passed else "[FAIL]"
    print(f"{status} - {name}")
    if details:
        print(f"    {details}")


print("=" * 70)
print("END-TO-END VERIFICATION - USER PROFILE SYSTEM")
print("=" * 70)

# ================================================================
# TEST 1 — CREATE USER A
# ================================================================
print("\n[TEST 1] CREATE USER A")
try:
    r = client.post("/auth/register", json=USER_A)
    if r.status_code in [200, 400]:
        data = r.json()
        if r.status_code == 200:
            test_result("Registration User A", True, f"User ID: {data['data']['user_id']}")
        else:
            # Already exists
            test_result("Registration User A", True, "User already exists (idempotent)")
    else:
        test_result("Registration User A", False, f"Status {r.status_code}: {r.text}")
except Exception as e:
    test_result("Registration User A", False, str(e))

# ================================================================
# TEST 2 — LOGIN USER A
# ================================================================
print("\n[TEST 2] LOGIN USER A")
try:
    r = client.post("/auth/login", json={"email": USER_A["email"], "password": USER_A["password"]})
    if r.status_code == 200:
        data = r.json()
        token_a = data["data"]["access_token"]
        test_result("Login User A", True, f"JWT token: {token_a[:20]}...")
    else:
        test_result("Login User A", False, f"Status {r.status_code}: {r.text}")
        token_a = None
except Exception as e:
    test_result("Login User A", False, str(e))
    token_a = None

# ================================================================
# TEST 3 — GET USER A PROFILE
# ================================================================
print("\n[TEST 3] GET USER A PROFILE")
if token_a:
    try:
        r = client.get("/users/me", headers={"Authorization": f"Bearer {token_a}"})
        if r.status_code == 200:
            profile = r.json()["data"]
            checks = [
                profile.get("full_name") == USER_A["full_name"],
                profile.get("email") == USER_A["email"],
                profile.get("mobile_number") == USER_A["mobile_number"],
                profile.get("date_of_birth") == USER_A["date_of_birth"],
                "password" not in profile,
                "hashed_password" not in profile
            ]
            if all(checks):
                test_result("GET /users/me User A", True, f"Profile: {profile['full_name']}, {profile['email']}")
            else:
                test_result("GET /users/me User A", False, f"Profile data mismatch: {profile}")
        else:
            test_result("GET /users/me User A", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        test_result("GET /users/me User A", False, str(e))
else:
    test_result("GET /users/me User A", False, "Skipped (no token)")

# ================================================================
# TEST 4 — UPDATE USER A
# ================================================================
print("\n[TEST 4] UPDATE USER A PROFILE")
if token_a:
    try:
        # Update
        r = client.patch(
            "/users/me",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"family_income": "10-15L", "income_source": "BUSINESS"}
        )
        if r.status_code == 200:
            updated = r.json()["data"]
            # Verify persisted
            r2 = client.get("/users/me", headers={"Authorization": f"Bearer {token_a}"})
            profile = r2.json()["data"]
            if profile["family_income"] == "10-15L" and profile["income_source"] == "BUSINESS":
                test_result("PATCH /users/me User A", True, "Income updated and persisted")
            else:
                test_result("PATCH /users/me User A", False, f"Update not persisted: {profile}")
        else:
            test_result("PATCH /users/me User A", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        test_result("PATCH /users/me User A", False, str(e))
else:
    test_result("PATCH /users/me User A", False, "Skipped (no token)")

# ================================================================
# TEST 5 — CREATE USER B
# ================================================================
print("\n[TEST 5] CREATE USER B")
try:
    r = client.post("/auth/register", json=USER_B)
    if r.status_code in [200, 400]:
        data = r.json()
        if r.status_code == 200:
            test_result("Registration User B", True, f"User ID: {data['data']['user_id']}")
        else:
            test_result("Registration User B", True, "User already exists (idempotent)")
    else:
        test_result("Registration User B", False, f"Status {r.status_code}: {r.text}")
except Exception as e:
    test_result("Registration User B", False, str(e))

# Login User B
print("\n[TEST 5b] LOGIN USER B")
try:
    r = client.post("/auth/login", json={"email": USER_B["email"], "password": USER_B["password"]})
    if r.status_code == 200:
        data = r.json()
        token_b = data["data"]["access_token"]
        test_result("Login User B", True, f"JWT token: {token_b[:20]}...")
    else:
        test_result("Login User B", False, f"Status {r.status_code}: {r.text}")
        token_b = None
except Exception as e:
    test_result("Login User B", False, str(e))
    token_b = None

# Get User B profile
print("\n[TEST 5c] GET USER B PROFILE")
if token_b:
    try:
        r = client.get("/users/me", headers={"Authorization": f"Bearer {token_b}"})
        if r.status_code == 200:
            profile = r.json()["data"]
            if (profile.get("email") == USER_B["email"] and
                profile.get("full_name") == USER_B["full_name"] and
                profile.get("email") != USER_A["email"]):
                test_result("GET /users/me User B", True, f"Profile: {profile['full_name']}, {profile['email']}")
            else:
                test_result("GET /users/me User B", False, f"Profile mismatch: {profile}")
        else:
            test_result("GET /users/me User B", False, f"Status {r.status_code}: {r.text}")
    except Exception as e:
        test_result("GET /users/me User B", False, str(e))
else:
    test_result("GET /users/me User B", False, "Skipped (no token)")

# ================================================================
# TEST 6 — USER ISOLATION
# ================================================================
print("\n[TEST 6] USER ISOLATION")
if token_a and token_b:
    try:
        # User A gets their own profile
        r_a = client.get("/users/me", headers={"Authorization": f"Bearer {token_a}"})
        profile_a = r_a.json()["data"]
        
        # User B gets their own profile
        r_b = client.get("/users/me", headers={"Authorization": f"Bearer {token_b}"})
        profile_b = r_b.json()["data"]
        
        # Verify isolation
        if (profile_a["email"] == USER_A["email"] and
            profile_b["email"] == USER_B["email"] and
            profile_a["email"] != profile_b["email"]):
            test_result("User Isolation", True, "User A != User B profiles correctly isolated")
        else:
            test_result("User Isolation", False, "Profile data leaked between users")
    except Exception as e:
        test_result("User Isolation", False, str(e))
else:
    test_result("User Isolation", False, "Skipped (missing tokens)")

# ================================================================
# TEST 7 — PAN ISOLATION
# ================================================================
print("\n[TEST 7] PAN ISOLATION")
if token_a and token_b:
    try:
        # Create PAN for User A
        pan_a = {
            "pan_reference": "SYNPAN-E2ETEST-A",
            "full_name": "Test User A",
            "date_of_birth": "1999-08-21",
            "income_bracket": "5-10L",
            "filing_status": "FILED",
            "assessment_year": "2024-25"
        }
        r = client.post("/pan/", headers={"Authorization": f"Bearer {token_a}"}, json=pan_a)
        pan_a_created = r.status_code in [200, 409]
        
        # Create PAN for User B
        pan_b = {
            "pan_reference": "SYNPAN-E2ETEST-B",
            "full_name": "Test User B",
            "date_of_birth": "2000-05-10",
            "income_bracket": "3-5L",
            "filing_status": "FILED",
            "assessment_year": "2024-25"
        }
        r = client.post("/pan/", headers={"Authorization": f"Bearer {token_b}"}, json=pan_b)
        pan_b_created = r.status_code in [200, 409]
        
        # List User A's PANs
        r_a = client.get("/pan/", headers={"Authorization": f"Bearer {token_a}"})
        pans_a = r_a.json()["data"]
        
        # List User B's PANs
        r_b = client.get("/pan/", headers={"Authorization": f"Bearer {token_b}"})
        pans_b = r_b.json()["data"]
        
        # Verify isolation
        refs_a = [p["pan_reference"] for p in pans_a]
        refs_b = [p["pan_reference"] for p in pans_b]
        
        leaked_b_in_a = any(ref in refs_a for ref in refs_b if "E2ETEST-B" in ref)
        leaked_a_in_b = any(ref in refs_b for ref in refs_a if "E2ETEST-A" in ref)
        
        if not leaked_b_in_a and not leaked_a_in_b:
            test_result("PAN Isolation", True, f"User A: {len(pans_a)} PANs, User B: {len(pans_b)} PANs (isolated)")
        else:
            test_result("PAN Isolation", False, "PAN records leaked between users")
    except Exception as e:
        test_result("PAN Isolation", False, str(e))
else:
    test_result("PAN Isolation", False, "Skipped (missing tokens)")

# ================================================================
# TEST 8 — DATABASE PERSISTENCE
# ================================================================
print("\n[TEST 8] DATABASE PERSISTENCE")
try:
    conn = sqlite3.connect("pan_records.db")
    cur = conn.cursor()
    
    # Check User A
    cur.execute(
        "SELECT name, email, phone, date_of_birth, family_income, income_source FROM users WHERE email = ?",
        (USER_A["email"],)
    )
    row_a = cur.fetchone()
    
    # Check User B
    cur.execute(
        "SELECT name, email, phone, date_of_birth, family_income, income_source FROM users WHERE email = ?",
        (USER_B["email"],)
    )
    row_b = cur.fetchone()
    
    conn.close()
    
    if row_a and row_b:
        if (row_a[1] == USER_A["email"] and
            row_b[1] == USER_B["email"] and
            row_a[1] != row_b[1]):
            test_result("Database Persistence", True, f"User A and User B data stored separately in DB")
        else:
            test_result("Database Persistence", False, "DB data incorrect")
    else:
        test_result("Database Persistence", False, "Users not found in DB")
except Exception as e:
    test_result("Database Persistence", False, str(e))

# ================================================================
# TEST 9 — API DOCS
# ================================================================
print("\n[TEST 9] API DOCS")
try:
    # Check /docs is accessible
    r_docs = client.get("/docs")
    docs_ok = r_docs.status_code == 200
    
    # Check OpenAPI schema has required endpoints
    r_openapi = client.get("/openapi.json")
    if r_openapi.status_code == 200:
        openapi_data = r_openapi.json()
        paths = openapi_data.get("paths", {})
        
        has_register = "/auth/register" in paths
        has_login = "/auth/login" in paths
        has_auth_me = "/auth/me" in paths
        has_users_me = "/users/me" in paths
        has_patch_users_me = (
            "/users/me" in paths and
            "patch" in paths.get("/users/me", {})
        )
        
        if docs_ok and has_register and has_login and has_auth_me and has_users_me and has_patch_users_me:
            test_result("API Docs", True, f"/docs + OpenAPI schema OK ({len(paths)} endpoints)")
        else:
            missing = []
            if not docs_ok: missing.append("/docs")
            if not has_register: missing.append("POST /auth/register")
            if not has_login: missing.append("POST /auth/login")
            if not has_auth_me: missing.append("GET /auth/me")
            if not has_users_me: missing.append("GET /users/me")
            if not has_patch_users_me: missing.append("PATCH /users/me")
            test_result("API Docs", False, f"Missing: {', '.join(missing)}")
    else:
        test_result("API Docs", False, f"/openapi.json status {r_openapi.status_code}")
except Exception as e:
    test_result("API Docs", False, str(e))

# ================================================================
# SUMMARY
# ================================================================
print("\n" + "=" * 70)
print("VERIFICATION SUMMARY")
print("=" * 70)

passed_count = sum(1 for r in results.values() if r["passed"])
total_count = len(results)

for name, result in results.items():
    status = "[PASS]" if result["passed"] else "[FAIL]"
    print(f"{status} - {name}")

print("\n" + "=" * 70)
print(f"TOTAL: {passed_count}/{total_count} tests passed")
print("=" * 70)

# Exit with appropriate code
sys.exit(0 if passed_count == total_count else 1)
