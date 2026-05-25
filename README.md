# Real Estate AI Lead Responder MVP

Node.js + Express MVP for capturing real estate leads, saving them to PostgreSQL with Prisma, sending Gmail replies, extracting lead intent with OpenAI, generating AI response drafts, storing conversation memory, and viewing leads/settings in simple web pages.

## Requirements

- Node.js 18 or newer
- npm
- PostgreSQL database
- Gmail app password for outgoing email
- OpenAI API key

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill in `.env` with your local secrets. Do not commit `.env`.

Generate Prisma Client:

```bash
npm run prisma:generate
```

Apply database migrations:

```bash
npm run db:deploy
```

Start the development server:

```bash
npm run dev
```

Start the production-style server:

```bash
npm run start
```

The server uses `PORT` from the environment. If no port is set, it runs on port `3000`.

## Required Environment Variables

Set these in `.env` locally and in your deployment platform:

```bash
DATABASE_URL=
OPENAI_API_KEY=
EMAIL_USER=
EMAIL_APP_PASSWORD=
EMAIL_FROM=
GMAIL_LEAD_CAPTURE_ENABLED=false
```

Keep `GMAIL_LEAD_CAPTURE_ENABLED=false` unless you intentionally enable future automatic Gmail polling. The current Gmail capture script is manual.

## App Routes

- Lead form: `http://localhost:3000/`
- Dashboard: `http://localhost:3000/dashboard`
- Agent settings: `http://localhost:3000/settings`
- Health check: `http://localhost:3000/health`

## API Routes

Health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "environment": "development"
}
```

Create a website lead:

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Alex Agent\",\"email\":\"alex@example.com\",\"phone\":\"555-123-4567\",\"message\":\"I would like to schedule a showing this weekend.\",\"source\":\"website\"}"
```

Get recent leads for the dashboard:

```bash
curl http://localhost:3000/api/leads
```

Get agent settings:

```bash
curl http://localhost:3000/api/settings
```

Save agent settings:

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d "{\"agentName\":\"Your Name\",\"agentEmail\":\"you@example.com\",\"agentPhone\":\"555-123-4567\",\"businessName\":\"Your Realty Team\",\"calendarLink\":\"https://calendly.com/your-link\",\"preferredReplyTone\":\"friendly and professional\"}"
```

## Website Lead Form Test

Start the server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Submit the form. Expected success message:

```text
Thanks! We will get back to you shortly.
```

The form posts to `/api/leads`, which works locally and after deployment.

## Techstars Demo Flow

Use this flow for a polished investor or accelerator demo:

1. Submit sample lead from `http://localhost:3000/` or `http://localhost:3000/demo`.
2. AI extracts intent, showing interest, timeline, budget, and confidence.
3. AI generates a short professional real estate response.
4. Customer auto-reply email sends, and the agent notification email sends.
5. Dashboard updates at `http://localhost:3000/dashboard` with lead status, AI data, email status, and recent events.
6. Booking workflow appears when the lead asks for a showing, including the saved calendar link when agent settings include one.

Before the demo, open `http://localhost:3000/settings` and save the agent name, business name, reply tone, and calendar link you want the AI to use.

## Manual Gmail Lead Capture Test

Gmail capture does not run on server startup. To test one email manually, send yourself an unread email with this exact subject:

```text
TEST REAL ESTATE LEAD
```

Then run:

```bash
npm run capture:gmail-test
```

The script reads only the newest unread email with that exact subject, creates one lead with `source = email`, marks that email as read, and exits.

## Deployment

Full deployment instructions are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

Recommended stack:

- Frontend + backend: Render Node Web Service
- Database: Supabase PostgreSQL
- Alternative: Railway Web Service with PostgreSQL

Use these deployment settings:

- Build command: `npm ci && npm run deploy:prepare`
- Start command: `npm run start`
- Health check path: `/health`

Add the required environment variables in the platform dashboard. Do not paste secrets into code, README files, screenshots, or Git commits.

For Render, create a Web Service or Blueprint from this GitHub repo, select Node, set the build/start commands above, and add the environment variables. For Railway, create a new service from the repo, set the same commands, and add the same variables.

## Production Notes

- The app uses environment variables for database, email, OpenAI, and Gmail capture settings.
- `.env` is ignored by Git and should stay local.
- Unknown routes return JSON `404` responses.
- Unexpected server errors are logged, but production responses stay generic.
- AI extraction or AI response failures are logged without blocking lead saving or email sending.
