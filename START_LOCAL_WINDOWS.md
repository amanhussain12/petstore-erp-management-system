# Windows Quick Start — NO DATABASE INSTALLATION

This edition uses **PGlite** (embedded PostgreSQL). No PostgreSQL Server, pgAdmin, Docker or online database account is needed. The database is saved persistently in the project folder at `.local-db/`.

## Commands (Windows CMD)

1. Extract ZIP into a local folder, open CMD inside `petstore-erp-local-db`.
2. Run: `npm install` (downloads Node.js dependencies, including PGlite, once; internet needed for npm).
3. Run: `copy .env.example .env`
4. Run: `notepad .env` and set `ADMIN_EMAIL` plus a **unique** `ADMIN_PASSWORD` with 12 or more characters. Keep `DB_DRIVER=pglite`. Save.
5. Run: `npm run db:setup`
6. Run: `npm run seed:admin`
7. Optional development test data: `npm run seed:demo`
8. Run: `npm run start`
9. Open `http://localhost:3000/admin/login`.

Shop: `http://localhost:3000/shop/login`
Warehouse: `http://localhost:3000/warehouse/login`

**Existing project folder?** Extract this edition into a NEW folder, not over an existing project with real data. A PostgreSQL database cannot be automatically transferred to the new embedded file; migration/export needs separate planning.

## Important limitations

- This mode is for **one local Windows PC / one Node.js server process**. Do not run multiple instances against the same `.local-db` directory.
- `.local-db` is the database. Back it up while the app is stopped. Do not delete it.
- This is not suitable for standard serverless/Vercel deployments: filesystems may be ephemeral. For hosting, use managed PostgreSQL and `DB_DRIVER=postgres`.
- The same original ERP MVP boundaries apply: live WooCommerce + end-to-end inventory/receipt tests are still required.
- PGlite dependency is declared in `package.json`, but could not be downloaded or integration-tested in this environment due to blocked npm network access. If an installation or SQL error appears, share it and it can be fixed precisely.
- WooCommerce keys are optional until you connect a test WordPress store.

## Simple backup

Stop `npm run start`, then copy the entire `.local-db` directory to a safe location. Restore by replacing it while the app is stopped.
