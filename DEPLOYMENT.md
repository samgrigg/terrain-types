# Deployment

This repo is set up for:

- CI on GitHub Actions
- Hosting on Render
- Automatic deploys only after CI checks pass

## What you need

You need hosting in three places:

1. Git hosting
   - Push this repo to GitHub.
   - GitHub Actions runs tests and build checks from `.github/workflows/ci.yml`.

2. App hosting
   - Create a Render account.
   - Render will host:
     - the FastAPI backend as a Web Service
     - the React app as a Static Site

3. OAuth configuration
   - In Strava's developer settings, set the authorization callback domain/URL to your deployed backend callback URL.
   - This app expects the callback endpoint to be `/api/auth/callback`.

## Automation design

The automation path is:

1. Push to `main` or open a pull request.
2. GitHub Actions runs:
   - backend `pytest`
   - frontend Jest tests
   - frontend production build
3. Render watches the repo.
4. Render deploys only when CI checks pass because `render.yaml` uses `autoDeployTrigger: checksPass`.

## Render setup

`render.yaml` is already included at the repo root.

In Render:

1. Click `New` -> `Blueprint`.
2. Connect the GitHub repo.
3. Select this repo and deploy the Blueprint.

That Blueprint creates:

- `terrain-types-api`
- `terrain-types-web`

## Required environment variables

### Backend service: `terrain-types-api`

Set these in Render:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `FRONTEND_URL`

Use [backend/.env.example](/Users/compy/dev/learn/terrain-types/backend/.env.example) as the template.

### Frontend service: `terrain-types-web`

Set these in Render:

- `REACT_APP_API_URL`
- `REACT_APP_STRAVA_CLIENT_ID`

Use [frontend/.env.example](/Users/compy/dev/learn/terrain-types/frontend/.env.example) as the template.

## Recommended URL layout

The cleanest setup is:

- frontend: `https://app.yourdomain.com`
- backend: `https://api.yourdomain.com`

Then configure:

- `FRONTEND_URL=https://app.yourdomain.com`
- `STRAVA_REDIRECT_URI=https://api.yourdomain.com/api/auth/callback`
- `REACT_APP_API_URL=https://api.yourdomain.com`
- `REACT_APP_STRAVA_CLIENT_ID=<same Strava client id as backend>`

If you do not have a custom domain yet, you can use the temporary `onrender.com` URLs first, then update the env vars later.

## First deploy checklist

1. Push this repo to GitHub.
2. Create the Render Blueprint from `render.yaml`.
3. Wait for Render to assign service URLs.
4. Fill in the backend and frontend environment variables in Render.
5. Redeploy both services.
6. Update your Strava app settings to use the deployed backend callback URL.
7. Test:
   - frontend loads
   - `/health` returns `{"status":"ok"}`
   - Strava OAuth redirects back to the frontend
   - activities load after login

## Ongoing deploy flow

After setup:

- open PR -> GitHub Actions validates changes
- merge to `main` -> Render deploys automatically after checks pass

## If you want a cheaper or simpler variant

The current setup keeps everything on one host provider.

If you want to change later:

- frontend can move to Vercel, Netlify, or Cloudflare Pages
- backend can stay on Render

That split is not necessary for the current app.

## Progressive Web App (PWA)

The frontend ships a web app manifest (`public/manifest.json`) and a minimal service worker (`public/sw.js`) registered in production builds. **Installability and reliable service worker updates require HTTPS** (localhost is exempt during development). Users should open the deployed site at least once before using the browser’s **Add to Home Screen** / install prompt. Offline behavior is intentionally limited: API calls still need network access, and the service worker mainly enables installation and basic resilience—do not assume full offline routing without expanding caching strategy.
