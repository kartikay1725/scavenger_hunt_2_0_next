# Scavenger Hunt 2.0 — CodeChef

A serverless campus scavenger-hunt platform built for Vercel + MongoDB Atlas. It uses Flask on Vercel's Python runtime, with a static/vanilla browser UI and camera QR scanning.

## Core rules implemented

- 10 physical checkpoints, all 10 required for a full finish.
- 1–3 players per team.
- Server-side timestamps.
- Admin-configurable start time, duration, starting room, player session limit and +20 second (default) result token/buffer.
- Automatic start at the configured time is supported by `GET /api/game` / player polling; manual Start immediately starts and freezes the game. Once LIVE, there is no pause/stop endpoint in the app.
- Randomized per-team routes through all 10 locations.
- Physical QR contains only a secure checkpoint token, not the question.
- Each team/location gets its own puzzle assignment. Manual puzzle bank entries are supported; the application also has a deterministic variant generator as a fallback so a new code variant can be produced per team/location.
- Wrong QR for a team's expected location immediately disqualifies the whole team.
- Correct answers are applied once per team/checkpoint using an atomic MongoDB update to prevent duplicate scoring from simultaneous phones.
- 150+ active players are supported by stateless HTTP requests and MongoDB as the source of truth.
- After game expiry, scans/answers are rejected and `/` shows the return-to-start-room message.
- Admin can publish results; the public `/` page then shows the leaderboard without a result-login token.
- Multiple admins can log in concurrently using the same configured credentials.

## Timing calculation implemented

For a team that completes all 10 checkpoints:

`final_result_seconds = game_elapsed_seconds + entry_differential_seconds + token_buffer_seconds`

`entry_differential_seconds` is the sum, across all team members, of the positive difference between the official game start timestamp and each member's team-join timestamp. The default result token/buffer is 20 seconds and is configurable.

If no team completes all 10 before time expires, the leaderboard ranks by highest score first and lowest final/result time second where a comparable result time exists. Disqualified teams are excluded.

## Local development

1. Create a virtual environment and install requirements.
2. Copy `.env.example` to `.env` and set MongoDB + admin credentials.
3. Run `python app.py`.
4. Open `http://localhost:5000`.

## Vercel deployment

This project uses Vercel's Flask support. Put the repository on GitHub, import it into Vercel, and set these environment variables:

- `MONGODB_URI`
- `MONGODB_DB`
- `APP_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `GAME_NAME` (optional)

## Suggested production checklist

- Restrict MongoDB Atlas network access according to your deployment setup.
- Use a long random `APP_SECRET`.
- Use a Werkzeug password hash rather than plain `ADMIN_PASSWORD`.
- Create enough curated puzzle variants for your expected number of teams. The fallback generator keeps per-team code variants unique, but curated questions are recommended for event quality.
- Print the QR codes from the admin panel only after routes/puzzle assignments are prepared.
- Test with 10–20 simulated teams before the event.

### Browser-side QR scanning

The actual game/backend logic is Python. Camera access and QR decoding necessarily run in the participant's browser, so the player page loads `html5-qrcode` from its public CDN. There is no extra backend/data service involved.
