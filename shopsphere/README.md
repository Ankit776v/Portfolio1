# ShopSphere — Full-stack e-commerce portfolio demo

A polished, responsive e-commerce application built for a developer portfolio. Includes a product catalog, search and category filters, persistent cart, account registration and login, simulated checkout with transactional inventory updates, order history, and admin inventory/order management.

## Quick start

Requires **Node.js 22.13+**. No npm install is required; this project uses Node.js built-in HTTP, crypto, and SQLite APIs.

```bash
cd shopsphere
ENABLE_DEMO=true npm start
```

Open http://localhost:3000

Demo shopper: `demo@shopsphere.local` / `Demo12345!`
Demo admin: `admin@shopsphere.local` / `Admin12345!`

To run without seeded demo accounts: `npm start`. Demo account passwords are **public**, so `ENABLE_DEMO=true` must never be used with real customer data. Use a disposable database and reset it regularly if hosting a public demo.

## Features

- Public catalog, search, category filters, price sorting, product details, and responsive design.
- Customer signup/login with scrypt password hashes, HTTP-only SameSite session cookies, and server-side session validation.
- Persistent per-user cart with stock checks and quantity controls.
- Simulated checkout: atomic SQLite transaction creates an order, snapshots product prices, reduces stock, clears cart. **No payments, shipping, or tax calculations.**
- Order history restricted to the signed-in customer.
- Admin-only inventory price/stock editing, order status updates, and summary metrics.
- Basic login rate limiting, JSON body size limits, origin validation for state-changing requests, and browser security headers.

## Environment

- `PORT`: default `3000`
- `HOST`: default `0.0.0.0`
- `DATA_DIR`: SQLite storage directory; default `./data`
- `ENABLE_DEMO=true`: create demo accounts on startup
- `NODE_ENV=production`: adds Secure session cookie and HSTS; **only use behind correctly configured HTTPS**

## Hosting

Deploy as a Node web service on Render/Railway or similar with a persistent disk and Node >=22.13. Set the start command to `npm start`, configure `DATA_DIR` to a mounted persistent volume, and set `NODE_ENV=production` with HTTPS. Health endpoint: `/api/health`.

For public recruiting demos, use an isolated, resettable database, keep demo credentials intentionally public, and do not accept real customer information or payments. This is a portfolio MVP, **not a production-ready commerce platform**. Before real-world launch add durable multi-instance DB architecture (PostgreSQL), email verification, password reset, CSRF tokens, stronger distributed rate limiting, structured logs, monitoring, tests, payments via a compliant provider, and a proper fulfillment workflow.

## Architecture

Browser SPA (vanilla JS) → Node.js REST API → SQLite database (users, sessions, products, carts, orders, order_items, events).

No third-party assets or runtime dependencies are required. Prices are stored in **integer paise** to avoid floating-point currency errors. Database schema and seed products initialize automatically on first start.

## Portfolio blurb

**ShopSphere — Full-stack e-commerce application**: Developed a responsive storefront with customer authentication, product search and filtering, persistent carts, simulated transactional checkout, order tracking, and role-based admin inventory management. Built using Node.js, REST APIs, SQLite, and vanilla JavaScript.

**Author:** Ankit Vishwakarma


## Product catalog and inventory

- `productlist.js` contains starter products for **new database installations only**. Changing this file does not overwrite existing inventory.
- Admin > **Add new product** creates products in the live SQLite database and makes them searchable in the storefront.
- Admin > **Receive stock** adds the entered number of units to the current stock (e.g. 10 + 5 = 15).
- Admin > **Save** directly sets the current price and stock, useful for corrections.
- Checkout deducts purchased units inside an SQLite transaction, so insufficient stock prevents the order. Adding to cart does not deduct stock.
- No real payment is processed. Protect admin credentials; don't expose demo admin on a public production deployment.


## Buyer and seller roles
Sign up as Buyer or Seller. Buyers can browse, add to cart, and place demo orders. Sellers get their own dashboard, can publish listings, update prices, receive stock, and see line items sold from their own products. Existing `admin` users retain platform-wide controls. Role checks are enforced server-side, not just in the UI. Existing products are platform-owned (seller_id NULL); new seller listings are tied to their owner. This is a portfolio demo: no real payment processing, fulfillment, payouts, refunds, or identity verification.

## Product image uploads
Seller and admin Add Product forms accept a JPG, PNG or WebP up to 2 MB. The browser sends the image to the authenticated `/api/images` endpoint before product creation. The server checks the image signature, stores it under `DATA_DIR/product-images/`, and saves its URL in SQLite. Images appear in product cards, detail views and inventory listings. Existing products continue using emoji placeholders.

**Deployment:** Keep `DATA_DIR` on persistent storage: both SQLite and uploaded product images are saved there. This MVP does not yet support image replacement, deletion, image resizing or malware scanning. For public deployment, add image processing, upload quotas, and object storage.


## Forgot password / reset password

The sign-in screen includes **Forgot password?**. Reset links expire in 15 minutes, are single-use, and are stored as SHA-256 hashes. Password changes revoke all existing sessions. The API uses generic responses to avoid disclosing registered emails.

**Local development:** Run with `NODE_ENV` unset and request a reset. The link prints in the Node.js terminal (not in the browser). Never use this mode with real users.

**Public deployment:** Configure `PUBLIC_URL=https://your-domain.example`, `RESEND_API_KEY`, and `RESET_FROM_EMAIL` (a verified sending address). The app uses Resend's HTTPS email API; verify your domain and test delivery before sharing with recruiters. Set `NODE_ENV=production` so reset links are never printed. Without these settings, password-reset emails will not be sent. Do not commit secrets.
