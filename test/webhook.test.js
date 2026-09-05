import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDirectory = mkdtempSync(join(tmpdir(), "llp-webhook-test-"));
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");
process.env.STRIPE_SECRET_KEY = "test-only-placeholder";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_signature_test";

const Stripe = (await import("stripe")).default;
const database = await import("../lib/database.js");
const { app } = await import("../server.js");

const createdAt = new Date().toISOString();
database.createOrder({
  id: "LLP-TEST-WEBHOOK",
  orderType: "purchase",
  customerName: "Webhook Test",
  customerEmail: "webhook@example.com",
  customerPhone: "",
  fulfillment: "pickup",
  address: "",
  customerNotes: "",
  subtotalCents: 500,
  deliveryFeeCents: 0,
  totalCents: 500,
  currency: "usd",
  paymentStatus: "unpaid",
  status: "awaiting_payment",
  createdAt
}, [{
  productId: "scrub-daddy-holder",
  name: "Scrubber Holder",
  unitAmount: 500,
  quantity: 1,
  color: "Grey"
}]);
database.attachStripeSession("LLP-TEST-WEBHOOK", "cs_test_webhook");

const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  database.db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("a correctly signed Stripe completion webhook marks the matching order paid", async () => {
  const payload = JSON.stringify({
    id: "evt_test_webhook",
    object: "event",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_test_webhook",
        object: "checkout.session",
        metadata: { order_id: "LLP-TEST-WEBHOOK" },
        payment_status: "paid",
        payment_intent: "pi_test_webhook",
        customer_details: { phone: "555-0103" }
      }
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed"
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });

  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": signature
    },
    body: payload
  });
  assert.equal(response.status, 200);

  const order = database.getOrder("LLP-TEST-WEBHOOK");
  assert.equal(order.payment_status, "paid");
  assert.equal(order.status, "new");
  assert.equal(order.stripe_payment_intent_id, "pi_test_webhook");
});

test("an invalid Stripe webhook signature is rejected", async () => {
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": "t=123,v1=invalid"
    },
    body: "{}"
  });
  assert.equal(response.status, 400);
});
