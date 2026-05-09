# Performance Notes

## Runtime Model

Performance OS is a browser-first Vercel app that talks directly to Supabase from the client. gRPC does not add much value here:

- Browsers cannot call most gRPC services directly without a gRPC-Web proxy.
- Adding a proxy would create another hosted service to operate, cache, secure, and monitor.
- Supabase already exposes HTTP APIs and realtime channels that fit Vercel's static/edge deployment model.
- The tracker workload is UI state, Supabase reads/writes, and workout media delivery; it is not a low-latency service-to-service RPC problem.

The app stays responsive through smaller practical choices instead: static assets served by Vercel, direct Supabase client calls, React route/code bundling, browser caching, service-worker shell fallback, and pre-cached workout media.

## Workout Media Resilience

The service worker keeps workout media from `raw.githubusercontent.com/yuhonas/free-exercise-db` in a dedicated cache for workout sessions. The policy is intentionally bounded:

- Warm up only known workout media URLs posted by the app.
- Keep at most 160 workout media responses.
- Refresh media "last used" metadata when the app starts, regains focus, or becomes visible again.
- Prune media older than 2 hours, giving a 90-minute workout enough buffer without letting old sessions grow the cache forever.
- Leave app shell assets in a separate cache so workout images cannot evict the offline shell.

This is a resilience layer, not a permanent offline media library. If media fetches fail during a session, previously warmed items can still render from the browser cache.

## Smoke Check

Use the lightweight smoke script against a local preview or a deployed URL. It uses built-in Node `fetch` and adds no dependencies.

Local:

```powershell
npm run build
npm run preview
npm run perf:smoke
```

Deployed:

```powershell
$env:PERF_URL = 'https://your-deployment.example'
npm run perf:smoke
```

Optional knobs:

- `PERF_PATHS` comma-separated paths, default `/`, `/manifest.webmanifest`, `/sw.js`
- `PERF_RUNS` repeat count, default `3`
- `PERF_TIMEOUT_MS` request timeout, default `5000`

The command exits non-zero if any request fails or times out.
