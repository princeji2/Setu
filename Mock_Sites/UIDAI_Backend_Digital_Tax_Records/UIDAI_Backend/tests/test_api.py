"""
Full test suite for UIDAI PAN Records Backend.
Covers: registration, authentication, profile (GET/PATCH), security/ownership, PAN endpoints.
"""
import sys
import os

# ---------------------------------------------------------------------------
# Ensure venv site-packages are importable when running with system Python
# ---------------------------------------------------------------------------
_base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_venv_sp = os.path.join(_base, "venv", "Lib", "site-packages")
if _venv_sp not in sys.path:
    sys.path.insert(0, _venv_sp)

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config.settings import GATEWAY_API_KEY, DEPARTMENT_NAME

client = TestClient(app)

# =========================================================
# TEST DATA
# =========================================================

USER_A_EMAIL = "user_a_profile@example.com"
USER_A_PHONE = "9111111111"
USER_A_PASSWORD = "PasswordA@1"

USER_B_EMAIL = "user_b_profile@example.com"
USER_B_PHONE = "9222222222"
USER_B_PASSWORD = "PasswordB@2"

# Legacy-style registration data (backward-compat)
LEGACY_EMAIL = "legacy_user@example.com"
LEGACY_PHONE = "9333333333"
LEGACY_PASSWORD = "LegacyPass@3"

VALID_SYNTHETIC_PAN = "SYNPAN-000123"
ALT_SYNTHETIC_PAN = "DEMO-998877"
REAL_PAN_EXAMPLE = "ABCDE1234F"


# =========================================================
# HELPERS
# =========================================================

def _register_user(email, phone, password, full_name="Test User",
                   dob="1995-06-15", income="5-10L", source="SALARY"):
    return client.post(
        "/auth/register",
        json={
            "full_name": full_name,
            "email": email,
            "mobile_number": phone,
            "date_of_birth": dob,
            "family_income": income,
            "income_source": source,
            "password": password,
        }
    )


def _login(email, password):
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.json()}"
    return r.json()["data"]["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# =========================================================
# ROOT API
# =========================================================

def test_root():
    r = client.get("/")
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["error"] is None
    assert d["data"]["service"] == "PAN Records Service"
    assert d["data"]["department"] == DEPARTMENT_NAME
    assert "PAN Records Service is running" in d["data"]["message"]


# =========================================================
# REGISTRATION — valid (full new-style fields)
# =========================================================

def test_register_user_a():
    r = _register_user(USER_A_EMAIL, USER_A_PHONE, USER_A_PASSWORD,
                       full_name="User Alpha", dob="1992-03-10",
                       income="5-10L", source="SALARY")
    assert r.status_code in [200, 400], r.json()
    if r.status_code == 200:
        d = r.json()
        assert d["success"] is True
        assert d["error"] is None
        assert "user_id" in d["data"]
    else:
        assert "already registered" in r.json()["error"]


def test_register_user_b():
    r = _register_user(USER_B_EMAIL, USER_B_PHONE, USER_B_PASSWORD,
                       full_name="User Beta", dob="1990-11-25",
                       income="10-15L", source="BUSINESS")
    assert r.status_code in [200, 400], r.json()
    if r.status_code == 200:
        d = r.json()
        assert d["success"] is True
        assert "user_id" in d["data"]
    else:
        assert "already registered" in r.json()["error"]


# =========================================================
# REGISTRATION — backward-compat legacy fields (name / phone)
# =========================================================

def test_register_legacy_style():
    """Clients using the old 'name' / 'phone' field names must still work."""
    r = client.post(
        "/auth/register",
        json={
            "name": "Legacy Taxpayer",
            "email": LEGACY_EMAIL,
            "phone": LEGACY_PHONE,
            "password": LEGACY_PASSWORD,
        }
    )
    assert r.status_code in [200, 400], r.json()
    if r.status_code == 200:
        d = r.json()
        assert d["success"] is True
        assert "user_id" in d["data"]
    else:
        assert "already registered" in r.json()["error"]


# =========================================================
# REGISTRATION — validation failures
# =========================================================

def test_duplicate_email():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Another User",
            "email": USER_A_EMAIL,
            "mobile_number": "9555555555",
            "password": USER_A_PASSWORD,
        }
    )
    assert r.status_code == 400
    assert r.json()["error"] == "Email already registered"


def test_duplicate_mobile():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Another User",
            "email": "another_dup@example.com",
            "mobile_number": USER_A_PHONE,
            "password": USER_A_PASSWORD,
        }
    )
    assert r.status_code == 400
    assert r.json()["error"] == "Phone number already registered"


def test_invalid_email_format():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Bad Email",
            "email": "not-an-email",
            "mobile_number": "9400000001",
            "password": "Password@1",
        }
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_invalid_mobile_too_short():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Bad Phone",
            "email": "badphone@example.com",
            "mobile_number": "123",
            "password": "Password@1",
        }
    )
    assert r.status_code == 422
    d = r.json()
    assert d["success"] is False
    assert "10 digits" in d["error"].lower() or "mobile" in d["error"].lower() or "phone" in d["error"].lower()


def test_invalid_mobile_wrong_start():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Bad Phone Start",
            "email": "badphone2@example.com",
            "mobile_number": "1234567890",
            "password": "Password@1",
        }
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_invalid_password_too_weak():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Weak Pass",
            "email": "weakpass@example.com",
            "mobile_number": "9400000002",
            "password": "weak",
        }
    )
    assert r.status_code == 422
    d = r.json()
    assert d["success"] is False


def test_invalid_dob_future():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Future DOB",
            "email": "futuredob@example.com",
            "mobile_number": "9400000003",
            "date_of_birth": "2099-01-01",
            "family_income": "5-10L",
            "income_source": "SALARY",
            "password": "Password@1",
        }
    )
    assert r.status_code == 422
    d = r.json()
    assert d["success"] is False
    assert "past" in d["error"].lower()


def test_invalid_family_income():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Bad Income",
            "email": "badincome@example.com",
            "mobile_number": "9400000004",
            "date_of_birth": "1990-01-01",
            "family_income": "INVALID",
            "income_source": "SALARY",
            "password": "Password@1",
        }
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_invalid_income_source():
    r = client.post(
        "/auth/register",
        json={
            "full_name": "Bad Source",
            "email": "badsource@example.com",
            "mobile_number": "9400000005",
            "date_of_birth": "1990-01-01",
            "family_income": "5-10L",
            "income_source": "GAMBLING",
            "password": "Password@1",
        }
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


# =========================================================
# AUTHENTICATION
# =========================================================

def test_login_user_a():
    r = client.post("/auth/login", json={"email": USER_A_EMAIL, "password": USER_A_PASSWORD})
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["error"] is None
    assert d["data"]["token_type"] == "bearer"
    assert "access_token" in d["data"]


def test_wrong_password():
    r = client.post("/auth/login", json={"email": USER_A_EMAIL, "password": "WrongPass@9"})
    assert r.status_code == 401
    d = r.json()
    assert d["success"] is False
    assert d["error"] == "Invalid email or password"


def test_nonexistent_email():
    r = client.post("/auth/login", json={"email": "nobody@example.com", "password": "Password@1"})
    assert r.status_code == 401
    assert r.json()["success"] is False


def test_unauthorized_without_token():
    r = client.get("/users/me")
    assert r.status_code in [401, 403]
    assert r.json()["success"] is False


def test_invalid_jwt():
    r = client.get("/users/me", headers={"Authorization": "Bearer not.a.real.jwt"})
    assert r.status_code == 401
    assert r.json()["success"] is False


# =========================================================
# GET /users/me — profile retrieval
# =========================================================

def test_get_my_profile_user_a():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.get("/users/me", headers=_auth(token))
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["error"] is None
    profile = d["data"]
    assert profile["email"] == USER_A_EMAIL
    assert profile["mobile_number"] == USER_A_PHONE
    assert profile["full_name"] == "User Alpha"
    # DOB may have been updated by PATCH tests — just confirm it is present and not None
    assert profile["date_of_birth"] is not None
    assert len(profile["date_of_birth"]) == 10  # YYYY-MM-DD format
    assert profile["is_active"] is True
    # Password must NEVER appear
    assert "password" not in profile
    assert "hashed_password" not in profile


def test_get_my_profile_user_b():
    token = _login(USER_B_EMAIL, USER_B_PASSWORD)
    r = client.get("/users/me", headers=_auth(token))
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    profile = d["data"]
    assert profile["email"] == USER_B_EMAIL
    assert profile["mobile_number"] == USER_B_PHONE
    assert profile["full_name"] == "User Beta"
    assert profile["date_of_birth"] == "1990-11-25"
    assert profile["family_income"] == "10-15L"
    assert profile["income_source"] == "BUSINESS"


# =========================================================
# PROFILE — User A cannot see User B's data via /users/me
# =========================================================

def test_user_a_profile_is_not_user_b():
    token_a = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.get("/users/me", headers=_auth(token_a))
    assert r.status_code == 200
    profile = r.json()["data"]
    assert profile["email"] == USER_A_EMAIL
    assert profile["email"] != USER_B_EMAIL
    assert profile["mobile_number"] != USER_B_PHONE


def test_user_b_profile_is_not_user_a():
    token_b = _login(USER_B_EMAIL, USER_B_PASSWORD)
    r = client.get("/users/me", headers=_auth(token_b))
    assert r.status_code == 200
    profile = r.json()["data"]
    assert profile["email"] == USER_B_EMAIL
    assert profile["email"] != USER_A_EMAIL


# =========================================================
# PATCH /users/me — profile update
# =========================================================

def test_patch_my_profile_full_name():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"full_name": "User Alpha Updated"}
    )
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["data"]["full_name"] == "User Alpha Updated"
    assert d["data"]["email"] == USER_A_EMAIL  # unchanged

    # Restore
    client.patch("/users/me", headers=_auth(token), json={"full_name": "User Alpha"})


def test_patch_my_profile_income():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"family_income": "10-15L", "income_source": "BUSINESS"}
    )
    assert r.status_code == 200
    d = r.json()
    assert d["data"]["family_income"] == "10-15L"
    assert d["data"]["income_source"] == "BUSINESS"

    # Restore
    client.patch("/users/me", headers=_auth(token), json={"family_income": "5-10L", "income_source": "SALARY"})


def test_patch_my_profile_dob():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"date_of_birth": "1993-07-20"}
    )
    assert r.status_code == 200
    assert r.json()["data"]["date_of_birth"] == "1993-07-20"
    # Restore original DOB
    client.patch("/users/me", headers=_auth(token), json={"date_of_birth": "1992-03-10"})


def test_patch_invalid_mobile():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"mobile_number": "123"}
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_patch_invalid_income():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"family_income": "LOTS"}
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_patch_invalid_income_source():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"income_source": "CHEATING"}
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_patch_future_dob():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token),
        json={"date_of_birth": "2099-12-31"}
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_patch_duplicate_mobile_rejected():
    """User A cannot set their mobile_number to User B's existing number."""
    token_a = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.patch(
        "/users/me",
        headers=_auth(token_a),
        json={"mobile_number": USER_B_PHONE}
    )
    assert r.status_code == 400
    assert "already registered" in r.json()["error"].lower()


def test_patch_requires_auth():
    r = client.patch("/users/me", json={"full_name": "Hacker"})
    assert r.status_code in [401, 403]
    assert r.json()["success"] is False


# =========================================================
# /auth/me — legacy endpoint still works
# =========================================================

def test_auth_me_still_works():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.get("/auth/me", headers=_auth(token))
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["data"]["email"] == USER_A_EMAIL


def test_auth_me_without_token():
    r = client.get("/auth/me")
    assert r.status_code in [401, 403]
    assert r.json()["success"] is False


# =========================================================
# SYNTHETIC PAN — validation
# =========================================================

def test_reject_real_pan():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.post(
        "/pan/",
        headers=_auth(token),
        json={
            "pan_reference": REAL_PAN_EXAMPLE,
            "full_name": "Real Format Disallowed",
            "date_of_birth": "1990-01-01",
            "income_bracket": "5-10L",
            "filing_status": "FILED",
            "assessment_year": "2024-25"
        }
    )
    assert r.status_code == 422
    d = r.json()
    assert d["success"] is False
    assert "strictly prohibited" in d["error"].lower() or "real pan" in d["error"].lower()


def test_reject_arbitrary_pan():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.post(
        "/pan/",
        headers=_auth(token),
        json={
            "pan_reference": "123456789012",
            "full_name": "Numeric Reject Test",
            "date_of_birth": "1990-01-01",
            "income_bracket": "5-10L",
            "filing_status": "FILED",
            "assessment_year": "2024-25"
        }
    )
    assert r.status_code == 422
    d = r.json()
    assert d["success"] is False
    assert "synthetic" in d["error"].lower()


# =========================================================
# PAN RECORD — create & list
# =========================================================

def test_create_synthetic_pan_record_user_a():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.post(
        "/pan/",
        headers=_auth(token),
        json={
            "pan_reference": VALID_SYNTHETIC_PAN,
            "full_name": "User Alpha",
            "date_of_birth": "1992-06-15",
            "income_bracket": "5-10L",
            "filing_status": "FILED",
            "assessment_year": "2024-25"
        }
    )
    assert r.status_code in [200, 409]
    if r.status_code == 200:
        d = r.json()
        assert d["success"] is True
        assert d["error"] is None
        record = d["data"]
        assert record["pan_reference"] == VALID_SYNTHETIC_PAN
        assert record["status"] == "VERIFIED"
        assert record["income_bracket"] == "5-10L"
        assert record["ai_score"] >= 90
        assert record["risk_level"] == "LOW"


def test_list_my_pan_records_user_a():
    token = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.get("/pan/", headers=_auth(token))
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert isinstance(d["data"], list)


# =========================================================
# PAN OWNERSHIP — User B cannot see User A's PAN records
# =========================================================

def test_pan_ownership_isolation():
    """
    Create a unique PAN for User B, then confirm User A cannot retrieve it
    by ID when using User A's token (the service enforces user_id filtering).
    """
    token_b = _login(USER_B_EMAIL, USER_B_PASSWORD)

    # Create a PAN record for User B
    create_r = client.post(
        "/pan/",
        headers=_auth(token_b),
        json={
            "pan_reference": ALT_SYNTHETIC_PAN,
            "full_name": "User Beta",
            "date_of_birth": "1990-11-25",
            "income_bracket": "10-15L",
            "filing_status": "FILED",
            "assessment_year": "2024-25"
        }
    )
    assert create_r.status_code in [200, 409]

    # Get the record id if freshly created
    if create_r.status_code == 200:
        record_id = create_r.json()["data"]["id"]
    else:
        # Already exists — find it via list
        list_r = client.get("/pan/", headers=_auth(token_b))
        records = list_r.json()["data"]
        b_record = next(
            (rec for rec in records if rec["pan_reference"] == ALT_SYNTHETIC_PAN), None
        )
        if b_record is None:
            pytest.skip("Could not locate User B's PAN record for ownership test")
        record_id = b_record["id"]

    # User A tries to read User B's record by ID — must get 404
    token_a = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.get(f"/pan/{record_id}", headers=_auth(token_a))
    assert r.status_code == 404
    assert r.json()["success"] is False


def test_pan_list_isolation():
    """User A's PAN list must not contain User B's records."""
    token_a = _login(USER_A_EMAIL, USER_A_PASSWORD)
    r = client.get("/pan/", headers=_auth(token_a))
    assert r.status_code == 200
    records = r.json()["data"]
    # All records in the list must belong to User A
    # (We check no record uses User B's pan reference)
    user_b_refs = [rec["pan_reference"] for rec in records if rec["pan_reference"] == ALT_SYNTHETIC_PAN]
    assert len(user_b_refs) == 0, "User A's PAN list leaked User B's record"


# =========================================================
# GATEWAY INTEGRATION TESTS
# =========================================================

def test_gateway_fields_missing_key():
    r = client.get(f"/pan/{VALID_SYNTHETIC_PAN}/fields")
    assert r.status_code == 401
    d = r.json()
    assert d["success"] is False
    assert "Missing X-Gateway-Key" in d["error"]


def test_gateway_fields_invalid_key():
    r = client.get(
        f"/pan/{VALID_SYNTHETIC_PAN}/fields",
        headers={"X-Gateway-Key": "incorrect-secret-key"}
    )
    assert r.status_code == 401
    d = r.json()
    assert "Invalid X-Gateway-Key" in d["error"]


def test_gateway_fields_reject_real_pan():
    r = client.get(
        f"/pan/{REAL_PAN_EXAMPLE}/fields",
        headers={"X-Gateway-Key": GATEWAY_API_KEY}
    )
    assert r.status_code == 400
    d = r.json()
    assert "Real PAN numbers are strictly forbidden" in d["error"]


def test_gateway_fields_not_found():
    r = client.get(
        "/pan/SYNPAN-999999/fields",
        headers={"X-Gateway-Key": GATEWAY_API_KEY}
    )
    assert r.status_code == 404
    d = r.json()
    assert d["success"] is False
    assert "not found" in d["error"].lower()


def test_gateway_fields_success():
    r = client.get(
        f"/pan/{VALID_SYNTHETIC_PAN}/fields",
        headers={"X-Gateway-Key": GATEWAY_API_KEY}
    )
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert d["error"] is None
    payload = d["data"]
    assert payload["reference"] == VALID_SYNTHETIC_PAN
    assert payload["sourceDepartment"] == "Digital Tax Records — Demo Department"
    fields = payload["fields"]
    assert len(fields) == 4
    field_map = {f["name"]: f for f in fields}
    assert "fullName" in field_map
    assert "filingStatus" in field_map
    assert "incomeBracket" in field_map
    assert "assessmentYear" in field_map
    assert field_map["filingStatus"]["value"] == "FILED"
    for f in fields:
        assert f["verified"] is True
        assert len(f["lastUpdated"]) > 0


# =========================================================
# ADMIN ENDPOINTS (preserved)
# =========================================================

def test_get_users_list():
    r = client.get("/users/")
    assert r.status_code == 200
    d = r.json()
    assert d["success"] is True
    assert isinstance(d["data"], list)
    # Confirm response uses new field names
    if d["data"]:
        user = d["data"][0]
        assert "full_name" in user
        assert "mobile_number" in user
        assert "password" not in user


def test_get_user_by_id():
    r = client.get("/users/")
    users = r.json()["data"]
    if users:
        uid = users[0]["id"]
        r2 = client.get(f"/users/{uid}")
        assert r2.status_code == 200
        d = r2.json()
        assert d["success"] is True
        assert "full_name" in d["data"]
        assert "password" not in d["data"]


def test_get_user_not_found():
    r = client.get("/users/999999")
    assert r.status_code == 404
    d = r.json()
    assert d["success"] is False
    assert d["data"] is None
    assert d["error"] == "User not found"


def test_delete_user():
    # Register a temp user to delete
    reg = client.post(
        "/auth/register",
        json={
            "full_name": "Temp Delete User",
            "email": "tempdelete@example.com",
            "mobile_number": "9700000001",
            "password": "Password@1"
        }
    )
    assert reg.status_code in [200, 400]
    if reg.status_code == 200:
        uid = reg.json()["data"]["user_id"]
    else:
        users = client.get("/users/").json()["data"]
        uid = [u["id"] for u in users if u["email"] == "tempdelete@example.com"][0]
    del_r = client.delete(f"/users/{uid}")
    assert del_r.status_code == 200
    d = del_r.json()
    assert d["success"] is True
    assert d["data"]["message"] == "User deleted successfully"


def test_update_user_by_id():
    reg = client.post(
        "/auth/register",
        json={
            "full_name": "Temp Update User",
            "email": "tempupdate@example.com",
            "mobile_number": "9700000002",
            "password": "Password@1"
        }
    )
    assert reg.status_code in [200, 400]
    users = client.get("/users/").json()["data"]
    temp_matches = [u for u in users if u["email"] == "tempupdate@example.com"]
    target = temp_matches[0] if temp_matches else users[-1]
    uid = target["id"]
    # Use full profile fields for update
    up = client.put(
        f"/users/{uid}",
        json={
            "full_name": "Updated Admin Name",
            "email": target["email"],
            "mobile_number": target["mobile_number"],
            "date_of_birth": "1990-01-15",
            "family_income": "5-10L",
            "income_source": "SALARY",
            "password": "UpdatedPass@1"
        }
    )
    assert up.status_code == 200
    d = up.json()
    assert d["success"] is True
    assert d["data"]["full_name"] == "Updated Admin Name"
