import "dotenv/config";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import express from "express";
import Stripe from "stripe";
import { SHOP, describeOptions, publicCatalog, validateCart } from "./lib/catalog.js";
import {
  attachStripeSession,
  createOrder,
  getOrder,
  getPublicOrder,
  listOrders,
  markCheckoutError,
  orderStats,
  updateFromStripeSession,
  updateOrderStatus
} from "./lib/database.js";
import {
  clearAdminCookie,
  credentialsConfigured,
  isAdmin,
  issueAdminCookie,
  passwordMatches,
  requireAdmin
} from "./lib/auth.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

// Stripe signature verification requires the untouched request body.
app.post("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe webhooks are not configured." });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`Webhook signature verification failed: ${error.message}`);
  }

  const supported = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired"
  ]);
  if (supported.has(event.type)) updateFromStripeSession(event.data.object, event.type);
  return res.json({ received: true });
});

app.use(express.json({ limit: "50kb" }));

const checkoutAttempts = new Map();
const loginAttempts = new Map();
function checkoutRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const recent = (checkoutAttempts.get(key) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 15) return res.status(429).json({ error: "Too many checkout attempts. Please try again shortly." });
  recent.push(now);
  checkoutAttempts.set(key, recent);
  next();
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (loginAttempts.get(req.ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 10) return res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
  req.loginAttempts = recent;
  next();
}

function text(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function validateCustomer(body) {
  const customerName = text(body.customerName, 100);
  const customerEmail = text(body.customerEmail, 160).toLowerCase();
  const customerPhone = text(body.customerPhone, 40);
  const fulfillment = body.fulfillment === "delivery" ? "delivery" : "pickup";
  const address = text(body.address, 300);
  const customerNotes = text(body.customerNotes, 500);

  if (customerName.length < 2) throw new Error("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Enter a valid email address.");
  if (fulfillment === "delivery" && address.length < 8) throw new Error("Enter a complete delivery address.");
  return { customerName, customerEmail, customerPhone, fulfillment, address, customerNotes };
}

function makeOrderId(prefix = "LLP") {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `${prefix}-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, stripeConfigured: Boolean(stripe), adminConfigured: credentialsConfigured() });
});

app.get("/api/catalog", (req, res) => res.json(publicCatalog()));

app.post("/api/checkout", checkoutRateLimit, async (req, res) => {
  let customer;
  let cart;
  try {
    customer = validateCustomer(req.body || {});
    cart = validateCart(req.body?.items);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!stripe) {
    return res.status(503).json({ error: "Online payment is being configured. Please check back soon." });
  }

  const deliveryFeeCents = customer.fulfillment === "delivery" ? SHOP.deliveryFeeCents : 0;
  const totalCents = cart.subtotalCents + deliveryFeeCents;
  const orderId = makeOrderId();
  const createdAt = new Date().toISOString();

  createOrder({
    id: orderId,
    orderType: "purchase",
    ...customer,
    subtotalCents: cart.subtotalCents,
    deliveryFeeCents,
    totalCents,
    currency: SHOP.currency,
    paymentStatus: "unpaid",
    status: "awaiting_payment",
    createdAt
  }, cart.items);

  const lineItems = cart.items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: SHOP.currency,
      unit_amount: item.unitAmount,
      product_data: {
        name: item.name,
        description: describeOptions(item) || undefined,
        metadata: { product_id: item.productId }
      }
    }
  }));
  if (deliveryFeeCents) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: SHOP.currency,
        unit_amount: deliveryFeeCents,
        product_data: { name: "Local delivery" }
      }
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: customer.customerEmail,
      phone_number_collection: { enabled: true },
      success_url: `${APP_URL}/?checkout=success&order=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/?checkout=canceled&order=${encodeURIComponent(orderId)}`,
      metadata: { order_id: orderId, fulfillment: customer.fulfillment },
      payment_intent_data: { metadata: { order_id: orderId } }
    }, { idempotencyKey: `checkout-${orderId}` });
    attachStripeSession(orderId, session.id);
    return res.status(201).json({ orderId, checkoutUrl: session.url });
  } catch (error) {
    console.error("Unable to create Stripe Checkout Session", error);
    markCheckoutError(orderId);
    return res.status(502).json({ error: "We could not start secure checkout. Please try again." });
  }
});

app.post("/api/quotes", checkoutRateLimit, (req, res) => {
  let customer;
  try {
    customer = validateCustomer(req.body || {});
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const details = text(req.body?.details, 1200);
  if (details.length < 12) return res.status(400).json({ error: "Tell us a little more about the print you need." });

  const orderId = makeOrderId("LLP-Q");
  const createdAt = new Date().toISOString();
  createOrder({
    id: orderId,
    orderType: "quote",
    ...customer,
    subtotalCents: 0,
    deliveryFeeCents: 0,
    totalCents: 0,
    currency: SHOP.currency,
    paymentStatus: "quote_required",
    status: "quote_requested",
    createdAt
  }, [{
    productId: "custom-print-request",
    name: "Custom print request",
    unitAmount: 0,
    quantity: 1,
    details
  }]);
  return res.status(201).json({ orderId });
});

app.get("/api/orders/:orderId", async (req, res) => {
  const sessionId = text(req.query.session_id, 255);
  let order = getPublicOrder(req.params.orderId, sessionId);
  if (!order) return res.status(404).json({ error: "Order not found." });

  if (stripe && order.paymentStatus === "unpaid" && sessionId.startsWith("cs_")) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.order_id === req.params.orderId) {
        updateFromStripeSession(session, "success_page_check");
        order = getPublicOrder(req.params.orderId, sessionId);
      }
    } catch (error) {
      console.error("Unable to refresh checkout status", error.message);
    }
  }
  return res.json({ order });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: isAdmin(req), configured: credentialsConfigured() });
});

app.post("/api/admin/login", loginRateLimit, (req, res) => {
  if (!credentialsConfigured()) return res.status(503).json({ error: "Admin access is not configured on the server." });
  if (!passwordMatches(req.body?.password)) {
    req.loginAttempts.push(Date.now());
    loginAttempts.set(req.ip, req.loginAttempts);
    return res.status(401).json({ error: "Incorrect password." });
  }
  loginAttempts.delete(req.ip);
  issueAdminCookie(res);
  res.json({ authenticated: true });
});

app.post("/api/admin/logout", (req, res) => {
  clearAdminCookie(res);
  res.json({ authenticated: false });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const allowedStatuses = new Set(["all", "awaiting_payment", "new", "quote_requested", "in_production", "ready", "fulfilled", "canceled"]);
  const requestedStatus = text(req.query.status, 40);
  const status = allowedStatuses.has(requestedStatus) ? requestedStatus : "all";
  const search = text(req.query.search, 120);
  res.json({ orders: listOrders({ status, search }), stats: orderStats() });
});

app.patch("/api/admin/orders/:orderId", requireAdmin, (req, res) => {
  const allowed = new Set(["awaiting_payment", "new", "quote_requested", "in_production", "ready", "fulfilled", "canceled"]);
  if (!allowed.has(req.body?.status)) return res.status(400).json({ error: "Choose a valid order status." });
  const order = updateOrderStatus(req.params.orderId, req.body.status);
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({ order, stats: orderStats() });
});

function csvCell(value) {
  let clean = String(value ?? "").replace(/[\r\n]+/g, " ");
  if (/^[=+\-@]/.test(clean)) clean = `'${clean}`;
  return `"${clean.replaceAll('"', '""')}"`;
}

app.get("/api/admin/orders.csv", requireAdmin, (req, res) => {
  const rows = listOrders({ limit: 5000 });
  const header = ["Order", "Created", "Type", "Customer", "Email", "Phone", "Fulfillment", "Address", "Items", "Total", "Payment", "Status", "Notes"];
  const lines = [header.map(csvCell).join(",")];
  for (const order of rows) {
    const items = order.items.map((item) => `${item.quantity}x ${item.name}${item.color ? ` (${item.color})` : ""}${item.details ? ` — ${item.details}` : ""}`).join(" | ");
    lines.push([
      order.id, order.created_at, order.order_type, order.customer_name, order.customer_email,
      order.customer_phone, order.fulfillment, order.address, items,
      (order.total_cents / 100).toFixed(2), order.payment_status, order.status, order.customer_notes
    ].map(csvCell).join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="local-layer-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${lines.join("\n")}`);
});

app.use(express.static(join(ROOT, "public"), { extensions: ["html"], maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.get("/admin", (req, res) => res.sendFile(join(ROOT, "public", "admin.html")));
app.use((req, res) => res.status(404).sendFile(join(ROOT, "public", "404.html")));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export { app };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`${SHOP.name} is running at ${APP_URL}`);
    if (!stripe) console.warn("Stripe is not configured. Add STRIPE_SECRET_KEY to enable checkout.");
    if (!credentialsConfigured()) console.warn("Admin dashboard is not configured. Set ADMIN_PASSWORD and SESSION_SECRET.");
  });
}
