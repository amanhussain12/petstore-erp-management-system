# Pet Store ERP — Kaise chalana hai

Ye ZIP **source-code project** hai. Isko run karne ke liye Node.js 20+, PostgreSQL database aur internet se npm packages install hona zaroori hai. Ye ready-hosted website nahi hai.

## Windows par setup

1. ZIP extract karo; VS Code ya Cursor mein `petstore-erp` folder open karo.
2. Terminal mein `npm install` run karo.
3. `Copy-Item .env.example .env` PowerShell mein run karo.
4. PostgreSQL mein `petstore_erp` naam se database create karo.
5. `.env` mein `DATABASE_URL`, `ADMIN_EMAIL` aur `ADMIN_PASSWORD` set karo. Password 12+ characters ka hona chahiye.
6. `npm run db:setup` run karo.
7. `npm run seed:admin` run karo.
8. Testing ke liye sample products chahiye to `npm run seed:demo` run karo (sirf development!).
9. `npm run start` run karo.
10. Browser mein `http://localhost:3000/admin/login` open karo.

### Dashboards

- Admin: `http://localhost:3000/admin/login`
- Shop: `http://localhost:3000/shop/login`
- Warehouse: `http://localhost:3000/warehouse/login`

Admin → Employees se shop aur warehouse logins create karo. Shop user ko `Main Shop` aur warehouse user ko `Main Warehouse` location assign karo.

### WordPress ke orders lane ke liye

WordPress mein WooCommerce → Settings → Advanced → REST API se keys generate karo. Keys **chat ya frontend mein paste mat karna**. `.env` mein `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` set karo. Server restart karo, phir Admin → WooCommerce se `Sync products` aur `Sync orders` karo. Shop → WooCommerce Orders se order open aur slip print kar sakte ho.

### Shop + warehouse transfer test

Warehouse Inventory → Stock Inward → product ki quantity add karo. Shop → Stock Requests → request send karo. Warehouse → Stock Requests → approve + dispatch. Shop → Stock Requests → receive. Tab shop stock update hoga; POS se new sale ho sakegi.

**Note:** Database + WordPress credentials mere paas nahi hain, isliye live environment mein full integration verify nahi hui. Syntax/unit tests pass hain, lekin real use se pehle full staging testing zaroor karo. Detail `README.md` aur `docs/TEST_PLAN.md` mein hai.
