# real-estate-ai-lead-responder---MVP

Backend foundation for the Real Estate AI Lead Responder MVP.

## Requirements

- Node.js 18 or newer
- npm

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the development server:

```bash
npm run dev
```

Start the production-style server:

```bash
npm start
```

The server uses `PORT` from `.env`. If no port is set, it runs on port `3000`.

## Test Website Lead Form

Start the server:

```bash
npm run dev
```

Open the lead form in your browser:

```text
http://localhost:3000
```

Fill out the name, email, phone, and message fields, then submit the form.

Expected success message:

```text
Thanks! We will get back to you shortly.
```

The form sends the lead to:

```text
http://localhost:3000/api/leads
```

## Test Routes

Check that the API is running:

```bash
curl http://localhost:3000/api/test
```

Expected response:

```json
{
  "status": "working"
}
```

Create a lead:

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Alex Agent\",\"email\":\"alex@example.com\",\"phone\":\"555-123-4567\",\"message\":\"I want to sell my home.\",\"source\":\"website\"}"
```

Expected response:

```json
{
  "name": "Alex Agent",
  "email": "alex@example.com",
  "phone": "555-123-4567",
  "message": "I want to sell my home.",
  "source": "website"
}
```
