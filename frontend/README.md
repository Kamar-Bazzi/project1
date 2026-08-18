# CareTrack web client

React 18, TypeScript, and Vite client for patient, doctor, and administrator
workflows.

## Local setup

```bash
cp .env.example .env.local
npm ci
npm run dev
```

`VITE_API_URL` defaults to `http://localhost:3000/api/v1`. Production builds
use `/api/v1` so the HTTPS gateway can serve the SPA and proxy the API from one
origin.

## Verification

```bash
npm run lint
npm run build
```

The client keeps the short-lived access token in `sessionStorage`; the rotated
refresh token is an HttpOnly cookie and is never available to JavaScript. Push
reminders use `public/sw.js` and are registered only after an explicit browser
permission gesture.

See the repository-level [README](../README.md), [API reference](../docs/api-reference.md),
and [security guide](../docs/security.md).
