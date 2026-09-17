# National Identity Registry — Demo Department

**Educational Prototype | Synthetic Data Only | Node.js + Express + PostgreSQL 17**

This is one of three independent department demo sites that integrates into the central **Setu** consent-based interoperability gateway (SIH26129). It represents the **National Identity Registry — Demo Department**, backed by a persistent PostgreSQL database. It accepts synthetic test identifiers, checks for duplicates, and exposes standardized REST APIs for consent-based field queries by the Setu Gateway.

> **No real Aadhaar numbers, no real identity data, no government API connections.**

---

## Project Structure

```
SETU/
├── backend/
│   ├── config/
│   │   └── database.js          # PostgreSQL pool, query helper, testConnection
│   ├── controllers/
│   │   ├── adminController.js   # Login, stats, registrations, audit logs
│   │   └── registrationController.js  # Check & register IDs, fields retrieval
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT Bearer token verification (human admin)
│   │   ├── gatewayAuthMiddleware.js # Service API key verification (X-Gateway-Key)
│   │   ├── errorMiddleware.js   # Global error handler (standardized shape)
│   │   └── validationMiddleware.js  # express-validator rules
│   ├── routes/
│   │   ├── adminRoutes.js       # /api/admin/*
│   │   └── registrationRoutes.js  # /api/registration/* (/check and /fields)
│   ├── services/
│   │   ├── auditService.js      # Audit log persistence (FIELDS_ACCESSED, etc.)
│   │   └── registrationService.js  # DB check, register, and demographic fields
│   ├── utils/
│   │   └── validators.js        # Synthetic ID validation, real-ID rejection
│   └── server.js                # Express app entry point & CORS configuration
├── database/
│   ├── schema.sql               # Table definitions (registrations, admins, audit_logs)
│   ├── initDb.js                # Applies schema.sql and seeds demo records
│   ├── seedAdmin.js             # Creates initial admin user (bcrypt hashed)
│   └── seedRegistrations.js     # Seeds synthetic test identifiers with fields
├── frontend/
│   ├── index.html               # Home / landing page
│   ├── registration.html        # Registration check page
│   ├── admin-login.html         # Admin authentication page
│   ├── admin-dashboard.html     # Admin panel (records, stats, audit log)
│   ├── css/
│   │   ├── style.css            # Main design system
│   │   └── admin.css            # Admin panel specific styles
│   └── js/
│       ├── main.js              # Shared utilities (toast, date format, health check)
│       ├── registration.js      # Registration form controller
│       ├── admin-login.js       # Admin login form controller
│       └── admin-dashboard.js   # Dashboard data loader (stats, table, audit log)
├── tests/
│   └── gatewayIntegration.test.js # Gateway auth, fields endpoint, CORS & response shape tests
├── .env                         # Local secrets (not committed)
├── .env.example                 # Placeholder template for .env
├── .gitignore
└── package.json
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18 or 20+ | `node --version` |
| npm | 9+ | bundled with Node.js |
| PostgreSQL | 17 | Windows service `postgresql-17` on port 5432 |

---

## First-Time Setup

### 1. Clone / open the project

```
cd C:\Users\Prince\Downloads\SETU\SETU
```

### 2. Install Node dependencies

```
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in real values:

```
copy .env.example .env
```

Required variables:

```
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aadhaar_portal_db
DB_USER=postgres
DB_PASSWORD=your_postgres_superuser_password
JWT_SECRET=a_random_string_at_least_32_characters
JWT_EXPIRES_IN=8h
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=your_admin_password
CLIENT_ORIGIN=http://localhost:5000
GATEWAY_ORIGINS=http://localhost:5173,http://localhost:3000
GATEWAY_API_KEY=setu_gateway_secret_key_demo_2026
DEPARTMENT_NAME=National Identity Registry — Demo Department
```

### 4. Ensure PostgreSQL 17 is running

```powershell
# Check service status
Get-Service postgresql-17

# Start if stopped
Start-Service postgresql-17
```

### 5. Create the database

```powershell
# Using psql (adjust password as needed)
$env:PGPASSWORD = "your_postgres_superuser_password"
psql -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE aadhaar_portal_db;"
```

### 6. Apply schema

```
npm run db:init
```

Creates three tables in `aadhaar_portal_db`:
- `registrations` — identity reference records, UNIQUE constraint enforced
- `admins` — bcrypt-hashed admin credentials
- `audit_logs` — tamper-evident event log

### 7. Seed the admin account

```
npm run db:seed
```

Creates the admin user from `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` in `.env`. Safe to run multiple times — skips if user already exists.

### 8. Start the server

```
npm start
```

Or with auto-restart during development:

```
npm run dev
```

Server starts at **http://localhost:5000**

---

## Pages

| URL | Description |
|---|---|
| `http://localhost:5000/` | Landing page |
| `http://localhost:5000/registration.html` | Identity registration check |
| `http://localhost:5000/admin-login.html` | Admin sign in |
| `http://localhost:5000/admin-dashboard.html` | Admin panel (JWT-protected) |

---

## REST API Reference

All API routes are under `/api/` (except `/health`). Designed for clean, uniform integration by the **Setu** interoperability gateway.

### Standardized Gateway Response Shape

All endpoints intended for Gateway consumption (`/api/registration/check` and `/api/registration/:identityReference/fields`) return responses in this exact consistent shape so the gateway can parse all department sites identically:

```json
{
  "success": boolean,
  "data": { ... } | null,
  "error": string | null
}
```

---

### Gateway & Public Endpoints

#### `GET /health`

System health check. Returns database connectivity status and department service identity.

**Response (200 healthy):**
```json
{
  "status": "healthy",
  "service": "National Identity Registry — Demo Department",
  "timestamp": "2026-09-16T17:00:00.000Z",
  "database": {
    "engine": "PostgreSQL 17",
    "connected": true,
    "error": null
  }
}
```

---

#### `POST /api/registration/check`

Check and register a synthetic identity reference. Rate limited to 45 requests per 5 minutes per IP. Conforms to the standardized gateway response shape.

**Request body:**
```json
{ "identityReference": "TESTAADHAAR0001" }
```

**Response — new registration (200):**
```json
{
  "success": true,
  "data": {
    "identityReference": "TESTAADHAAR0001",
    "registered": false,
    "status": "REGISTERED",
    "createdAt": "2026-09-16T17:13:09.250Z",
    "message": "Registered Successfully"
  },
  "error": null
}
```

**Response — already registered (200):**
```json
{
  "success": true,
  "data": {
    "identityReference": "TESTAADHAAR0001",
    "registered": true,
    "status": "ALREADY REGISTERED",
    "registeredAt": "2026-09-16T17:13:09.250Z",
    "createdAt": "2026-09-16T17:13:09.250Z",
    "message": "Already Registered"
  },
  "error": null
}
```

**Response — validation error (400):**
```json
{
  "success": false,
  "data": null,
  "error": "Validation failed: Identity reference may only contain alphanumeric characters, hyphens, and underscores (e.g., TESTAADHAAR0001)."
}
```

**Identity reference rules:**
- Uppercase alphanumeric, hyphens, and underscores only
- 4–32 characters
- Real 12-digit numeric strings are strictly rejected

---

#### `GET /api/registration/:identityReference/fields`

Fetches synthetic demographic fields for a registered identity reference during the Setu consent flow.

- **Authentication**: Requires machine-to-machine service key header `X-Gateway-Key` (matches `GATEWAY_API_KEY` in `.env`).
- **Audit Logging**: Logs event `FIELDS_ACCESSED` to `audit_logs` including requesting client service and accessed field names.

**Request Headers:**
```http
X-Gateway-Key: setu_gateway_secret_key_demo_2026
X-Gateway-Client: Setu-Gateway
```

**Response — Success (200):**
```json
{
  "success": true,
  "data": {
    "identityReference": "TESTAADHAAR0001",
    "fields": [
      {
        "name": "fullName",
        "value": "Test Citizen One",
        "verified": true,
        "lastUpdated": "2026-09-16T17:13:09.250Z"
      },
      {
        "name": "dob",
        "value": "1998-04-12",
        "verified": true,
        "lastUpdated": "2026-09-16T17:13:09.250Z"
      },
      {
        "name": "gender",
        "value": "Male",
        "verified": true,
        "lastUpdated": "2026-09-16T17:13:09.250Z"
      },
      {
        "name": "address",
        "value": "Synthetic Address, Test District, New Delhi - 110001",
        "verified": true,
        "lastUpdated": "2026-09-16T17:13:09.250Z"
      }
    ],
    "sourceDepartment": "National Identity Registry — Demo Department"
  },
  "error": null
}
```

**Response — Not Found (404):**
```json
{
  "success": false,
  "data": null,
  "error": "Identity reference 'TESTAADHAAR9999' not found in registration database."
}
```

**Response — Missing / Invalid API Key (401):**
```json
{
  "success": false,
  "data": null,
  "error": "Access denied: Missing X-Gateway-Key header for gateway service authentication."
}
```

**Response — Invalid ID format or Real 12-digit ID (400):**
```json
{
  "success": false,
  "data": null,
  "error": "Validation failed: Real 12-digit numbers are strictly forbidden. Please use synthetic test identifiers (e.g., TESTAADHAAR0001)."
}
```

---

### Admin Endpoints (JWT required)

All admin endpoints require `Authorization: Bearer <token>` header.

#### `POST /api/admin/login`

Authenticate and receive a JWT. Rate limited to 10 attempts per 15 minutes per IP.

**Request body:**
```json
{ "username": "admin", "password": "your_admin_password" }
```

**Response (200):**
```json
{
  "success": true,
  "message": "Authentication successful.",
  "token": "<jwt>",
  "admin": { "username": "admin" }
}
```

---

#### `GET /api/admin/dashboard-stats`

Returns registration and audit event counts.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalRegistrations": 1,
    "registrationsToday": 1,
    "totalAuditEvents": 8
  }
}
```

---

#### `GET /api/admin/registrations?search=TESTAADHAAR&limit=20&offset=0`

Paginated, searchable list of registration records.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "identity_reference": "TESTAADHAAR0001",
      "status": "REGISTERED",
      "created_at": "2026-09-16T17:13:09.250Z"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "count": 1 }
}
```

---

#### `GET /api/admin/audit-logs?limit=25&offset=0`

Paginated audit event log, newest first.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 7,
      "event_type": "REGISTRATION_CREATED",
      "metadata": { "identity_reference": "TESTAADHAAR0001", "status": "REGISTERED" },
      "ip_address": "::1",
      "created_at": "2026-09-16T17:13:09.252Z"
    }
  ],
  "pagination": { "limit": 25, "offset": 0, "count": 7 }
}
```

**Audit event types recorded:**

| Event | Trigger |
|---|---|
| `REGISTRATION_CREATED` | New identity reference registered |
| `DUPLICATE_REGISTRATION_ATTEMPT` | Already-registered ID submitted again |
| `ADMIN_LOGIN` | Successful admin authentication |
| `ADMIN_LOGIN_FAILED` | Failed admin login attempt |
| `ADMIN_INITIAL_SEED` | Admin account seeded via seedAdmin.js |

---

## Database Schema

```sql
-- Unique constraint prevents duplicate registrations at DB level
CREATE TABLE registrations (
    id               SERIAL PRIMARY KEY,
    identity_reference VARCHAR(64) NOT NULL,
    status           VARCHAR(32) NOT NULL DEFAULT 'REGISTERED',
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_registrations_identity_ref UNIQUE (identity_reference)
);

-- Bcrypt-hashed credentials only, never plaintext
CREATE TABLE admins (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_admins_username UNIQUE (username)
);

-- JSONB metadata, no sensitive identity data stored
CREATE TABLE audit_logs (
    id         SERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    metadata   JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

---

## Gateway Integration

This department portal is designed to seamlessly integrate into the central **Setu** consent-based interoperability gateway (SIH26129) alongside two other independent department sites.

```
Setu Gateway (http://localhost:5173 / http://localhost:3000)
    │
    │  1. Check / Register ID
    │     POST /api/registration/check
    │
    │  2. Consent-based Demographic Fetch (Machine-to-Machine)
    │     GET  /api/registration/:identityReference/fields
    │     Header: X-Gateway-Key: <GATEWAY_API_KEY>
    ▼
National Identity Registry API (http://localhost:5000)
    │
    ▼
PostgreSQL 17 Database (aadhaar_portal_db)
    ├── registrations (identity_reference, fields JSONB, status)
    ├── audit_logs (FIELDS_ACCESSED, REGISTRATION_CREATED)
    └── admins
```

### 1. Service-to-Service Authentication

Unlike human administrative authentication which uses Bearer JWT tokens (`Authorization: Bearer <token>`), the Setu Gateway is a machine client and authenticates via a static API key:

- **HTTP Header Name**: `X-Gateway-Key`
- **Optional Client Identifier**: `X-Gateway-Client` (default: `Setu-Gateway`)
- **Environment Variable**: `GATEWAY_API_KEY`

#### Setting `GATEWAY_API_KEY`:

In `.env`:
```env
GATEWAY_API_KEY=setu_gateway_secret_key_demo_2026
```

In `.env.example`:
```env
GATEWAY_API_KEY=your_gateway_api_key_here
```

Any request to `GET /api/registration/:identityReference/fields` missing this header or providing an invalid key receives:
```json
{
  "success": false,
  "data": null,
  "error": "Access denied: Missing X-Gateway-Key header for gateway service authentication."
}
```

### 2. Multi-Origin CORS Whitelist

The gateway may run on different development ports (e.g. Vite dev server on port 5173, Next.js / React on port 3000). Set `GATEWAY_ORIGINS` in `.env` as a comma-separated list without trailing slashes:

```env
GATEWAY_ORIGINS=http://localhost:5173,http://localhost:3000
```

The server dynamically validates the incoming `Origin` header against this whitelist and authorizes `X-Gateway-Key` and `X-Gateway-Client` headers.

### 3. Demographic Fields Provided

During the citizen consent flow, the Setu Gateway requests verified demographic fields:
- `fullName`: Citizen's legal synthetic name
- `dob`: Date of birth (`YYYY-MM-DD`)
- `gender`: Citizen gender (`Male` / `Female`)
- `address`: Full synthetic residential address

Every retrieval is logged in `audit_logs` with `event_type = 'FIELDS_ACCESSED'`.

---

## Security Notes

- No passwords or secrets are hardcoded — all read from `.env`
- `.env` is listed in `.gitignore` and never committed
- Admin passwords are stored as bcrypt hashes (12 salt rounds)
- All PostgreSQL queries use parameterized placeholders — no SQL injection surface
- Input validation via `express-validator` rejects malformed and real-format IDs before any DB query
- `helmet` sets secure HTTP headers on all responses
- Rate limiting applied on both registration and admin login endpoints
- Global error handler strips database errors and stack traces from all client responses
- JWT tokens expire after 8 hours; invalid tokens return 403
- Audit log metadata sanitizes `password` and `token` fields before persistence
- Gateway machine authentication enforced via timing-safe API key verification

---

## Synthetic Test Identifiers

Use these for testing — real 12-digit numeric strings are rejected by the validator:

```
TESTAADHAAR0001
TESTAADHAAR0002
DEMO-ID-9999
SYNTHETIC-001
TEST-USER-ALPHA
```

---

## npm Scripts

| Script | Command | Description |
|---|---|---|
| `npm start` | `node backend/server.js` | Start production server |
| `npm run dev` | `nodemon backend/server.js` | Start with auto-restart |
| `npm run db:init` | `node database/initDb.js` | Apply schema to PostgreSQL and seed records |
| `npm run db:seed` | `node database/seedAdmin.js` | Create initial admin account |
| `npm run db:seed:registrations` | `node database/seedRegistrations.js` | Seed synthetic identity references with fields |
| `npm test` | `jest --runInBand --detectOpenHandles --forceExit` | Run automated integration & unit test suite |

