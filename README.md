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

Create a local `.env` from `.env.example` when we add app runtime config, or export the key directly before running scripts:

```bash
set ANU_QRNG_API_KEY=your_api_key_here
npm run demo:draw
```

PowerShell users can set it for the current terminal like this:

```powershell
$env:ANU_QRNG_API_KEY = "your_api_key_here"
npm.cmd run demo:draw
```

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
