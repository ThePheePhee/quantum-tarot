# Quantum Tarot

A tarot card drawing app scaffold powered by a quantum random number generator.

The first implementation isolates quantum randomness behind a small TypeScript interface so the UI can draw cards without knowing which QRNG provider is used.

## Current Setup

- `QrngProvider` interface for sources that return random bytes.
- ANU QRNG provider using the public JSON API.
- Bias-free `randomInt()` helper using rejection sampling.
- 78-card tarot deck model.
- Single-card draw helper with upright/reversed orientation.

## Local Development

Install dependencies:

```bash
npm install
```

Type-check:

```bash
npm run check
```

Start the local web app:

```bash
npm run dev
```

Then open:

```text
http://localhost:4173
```

## Deploy Online

This app needs a Node server because the browser calls `/api/*` endpoints for
seed state, drawing, and ontology dashboard data. Static-only hosts such as
GitHub Pages will not run those endpoints.

The repo includes `render.yaml` for Render Blueprint deployment:

1. Push `main` to GitHub.
2. In Render, create a new Blueprint from `ThePheePhee/quantum-tarot`.
3. Set these environment variables in Render:
   - `BASEROW_API_URL`
   - `BASEROW_DATABASE_ID`
   - `BASEROW_TOKEN`
   - `ANU_QRNG_API_KEY` only when QRNG is re-enabled.
4. Render will run `npm ci && npm run build` and start the app with `npm start`.

The local `.env` file is ignored by git and should not be committed.

Draw one card from the ANU QRNG:

```bash
npm run demo:draw
```

## QRNG Setup Notes

The default provider is the Australian National University Quantum Numbers API:

```text
https://api.quantumnumbers.anu.edu.au/?length=1&type=uint8
```

You need:

- A free or paid ANU Quantum Numbers API key from `https://quantumnumbers.anu.edu.au/`.
- `ANU_QRNG_API_KEY` set in the environment where the app runs.
- Internet access from wherever the app runs.
- Permission for the app/backend to call `https://api.quantumnumbers.anu.edu.au`.
- A fallback plan for outages or rate limits before using this in production.

Create a local `.env` from `.env.example`:

```bash
ANU_QRNG_API_KEY=your_api_key_here
```

Or export the key directly before running scripts:

```bash
set ANU_QRNG_API_KEY=your_api_key_here
npm run demo:draw
```

PowerShell users can set it for the current terminal like this:

```powershell
$env:ANU_QRNG_API_KEY = "your_api_key_here"
npm.cmd run demo:draw
```

The web app uses one QRNG request only when you press **Reseed quantum randomness**. Three-card spreads are then drawn from a local seeded generator so normal draws do not spend additional QRNG quota.

For a browser-first app, the safest production shape is usually:

1. The frontend asks your backend for a draw.
2. The backend fetches QRNG bytes.
3. The backend maps the bytes to a card using rejection sampling.
4. The backend returns the draw plus source metadata.

That avoids exposing provider quirks to the client, and it gives us one place to add caching, audit logs, provider failover, or a verifiable randomness beacon later.

## GitHub Setup

This project is ready to publish once GitHub CLI is authenticated:

```bash
gh auth login
gh repo create quantum-tarot --private --source=. --remote=origin --push
```

Use `--public` instead of `--private` if you want the repository visible immediately.
