# Digital Tax Records — Demo Department

**Educational Prototype | Synthetic Data Only | FastAPI + SQLAlchemy + SQLite**

This is one of the independent department demo services that integrates into the central **Setu** consent-based interoperability gateway (SIH26129). It represents the **Digital Tax Records — Demo Department**, providing synthetic PAN card verification and coarse tax-filing record verification backed by a persistent SQLite database.

It enforces synthetic-only test identifiers, performs rule-based and AI-driven consistency scoring, and exposes standardized REST APIs for consent-based field queries by the Setu Gateway.

> **No real PAN numbers, no real tax records, no real financial figures, no government API connections.**
> This service is strictly an educational mock for interoperability and consent flow testing. Real 10-character PAN numbers (`AAAAA9999A`) and real financial data are prohibited and explicitly rejected.

---

## Project Structure

```
UIDAI_Backend/
├── app/
│   ├── ai/
│   │   ├── __init__.py
│   │   └── analyzer.py          # AI & rule-based PAN record consistency scoring
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py          # Environment settings, CORS origins & gateway keys
│   ├── models/
│   │   ├── __init__.py
│   │   ├── pan.py               # PanRecord SQLAlchemy model (pan_records table)
│   │   └── user.py              # User SQLAlchemy model (users table)
│   ├── routes/
│   │   ├── __init__.py
│   │   └── pan.py               # /pan routes (/fields gateway endpoint & PAN CRUD)
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── pan_schema.py        # Pydantic models for PAN & Gateway responses
│   │   └── user_schema.py       # Pydantic models for User auth and management
│   ├── services/
│   │   ├── __init__.py
│   │   └── pan_service.py       # Business logic for PAN verification & gateway fields
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── security.py          # CryptContext and JWT token helpers
│   │   └── validators.py        # Synthetic vs real PAN validation helpers
│   ├── auth.py                  # JWT Bearer authentication dependency
│   ├── database.py              # SQLAlchemy engine, sessionmaker, Base, get_db
│   ├── pan_verification.py      # Core synthetic PAN verification routine
│   └── main.py                  # FastAPI application entry point, CORS & handlers
├── tests/
│   ├── __init__.py
│   └── test_api.py              # Pytest suite covering auth, PAN CRUD, and Gateway API
├── .env                         # Local environment configuration (ignored by git)
├── .env.example                 # Environment configuration template
├── requirements.txt             # Python dependencies
└── README.md
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10+ | `python --version` |
| pip | 22+ | Bundled with Python |
| SQLite3 | Built-in | Uses `pan_records.db` |

---

## Setup Instructions

### 1. Clone or navigate to the repository

```powershell
cd c:\Users\Prince\OneDrive\Desktop\Setu\Mock_Sites\UIDAI_Backend
```

### 2. Activate virtual environment and install dependencies

```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and set your configuration:

```powershell
copy .env.example .env
```

Environment variables:

```ini
# Security & JWT
SECRET_KEY=your-super-secret-key-change-this
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Gateway Interoperability (SIH26129)
GATEWAY_API_KEY=setu-demo-gateway-key-dtr-2026
GATEWAY_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:5000

# Database
DATABASE_URL=sqlite:///./pan_records.db
```

> [!IMPORTANT]
> The `GATEWAY_API_KEY` configured here must match the key forwarded by the Setu Gateway in the `X-Gateway-Key` request header.

### 4. Run the API Server

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The server will be accessible at:
- **API Base URL**: `http://localhost:8000`
- **Interactive OpenAPI Docs**: `http://localhost:8000/docs`
- **ReDoc Documentation**: `http://localhost:8000/redoc`

---

## Synthetic Identifier Validation Rules

To preserve privacy and ensure no genuine citizen credentials are ever ingested or stored:

1. **Synthetic-Only Format**: Every identifier must start with `SYNPAN-` or `DEMO-` followed by 3 to 10 digits (e.g. `SYNPAN-000123` or `DEMO-998877`).
2. **Real PAN Prohibition**: Real-world PAN strings matching `^[A-Za-z]{5}[0-9]{4}[A-Za-z]$` are strictly forbidden and rejected immediately with an HTTP 422 or 400 validation error.
3. **Coarse Synthetic Financial Brackets**: Income values are categorized as coarse synthetic bands (`0-3L`, `3-5L`, `0-5L`, `5-10L`, `10-15L`, `10L+`, `15L+`). Specific rupee figures are never accepted or stored.
4. **Filing Status**: Standardized to `FILED`, `NOT_FILED`, or `PENDING`.

---

## Standardized Gateway Response Shape

In harmony with the other Setu mock services (such as Website 1 — National Identity Registry), all endpoints return responses wrapped in the standardized envelope:

```json
{
  "success": true,
  "data": { ... } | null,
  "error": string | null
}
```

- If successful, `success` is `true`, `data` contains the requested payload, and `error` is `null`.
- On failure, `success` is `false`, `data` is `null`, and `error` contains a clear description of the error.

---

## REST API Reference

### Public & Gateway Endpoints

#### `GET /`

Service health and department identity.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "service": "PAN Records Service",
    "department": "Digital Tax Records — Demo Department",
    "message": "PAN Records Service is running",
    "version": "1.0.0"
  },
  "error": null
}
```

---

#### `GET /pan/{pan_reference}/fields`

Protected machine-to-machine endpoint queried by the **Setu Interoperability Gateway** during citizen-consented verification.

- **Authentication**: Requires the `X-Gateway-Key` request header matching `GATEWAY_API_KEY`.
- **Synthetic Validation**: Rejects real PAN formats (`AAAAA9999A`) and non-synthetic references with HTTP 400.

**Request Headers:**
```http
X-Gateway-Key: setu-demo-gateway-key-dtr-2026
```

**Response — Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "reference": "SYNPAN-000123",
    "fields": [
      {
        "name": "fullName",
        "value": "Synthetic Taxpayer",
        "verified": true,
        "lastUpdated": "2026-09-17T03:08:49.123456+00:00"
      },
      {
        "name": "filingStatus",
        "value": "FILED",
        "verified": true,
        "lastUpdated": "2026-09-17T03:08:49.123456+00:00"
      },
      {
        "name": "incomeBracket",
        "value": "5-10L",
        "verified": true,
        "lastUpdated": "2026-09-17T03:08:49.123456+00:00"
      },
      {
        "name": "assessmentYear",
        "value": "2024-25",
        "verified": true,
        "lastUpdated": "2026-09-17T03:08:49.123456+00:00"
      }
    ],
    "sourceDepartment": "Digital Tax Records — Demo Department"
  },
  "error": null
}
```

**Response — Missing or Invalid Key (401 Unauthorized):**
```json
{
  "success": false,
  "data": null,
  "error": "Access denied: Missing X-Gateway-Key header for gateway service authentication."
}
```

**Response — Real PAN Rejected (400 Bad Request):**
```json
{
  "success": false,
  "data": null,
  "error": "Validation failed: Real PAN numbers are strictly forbidden. Please use synthetic test identifiers (e.g., SYNPAN-000123)."
}
```

**Response — Record Not Found (404 Not Found):**
```json
{
  "success": false,
  "data": null,
  "error": "PAN record 'SYNPAN-999999' not found in tax records database."
}
```

---

### Citizen Authentication Endpoints

#### `POST /auth/register`

Registers a new user account.

**Request:**
```json
{
  "name": "Synthetic Taxpayer",
  "email": "taxpayer@example.com",
  "phone": "9876543210",
  "password": "Password@123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "message": "User registered successfully"
  },
  "error": null
}
```

---

#### `POST /auth/login`

Authenticates credentials and returns a JWT Bearer token.

**Request:**
```json
{
  "email": "taxpayer@example.com",
  "password": "Password@123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
    "token_type": "bearer",
    "message": "Login successful"
  },
  "error": null
}
```

---

#### `GET /auth/me`

Retrieves the currently authenticated user profile.

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Synthetic Taxpayer",
    "email": "taxpayer@example.com",
    "phone": "9876543210",
    "is_active": true
  },
  "error": null
}
```

---

### PAN Record CRUD Endpoints (User-Authenticated)

#### `POST /pan/`

Submits a synthetic PAN record for verification. Evaluates the record against consistency rules and AI scoring logic.

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "pan_reference": "SYNPAN-000123",
  "full_name": "Synthetic Taxpayer",
  "date_of_birth": "1992-06-15",
  "income_bracket": "5-10L",
  "filing_status": "FILED",
  "assessment_year": "2024-25"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "user_id": 1,
    "pan_reference": "SYNPAN-000123",
    "full_name": "Synthetic Taxpayer",
    "date_of_birth": "1992-06-15",
    "income_bracket": "5-10L",
    "filing_status": "FILED",
    "assessment_year": "2024-25",
    "status": "VERIFIED",
    "message": "Demo PAN record verification successful",
    "ai_score": 100,
    "risk_level": "LOW",
    "created_at": "2026-09-17T03:08:49.123456"
  },
  "error": null
}
```

---

#### `GET /pan/`

Lists all synthetic PAN records created by the authenticated user.

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "pan_reference": "SYNPAN-000123",
      "full_name": "Synthetic Taxpayer",
      "date_of_birth": "1992-06-15",
      "income_bracket": "5-10L",
      "filing_status": "FILED",
      "assessment_year": "2024-25",
      "status": "VERIFIED",
      "message": "Demo PAN record verification successful",
      "ai_score": 100,
      "risk_level": "LOW",
      "created_at": "2026-09-17T03:08:49.123456"
    }
  ],
  "error": null
}
```

---

#### `GET /pan/{record_id}`

Retrieves a single PAN record by record ID.

---

### User Administration Endpoints

- `GET /users/` — List all registered users (standardized response)
- `GET /users/{user_id}` — Get user profile by ID
- `PUT /users/{user_id}` — Update user profile
- `DELETE /users/{user_id}` — Delete user

---

## Testing

Run the automated test suite with pytest:

```powershell
.\venv\Scripts\python.exe -m pytest tests/test_api.py -v
```

All 22 test cases cover:
- Service branding & `/` endpoint
- User registration, duplicate checks, password/phone validation
- JWT authentication and protected profile retrieval
- **Synthetic identifier validation**: strict rejection of real PAN numbers and invalid formats
- PAN record creation, AI consistency scoring (`ai_score`, `risk_level`), and history retrieval
- **Gateway integration**: `X-Gateway-Key` validation, real PAN rejection, 404 not found, and exact 4-field consent response shape
- User administration CRUD
