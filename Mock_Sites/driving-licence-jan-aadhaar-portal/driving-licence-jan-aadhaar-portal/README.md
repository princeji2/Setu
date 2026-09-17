# Driving Licence & Jan Aadhaar Registration Portal

A fully independent, secure web application for collecting and managing Driving Licence and Jan Aadhaar document details.

> **Educational prototype.** Entered information is stored and processed only according to the application's configured policies. This portal does not itself establish government-issued document authenticity.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Folder Structure](#folder-structure)
5. [Requirements](#requirements)
6. [PostgreSQL Setup](#postgresql-setup)
7. [Environment Variables](#environment-variables)
8. [Installation](#installation)
9. [Running the Application](#running-the-application)
10. [API Documentation](#api-documentation)
11. [Admin Panel Setup](#admin-panel-setup)
12. [Testing](#testing)
13. [Security Notes](#security-notes)
14. [Verification Limitations](#verification-limitations)
15. [Future Integration — Final Portal](#future-integration--final-portal)

---

## Project Overview

This portal is one independent website in a multi-website identity registration project. It:

- Accepts Driving Licence details (licence number, holder name, dates)
- Accepts Jan Aadhaar details (Jan Aadhaar ID, family members count)
- Validates input format on both frontend and backend
- Stores data securely in its own PostgreSQL database
- Provides a JWT-protected admin dashboard
- Exposes a versioned REST API (`/api/v1`) for future Final Portal integration
- Logs all significant events to an audit log table
- Masks all sensitive identifiers in API responses and admin views

This website does **not** share a database with any other website in the project. A separate Final Portal will integrate all independent websites through their APIs.

---

## Features

- Responsive registration form with real-time validation
- Two-section form: Driving Licence + Jan Aadhaar
- Unique registration reference (e.g. `REG-A3F7C291`) per submission
- Duplicate registration detection
- Document verification abstraction layer (mock provider in development)
- JWT-based admin authentication with bcrypt password hashing
- Admin dashboard: statistics, registrations table, search, audit logs
- Sensitive identifier masking in all API responses
- Comprehensive audit logging (no raw identifiers stored)
- Rate limiting on all endpoints (stricter on auth and registration)
- Helmet security headers, CORS, input validation, parameterised SQL
- 28 automated tests (Jest + Supertest)

---

## Architecture

```
Browser (Vanilla JS)
      │
      │  HTTP/JSON
      ▼
Express.js Server  (Node.js)
      │
      ├── Helmet / CORS / Rate Limiting
      ├── Input Validation (express-validator)
      ├── JWT Authentication (admin routes)
      │
      ├── /api/v1/registrations   — public registration API
      ├── /api/v1/admin/*         — protected admin API
      └── /api/v1/health          — health check
      │
      ├── DocumentVerificationService
      │       └── MockVerificationProvider  (dev)
      │       └── AuthorizedVerificationProvider (future)
      │
      └── PostgreSQL Database
              ├── admins
              ├── registrations
              └── audit_logs
```

This website is **completely independent**:
- Its own PostgreSQL database (`identity_documents_portal_db`)
- Its own authentication (JWT + bcrypt)
- Its own API
- No shared database connections with other websites

---

## Folder Structure

```
driving-licence-jan-aadhaar-portal/
│
├── frontend/
│   ├── index.html              Home page
│   ├── registration.html       Registration form
│   ├── success.html            Success confirmation page
│   ├── admin-login.html        Admin login page
│   ├── admin-dashboard.html    Admin dashboard
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── registration.js
│       ├── admin-login.js
│       └── admin-dashboard.js
│
├── backend/
│   ├── server.js               Express application entry point
│   ├── config/
│   │   ├── db.js               PostgreSQL connection pool
│   │   └── env.js              Centralised environment config
│   ├── routes/
│   │   ├── health.js
│   │   ├── registrations.js
│   │   └── admin.js
│   ├── controllers/
│   │   ├── registrationController.js
│   │   └── adminController.js
│   ├── services/
│   │   └── verification/
│   │       ├── DocumentVerificationService.js
│   │       └── MockVerificationProvider.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── validation.js
│   │   ├── rateLimiting.js
│   │   └── errorHandler.js
│   └── utils/
│       ├── masking.js
│       ├── referenceGenerator.js
│       └── auditLogger.js
│
├── database/
│   ├── schema.sql              Table definitions, indexes, constraints
│   ├── seed.sql                Reference notes
│   ├── migrate.js              Applies schema.sql to the database
│   └── seed.js                 Creates the default admin account
│
├── tests/
│   ├── setup.js                Jest environment setup
│   └── portal.test.js          28 automated tests
│
├── .env.example                Template — copy to .env
├── .gitignore
├── package.json
└── README.md
```

---

## Requirements

- Node.js 18+
- npm 9+
- PostgreSQL 14+

---

## PostgreSQL Setup

### 1. Install PostgreSQL

Download from https://www.postgresql.org/download/ or use your package manager.

### 2. Create the database

```sql
-- Connect as postgres superuser
psql -U postgres

-- Create the database
CREATE DATABASE identity_documents_portal_db;

-- Optionally create a dedicated user
CREATE USER portal_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE identity_documents_portal_db TO portal_user;
```

### 3. Apply the schema

```bash
node database/migrate.js
```

### 4. Seed the admin account

```bash
node database/seed.js
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3001` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `identity_documents_portal_db` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | *(set securely)* |
| `DB_SSL` | Use SSL for DB | `false` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | *(generate randomly)* |
| `JWT_EXPIRES_IN` | JWT expiry | `8h` |
| `ADMIN_USERNAME` | Default admin username | `admin` |
| `ADMIN_EMAIL` | Default admin email | `admin@portal.local` |
| `ADMIN_PASSWORD` | Default admin password | *(set securely)* |
| `LICENCE_NUMBER_PATTERN` | Regex for licence validation | `^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$` |
| `JAN_AADHAAR_ID_LENGTH` | Expected digit length | `10` |
| `VERIFICATION_PROVIDER` | Verification provider | `mock` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `http://localhost:3001` |

**Never commit `.env` to version control.**

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Installation

```bash
# Clone / navigate to project folder
cd driving-licence-jan-aadhaar-portal

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials and secrets

# Apply database schema
node database/migrate.js

# Seed default admin account
node database/seed.js
```

---

## Running the Application

### Development (with auto-restart)

```bash
npm run dev
```

### Production

```bash
npm start
```

The server starts at: `http://localhost:3001` (or the port set in `.env`)

### Available pages

| Page | URL |
|---|---|
| Home | `http://localhost:3001/` |
| Registration Form | `http://localhost:3001/registration.html` |
| Admin Login | `http://localhost:3001/admin-login.html` |
| Admin Dashboard | `http://localhost:3001/admin-dashboard.html` |

---

## API Documentation

All API endpoints are versioned under `/api/v1`.

### Health

#### `GET /api/v1/health`

Returns service health and database connectivity.

```json
{
  "success": true,
  "service": "Driving Licence & Jan Aadhaar Registration Portal",
  "version": "1.0.0",
  "env": "development",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "database": { "status": "ok", "latencyMs": 3 }
}
```

---

### Registrations

#### `POST /api/v1/registrations`

Submit a new registration.

**Request body:**

```json
{
  "licence_number":       "MH0120231234567",
  "licence_holder_name":  "Rajesh Kumar",
  "licence_issue_date":   "2023-01-15",
  "licence_valid_from":   "2023-01-15",
  "licence_expiry_date":  "2043-01-14",
  "jan_aadhaar_id":       "1234567890",
  "family_members_count": 4
}
```

**Success response (201):**

```json
{
  "success": true,
  "message": "Registration submitted successfully.",
  "data": {
    "registration_reference": "REG-A3F7C291",
    "verification_status": "FORMAT_VALID",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

**Error responses:**

| Code | Reason |
|---|---|
| 400 | Validation failed — `fields` array included |
| 409 | Duplicate registration |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

#### `GET /api/v1/registrations/:reference`

Look up a registration by reference. Returns masked sensitive fields.

```json
{
  "success": true,
  "data": {
    "registration_reference": "REG-A3F7C291",
    "licence_number": "XXXXXXXXXXX4567",
    "licence_holder_name": "Rajesh Kumar",
    "licence_issue_date": "2023-01-15",
    "licence_valid_from": "2023-01-15",
    "licence_expiry_date": "2043-01-14",
    "jan_aadhaar_id": "XXXXXX7890",
    "family_members_count": 4,
    "verification_status": "FORMAT_VALID",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### Admin (JWT required)

All admin endpoints require the header:
```
Authorization: Bearer <token>
```

#### `POST /api/v1/admin/login`

```json
{ "username": "admin", "password": "your_password" }
```

Returns `{ "success": true, "token": "...", "admin": { "id": 1, "username": "admin" } }`

---

#### `GET /api/v1/admin/registrations?page=1&limit=20`

Paginated list of all registrations (masked).

---

#### `GET /api/v1/admin/registrations/search?q=Rajesh`

Search by registration reference or holder name.

---

#### `GET /api/v1/admin/stats`

Dashboard statistics: totals, status breakdown, 24h/7d counts.

---

#### `GET /api/v1/admin/audit-logs?page=1&limit=20`

Paginated audit event log.

---

## Admin Panel Setup

1. Copy `.env.example` to `.env`
2. Set `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` in `.env`
3. Run `node database/seed.js` — this hashes the password and inserts/updates the admin record
4. Open `http://localhost:3001/admin-login.html`
5. Login with the credentials from step 2

**Change the default password after first login in any non-development environment.**

---

## Testing

Tests run without a live PostgreSQL connection — the database is mocked.

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

### Test coverage (28 tests)

| # | Test |
|---|---|
| 1 | Website loads (static frontend) |
| 2 | Health endpoint |
| 3 | Valid registration — 201 + reference |
| 4 | Missing licence number — 400 |
| 5 | Invalid licence number format — 400 |
| 6 | Missing licence holder — 400 |
| 7 | Invalid name (digits only) — 400 |
| 8 | Missing issue date — 400 |
| 9 | validity_from before issue_date — 400 |
| 10 | expiry_date before valid_from — 400 |
| 11 | Missing Jan Aadhaar ID — 400 |
| 12 | Jan Aadhaar ID wrong length — 400 |
| 13 | Family members = 0 — 400 |
| 14 | Negative family members — 400 |
| 15 | Decimal family members — 400 |
| 16 | Duplicate registration — 409 |
| 17 | Valid admin login — JWT returned |
| 18 | Wrong admin password — 401 |
| 19 | Unauthorized admin endpoint — 401 |
| 20 | Search registrations |
| 21 | Dashboard statistics — numeric counts |
| 22 | Audit logs — array returned |
| 23 | SQL injection attempt — rejected by validation |
| 24 | XSS payload — rejected by validation |
| 25 | Sensitive data masking on public endpoint |
| 26 | Raw identifiers not present in 201 response |
| 27 | API response structure consistency |
| 28 | Admin registrations list — masked data + pagination |

---

## Security Notes

- **Helmet** sets secure HTTP headers on every response
- **CORS** restricts origins to `CORS_ORIGINS` in `.env`
- **Rate limiting**: 100 req/15 min globally; 10 req/15 min on login; 20 req/hour on registration
- **Parameterised SQL** — no string interpolation of user input into queries
- **bcrypt** (cost 12) for password hashing
- **JWT** with configurable expiry; payload contains only admin ID and username
- **Input validation** on both frontend (real-time) and backend (express-validator)
- **Sensitive data masking**: licence numbers and Jan Aadhaar IDs are masked in all API responses and admin views; raw values are never logged
- **Audit log** uses masked identifiers and registration references only
- **Error responses** never include stack traces in production
- **Admin JWT** stored in `sessionStorage` (cleared on tab close) — never `localStorage`
- No secrets in source code — all via `.env`

---

## Verification Limitations

> **IMPORTANT:** This portal does NOT verify that a Driving Licence or Jan Aadhaar ID is genuine.

The `DocumentVerificationService` in development uses `MockVerificationProvider`, which:

- Checks the **format** of submitted values against configured patterns
- Returns status `FORMAT_VALID` when format checks pass
- Returns status `VERIFICATION_FAILED` when format checks fail
- Does **not** query any government database
- Does **not** confirm that a licence or Jan Aadhaar ID actually exists
- Is clearly labelled: *"DEVELOPMENT MOCK — NOT GOVERNMENT VERIFICATION"*

A `FORMAT_VALID` status only means the entered value matched the configured regex pattern — nothing more.

### Adding real verification later

The architecture supports plugging in a real provider:

1. Create `backend/services/verification/AuthorizedVerificationProvider.js`
2. Implement the same interface: `verifyDrivingLicence(data)` and `verifyJanAadhaar(data)` — both return `{ status, provider, notes }`
3. Set `VERIFICATION_PROVIDER=authorized` in `.env`
4. `DocumentVerificationService` will automatically use the new provider

Any real provider must use a **licensed, authorized government API**. Do not scrape government websites or bypass any authentication.

---

## Future Integration — Final Portal

This website is designed to be integrated into a future Final Portal through its API. The Final Portal should:

### Connect via API — never directly to this database

```
Final Portal  →  POST/GET  /api/v1/*  →  This Website  →  PostgreSQL
```

### Authentication

The Final Portal will need a JWT token. Options:
- Add a dedicated service-account admin user for the Final Portal
- Or implement API key authentication as an additional auth strategy

### Stable API contract

All responses follow this structure:
```json
{ "success": true|false, "data": { ... } }
{ "success": false, "error": "message", "fields": [...] }
```

The `/api/v1` prefix ensures backwards-compatible versioning.

### Recommended integration points

| Final Portal need | Endpoint |
|---|---|
| Check if a document is registered | `GET /api/v1/registrations/:reference` |
| Get portal statistics | `GET /api/v1/admin/stats` |
| List all registrations | `GET /api/v1/admin/registrations` |
| Search by name | `GET /api/v1/admin/registrations/search?q=` |

PostgreSQL is never exposed publicly. All access goes through the Express API.
