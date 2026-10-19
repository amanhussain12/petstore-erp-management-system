BEGIN;
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('shop','warehouse')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','shop_manager','cashier','warehouse_manager','warehouse_staff')),
  location_id INTEGER REFERENCES locations(id), active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY, wc_id BIGINT UNIQUE, wc_parent_id BIGINT, wc_variation_id BIGINT,
  name TEXT NOT NULL, sku TEXT UNIQUE, category TEXT DEFAULT '',
  image_url TEXT DEFAULT '', price_paisa BIGINT NOT NULL DEFAULT 0 CHECK (price_paisa >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE TABLE IF NOT EXISTS stock_balances (
  location_id INTEGER NOT NULL REFERENCES locations(id), product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY(location_id, product_id)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY, location_id INTEGER NOT NULL REFERENCES locations(id),
  product_id BIGINT NOT NULL REFERENCES products(id), delta INTEGER NOT NULL,
  type TEXT NOT NULL, reference TEXT, note TEXT DEFAULT '',
  actor_id BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movement_recent ON inventory_movements(created_at DESC);
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY, wc_id BIGINT UNIQUE, name TEXT NOT NULL,
  phone TEXT DEFAULT '', email TEXT DEFAULT '', pet_name TEXT DEFAULT '',
  address TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY, location_id INTEGER NOT NULL REFERENCES locations(id),
  cashier_id BIGINT NOT NULL REFERENCES users(id), customer_id BIGINT REFERENCES customers(id),
  customer_name TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'pos', sale_type TEXT DEFAULT 'on_site',
  subtotal_paisa BIGINT NOT NULL, discount_paisa BIGINT NOT NULL DEFAULT 0,
  delivery_paisa BIGINT NOT NULL DEFAULT 0, total_paisa BIGINT NOT NULL,
  payment_method TEXT NOT NULL, payment_reference TEXT DEFAULT '',
  payment_verified BOOLEAN NOT NULL DEFAULT FALSE, received_paisa BIGINT NOT NULL DEFAULT 0,
  change_paisa BIGINT NOT NULL DEFAULT 0, idempotency_key TEXT NOT NULL UNIQUE,
  wc_order_id BIGINT UNIQUE, sync_state TEXT DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_location_time ON sales(location_id, created_at DESC);
CREATE TABLE IF NOT EXISTS sale_items (
  id BIGSERIAL PRIMARY KEY, sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
  sku TEXT, quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paisa BIGINT NOT NULL, total_paisa BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
 id BIGSERIAL PRIMARY KEY, location_id INTEGER NOT NULL REFERENCES locations(id),
 opened_by BIGINT NOT NULL REFERENCES users(id), opening_paisa BIGINT NOT NULL DEFAULT 0,
 opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closed_by BIGINT REFERENCES users(id),
 closed_at TIMESTAMPTZ, expected_close_paisa BIGINT, actual_close_paisa BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_drawer_per_shop ON cash_drawer_sessions(location_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS cash_movements (
 id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL REFERENCES cash_drawer_sessions(id),
 type TEXT NOT NULL CHECK(type IN ('cash_sale','cash_in','cash_out')),
 amount_paisa BIGINT NOT NULL, sale_id BIGINT UNIQUE REFERENCES sales(id),
 actor_id BIGINT NOT NULL REFERENCES users(id), note TEXT DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_requests (
  id BIGSERIAL PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES locations(id),
  warehouse_id INTEGER NOT NULL REFERENCES locations(id), product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0), approved_quantity INTEGER,
  dispatched_quantity INTEGER NOT NULL DEFAULT 0, received_quantity INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','in_transit','partially_received','received')),
  reason TEXT DEFAULT '', requested_by BIGINT NOT NULL REFERENCES users(id),
  reviewed_by BIGINT REFERENCES users(id), dispatched_by BIGINT REFERENCES users(id),
  received_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '',
  address TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY, supplier_id BIGINT REFERENCES suppliers(id),
  warehouse_id INTEGER NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','received','cancelled')),
  created_by BIGINT REFERENCES users(id), total_paisa BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(), received_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGSERIAL PRIMARY KEY, purchase_id BIGINT NOT NULL REFERENCES purchase_orders(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0), cost_paisa BIGINT NOT NULL CHECK(cost_paisa >= 0)
);
CREATE TABLE IF NOT EXISTS woo_orders (
  id BIGINT PRIMARY KEY, number TEXT NOT NULL, status TEXT NOT NULL, customer_name TEXT NOT NULL,
  phone TEXT DEFAULT '', email TEXT DEFAULT '', payment_method TEXT DEFAULT '',
  currency TEXT DEFAULT 'PKR', total_paisa BIGINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL, created_at TIMESTAMPTZ, synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, actor_id BIGINT REFERENCES users(id), action TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT DEFAULT '', details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_logs(created_at DESC);
COMMIT;
