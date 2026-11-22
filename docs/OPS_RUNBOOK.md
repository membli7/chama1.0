# Jirani Chama — Production Operations & Deployment Runbook

This runbook documents the required procedures, environment configuration, health checks, backup and restore routines, and operational guidelines for deploying and maintaining **Jirani Chama** in a production environment.

---

## 1. System Architecture

```
                    ┌─────────────────────────┐
                    │    Internet / Client    │
                    └───────────┬─────────────┘
                                │ HTTPS (TLS 1.3)
                    ┌───────────▼─────────────┐
                    │ Reverse Proxy / Ingress │
                    │ (Render, Cloudflare,    │
                    │  Nginx, or AWS ALB)     │
                    └───────────┬─────────────┘
                                │ Private Loopback / VPC Network
                                │ (Headers: X-Forwarded-Proto, X-Forwarded-For)
                    ┌───────────▼─────────────┐
                    │ Jirani Chama Node Server│
                    │ (Node.js >= 20.19.0)    │
                    └───┬─────────────────┬───┘
                        │                 │
      TLS (rediss://)   │                 │   TLS (verify-full)
┌───────────────────────▼──┐   ┌──────────▼─────────────────┐
│     Redis (Cache,        │   │    PostgreSQL Database     │
│   Sessions, Rate Limits, │   │    (Row-Level Security,    │
│      Pub/Sub Events)     │   │   Single-Writer Adv. Lock) │
└──────────────────────────┘   └────────────────────────────┘
```

- **Runtime**: Single Node.js process per database instance. Concurrency across processes is restricted by a PostgreSQL advisory lock (`jirani-chama-single-writer`) to guarantee financial transaction consistency.
- **Frontend**: Single-Page React application built with Vite into `chamafork/frontend-dist`, served statically with fingerprinted cache-control headers and strict Content Security Policy.
- **Backend**: Express API server enforcing server-side role-based access control, tenant row-level security (RLS), and single-origin request validation.

---

## 2. Required Production Environment Variables

In production (`NODE_ENV=production`), the application strictly validates its configuration at startup via `validateProductionConfig()`. Any missing, weak, or misconfigured value will cause startup to immediately abort with an explanatory error.

| Variable | Description | Production Requirement / Example |
|---|---|---|
| `NODE_ENV` | Runtime environment mode | `production` |
| `PORT` | Listening TCP port | e.g. `8001` or provided by host (e.g. Render) |
| `APP_BIND_HOST` | Network interface to bind | `0.0.0.0` (for Render/containers) or a private loopback IP |
| `APP_CANONICAL_ORIGIN` | Public canonical HTTPS URL | `https://your-domain.example.com` (no path, no trailing slash) |
| `APP_ALLOWED_ORIGINS` | Comma-separated allowed HTTPS origins for write requests | `https://your-domain.example.com` |
| `TRUST_PROXY` | Proxy trust predicate | `render` (if on Render) or `1` (requires `TRUSTED_PROXY_IPS`) |
| `TRUSTED_PROXY_IPS` | Comma-separated private/loopback IPs of reverse proxies | e.g. `10.0.0.1,127.0.0.1` (Required if `TRUST_PROXY=1`) |
| `HSTS_INCLUDE_SUBDOMAINS` | Include `includeSubDomains` in HSTS header | `1` to enable; `0` or unset to omit |
| `SESSION_SECRET` | Secret key for signed session cookies | ≥ 32 bytes high-entropy random string (e.g. generated via `openssl rand -base64 48`) |
| `ONE_TIME_CODE_HMAC_SECRET` | Secret key for OTP HMAC tokens | Dedicated ≥ 32 bytes high-entropy random string (must differ from `SESSION_SECRET`) |
| `SETUP_BOOTSTRAP_SECRET` | Secret required to register the initial Chairperson account | Dedicated ≥ 32 bytes high-entropy random string (must differ from session/metrics secrets) |
| `METRICS_BEARER_TOKEN` | Bearer token authorizing access to `/metrics` | Dedicated ≥ 32 bytes high-entropy random string |
| `DATA_BACKEND` | Storage persistence backend | `postgres` (Required in production) |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://app_user:pass@db-host:5432/chama_db` |
| `DATABASE_MIGRATION_URL` | Migration connection string (if using separate migration role) | `postgres://migration_user:pass@db-host:5432/chama_db` |
| `PGSSL` | PostgreSQL SSL certificate verification | `verify-full` (Required in production) |
| `PGSSL_CA_FILE` | Path to custom CA bundle file | Optional (if database requires private CA root) |
| `REDIS_URL` | Redis connection URL with TLS | Must use `rediss://` scheme (e.g. `rediss://default:token@host:6379`) |
| `SESSION_STORE` | Session storage engine | `redis` (Required in production) |
| `RATE_LIMIT_STORE` | Rate limiter backend | `redis` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Production email delivery configuration | Authenticated SMTP credentials |

> [!CAUTION]
> Never commit actual secret values into git or store them in tracked `.env` files. Provide environment variables through your platform's secret manager (e.g., Render Environment Variables, AWS Secrets Manager, Kubernetes Secrets).

---

## 3. Database Setup & Migrations

### 3.1 Least-Privilege Role Requirement
To guarantee that Row-Level Security (RLS) is strictly enforced, the application startup executes `assertLeastPrivilegeRuntimeRole()`.
The runtime user connecting via `DATABASE_URL`:
- Must **NOT** have `SUPERUSER` privileges (`rolsuper = false`).
- Must **NOT** have `BYPASSRLS` privileges (`rolbypassrls = false`).

### 3.2 Running Migrations
Run database migrations using the dedicated migration command before launching new server releases:

```bash
cd chamafork
npm run db:migrate
```

This applies migrations:
- `001_foundation.sql`: Base schema and RLS policies
- `002_app_tables.sql`: Core Chama, user, transaction, and loan tables
- `003_indexes.sql`: Performance indexes
- `004_mpesa_receipts.sql`: Financial receipt isolation
- `005_receipt_reference_reservations.sql`: Reference deduplication
- `006_fk_support_indexes.sql`: Foreign key support
- `007_support_and_faq.sql`: Support tickets, audit logs, and knowledge base

It then grants the runtime role least-privilege table permissions (`SELECT, INSERT, UPDATE, DELETE`) while explicitly revoking update/delete on immutable financial reservations.

---

## 4. Health Checks & Readiness Probes

The server provides built-in health and readiness endpoints for container orchestrators and load balancers:

| Endpoint | Method | Purpose | Response |
|---|---|---|---|
| `/healthz` or `/api/health/live` | `GET` | **Liveness Probe**: Confirms the Express process is running and accepting HTTP requests. | `200 {"status": "ok"}` |
| `/readyz` or `/api/health/ready` | `GET` | **Readiness Probe**: Confirms PostgreSQL connectivity & single-writer lock acquisition, plus Redis availability. | `200 {"status": "ok"}` or `503 {"status": "unavailable", "dependencies": ...}` |

Configure your load balancer or container platform (e.g. Render, Kubernetes, ECS) to use `/healthz` for process restarts and `/readyz` for traffic routing.

---

## 5. Metrics & Observability

The application exports Prometheus-compatible metrics on `/metrics`:

- **Path**: `GET /metrics`
- **Authentication**: Requires `Authorization: Bearer <METRICS_BEARER_TOKEN>`. Unauthorized requests receive `404 Not Found`.
- **Metrics Collected**:
  - `http_requests_total`: Counter of requests by status code and method.
  - `http_request_duration_seconds`: Histogram of request latencies.
  - `chama_active_sessions`: Gauge of active in-memory / connected sessions.
  - `chama_open_sse_connections`: Gauge of open Server-Sent Events streams.
  - `redis_cache_hits_total`, `redis_cache_misses_total`, `redis_cache_hit_rate`: Caching efficiency metrics.

---

## 6. Backup and Restore Procedures

The repository includes a dedicated CLI utility for backups and data restoration: `chamafork/scripts/backup.js`.

### 6.1 Creating a Backup
Run:
```bash
npm run backup
```
Or directly:
```bash
node chamafork/scripts/backup.js create [destination-path.json]
```
This generates a timestamped snapshot of the current state, validates its schema integrity, and writes it atomically to the backup directory (`chamafork/backups/`).

### 6.2 Verifying a Backup
To verify the schema and record counts of an existing backup file without altering any live data:
```bash
node chamafork/scripts/backup.js verify <path-to-backup.json>
```

### 6.3 Restoring from a Backup
To restore state from a validated backup file:
```bash
npm run restore -- <path-to-backup.json>
```
Or:
```bash
node chamafork/scripts/backup.js restore <path-to-backup.json> [target-data-file]
```
The restore operation validates the schema before writing, executes an atomic replace, and reports total records restored.

---

## 7. Graceful Shutdown & Single-Writer Lock

When terminating or restarting the application (via `SIGTERM` or `SIGINT`):
1. Incoming Server-Sent Events (SSE) connections are cleanly closed.
2. The HTTP listener stops accepting new connections.
3. The PostgreSQL single-writer advisory lock is released (`SELECT pg_advisory_unlock(...)`).
4. Redis connections (`pub`, `sub`, `cache`) and PostgreSQL pool connections are ended.

This prevents dangling advisory locks when updating or cycling instances.

---

## 8. Incident Response & Rollback Checklist

If a deployment encounters errors:
1. **Check Readiness**: Probe `GET /readyz` to identify whether PostgreSQL connection, advisory lock, or Redis ping failed.
2. **Review Logs**: In production, logs are formatted as structured JSON with request IDs and error stacks.
3. **Rollback Container / Release**: Revert to previous release image or commit.
4. **Data Rollback**: If data corruption occurred, stop the server process and restore the latest verified backup using `npm run restore <backup-file>`.
