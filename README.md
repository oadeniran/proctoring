# Proctoring frontend

Vite + vanilla JS + vanilla CSS. No framework, no components. Two screens:
**Candidate registration** (enrol + issue admission pass) and **Hall admission**
(scan a pass, verify identity, clear the candidate into the hall).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

The app calls the API at `VITE_API_BASE`, which defaults to
`http://localhost:8008/zonyxstudio` — so for local dev you don't set anything.
Just start the API first:

```bash
# in the backend repo
python main.py
```

(The backend sets CORS to allow all origins, so the dev server calls it
directly.) No backend yet? The registration screen has **Load sample
candidates**, which gives you codes to try at the gate.

## Production

Point the app at your deployed API by setting `VITE_API_BASE` — the base URL
**including** the `/zonyxstudio` prefix — then build. Commit it as
`.env.production`, or inject it at build time:

```bash
echo "VITE_API_BASE=https://api.your-host.example/zonyxstudio" > .env.production
npm run build      # outputs to dist/
```

Vite loads `.env.production` for `build` and `.env.development`/`.env` for
`dev`, so local stays on localhost and the deployed build points at the
deployment automatically.

## Files

- `src/main.js` — app shell, tab routing, health chip
- `src/register.js` — registration form, admission-pass slip, candidate table
- `src/admission.js` — gate control, ADMIT/DENY verdict, live activity feed
- `src/api.js` — backend calls   ·   `src/util.js` — DOM + formatting helpers
- `src/store.js` — hash navigation + shared code   ·   `src/style.css` — theme

## Demo flow

1. Registration → register a candidate (or load samples) → note the pass code.
2. Hall admission → pick the candidate → **Verify entry** → ADMIT.
3. Verify again → DENY (anti-passback) → **Authorise re-entry** to clear it.
4. Switch outcome to **Impersonation** → Verify → DENY (fingerprint mismatch).