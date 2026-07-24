# VelvetStream

VelvetStream is an adults-only video-platform MVP focused on moderated submissions, reporting, and consent-first publishing rules.

## Current MVP

The current version is a dependency-free static web app with:

- 18+ entry gate
- responsive dark-mode UI
- browse/search/category filtering
- demo video cards (no explicit media stored in the repository)
- content submission form
- required adult/consent/rights confirmations
- local moderation queue with approve/reject/delete controls
- report-content flow
- safety, terms, privacy, and age/consent information
- mobile responsive layout

## Run locally

No build step is required.

1. Clone the repository.
2. Open `index.html` in a browser, or serve the folder with any static local server.

Example with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Important: prototype storage

This MVP uses `localStorage` only for the age-gate confirmation, demo submission metadata, and demo moderation state.

No real account password, video file, identity document, or performer verification document should be stored in browser storage.

## Production architecture

For a real deployment, replace demo storage with:

1. **Authentication service** — account registration, sessions, admin roles, MFA for staff.
2. **Database** — users, submission metadata, moderation state, reports, takedown requests, audit trail.
3. **Private media storage** — uploaded videos and thumbnails using a provider whose terms allow the intended lawful content.
4. **Moderation backend** — uploads remain private until an authorized moderator approves them.
5. **Age/identity and consent verification** — auditable performer records handled securely and separately from public content.
6. **Abuse and takedown workflow** — fast emergency review, privacy/consent complaints, copyright requests, and appeals.

## Content-safety requirements

A production service must prohibit and rapidly remove content involving minors, suspected minors, non-consensual intimate material, coercion, exploitation, trafficking, privacy violations, or other illegal material.

Only upload content you own or are authorized to distribute. All depicted performers must be verified adults and must consent to both recording and distribution.

## Repository policy

Keep application source code here. Do not commit explicit video files, identity documents, performer records, private moderation evidence, API secrets, or production credentials to this repository.

## Next development steps

- add a real backend and database
- implement user/admin authentication
- add secure upload URLs
- add private pending-media storage
- build server-side moderation and reports
- add audit logging
- add production legal/compliance pages reviewed for the jurisdictions where the service operates
