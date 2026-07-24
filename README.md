# VelvetStream

VelvetStream is an adults-only moderated video platform. The current branch contains a real full-stack implementation with persistent users, private video uploads, admin moderation and reporting.

## What is implemented

- 18+ entry gate and responsive UI
- PostgreSQL-backed user accounts
- bcrypt password hashing
- signed JWT sessions
- `user` and `admin` roles enforced server-side
- direct browser-to-object-storage video uploads using short-lived presigned URLs
- server-side verification of uploaded object type and size before creating a submission
- private pending submissions
- admin approve / reject / delete controls
- signed, expiring playback URLs for approved media
- persistent abuse/content reports
- rate limiting and security headers
- no secrets, passwords, videos, identity documents or consent records stored in GitHub

## Architecture

- **Frontend:** HTML/CSS/vanilla JavaScript
- **API:** Node.js 20+ / Express
- **Database:** PostgreSQL
- **Authentication:** bcrypt + signed JWT
- **Media:** any S3-compatible private object store that supports presigned URLs

The storage adapter works with providers such as Cloudflare R2, Backblaze B2 S3 and MinIO. You are responsible for confirming that your selected host and storage provider permit your intended lawful content under their current terms.

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment variables

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, a strong `JWT_SECRET`, and your S3-compatible storage credentials.

Generate a JWT secret, for example:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Initialize PostgreSQL

Create an empty PostgreSQL database, then run:

```bash
npm run db:init
```

### 4. Create the first admin

Set these values in `.env`:

```env
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=use-a-long-unique-password
```

Then run:

```bash
npm run admin:create
```

The script creates the admin if missing, or resets that account to the admin role and updates its password.

### 5. Configure object-storage CORS

Your private S3-compatible bucket must allow browser `PUT` requests from the domain that hosts VelvetStream and must allow the `Content-Type` request header. Do not make the bucket publicly writable.

Keep objects private. VelvetStream generates temporary signed upload and playback URLs server-side.

### 6. Run

```bash
npm start
```

Open `http://localhost:3000`.

Check infrastructure status at:

```text
/api/health
```

## Required environment variables

See `.env.example` for the full list. The important values are:

- `DATABASE_URL`
- `JWT_SECRET`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION`
- `MAX_VIDEO_BYTES`

Never commit `.env` or production credentials.

## Upload lifecycle

1. User creates an account and logs in.
2. Browser requests `/api/uploads/presign`.
3. API validates reported MIME type and file size, then generates a random private object key.
4. Browser uploads the file directly to object storage.
5. Browser submits metadata and the object key to `/api/submissions`.
6. Server checks the object really exists and validates its stored MIME type and size.
7. Submission remains `pending` and is not returned by the public video API.
8. Admin reviews it and marks it approved or rejected.
9. Approved media is playable only through a short-lived signed GET URL.

## Important compliance boundary

The checkboxes in the UI are not a substitute for legally sufficient identity, age and consent verification.

Before accepting real adult content from the public, you need a secure, auditable process for performer identity, age and consent documentation, record retention, emergency takedowns, non-consensual-content complaints, suspected-minor reports, copyright claims, appeals and any jurisdiction-specific recordkeeping duties.

Do not commit performer IDs, consent records, moderation evidence, explicit media or other sensitive records to GitHub.

## Content policy baseline

A production service must prohibit and rapidly remove content involving minors or suspected minors, non-consensual intimate material, coercion, exploitation, trafficking, privacy violations, illegal material and content the uploader lacks rights to distribute.

## Remaining production work

This repository now provides the core working application, but a public launch should still add:

- verified-email / password-reset flow or a managed authentication provider
- MFA for administrators
- dedicated performer identity/age/consent verification workflow
- audit logs for moderation and account actions
- report-management UI and emergency escalation
- malware/media scanning and thumbnail/transcoding jobs
- CSRF-safe cookie sessions if you choose cookies instead of bearer tokens
- monitoring, backups and disaster recovery
- legal terms/privacy/takedown policies reviewed for the countries you serve
- provider-specific deployment configuration after confirming the provider permits the intended lawful content
