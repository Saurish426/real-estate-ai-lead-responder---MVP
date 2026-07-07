# Production Checklist

Use this checklist before sending real users to AI Lead Responder.

## Production Readiness Status

The application is production-ready for an MVP launch when every item in this checklist is complete in the hosting platform.

Current app-level readiness:

- Deployment scripts exist for install, Prisma generation, migration deploy, and startup.
- Health checks exist at `/health` and `/ready`.
- Security headers are applied on every response.
- Basic in-memory rate limiting protects the API and lead form.
- Production errors return safe generic messages.
- Request logs avoid request bodies and secret values.
- Event logs sanitize sensitive metadata before database storage.
- Gmail lead capture remains disabled by default.

Operational items that must be configured in the hosting provider:

- Production environment variables
- Database backups
- Uptime/error monitoring
- Log retention or log drain
- Restore drill schedule

## Deployment

- Deploy on Render or Railway as a Node.js web service.
- Use Node.js 18 or newer.
- Use Supabase PostgreSQL or another managed PostgreSQL database.
- Use committed Prisma migrations only.
- Build command:

```bash
npm ci && npm run deploy:prepare
```

- Start command:

```bash
npm run start
```

- Health check path:

```text
/health
```

- Readiness check path for uptime monitors or release verification:

```text
/ready
```

## Required Environment Variables

Set these in the platform environment variable manager. Do not commit real values.

```bash
NODE_ENV=production
DATABASE_URL=
DIRECT_DATABASE_URL=
OPENAI_API_KEY=
EMAIL_USER=
EMAIL_APP_PASSWORD=
EMAIL_FROM=
EMAIL_PROVIDER=gmail
GMAIL_LEAD_CAPTURE_ENABLED=false
GOOGLE_CALENDAR_ENABLED=false
FOLLOW_UP_REMINDERS_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
LEAD_RATE_LIMIT_MAX_REQUESTS=30
```

Optional integration variables:

```bash
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_TIME_ZONE=America/New_York
GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES=30
GOOGLE_CALENDAR_DEFAULT_EVENT_START_HOURS=24
FOLLOW_UP_REMINDER_DELAY_HOURS=24
OUTLOOK_SMTP_HOST=smtp.office365.com
OUTLOOK_SMTP_PORT=587
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
```

If `DATABASE_URL` uses a pooled Supabase URL, set `DIRECT_DATABASE_URL` to the direct database connection string so Prisma migration commands can run reliably during deploys.

## Logging

- Confirm platform logs show `request_completed` events with request ID, method, path, status, and duration.
- Confirm app logs do not include API keys, passwords, session cookies, email app passwords, or database URLs.
- Confirm `EventLog` records are created for lead creation, AI extraction, AI response, guardrails, email, agent notification, calendar, and reminders.
- Configure platform log retention or log drain before real traffic.
- Review logs after the first production lead submission.

## Backups

- Enable managed PostgreSQL backups in Supabase, Render, Railway, or the selected database provider.
- Confirm backup frequency is daily or better before real users.
- Enable point-in-time recovery if available on the paid plan.
- Run one restore drill before launch or before handling important production data.
- Keep `.env` and platform secrets out of database exports and support screenshots.

## Monitoring

- Configure uptime monitoring against `/health`.
- Configure deployment or smoke-test monitoring against `/ready`.
- Add alerts for HTTP 5xx rate, service restarts, memory pressure, and failed deploys.
- Add alerts for database storage, connection saturation, and backup failures.
- Add alerts for email delivery failures if the email provider supports them.
- Review `/api/events` and the dashboard Recent Events section during demos and early usage.

## Rate Limiting

The server includes built-in rate limiting:

- General requests default to `120` requests per minute per client IP.
- Lead submissions default to `30` POST `/api/leads` requests per minute per client IP.
- `/health` and `/ready` are excluded so monitoring is not blocked.

Adjust with:

```bash
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
LEAD_RATE_LIMIT_MAX_REQUESTS=30
```

## Security Headers

Confirm responses include:

- `Content-Security-Policy`
- `Cross-Origin-Resource-Policy`
- `Permissions-Policy`
- `Referrer-Policy`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Strict-Transport-Security` in production
- `X-Request-Id`

The app disables `X-Powered-By`.

## Production Error Handling

- Unknown routes return JSON `404`.
- Unexpected errors return generic JSON `500`.
- Production responses do not include stack traces.
- Server logs keep stack traces out of production responses.
- AI, email, calendar, reminder, and logging failures do not block lead creation unless the core database save fails.

## Health Checks

Use `/health` for liveness:

```bash
curl https://your-app.example.com/health
```

Expected shape:

```json
{
  "status": "ok",
  "environment": "production",
  "uptimeSeconds": 123
}
```

Use `/ready` for readiness:

```bash
curl https://your-app.example.com/ready
```

Expected production result:

```json
{
  "status": "ready",
  "checks": {
    "environment": "ok",
    "database": "ok"
  },
  "missing": []
}
```

## Startup Verification

Run locally or in CI before deployment:

```bash
npm ci
npm run prisma:generate
npm run db:deploy
npm run start
```

After public deployment:

```bash
npm run verify:deployment
```

For Windows PowerShell:

```powershell
$env:PUBLIC_APP_URL="https://your-public-url"
$env:DEPLOY_TEST_EMAIL="you@example.com"
npm run verify:deployment
```

## Final Launch Check

- Homepage loads.
- Demo page loads.
- Signup/login work.
- Dashboard is protected.
- Settings are protected.
- Lead form saves a lead.
- AI extraction runs.
- AI response generation runs.
- Customer auto-reply sends.
- Agent notification sends.
- Dashboard shows the newest lead, AI data, email status, event logs, and team/office context.
- Booking workflow appears for showing requests.
- `/health` returns `200`.
- `/ready` returns `200`.
- Backups and monitoring are enabled in the hosting provider.
