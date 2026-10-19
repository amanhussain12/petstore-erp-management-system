<div align="center">

# 🐾 PetsDunya — Pet Store ERP

### Admin Dashboard · Shop POS · Warehouse Management · WooCommerce

**A multi-portal retail management system built with vanilla JavaScript, Node.js, Express, and PostgreSQL-compatible storage.**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Express](https://img.shields.io/badge/Express-4.x-222222?logo=express&logoColor=white)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/Database-PGlite%20%7C%20PostgreSQL-336791?logo=postgresql&logoColor=white)](https://pglite.dev/)
[![Status](https://img.shields.io/badge/Status-Development%20MVP-orange)](#project-status)

</div>

---

## Overview

**PetsDunya ERP** brings retail checkout, warehouse stock movement, employee access and WooCommerce order review into one system. Each team uses a dedicated portal; administrators can oversee activity across the business.

> **Project status:** This is a local development **MVP**, not a production-certified retail or inventory system. Test payment flows, permissions, printer output and inventory reconciliation before using it with real customers.

## Features

| Module | Capabilities |
| --- | --- |
| **Admin** | Operations overview, employees, roles, product catalog, reports and audit logs |
| **Shop POS** | Product search, customer selection, cart, cash/manual online payments and sales receipts |
| **Warehouse** | Stock inward/outward, movement history, suppliers and purchase orders |
| **Stock Transfers** | Shop requests → warehouse approval/dispatch → shop receiving |
| **WooCommerce** | API connection, product and order import, order details, printable receipts |
| **Receipts** | Browser printing with 58 mm, 80 mm and A4 layouts |
| **Authentication** | Separate portal logins, database-backed sessions, role checks and admin-managed accounts |
| **Cash Drawer** | Opening/closing sessions and cash movement tracking |

### Three dedicated portals

| Portal | Local URL | Typical user |
| --- | --- | --- |
| Admin | `http://localhost:3000/admin/login` | Owner / Super Admin |
| Shop | `http://localhost:3000/shop/login` | Shop Manager / Cashier |
| Warehouse | `http://localhost:3000/warehouse/login` | Warehouse Manager / Staff |

The super admin creates shop and warehouse users from **Admin → Employees**. Employee accounts are stored in the database, not in `.env`.

## Tech stack

- **Frontend:** HTML5, CSS3, vanilla JavaScript
- **Backend:** Node.js and Express.js
- **Local database:** PGlite (embedded PostgreSQL; no database server installation)
- **Optional external database:** PostgreSQL
- **WordPress integration:** WooCommerce REST API
- **Receipts:** HTML/CSS print templates and browser print dialog

## Local setup (Windows)

**Requirements:** Node.js 20+ and npm. No separate PostgreSQL installation is necessary for local testing.

### 1. Install packages

Open PowerShell in the project folder and run:

```powershell
npm.cmd install
```

### 2. Configure environment

```powershell
Copy-Item .env.example .env
notepad .env
```

Set the following values in `.env` (replace placeholders with your private credentials):

```dotenv
PORT=3000
NODE_ENV=development
DB_DRIVER=pglite
PGLITE_DATA_DIR=./.local-db
DATABASE_URL=
ADMIN_EMAIL=admin@petstore.local
ADMIN_PASSWORD=REPLACE_WITH_A_UNIQUE_12_PLUS_CHARACTER_PASSWORD
ADMIN_NAME=Store Owner
APP_ORIGIN=http://localhost:3000
WC_PUSH_POS=false
```

**Never commit `.env`, `.local-db`, or real API keys.** They are excluded in `.gitignore`.

### 3. Create database and administrator

```powershell
npm.cmd run db:setup
npm.cmd run seed:admin
```

For local sample products and stock **only**:

```powershell
npm.cmd run seed:demo
```

### 4. Start the server

```powershell
npm.cmd run dev
```

If your copy does not define a `dev` script, run `npm.cmd run start` instead. Visit **http://localhost:3000/admin/login** and sign in using the admin credentials from `.env`.

> **PowerShell tip:** If running `npm` gives a script execution policy error, use `npm.cmd` as shown above.

## Typical inventory workflow

```text
Warehouse receives goods
          ↓
Shop manager requests stock
          ↓
Warehouse approves and dispatches
          ↓
Goods marked in transit
          ↓
Shop confirms receipt
          ↓
Shop available stock increases
          ↓
POS sale reduces shop stock
```

Inventory is recorded separately for **Main Shop** and **Main Warehouse**. Stock movements have an audit trail; transfer operations require correct transaction handling.

## WooCommerce connection

1. In WordPress go to **WooCommerce → Settings → Advanced → REST API**.
2. Generate an appropriately permissioned API key for a trusted user.
3. Add credentials to your **private `.env` file**, never to browser code or GitHub:

```dotenv
WC_URL=https://your-store.example.com
WC_CONSUMER_KEY=YOUR_KEY
WC_CONSUMER_SECRET=YOUR_SECRET
WC_PUSH_POS=false
```

4. Restart the ERP server.
5. Use **Admin → WooCommerce** to test the connection and import products/orders.
6. Review imported orders under **Shop → WooCommerce Orders** and use **Print Receipt**.

**Important:** WooCommerce integration requires testing against a staging store. Online orders are not yet automatically reconciled against all per-location ERP inventory. POS-to-WooCommerce order posting is experimental and disabled by default.

## Receipt printing

Open **Shop → Today's Sales → Print**, or print an imported WooCommerce order. Available layouts include **58 mm thermal, 80 mm thermal and A4**.

- Choose the paper width matching your printer.
- Disable browser **Headers and footers**.
- Use the appropriate printer margin settings.
- Printing uses a browser dialog; automatic silent ESC/POS printing is not included.

## Useful commands

| Task | PowerShell command |
| --- | --- |
| Install dependencies | `npm.cmd install` |
| Prepare database | `npm.cmd run db:setup` |
| Create/update admin | `npm.cmd run seed:admin` |
| Add development demo data | `npm.cmd run seed:demo` |
| Start development server | `npm.cmd run dev` |
| Start standard server | `npm.cmd run start` |
| Run checks | `npm.cmd run check` |
| Run unit tests | `npm.cmd test` |

## Project structure

```text
petstore-erp-local-db/
├── public/           # Frontend HTML, CSS and JavaScript
├── src/              # Express app, database adapter and business logic
│   └── routes/       # Authentication, admin, shop, warehouse, WooCommerce
├── db/               # Database schema
├── scripts/          # Setup, admin seed, optional demo seed
├── tests/            # Unit tests
├── docs/             # Test notes
├── api/              # Deployment entry point
├── .env.example      # Safe configuration template
└── package.json
```

## Project status and limitations

- ✅ Local MVP workflows and demo database setup are available.
- ✅ Admin, shop and warehouse portal routes are included.
- 🧪 Employee permissions, receipt formatting and stock workflows need full end-to-end verification.
- 🔌 WooCommerce requires real staging-store credentials and integration testing.
- ⚠️ Payment verification is manual; no online payment gateway is integrated.
- ⚠️ Advanced refunds, automatic multi-location WooCommerce stock reconciliation and silent hardware printer integration are outside the current MVP.
- ⚠️ The included Vercel configuration needs deployment testing with a persistent hosted database; local PGlite is intended for local use.

See the `docs/` folder and setup guides for further testing and configuration details.

---

<div align="center">

**PetsDunya ERP** · Built for learning, testing and further development

</div>
