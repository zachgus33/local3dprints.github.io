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
  assert.equal(catalog.body.products.length, 9);

  const productPage = await fetch(`${baseUrl}/products/pacman-clock`);
  assert.equal(productPage.status, 200);
  assert.match(await productPage.text(), /Pac-Man Clock \| Jacksonville 3D Printing/);

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /products\/tabletop-water-fountain/);

  const analyticsEvent = await json("/api/analytics/event", {
    method: "POST",
    body: JSON.stringify({ eventName: "page_view", source: "integration-test", path: "/" })
  });
  assert.equal(analyticsEvent.response.status, 204);

  const quote = await json("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      customerName: "Test Customer",
      customerEmail: "buyer@example.com",
      customerPhone: "555-0101",
      fulfillment: "pickup",
      address: "",
      customerNotes: "",
      details: "A replacement bracket approximately three inches wide.",
      approximateSize: "3 × 2 × 1 inches",
      neededBy: "2026-10-01",
      budget: "Around $20",
      uploads: [{
        name: "reference.obj",
        type: "model/obj",
        size: 18,
        data: Buffer.from("v 0 0 0\nv 1 0 0\n").toString("base64")
      }]
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
  assert.equal(orders.body.orders[0].attachments.length, 1);
  assert.match(orders.body.orders[0].items[0].details, /Budget: Around \$20/);
  assert.equal(orders.body.analytics.pageViews, 1);

  const attachment = await fetch(`${baseUrl}/api/admin/attachments/${orders.body.orders[0].attachments[0].id}`, { headers: { Cookie: cookie } });
  assert.equal(attachment.status, 200);
  assert.equal(await attachment.text(), "v 0 0 0\nv 1 0 0\n");

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
