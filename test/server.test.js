import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDirectory = mkdtempSync(join(tmpdir(), "llp-server-test-"));
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");
process.env.ADMIN_PASSWORD = "integration-test-password";
process.env.SESSION_SECRET = "integration-test-session-secret-over-32-characters";
// Keep dotenv from loading a developer's real local key during the integration test.
process.env.STRIPE_SECRET_KEY = "";

const { app } = await import("../server.js");
const database = await import("../lib/database.js");
const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  database.db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

async function json(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

test("storefront, quote workflow, and authenticated admin workflow", async () => {
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy"), /default-src 'self'/);

  const catalog = await json("/api/catalog");
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.body.products.length, 6);

  const quote = await json("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      customerName: "Test Customer",
      customerEmail: "buyer@example.com",
      customerPhone: "555-0101",
      fulfillment: "pickup",
      address: "",
      customerNotes: "",
      details: "A replacement bracket approximately three inches wide."
    })
  });
  assert.equal(quote.response.status, 201);
  assert.match(quote.body.orderId, /^LLP-Q-/);

  const unauthorized = await json("/api/admin/orders");
  assert.equal(unauthorized.response.status, 401);

  const login = await json("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password: "integration-test-password" })
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];

  const orders = await json("/api/admin/orders", { headers: { Cookie: cookie } });
  assert.equal(orders.response.status, 200);
  assert.equal(orders.body.orders.length, 1);
  assert.equal(orders.body.orders[0].status, "quote_requested");

  const update = await json(`/api/admin/orders/${quote.body.orderId}`, {
    method: "PATCH",
    headers: { Cookie: cookie },
    body: JSON.stringify({ status: "in_production" })
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.order.status, "in_production");

  const csv = await fetch(`${baseUrl}/api/admin/orders.csv`, { headers: { Cookie: cookie } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);

  const checkout = await json("/api/checkout", {
    method: "POST",
    body: JSON.stringify({
      customerName: "Test Customer",
      customerEmail: "buyer@example.com",
      fulfillment: "pickup",
      items: [{ id: "cascade-wallet", qty: 1, color: "Blue" }]
    })
  });
  assert.equal(checkout.response.status, 503);

  const missing = await fetch(`${baseUrl}/missing-page`);
  assert.equal(missing.status, 404);
});
