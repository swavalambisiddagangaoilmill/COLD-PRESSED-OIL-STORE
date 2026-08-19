# Production monitoring

The backend exposes a public, dependency-free health check at `GET /api/health`. A healthy process returns HTTP `200` with this response:

```json
{"success":true,"message":"API is healthy"}
```

Render also uses this path through `healthCheckPath` in `render.yaml`.

## Optional backend self health check

The persistent Node process can schedule a lightweight request to its own public health endpoint. It is disabled by default and only runs in production when `KEEP_ALIVE_ENABLED=true`. Each attempt uses a newly randomized delay around the configured target, has a 10-second timeout, produces no database writes, and does not use email or notification services.

Configure `KEEP_ALIVE_BASE_URL` with the public backend origin and leave `KEEP_ALIVE_PATH=/api/health`. The interval defaults to 180 seconds with 30 seconds of jitter. Set `KEEP_ALIVE_LOGGING=true` only when successful-request logs are needed; failures always produce one concise warning.
