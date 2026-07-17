# Proman Edge

Role-based dashboard product for Proman Infrastructure Services Group, built on top of ERPNext v15. Each role (Sales Head, Manufacturing Head, Finance Head, etc.) gets a tailored homepage with live KPIs, pipeline views, alerts, and quick actions that deep-link into ERPNext.

---

## Architecture

```
Browser (Next.js 14)
      ↕  HTTP / JWT
Node.js Backend (Express)   ←→   Redis (cache)
      ↕  Frappe REST API / MariaDB
ERPNext v15 (Frappe Cloud × 5 sites)
```

| Layer | Tech | Port |
|---|---|---|
| Frontend | Next.js 14 (App Router) | 3000 |
| Backend | Node.js + Express + TypeScript | 4000 |
| ERP | ERPNext v15 (Frappe Cloud) | 8000 (local) |
| Cache | Redis | 6379 |

---

## Project Structure

```
PROMAN/
├── frontend/          # Next.js app — pages, components, hooks, types
├── backend/           # Express API — routes, services, mock data
└── scripts/           # One-off scripts (data seeding, migrations, deployment)
```

---

## Prerequisites

- Node.js 20+
- npm 10+
- Redis (via Homebrew)
- ERPNext local bench OR Frappe Cloud credentials

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local  # if exists
```

Edit `backend/.env` — minimum required:

```env
USE_MOCK=true          # set false when ERPNext is available
JWT_SECRET=change-me
PORT=4000
FRONTEND_URL=http://localhost:3000
```

See [Environment Variables](#environment-variables) for the full list.

### 3. Start development

**Option A — both services together:**
```bash
npm run dev
```

**Option B — separately:**
```bash
npm run dev:frontend   # Terminal 1 → http://localhost:3000
npm run dev:backend    # Terminal 2 → http://localhost:4000
```

If running with a local ERPNext bench, start it first:
```bash
cd ~/frappe-bench && bench start   # Terminal 0 → http://proman.localhost:8000
```

---

## Environment Variables

### `backend/.env`

| Variable | Description | Example |
|---|---|---|
| `USE_MOCK` | `true` = static mock data, no ERP needed | `true` |
| `PORT` | Backend port | `4000` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `JWT_SECRET` | Secret for signing JWTs — change in production | `long-random-string` |
| `FRAPPE_BASE_URL` | ERPNext site URL | `http://proman.localhost:8000` |
| `FRAPPE_API_KEY` | ERPNext API key | `bd660286...` |
| `FRAPPE_API_SECRET` | ERPNext API secret | `d393e262...` |
| `REDIS_URL` | Redis connection (leave empty to disable cache) | `redis://localhost:6379` |

### `frontend/.env.local`

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_MIDDLEWARE_URL` | Backend base URL | `http://localhost:4000` |

---

## Mock vs Live Data

Set `USE_MOCK=true` in `backend/.env` to run the entire dashboard with static mock data — no ERPNext connection required. Useful for frontend development and demos.

Set `USE_MOCK=false` and fill in `FRAPPE_BASE_URL`, `FRAPPE_API_KEY`, `FRAPPE_API_SECRET` to connect to a real ERPNext instance.

---

## Dashboards Built

| Role | Route | Backend Route |
|---|---|---|
| Sales Head | `/home/sales-head` | `backend/src/routes/sales.ts` |
| Manufacturing Head | `/home/manufacturing-head` | `backend/src/routes/manufacturing.ts` |
| Finance Head | `/home/finance-head` | `backend/src/routes/finance.ts` |
| Procurement Head | `/home/procurement-head` | `backend/src/routes/procurement.ts` |
| Dispatch Head | `/home/dispatch-head` | `backend/src/routes/dispatch.ts` |
| Stores Head | `/home/stores-head` | `backend/src/routes/stores.ts` |

---

## Key Backend Endpoints

| Endpoint | Description |
|---|---|
| `POST /api/v1/auth/login` | Validate ERPNext credentials, return JWT |
| `GET /api/v1/auth/me` | Validate JWT, return user details + role |
| `GET /api/v1/sales/homepage` | All Sales Head widget data |
| `GET /api/v1/manufacturing/homepage` | All Manufacturing Head widget data |
| `GET /api/v1/finance/homepage` | All Finance Head widget data |
| `GET /api/v1/procurement/homepage` | All Procurement Head widget data |
| `GET /api/v1/dispatch/homepage` | All Dispatch Head widget data |
| `GET /api/v1/stores/homepage` | All Stores Head widget data |
| `GET /health` | Health check |

---

## Server Deployment (dev + prod)

The Hostinger server (`187.127.182.29`) runs two independent instances side by side — `dev` (ports 3000/4000) and `prod` (ports 3001/4001) — both pulling secrets from Doppler (project `proman`, configs `dev`/`prd`) instead of local `.env` files. `NEXT_PUBLIC_*` values are baked in at build time, so builds run through `doppler run` too.

Secrets live outside git in `/root/.proman-secrets/doppler.env` on the server:

```bash
DOPPLER_TOKEN_DEV=dp.st.dev.xxxxxxxxxxxx
DOPPLER_TOKEN_PROD=dp.st.prd.xxxxxxxxxxxx
```

### `scripts/proman.sh` — All Commands

Run from `/root/proman` (the repo checkout that holds `ecosystem.config.js` / `ecosystem.prod.config.js`):

```bash
./scripts/proman.sh <dev|prod> check             # verify Doppler secrets are reachable for that config
./scripts/proman.sh <dev|prod> start             # pm2 start (fresh registration) + pm2 save
./scripts/proman.sh <dev|prod> delete            # pm2 delete backend + frontend for that instance
./scripts/proman.sh <dev|prod> deploy [target]   # git pull, npm install, doppler-wrapped build, pm2 reload
                                                  #   target = all (default) | backend | frontend
./scripts/proman.sh <dev|prod> status            # pm2 status
./scripts/proman.sh <dev|prod> logs              # last 50 log lines, both processes
```

Everyday redeploy after `git push`:

```bash
./scripts/proman.sh dev deploy
./scripts/proman.sh prod deploy
```

If `ecosystem*.config.js` itself changes (script/args/env), `deploy`/`reload` won't pick it up — pm2 only re-reads that on fresh registration:

```bash
./scripts/proman.sh <dev|prod> delete
./scripts/proman.sh <dev|prod> start
```

---

## Test Users (Local ERPNext)

| User | Email | Role | Dashboard |
|---|---|---|---|
| Satheesh Kumar | satheesh@proman.in | Sales Head | `/home/sales-head` |
| Manoj Sharma | manoj@proman.in | Manufacturing Head | `/home/manufacturing-head` |

---

## Stopping Services

```bash
# Kill by port if Ctrl+C doesn't work
kill -9 $(lsof -ti :3000) 2>/dev/null   # Frontend
kill -9 $(lsof -ti :4000) 2>/dev/null   # Backend
kill -9 $(lsof -ti :8000) 2>/dev/null   # ERPNext
```
