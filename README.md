# Pet Store ERP — Admin + Shop POS + Warehouse + WooCommerce

An **installable full-stack source project** for a retail pet store. The frontend uses **HTML/CSS/Vanilla JS**; the server uses **Express on Node.js**; persistent records are stored in **PostgreSQL**. The visual theme follows the supplied navy/cream/orange POS screenshots. **There is no static demo pretending to be real data.**

## What is implemented

| Feature | Status |
| --- | --- |
| Separate admin, shop and warehouse login paths | Implemented |
| Database-backed sessions, hashed passwords, logout, role authorization | Implemented |
| Admin creates/disables employees and resets passwords | Implemented |
| Change password; optional email reset with Resend | Implemented (email service configuration required) |
| Admin / shop / warehouse dashboards | Implemented |
| Product search, local product creation, customer creation and lookup | Implemented |
| Shop POS: cart, cash/wallet/bank manual payments, discounts, delivery charge | Implemented |
| Atomic checkout, location stock decrement, retry idempotency | Implemented |
| Receipt preview and browser printing (58mm / 80mm / A4) | Implemented (printer-dependent margins) |
| WooCommerce product import, variation import, order import and order details | Implemented (live connection not tested without credentials) |
| WooCommerce order receipt printing | Implemented |
| Optional signed WooCommerce webhook receiving | Implemented (requires WP webhook configuration) |
| Optional POS sale → WooCommerce post | **Experimental/off by default**; use only after staging reconciliation |
| Shop stock requests / warehouse approve, reject, dispatch / shop receive | Implemented |
| Transactional separate shop and warehouse stock balances / audit ledger | Implemented |
| Supplier directory / purchase orders / receive purchase | Implemented (whole order receipt) |
| Admin sales reports, inventory report, audit history | Implemented (basic) |
| Cash drawer open/close, cash in/out, in-session cash sales and reconciliation | Implemented |

## Important boundaries — read before live use

This is a **functional starter/MVP codebase, not a certified production ERP**. In this environment, dependencies could not be downloaded and a PostgreSQL service / real WordPress API credentials were unavailable; therefore full runtime, browser, database and live WooCommerce integration tests **have not been performed**. Syntax and unit tests can be run with the commands below. Test against a **staging** WooCommerce shop and test database before selling inventory.

Current scope limits: initial **one shop + one warehouse** (the schema supports additional locations, but UI defaults to their initial IDs); checkout records manual wallet/bank references but **does not verify money has arrived**; no payment gateway integration; WooCommerce order import is capped to the latest 1000 orders per sync; no incremental job scheduling; WooCommerce online orders **do not automatically decrement per-location ERP stock** (fulfillment/reservations and reconciliation must be implemented before using unified live inventory); purchase receipts handle entire orders, not partial receipts; this app does not directly control ESC/POS printers or cash drawers; advanced reporting, detailed returns/refunds, offline mode, discount permission thresholds, supplier payments, and stock counts are not built. Printing uses the browser print dialog. Full production readiness requires deployment security review and end-to-end validation.

**Do not enable `WC_PUSH_POS` in a live store without reconciling local product prices, shipping, discounts, taxes and WooCommerce stock settings.** The optional endpoint explicitly refuses automatic retries after an ambiguous network result to avoid duplicate orders, but exact payment/order matching needs staging validation.

## Quick start — local computer

Prerequisites: Node.js **20+**, PostgreSQL **14+**, working npm access. Node packages are **not bundled**.

```bash
cd petstore-erp
npm install
cp .env.example .env
```

On Windows PowerShell use `Copy-Item .env.example .env` instead of `cp`.

1. Create a PostgreSQL database named `petstore_erp` (e.g. `createdb petstore_erp`).
2. Set `DATABASE_URL` to your own database credentials in `.env`.
3. Use `DATABASE_SSL=true` only if the DB provider requires it; the app verifies certificates by default. Consult your provider's TLS guidance before production.
4. Set `ADMIN_EMAIL`, `ADMIN_NAME`, and **a unique password of 12+ characters** in `.env`.
5. Run:

```bash
npm run db:setup
npm run seed:admin
npm run seed:demo   # OPTIONAL! development data only; NEVER in production
npm run start
```

Open **http://localhost:3000/admin/login**. Use the admin credentials from your private `.env`. Create separate Shop and Warehouse employees at **Admin → Employees** and assign the correct roles/locations. Visit:

- `/shop/login` → `/shop/dashboard` / `/shop/pos`
- `/warehouse/login` → `/warehouse/dashboard`
- `/admin/login` → `/admin/dashboard`

Sample products have been included **only if you explicitly run** `npm run seed:demo`. That command refuses production mode. Without it, create products in Admin → Product Catalog or sync WooCommerce products. Receive stock via Warehouse → Inventory, and request/transfer goods to Shop before counter sales.

## Connect your WooCommerce website

From WordPress Admin → **WooCommerce → Settings → Advanced → REST API**, create a REST API key for an authorized user. For read/write operations select the appropriate permission. Place these only in `.env` or your hosting provider's **secret environment variables**:

```dotenv
WC_URL=https://store.yourdomain.com
WC_CONSUMER_KEY=ck_...from_WooCommerce...
WC_CONSUMER_SECRET=cs_...from_WooCommerce...
WC_PUSH_POS=false
```

**Never paste API keys into frontend JS, WordPress public pages, GitHub or screenshots.** Restart the server. Open Admin → WooCommerce → Test API → Sync products → Sync orders, or Shop → WooCommerce Orders → Sync orders. Product import doesn't automatically create positive shop/warehouse physical stock; reconcile physical stock separately first.

### Optional near-real-time order webhook

In WooCommerce, configure a webhook for **Order created** and **Order updated**, pointing at:

`https://YOUR-POS-DOMAIN/api/hooks/woocommerce`

Set the webhook secret to the exact strong value of `WC_WEBHOOK_SECRET` in the server's private environment. The server checks the `X-WC-Webhook-Signature` HMAC before importing an order. WordPress must be able to reach the deployed HTTPS POS URL. You can also import recent orders manually using Sync Orders.

### Optional password-recovery email

Set `RESEND_API_KEY` to a real Resend API key, `MAIL_FROM` to an approved sender address, and `APP_ORIGIN` to the deployed HTTPS origin. Password reset links expire after 30 minutes. Without an email service, users can ask an admin to reset their passwords from Admin → Employees.

## Printing

From **Shop → Today's Sales** click **Print**, or from **Shop → WooCommerce Orders** click **Print**. Select **58mm Thermal**, **80mm Thermal** or **A4**; click Print receipt. This opens the operating system/browser print dialog. Configure paper width and margins in printer settings. Direct silent USB/serial ESC/POS printing requires a separate trusted local print bridge, not included here.

## Shop-to-warehouse example

1. Admin adds product (or imports WooCommerce product).
2. Warehouse manager receives `100` units into the warehouse (Warehouse → Inventory → Stock inward).
3. Shop manager requests `20` units (Shop → Stock Requests).
4. Warehouse manager approves and dispatches (Warehouse → Stock Requests). **Warehouse −20**, in-transit +20.
5. Shop manager confirms 20 received. **Shop +20**, in-transit 0.
6. Cashier sells 2 units (Shop → Counter POS). **Shop −2**.
7. All stock changes appear in Warehouse → Stock History; Admin sees audit logs.

Every stock-changing step is inside a PostgreSQL transaction with locked rows; all balance changes are recorded as signed ledger entries.

## API overview

- `/api/health`
- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/change-password`
- `/api/auth/forgot-password`, `/api/auth/reset-password`
- `/api/admin/overview`, `/api/admin/users`, `/api/admin/products`, `/api/admin/reports`
- `/api/shop/sales`, `/api/shop/stock-requests`, `/api/shop/stock-requests/:id/receive`
- `/api/warehouse/inventory`, `/api/warehouse/stock-in`, `/api/warehouse/stock-out`
- `/api/warehouse/requests`, `/api/warehouse/requests/:id/approve|reject|dispatch`
- `/api/warehouse/suppliers`, `/api/warehouse/purchases`
- `/api/woo/status`, `/api/woo/test`, `/api/woo/sync-products`, `/api/woo/sync-orders`, `/api/woo/orders`
- `/api/hooks/woocommerce` (signed webhook)

The API enforces session, role and location access; the frontend cannot be trusted to enforce permissions.

## Test / inspection

```bash
npm run check
npm test
```

`npm run check` checks JavaScript syntax using installed Node. `npm test` runs built-in Node unit tests for calculation, role restrictions, idempotency key handling, WooCommerce payload parsing and signature validation, with no DB required. **These are not a substitute for PostgreSQL + WooCommerce end-to-end tests**. See `docs/TEST_PLAN.md`.

## Deploying

**Local development is the supported starting point.** A `vercel.json` and `api/index.js` starter configuration are included for Vercel. Before production, test that your Vercel routing passes `/api/*` paths through Express and that session cookies, static assets, webhook forwarding and database connections work. Set the Vercel environment variables in its secure dashboard. Use a managed PostgreSQL provider like Neon/Supabase; run `npm run db:setup` against it from a trusted environment and run `npm run seed:admin` **once**; never run the demo seed in production. Use HTTPS, backups, monitoring, restrictive DB permissions, and a staging store for WooCommerce testing.

## Folder structure

```
public/      HTML/CSS/Vanilla JS client and thermal print stylesheet
src/         Node Express HTTP/API routes, WooCommerce client, auth, inventory
src/routes/  Admin, shop, warehouse, WooCommerce and common endpoints
db/          PostgreSQL initial schema
scripts/     Schema setup, bootstrap admin, optional demo data, code checks
tests/       Node built-in tests
api/         Optional serverless Express entry point
```

### Notes

No client data or the original reference screenshots are bundled in the ZIP. The visual styling is recreated with CSS, not copied from the existing deployed website. Store inventory, employee permissions, WooCommerce order totals and receipts should be reviewed with real data in staging before rollout.


## No-install local database alternative

This ZIP defaults to embedded PGlite instead of server PostgreSQL. See `START_LOCAL_WINDOWS.md` for commands, backups, and limitations.
#   p e t s t o r e - e r p - m a n a g e m e n t - s y s t e m  
 #   p e t s t o r e - e r p - m a n a g e m e n t - s y s t e m  
 #   p e t s t o r e - e r p - m a n a g e m e n t - s y s t e m  
 