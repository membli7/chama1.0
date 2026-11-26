# Jirani Chama

A web app for managing chama members, cash contributions, loans, penalties, attendance, dividends, and in-app group chat. It supports Chairperson, Secretary, Treasurer, and Member roles.

## Run locally

Requirements: Node.js `^20.19.0` or `>=22.12.0`.

```powershell
cd chamafork
npm install
Copy-Item .env.example .env
```

Set `SESSION_SECRET`, `ONE_TIME_CODE_HMAC_SECRET`, and `METRICS_BEARER_TOKEN` in `.env` to separate random values, then start the app:

```powershell
npm start
```

Open [http://localhost:8001](http://localhost:8001). On first run, create the Chairperson account; they can invite members and set up the group.

See `chamafork/.env.example` for optional configuration. Local development uses JSON data by default; production requires PostgreSQL and Redis.

## Tests

From the repository root:

```powershell
npm test
```

## Important limits

Contributions and repayments are recorded manually; the app does not move money or reconcile external payments. Group chat is in-app only. SMS invitations require provider configuration.
