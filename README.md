# Billwise

A private, single-business billing app for managing customers, creating invoices, emailing PDF invoices, and recording payments manually.

## Getting started

Requirements: Node.js 20.9 or newer.

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Copy `.env.example` to `.env.local`.
3. Create a Supabase project, copy its **Transaction pooler** connection string, and set it as `DATABASE_URL` in `.env.local`. Set a `BILLING_APP_PASSWORD` of at least 16 characters and a random `AUTH_SECRET` of at least 32 characters. Generate one with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Set your business and SMTP settings in the same file.
4. Start the app:

   ```powershell
   npm.cmd run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

The app binds to `127.0.0.1`, protects pages and API routes with a single-user password, and stores records in Supabase PostgreSQL. Back up the database using Supabase's backup/export tools.

## Deploy to Render

1. Push this project to a private GitHub repository and connect that repository to Render. Render deploys from a Git-connected repository; it cannot deploy this local folder directly.
2. Create the Render service from the included `render.yaml` Blueprint.
3. In the Render service's environment settings, add the Supabase Transaction pooler `DATABASE_URL`, a `BILLING_APP_PASSWORD` of at least 16 characters, and a random `AUTH_SECRET` of at least 32 characters. Generate the secret locally with the command above. Add your SMTP and business settings there too. Do not commit or share secrets.
4. Open `/login` on the deployed service to verify that password sign-in works, then confirm customer creation, invoice creation, PDF download, email delivery, and manual payment recording.

The app requires persistent PostgreSQL and refuses unauthenticated access. It is not safe to deploy with the database or access-control environment variables missing. Sessions expire after seven days; signing out clears the session cookie.

The Blueprint uses Render's free web-service plan, which can sleep when idle; the first request after a sleep may take longer. The database is your separate Supabase project, not a Render database. Choose and review the Supabase plan and its backup/retention terms before storing real billing records.

## Email setup

When an invoice is created, Billwise generates a PDF and emails it to the selected customer's email address. Configure SMTP in `.env.local`:

```env
BUSINESS_NAME=Your Business
BUSINESS_EMAIL=you@example.com
BUSINESS_ADDRESS=Your billing address
CURRENCY=USD
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=you@example.com
```

Use credentials and a sender address supplied by your email provider. Port `465` uses implicit TLS; other configured ports use SMTP with STARTTLS where supported. Never commit `.env.local` or share SMTP credentials.

Invoices are saved even if SMTP is unavailable. Billwise displays the email failure and lets you retry after fixing the SMTP settings. PDF invoices can also be opened from the invoice list.

## Scope and privacy

The app supports customer records, invoices with multiple line items, due dates, emailed PDF attachments, and manually recording an invoice as paid. It does not process payments, calculate tax, or create recurring invoices.

Access is protected by a single shared password; this is intended for one owner, not multiple user accounts. Use a unique, long password and a strong random `AUTH_SECRET`. Avoid exposing the app on a shared network without additional controls.
