# ERP Setup Guide

This guide covers connecting Proman Edge to ERPNext — both local bench (development) and Frappe Cloud (staging / production).

---

## Option A — Local ERPNext Bench (Development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- MariaDB 10.6+ (via Homebrew: `brew install mariadb@11.8`)
- Redis (via Homebrew: `brew install redis`)
- Frappe Bench CLI: `pip install frappe-bench`

### One-time bench setup

```bash
bench init frappe-bench --frappe-branch version-15
cd frappe-bench
bench new-site proman.localhost --mariadb-root-password root --admin-password admin
bench get-app erpnext --branch version-15
bench --site proman.localhost install-app erpnext
```

### Add proman.localhost to hosts file

```bash
echo "127.0.0.1 proman.localhost" | sudo tee -a /etc/hosts
```

### Start the bench

```bash
cd ~/frappe-bench
bench start
```

Verify: open `http://proman.localhost:8000` — login with `admin` / `admin`.

### Generate API credentials

1. Log into ERPNext as Administrator
2. Go to **Settings → API Access → New API Key**
3. Select user `Administrator` (or create a dedicated `proman_edge_api` user)
4. Copy the **API Key** and **API Secret**

Set these in `backend/.env`:

```env
USE_MOCK=false
FRAPPE_BASE_URL=http://proman.localhost:8000
FRAPPE_API_KEY=<api-key>
FRAPPE_API_SECRET=<api-secret>
```

### Seed sample data (optional)

Run the seed script to populate realistic test data (leads, opportunities, quotations, sales orders, invoices):

```bash
node scripts/seed-erpnext.js
```

After seeding, run the SQL file it generates to backdate records:

```bash
mysql -u root _800ba922c4374766 < /tmp/proman-seed-dates.sql
```

---

## Option B — Frappe Cloud (Staging / Production)

### Step 1 — Get API credentials

1. Log into your Frappe Cloud site as Administrator
2. Go to **Settings → Integrations → API Access**
3. Create a dedicated user `proman_edge_api` with the following roles:
   - Sales User (read-only)
   - Manufacturing User (read-only)
4. Generate an API Key + Secret for that user
5. Share credentials with the Proman Edge team

Set in `backend/.env` (production):

```env
USE_MOCK=false
FRAPPE_BASE_URL=https://yoursite.frappe.cloud
FRAPPE_API_KEY=<api-key>
FRAPPE_API_SECRET=<api-secret>
```

### Step 2 — Direct Database Access (optional)

Frappe Cloud allows direct MariaDB connections on USD 50+ plans. This is used for complex aggregation queries that would require multiple REST API calls.

**Enable in Frappe Cloud dashboard:**
1. Go to your site → **Database** → **Permission Manager**
2. Create a **Read Only** database user
3. Note the host, port, username, and password shown
4. Download the `chain.pem` TLS certificate

**Add to `backend/.env`:**

```env
DB_HOST=<host-from-frappe-cloud>
DB_PORT=3306
DB_NAME=<database-name>
DB_USER=<read-only-user>
DB_PASS=<password>
DB_SSL_CA=/path/to/chain.pem
```

> **Important:** The DB user must be read-only. Never use admin credentials in the backend.

### Step 3 — Whitelist backend server IP

If Frappe Cloud requires IP whitelisting for DB access, add your backend server's static IP in the Frappe Cloud dashboard under **Database → Allowed IPs**.

---

## ERPNext Custom Requirements

The following are needed from the ERPNext developer (Pramanthia / Shivam) before live data can be enabled for all dashboards:

| Requirement | Purpose | Status |
|---|---|---|
| `get_user_role` API endpoint | Return logged-in user's Proman role | Pending — see [API Spec](api/get_user_role_endpoint.md) |
| `custom_division` field on User DocType | Map user to division for filtering | Pending |
| Pipeline Stage DocType | Track WO stage with dates | Planned (Sprint 2) |
| Downtime Log DocType | Manufacturing downtime widget | Planned (Sprint 2) |

---

## Multi-Site Setup

Proman has 5 ERPNext sites. Each site requires its own API credentials in `backend/.env`:

```env
ERPNEXT_PISPL_URL=https://pispl.frappe.cloud
ERPNEXT_PISPL_API_KEY=
ERPNEXT_PISPL_API_SECRET=

ERPNEXT_ACE_URL=https://ace.frappe.cloud
ERPNEXT_ACE_API_KEY=
ERPNEXT_ACE_API_SECRET=

ERPNEXT_PROMAX_URL=https://promax.frappe.cloud
ERPNEXT_PROMAX_API_KEY=
ERPNEXT_PROMAX_API_SECRET=
```

The backend routes each API call to the correct site based on the user's `company` field from their JWT.

---

## Verifying the Connection

```bash
# Check backend can reach ERPNext
curl http://localhost:4000/health

# Test auth with real ERPNext credentials
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"satheesh@proman.in","password":"yourpassword"}'
```

A successful login returns a JWT token. Pass it as `Authorization: Bearer <token>` on all subsequent requests.
