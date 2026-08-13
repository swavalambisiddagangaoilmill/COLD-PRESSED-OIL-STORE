# Cloudflare Turnstile production configuration

Turnstile is verified independently by the backend and must not be bypassed.

## Frontend host

Set `VITE_TURNSTILE_SITE_KEY` to the public site key, then redeploy/rebuild the frontend. Vite embeds this public value at build time, so adding it after a deployment does not update an existing bundle.

## Render backend

Set `TURNSTILE_SECRET_KEY` to the matching secret key. Never use a site key here and never prefix this variable with `VITE_`.

Set the allowed origins explicitly:

```text
CLIENT_URL=https://swavalambisiddagangaoilmill.com
CLIENT_URLS=https://swavalambisiddagangaoilmill.com,https://www.swavalambisiddagangaoilmill.com
```

## Cloudflare widget settings

Allow both hostnames on the same widget:

- `swavalambisiddagangaoilmill.com`
- `www.swavalambisiddagangaoilmill.com`

The public site key and backend secret must come from that same widget. After changing either value, redeploy both services and complete a fresh challenge; tokens expire and cannot be reused. The backend also rejects a successful token whose returned hostname is not in `CLIENT_URLS`.

## Production check

1. Open `/signup` in a private window and confirm the widget is visible.
2. Complete the widget and submit a test signup with a new address.
3. Confirm the request contains `turnstileToken` and succeeds once.
4. Reusing the same token must fail.
5. Repeat on the canonical hostname and the `www` hostname.

If the widget is replaced by “Human verification is temporarily unavailable,” the frontend build does not contain `VITE_TURNSTILE_SITE_KEY`.
