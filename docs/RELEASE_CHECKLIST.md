# Release checklist (PetsDunya ERP)

This project has been checked for JavaScript syntax, basic unit tests, and asset references. It has **not** been certified for production.

## Required hands-on checks before using real money or stock

- [ ] Login as admin, shop manager, cashier, warehouse manager, warehouse staff; verify cross-portal denial
- [ ] Disable an employee; verify prior sessions stop working
- [ ] Create product; stock inward 12 units; request 5; approve 5; dispatch 5; receive 5
- [ ] Reject request and ensure it cannot be dispatched
- [ ] Repeat approval/dispatch/receipt and confirm no duplicate stock updates
- [ ] Test concurrent checkout for last unit and ensure only one sale succeeds
- [ ] Test cash change, wallet/bank reference, and receipts for 58/80mm plus A4
- [ ] Test WooCommerce API keys on a staging shop, synced products, variations, order updates, and financial reconciliation
- [ ] Verify backup/restore, alerts, recovery and authorized access
- [ ] Test all routes on production Vercel domain, CSS files (200 text/css), and correct APP_ORIGIN

## Deploy

Use Neon Postgres with DB_DRIVER=postgres. Never deploy .local-db or real .env, and never run `seed:demo` on production.
The store's WooCommerce stock and ERP inventory are independent until a tested reconciliation feature is implemented.
