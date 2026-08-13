# Production monitoring

The backend exposes a public, dependency-free health check at `GET /api/health`. A healthy process returns HTTP `200` with this response:

```json
{"success":true,"message":"API is healthy"}
```

Render also uses this path through `healthCheckPath` in `render.yaml`.

## External 10-minute keep-alive

The GitHub Actions workflow at `.github/workflows/render-keep-alive.yml` calls the health endpoint every 10 minutes. It runs outside the Render process; the backend contains no self-ping timer or keep-alive traffic.

After the repository is pushed to GitHub:

1. Open **Repository settings > Secrets and variables > Actions > Variables**.
2. Create a repository variable named `RENDER_BACKEND_URL`.
3. Set its value to the public Render service origin without a trailing slash, for example `https://your-service.onrender.com`.
4. Open **Actions > Render backend keep-alive** and run **Run workflow** once.
5. Confirm the run succeeds and returns the health JSON. Scheduled runs then execute every 10 minutes while GitHub Actions is enabled.

The URL is configuration rather than a secret, but using a repository variable keeps environment-specific hostnames out of source control. The workflow has read-only repository permissions, a two-minute job timeout, HTTPS validation, and bounded retries.

GitHub schedules use UTC and can occasionally start later during high load. For strict uptime alerting, configure an independent uptime provider with the same public `https://<service>.onrender.com/api/health` URL, method `GET`, expected status `200`, and interval `10 minutes`.
