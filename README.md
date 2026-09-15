# Scavenger Hunt 2.0 — CodeChef

A production-oriented campus scavenger hunt with a Next.js 15 frontend and Python Flask serverless API on Vercel, backed by MongoDB Atlas.

## Stack

- Frontend: Next.js 15 App Router, React 19, TypeScript, Framer Motion, Lucide, QR camera scanner
- Backend: Python Flask serverless function on Vercel
- Database: MongoDB Atlas / PyMongo
- Hosting: Vercel

## Folders

- `frontend/` — complete animated player + admin UI
- `backend/` — Python game engine/API

## Key rules implemented

- Exactly 10 physical locations
- 10 checkpoints required for a full completion
- 1–3 players per team
- Unique randomized route per team
- Unique puzzle assignment for each team/location combination
- Python/C++ puzzle source can be long/scrambled and is stored server-side
- Correct answer advances the team exactly once, protected against simultaneous submissions
- Wrong physical QR immediately disqualifies the entire team
- Server-side timestamps
- Admin-configurable scheduled start, manual start, game duration, session limit and result token buffer
- Scheduled start or manual start; once LIVE there is no pause/stop endpoint
- Automatic game ending
- Player end screen directs everyone back to the configured starting room
- Admin `SHOW RESULTS` publishes the leaderboard directly on `/`
- Disqualified teams are excluded from results

## Deployment

### 1. MongoDB Atlas
Create a database and set the connection string.

### 2. Backend Vercel project
Deploy `backend/` as its own Vercel project.

Set:

- `MONGODB_URI`
- `MONGODB_DB`
- `APP_SECRET` — long random secret
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH` — generate with `tools_hash_password.py`
- `GAME_NAME` (optional)
- `FRONTEND_ORIGIN` — URL of the Next.js frontend
- `PUBLIC_APP_URL` — URL of the Next.js frontend, used in generated QR payloads

### 3. Frontend Vercel project
Deploy `frontend/`.

Recommended setup: leave `NEXT_PUBLIC_API_BASE_URL` empty and set:

`BACKEND_INTERNAL_URL=https://YOUR-BACKEND-VERCEL-DOMAIN`

The Next.js rewrite makes `/api/*` same-origin from the browser. This keeps the player/admin cookies on the frontend origin while proxying API calls to Python.

Alternative: set `NEXT_PUBLIC_API_BASE_URL` to the backend URL. The backend CORS variables must then allow the frontend origin and credentials.

## Admin flow

1. Login at `/admin/login`.
2. Configure game clock and starting room.
3. Create teams.
4. Add puzzles for each physical location; include multiple Python/C++ puzzle variants.
5. Generate/prepare routes.
6. Print the physical QR codes from the backend QR endpoint or the existing backend admin tools.
7. Start manually or wait for the scheduled start.
8. Monitor progress.
9. After game end, press `SHOW RESULTS`.
10. Everyone on `/` sees the public final leaderboard.

## Puzzle design

A QR stores only a physical checkpoint token. The Python backend resolves that token to a location, validates it against the team's expected location, and then serves that team's pre-assigned puzzle variant. This prevents the same question being shared between teams simply because they visit the same physical location.

## Local development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
python -m venv .venv
# activate the environment
pip install -r requirements.txt
python app.py
```

When running locally, set `BACKEND_INTERNAL_URL=http://localhost:5000` in the frontend environment.
