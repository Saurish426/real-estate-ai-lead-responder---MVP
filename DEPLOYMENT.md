# Public Deployment Guide

This app is a Node.js + Express backend that also serves the frontend pages. The cleanest MVP deployment is one public web service plus one managed PostgreSQL database.

## Recommended Stack

Use this stack first:

- Frontend: Express-served static pages on Render
- Backend: Node.js + Express Web Service on Render
- Database: Supabase PostgreSQL

Why this stack:

- The current app is one Express server, so Render can host the frontend and backend together behind one public URL.
- Supabase PostgreSQL is already compatible with the Prisma setup.
- Render supports Node web services, health checks, build/start commands, and Blueprint configuration with `render.yaml`.

Closest alternative:

- Railway Web Service + Railway or Supabase PostgreSQL

Not recommended for this current codebase:

- Vercel, unless the Express app is refactored into serverless functions or a Vercel-compatible framework. This MVP currently expects a long-running Express process.

## Production Environment Variables

Set these in the deployment platform dashboard. Do not commit real values.

```bash
DATABASE_URL=
OPENAI_API_KEY=
EMAIL_USER=
EMAIL_APP_PASSWORD=
EMAIL_FROM=
EMAIL_PROVIDER=gmail
GMAIL_LEAD_CAPTURE_ENABLED=false
GOOGLE_CALENDAR_ENABLED=false
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_TIME_ZONE=America/New_York
GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES=30
GOOGLE_CALENDAR_DEFAULT_EVENT_START_HOURS=24
FOLLOW_UP_REMINDERS_ENABLED=true
FOLLOW_UP_REMINDER_DELAY_HOURS=24
NODE_ENV=production
```

Notes:

- Keep `GMAIL_LEAD_CAPTURE_ENABLED=false` for production demos unless manual Gmail capture is intentionally expanded later.
- Keep `GOOGLE_CALENDAR_ENABLED=false` until a valid Google Calendar OAuth access token is configured in the platform environment manager.
- Set `EMAIL_PROVIDER=outlook` for Outlook SMTP or `EMAIL_PROVIDER=smtp` for a custom SMTP host.
- Use the production PostgreSQL connection string for `DATABASE_URL`.
- Keep all secrets in the platform environment variable manager, not in `.env`, README files, screenshots, logs, or commits.

## Deployment Scripts

The app includes these deployment-ready scripts:

```bash
npm run build
npm run deploy:prepare
npm run db:deploy
npm run start
npm run verify:deployment
```

Use `npm run deploy:prepare` during deployment. It generates Prisma Client and applies committed Prisma migrations with `prisma migrate deploy`.

## Render Deployment

### Option A: Render Blueprint

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Render will read `render.yaml`.
4. Fill in the secret environment variables when Render asks for them.
5. For a no-cost validation deploy, keep `plan: free`. For a live Techstars-style demo or real users, upgrade the service to `starter` to avoid cold starts.
6. Confirm these service settings:

```bash
Build Command: npm ci && npm run deploy:prepare
Start Command: npm run start
Health Check Path: /health
```

7. Deploy the service.
8. Open the generated `https://your-service.onrender.com` URL.

### Option B: Manual Render Web Service

1. Create a new Render Web Service from the GitHub repo.
2. Select the Node runtime.
3. Set the build command:

```bash
npm ci && npm run deploy:prepare
```

4. Set the start command:

```bash
npm run start
```

5. Set the health check path:

```bash
/health
```

6. Add all production environment variables listed above.
7. Deploy.

## Railway Deployment

1. Create a new Railway project from the GitHub repo.
2. Add the same production environment variables.
3. Configure the build command:

```bash
npm ci && npm run deploy:prepare
```

4. Configure the start command:

```bash
npm run start
```

5. Deploy and use the generated Railway public domain.

## Vercel Notes

Use Vercel only after refactoring the app to a serverless-compatible structure. The current app is simpler and safer on Render or Railway because it uses one long-running Express server to serve pages and API routes.

## Public Verification

After deployment, verify the public app from your local machine.

macOS/Linux:

```bash
PUBLIC_APP_URL="https://your-public-url" DEPLOY_TEST_EMAIL="you@example.com" npm run verify:deployment
```

Windows PowerShell:

```powershell
$env:PUBLIC_APP_URL="https://your-public-url"
$env:DEPLOY_TEST_EMAIL="you@example.com"
npm run verify:deployment
```

The verification script checks:

- homepage loads publicly
- dashboard loads publicly
- settings save publicly
- lead form/API works publicly
- AI extraction works publicly
- AI response generation works publicly
- customer email sends publicly
- booking flow works publicly
- optional calendar/reminder metadata works when configured
- dashboard updates publicly

The script submits one deployment test lead. It does not print secrets.

## Demo Checklist

1. Open the homepage.
2. Submit a sample showing request lead.
3. Confirm the success message appears.
4. Open the dashboard.
5. Confirm the lead appears with AI intent, confidence, AI response, email status, and booking status.
6. Open settings and confirm the calendar link is saved for booking-flow demos.
