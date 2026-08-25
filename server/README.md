# Swavalambi Siddaganga Oil Mill Backend

Production-ready Express + MongoDB backend for the Swavalambi Siddaganga Oil Mill MERN storefront.

## Setup

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

## Scripts

- `npm run dev` starts the API with nodemon.
- `npm start` starts the API with Node.
- `npm run seed` creates an admin user, categories, and demo products.
- `npm run reset` clears seeded collections.

## Structure

- `config/` centralizes environment, database, and Cloudinary config.
- `controllers/` handles request and response only.
- `services/` contains business logic.
- `routes/` registers API endpoints.
- `models/` defines Mongoose schemas.
- `validators/` contains express-validator chains.
- `middleware/` contains auth, admin, validation, upload, and error middleware.
- `utils/` contains reusable response, JWT, async, slug, and error helpers.

## API Base

All endpoints are mounted under `/api`.

- Auth: `/api/auth/otp/request`, `/api/auth/otp/verify`, `/api/auth/logout`, `/api/auth/refresh`, `/api/auth/profile`

## WhatsApp OTP authentication

Customer browser authentication uses Indian mobile numbers and WhatsApp OTP. Admin authentication is separate and uses admin email, bcrypt-hashed password, and a required email OTP at `/admin/login`. Both use HttpOnly cookies; browser JavaScript does not store bearer or refresh tokens.

Use `WHATSAPP_MODE=mock` only for local development. Live mode requires the Meta WhatsApp Cloud API token, phone-number ID, business-account ID, API version, and approved authentication and order-tracking templates listed in `.env.example`. Invoices remain website-only downloads and are never sent through WhatsApp.

No old-data authentication migration is required for a fresh database. Configure the default admin email/password environment variables before first startup.
- Products: `/api/products`, `/api/products/featured`, `/api/products/:slug`
- Categories: `/api/categories`
- Wishlist: `/api/wishlist`
- Orders: `/api/orders`
- Payments: `/api/payments/intent`, `/api/payments/verify`
- Uploads: `/api/upload/image`

Payment and upload providers are connected through environment-based service adapters. Configure provider credentials only in server/.env or the deployment secret manager.

## Backend self health check

Production deployments can enable a lightweight backend-only health request with `KEEP_ALIVE_ENABLED=true`. The scheduler calls the configured `KEEP_ALIVE_BASE_URL` and `KEEP_ALIVE_PATH` approximately every three minutes, choosing a fresh delay within the configured jitter range after every attempt. It performs no database writes and has no connection to email or notification services.

The feature is disabled by default and remains inactive outside `NODE_ENV=production`. Configuration:

- `KEEP_ALIVE_ENABLED=false`
- `KEEP_ALIVE_BASE_URL=https://your-backend.example.com`
- `KEEP_ALIVE_INTERVAL_SECONDS=180`
- `KEEP_ALIVE_JITTER_SECONDS=30`
- `KEEP_ALIVE_PATH=/api/health`
- `KEEP_ALIVE_LOGGING=false`
