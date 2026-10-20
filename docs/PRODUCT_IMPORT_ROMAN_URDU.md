# Product CSV Import — Roman Urdu

`data/products.csv` file mein apne products ki details rakho. Required columns:

`sku,name,category,price`

- Har product ka SKU **unique** hona chahiye.
- Price Pakistani Rupees mein likho (e.g. `850.00`), paisa conversion automatically hota hai.
- Existing SKU import hone par name/category/price **update** hotay hain; naya SKU insert hota hai.
- Shop/Warehouse stock **change nahin hota**, iske liye ERP stock inward/transfer workflow use karo.
- `data/products.csv` mein koi customer information ya passwords nahin hone chahiye.

## Local PGlite

```powershell
npm.cmd run db:setup
npm.cmd run products:import -- data/products.csv
npm.cmd run products:import -- data/products.csv --apply
```

First command database schema banati hai (agar abhi nahin hai). Second command **preview** hai. Third command actual database mein save karti hai. Phir Admin Product Catalog refresh karo.

## Neon (cloud) par import

Live production database par test products daalne se pehle Neon **testing branch** choose karo. Neon connection string clipboard mein copy karne ke baad separate PowerShell terminal mein:

```powershell
$env:DB_DRIVER = 'postgres'
$env:DATABASE_URL = (Get-Clipboard).Trim()
$env:DATABASE_SSL = 'true'
npm.cmd run products:import -- data/products.csv
npm.cmd run products:import -- data/products.csv --apply
```

URL ya passwords chat, screenshot, GitHub ya CSV file mein share mat karo. Ye commands **usi terminal** mein chalao. CLI database access ke liye local `.env` ko edit karna zaroori nahin.

## WooCommerce automatic imports?

ERP already has an admin-only **Sync Woo products** button that imports products directly using WooCommerce REST API and stores them in the `products` table. Is CSV importer ko use karne ke liye WordPress ki zaroorat nahin.

**Important:** CSV import automatic continuously running sync nahin hai. Naye products add karne ke baad import command dobara chalani hoti hai. Vercel serverless par background process continuously chala kar sync karna reliable nahin; scheduled sync ke liye protected cron endpoint + scheduler separately setup karna hoga.
