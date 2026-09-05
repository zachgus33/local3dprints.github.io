# Local Layer Prints

A complete storefront and order system for a small 3D-print shop. Customers configure products on the site, enter pickup or delivery details, and pay on Stripe's hosted Checkout page. Paid orders are recorded in a private dashboard where their production status can be tracked.

## Included

- Responsive product catalog with color and size options
- Persistent cart and server-validated pricing
- Stripe-hosted Checkout for one-time payments
- Signed Stripe webhook handling for reliable payment confirmation
- Local pickup or $3 local delivery
- Custom-print quote requests
- Password-protected order dashboard at `/admin`
- Order search, status workflow, revenue summary, and CSV export
- SQLite order database with a Render persistent-disk deployment blueprint

## Run locally

This project requires Node.js 22.5 or newer (Node.js 24 LTS is recommended).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and add your Stripe test key, a strong admin password, and a random session secret of at least 32 characters. A restricted `rk_test_...` key is supported if it has permission to create and read Checkout Sessions.

3. In a second terminal, forward Stripe test events to the local server:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` in `.env`.

4. Start the shop:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`. The order dashboard is at `http://localhost:3000/admin`.

Use Stripe's test card `4242 4242 4242 4242`, any future expiration date, and any three-digit security code for a full test purchase.

## Stripe production setup

1. Complete Stripe account activation and switch the Stripe dashboard to live mode.
2. Set `STRIPE_SECRET_KEY` to a live `rk_live_...` restricted key with Checkout permissions, or a live `sk_live_...` secret. Never put either value in browser code or commit it.
3. In Stripe Workbench, create a webhook destination for:

   ```text
   https://YOUR-DOMAIN.com/api/stripe/webhook
   ```

4. Subscribe to these events:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

5. Copy that live destination's signing secret to `STRIPE_WEBHOOK_SECRET`.
6. Set `APP_URL` to the exact public origin, such as `https://shop.example.com`, with no trailing slash.
7. Run one small live purchase and confirm it appears as paid at `/admin` before advertising the store.

Product amounts are intentionally defined in [`lib/catalog.js`](./lib/catalog.js), not accepted from the browser. This prevents a shopper from editing the displayed price before checkout.

## Deploy on Render

This repository includes [`render.yaml`](./render.yaml). Connect the repository as a Render Blueprint, enter the requested secret environment variables, and deploy it as one web service. The included persistent disk stores `orders.sqlite` across restarts and deployments.

After the first deployment:

1. Set `APP_URL` to the generated `https://...onrender.com` URL or your custom domain.
2. Add the production webhook in Stripe using that same domain.
3. Redeploy after changing environment variables.
4. Visit `/api/health` and confirm that `stripeConfigured` and `adminConfigured` are both `true`.

The existing GitHub Pages URL cannot run the Node.js order server. Host this project as a web service (the included Render setup does this) and point the shop's custom domain to that service. A persistent disk requires a paid Render service; without one, SQLite orders would disappear on a redeploy. For a higher-volume shop or multiple server instances, replace SQLite with managed Postgres.

## Order workflow

New paid orders move through:

`New` → `In production` → `Ready` → `Fulfilled`

Unpaid checkout sessions remain `Awaiting payment`. Custom requests enter as `Quote requested`. The dashboard can also mark an order `Canceled`.

## Files to customize

- Product names, prices, choices, and inventory: `lib/catalog.js`
- Storefront content and layout: `public/index.html`
- Storefront appearance: `public/styles.css`
- Shop email: `SHOP_EMAIL` in the deployment environment
- Delivery price: `deliveryFeeCents` in `lib/catalog.js`

## Security notes

- `.env`, the database, dependencies, and local tools are excluded from Git.
- Stripe webhook signatures are checked against the raw request body.
- Admin sessions are signed, HTTP-only, same-site cookies.
- The server applies a restrictive content security policy and validates every cart server-side.
- Use a unique admin password and rotate it if it is ever shared accidentally.
- Export or snapshot the order database regularly because it contains customer contact and delivery information.
