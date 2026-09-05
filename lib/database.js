import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.DATABASE_PATH || "./data/orders.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_type TEXT NOT NULL DEFAULT 'purchase',
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    fulfillment TEXT NOT NULL,
    address TEXT,
    customer_notes TEXT,
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    payment_status TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    paid_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    unit_amount INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    color TEXT,
    color2 TEXT,
    capacity INTEGER,
    details TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quote_attachments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    product_id TEXT,
    source TEXT,
    path TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_quote_attachments_order_id ON quote_attachments(order_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
`);

const insertOrderStatement = db.prepare(`
  INSERT INTO orders (
    id, order_type, customer_name, customer_email, customer_phone,
    fulfillment, address, customer_notes, subtotal_cents, delivery_fee_cents,
    total_cents, currency, payment_status, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertItemStatement = db.prepare(`
  INSERT INTO order_items (
    order_id, product_id, name, unit_amount, quantity, color, color2, capacity, details
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function createOrder(order, items) {
  db.exec("BEGIN IMMEDIATE");
  try {
    insertOrderStatement.run(
      order.id,
      order.orderType,
      order.customerName,
      order.customerEmail,
      order.customerPhone || "",
      order.fulfillment,
      order.address || "",
      order.customerNotes || "",
      order.subtotalCents,
      order.deliveryFeeCents,
      order.totalCents,
      order.currency,
      order.paymentStatus,
      order.status,
      order.createdAt,
      order.createdAt
    );

    for (const item of items) {
      insertItemStatement.run(
        order.id,
        item.productId,
        item.name,
        item.unitAmount,
        item.quantity,
        item.color || "",
        item.color2 || "",
        item.capacity || null,
        item.details || ""
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function attachStripeSession(orderId, sessionId) {
  db.prepare("UPDATE orders SET stripe_session_id = ?, updated_at = ? WHERE id = ?")
    .run(sessionId, new Date().toISOString(), orderId);
}

export function markCheckoutError(orderId) {
  db.prepare(`
    UPDATE orders SET payment_status = 'checkout_error', status = 'canceled', updated_at = ? WHERE id = ?
  `).run(new Date().toISOString(), orderId);
}

export function updateFromStripeSession(session, eventType = "") {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  const now = new Date().toISOString();
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required" || eventType === "checkout.session.async_payment_succeeded") {
    db.prepare(`
      UPDATE orders SET
        payment_status = 'paid',
        status = CASE WHEN status = 'awaiting_payment' THEN 'new' ELSE status END,
        stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
        customer_phone = CASE WHEN customer_phone = '' THEN COALESCE(?, '') ELSE customer_phone END,
        paid_at = COALESCE(paid_at, ?),
        updated_at = ?
      WHERE id = ?
    `).run(
      typeof session.payment_intent === "string" ? session.payment_intent : null,
      session.customer_details?.phone || "",
      now,
      now,
      orderId
    );
    return;
  }

  if (eventType === "checkout.session.expired") {
    db.prepare(`
      UPDATE orders SET payment_status = 'expired', status = 'canceled', updated_at = ?
      WHERE id = ? AND payment_status != 'paid'
    `).run(now, orderId);
  } else if (eventType === "checkout.session.async_payment_failed") {
    db.prepare(`
      UPDATE orders SET payment_status = 'failed', updated_at = ?
      WHERE id = ? AND payment_status != 'paid'
    `).run(now, orderId);
  }
}

function hydrateOrder(row) {
  if (!row) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(row.id);
  const attachments = db.prepare(`
    SELECT id, original_name, mime_type, size_bytes, created_at
    FROM quote_attachments WHERE order_id = ? ORDER BY created_at, original_name
  `).all(row.id);
  return { ...row, items, attachments };
}

export function addQuoteAttachment(attachment) {
  db.prepare(`
    INSERT INTO quote_attachments (
      id, order_id, original_name, stored_name, mime_type, size_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    attachment.id,
    attachment.orderId,
    attachment.originalName,
    attachment.storedName,
    attachment.mimeType,
    attachment.sizeBytes,
    attachment.createdAt
  );
}

export function getQuoteAttachment(id) {
  return db.prepare("SELECT * FROM quote_attachments WHERE id = ?").get(id);
}

export function recordAnalyticsEvent({ eventName, productId = "", source = "direct", path = "/" }) {
  db.prepare(`
    INSERT INTO analytics_events (event_name, product_id, source, path, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventName, productId, source, path, new Date().toISOString());
}

export function analyticsStats(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT event_name, COUNT(*) AS count
    FROM analytics_events
    WHERE created_at >= ?
    GROUP BY event_name
  `).all(cutoff);
  const counts = Object.fromEntries(rows.map((row) => [row.event_name, Number(row.count)]));
  const sources = db.prepare(`
    SELECT source, COUNT(*) AS count
    FROM analytics_events
    WHERE created_at >= ? AND event_name = 'page_view'
    GROUP BY source
    ORDER BY count DESC
    LIMIT 8
  `).all(cutoff).map((row) => ({ source: row.source, count: Number(row.count) }));
  return {
    days,
    pageViews: counts.page_view || 0,
    productViews: counts.product_view || 0,
    customRequestClicks: counts.custom_request_click || 0,
    fileUploads: counts.file_upload || 0,
    addToCart: counts.add_to_cart || 0,
    checkoutStarted: counts.checkout_started || 0,
    purchaseCompleted: counts.purchase_completed || 0,
    customRequestsSubmitted: counts.custom_request_submitted || 0,
    sources
  };
}

export function getOrder(orderId) {
  return hydrateOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId));
}

export function getPublicOrder(orderId, sessionId) {
  const row = db.prepare(`
    SELECT id, order_type, stripe_session_id, fulfillment, total_cents, currency,
           payment_status, status, created_at
    FROM orders WHERE id = ? AND stripe_session_id = ?
  `).get(orderId, sessionId);
  if (!row) return null;
  return {
    id: row.id,
    orderType: row.order_type,
    fulfillment: row.fulfillment,
    totalCents: row.total_cents,
    currency: row.currency,
    paymentStatus: row.payment_status,
    status: row.status,
    createdAt: row.created_at
  };
}

export function listOrders({ status = "all", search = "", limit = 250 } = {}) {
  const terms = [];
  const values = [];
  if (status !== "all") {
    terms.push("status = ?");
    values.push(status);
  }
  if (search) {
    terms.push("(id LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)");
    const query = `%${search}%`;
    values.push(query, query, query);
  }
  const where = terms.length ? `WHERE ${terms.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...values, limit);
  return rows.map(hydrateOrder);
}

export function orderStats() {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'in_production' THEN 1 ELSE 0 END) AS production_count,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready_count,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_cents ELSE 0 END), 0) AS paid_revenue_cents
    FROM orders
  `).get();
  return {
    total: Number(counts.total || 0),
    new: Number(counts.new_count || 0),
    inProduction: Number(counts.production_count || 0),
    ready: Number(counts.ready_count || 0),
    paidRevenueCents: Number(counts.paid_revenue_cents || 0)
  };
}

export function updateOrderStatus(orderId, status) {
  const result = db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), orderId);
  return result.changes > 0 ? getOrder(orderId) : null;
}
