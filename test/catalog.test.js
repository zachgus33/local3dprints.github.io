import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, priceFor, validateCart } from "../lib/catalog.js";

test("capacity products use the server-owned capacity price", () => {
  const product = PRODUCTS.find((entry) => entry.id === "stackable-glasses-stand");
  assert.equal(priceFor(product, 3), 1200);
  assert.equal(priceFor(product, 6), 1500);
  assert.equal(priceFor(product, 99), null);
});

test("cart validation calculates totals without accepting a browser price", () => {
  const result = validateCart([{
    id: "cascade-wallet",
    qty: 2,
    color: "Orange",
    priceCents: 1
  }]);
  assert.equal(result.subtotalCents, 2000);
  assert.equal(result.items[0].unitAmount, 1000);
});

test("cart validation rejects unavailable configurations", () => {
  assert.throws(() => validateCart([{
    id: "stackable-glasses-stand",
    qty: 1,
    color: "Invisible",
    capacity: 3
  }]), /available color/);

  assert.throws(() => validateCart([{
    id: "edc-adventure-tray",
    qty: 1,
    color: "Blue",
    color2: "Blue"
  }]), /different colors/);
});
