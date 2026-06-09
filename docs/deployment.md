# Deployment Guide

## Local Development

```bash
supabase start          # start local Supabase stack (Docker)
npm run dev             # start Next.js dev server with hot reload
```

Open `http://localhost:3000/setup` to create a table session.

---

## LAN Deployment (NAS / dedicated machine)

The `docker/` directory contains a self-contained Docker Compose stack: Postgres, PostgREST, Supabase Realtime, nginx API gateway, and the Next.js app.

### Prerequisites

- Docker and Docker Compose installed on the host machine
- The repo cloned to the host machine

### First-time setup

```bash
cd docker
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables) below).

Apply migrations and start all services:

```bash
docker compose up -d
```

The `migrate` container runs automatically on startup and applies all SQL files from `supabase/migrations/` in order.

**App is live at:** `http://<HOST_IP>:3000`

- DM view: `/setup` → `/control/<tableId>`
- Display view: `/display/<tableId>` (scan QR code from `/setup`)

### After code changes

Rebuild only the Next.js container without restarting the database:

```bash
docker compose build web
docker compose up -d web
```

### Persistent data

Scene data lives in the `db-data` Docker volume. It survives container restarts and rebuilds. To reset:

```bash
docker compose down -v   # WARNING: destroys all scene data
```

---

## Pi Kiosk Setup (Display Screen)

The display client is a browser pointed at the server. No software runs on the Pi itself.

### Recommended: Chromium kiosk mode

```bash
# On the Pi, run this at startup (e.g. in /etc/rc.local or a systemd unit)
chromium-browser \
  --kiosk \
  --app=http://NAS_IP:3000/display/TABLE_ID \
  --noerrdialogs \
  --disable-infobars \
  --check-for-update-interval=31536000
```

Replace `NAS_IP` with your server's LAN IP (e.g. `192.168.1.42`) and `TABLE_ID` with the UUID from `/setup`.

### Autostart with systemd (Pi OS Lite)

Create `/etc/systemd/system/kiosk.service`:

```ini
[Unit]
Description=D&D Table Display
After=network-online.target
Wants=network-online.target

[Service]
Environment=DISPLAY=:0
ExecStartPre=/bin/sleep 5
ExecStart=chromium-browser --kiosk --app=http://NAS_IP:3000/display/TABLE_ID --noerrdialogs --disable-infobars
Restart=on-failure
User=pi

[Install]
WantedBy=graphical.target
```

```bash
sudo systemctl enable kiosk
sudo systemctl start kiosk
```

### If the Pi shows "Waiting for GM"

This is the display client waiting for a Realtime connection. It will reconnect automatically with exponential backoff (1s → 2s → 4s → … → 30s max). Once the DM opens the control view the display will sync from the database.

---

## Environment Variables

### `docker/.env` (LAN production)

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | ✓ | Postgres superuser password. Use a strong random value. |
| `JWT_SECRET` | ✓ | Signs API tokens. Must be ≥ 32 characters. Generate: `openssl rand -base64 40` |
| `ANON_KEY` | ✓ | JWT with `role=anon`, signed with `JWT_SECRET`. See note below. |
| `SERVICE_ROLE_KEY` | ✓ | JWT with `role=service_role`, signed with `JWT_SECRET`. |
| `SECRET_KEY_BASE` | ✓ | Realtime Phoenix secret. Generate: `openssl rand -base64 64` |
| `HOST_IP` | ✓ | LAN IP or hostname of this machine (e.g. `192.168.1.42`). Used in QR codes. |

**Generating `ANON_KEY` and `SERVICE_ROLE_KEY`:** use the [Supabase self-hosting key generator](https://supabase.com/docs/guides/self-hosting#api-keys) or the JWT tool at `jwt.io` with your `JWT_SECRET` and these payloads:

```json
// anon key
{ "iss": "supabase-demo", "role": "anon", "exp": 1983812996 }

// service_role key
{ "iss": "supabase-demo", "role": "service_role", "exp": 1983812996 }
```

The `.env.example` ships with a standard Supabase dev token set (matching the default `JWT_SECRET`). These are **public and insecure** — replace all values before running in production.

### `apps/web/.env.local` (local development)

```bash
# Populated automatically by `supabase start`
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase start output>
```

### Switching between local and production

No code changes required. The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the environment. Set them to your hosted Supabase project to switch to cloud.

---

## Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `db` | `supabase/postgres:15` | internal | Postgres database |
| `migrate` | `postgres:16-alpine` | — | Applies `supabase/migrations/*.sql` on startup |
| `rest` | `postgrest/postgrest:v12` | internal | REST API over Postgres |
| `realtime` | `supabase/realtime:v2` | internal | WebSocket pub/sub |
| `api` | `nginx:alpine` | `8000` | API gateway (routes to rest + realtime) |
| `web` | built from `Dockerfile` | `3000` | Next.js app |
