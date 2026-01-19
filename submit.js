// ===== Google Form submit config =====
const FORM_ACTION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdxfeijG7iivwKDig5gRFSwTPYEq6iPqrKxcB2hY_e0JvkmbA/formResponse";

const FORM_FIELDS = {
  customerName: "entry.169222795",
  email:        "entry.1359505026",
  items:        "entry.1652388758",
  colors:       "entry.244134293",
  capacity:     "entry.1227355189",
  fulfillment:  "entry.371398646",
  total:        "entry.908379895",
  paid:         "entry.1746670045",
  status:       "entry.651837815",
  notes:        "entry.2083871717",
};

function summarizeForForm(items) {
  const itemsText = items.map(it => {
    const parts = [];
    parts.push(`${it.name} x${it.qty}`);
    if (it.color) parts.push(`Color: ${it.color}`);
    if (it.capacity) parts.push(`${getCapacityLabelFor(it.id)}: ${it.capacity}`);
    if (it.isCustom && it.customNote) parts.push(`Details: ${it.customNote}`);
    return "- " + parts.join(" | ");
  }).join("\n");

  const colorsText = items
    .filter(it => it.color)
    .map(it => `${it.name}: ${it.color}`)
    .join(" • ");

  const capacityText = items
    .filter(it => it.capacity)
    .map(it => `${it.name}: ${getCapacityLabelFor(it.id)} ${it.capacity}`)
    .join(" • ");

  return { itemsText, colorsText, capacityText };
}

async function submitOrderToGoogleForm() {
  const statusEl = document.querySelector("#submitStatus");
  const btn = document.querySelector("#submitOrderBtn");

  const items = cartItems();
  if (!items.length) {
    if (statusEl) statusEl.textContent = "Cart is empty — add a print first.";
    return;
  }

  // Build order message too (nice for your message box)
  buildOrderMessage();

  const name = document.querySelector("#customerName").value.trim();
  const addr = document.querySelector("#customerAddress").value.trim();
  const fulfill = isDelivery() ? "Delivery" : "Pickup";
  const total = fmt(calcTotal()).replace("$", "");

  const { itemsText, colorsText, capacityText } = summarizeForForm(items);

  const fd = new FormData();
  fd.append(FORM_FIELDS.customerName, name || "Unknown");
  fd.append(FORM_FIELDS.email, ""); // optional (you can add later)
  fd.append(FORM_FIELDS.items, itemsText);
  fd.append(FORM_FIELDS.colors, colorsText);
  fd.append(FORM_FIELDS.capacity, capacityText);
  fd.append(FORM_FIELDS.fulfillment, fulfill);
  fd.append(FORM_FIELDS.total, total);
  fd.append(FORM_FIELDS.paid, "No");
  fd.append(FORM_FIELDS.status, "New");
  fd.append(FORM_FIELDS.notes, addr || "");

  try {
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = "Submitting…";

    await fetch(FORM_ACTION_URL, {
      method: "POST",
      mode: "no-cors",
      body: fd
    });

    if (statusEl) statusEl.textContent = "✅ Submitted! Check your Orders sheet.";
  } catch (e) {
    if (statusEl) statusEl.textContent = "❌ Submit failed. Try again, or use Email order.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

