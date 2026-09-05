import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDirectory = mkdtempSync(join(tmpdir(), "llp-database-test-"));
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");

const database = await import("../lib/database.js");

after(() => {
  database.db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("paid Stripe sessions update an order exactly once", () => {
  const createdAt = new Date().toISOString();
  database.createOrder({
    id: "LLP-TEST-PAID",
    orderType: "purchase",
    customerName: "Test Customer",
    customerEmail: "buyer@example.com",
    customerPhone: "",
    fulfillment: "pickup",
    address: "",
    customerNotes: "",
    subtotalCents: 1000,
    deliveryFeeCents: 0,
    totalCents: 1000,
    currency: "usd",
    paymentStatus: "unpaid",
    status: "awaiting_payment",
    createdAt
  }, [{
    productId: "cascade-wallet",
    name: "Cascade Wallet",
    unitAmount: 1000,
    quantity: 1,
    color: "Blue"
  }]);
  database.attachStripeSession("LLP-TEST-PAID", "cs_test_paid");

  const session = {
    metadata: { order_id: "LLP-TEST-PAID" },
    payment_status: "paid",
    payment_intent: "pi_test_paid",
    customer_details: { phone: "555-0102" }
  };
  database.updateFromStripeSession(session, "checkout.session.completed");
  const first = database.getOrder("LLP-TEST-PAID");
  database.updateFromStripeSession(session, "checkout.session.completed");
  const second = database.getOrder("LLP-TEST-PAID");

  assert.equal(first.payment_status, "paid");
  assert.equal(first.status, "new");
  assert.equal(first.stripe_payment_intent_id, "pi_test_paid");
  assert.equal(first.customer_phone, "555-0102");
  assert.equal(second.paid_at, first.paid_at);
  assert.equal(database.orderStats().paidRevenueCents, 1000);
});
