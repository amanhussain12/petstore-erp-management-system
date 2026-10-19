# End-to-end test checklist (required before live operations)

Use a temporary DB and staging WooCommerce store.

1. `npm install`, `npm run db:setup`, `npm run seed:admin` with private credentials, `npm start`.
2. Verify `/api/health` returns `ok:true`.
3. Admin logs in at `/admin/login` and can access admin, shop and warehouse dashboards.
4. Admin creates a Shop Cashier assigned to Main Shop and Warehouse Manager assigned to Main Warehouse.
5. Cashier signs in at `/shop/login`; verify `/warehouse/dashboard` and `/api/warehouse/*` are forbidden.
6. Warehouse Manager signs in at `/warehouse/login`; verify `/api/admin/users` and `/api/shop/sales` are forbidden.
7. Admin adds a test product SKU; warehouse manager records stock inward 100.
8. Shop manager requests 20; warehouse manager approves then dispatches. Check warehouse qty falls by 20.
9. Shop manager receives 20; check shop qty rises by 20. A second receipt attempt must fail without changing stock.
10. Cashier adds product, creates cash POS sale, prints 58mm, 80mm and A4 receipts, verifies PKR total and receipt data. Check shop stock falls once.
11. Repeat same charge with same idempotency key. Only one sale and one stock decrement should occur.
12. Attempt two simultaneous checkouts consuming more than available stock. Only one may succeed.
13. Create a test WooCommerce order in the staging store; use Sync Orders. Confirm exact number, customer, items, delivery, discounts and total on receipt preview.
14. Test WooCommerce signed webhook with actual Order created/updated events. Verify forged signatures are rejected.
15. Disconnect WooCommerce briefly. Cached orders should remain accessible.
16. Test orders with variations, no email, different payment types, partial refunds and taxes.
17. Test supplier creation, purchase order, receiving (only once) and inventory ledger.
18. Test employee disable, forced session revocation, password change and optional email reset.
19. Test mobile/tablet layout, keyboard shortcuts, barcode scanner keyboard emulation and thermal printer hardware settings.
20. Test backups and database recovery; verify Vercel /api routing and webhook URL before use in production.

**Known limitations:** physical multi-location allocation for online Woo orders and POS→Woo total reconciliation must be implemented/validated before operating a single shared sellable inventory. No automatic payment gateway verification. Browser print dialogs vary by printer and driver.
